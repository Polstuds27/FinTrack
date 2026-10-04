import uuid

from django.conf import settings
from django.db import models


class SyncMutation(models.Model):
    STATUS = [("accepted", "Accepted"), ("conflict", "Conflict"), ("rejected", "Rejected")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    client_mutation_id = models.CharField(max_length=64)
    entity = models.CharField(max_length=64)
    entity_id = models.UUIDField()
    op = models.CharField(max_length=10)
    status = models.CharField(max_length=10, choices=STATUS)
    server_version = models.PositiveIntegerField(null=True, blank=True)
    error = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "client_mutation_id")


class SyncEvent(models.Model):
    """Append-only per-user change log used for pull/checkpoint sync."""

    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, db_index=True)
    entity = models.CharField(max_length=64)
    entity_id = models.UUIDField()
    version = models.PositiveIntegerField()
    op = models.CharField(max_length=10)
    payload = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class SyncCheckpoint(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    client_id = models.CharField(max_length=64)
    last_seq = models.BigIntegerField(default=0)

    class Meta:
        unique_together = ("user", "client_id")
