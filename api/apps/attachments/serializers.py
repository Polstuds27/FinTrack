from rest_framework import serializers

from .models import Attachment


class AttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Attachment
        fields = [
            "id",
            "transaction",
            "kind",
            "file_url",
            "public_id",
            "file_name",
            "content_type",
            "size",
            "note",
            "created_at",
        ]
        read_only_fields = ["id", "file_url", "public_id", "size", "content_type", "created_at"]


class AttachmentUploadSerializer(serializers.Serializer):
    """Accepts either a browser file upload or a base64 data URL."""

    data_url = serializers.CharField(required=False)
    file = serializers.FileField(required=False)
    file_name = serializers.CharField(required=False, allow_blank=True)
    transaction = serializers.UUIDField(required=False, allow_null=True)
    kind = serializers.ChoiceField(
        choices=["receipt", "document", "other"], default="receipt", required=False
    )
    note = serializers.CharField(required=False, allow_blank=True, max_length=200)

    def validate(self, attrs):
        if not attrs.get("data_url") and not attrs.get("file"):
            raise serializers.ValidationError("Provide either a file or a base64 data_url.")
        return attrs