"""End-to-end sync protocol tests: push → PostgreSQL → pull.

These prove the lifecycle the UI reports on — a mutation is only `synced`
after the server commits it, retries never duplicate, and stale operations
conflict instead of silently winning. They run against the real Django stack
(same views, serializers, services, and transaction boundaries as production).
"""

import uuid
from zoneinfo import ZoneInfo

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.finance.models import Account, Transaction
from apps.sync.models import SyncEvent, SyncMutation

pytestmark = pytest.mark.django_db


def make_user(email="sync@test.com"):
    return get_user_model().objects.create_user(email=email, password="Str0ng!Pass")


def authed(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def push(client, mutations, client_id="web-test"):
    return client.post(
        "/api/v1/sync/push/",
        {"client_id": client_id, "mutations": mutations},
        format="json",
    )


def pull(client, since_seq=0, client_id="web-test"):
    return client.post(
        "/api/v1/sync/pull/",
        {"client_id": client_id, "since_seq": since_seq},
        format="json",
    )


def expense_mutation(entity_id, **overrides):
    mutation = {
        "client_mutation_id": str(uuid.uuid4()),
        "entity": "transactions",
        "entity_id": str(entity_id),
        "op": "create",
        "base_version": 0,
        "payload": {
            "type": "expense",
            "amount": "970.50",
            "currency": "PHP",
            "fx_rate": "1",
            "from_account_id": None,
            "to_account_id": None,
            "category_id": None,
            "date": "2026-10-06T12:00:00+08:00",
            "notes": "Bumili siomai",
            "is_bookmarked": False,
            "tags": [],
        },
        "client_timestamp": "2026-10-06T12:00:00+08:00",
    }
    mutation.update(overrides)
    return mutation


def account_mutation(entity_id, **overrides):
    mutation = {
        "client_mutation_id": str(uuid.uuid4()),
        "entity": "accounts",
        "entity_id": str(entity_id),
        "op": "create",
        "base_version": 0,
        "payload": {"name": "GoTyme", "type": "bank", "currency": "PHP", "opening_balance": "0"},
        "client_timestamp": "2026-10-06T12:00:00+08:00",
    }
    mutation.update(overrides)
    return mutation


def test_push_create_commits_and_pull_replays_it():
    """The canonical lifecycle: push accepted → row in DB → pull replays."""
    user = make_user()
    client = authed(user)
    account_id, tx_id = uuid.uuid4(), uuid.uuid4()

    res = push(client, [account_mutation(account_id)])
    assert res.status_code == 200
    assert res.json()["results"][0]["status"] == "accepted"
    assert Account.objects.filter(id=account_id, user=user).exists()

    mutation = expense_mutation(tx_id)
    mutation["payload"]["from_account_id"] = str(account_id)
    res = push(client, [mutation])
    assert res.json()["results"][0]["status"] == "accepted"

    tx = Transaction.objects.get(id=tx_id, user=user)
    assert str(tx.amount) == "970.50"
    assert tx.version == 1

    res = pull(client)
    assert res.status_code == 200
    body = res.json()
    entities = {(change["entity"], change["entity_id"]) for change in body["changes"]}
    assert ("account", str(account_id)) in entities
    assert ("transaction", str(tx_id)) in entities
    assert body["server_seq"] > 0


def test_created_at_keeps_device_birth_moment_not_receipt_time():
    """Offline Oct 6, pushed Oct 7 → Neon records Oct 6."""
    user = make_user()
    client = authed(user)
    account_id = uuid.uuid4()
    res = push(
        client,
        [account_mutation(account_id, client_timestamp="2026-10-06T08:00:00+08:00")],
    )
    assert res.json()["results"][0]["status"] == "accepted"
    account = Account.objects.get(id=account_id)
    manila = account.created_at.astimezone(ZoneInfo("Asia/Manila"))
    assert (manila.year, manila.month, manila.day) == (2026, 10, 6)
    # The birth moment is also audited on the mutation itself.
    stored = SyncMutation.objects.get(
        user=user, client_mutation_id=res.json()["results"][0]["client_mutation_id"]
    )
    assert stored.client_timestamp is not None
    assert (stored.client_timestamp.year, stored.client_timestamp.month) == (2026, 10)


def test_future_birth_moment_is_clamped_to_server_time():
    """A device clock days ahead must not stamp Neon rows in the future."""
    from django.utils import timezone

    user = make_user()
    client = authed(user)
    account_id = uuid.uuid4()
    future = (timezone.now() + timezone.timedelta(days=3)).isoformat()
    before = timezone.now()
    res = push(client, [account_mutation(account_id, client_timestamp=future)])
    assert res.json()["results"][0]["status"] == "accepted"
    account = Account.objects.get(id=account_id)
    assert before <= account.created_at <= timezone.now()


def test_decimal_float_amounts_are_accepted_exactly():
    """Regression: JSON floats must not die on `max_decimal_places`.

    The app sends money as JSON numbers, and `Decimal(85.3)` is really
    85.299999999999997… in binary — which `full_clean` rejected, parking
    every centavo amount (and the MariBank account) as failed forever.
    Integers passed, which is why only decimal rows got stuck.
    """
    user = make_user()
    client = authed(user)
    account_id, tx_id = uuid.uuid4(), uuid.uuid4()

    res = push(
        client,
        [
            {
                "client_mutation_id": str(uuid.uuid4()),
                "entity": "accounts",
                "entity_id": str(account_id),
                "op": "create",
                "base_version": 0,
                "payload": {
                    "name": "MariBank",
                    "type": "debit",
                    "currency": "PHP",
                    "opening_balance": 85.3,
                    "statement_day": 1,
                    "due_day": 20,
                    "archived": False,
                },
            }
        ],
    )
    assert res.json()["results"][0]["status"] == "accepted"

    mutation = expense_mutation(tx_id, client_timestamp="2026-10-06T04:38:09.394Z")
    mutation["payload"].update(
        {"amount": 970.5, "from_account_id": str(account_id), "notes": "Siomai"}
    )
    res = push(client, [mutation])
    assert res.json()["results"][0]["status"] == "accepted"

    account = Account.objects.get(id=account_id)
    assert str(account.opening_balance) == "85.30"
    tx = Transaction.objects.get(id=tx_id)
    assert str(tx.amount) == "970.50"


def test_genuinely_overprecise_amounts_still_rejected():
    user = make_user()
    client = authed(user)
    mutation = expense_mutation(uuid.uuid4())
    mutation["payload"]["amount"] = 85.355
    result = push(client, [mutation]).json()["results"][0]
    assert result["status"] == "rejected"
    assert result["error"]["code"] == "invalid"


def test_oct6_creation_pushed_oct7_keeps_oct6_and_pulls_it_back():
    """Scenarios A–C: offline birth Oct 6 23:30 PHT, delivered Oct 7, pulled back identical."""
    user = make_user()
    client = authed(user)
    account_id, tx_id = uuid.uuid4(), uuid.uuid4()
    push(client, [account_mutation(account_id, client_timestamp="2026-10-06T20:00:00+08:00")])

    birth = "2026-10-06T23:30:00+08:00"
    mutation = expense_mutation(tx_id, client_timestamp=birth)
    mutation["payload"]["from_account_id"] = str(account_id)
    result = push(client, [mutation]).json()["results"][0]
    assert result["status"] == "accepted"

    tx = Transaction.objects.get(id=tx_id, user=user)
    manila_birth = tx.created_at.astimezone(ZoneInfo("Asia/Manila"))
    assert (manila_birth.year, manila_birth.month, manila_birth.day) == (2026, 10, 6)
    assert (manila_birth.hour, manila_birth.minute) == (23, 30)

    body = pull(client).json()
    echoed = next(
        change
        for change in body["changes"]
        if change["entity"] == "transaction" and change["entity_id"] == str(tx_id)
    )
    from datetime import datetime

    echoed_at = datetime.fromisoformat(echoed["payload"]["created_at"]).astimezone(
        ZoneInfo("Asia/Manila")
    )
    assert (echoed_at.year, echoed_at.month, echoed_at.day) == (2026, 10, 6)
    assert (echoed_at.hour, echoed_at.minute) == (23, 30)


def test_retry_after_lost_response_keeps_timestamps_and_single_row():
    """Scenario D: server commits, response lost, retry changes nothing."""
    user = make_user()
    client = authed(user)
    account_id = uuid.uuid4()
    mutation = account_mutation(account_id, client_timestamp="2026-10-06T23:30:00+08:00")

    first = push(client, [mutation]).json()["results"][0]
    second = push(client, [mutation]).json()["results"][0]
    assert first["status"] == second["status"] == "accepted"
    rows = Account.objects.filter(id=account_id, user=user)
    assert rows.count() == 1
    manila_birth = rows.get().created_at.astimezone(ZoneInfo("Asia/Manila"))
    assert (manila_birth.month, manila_birth.day) == (10, 6)


def test_update_moves_updated_at_but_pins_created_at():
    """Scenarios E–F: Oct 6 birth, Oct 7 edit → created Oct 6, updated Oct 7.
    A payload smuggling `created_at` is ignored, never applied."""
    user = make_user()
    client = authed(user)
    account_id = uuid.uuid4()
    push(client, [account_mutation(account_id, client_timestamp="2026-10-06T23:30:00+08:00")])

    smuggled = {
        "client_mutation_id": str(uuid.uuid4()),
        "entity": "accounts",
        "entity_id": str(account_id),
        "op": "update",
        "base_version": 1,
        "payload": {"name": "Renamed", "created_at": "2020-01-01T00:00:00+08:00"},
    }
    result = push(client, [smuggled]).json()["results"][0]
    assert result["status"] == "accepted"
    account = Account.objects.get(id=account_id)
    assert account.name == "Renamed"
    manila_birth = account.created_at.astimezone(ZoneInfo("Asia/Manila"))
    assert (manila_birth.year, manila_birth.month, manila_birth.day) == (2026, 10, 6)
    assert account.updated_at >= account.created_at


def test_push_is_idempotent_on_retry():
    """A retry after a lost response replays the stored outcome — one row."""
    user = make_user()
    client = authed(user)
    account_id = uuid.uuid4()
    mutation = account_mutation(account_id)

    first = push(client, [mutation]).json()["results"][0]
    second = push(client, [mutation]).json()["results"][0]
    assert first["status"] == "accepted"
    assert second["status"] == "accepted"
    assert Account.objects.filter(id=account_id, user=user).count() == 1
    assert (
        SyncMutation.objects.filter(
            user=user, client_mutation_id=mutation["client_mutation_id"]
        ).count()
        == 1
    )


def test_stale_update_conflicts_and_keeps_server_value():
    user = make_user()
    client = authed(user)
    account_id = uuid.uuid4()
    push(client, [account_mutation(account_id)])

    # Another session moves the row to v2.
    other = authed(user)
    res = push(
        other,
        [
            {
                "client_mutation_id": str(uuid.uuid4()),
                "entity": "accounts",
                "entity_id": str(account_id),
                "op": "update",
                "base_version": 1,
                "payload": {"name": "GoTyme Updated"},
            }
        ],
    )
    assert res.json()["results"][0]["status"] == "accepted"

    # The stale offline edit (based on v1) must not overwrite v2.
    stale = push(
        client,
        [
            {
                "client_mutation_id": str(uuid.uuid4()),
                "entity": "accounts",
                "entity_id": str(account_id),
                "op": "update",
                "base_version": 1,
                "payload": {"name": "Stale Name"},
            }
        ],
    )
    result = stale.json()["results"][0]
    assert result["status"] == "conflict"
    assert result["server_version"] == 2
    assert Account.objects.get(id=account_id).name == "GoTyme Updated"


def test_stale_delete_conflicts_instead_of_winning():
    user = make_user()
    client = authed(user)
    account_id = uuid.uuid4()
    push(client, [account_mutation(account_id)])
    Account.objects.filter(id=account_id).update(version=2)

    res = push(
        client,
        [
            {
                "client_mutation_id": str(uuid.uuid4()),
                "entity": "accounts",
                "entity_id": str(account_id),
                "op": "delete",
                "base_version": 1,
            }
        ],
    )
    result = res.json()["results"][0]
    assert result["status"] == "conflict"
    account = Account.objects.get(id=account_id)
    assert account.deleted_at is None


def test_delete_is_idempotent():
    user = make_user()
    client = authed(user)
    account_id = uuid.uuid4()
    push(client, [account_mutation(account_id)])

    delete = {
        "client_mutation_id": str(uuid.uuid4()),
        "entity": "accounts",
        "entity_id": str(account_id),
        "op": "delete",
        "base_version": 1,
    }
    assert push(client, [delete]).json()["results"][0]["status"] == "accepted"
    # Replaying the tombstone (or a second client deleting) stays accepted.
    delete["client_mutation_id"] = str(uuid.uuid4())
    assert push(client, [delete]).json()["results"][0]["status"] == "accepted"
    assert Account.objects.get(id=account_id).deleted_at is not None


def test_validation_error_rejects_without_persisting():
    user = make_user()
    client = authed(user)
    tx_id = uuid.uuid4()
    mutation = expense_mutation(tx_id)
    mutation["payload"]["amount"] = "not-a-number"

    result = push(client, [mutation]).json()["results"][0]
    assert result["status"] == "rejected"
    assert result["error"]["code"] == "invalid"
    assert not Transaction.objects.filter(id=tx_id).exists()


def test_users_cannot_see_each_others_data():
    alice, bob = make_user("alice@test.com"), make_user("bob@test.com")
    account_id = uuid.uuid4()
    push(authed(alice), [account_mutation(account_id)])

    body = pull(authed(bob)).json()
    # Bob's own seeded defaults are his and his alone; Alice's row is absent.
    entity_ids = {change["entity_id"] for change in body["changes"]}
    assert str(account_id) not in entity_ids
    assert not Account.objects.filter(id=account_id, user=bob).exists()
    # …and Bob pushing an update against Alice's row conflicts as missing.
    result = push(
        authed(bob),
        [
            {
                "client_mutation_id": str(uuid.uuid4()),
                "entity": "accounts",
                "entity_id": str(account_id),
                "op": "update",
                "base_version": 1,
                "payload": {"name": "Hijacked"},
            }
        ],
    ).json()["results"][0]
    assert result["status"] == "conflict"
    assert Account.objects.get(id=account_id).name == "GoTyme"


def test_pull_paginates_with_checkpoints():
    user = make_user()
    client = authed(user)
    pushed = [uuid.uuid4() for _ in range(3)]
    for i, entity_id in enumerate(pushed):
        push(
            client,
            [
                account_mutation(
                    entity_id,
                    payload={
                        "name": f"Acct {i}",
                        "type": "cash",
                        "currency": "PHP",
                        "opening_balance": "0",
                    },
                )
            ],
        )
    first = pull(client).json()
    # Registration seeds default categories first — the 3 pushed accounts must
    # be present among them, and a second pull from the cursor is empty.
    pulled_ids = {
        change["entity_id"]
        for change in first["changes"]
        if change["entity"] == "account" and change["op"] == "create"
    }
    assert {str(entity_id) for entity_id in pushed} <= pulled_ids
    second = pull(client, since_seq=first["server_seq"]).json()
    assert second["changes"] == []
    assert SyncEvent.objects.filter(user=user).count() >= 3
