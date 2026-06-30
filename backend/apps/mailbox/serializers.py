from rest_framework import serializers

from .models import Conversation, Message


class ConversationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Conversation
        fields = [
            "id",
            "subject",
            "counterparty_email",
            "counterparty_name",
            "student",
            "last_message_at",
            "unread_count",
            "is_archived",
            "is_spam",
        ]


class MessageSerializer(serializers.ModelSerializer):
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
        ]


class ConversationDetailSerializer(ConversationSerializer):
    messages = MessageSerializer(many=True, read_only=True)

    class Meta(ConversationSerializer.Meta):
        fields = ConversationSerializer.Meta.fields + ["messages"]


class ComposeSerializer(serializers.Serializer):
    to = serializers.EmailField()
    subject = serializers.CharField(max_length=255, allow_blank=True, default="")
    text = serializers.CharField()


class ReplySerializer(serializers.Serializer):
    text = serializers.CharField()
