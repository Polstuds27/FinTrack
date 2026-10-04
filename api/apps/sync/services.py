"""Per-user change log: model map and event helpers.

Kept apart from `views` so other layers (default data seeding, management
commands) can append to the same log the client pulls from.
"""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from apps.finance import serializers as finance_serializers
from apps.finance.models import (
    Account,
    AccountGroup,
    Budget,
    Category,
    Debt,
    ExchangeRate,
    InstallmentPlan,
    RecurringRule,
    SavingsGoal,
    Tag,
    Transaction,
)

from .models import SyncEvent

ENTITY_MAP = {
    "account": Account,
    "account_group": AccountGroup,
    "budget": Budget,
    "category": Category,
    "debt": Debt,
    "exchange_rate": ExchangeRate,
    "installment": InstallmentPlan,
    "recurring": RecurringRule,
    "savings_goal": SavingsGoal,
    "tag": Tag,
    "transaction": Transaction,
}
# NOTE: attachments are intentionally absent. Binary uploads must go through
# POST /api/v1/attachments/upload/ (Cloudinary), which cannot be represented as a
# JSON mutation. The client caches attachments for offline viewing and only
# fetches them from the REST API when online.


def serializer_for(model):
    return getattr(finance_serializers, f"{model.__name__}Serializer")


def json_safe(value):
    """DRF leaves related pks as UUID objects; JSONField needs primitives."""
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if isinstance(value, (UUID, Decimal)):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def record_event(user, entity, obj, op):
    """Append a change so `POST /sync/pull/` can replay it to clients.

    Pull streams *history*, not table state — a row that is never recorded here
    (seeded defaults, for example) would never reach the offline client.
    """
    payload = json_safe(dict(serializer_for(ENTITY_MAP[entity])(obj).data))
    payload["version"] = obj.version
    payload["deleted_at"] = obj.deleted_at.isoformat() if obj.deleted_at else None
    return SyncEvent.objects.create(
        user=user,
        entity=entity,
        entity_id=obj.id,
        version=obj.version,
        op=op,
        payload=payload,
    )
