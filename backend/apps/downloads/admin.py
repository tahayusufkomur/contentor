from django.contrib import admin
from .models import DownloadFile

@admin.register(DownloadFile)
class DownloadFileAdmin(admin.ModelAdmin):
    list_display = ("title", "file_size", "download_count", "access_type", "created_at")
    list_filter = ("access_type",)
