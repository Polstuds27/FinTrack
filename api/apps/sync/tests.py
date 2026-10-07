"""End-to-end sync protocol tests: push → PostgreSQL → pull.

These prove the lifecycle the UI reports on — a mutation is only `synced`
after the server commits it, retries never duplicate, and stale operations
conflict instead of silently winning. They run against the real Django stack
(same views, serializers, services, and transaction boundaries as production).
"""

import uuid

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
