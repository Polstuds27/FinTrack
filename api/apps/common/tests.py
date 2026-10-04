import json
from unittest.mock import patch

import pytest
from django.core import mail
from django.test import Client, override_settings

pytestmark = pytest.mark.django_db

EMAILJS = {
    "EMAILJS_SERVICE_ID": "svc",
    "EMAILJS_TEMPLATE_ID": "tpl",
    "EMAILJS_PUBLIC_KEY": "pub",
    "EMAILJS_PRIVATE_KEY": "priv",
    "EMAILJS_FROM_NAME": "FinTrack",
}


def register(client):
    return client.post(
        "/api/v1/auth/register/",
        {"email": "a@b.com", "password": "Str0ng!Pass", "password_confirm": "Str0ng!Pass"},
    )


def test_register_falls_back_to_django_backend():
    mail.outbox.clear()
    assert register(Client()).status_code == 201
    assert len(mail.outbox) == 1


def test_register_sends_through_emailjs_when_configured():
    mail.outbox.clear()
    with override_settings(**EMAILJS), patch(
        "apps.common.emails.urllib.request.urlopen"
    ) as urlopen:
        assert register(Client()).status_code == 201

    request = urlopen.call_args.args[0]
    payload = json.loads(request.data)
    assert payload["service_id"] == "svc"
    assert payload["template_id"] == "tpl"
    assert payload["accessToken"] == "priv"  # private key preferred over public
    params = payload["template_params"]
    assert params["to_email"] == "a@b.com"
    assert params["subject"] == "Verify your email"
    assert "verify-email" in params["link"]
    assert not mail.outbox  # Django backend not used when EmailJS is on
