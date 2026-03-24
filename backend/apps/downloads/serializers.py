from dataclasses import asdict

from rest_framework import serializers

from apps.core.access import AccessInfo, ContentAccessService

from .models import DownloadFile


class DownloadFileSerializer(serializers.ModelSerializer):
    access_info = serializers.SerializerMethodField()

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
        ]
        read_only_fields = ["id", "download_count", "created_at"]

    def get_access_info(self, obj):
        access_map = self.context.get("access_map")
        if access_map and obj.pk in access_map:
            return asdict(access_map[obj.pk])
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            pricing_type = obj.pricing_type
            if pricing_type == "free":
                return asdict(AccessInfo(has_access=True, pricing_type=pricing_type, access_reason="free"))
            return asdict(
                AccessInfo(
                    has_access=False,
                    pricing_type=pricing_type,
                    price=obj.price,
                    currency="TRY",
                    unlock_methods=["purchase"],
                )
            )
        service = ContentAccessService()
        return asdict(service.get_access_info(request.user, obj))


class DownloadFileCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = DownloadFile
        fields = ["title", "file_url", "file_size", "pricing_type", "price"]
