"""CSV export regression tests: the Settings export button downloads this."""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.finance.models import Account, Transaction

pytestmark = pytest.mark.django_db


def test_export_returns_csv_with_header_and_rows():
    user = get_user_model().objects.create_user(email="csv@test.com", password="Str0ng!Pass")
    client = APIClient()
    client.force_authenticate(user=user)

    account = Account.objects.create(
        user=user, name="MariBank", type="bank", currency="PHP", opening_balance="85.30"
    )
    Transaction.objects.create(
        user=user,
        type="expense",
        amount="970.50",
        currency="PHP",
        from_account=account,
        notes="Siomai",
    )

    res = client.get("/api/v1/finance/transactions/export/")
    assert res.status_code == 200
    assert "text/csv" in res["Content-Type"]
    body = res.content.decode("utf-8")
    lines = body.strip().splitlines()
    assert lines[0].split(",") == [
        "type",
        "amount",
        "currency",
        "date",
        "from_account",
        "to_account",
        "category",
        "notes",
        "is_bookmarked",
    ]
    assert len(lines) == 2
    assert "970.50" in lines[1] and "MariBank" in lines[1] and "Siomai" in lines[1]


def test_export_requires_authentication():
    res = APIClient().get("/api/v1/finance/transactions/export/")
    assert res.status_code == 401
