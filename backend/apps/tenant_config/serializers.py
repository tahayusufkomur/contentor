from rest_framework import serializers

from .models import TenantConfig


class TenantConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = TenantConfig
        fields = [
            "id",
            "brand_name",
            "logo_url",
            "primary_color",
            "secondary_color",
            "font_family",
            "custom_css",
            "enabled_modules",
            "social_links",
            "meta_description",
            "navbar_config",
            "landing_sections",
            "onboarding_completed",
        ]
