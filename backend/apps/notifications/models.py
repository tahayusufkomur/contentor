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
    also_email = models.BooleanField(default=False)
    recurrence = models.ForeignKey(
        "RecurringAnnouncement", on_delete=models.SET_NULL, null=True, blank=True, related_name="instances"
    )

    class Meta:
        app_label = "notifications"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Announcement<{self.pk}:{self.title[:32]}>"


class RecurringAnnouncement(models.Model):
    """A rule that spawns ordinary Announcements on a simple repeating schedule."""

    FREQ = [("daily", "Daily"), ("weekly", "Weekly"), ("monthly", "Monthly")]

    title = models.CharField(max_length=200)
    body = models.TextField(blank=True, default="")
    link = models.CharField(max_length=500, blank=True, default="")
    link_label = models.CharField(max_length=200, blank=True, default="")
    filters_json = models.JSONField(default=dict, blank=True)
    also_email = models.BooleanField(default=False)
    frequency = models.CharField(max_length=10, choices=FREQ)
    send_time = models.TimeField()
    weekday = models.SmallIntegerField(null=True, blank=True)  # 0=Mon..6=Sun (weekly)
    day_of_month = models.SmallIntegerField(null=True, blank=True)  # 1..31 (monthly)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)  # null = "until I stop"
    next_run_at = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "notifications"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"RecurringAnnouncement<{self.pk}:{self.title[:24]}:{self.frequency}>"


class AnnouncementRecipient(models.Model):
    PUSH_CHOICES = [
        ("none", "None"),
        ("sent", "Sent"),
        ("failed", "Failed"),
        ("expired", "Expired"),
    ]
    EMAIL_CHOICES = [
        ("none", "None"),
        ("sent", "Sent"),
        ("failed", "Failed"),
    ]

    announcement = models.ForeignKey(Announcement, on_delete=models.CASCADE, related_name="recipients")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    push_status = models.CharField(max_length=10, choices=PUSH_CHOICES, default="none")
    email_status = models.CharField(max_length=10, choices=EMAIL_CHOICES, default="none")
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "notifications"
        unique_together = ("announcement", "user")


class AnnouncementTemplate(models.Model):
    """A coach-saved reusable announcement (custom templates only; built-ins
    live in code in templates_builtin.py)."""

    name = models.CharField(max_length=120)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True, default="")
    link = models.CharField(max_length=500, blank=True, default="")
    link_label = models.CharField(max_length=200, blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "notifications"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"AnnouncementTemplate<{self.pk}:{self.name}>"


class EmailOptOut(models.Model):
    """A student who has opted out of announcement emails (per-tenant)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True, related_name="+"
    )
    email = models.CharField(max_length=254, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "notifications"

    def __str__(self) -> str:
        return f"EmailOptOut<{self.email}>"
