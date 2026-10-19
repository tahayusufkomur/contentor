from dataclasses import asdict

from rest_framework import serializers

from apps.billing.ways import ShorthandMixin
from apps.core.access import ContentAccessService
from apps.core.storage import generate_presigned_download_url
from apps.core.uploads.serializers import check_tenant_key
from apps.tags.serializers import TagSerializer, tag_ids_field

from .models import DownloadFile


class DownloadFileSerializer(serializers.ModelSerializer):
    access_info = serializers.SerializerMethodField()
    tags = TagSerializer(many=True, read_only=True)
    thumbnail_signed_url = serializers.SerializerMethodField()

    class Meta:
        model = DownloadFile
        fields = [
            "id",
            "title",
            "description",
            "thumbnail_id",
            "thumbnail_signed_url",
            "is_published",
            "file_url",
            "file_size",
            "download_count",
            "pricing_type",
            "price",
            "created_at",
            "access_info",
            "tags",
        ]
        read_only_fields = ["id", "download_count", "created_at"]

    def get_thumbnail_signed_url(self, obj):
        if obj.thumbnail_id and obj.thumbnail.s3_key:
            return generate_presigned_download_url(obj.thumbnail.s3_key)
        return ""

    def get_access_info(self, obj):
        access_map = self.context.get("access_map")
        if access_map and obj.pk in access_map:
            return asdict(access_map[obj.pk])
        request = self.context.get("request")
        return asdict(ContentAccessService().get_access_info(request.user if request else None, obj))


class DownloadFileCreateSerializer(ShorthandMixin, serializers.ModelSerializer):
    tag_ids = tag_ids_field("download")

    class Meta:
        model = DownloadFile
        fields = [
            "title",
            "description",
            "thumbnail",
            "is_published",
            "file_url",
            "file_size",
            "pricing_type",
            "price",
            "tag_ids",
        ]

    def validate_file_url(self, value):
        # `file_url` holds the storage key, not a web address.
        return check_tenant_key(value, getattr(self.instance, "file_url", None))
