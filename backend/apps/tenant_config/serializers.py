from rest_framework import serializers

from apps.core.storage import generate_presigned_download_url

from .models import TenantConfig, TenantTheme


def _sign_if_s3_key(value):
    """Return a presigned URL for S3 keys, or the original value if already HTTP or empty."""
    if not value:
        return value
    if isinstance(value, str) and not value.startswith("http"):
        return generate_presigned_download_url(value)
    return value


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

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Sign logo_url if it's an S3 key
        data["logo_url"] = _sign_if_s3_key(data.get("logo_url"))
        # Sign image URLs inside landing_sections
        sections = data.get("landing_sections")
        if isinstance(sections, dict):
            for section_data in sections.values():
                if isinstance(section_data, dict):
                    for key in ("bg_image_url", "image_url"):
                        if key in section_data:
                            section_data[key] = _sign_if_s3_key(section_data[key])
        return data
