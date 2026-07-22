from django.conf import settings
from django.db import models


class CampaignStatus(models.TextChoices):
    SCHEDULED = "scheduled", "Scheduled"
    SENDING = "sending", "Sending"
    SENT = "sent", "Sent"
    PARTIAL = "partial", "Partial"
    FAILED = "failed", "Failed"


class RecipientStatus(models.TextChoices):
    SENT = "sent", "Sent"
    FAILED = "failed", "Failed"


class EmailCampaign(models.Model):
    subject = models.CharField(max_length=255)
    template_id = models.CharField(max_length=255)
    template_name = models.CharField(max_length=255, blank=True, default="")
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="email_campaigns",
    )
    recipient_filter = models.JSONField()
    recipient_count = models.IntegerField(default=0)
    success_count = models.IntegerField(default=0)
    failure_count = models.IntegerField(default=0)
    status = models.CharField(
        max_length=20,
        choices=CampaignStatus.choices,
        default=CampaignStatus.SENDING,
    )
    rendered_html = models.TextField(blank=True, default="")
    recipient_summary = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    # When set, the campaign is queued for a future send: it stays in status
    # SCHEDULED until the beat sweep (dispatch_due_email_campaigns) claims it at
    # scheduled_at. Null = send-now (the historical default).
    scheduled_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "email_campaigns"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.subject} ({self.status})"


class CampaignRecipient(models.Model):
    campaign = models.ForeignKey(
        EmailCampaign,
        on_delete=models.CASCADE,
        related_name="recipients",
    )
    user_id = models.IntegerField()
    user_name = models.CharField(max_length=255)
    user_email = models.EmailField()
    status = models.CharField(
        max_length=20,
        choices=RecipientStatus.choices,
    )
    error_message = models.TextField(blank=True, default="")
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "email_campaigns"

    def __str__(self):
        return f"{self.user_email} — {self.status}"
