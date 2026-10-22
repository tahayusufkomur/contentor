from rest_framework import serializers

from apps.email_campaigns.serializers import DesignField

from .models import PlatformCampaignRecipient, PlatformEmailCampaign, PlatformEmailTemplate
from .recipients import FILTER_TYPES, get_recipient_count


def validate_recipient_filter(value, *, require_recipients=True):
    if not isinstance(value, dict):
        raise serializers.ValidationError("recipient_filter must be an object.")
    filter_type = value.get("type")
    if filter_type not in FILTER_TYPES:
        raise serializers.ValidationError(f"Invalid filter type. Must be one of: {', '.join(FILTER_TYPES)}.")
    list_fields = {"plan": "plan_ids", "tenant": "tenant_ids", "individual": "user_ids"}
    if filter_type in list_fields:
        ids = value.get(list_fields[filter_type])
        if not isinstance(ids, list) or not ids:
            raise serializers.ValidationError(f"{list_fields[filter_type]} must be a non-empty list.")
    if require_recipients and get_recipient_count(value) == 0:
        raise serializers.ValidationError("No recipients match the filter.")
    return value


class PlatformTemplateSerializer(serializers.ModelSerializer):
    design = DesignField(required=False)

    class Meta:
        model = PlatformEmailTemplate
        fields = ["id", "name", "design", "subject", "preheader", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class PlatformEmailCampaignSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()
    sender_email = serializers.SerializerMethodField()

    def get_sender_name(self, obj):
        return obj.sender.name if obj.sender else ""

    def get_sender_email(self, obj):
        return obj.sender.email if obj.sender else ""

    class Meta:
        model = PlatformEmailCampaign
        fields = [
            "id",
            "subject",
            "preheader",
            "design",
            "template_name",
            "sender",
            "sender_name",
            "sender_email",
            "recipient_filter",
            "recipient_count",
            "success_count",
            "failure_count",
            "status",
            "created_at",
            "updated_at",
            "sent_at",
            "rendered_html",
            "recipient_summary",
        ]
        read_only_fields = fields


class PlatformEmailCampaignListSerializer(PlatformEmailCampaignSerializer):
    class Meta(PlatformEmailCampaignSerializer.Meta):
        fields = [n for n in PlatformEmailCampaignSerializer.Meta.fields if n not in ("rendered_html", "design")]
        read_only_fields = fields


class DraftCreateSerializer(serializers.Serializer):
    template_id = serializers.IntegerField(required=False, allow_null=True)


class DraftUpdateSerializer(serializers.Serializer):
    subject = serializers.CharField(max_length=255, required=False, allow_blank=True)
    preheader = serializers.CharField(max_length=255, required=False, allow_blank=True)
    design = DesignField(required=False)
    recipient_filter = serializers.JSONField(required=False)

    def validate_recipient_filter(self, value):
        return validate_recipient_filter(value, require_recipients=False)


class SendSerializer(serializers.Serializer):
    recipient_filter = serializers.JSONField()

    def validate_recipient_filter(self, value):
        return validate_recipient_filter(value)


class PlatformCampaignRecipientSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlatformCampaignRecipient
        fields = ["id", "user_id", "user_name", "user_email", "status", "error_message", "sent_at"]
        read_only_fields = fields
