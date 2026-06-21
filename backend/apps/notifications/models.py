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


class Announcement(models.Model):
    STATUS_CHOICES = [("scheduled", "Scheduled"), ("sent", "Sent")]

    title = models.CharField(max_length=200)
    body = models.TextField(blank=True, default="")  # sanitized HTML
    link = models.CharField(max_length=500, blank=True, default="")
    filters_json = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="scheduled")
    scheduled_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    recipient_count = models.PositiveIntegerField(default=0)
    push_sent_count = models.PositiveIntegerField(default=0)

    class Meta:
        app_label = "notifications"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Announcement<{self.pk}:{self.title[:32]}>"


class AnnouncementRecipient(models.Model):
    PUSH_CHOICES = [
        ("none", "None"),
        ("sent", "Sent"),
        ("failed", "Failed"),
        ("expired", "Expired"),
    ]

    announcement = models.ForeignKey(Announcement, on_delete=models.CASCADE, related_name="recipients")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    push_status = models.CharField(max_length=10, choices=PUSH_CHOICES, default="none")
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "notifications"
        unique_together = ("announcement", "user")
