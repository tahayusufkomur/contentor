from rest_framework import serializers

from .models import TenantConfig, TenantTheme


class TenantConfigSerializer(serializers.ModelSerializer):
    def validate_theme(self, value):
        if value not in TenantTheme.values:
            raise serializers.ValidationError("Theme must be one of the curated theme IDs.")
        return value

    class Meta:
        model = TenantConfig
        fields = [
            "id",
            "brand_name",
            "logo_url",
            "theme",
            "dark_mode_enabled",
            "font_family",
            "custom_css",
            "enabled_modules",
            "social_links",
            "meta_description",
            "navbar_config",
            "landing_sections",
            "onboarding_completed",
        ]
