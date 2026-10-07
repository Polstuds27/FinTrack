from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import status, views
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.audit.services import log_audit
from apps.common.emails import send_email, send_verification_email
from apps.finance.seed import seed_defaults

from .serializers import (
    ChangePasswordSerializer,
    MfaConfirmSerializer,
    MfaDisableSerializer,
    MfaEnableSerializer,
    MfaRecoveryCodesSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileSerializer,
    RefreshSerializer,
    RegisterSerializer,
)
from .services import purge_user
from .totp import generate_secret, verify_totp

User = get_user_model()


@receiver(post_save, sender=User)
def seed_new_user(sender, instance, created, **kwargs):
    if created:
        seed_defaults(instance)


class AuthThrottleMixin:
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class LoginSerializer(TokenObtainPairSerializer):
    """Adds MFA verification and exposes the profile flags the client needs."""

    def validate(self, attrs):
        from .recovery import (
            find_unused_code,
            looks_like_email_code,
            looks_like_recovery_code,
            verify_email_challenge,
        )

        data = super().validate(attrs)
        user = self.user
        code = (self.context["request"].data.get("otp") or "").strip()
        if user.mfa_enabled:
            if not code:
                raise _mfa_required()
            if looks_like_recovery_code(code):
                # Lost-phone path: a backup code stands in for the TOTP and is
                # consumed on use — the second attempt with it fails.
                recovery = find_unused_code(user, code)
                if recovery is None:
                    from rest_framework.exceptions import ValidationError

                    raise ValidationError({"otp": "That recovery code is invalid or already used."})
                recovery.mark_used()
                log_audit(user, "mfa_recovery_used", request=self.context["request"])
            elif looks_like_email_code(code):
                # Last-resort path (no phone, no backup codes): single-shot
                # verify consumes on success and counts misses, so the guess
                # budget applies here too. Login has no later save step.
                if not verify_email_challenge(user, code):
                    from rest_framework.exceptions import ValidationError

                    raise ValidationError({"otp": "That email code is invalid or expired."})
                log_audit(user, "mfa_email_used", request=self.context["request"])
            elif not verify_totp(user.mfa_secret, code):
                from rest_framework.exceptions import ValidationError

                raise ValidationError({"otp": "Invalid or expired code."})
        data["user"] = {
            "email": user.email,
            "preferred_currency": user.preferred_currency,
            "mfa_enabled": user.mfa_enabled,
        }
        return data


def _mfa_required():
    from rest_framework.exceptions import ValidationError

    return ValidationError({"detail": "mfa_required", "otp": "Two-factor code required."})


class RegisterView(AuthThrottleMixin, views.APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        link = f"{settings.FRONTEND_URL}/verify-email?uid={uid}&token={token}"
        send_verification_email(
            to=user.email,
            name=user.get_full_name(),
            link=link,
        )
        log_audit(user, "register", request=request)
        return Response({"detail": "Verification email sent"}, status=status.HTTP_201_CREATED)


class VerifyEmailView(AuthThrottleMixin, views.APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        uid = request.data.get("uid", "")
        token = request.data.get("token", "")
        try:
            user = User.objects.get(pk=force_str(urlsafe_base64_decode(uid)))
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return Response({"detail": "Invalid link"}, status=status.HTTP_400_BAD_REQUEST)
        if not default_token_generator.check_token(user, token):
            return Response(
                {"detail": "Invalid or expired token"}, status=status.HTTP_400_BAD_REQUEST
            )
        user.is_verified = True
        user.save(update_fields=["is_verified"])
        log_audit(user, "verify_email", request=request)
        return Response({"detail": "Email verified"})


class LoginView(AuthThrottleMixin, TokenObtainPairView):
    serializer_class = LoginSerializer


class RefreshView(AuthThrottleMixin, TokenRefreshView):
    serializer_class = RefreshSerializer


class LogoutView(views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            token = RefreshToken(request.data["refresh"])
            token.blacklist()
        except (KeyError, TokenError):
            return Response({"detail": "Invalid token"}, status=status.HTTP_400_BAD_REQUEST)
        log_audit(request.user, "logout", request=request)
        return Response(status=status.HTTP_205_RESET_CONTENT)


class PasswordResetRequestView(AuthThrottleMixin, views.APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(email=serializer.validated_data["email"]).first()
        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            link = f"{settings.FRONTEND_URL}/reset-password/{token}?uid={uid}"
            send_email(
                to=user.email,
                link=link,
            )
        return Response({"detail": "If that email exists, a reset link was sent"})


class PasswordResetConfirmView(AuthThrottleMixin, views.APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = User.objects.get(
                pk=force_str(urlsafe_base64_decode(serializer.validated_data["uid"]))
            )
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return Response({"detail": "Invalid link"}, status=status.HTTP_400_BAD_REQUEST)
        if not default_token_generator.check_token(user, serializer.validated_data["token"]):
            return Response(
                {"detail": "Invalid or expired token"}, status=status.HTTP_400_BAD_REQUEST
            )
        user.set_password(serializer.validated_data["new_password"])
        user.save()
        log_audit(user, "password_reset", request=request)
        return Response({"detail": "Password updated"})


class ProfileView(views.APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(ProfileSerializer(request.user).data)

    def patch(self, request):
        serializer = ProfileSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_audit(request.user, "profile_update", request=request)
        return Response(serializer.data)

    def delete(self, request):
        log_audit(request.user, "account_delete", request=request)
        purge_user(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChangePasswordView(views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_audit(request.user, "password_change", request=request)
        return Response({"detail": "Password updated"})


class MfaEnableView(AuthThrottleMixin, views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # No client input: the serializer starts the enrollment and returns the secret.
        result = MfaEnableSerializer(context={"request": request}).save()
        log_audit(request.user, "mfa_enable_start", request=request)
        return Response(result)


class MfaConfirmView(AuthThrottleMixin, views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = MfaConfirmSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        log_audit(request.user, "mfa_enabled", request=request)
        log_audit(request.user, "mfa_recovery_generated", request=request)
        # The one and only time these codes are shown: enrollment is the
        # moment the account must gain its escape hatch.
        return Response(
            {
                "detail": "Two-factor authentication enabled",
                "recovery_codes": user.recovery_codes,
            }
        )


class MfaDisableView(AuthThrottleMixin, views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = MfaDisableSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_audit(request.user, "mfa_disabled", request=request)
        return Response({"detail": "Two-factor authentication disabled"})


class MfaRegenerateView(AuthThrottleMixin, views.APIView):
    """Rotate the secret while MFA is still pending confirmation."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from .totp import provisioning_uri

        secret = generate_secret()
        request.user.mfa_pending_secret = secret
        request.user.save(update_fields=["mfa_pending_secret"])
        return Response(
            {"secret": secret, "otpauth_uri": provisioning_uri(secret, request.user.email)}
        )


class MfaRecoveryCodesView(AuthThrottleMixin, views.APIView):
    """Mint a fresh backup set. The plaintext is returned exactly once."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = MfaRecoveryCodesSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        result = serializer.save()
        log_audit(request.user, "mfa_recovery_generated", request=request)
        return Response(result)


class MfaEmailRequestView(AuthThrottleMixin, views.APIView):
    """Email a one-time sign-in code. Deliberately account-blind: the response
    is byte-identical whether the address exists, has MFA, or never signed up
    — only the inbox learns anything."""

    permission_classes = [AllowAny]

    def post(self, request):
        from .serializers import MfaEmailRequestSerializer

        serializer = MfaEmailRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {"detail": "If that account uses two-factor, a sign-in code is on its way."}
        )


class SessionsView(views.APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

        tokens = OutstandingToken.objects.filter(user=request.user).order_by("-created_at")
        data = [
            {"id": t.id, "created_at": t.created_at, "expires_at": t.expires_at} for t in tokens
        ]
        return Response(data)

    def delete(self, request):
        from rest_framework_simplejwt.token_blacklist.models import (
            BlacklistedToken,
            OutstandingToken,
        )

        token_id = request.data.get("id")
        try:
            token = OutstandingToken.objects.get(id=token_id, user=request.user)
        except (OutstandingToken.DoesNotExist, ValueError, TypeError):
            return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        BlacklistedToken.objects.get_or_create(token=token)
        token.delete()
        log_audit(request.user, "session_revoke", entity_id=str(token_id), request=request)
        return Response(status=status.HTTP_204_NO_CONTENT)