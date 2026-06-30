from django.conf import settings
from django.db import models


class Conversation(models.Model):
    subject = models.CharField(max_length=255, blank=True, default="")
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="mailbox_conversations",
    )
    counterparty_email = models.EmailField()
    counterparty_name = models.CharField(max_length=255, blank=True, default="")
    last_message_at = models.DateTimeField(null=True, blank=True)
    unread_count = models.IntegerField(default=0)
    is_archived = models.BooleanField(default=False)
    is_spam = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "mailbox"
        ordering = ["-last_message_at", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["counterparty_email"],
                condition=models.Q(is_archived=False),
                name="uniq_open_conversation_per_counterparty",
            )
        ]

    def __str__(self) -> str:
        return f"Conversation<{self.id}:{self.counterparty_email}>"


class Message(models.Model):
    DIRECTION_CHOICES = [("inbound", "Inbound"), ("outbound", "Outbound")]

    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="messages"
    )
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    from_email = models.EmailField()
    to_email = models.EmailField()
    text = models.TextField(blank=True, default="")
    html = models.TextField(blank=True, default="")
    message_id = models.CharField(max_length=255, blank=True, default="", db_index=True)
    in_reply_to = models.CharField(max_length=255, blank=True, default="")
    references = models.TextField(blank=True, default="")
    provider_id = models.CharField(max_length=255, blank=True, default="")
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "mailbox"
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"Message<{self.id}:{self.direction}>"
