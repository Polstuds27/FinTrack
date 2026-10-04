import os

# Captured before `base.py` reads api/.env: CI passes DATABASE_URL explicitly
# (Postgres service) and must keep working, while a developer's .env - which
# usually points at a real database - must never be used by the test suite.
_REAL_ENV_HAS_DB = "DATABASE_URL" in os.environ

from .dev import *  # noqa: E402,F401,F403

if not _REAL_ENV_HAS_DB:
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}

REST_FRAMEWORK = {
    **REST_FRAMEWORK,  # type: ignore[name-defined] # noqa: F405
    "DEFAULT_THROTTLE_RATES": {
        "anon": "100000/minute",
        "user": "100000/minute",
        "auth": "100000/minute",
    },
}

# Tests must never call the real EmailJS API: force the Django email backend
# (locmem outbox) regardless of what a developer's .env contains.
EMAILJS_SERVICE_ID = ""
EMAILJS_TEMPLATE_ID = ""
EMAILJS_PRIVATE_KEY = ""
EMAILJS_PUBLIC_KEY = ""
