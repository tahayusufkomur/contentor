"""Platform-level email campaigns (public schema).

Mirrors `apps.email_campaigns` but lives in the public schema so a superadmin
can email coaches/platform users. Designs render on the same engine
(apps.email_campaigns.render) in Contentor's own brand kit.
"""

from django.conf import settings
from django.db import models

# Reuse the coach feature's status enums verbatim — same lifecycle.
from apps.email_campaigns.models import CampaignStatus, RecipientStatus

__all__ = [
    "CampaignStatus",
    "RecipientStatus",
    "PlatformEmailConfig",
    "PlatformEmailTemplate",
    "PlatformEmailCampaign",
    "PlatformCampaignRecipient",
]


class PlatformEmailConfig(models.Model):
    """Singleton holding the platform's MailCraft organization API key. Read only by
    import_mailcraft_templates now; dropped once that has run on prod."""

    emailcraft_api_key = models.CharField(max_length=255, blank=True, default="")
    emailcraft_org_id = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "platform_email"

    def __str__(self):
        return "Platform email config"

    @classmethod
    def load(cls) -> "PlatformEmailConfig":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class PlatformEmailTemplate(models.Model):
    """A design the superadmin starts emails from."""

    name = models.CharField(max_length=120)
    design = models.JSONField(default=dict)
    subject = models.CharField(max_length=255, blank=True, default="")
    preheader = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "platform_email"
        ordering = ["-updated_at"]

    def __str__(self):
        return self.name


class PlatformEmailCampaign(models.Model):
    subject = models.CharField(max_length=255, blank=True, default="")
    preheader = models.CharField(max_length=255, blank=True, default="")
    design = models.JSONField(default=dict, blank=True)
    # MailCraft's template id, on campaigns sent before the engine moved in.
    mailcraft_template_id = models.CharField(max_length=255, blank=True, default="")
    template_name = models.CharField(max_length=255, blank=True, default="")
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="platform_email_campaigns",
    )
    recipient_filter = models.JSONField(default=dict, blank=True)
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
    updated_at = models.DateTimeField(auto_now=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "platform_email"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.subject} ({self.status})"


class PlatformCampaignRecipient(models.Model):
    campaign = models.ForeignKey(
        PlatformEmailCampaign,
        on_delete=models.CASCADE,
        related_name="recipients",
    )
    user_id = models.IntegerField()
    user_name = models.CharField(max_length=255)
    user_email = models.EmailField()
    status = models.CharField(max_length=20, choices=RecipientStatus.choices)
    error_message = models.TextField(blank=True, default="")
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "platform_email"

    def __str__(self):
        return f"{self.user_email} — {self.status}"
