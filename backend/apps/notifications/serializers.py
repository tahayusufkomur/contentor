from django.utils import timezone
from rest_framework import serializers

from apps.tenant_config.defaults import sanitize_rich_text

from .models import Announcement, AnnouncementRecipient, AnnouncementTemplate


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


class FeedItemSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="announcement.id", read_only=True)
    title = serializers.CharField(source="announcement.title", read_only=True)
    body = serializers.CharField(source="announcement.body", read_only=True)
    link = serializers.CharField(source="announcement.link", read_only=True)
    created_at = serializers.DateTimeField(source="announcement.created_at", read_only=True)

    class Meta:
        model = AnnouncementRecipient
        fields = ["id", "title", "body", "link", "created_at", "read_at"]
