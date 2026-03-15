from rest_framework import serializers

from .models import DownloadFile


class DownloadFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = DownloadFile
        fields = [
            "id",
            "title",
            "file_url",
            "file_size",
            "download_count",
            "access_type",
            "created_at",
        ]
        read_only_fields = ["id", "download_count", "created_at"]


class DownloadFileCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = DownloadFile
        fields = ["title", "file_url", "file_size", "access_type"]
