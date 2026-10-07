from django.conf import settings
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email: str, password: str | None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)  # type: ignore[attr-defined]
        user.save(using=self._db)
        return user

    def create_user(self, email: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True")
        return self._create_user(email, password, **extra_fields)


class User(AbstractUser):
    username = None  # type: ignore[assignment]
    email = models.EmailField(unique=True)
    is_verified = models.BooleanField(default=False)
    preferred_currency = models.CharField(max_length=3, default="USD")
    mfa_enabled = models.BooleanField(default=False)
    mfa_secret = models.CharField(max_length=64, blank=True)
    mfa_pending_secret = models.CharField(max_length=64, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []  # type: ignore[assignment]

    objects = UserManager()  # type: ignore[assignment,misc]

    def __str__(self) -> str:
        return self.email


class RecoveryCode(models.Model):
    """Single-use MFA backup codes. Only hashes are stored — a database leak
    must not hand out second factors. One row per code so use is tracked
    individually and regenerating invalidates the whole set at once."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="mfa_recovery_codes"
    )
    code_hash = models.CharField(max_length=64, db_index=True)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "code_hash")

    @property
    def used(self) -> bool:
        return self.used_at is not None

    def mark_used(self) -> None:
        self.used_at = timezone.now()
        self.save(update_fields=["used_at"])


class MfaEmailChallenge(models.Model):
    """Single-use email OTP for MFA recovery (lost phone AND lost backup codes).

    Requested with just an email address, so the plaintext code is emailed and
    only its hash is stored — same doctrine as backup codes. Short-lived,
    attempt-capped, and one-per-user at a time (a new request kills the old).
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="mfa_email_challenges"
    )
    code_hash = models.CharField(max_length=64, db_index=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    attempts = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def used(self) -> bool:
        return self.used_at is not None

    def mark_used(self) -> None:
        self.used_at = timezone.now()
        self.save(update_fields=["used_at"])
