from dataclasses import asdict

from rest_framework import serializers

from apps.billing.ways import ShorthandMixin
from apps.core.storage import generate_presigned_download_url, sign_if_s3_key
from apps.core.uploads.serializers import check_tenant_key
from apps.filters.models import FilterOption
from apps.filters.serializers import FilterOptionSerializer
from apps.media import designs
from apps.tags.serializers import TagSerializer, tag_ids_field

from . import series
from .models import LiveClass, LiveStream, OnsiteEvent, ZoomClass


def _viewer_has_access(context, instance):
    """True if the serializer's viewer may see the join/location secrets: whatever the paywall says
    for them (a visitor included)."""
    from apps.core.access import ContentAccessService

    request = context.get("request")
    return ContentAccessService().check_access(getattr(request, "user", None), instance)


def _filter_option_ids_field():
    return serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=FilterOption.objects.all(),
        source="filter_options",
        required=False,
    )


def _tag_ids_field():
    # All four event models share the single "event" tag pool.
    return tag_ids_field("event")


class _ScheduledOnCreateMixin(ShorthandMixin):
    """Mark an event as 'scheduled' when it has a scheduled time, on creation and on edit.

    Events default to 'draft' and the student-facing lists hide drafts
    (status__in=["scheduled","live","ended"]). Nothing else in the lifecycle
    promotes draft→scheduled (start→live, stop→ended), so a class/stream a coach
    schedules would stay an invisible draft forever. Setting it here at creation is
    the missing transition; without a scheduled_at it correctly stays a draft.
    """

    def create(self, validated_data):
        if validated_data.get("scheduled_at"):
            validated_data["status"] = "scheduled"
        instance = super().create(validated_data)
        # A session of a series that has a cover wears it (before the copilot's own auto cover, which
        # skips a row that already has one).
        designs.adopt_series_cover(instance)
        return instance

    def update(self, instance, validated_data):
        # The same transition on edit: an undated draft that gets a date goes on
        # the schedule, and a scheduled event whose date is taken away is a draft
        # again. A draft that already had a date is held (sell later, focus mode):
        # it stays a draft until she publishes it, by `status: "scheduled"` or by
        # `publish_series` (every held session of its series). A class that is
        # live or has ended keeps its status.
        asked = getattr(self, "initial_data", {})
        when = validated_data.get("scheduled_at", instance.scheduled_at)
        if (
            instance.status == "draft"
            and when
            and (instance.scheduled_at is None or asked.get("status") == "scheduled")
        ):
            validated_data["status"] = "scheduled"
        elif instance.status == "scheduled" and not when:
            validated_data["status"] = "draft"
        instance = super().update(instance, validated_data)
        if asked.get("publish_series") is True:
            series.publish_series(instance)
            instance.refresh_from_db(fields=["status"])
        return instance


class _PreparedBoardMixin:
    """`whiteboard_key` is a storage key the coach's upload handed back: it must be this tenant's."""

    def validate_whiteboard_key(self, value):
        return check_tenant_key(value, getattr(self.instance, "whiteboard_key", None))


def get_thumbnail_signed_url(obj):
    if obj.thumbnail_id and obj.thumbnail and obj.thumbnail.s3_key:
        return generate_presigned_download_url(obj.thumbnail.s3_key)
    return sign_if_s3_key(obj.thumbnail_url)


class LiveClassSerializer(serializers.ModelSerializer):
    thumbnail_signed_url = serializers.SerializerMethodField()
    cover_design = serializers.SerializerMethodField()
    recording_signed_url = serializers.SerializerMethodField()
    access_info = serializers.SerializerMethodField()
    filter_options = FilterOptionSerializer(many=True, read_only=True)
    tags = TagSerializer(many=True, read_only=True)

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
            "cover_design",
            "recording_id",
            "recording_url",
            "recording_signed_url",
            "auto_recording",
            "whiteboard_key",
            "watermark",
            "room_name",
            "scheduled_at",
            "started_at",
            "ended_at",
            "created_at",
            "access_info",
            "filter_options",
            "tags",
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
        return get_thumbnail_signed_url(obj)

    def get_cover_design(self, obj):
        return designs.cover_for(obj, self.context)

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
        from apps.core.access import ContentAccessService

        request = self.context.get("request")
        return asdict(ContentAccessService().get_access_info(request.user if request else None, obj))


class LiveClassCreateSerializer(_PreparedBoardMixin, _ScheduledOnCreateMixin, serializers.ModelSerializer):
    filter_option_ids = _filter_option_ids_field()
    tag_ids = _tag_ids_field()

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
            "whiteboard_key",
            "watermark",
            "scheduled_at",
            "filter_option_ids",
            "tag_ids",
        ]


class LiveStreamSerializer(serializers.ModelSerializer):
    thumbnail_signed_url = serializers.SerializerMethodField()
    cover_design = serializers.SerializerMethodField()
    recording_signed_url = serializers.SerializerMethodField()
    access_info = serializers.SerializerMethodField()
    filter_options = FilterOptionSerializer(many=True, read_only=True)
    tags = TagSerializer(many=True, read_only=True)

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
            "cover_design",
            "recording_id",
            "recording_url",
            "recording_signed_url",
            "auto_recording",
            "whiteboard_key",
            "watermark",
            "room_name",
            "scheduled_at",
            "started_at",
            "ended_at",
            "created_at",
            "access_info",
            "filter_options",
            "tags",
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
        return get_thumbnail_signed_url(obj)

    def get_cover_design(self, obj):
        return designs.cover_for(obj, self.context)

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
        from apps.core.access import ContentAccessService

        request = self.context.get("request")
        return asdict(ContentAccessService().get_access_info(request.user if request else None, obj))


class LiveStreamCreateSerializer(_PreparedBoardMixin, _ScheduledOnCreateMixin, serializers.ModelSerializer):
    filter_option_ids = _filter_option_ids_field()
    tag_ids = _tag_ids_field()

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
            "whiteboard_key",
            "watermark",
            "scheduled_at",
            "filter_option_ids",
            "tag_ids",
        ]


class ZoomClassSerializer(serializers.ModelSerializer):
    filter_options = FilterOptionSerializer(many=True, read_only=True)
    tags = TagSerializer(many=True, read_only=True)
    thumbnail_signed_url = serializers.SerializerMethodField()
    cover_design = serializers.SerializerMethodField()

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
            "thumbnail_signed_url",
            "cover_design",
            "filter_options",
            "tags",
        ]
        read_only_fields = ["id", "instructor", "started_at", "ended_at", "created_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Paid join details are visible only to viewers with access.
        if not _viewer_has_access(self.context, instance):
            data["zoom_link"] = ""
            data["zoom_meeting_id"] = ""
        return data

    def get_thumbnail_signed_url(self, obj):
        return get_thumbnail_signed_url(obj)

    def get_cover_design(self, obj):
        return designs.cover_for(obj, self.context)


class ZoomClassCreateSerializer(_ScheduledOnCreateMixin, serializers.ModelSerializer):
    filter_option_ids = _filter_option_ids_field()
    tag_ids = _tag_ids_field()

    class Meta:
        model = ZoomClass
        fields = [
            "title",
            "description",
            "zoom_link",
            "zoom_meeting_id",
            "pricing_type",
            "price",
            "scheduled_at",
            "filter_option_ids",
            "tag_ids",
        ]


class OnsiteEventSerializer(serializers.ModelSerializer):
    filter_options = FilterOptionSerializer(many=True, read_only=True)
    tags = TagSerializer(many=True, read_only=True)
    thumbnail_signed_url = serializers.SerializerMethodField()
    cover_design = serializers.SerializerMethodField()

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
            "thumbnail_signed_url",
            "cover_design",
            "filter_options",
            "tags",
        ]
        read_only_fields = ["id", "instructor", "started_at", "ended_at", "created_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # The exact address is visible only to viewers with access; the general
        # "location" stays public so the event can still be advertised.
        if not _viewer_has_access(self.context, instance):
            data["address"] = ""
        return data

    def get_thumbnail_signed_url(self, obj):
        return get_thumbnail_signed_url(obj)

    def get_cover_design(self, obj):
        return designs.cover_for(obj, self.context)


class OnsiteEventCreateSerializer(_ScheduledOnCreateMixin, serializers.ModelSerializer):
    filter_option_ids = _filter_option_ids_field()
    tag_ids = _tag_ids_field()

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
            "filter_option_ids",
            "tag_ids",
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
    # The series' kept cover (apps.media.designs.cover_for), null for the plain photo.
    cover_design = serializers.DictField(allow_null=True, default=None)
    filter_options = serializers.ListField(child=serializers.DictField(), required=False, default=list)
    # Tenant charge currency, so public listings can format prices.
    currency = serializers.SerializerMethodField()

    def get_currency(self, obj):
        from apps.core.currency import tenant_charge_currency

        return tenant_charge_currency()


class AccessInfoSerializer(serializers.Serializer):
    has_access = serializers.BooleanField()
    pricing_type = serializers.CharField()
    price = serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True)
    currency = serializers.CharField(allow_null=True)
    access_reason = serializers.CharField(allow_null=True)
    unlock_methods = serializers.ListField(child=serializers.CharField(), allow_null=True)
    access_ends_at = serializers.DateTimeField(allow_null=True)
    opens_at = serializers.DateTimeField(allow_null=True)


class CalendarEventDetailSerializer(CalendarEventSerializer):
    access_info = AccessInfoSerializer()
    # Every way to unlock it, each with its window (ContentAccessService.get_unlock_options).
    unlock_options = serializers.DictField()
    address = serializers.CharField(allow_blank=True, default="")
