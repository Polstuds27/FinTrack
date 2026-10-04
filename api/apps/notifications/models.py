import uuid

from django.db import models
from django.utils import timezone

KIND_CHOICES = [
    ("budget", "Budget alert"),
    ("recurring", "Recurring generated"),
    ("goal", "Goal reached"),
    ("debt", "Debt due"),
    ("system", "System"),
]

LEVEL_CHOICES = [("info", "Info"), ("warning", "Warning"), ("critical", "Critical")]


class Notification(models.Model):
    """In-app inbox. Fetched online and cached locally for offline reading."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("users.User", on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=16, choices=KIND_CHOICES, default="system")
    title = models.CharField(max_length=120)
    body = models.TextField(blank=True)
    entity = models.CharField(max_length=64, blank=True)
    entity_id = models.CharField(max_length=64, blank=True)
    level = models.CharField(max_length=10, choices=LEVEL_CHOICES, default="info")
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "-created_at"])]

    @property
    def is_read(self) -> bool:
        return self.read_at is not None

    def __str__(self) -> str:
        return self.title


def unread_count(user) -> int:
    return Notification.objects.filter(user=user, read_at__isnull=True).count()


def mark_all_read(user) -> int:
    return Notification.objects.filter(user=user, read_at__isnull=True).update(
        read_at=timezone.now()
    )