from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "kind", "level", "read_at", "created_at")
    list_filter = ("kind", "level")
    search_fields = ("title", "user__email")