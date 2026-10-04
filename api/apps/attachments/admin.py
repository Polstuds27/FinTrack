from django.contrib import admin

from .models import Attachment


@admin.register(Attachment)
class AttachmentAdmin(admin.ModelAdmin):
    list_display = ("file_name", "user", "kind", "transaction", "size", "created_at")
    list_filter = ("kind", "content_type")
    search_fields = ("file_name", "user__email")
    readonly_fields = ("public_id", "file_url")