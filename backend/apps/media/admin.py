from django.contrib import admin

from .models import Photo


@admin.register(Photo)
class PhotoAdmin(admin.ModelAdmin):
    list_display = ("title", "s3_key", "content_type", "file_size", "created_at")
    search_fields = ("title", "alt_text", "s3_key")
    readonly_fields = ("id", "created_at")
