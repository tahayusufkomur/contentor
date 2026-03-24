from dataclasses import asdict

from rest_framework import serializers

from apps.core.storage import generate_presigned_download_url, sign_if_s3_key

from .models import LiveClass, LiveStream, OnsiteEvent, ZoomClass


def _get_thumbnail_signed_url(obj):
    if obj.thumbnail_id and obj.thumbnail and obj.thumbnail.s3_key:
        return generate_presigned_download_url(obj.thumbnail.s3_key)
    return sign_if_s3_key(obj.thumbnail_url)


class LiveClassSerializer(serializers.ModelSerializer):
    thumbnail_signed_url = serializers.SerializerMethodField()
    recording_signed_url = serializers.SerializerMethodField()
    access_info = serializers.SerializerMethodField()

    class Meta:
        model = LiveClass
        fields = [
            "id",
            "title",
            "description",
            "instructor",
            "status",
            "pricing_type",
            "price",
            "thumbnail_url",
            "thumbnail_id",
            "thumbnail_signed_url",
            "recording_id",
            "recording_url",
            "recording_signed_url",
            "auto_recording",
            "room_name",
            "scheduled_at",
            "started_at",
            "ended_at",
            "created_at",
            "access_info",
        ]
        read_only_fields = [
            "id",
            "instructor",
            "status",
            "room_name",
            "recording_url",
            "recording_id",
            "recording_signed_url",
            "started_at",
            "ended_at",
            "created_at",
        ]

    def get_thumbnail_signed_url(self, obj):
        return _get_thumbnail_signed_url(obj)

    def get_recording_signed_url(self, obj):
        s3_key = None
        if obj.recording and obj.recording.s3_key:
            s3_key = obj.recording.s3_key
        elif obj.recording_url:
            s3_key = obj.recording_url
        if not s3_key:
            return None
        # Gate recording access
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            if request.user.role not in ("owner", "coach"):
                from apps.core.access import ContentAccessService

                service = ContentAccessService()
                if not service.check_access(request.user, obj):
                    return None
        else:
            return None
        if s3_key.startswith("http"):
            return s3_key
        return generate_presigned_download_url(s3_key)

    def get_access_info(self, obj):
        access_map = self.context.get("access_map")
        if access_map and obj.pk in access_map:
            return asdict(access_map[obj.pk])
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            from apps.core.access import AccessInfo

            pricing_type = obj.pricing_type
            if pricing_type == "free":
                return asdict(AccessInfo(has_access=True, pricing_type=pricing_type, access_reason="free"))
            return asdict(
                AccessInfo(
                    has_access=False,
                    pricing_type=pricing_type,
                    price=obj.price,
                    currency=getattr(obj, "currency", "TRY"),
                    unlock_methods=["purchase"],
                )
            )
        from apps.core.access import ContentAccessService

        service = ContentAccessService()
        return asdict(service.get_access_info(request.user, obj))


class LiveClassCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = LiveClass
        fields = [
            "title",
            "description",
            "pricing_type",
            "price",
            "thumbnail_url",
            "thumbnail",
            "auto_recording",
            "scheduled_at",
        ]


class LiveStreamSerializer(serializers.ModelSerializer):
    thumbnail_signed_url = serializers.SerializerMethodField()
    recording_signed_url = serializers.SerializerMethodField()
    access_info = serializers.SerializerMethodField()

    class Meta:
        model = LiveStream
        fields = [
            "id",
            "title",
            "description",
            "instructor",
            "status",
            "pricing_type",
            "price",
            "thumbnail_url",
            "thumbnail_id",
            "thumbnail_signed_url",
            "recording_id",
            "recording_url",
            "recording_signed_url",
            "auto_recording",
            "room_name",
            "scheduled_at",
            "started_at",
            "ended_at",
            "created_at",
            "access_info",
        ]
        read_only_fields = [
            "id",
            "instructor",
            "status",
            "room_name",
            "recording_url",
            "recording_id",
            "recording_signed_url",
            "started_at",
            "ended_at",
            "created_at",
        ]

    def get_thumbnail_signed_url(self, obj):
        return _get_thumbnail_signed_url(obj)

    def get_recording_signed_url(self, obj):
        s3_key = None
        if obj.recording and obj.recording.s3_key:
            s3_key = obj.recording.s3_key
        elif obj.recording_url:
            s3_key = obj.recording_url
        if not s3_key:
            return None
        # Gate recording access
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            if request.user.role not in ("owner", "coach"):
                from apps.core.access import ContentAccessService

                service = ContentAccessService()
                if not service.check_access(request.user, obj):
                    return None
        else:
            return None
        if s3_key.startswith("http"):
            return s3_key
        return generate_presigned_download_url(s3_key)

    def get_access_info(self, obj):
        access_map = self.context.get("access_map")
        if access_map and obj.pk in access_map:
            return asdict(access_map[obj.pk])
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            from apps.core.access import AccessInfo

            pricing_type = obj.pricing_type
            if pricing_type == "free":
                return asdict(AccessInfo(has_access=True, pricing_type=pricing_type, access_reason="free"))
            return asdict(
                AccessInfo(
                    has_access=False,
                    pricing_type=pricing_type,
                    price=obj.price,
                    currency=getattr(obj, "currency", "TRY"),
                    unlock_methods=["purchase"],
                )
            )
        from apps.core.access import ContentAccessService

        service = ContentAccessService()
        return asdict(service.get_access_info(request.user, obj))


class LiveStreamCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = LiveStream
        fields = [
            "title",
            "description",
            "pricing_type",
            "price",
            "thumbnail_url",
            "thumbnail",
            "auto_recording",
            "scheduled_at",
        ]


class ZoomClassSerializer(serializers.ModelSerializer):
    class Meta:
        model = ZoomClass
        fields = [
            "id",
            "title",
            "description",
            "instructor",
            "status",
            "zoom_link",
            "zoom_meeting_id",
            "pricing_type",
            "price",
            "scheduled_at",
            "started_at",
            "ended_at",
            "created_at",
        ]
        read_only_fields = ["id", "instructor", "started_at", "ended_at", "created_at"]


class ZoomClassCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ZoomClass
        fields = ["title", "description", "zoom_link", "zoom_meeting_id", "pricing_type", "price", "scheduled_at"]


class OnsiteEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = OnsiteEvent
        fields = [
            "id",
            "title",
            "description",
            "instructor",
            "status",
            "location",
            "address",
            "max_capacity",
            "pricing_type",
            "price",
            "scheduled_at",
            "started_at",
            "ended_at",
            "created_at",
        ]
        read_only_fields = ["id", "instructor", "started_at", "ended_at", "created_at"]


class OnsiteEventCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = OnsiteEvent
        fields = [
            "title",
            "description",
            "location",
            "address",
            "max_capacity",
            "pricing_type",
            "price",
            "scheduled_at",
        ]


class CalendarEventSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    type = serializers.CharField()
    title = serializers.CharField()
    description = serializers.CharField()
    status = serializers.CharField()
    pricing_type = serializers.CharField()
    price = serializers.DecimalField(max_digits=10, decimal_places=2)
    scheduled_at = serializers.DateTimeField()
    started_at = serializers.DateTimeField(allow_null=True)
    ended_at = serializers.DateTimeField(allow_null=True)
    location = serializers.CharField(allow_blank=True, default="")
    thumbnail_signed_url = serializers.CharField(allow_null=True, default=None)


class AccessInfoSerializer(serializers.Serializer):
    has_access = serializers.BooleanField()
    pricing_type = serializers.CharField()
    price = serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True)
    currency = serializers.CharField(allow_null=True)
    access_reason = serializers.CharField(allow_null=True)
    unlock_methods = serializers.ListField(child=serializers.CharField(), allow_null=True)


class CalendarEventDetailSerializer(CalendarEventSerializer):
    access_info = AccessInfoSerializer()
