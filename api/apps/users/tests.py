import re
from unittest.mock import patch

import pytest
from django.core import mail
from django.core.cache import cache
from django.test import Client
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle

from apps.users.models import RecoveryCode

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

def authed_client(email="mfa@b.com", password="Str0ng!Pass"):
    from django.contrib.auth import get_user_model

    user = get_user_model().objects.create_user(email=email, password=password)
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


def enroll_mfa(client):
    from apps.users.totp import totp_at

    secret = client.post("/api/v1/auth/mfa/enable/").json()["secret"]
    res = client.post("/api/v1/auth/mfa/confirm/", {"code": totp_at(secret)})
    assert res.status_code == 200, res.content
    return res.json()


def test_mfa_enroll_returns_recovery_codes_once():
    client, _ = authed_client()
    body = enroll_mfa(client)
    codes = body["recovery_codes"]
    assert len(codes) == 10
    assert len(set(codes)) == 10
    for code in codes:
        assert len(code) == 11 and code[5] == "-"
        assert set(code.replace("-", "")) <= set("ABCDEFGHJKMNPQRSTUVWXYZ23456789")

    profile = client.get("/api/v1/auth/profile/").json()
    assert profile["mfa_enabled"] is True
    assert profile["recovery_codes_remaining"] == 10

    # Only hashes touch the database — the plaintext must appear nowhere.
    stored = " ".join(RecoveryCode.objects.values_list("code_hash", flat=True))
    for code in codes:
        assert code not in stored and code.replace("-", "") not in stored


def test_login_with_recovery_code_consumes_it():
    from django.contrib.auth import get_user_model

    register(Client(), email="mfa@b.com")
    user = get_user_model().objects.get(email="mfa@b.com")
    enrolled = APIClient()
    enrolled.force_authenticate(user=user)
    codes = enroll_mfa(enrolled)["recovery_codes"]

    plain = Client()
    challenged = login(plain, email="mfa@b.com")
    assert challenged.status_code == 400
    assert "mfa_required" in challenged.content.decode()

    first = codes[0]
    res = plain.post(
        "/api/v1/auth/login/", {"email": "mfa@b.com", "password": "Str0ng!Pass", "otp": first}
    )
    assert res.status_code == 200, res.content
    assert "access" in res.json()

    again = plain.post(
        "/api/v1/auth/login/", {"email": "mfa@b.com", "password": "Str0ng!Pass", "otp": first}
    )
    assert again.status_code == 400

    remaining = enrolled.get("/api/v1/auth/profile/").json()["recovery_codes_remaining"]
    assert remaining == 9


def test_regenerate_invalidates_old_set_and_needs_totp():
    from apps.users.totp import totp_at

    client, user = authed_client()
    old = enroll_mfa(client)["recovery_codes"]

    denied = client.post("/api/v1/auth/mfa/recovery-codes/", {"code": "000000"})
    assert denied.status_code == 400

    user.refresh_from_db()
    fresh = client.post(
        "/api/v1/auth/mfa/recovery-codes/",
        {"code": totp_at(user.mfa_secret)},
    )
    assert fresh.status_code == 200, fresh.content
    new = fresh.json()["codes"]
    assert len(new) == 10 and not (set(new) & set(old))

    # The old set is dead.
    plain = Client()
    bad = plain.post(
        "/api/v1/auth/login/",
        {"email": user.email, "password": "Str0ng!Pass", "otp": old[0]},
    )
    assert bad.status_code == 400
    assert RecoveryCode.objects.filter(user=user, used_at__isnull=True).count() == 10


def test_disable_with_recovery_code_after_losing_phone():
    client, user = authed_client()
    codes = enroll_mfa(client)["recovery_codes"]

    res = client.post("/api/v1/auth/mfa/disable/", {"code": codes[3]})
    assert res.status_code == 200, res.content
    user.refresh_from_db()
    assert user.mfa_enabled is False

    # Plain password login works again � no code, no challenge.
    plain = Client()
    assert login(plain, email=user.email).status_code == 200

def enroll_mfa_for(email, password="Str0ng!Pass"):
    from django.contrib.auth import get_user_model

    user = get_user_model().objects.create_user(email=email, password=password)
    enrolled = APIClient()
    enrolled.force_authenticate(user=user)
    codes = enroll_mfa(enrolled)["recovery_codes"]
    return user, enrolled, codes


def test_email_request_is_neutral_and_sends_only_for_mfa_users():
    from apps.users.models import MfaEmailChallenge

    mail.outbox.clear()
    unknown = Client().post("/api/v1/auth/mfa/email/request/", {"email": "ghost@b.com"})
    assert unknown.status_code == 200
    assert "on its way" in unknown.json()["detail"]
    assert MfaEmailChallenge.objects.count() == 0
    assert len(mail.outbox) == 0

    user, _, _ = enroll_mfa_for("mailmfa@b.com")
    known = Client().post("/api/v1/auth/mfa/email/request/", {"email": "mailmfa@b.com"})
    assert known.status_code == 200
    assert known.json() == unknown.json()  # byte-identical: no oracle
    assert MfaEmailChallenge.objects.filter(user=user).count() == 1
    assert len(mail.outbox) == 1


def test_email_code_signs_in_once_then_dies():
    import re

    user, _, _ = enroll_mfa_for("maillogin@b.com")
    mail.outbox.clear()
    Client().post("/api/v1/auth/mfa/email/request/", {"email": "maillogin@b.com"})
    match = re.search(r"\b(\d{8})\b", mail.outbox[0].body)
    assert match, "code missing from email body"
    code = match.group(1)

    plain = Client()
    res = plain.post(
        "/api/v1/auth/login/", {"email": "maillogin@b.com", "password": "Str0ng!Pass", "otp": code}
    )
    assert res.status_code == 200, res.content
    assert "access" in res.json()

    again = plain.post(
        "/api/v1/auth/login/", {"email": "maillogin@b.com", "password": "Str0ng!Pass", "otp": code}
    )
    assert again.status_code == 400


def test_email_code_wrong_guesses_lock_it_out():
    from apps.users.recovery import request_email_challenge

    user, _, _ = enroll_mfa_for("lockout@b.com")
    code = request_email_challenge(user)
    assert code is not None
    plain = Client()
    for _ in range(5):
        bad = plain.post(
            "/api/v1/auth/login/",
            {"email": "lockout@b.com", "password": "Str0ng!Pass", "otp": "00000000"},
        )
        assert bad.status_code == 400
    # The true code died with the fifth wrong guess.
    good = plain.post(
        "/api/v1/auth/login/", {"email": "lockout@b.com", "password": "Str0ng!Pass", "otp": code}
    )
    assert good.status_code == 400


def test_email_code_expiry_and_cooldown():
    from django.utils import timezone

    from apps.users.models import MfaEmailChallenge
    from apps.users.recovery import request_email_challenge

    user, _, _ = enroll_mfa_for("expiry@b.com")
    stale = request_email_challenge(user)
    assert stale is not None
    MfaEmailChallenge.objects.filter(user=user).update(
        expires_at=timezone.now() - timezone.timedelta(minutes=1)
    )
    plain = Client()
    res = plain.post(
        "/api/v1/auth/login/", {"email": "expiry@b.com", "password": "Str0ng!Pass", "otp": stale}
    )
    assert res.status_code == 400

    # Cooldown: an immediate second mint is silently skipped, same neutral path.
    from apps.users.recovery import request_email_challenge as mint

    MfaEmailChallenge.objects.filter(user=user).delete()
    assert mint(user) is not None
    assert mint(user) is None
    assert MfaEmailChallenge.objects.filter(user=user).count() == 1


def test_email_code_disables_mfa_for_recovery():
    from apps.users.recovery import request_email_challenge

    user, enrolled, _ = enroll_mfa_for("maildisable@b.com")
    code = request_email_challenge(user)
    res = enrolled.post("/api/v1/auth/mfa/disable/", {"code": code})
    assert res.status_code == 200, res.content
    user.refresh_from_db()
    assert user.mfa_enabled is False
    assert login(Client(), email="maildisable@b.com").status_code == 200
