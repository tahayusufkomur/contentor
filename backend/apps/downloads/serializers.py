from dataclasses import asdict

from rest_framework import serializers

from apps.core.access import ContentAccessService
from apps.core.uploads.serializers import check_tenant_key
from apps.tags.serializers import TagSerializer, tag_ids_field

from .models import DownloadFile


class DownloadFileSerializer(serializers.ModelSerializer):
    access_info = serializers.SerializerMethodField()
    tags = TagSerializer(many=True, read_only=True)

    class Meta:
        model = DownloadFile
        fields = [
            "id",
            "title",
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

    def get_access_info(self, obj):
        access_map = self.context.get("access_map")
        if access_map and obj.pk in access_map:
            return asdict(access_map[obj.pk])
        request = self.context.get("request")
        return asdict(ContentAccessService().get_access_info(request.user if request else None, obj))


class DownloadFileCreateSerializer(serializers.ModelSerializer):
    tag_ids = tag_ids_field("download")

    class Meta:
        model = DownloadFile
        fields = ["title", "file_url", "file_size", "pricing_type", "price", "tag_ids"]

    def validate_file_url(self, value):
        # `file_url` holds the storage key, not a web address.
        return check_tenant_key(value, getattr(self.instance, "file_url", None))

    def validate(self, attrs):
        # Free content never keeps a price: the publish gate and the storefront
        # both read `price`, so a leftover value would silently demand payouts.
        pricing_type = attrs.get("pricing_type", getattr(self.instance, "pricing_type", "free"))
        if pricing_type != "paid":
            attrs["price"] = 0
        return attrs
