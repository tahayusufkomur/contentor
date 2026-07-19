from django.core.exceptions import ValidationError
from rest_framework import serializers

from apps.core.models import PlatformBlogPost
from apps.core.sanitize import clean_rich_html
from apps.core.storage import generate_presigned_download_url
from apps.media.models import Photo

from .models import BlogAutopilot, BlogPost, BlogTopicIdea
from .placements import inject_placement_images, resolve_placements


def _cover_url(post):
    cover = post.cover_photo
    if cover is None or not cover.s3_key:
        return None
    return generate_presigned_download_url(cover.s3_key)


class BlogPostListSerializer(serializers.ModelSerializer):
    cover_photo_url = serializers.SerializerMethodField()

    class Meta:
        model = BlogPost
        fields = ("slug", "title", "excerpt", "tags", "published_at", "cover_photo_url")

    def get_cover_photo_url(self, obj):
        return _cover_url(obj)


class BlogPostDetailSerializer(serializers.ModelSerializer):
    body_html = serializers.SerializerMethodField()
    cover_photo_url = serializers.SerializerMethodField()

    class Meta:
        model = BlogPost
        fields = (
            "slug",
            "title",
            "excerpt",
            "meta_description",
            "tags",
            "body_html",
            "published_at",
            "cover_photo_url",
        )

    def get_body_html(self, obj):
        return inject_placement_images(obj.body_html, resolve_placements(obj))

    def get_cover_photo_url(self, obj):
        return _cover_url(obj)


class BlogPostAdminSerializer(serializers.ModelSerializer):
    cover_photo = serializers.PrimaryKeyRelatedField(queryset=Photo.objects.all(), allow_null=True, required=False)
    cover_photo_url = serializers.SerializerMethodField()
    image_placements = serializers.JSONField(required=False)
    image_placements_resolved = serializers.SerializerMethodField()

    def validate_body_html(self, value):
        # Trust boundary: coach-authored HTML is sanitized before storage.
        return clean_rich_html(value)

    def get_cover_photo_url(self, obj):
        return _cover_url(obj)

    def get_image_placements_resolved(self, obj):
        return resolve_placements(obj)

    def validate_image_placements(self, value):
        if not isinstance(value, list) or len(value) > 6:
            raise serializers.ValidationError("Expected a list of at most 6 placements.")
        cleaned = []
        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError("Each placement must be an object.")
            photo_id = str(item.get("photo_id", ""))
            try:
                exists = Photo.objects.filter(pk=photo_id).exists()
            except (ValueError, ValidationError):
                exists = False
            if not exists:
                raise serializers.ValidationError(f"Unknown photo_id: {photo_id}")
            cleaned.append({"heading": str(item.get("heading", ""))[:200], "photo_id": photo_id})
        return cleaned

    class Meta:
        model = BlogPost
        fields = (
            "id",
            "slug",
            "title",
            "excerpt",
            "meta_description",
            "tags",
            "body_html",
            "status",
            "source",
            "ai_model",
            "published_at",
            "created_at",
            "updated_at",
            "cover_photo",
            "cover_photo_url",
            "image_placements",
            "image_placements_resolved",
        )
        read_only_fields = (
            "id",
            "source",
            "ai_model",
            "published_at",
            "created_at",
            "updated_at",
            "cover_photo_url",
            "image_placements_resolved",
        )
        extra_kwargs = {"slug": {"required": False}}  # perform_create derives it via unique_slug()


class BlogTopicIdeaSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlogTopicIdea
        fields = ("id", "title", "angle", "status")
        read_only_fields = ("id", "status")


class BlogAutopilotSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlogAutopilot
        fields = (
            "is_enabled",
            "frequency",
            "generate_time",
            "weekday",
            "day_of_month",
            "auto_publish",
            "next_run_at",
        )
        read_only_fields = ("next_run_at",)

    def validate(self, attrs):
        freq = attrs.get("frequency", getattr(self.instance, "frequency", "weekly"))
        if freq == "weekly" and attrs.get("weekday", getattr(self.instance, "weekday", None)) is None:
            raise serializers.ValidationError({"weekday": "required for weekly"})
        if freq == "monthly" and attrs.get("day_of_month", getattr(self.instance, "day_of_month", None)) is None:
            raise serializers.ValidationError({"day_of_month": "required for monthly"})
        return attrs


class PlatformBlogPostSerializer(serializers.ModelSerializer):
    def validate_body_html(self, value):
        # Trust boundary: platform-authored HTML is sanitized before storage.
        return clean_rich_html(value)

    class Meta:
        model = PlatformBlogPost
        fields = (
            "id",
            "slug",
            "title",
            "excerpt",
            "meta_description",
            "tags",
            "body_html",
            "status",
            "source",
            "published_at",
        )
        read_only_fields = ("id", "source", "published_at")
        extra_kwargs = {"slug": {"required": False}}
