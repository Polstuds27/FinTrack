from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/v1/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    path("api/v1/auth/", include("apps.users.urls")),
    path("api/v1/finance/", include("apps.finance.urls")),
    path("api/v1/attachments/", include("apps.attachments.urls")),
    path("api/v1/notifications/", include("apps.notifications.urls")),
    path("api/v1/sync/", include("apps.sync.urls")),
]
