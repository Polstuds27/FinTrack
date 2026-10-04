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

    class Meta:
        model = User
        fields = ["email", "first_name", "last_name", "preferred_currency", "is_verified",
                  "mfa_enabled", "date_joined"]
        read_only_fields = ["email", "is_verified", "mfa_enabled", "date_joined"]

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
        user = self.context["request"].user
        user.mfa_secret = user.mfa_pending_secret
        user.mfa_pending_secret = ""
        user.mfa_enabled = True
        user.save(update_fields=["mfa_secret", "mfa_pending_secret", "mfa_enabled"])
        return user


class MfaDisableSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=6, min_length=6)

    def validate_code(self, value: str) -> str:
        from .totp import verify_totp

        user = self.context["request"].user
        if not user.mfa_enabled or not verify_totp(user.mfa_secret, value):
            raise serializers.ValidationError("Invalid or expired code.")
        return value

    def save(self, **kwargs):
        user = self.context["request"].user
        user.mfa_enabled = False
        user.mfa_secret = ""
        user.mfa_pending_secret = ""
        user.save(update_fields=["mfa_enabled", "mfa_secret", "mfa_pending_secret"])
        return user


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