"""Transactional email delivery.

Render's free tier blocks outbound SMTP (port 25 / unauthenticated relays), so
production delivers mail through the EmailJS REST API instead:

    https://www.emailjs.com/docs/api-reference/rest-api/

The API is plain HTTPS, so it works from any host. When no EmailJS credentials
are configured (local dev, tests) the code falls back to Django's configured
email backend, so callers never need to care which environment they run in.
"""

from __future__ import annotations

import json
import logging
import urllib.request

from django.conf import settings
from django.core.mail import send_mail

log = logging.getLogger(__name__)

EMAILJS_API_URL = "https://api.emailjs.com/api/v1.0/email/send"


def emailjs_configured() -> bool:
    """True when EmailJS credentials are present in the environment."""
    return bool(
        settings.EMAILJS_SERVICE_ID
        and settings.EMAILJS_TEMPLATEFP_ID
        and (settings.EMAILJS_PRIVATE_KEY or settings.EMAILJS_PUBLIC_KEY)
    )
    


def send_email(*, to: str, link: str = "") -> None:
    """Send a password-reset email through EmailJS.

    EmailJS template variables:
        {{email}}
        {{link}}

    Delivery problems are logged instead of raised so a mail hiccup
    never breaks the API request.
    """
    try:
        if emailjs_configured():
            _send_via_emailjs(to=to, link=link, template=settings.EMAILJS_TEMPLATEFP_ID)
        else:
            # Optional SMTP fallback
            send_mail(
                "Reset your FinTrack password",
                f"Reset your password using this link:\n\n{link}",
                settings.DEFAULT_FROM_EMAIL,
                [to],
            )
    except Exception:
        log.exception("Could not send password reset email to %s", to)


def _send_via_emailjs(*, to: str, link: str, template, name = None) -> None:
    """POST the password-reset email to the EmailJS API."""


    if name is not None:
        payload = {
            "service_id": settings.EMAILJS_SERVICE_ID,
            "template_id": template,
            "user_id": settings.EMAILJS_PUBLIC_KEY,
            "accessToken": settings.EMAILJS_PRIVATE_KEY,
            "template_params": {
                "email": to,
                "link": link,
                "name": name
            },
        }
    else:
        payload = {
            "service_id": settings.EMAILJS_SERVICE_ID,
            "template_id": template,
            "user_id": settings.EMAILJS_PUBLIC_KEY,
            "accessToken": settings.EMAILJS_PRIVATE_KEY,
            "template_params": {
                "email": to,
                "link": link,
                
            },
        }

    request = urllib.request.Request(
        "https://api.emailjs.com/api/v1.0/email/send",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "User-Agent": "FinTrack/1.0",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            print("EmailJS SUCCESS:", response.read().decode())

    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")

        print("EMAILJS HTTP ERROR")
        print("Status:", exc.code)
        print("Response:", body)

        raise

def send_verification_email(*, to: str, link: str, name: str) -> None:
    """Send a verification email through EmailJS.

    EmailJS template variables:
        {{email}}
        {{link}}

    Delivery problems are logged instead of raised so a mail hiccup
    never breaks the API request.
    """
    try:
        if emailjs_configured():
            _send_via_emailjs(to=to, link=link, template=settings.EMAILJS_TEMPLATEW_ID)
        else:
            # Optional SMTP fallback
            send_mail(
                "Verify your FinTrack account",
                f"Verify your account using this link:\n\n{link}",
                settings.DEFAULT_FROM_EMAIL,
                [to],
            )
    except Exception:
        log.exception("Could not send verification email to %s", to)