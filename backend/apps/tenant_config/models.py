from django.db import models

from apps.core.constants import LOCALE_CHOICES, LOCALE_EN


class TenantTheme(models.TextChoices):
    OCEAN = "ocean", "Ocean"
    EMBER = "ember", "Ember"
    FOREST = "forest", "Forest"
    SUNSET = "sunset", "Sunset"
    VIOLET = "violet", "Violet"
    SLATE = "slate", "Slate"


class TenantConfig(models.Model):
    brand_name = models.CharField(max_length=100)
    logo_url = models.CharField(max_length=2000, blank=True, default="")
    logo = models.ForeignKey("media.Photo", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    # Square mark exported by the Logo Studio — drives favicon / PWA icons.
    # Mirrors the logo/logo_url pair: FK preferred, raw URL as fallback.
    icon = models.ForeignKey("media.Photo", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    icon_url = models.CharField(max_length=2000, blank=True, default="")
    # Logo Studio composer state (versioned; see TenantConfigSerializer
    # .validate_logo_recipe for the shape). Empty dict = no studio design.
    logo_recipe = models.JSONField(default=dict, blank=True)
    theme = models.CharField(max_length=30, choices=TenantTheme.choices, default=TenantTheme.OCEAN)
    dark_mode_enabled = models.BooleanField(default=True)
    font_family = models.CharField(max_length=100, default="Inter")
    custom_css = models.TextField(blank=True, default="")
    enabled_modules = models.JSONField(default=list)
    social_links = models.JSONField(default=dict)
    meta_description = models.TextField(blank=True, default="")
    navbar_config = models.JSONField(default=dict)
    # Legacy single-page landing config. Superseded by ``pages`` (the website
    # builder); kept populated as a backfill source / safety net. Drop in a
    # later migration once ``pages`` is proven in production.
    landing_sections = models.JSONField(default=dict)
    # Website-builder content: a dict keyed by page (home/about/courses/
    # pricing/faq/contact), each an ordered list of theme-locked blocks. See
    # apps.tenant_config.defaults for the catalog and conversion helpers.
    pages = models.JSONField(default=dict, blank=True)
    # Coach-saved page templates ("my templates"): a list of
    # ``{id, name, category, blocks: [...]}`` the coach can re-apply to any
    # page. Built-in starter templates live in the frontend; only the coach's
    # own saved ones persist here. Same block shape + validation as ``pages``.
    page_templates = models.JSONField(default=list, blank=True)
    timezone = models.CharField(max_length=50, default="UTC")
    default_locale = models.CharField(
        max_length=2,
        choices=LOCALE_CHOICES,
        default=LOCALE_EN,
        help_text="Default UI language for this tenant. Coach-configurable.",
    )
    onboarding_completed = models.BooleanField(default=False)
    setup_guide_dismissed = models.BooleanField(default=False)
    # Setup Assistant state: {"pages_edited": [...], "look_edited": bool,
    # "manual": {item_key: True}}. Auto-detection is append-only.
    setup_progress = models.JSONField(default=dict, blank=True)
    emailcraft_api_key = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        app_label = "tenant_config"

    def __str__(self):
        return self.brand_name


class SeededObject(models.Model):
    """Registry of objects created by the template seeder for this tenant.

    Powers the "Demo" badges and the "Remove demo content" action. The
    fingerprint answers "has the coach touched this?" without adding
    updated_at columns across five apps.
    """

    content_type = models.ForeignKey("contenttypes.ContentType", on_delete=models.CASCADE, related_name="+")
    object_id = models.CharField(max_length=64)  # str(pk); works for int and UUID pks
    fingerprint = models.CharField(max_length=64)
    niche = models.CharField(max_length=64, blank=True, default="")
    seeded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "tenant_config"
        unique_together = [("content_type", "object_id")]

    def __str__(self):
        return f"{self.content_type.model}:{self.object_id}"


class AssistantConfig(models.Model):
    """Singleton (pk=1) per tenant: the coach's student-facing site assistant.
    OFF by default — the bot speaks in the coach's brand voice, so enabling it
    is a conscious coach action (spec D2)."""

    enabled = models.BooleanField(default=False)
    greeting = models.CharField(max_length=200, blank=True, default="")
    suggested_questions = models.JSONField(default=list, blank=True)  # ≤3 strings ≤80 chars (validated in the API)
    human_handoff_enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "tenant_config"

    def __str__(self):
        return f"AssistantConfig(enabled={self.enabled})"

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class AssistantKnowledgeEntry(models.Model):
    """Coach-authored knowledge for THEIR student assistant — injected into the
    site_knowledge data block, never interpreted as instructions."""

    MAX_ENTRIES = 50
    MAX_CONTENT_CHARS = 1500

    title = models.CharField(max_length=120)
    content = models.TextField()
    enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "tenant_config"
        ordering = ["-updated_at"]

    def __str__(self):
        return self.title


class AssistantLink(models.Model):
    """Coach-approved links the site assistant may offer (v2 spec §9).
    External https URLs allowed (D4) — the coach already controls every
    link on their own site; widgets still hard-validate against the
    status endpoint's whitelist."""

    MAX_LINKS = 20

    label = models.CharField(max_length=60)
    url = models.CharField(max_length=500)
    note = models.CharField(max_length=160, blank=True, default="")
    enabled = models.BooleanField(default=True)
    position = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "tenant_config"
        ordering = ["position", "id"]

    def __str__(self):
        return self.label
