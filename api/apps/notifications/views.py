from django.utils import timezone
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Notification, mark_all_read, unread_count
from .services import check_budgets, check_debt_due, check_goals


class NotificationSerializer(serializers.ModelSerializer):
    is_read = serializers.BooleanField(read_only=True)

    class Meta:
        model = Notification
        fields = ["id", "kind", "title", "body", "entity", "entity_id", "level",
                  "read_at", "is_read", "created_at"]
        read_only_fields = fields


class NotificationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Notification.objects.filter(user=self.request.user)
        if self.request.query_params.get("unread") == "true":
            qs = qs.filter(read_at__isnull=True)
        return qs

    @action(detail=False, methods=["get"])
    def summary(self, request):
        return Response({"unread": unread_count(request.user)})

    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        return Response({"updated": mark_all_read(request.user)})

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        notification = self.get_object()
        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=["read_at"])
        return Response(self.get_serializer(notification).data)

    @action(detail=False, methods=["post"])
    def checks(self, request):
        """Run the alert checks on demand (the scheduler normally calls them)."""
        return Response(
            {
                "budgets": check_budgets(),
                "debts": check_debt_due(),
                "goals": check_goals(),
            }
        )