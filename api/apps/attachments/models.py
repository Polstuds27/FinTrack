import base64
import binascii
import uuid

from django.core.exceptions import ValidationError
from django.db import models

from apps.common.models import BaseModel

KIND_CHOICES = [("receipt", "Receipt"), ("document", "Document"), ("other", "Other")]
MAX_BYTES = 8 * 1024 * 1024


class Attachment(BaseModel):
    transaction = models.ForeignKey(
        "finance.Transaction", null=True, blank=True, on_delete=models.CASCADE,
        related_name="attachments",
    )
    kind = models.CharField(max_length=12, choices=KIND_CHOICES, default="receipt")
    file_url = models.URLField(max_length=500)
    public_id = models.CharField(max_length=200, blank=True)
    file_name = models.CharField(max_length=200, blank=True)
    content_type = models.CharField(max_length=80, blank=True)
    size = models.PositiveIntegerField(default=0)
    note = models.CharField(max_length=200, blank=True)

    def clean(self):
        if self.size and self.size > MAX_BYTES:
            raise ValidationError("File exceeds the 8 MB limit.")

    def __str__(self):
        return self.file_name or str(self.public_id or self.id)


def decode_data_url(data_url: str) -> tuple[bytes, str]:
    """`data:image/png;base64,...` -> (bytes, content_type)."""
    if "," not in data_url:
        raise ValidationError("Expected a data URL with base64 content.")
    header, payload = data_url.split(",", 1)
    if "base64" not in header:
        raise ValidationError("Only base64 data URLs are supported.")
    content_type = header.split(";")[0].removeprefix("data:") or "application/octet-stream"
    try:
        raw = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValidationError("Malformed base64 payload.") from exc
    if len(raw) > MAX_BYTES:
        raise ValidationError("File exceeds the 8 MB limit.")
    return raw, content_type


def new_public_id(user_id) -> str:
    return f"fintrack/{user_id}/{uuid.uuid4().hex}"