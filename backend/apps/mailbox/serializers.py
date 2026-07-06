from django.utils.html import strip_tags
from rest_framework import serializers

from apps.core.storage import generate_presigned_download_url
from apps.tenant_config.defaults import sanitize_rich_text

from .models import Conversation, Message, MessageAttachment


class MessageAttachmentSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = MessageAttachment
        fields = ["id", "filename", "content_type", "size", "omitted", "download_url"]

    def get_download_url(self, obj) -> str:
        if obj.omitted or not obj.storage_key:
            return ""
        return generate_presigned_download_url(obj.storage_key)


class ConversationSerializer(serializers.ModelSerializer):
    last_message_preview = serializers.SerializerMethodField()
    last_message_has_attachments = serializers.SerializerMethodField()
    student_email = serializers.SerializerMethodField()
    student_name = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id",
            "subject",
            "counterparty_email",
            "counterparty_name",
            "student_email",
            "student_name",
            "last_message_at",
            "unread_count",
            "is_archived",
            "is_spam",
            "last_message_preview",
            "last_message_has_attachments",
        ]

    def _last_message(self, obj):
        # messages ordering is ["created_at"]; use the prefetched cache when present.
        msgs = list(obj.messages.all())
        return msgs[-1] if msgs else None

    def get_last_message_preview(self, obj) -> str:
        m = self._last_message(obj)
        if not m:
            return ""
        raw = m.text or strip_tags(m.html)
        return " ".join(raw.split())[:120]

    def get_last_message_has_attachments(self, obj) -> bool:
        m = self._last_message(obj)
        return bool(m and len(m.attachments.all()) > 0)

    def get_student_email(self, obj) -> str:
        return obj.student.email if obj.student_id else ""

    def get_student_name(self, obj) -> str:
        return obj.student.name if obj.student_id else ""


class MessageSerializer(serializers.ModelSerializer):
    html = serializers.SerializerMethodField()
    attachments = MessageAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Message
        fields = [
            "id",
            "direction",
            "from_email",
            "to_email",
            "text",
            "html",
            "is_read",
            "created_at",
            "attachments",
        ]

    def get_html(self, obj) -> str:
        return sanitize_rich_text(obj.html)


class ConversationDetailSerializer(ConversationSerializer):
    messages = MessageSerializer(many=True, read_only=True)

    class Meta(ConversationSerializer.Meta):
        fields = ConversationSerializer.Meta.fields + ["messages"]


class ComposeSerializer(serializers.Serializer):
    to = serializers.EmailField()
    subject = serializers.CharField(max_length=255, allow_blank=True, default="")
    text = serializers.CharField()
    html = serializers.CharField(required=False, allow_blank=True, default="")
    attachment_ids = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)


class ReplySerializer(serializers.Serializer):
    text = serializers.CharField()
    html = serializers.CharField(required=False, allow_blank=True, default="")
    attachment_ids = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)
