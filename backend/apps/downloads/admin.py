from django.contrib import admin

from .models import DownloadFile


@admin.register(DownloadFile)
class DownloadFileAdmin(admin.ModelAdmin):
    list_display = ("title", "file_size", "download_count", "pricing_type", "price", "created_at")
    list_filter = ("pricing_type",)
