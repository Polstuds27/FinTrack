from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from django.views.decorators.csrf import csrf_exempt
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

@csrf_exempt
def ping(request):
    return JsonResponse({"status": "ok"})
urlpatterns = [
    path("admin/", admin.site.urls),
    path("ping/", ping, name="ping"),
    path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/v1/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    path("api/v1/auth/", include("apps.users.urls")),
    path("api/v1/finance/", include("apps.finance.urls")),
    path("api/v1/attachments/", include("apps.attachments.urls")),
    path("api/v1/notifications/", include("apps.notifications.urls")),
    path("api/v1/sync/", include("apps.sync.urls")),
    
]
