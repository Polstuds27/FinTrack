"""Temporary local API server for a manual UI check. Deleted after use.

DATABASE_URL is pinned to a throwaway SQLite file *before* Django reads its
settings, so the configured database can never be touched.
"""

import os
import tempfile

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ.setdefault("SECRET_KEY", "local-ui-check")
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(
    tempfile.gettempdir(), "fintrack_ui_check.sqlite3"
)

import django  # noqa: E402

django.setup()

from django.conf import settings  # noqa: E402

settings.CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]
settings.CSRF_TRUSTED_ORIGINS = settings.CORS_ALLOWED_ORIGINS

from django.test.utils import setup_test_environment  # noqa: E402
from django.test.runner import DiscoverRunner  # noqa: E402

setup_test_environment()
DiscoverRunner(verbosity=0, interactive=False).setup_databases()

from django.core.management import call_command  # noqa: E402

print("serving api on http://localhost:8000 (sqlite only)", flush=True)
call_command("runserver", "127.0.0.1:8000", use_reloader=False)
