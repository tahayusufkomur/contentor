from django.db import models


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
    theme = models.CharField(max_length=30, choices=TenantTheme.choices, default=TenantTheme.OCEAN)
    dark_mode_enabled = models.BooleanField(default=True)
    font_family = models.CharField(max_length=100, default="Inter")
    custom_css = models.TextField(blank=True, default="")
    enabled_modules = models.JSONField(default=list)
    social_links = models.JSONField(default=dict)
    meta_description = models.TextField(blank=True, default="")
    navbar_config = models.JSONField(default=dict)
    landing_sections = models.JSONField(default=dict)
    onboarding_completed = models.BooleanField(default=False)

    class Meta:
        app_label = "tenant_config"

    def __str__(self):
        return self.brand_name
