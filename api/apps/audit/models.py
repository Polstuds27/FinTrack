from django.db import models


class AuditLog(models.Model):
    user = models.ForeignKey(
        "users.User", on_delete=models.SET_NULL, null=True, related_name="audit_logs"
    )
    action = models.CharField(max_length=64)
    entity = models.CharField(max_length=64, blank=True)
    entity_id = models.CharField(max_length=64, blank=True)
    diff = models.JSONField(null=True, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]

    def __str__(self) -> str:
        return f"{self.action} @ {self.timestamp:%Y-%m-%d %H:%M}"
