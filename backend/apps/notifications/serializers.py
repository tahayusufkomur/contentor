from django.utils import timezone
from rest_framework import serializers

from apps.tenant_config.defaults import sanitize_rich_text
from apps.tenant_config.models import TenantConfig

from . import recurrence as rec
from .models import (
    Announcement,
    AnnouncementRecipient,
    AnnouncementTemplate,
    RecurringAnnouncement,
)


class SubscribeSerializer(serializers.Serializer):
    endpoint = serializers.URLField(max_length=500)
    keys = serializers.DictField(child=serializers.CharField())

    def validate_keys(self, value):
        if "p256dh" not in value or "auth" not in value:
            raise serializers.ValidationError("keys must include p256dh and auth")
        return value


class AnnouncementCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200)
    body = serializers.CharField(allow_blank=True, required=False, default="")
    link = serializers.CharField(max_length=500, allow_blank=True, required=False, default="")
    filters = serializers.DictField(required=False, default=dict)
    scheduled_at = serializers.DateTimeField(required=False, allow_null=True)
    also_email = serializers.BooleanField(required=False, default=False)

    def validate_body(self, value):
        return sanitize_rich_text(value)

    def validate_scheduled_at(self, value):
        if value and value <= timezone.now():
            return None  # past/now => treat as send-now
        return value


class _RecipientSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="user.name", read_only=True)
    user_id = serializers.IntegerField(source="user.id", read_only=True)

    class Meta:
        model = AnnouncementRecipient
        fields = ["user_id", "name", "push_status", "read_at"]


class AnnouncementListSerializer(serializers.ModelSerializer):
    read_count = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = [
            "id",
            "title",
            "status",
            "scheduled_at",
            "created_at",
            "recipient_count",
            "push_sent_count",
            "read_count",
        ]

    def get_read_count(self, obj):
        annotated = getattr(obj, "read_count_annotated", None)
        if annotated is not None:
            return annotated
        return obj.recipients.filter(read_at__isnull=False).count()


class AnnouncementDetailSerializer(AnnouncementListSerializer):
    recipients = _RecipientSerializer(many=True, read_only=True)
    filters = serializers.JSONField(source="filters_json", read_only=True)

    class Meta(AnnouncementListSerializer.Meta):
        fields = AnnouncementListSerializer.Meta.fields + ["body", "link", "filters", "recipients"]


class AnnouncementTemplateSerializer(serializers.ModelSerializer):
    builtin = serializers.SerializerMethodField()

    class Meta:
        model = AnnouncementTemplate
        fields = ["id", "name", "title", "body", "link", "link_label", "builtin"]
        read_only_fields = ["id"]

    def get_builtin(self, obj):
        return False

    def validate_body(self, value):
        return sanitize_rich_text(value)


class RecurringAnnouncementSerializer(serializers.ModelSerializer):
    filters = serializers.JSONField(source="filters_json", required=False, default=dict)

    class Meta:
        model = RecurringAnnouncement
        fields = [
            "id",
            "title",
            "body",
            "link",
            "link_label",
            "filters",
            "also_email",
            "frequency",
            "send_time",
            "weekday",
            "day_of_month",
            "start_date",
            "end_date",
            "next_run_at",
            "is_active",
        ]
        read_only_fields = ["id", "next_run_at"]

    def validate_body(self, value):
        return sanitize_rich_text(value)

    def _get(self, data, key):
        return data.get(key, getattr(self.instance, key, None))

    def validate(self, data):
        freq = self._get(data, "frequency")
        if freq == "weekly" and self._get(data, "weekday") is None:
            raise serializers.ValidationError({"weekday": "Required for weekly."})
        if freq == "monthly" and self._get(data, "day_of_month") is None:
            raise serializers.ValidationError({"day_of_month": "Required for monthly."})
        sd, ed = self._get(data, "start_date"), self._get(data, "end_date")
        if ed and sd and ed < sd:
            raise serializers.ValidationError({"end_date": "Must be on/after start date."})
        return data

    def _compute_next(self, instance):
        cfg = TenantConfig.objects.first()
        tz_name = cfg.timezone if cfg else "UTC"
        instance.next_run_at = rec.next_occurrence(
            frequency=instance.frequency,
            send_time=instance.send_time,
            weekday=instance.weekday,
            day_of_month=instance.day_of_month,
            after_utc=timezone.now(),
            tz_name=tz_name,
            start_date=instance.start_date,
        )

    def create(self, validated):
        obj = RecurringAnnouncement(**validated)
        self._compute_next(obj)
        obj.save()
        return obj

    def update(self, instance, validated):
        for k, v in validated.items():
            setattr(instance, k, v)
        self._compute_next(instance)
        instance.save()
        return instance


class FeedItemSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="announcement.id", read_only=True)
    title = serializers.CharField(source="announcement.title", read_only=True)
    body = serializers.CharField(source="announcement.body", read_only=True)
    link = serializers.CharField(source="announcement.link", read_only=True)
    created_at = serializers.DateTimeField(source="announcement.created_at", read_only=True)

    class Meta:
        model = AnnouncementRecipient
        fields = ["id", "title", "body", "link", "created_at", "read_at"]
