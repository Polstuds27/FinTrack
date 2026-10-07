from django.urls import path

from . import views

urlpatterns = [
    path("register/", views.RegisterView.as_view()),
    path("verify-email/", views.VerifyEmailView.as_view()),
    path("login/", views.LoginView.as_view()),
    path("refresh/", views.RefreshView.as_view()),
    path("logout/", views.LogoutView.as_view()),
    path("password-reset/", views.PasswordResetRequestView.as_view()),
    path("password-reset/confirm/", views.PasswordResetConfirmView.as_view()),
    path("sessions/", views.SessionsView.as_view()),
    path("profile/", views.ProfileView.as_view()),
    path("change-password/", views.ChangePasswordView.as_view()),
    path("mfa/enable/", views.MfaEnableView.as_view()),
    path("mfa/confirm/", views.MfaConfirmView.as_view()),
    path("mfa/disable/", views.MfaDisableView.as_view()),
    path("mfa/regenerate/", views.MfaRegenerateView.as_view()),
    path("mfa/recovery-codes/", views.MfaRecoveryCodesView.as_view()),
    path("mfa/email/request/", views.MfaEmailRequestView.as_view()),
]
