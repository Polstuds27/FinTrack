from django.core.exceptions import FieldDoesNotExist
from django.db import models
from django.db import transaction as db_transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.finance.models import Account, Tag
from apps.finance.services import recompute_account_balance

from .models import SyncCheckpoint, SyncEvent, SyncMutation
from .serializers import PullSerializer, PushSerializer
from .services import ENTITY_MAP, record_event as _record_event

# Client-facing plural table name -> server entity name
ENTITY_ALIASES = {
    "accounts": "account",
    "account_groups": "account_group",
    "budgets": "budget",
    "categories": "category",
    "debts": "debt",
    "exchange_rates": "exchange_rate",
    "installments": "installment",
    "recurring": "recurring",
    "recurrings": "recurring",
    "savings_goals": "savings_goal",
    "tags": "tag",
    "transactions": "transaction",
}

# Server field names (as used by the finance serializers) that hold foreign keys
FK_FIELDS = {
    "group": "group_id",
    "parent": "parent_id",
    "category": "category_id",
    "from_account": "from_account_id",
    "to_account": "to_account_id",
    "linked_account": "linked_account_id",
    "recurring": "recurring_id",
    "installment": "installment_id",
    "savings_goal": "savings_goal_id",
    "debt": "debt_id",
}

ALLOWED_FIELDS = {
    "account": {
        "name", "type", "currency", "opening_balance", "credit_limit",
        "statement_day", "due_day", "archived", "group_id",
    },
    "account_group": {"name"},
    "budget": {"category_id", "amount", "period", "start_date", "alert_threshold"},
    "category": {"name", "parent_id", "type", "icon", "color", "is_custom"},
    "debt": {
        "counterparty", "direction", "original_amount", "remaining_amount",
        "currency", "due_date", "notes",
    },
    "exchange_rate": {"base_currency", "quote_currency", "rate", "date", "source"},
    "installment": {
        "total_amount", "parts_count", "currency", "from_account_id",
        "category_id", "start_date", "frequency", "notes",
    },
    "recurring": {
        "type", "amount", "currency", "from_account_id", "to_account_id",
        "category_id", "frequency", "next_run_at", "end_at", "enabled", "notes",
    },
    "savings_goal": {"name", "target_amount", "currency", "target_date", "linked_account_id"},
    "tag": {"name"},
    "transaction": {
        "type", "amount", "currency", "fx_rate", "from_account_id", "to_account_id",
        "category_id", "date", "notes", "is_bookmarked", "recurring_id", "installment_id",
        "savings_goal_id", "debt_id",
        # `tags` is the only many-to-many field in the protocol; it is applied after
        # the row is saved (see _apply_m2m) because it cannot be assigned with setattr.
        "tags",
    },
}

# Many-to-many fields, keyed by entity. Values are lists of primary keys.
M2M_FIELDS = {"transaction": {"tags": Tag}}

MAX_PULL_EVENTS = 500


def _result(mutation, status, server_version=None, error=None):
    result = {"client_mutation_id": mutation["client_mutation_id"], "status": status}
    if server_version is not None:
        result["server_version"] = server_version
    if error is not None:
        result["error"] = error
    return result


def _refresh_accounts(user, tx):
    """Recompute balances for the accounts touched by a transaction."""
    ids = {i for i in (tx.from_account_id, tx.to_account_id) if i}
    for account in Account.objects.filter(id__in=ids):
        before = account.current_balance
        after = recompute_account_balance(account)
        if before != after:
            _record_event(user, "account", account, "balance")


def _normalize_payload(payload):
    for src, dst in FK_FIELDS.items():
        if src in payload and dst not in payload:
            payload[dst] = payload.pop(src)
    return payload


def _clean_data(model, data):
    """Drop nulls for NOT NULL fields - clients may send `null` for empty values."""
    cleaned = {}
    for key, value in data.items():
        try:
            field = model._meta.get_field(key)
        except FieldDoesNotExist:
            continue
        if value is None and not field.null:
            if field.has_default():
                cleaned[key] = field.get_default()
            elif isinstance(field, models.CharField):
                cleaned[key] = ""
            continue
        cleaned[key] = value
    return cleaned


def _apply_m2m(user, entity, obj, data):
    """Assign many-to-many fields, scoping the related rows to the owner."""
    for field_name, related in M2M_FIELDS.get(entity, {}).items():
        if field_name not in data:
            continue
        ids = data.pop(field_name) or []
        if not isinstance(ids, list):
            ids = [ids]
        qs = related.objects.filter(id__in=ids, user=user)
        getattr(obj, field_name).set(qs)


def _apply(user, mutation):
    entity = ENTITY_ALIASES.get(mutation["entity"], mutation["entity"])
    model = ENTITY_MAP.get(entity)
    if model is None:
        return _result(
            mutation,
            "rejected",
            error={"code": "unknown_entity", "message": mutation["entity"]},
        )

    seen = SyncMutation.objects.filter(
        user=user, client_mutation_id=mutation["client_mutation_id"]
    ).first()
    if seen:
        # Idempotent replay: return the stored outcome without re-applying.
        return _result(mutation, seen.status, server_version=seen.server_version)

    try:
        with db_transaction.atomic():
            result = _apply_inner(user, model, entity, mutation)
    except Exception as exc:  # noqa: BLE001 - reported back to the client
        result = _result(
            mutation, "rejected", error={"code": "invalid", "message": str(exc)}
        )

    SyncMutation.objects.create(
        user=user,
        client_mutation_id=mutation["client_mutation_id"],
        entity=entity,
        entity_id=mutation["entity_id"],
        op=mutation["op"],
        status=result["status"],
        server_version=result.get("server_version"),
        error=result.get("error"),
    )
    return result


def _apply_inner(user, model, entity, mutation):
    obj = model.objects.filter(id=mutation["entity_id"], user=user).first()

    if mutation["op"] == "delete":
        return _apply_delete(user, entity, obj, mutation)

    payload = _normalize_payload(dict(mutation.get("payload") or {}))
    allowed = ALLOWED_FIELDS.get(entity, set()) & set(payload.keys())
    m2m_payload = {key: payload[key] for key in allowed if key in M2M_FIELDS.get(entity, {})}
    # Many-to-many relations are excluded from `data`: Django's model constructor
    # (and `setattr`) refuses direct assignment, they only accept `.set()`.
    data = _clean_data(
        model,
        {key: payload[key] for key in allowed if key not in M2M_FIELDS.get(entity, {})},
    )

    if obj is None:
        if mutation["op"] == "update":
            return _result(
                mutation, "conflict", error={"code": "missing", "message": "Entity not found"}
            )
        obj = model(id=mutation["entity_id"], user=user, **data)
        obj.full_clean(exclude=["user", "deleted_at"])
        if entity == "account":
            obj.current_balance = obj.opening_balance
        obj.save()
        _apply_m2m(user, entity, obj, m2m_payload)
        _record_event(user, entity, obj, "create")
        if entity == "transaction":
            _refresh_accounts(user, obj)
        return _result(mutation, "accepted", server_version=obj.version)

    if obj.deleted_at is not None:
        return _result(
            mutation, "conflict", error={"code": "deleted", "message": "Entity was deleted"}
        )

    if mutation["op"] == "update" and mutation["base_version"] != obj.version:
        return _result(
            mutation,
            "conflict",
            server_version=obj.version,
            error={
                "code": "version_mismatch",
                "message": (
                    f"server is at v{obj.version}, "
                    f"client based on v{mutation['base_version']}"
                ),
            },
        )

    for key, value in data.items():
        setattr(obj, key, value)
    if entity == "account" and "opening_balance" in data:
        recompute_account_balance(obj)
    obj.version += 1
    obj.save()
    _apply_m2m(user, entity, obj, m2m_payload)
    _record_event(user, entity, obj, "update")
    if entity == "transaction":
        _refresh_accounts(user, obj)
    return _result(mutation, "accepted", server_version=obj.version)


def _apply_delete(user, entity, obj, mutation):
    if obj is None or obj.deleted_at is not None:
        # Already gone (soft delete) - keep delete idempotent.
        version = obj.version if obj else mutation["base_version"]
        return _result(mutation, "accepted", server_version=version)

    obj.deleted_at = timezone.now()
    obj.version += 1
    obj.save(update_fields=["deleted_at", "version", "updated_at"])
    _record_event(user, entity, obj, "delete")
    if entity == "transaction":
        _refresh_accounts(user, obj)
    return _result(mutation, "accepted", server_version=obj.version)


class PushView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PushSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        results = [_apply(request.user, m) for m in serializer.validated_data["mutations"]]
        return Response({"results": results})


class PullView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PullSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        client_id = serializer.validated_data["client_id"]
        since_seq = serializer.validated_data["since_seq"]

        events = list(
            SyncEvent.objects.filter(user=request.user, id__gt=since_seq)
            .order_by("id")[:MAX_PULL_EVENTS]
        )
        changes = [
            {
                "seq": event.id,
                "entity": event.entity,
                "entity_id": str(event.entity_id),
                "version": event.version,
                "op": event.op,
                "payload": event.payload,
            }
            for event in events
        ]
        last_seq = changes[-1]["seq"] if changes else since_seq
        SyncCheckpoint.objects.update_or_create(
            user=request.user, client_id=client_id, defaults={"last_seq": last_seq}
        )
        return Response({"server_seq": last_seq, "has_more": len(events) == MAX_PULL_EVENTS,
                         "changes": changes})