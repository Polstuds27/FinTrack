import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403

DEBUG = False

if os.environ.get("SECRET_KEY", "") in ("", "change-me", "unsafe-dev-key"):
    raise ImproperlyConfigured("SECRET_KEY must be set to a strong unique value in production")
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
