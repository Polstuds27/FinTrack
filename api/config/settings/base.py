from pathlib import Path

import dj_database_url
import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY", default="unsafe-dev-key")
DEBUG = env.bool("DEBUG", default=False)
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "drf_spectacular",
    "django_q",
    "apps.common",
    "apps.users",
    "apps.finance",
    "apps.sync",
    "apps.attachments",
    "apps.notifications",
    "apps.audit",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": dj_database_url.config(
        default=env("DATABASE_URL", default="postgres://fintrack:fintrack@localhost:5432/fintrack"),
        conn_max_age=600,
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "users.User"

EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", default="localhost")
EMAIL_PORT = env.int("EMAIL_PORT", default=25)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=False)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="noreply@example.com")

# EmailJS (https://www.emailjs.com/) sends transactional mail over HTTPS and is
# the production delivery path, because hosts like Render block outbound SMTP.
# Create an email service + template there, then fill in the IDs below; the
# template's "To Email" field should be {{to_email}} and its body should use
# {{message}} (plus {{link}} for the action URL).
# When unset, mail falls back to the Django EMAIL_* backend above.
EMAILJS_SERVICE_ID = env("EMAILJS_SERVICE_ID", default="")
EMAILJS_TEMPLATEFP_ID = env("EMAILJS_TEMPLATEFP_ID", default="")
EMAILJS_TEMPLATEW_ID = env("EMAILJS_TEMPLATEW_ID", default="")
# Private access token (Account > API Keys) is preferred for server-side calls;
# the public key also works if that is all you have.
EMAILJS_PRIVATE_KEY = env("EMAILJS_PRIVATE_KEY", default="")
EMAILJS_PUBLIC_KEY = env("EMAILJS_PUBLIC_KEY", default="")
EMAILJS_FROM_NAME = env("EMAILJS_FROM_NAME", default="FinTrack")

# Base URL of the deployed frontend. Verification and password-reset emails link
# straight into the matching route (`/verify-email`, `/reset-password/:token`).
FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:5173").rstrip("/")

CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:5173"])

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {"anon": "60/minute", "user": "600/minute", "auth": "10/minute"},
}

SIMPLE_JWT = {
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}

SPECTACULAR_SETTINGS = {"TITLE": "Personal Money Manager API", "VERSION": "1.0.0"}

Q_CLUSTER = {
    "name": "fintrack",
    "orm": "default",
    "workers": 2,
    "recycle": 500,
    "timeout": 60,
    "retry": 120,
    "schedule": {
        "generate-recurring": {
            "func": "apps.tasks.generate_recurring_transactions",
            "schedule": 3600,
        },
        "evaluate-alerts": {
            "func": "apps.tasks.evaluate_alerts",
            "schedule": 86400,
        },
        "nightly-maintenance": {
            "func": "apps.tasks.nightly_maintenance",
            "schedule": 86400,
        },
    },
}

# Object storage for attachments (optional - see .env.example)
CLOUDINARY_URL = env("CLOUDINARY_URL", default="")
CLOUDINARY_CLOUD_NAME = env("CLOUDINARY_CLOUD_NAME", default="")
CLOUDINARY_API_KEY = env("CLOUDINARY_API_KEY", default="")
CLOUDINARY_API_SECRET = env("CLOUDINARY_API_SECRET", default="")

if CLOUDINARY_URL:
    parts = CLOUDINARY_URL.split("://", 1)[-1]
    if not CLOUDINARY_CLOUD_NAME and "@" in parts:
        CLOUDINARY_CLOUD_NAME = parts.rsplit("@", 1)[-1]

ATTACHMENT_MAX_BYTES = env.int("ATTACHMENT_MAX_BYTES", default=8 * 1024 * 1024)
