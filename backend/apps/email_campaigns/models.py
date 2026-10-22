from django.conf import settings
from django.db import models


class CampaignStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    SCHEDULED = "scheduled", "Scheduled"
    SENDING = "sending", "Sending"
    SENT = "sent", "Sent"
    PARTIAL = "partial", "Partial"
    FAILED = "failed", "Failed"


class RecipientStatus(models.TextChoices):
    SENT = "sent", "Sent"
    FAILED = "failed", "Failed"


class TemplateCategory(models.TextChoices):
    NEWSLETTER = "newsletter", "Newsletter"
    LAUNCH = "launch", "Launch"
    EVENT = "event", "Class or event"
    NOTE = "note", "Personal note"
    OFFER = "offer", "Offer"
    WELCOME = "welcome", "Welcome"
    OTHER = "other", "Other"


class TemplateSource(models.TextChoices):
    STARTER = "starter", "Made at setup"
    DESIGNER = "designer", "Designed by the Designer"
    COACH = "coach", "Her own"
    IMPORTED = "imported", "Imported from MailCraft"


class EmailTemplate(models.Model):
    """A design she starts emails from (apps.email_campaigns.render draws it). An email made from one
    keeps its own copy, so editing a template never changes what was sent."""

    name = models.CharField(max_length=120)
    category = models.CharField(max_length=20, choices=TemplateCategory.choices, default=TemplateCategory.OTHER)
    design = models.JSONField(default=dict)
    subject = models.CharField(max_length=255, blank=True, default="")
    preheader = models.CharField(max_length=255, blank=True, default="")
    source = models.CharField(max_length=20, choices=TemplateSource.choices, default=TemplateSource.COACH)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "email_campaigns"
        ordering = ["-updated_at"]

    def __str__(self):
        return self.name


class EmailCampaign(models.Model):
    """An email to her students: a draft she is writing, then the record of its send."""

    subject = models.CharField(max_length=255, blank=True, default="")
    preheader = models.CharField(max_length=255, blank=True, default="")
    design = models.JSONField(default=dict, blank=True)
    template = models.ForeignKey(
        EmailTemplate, on_delete=models.SET_NULL, null=True, blank=True, related_name="campaigns"
    )
    # MailCraft's template id, on campaigns sent before the engine moved in.
    mailcraft_template_id = models.CharField(max_length=255, blank=True, default="")
    template_name = models.CharField(max_length=255, blank=True, default="")
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="email_campaigns",
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


class EmailDesignJob(models.Model):
    """The Designer at work on one email or template (apps.email_campaigns.designer): the editor
    follows its step line and takes the design when it is done."""

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        WORKING = "working", "Working"
        DONE = "done", "Done"
        FAILED = "failed", "Failed"

    campaign = models.ForeignKey(EmailCampaign, on_delete=models.CASCADE, null=True, blank=True, related_name="+")
    template = models.ForeignKey(EmailTemplate, on_delete=models.CASCADE, null=True, blank=True, related_name="+")
    mode = models.CharField(max_length=10, default="new")  # new | edit
    brief = models.TextField()
    block_id = models.CharField(max_length=64, blank=True, default="")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.QUEUED)
    step = models.CharField(max_length=200, blank=True, default="")
    warnings = models.JSONField(default=list, blank=True)
    error = models.CharField(max_length=500, blank=True, default="")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "email_campaigns"
        ordering = ["-created_at"]
