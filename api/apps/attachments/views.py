import logging

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.finance.models import Transaction

from .models import Attachment, decode_data_url, new_public_id
from .serializers import AttachmentSerializer, AttachmentUploadSerializer
from .services import destroy, is_configured, upload_bytes

logger = logging.getLogger(__name__)


class AttachmentViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = AttachmentSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        return Attachment.objects.filter(user=self.request.user, deleted_at__isnull=True)

    @action(detail=False, methods=["post"])
    def upload(self, request):
        serializer = AttachmentUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not is_configured():
            raise ValidationError(
                {"detail": "File storage is not configured on this deployment."}
            )
        data = serializer.validated_data
        uploaded_file = data.get("file")
        if uploaded_file is not None:
            payload = uploaded_file.read()
            content_type = uploaded_file.content_type or "application/octet-stream"
            file_name = data.get("file_name") or uploaded_file.name
        else:
            payload, content_type = decode_data_url(data["data_url"])
            file_name = data.get("file_name") or ""

        transaction = None
        if data.get("transaction"):
            transaction = get_object_or_404(
                Transaction, pk=data["transaction"], user=request.user, deleted_at__isnull=True
            )

        try:
            result = upload_bytes(payload, new_public_id(request.user.id), content_type)
        except ValidationError:
            raise
        except Exception as exc:  # noqa: BLE001 - upstream storage failure
            logger.warning("Cloudinary upload failed: %s", exc)
            raise ValidationError(
                {"detail": f"File storage rejected the upload: {exc}"}
            ) from exc
        attachment = Attachment.objects.create(
            user=request.user,
            transaction=transaction,
            kind=data.get("kind", "receipt"),
            file_url=result["url"],
            public_id=result["public_id"] or "",
            file_name=file_name,
            content_type=result["content_type"],
            size=result["bytes"],
            note=data.get("note", ""),
        )
        return Response(AttachmentSerializer(attachment).data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        public_id = instance.public_id
        instance.deleted_at = timezone.now()
        instance.save(update_fields=["deleted_at", "updated_at"])
        destroy(public_id)