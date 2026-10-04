import re
from unittest.mock import patch

import pytest
from django.core import mail
from django.core.cache import cache
from django.test import Client
from rest_framework.throttling import SimpleRateThrottle

pytestmark = pytest.mark.django_db


def register(client, email="a@b.com", password="Str0ng!Pass"):
    return client.post(
        "/api/v1/auth/register/",
        {"email": email, "password": password, "password_confirm": password},
    )


def login(client, email="a@b.com", password="Str0ng!Pass"):
    return client.post("/api/v1/auth/login/", {"email": email, "password": password})


def test_openapi_schema_endpoint():
    response = Client().get("/api/v1/schema/")
    assert response.status_code == 200


def test_register_sends_verification_email():
    mail.outbox.clear()
    res = register(Client())
    assert res.status_code == 201
    assert len(mail.outbox) == 1


def test_login_returns_tokens():
    client = Client()
    register(client)
    res = login(client)
    assert res.status_code == 200
    assert "access" in res.json() and "refresh" in res.json()


def test_refresh_rotates_and_old_is_blacklisted():
    client = Client()
    register(client)
    tokens = login(client).json()
    res = client.post("/api/v1/auth/refresh/", {"refresh": tokens["refresh"]})
    assert res.status_code == 200
    again = client.post("/api/v1/auth/refresh/", {"refresh": tokens["refresh"]})
    assert again.status_code == 401


def test_logout_blacklists_refresh():
    client = Client()
    register(client)
    tokens = login(client).json()
    res = client.post(
        "/api/v1/auth/logout/",
        {"refresh": tokens["refresh"]},
        HTTP_AUTHORIZATION=f"Bearer {tokens['access']}",
    )
    assert res.status_code == 205
    again = client.post("/api/v1/auth/refresh/", {"refresh": tokens["refresh"]})
    assert again.status_code == 401


def test_password_reset_flow_changes_password():
    mail.outbox.clear()
    client = Client()
    register(client)
    res = client.post("/api/v1/auth/password-reset/", {"email": "a@b.com"})
    assert res.status_code == 200
    assert len(mail.outbox) == 2  # verification + reset
    body = mail.outbox[-1].body
    match = re.search(r"reset-password/([^?]+)\?uid=([^&\s]+)", body)
    assert match, f"reset link missing from email: {body}"
    token, uid = match.group(1), match.group(2)
    res = client.post(
        "/api/v1/auth/password-reset/confirm/",
        {"uid": uid, "token": token, "new_password": "N3w!Passw0rd"},
    )
    assert res.status_code == 200
    assert login(client, password="N3w!Passw0rd").status_code == 200


def test_login_is_rate_limited():
    cache.clear()
    rates = {**SimpleRateThrottle.THROTTLE_RATES, "auth": "3/minute"}
    client = Client()
    register(client)
    last = None
    with patch.object(SimpleRateThrottle, "THROTTLE_RATES", rates):
        for _ in range(5):
            last = login(client, password="wrong-pass")
    assert last is not None and last.status_code == 429
