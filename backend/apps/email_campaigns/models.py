from django.conf import settings
from django.db import models


class CampaignStatus(models.TextChoices):
    SENDING = "sending", "Sending"
    SENT = "sent", "Sent"
    PARTIAL = "partial", "Partial"
    FAILED = "failed", "Failed"


class EmailCampaign(models.Model):
    subject = models.CharField(max_length=255)
    template_id = models.CharField(max_length=255)
    template_name = models.CharField(max_length=255, blank=True, default="")
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
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
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "email_campaigns"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.subject} ({self.status})"
