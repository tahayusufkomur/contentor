from django.db import models


class TenantConfig(models.Model):
    brand_name = models.CharField(max_length=100)
    logo_url = models.URLField(blank=True, default="")
    primary_color = models.CharField(max_length=7, default="#171717")
    secondary_color = models.CharField(max_length=7, default="#737373")
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
