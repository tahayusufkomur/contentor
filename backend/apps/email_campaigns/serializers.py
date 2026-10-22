from django.utils import timezone
from rest_framework import serializers

from .brand import DesignError, clean_design
from .models import CampaignRecipient, EmailCampaign, EmailTemplate, TemplateCategory
from .recipients import get_recipient_count


def validate_recipient_filter(value, *, require_recipients=True):
    if not isinstance(value, dict):
        raise serializers.ValidationError("recipient_filter must be an object.")
    filter_type = value.get("type")
    if filter_type not in ("all", "course", "individual"):
        raise serializers.ValidationError("Invalid filter type. Must be 'all', 'course', or 'individual'.")
    if filter_type == "course":
        course_ids = value.get("course_ids")
        if not isinstance(course_ids, list) or not course_ids:
            raise serializers.ValidationError("course_ids must be a non-empty list.")
    if filter_type == "individual":
        user_ids = value.get("user_ids")
        if not isinstance(user_ids, list) or not user_ids:
            raise serializers.ValidationError("user_ids must be a non-empty list.")
    if require_recipients and get_recipient_count(value) == 0:
        raise serializers.ValidationError("No recipients match the filter.")
    return value


class DesignField(serializers.JSONField):
    """A design, cleaned to what the engine stores (brand.clean_design)."""

    def to_internal_value(self, data):
        try:
            return clean_design(super().to_internal_value(data))
        except DesignError as e:
            raise serializers.ValidationError(str(e)) from e


class EmailTemplateSerializer(serializers.ModelSerializer):
    design = DesignField(required=False)

    class Meta:
        model = EmailTemplate
        fields = ["id", "name", "category", "design", "subject", "preheader", "source", "created_at", "updated_at"]
        read_only_fields = ["id", "source", "created_at", "updated_at"]

    def validate_category(self, value):
        return value if value in TemplateCategory.values else TemplateCategory.OTHER


class EmailTemplateListSerializer(EmailTemplateSerializer):
    """A template card: no design (its preview HTML is added by the view)."""

    class Meta(EmailTemplateSerializer.Meta):
        fields = [f for f in EmailTemplateSerializer.Meta.fields if f != "design"]


class EmailCampaignSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()
    sender_email = serializers.SerializerMethodField()
    template_name = serializers.SerializerMethodField()

    def get_sender_name(self, obj):
        return obj.sender.name if obj.sender else ""

    def get_sender_email(self, obj):
        return obj.sender.email if obj.sender else ""

    def get_template_name(self, obj):
        return obj.template.name if obj.template else obj.template_name

    class Meta:
        model = EmailCampaign
        fields = [
            "id",
            "subject",
            "preheader",
            "design",
            "template",
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
            "scheduled_at",
            "sent_at",
            "rendered_html",
            "recipient_summary",
        ]
        read_only_fields = fields


class EmailCampaignListSerializer(EmailCampaignSerializer):
    """A row of the campaign list: no design and no rendered email (tens of kilobytes each)."""

    class Meta(EmailCampaignSerializer.Meta):
        fields = [n for n in EmailCampaignSerializer.Meta.fields if n not in ("rendered_html", "design")]
        read_only_fields = fields


class DraftCreateSerializer(serializers.Serializer):
    """A new draft: from one of her templates, or blank (the brand's header and footer)."""

    template_id = serializers.IntegerField(required=False, allow_null=True)
    subject = serializers.CharField(max_length=255, required=False, allow_blank=True)
    recipient_filter = serializers.JSONField(required=False)

    def validate_recipient_filter(self, value):
        return validate_recipient_filter(value, require_recipients=False)


class DraftUpdateSerializer(serializers.Serializer):
    subject = serializers.CharField(max_length=255, required=False, allow_blank=True)
    preheader = serializers.CharField(max_length=255, required=False, allow_blank=True)
    design = DesignField(required=False)
    recipient_filter = serializers.JSONField(required=False)

    def validate_recipient_filter(self, value):
        return validate_recipient_filter(value, require_recipients=False)


class SendSerializer(serializers.Serializer):
    recipient_filter = serializers.JSONField()
    # Optional future send time. Null/absent = send now.
    scheduled_at = serializers.DateTimeField(required=False, allow_null=True)

    def validate_scheduled_at(self, value):
        if value is not None and value <= timezone.now():
            raise serializers.ValidationError("scheduled_at must be in the future.")
        return value

    def validate_recipient_filter(self, value):
        return validate_recipient_filter(value)


class RenderSerializer(serializers.Serializer):
    design = DesignField()
    subject = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    preheader = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


class CampaignRecipientSerializer(serializers.ModelSerializer):
    class Meta:
        model = CampaignRecipient
        fields = ["id", "user_id", "user_name", "user_email", "status", "error_message", "sent_at"]
        read_only_fields = fields


class DesignerStartSerializer(serializers.Serializer):
    brief = serializers.CharField(max_length=2000)
    campaign_id = serializers.IntegerField(required=False, allow_null=True)
    template_id = serializers.IntegerField(required=False, allow_null=True)
    mode = serializers.ChoiceField(choices=["new", "edit"], default="new")
    block_id = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")
    refs = serializers.ListField(child=serializers.CharField(max_length=40), required=False, max_length=6)

    def validate(self, attrs):
        if bool(attrs.get("campaign_id")) == bool(attrs.get("template_id")):
            raise serializers.ValidationError("Give exactly one of campaign_id and template_id.")
        return attrs
