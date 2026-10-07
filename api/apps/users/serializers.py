from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenRefreshSerializer

from .totp import provisioning_uri

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)
    # The sign-up form collects a display name and a base currency; both are
    # accepted here and split/stored on the user so the profile is complete
    # from the very first sign-in.
    full_name = serializers.CharField(write_only=True, required=False, allow_blank=True, default="")
    preferred_currency = serializers.CharField(required=False, default="USD")

    class Meta:
        model = User
        fields = ["email", "password", "password_confirm", "full_name", "preferred_currency"]

    def validate_email(self, value: str) -> str:
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value.lower()

    def validate_preferred_currency(self, value: str) -> str:
        value = (value or "USD").upper().strip()
        if len(value) != 3 or not value.isalpha():
            raise serializers.ValidationError("Use a 3 letter currency code.")
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})
        return attrs

    def create(self, validated_data):
        full_name = validated_data.pop("full_name", "") or ""
        validated_data.pop("password_confirm")
        parts = full_name.split()
        validated_data.setdefault("first_name", parts[0] if parts else "")
        validated_data.setdefault("last_name", " ".join(parts[1:]) if len(parts) > 1 else "")
        return User.objects.create_user(**validated_data)


class ProfileSerializer(serializers.ModelSerializer):
    mfa_enabled = serializers.BooleanField(read_only=True)
    recovery_codes_remaining = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["email", "first_name", "last_name", "preferred_currency", "is_verified",
                  "mfa_enabled", "recovery_codes_remaining", "date_joined"]
        read_only_fields = [
            "email", "is_verified", "mfa_enabled", "recovery_codes_remaining", "date_joined",
        ]

    def get_recovery_codes_remaining(self, user) -> int:
        from .recovery import remaining_recovery_codes

        return remaining_recovery_codes(user) if user.mfa_enabled else 0

    def validate_preferred_currency(self, value: str) -> str:
        value = value.upper().strip()
        if len(value) != 3 or not value.isalpha():
            raise serializers.ValidationError("Use a 3 letter currency code.")
        return value


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_current_password(self, value: str) -> str:
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        return user


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(min_length=8)


class MfaEnableSerializer(serializers.Serializer):
    """Starts enrollment: returns a secret the client shows as a QR/otpauth URI."""

    def save(self, **kwargs):
        from .totp import generate_secret

        user = self.context["request"].user
        secret = generate_secret()
        user.mfa_pending_secret = secret
        user.save(update_fields=["mfa_pending_secret"])
        return {
            "secret": secret,
            "otpauth_uri": provisioning_uri(secret, user.email),
        }


class MfaConfirmSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=6, min_length=6)

    def validate_code(self, value: str) -> str:
        from .totp import verify_totp

        user = self.context["request"].user
        secret = user.mfa_pending_secret or user.mfa_secret
        if not secret or not verify_totp(secret, value):
            raise serializers.ValidationError("Invalid or expired code.")
        return value

    def save(self, **kwargs):
        from .recovery import mint_recovery_codes

        user = self.context["request"].user
        user.mfa_secret = user.mfa_pending_secret
        user.mfa_pending_secret = ""
        user.mfa_enabled = True
        user.save(update_fields=["mfa_secret", "mfa_pending_secret", "mfa_enabled"])
        # First backup set is minted at enrollment so there is never an MFA
        # account without an escape hatch; shown once by the view.
        user.recovery_codes = mint_recovery_codes(user)
        return user


class MfaDisableSerializer(serializers.Serializer):
    # Either a 6-digit TOTP or an XXXXX-XXXXX recovery code (lost phone path).
    code = serializers.CharField(max_length=16)

    def validate_code(self, value: str) -> str:
        from .recovery import (
            check_email_challenge,
            find_unused_code,
            looks_like_email_code,
            looks_like_recovery_code,
        )
        from .totp import verify_totp

        user = self.context["request"].user
        if not user.mfa_enabled:
            raise serializers.ValidationError("Two-factor is not enabled.")
        value = (value or "").strip()
        if verify_totp(user.mfa_secret, value):
            return value
        if looks_like_recovery_code(value) and find_unused_code(user, value) is not None:
            return value
        # Email-OTP path (lost phone AND lost backup codes): misses count
        # against the guess budget here, consumption happens in `save()`.
        if looks_like_email_code(value) and check_email_challenge(user, value):
            return value
        raise serializers.ValidationError("Invalid or expired code.")

    def save(self, **kwargs):
        from .recovery import (
            find_unused_code,
            looks_like_email_code,
            looks_like_recovery_code,
            verify_email_challenge,
        )

        user = self.context["request"].user
        value = (self.validated_data["code"] or "").strip()
        if looks_like_recovery_code(value):
            code = find_unused_code(user, value)
            if code is None:
                raise serializers.ValidationError({"code": "That recovery code was already used."})
            code.mark_used()
        elif looks_like_email_code(value):
            if not verify_email_challenge(user, value):
                raise serializers.ValidationError(
                    {"code": "That email code is invalid or expired."}
                )
        user.mfa_enabled = False
        user.mfa_secret = ""
        user.mfa_pending_secret = ""
        user.save(update_fields=["mfa_enabled", "mfa_secret", "mfa_pending_secret"])
        return user


class MfaEmailRequestSerializer(serializers.Serializer):
    """Last-resort recovery: email a one-time sign-in code.

    Deliberately account-blind — validation never reveals whether the email
    belongs to an MFA-enabled account. The lookup, cooldown, and send all
    happen in `save()`, and the response is identical either way.
    """

    email = serializers.EmailField()

    def save(self, **kwargs):
        from .recovery import request_email_challenge

        try:
            user = User.objects.get(email__iexact=self.validated_data["email"])
        except User.DoesNotExist:
            return None
        if not user.mfa_enabled:
            return None
        code = request_email_challenge(user)
        if code is None:
            return None  # cooldown: silent, same response
        from apps.common.emails import send_mfa_code_email

        send_mfa_code_email(to=user.email, code=code)
        return code


class MfaRecoveryCodesSerializer(serializers.Serializer):
    """Mint a fresh backup set, invalidating the old one. When MFA is already
    on, a current TOTP must accompany the request — otherwise anyone holding a
    logged-in session could mint themselves a permanent backdoor."""

    code = serializers.CharField(max_length=6, min_length=6, required=False, allow_blank=True)

    def validate_code(self, value: str) -> str:
        from .totp import verify_totp

        user = self.context["request"].user
        if user.mfa_enabled and not verify_totp(user.mfa_secret, value or ""):
            raise serializers.ValidationError("Enter a valid code from your authenticator app.")
        return value or ""

    def save(self, **kwargs):
        from .recovery import CODE_COUNT, mint_recovery_codes, remaining_recovery_codes

        user = self.context["request"].user
        codes = mint_recovery_codes(user)
        return {"codes": codes, "remaining": remaining_recovery_codes(user), "total": CODE_COUNT}


class RefreshSerializer(TokenRefreshSerializer):
    """Refresh tokens can outlive their account.

    simplejwt's `validate()` does a bare `User.objects.get()`, so a token that
    still verifies but points at a missing or unparseable user id used to
    bubble up as an unhandled lookup error — a 500 where the client expects a
    401 it can sign out on.
    """

    def validate(self, attrs):
        try:
            return super().validate(attrs)
        except (User.DoesNotExist, ValueError, TypeError):
            raise AuthenticationFailed("Token no longer valid.")