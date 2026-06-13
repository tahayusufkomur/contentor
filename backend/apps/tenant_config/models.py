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
    timezone = models.CharField(max_length=50, default="UTC")
    default_locale = models.CharField(
        max_length=2,
        choices=LOCALE_CHOICES,
        default=LOCALE_EN,
        help_text="Default UI language for this tenant. Coach-configurable.",
    )
    onboarding_completed = models.BooleanField(default=False)
    emailcraft_api_key = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        app_label = "tenant_config"

    def __str__(self):
        return self.brand_name
