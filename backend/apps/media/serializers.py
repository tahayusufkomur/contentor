from rest_framework import serializers

from apps.core.storage import generate_presigned_download_url
from apps.core.uploads.serializers import check_tenant_key
from apps.tags.serializers import TagSerializer, tag_ids_field

from .models import Photo


class PhotoSerializer(serializers.ModelSerializer):
    signed_url = serializers.SerializerMethodField()
    tags = TagSerializer(many=True, read_only=True)

    class Meta:
        model = Photo
        fields = [
            "id",
            "s3_key",
            "alt_text",
            "title",
            "content_type",
            "file_size",
            "width",
            "height",
            "signed_url",
            "tags",
            "index_status",
            "created_at",
        ]
        read_only_fields = ["id", "signed_url", "index_status", "created_at"]

    def get_signed_url(self, obj):
        if not obj.s3_key:
            return None
        return generate_presigned_download_url(obj.s3_key)


class PhotoCreateSerializer(serializers.ModelSerializer):
    tag_ids = tag_ids_field("photo")

    class Meta:
        model = Photo
        fields = [
            "s3_key",
            "alt_text",
            "title",
            "content_type",
            "file_size",
            "width",
            "height",
            "tag_ids",
        ]

    def validate_s3_key(self, value):
        return check_tenant_key(value, getattr(self.instance, "s3_key", None))
