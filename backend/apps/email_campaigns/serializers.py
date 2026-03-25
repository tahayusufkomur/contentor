from rest_framework import serializers

from .models import CampaignRecipient, EmailCampaign
from .recipients import get_recipient_count


class SendEmailSerializer(serializers.Serializer):
    template_id = serializers.CharField(max_length=255)
    template_name = serializers.CharField(max_length=255, required=False, default="")
    subject = serializers.CharField(max_length=255)
    recipient_filter = serializers.JSONField()

    def validate_recipient_filter(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("recipient_filter must be an object.")

        filter_type = value.get("type")
        if filter_type not in ("all", "course", "individual"):
            raise serializers.ValidationError("Invalid filter type. Must be 'all', 'course', or 'individual'.")

        if filter_type == "course":
            course_ids = value.get("course_ids")
            if not isinstance(course_ids, list) or len(course_ids) == 0:
                raise serializers.ValidationError("course_ids must be a non-empty list.")

        if filter_type == "individual":
            user_ids = value.get("user_ids")
            if not isinstance(user_ids, list) or len(user_ids) == 0:
                raise serializers.ValidationError("user_ids must be a non-empty list.")

        if get_recipient_count(value) == 0:
            raise serializers.ValidationError("No recipients match the filter.")

        return value


class EmailCampaignSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()
    sender_email = serializers.SerializerMethodField()

    def get_sender_name(self, obj):
        return obj.sender.name if obj.sender else ""

    def get_sender_email(self, obj):
        return obj.sender.email if obj.sender else ""

    class Meta:
        model = EmailCampaign
        fields = [
            "id",
            "subject",
            "template_id",
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
            "sent_at",
            "rendered_html",
            "recipient_summary",
        ]
        read_only_fields = fields


class CampaignRecipientSerializer(serializers.ModelSerializer):
    class Meta:
        model = CampaignRecipient
        fields = ["id", "user_id", "user_name", "user_email", "status", "error_message", "sent_at"]
        read_only_fields = fields


class CopyTemplateSerializer(serializers.Serializer):
    source_template_id = serializers.CharField(max_length=255)


class PreviewTemplateSerializer(serializers.Serializer):
    template_ids = serializers.ListField(
        child=serializers.CharField(max_length=255),
        min_length=1,
        max_length=20,
    )
