from rest_framework import serializers

from apps.core.storage import generate_presigned_download_url

from .models import Photo


class PhotoSerializer(serializers.ModelSerializer):
    signed_url = serializers.SerializerMethodField()

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
            "created_at",
        ]
        read_only_fields = ["id", "signed_url", "created_at"]

    def get_signed_url(self, obj):
        if not obj.s3_key:
            return None
        return generate_presigned_download_url(obj.s3_key)


class PhotoCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Photo
        fields = ["s3_key", "alt_text", "title", "content_type", "file_size", "width", "height"]
