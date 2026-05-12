from django.db import connection
from rest_framework import serializers

from apps.core.storage import generate_presigned_download_url, sign_if_s3_key

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
            "logo_id",
            "theme",
            "dark_mode_enabled",
            "font_family",
            "custom_css",
            "enabled_modules",
            "social_links",
            "meta_description",
            "navbar_config",
            "landing_sections",
            "timezone",
            "onboarding_completed",
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Prefer logo FK over logo_url string
        if instance.logo_id and instance.logo and instance.logo.s3_key:
            data["logo_url"] = generate_presigned_download_url(instance.logo.s3_key)
        else:
            data["logo_url"] = sign_if_s3_key(data.get("logo_url"))
        # Sign image URLs inside landing_sections and resolve photo IDs
        sections = data.get("landing_sections")
        if isinstance(sections, dict):
            self._sign_landing_section_photos(sections)
        # Tenant metadata — read directly from the active tenant row so the
        # frontend knows whether to render the demo banner without a second
        # round-trip.
        tenant = getattr(connection, "tenant", None)
        if tenant is not None:
            slug = tenant.slug or ""
            data["is_demo"] = bool(getattr(tenant, "is_demo", False))
            data["tenant_name"] = tenant.name
            data["tenant_slug"] = slug
            data["demo_niche"] = slug[len("demo-"):] if slug.startswith("demo-") else ""
        return data

    def _sign_landing_section_photos(self, sections):
        from apps.media.models import Photo

        # Collect all photo IDs for bulk query
        photo_ids = []
        for section_data in sections.values():
            if isinstance(section_data, dict):
                for key in ("bg_image_photo_id", "image_photo_id"):
                    pid = section_data.get(key)
                    if pid:
                        photo_ids.append(pid)

        # Bulk fetch photos
        photo_map = {}
        if photo_ids:
            for photo in Photo.objects.filter(pk__in=photo_ids):
                photo_map[str(photo.pk)] = photo

        # Sign URLs and resolve photo IDs
        for section_data in sections.values():
            if isinstance(section_data, dict):
                # Sign legacy string URLs
                for key in ("bg_image_url", "image_url"):
                    if key in section_data:
                        section_data[key] = sign_if_s3_key(section_data[key])
                # Override with Photo FK if present
                for photo_key, url_key in (
                    ("bg_image_photo_id", "bg_image_url"),
                    ("image_photo_id", "image_url"),
                ):
                    pid = section_data.get(photo_key)
                    if pid and str(pid) in photo_map:
                        photo = photo_map[str(pid)]
                        section_data[url_key] = generate_presigned_download_url(photo.s3_key)
