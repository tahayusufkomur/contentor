from django.conf import settings
from django.db import models


class PushSubscription(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="push_subscriptions",
    )
    endpoint = models.URLField(max_length=500, unique=True)
    p256dh = models.CharField(max_length=255)
    auth = models.CharField(max_length=255)
    user_agent = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "notifications"

    def __str__(self) -> str:
        return f"PushSubscription<{self.user_id}:{self.endpoint[:32]}>"


class LiveReminderLog(models.Model):
    """One row per live event we've already sent a reminder for (dedupe)."""

    key = models.CharField(max_length=120, unique=True)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "notifications"
