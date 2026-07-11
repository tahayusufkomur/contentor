from rest_framework import serializers

from apps.core.models import PlatformBlogPost
from apps.media.models import Photo

from .images import resolve_cover_photo, resolve_inline_photos, splice_image_placements
from .models import BlogAutopilot, BlogPost, BlogTopicIdea


class BlogPostListSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlogPost
        fields = ("slug", "title", "excerpt", "tags", "published_at")


class BlogPostDetailSerializer(serializers.ModelSerializer):
    cover_photo = serializers.SerializerMethodField()

    class Meta:
        model = BlogPost
        fields = ("slug", "title", "excerpt", "meta_description", "tags", "body_html", "published_at", "cover_photo")

    def get_cover_photo(self, obj):
        return resolve_cover_photo(obj)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.image_placements:
            resolved = resolve_inline_photos(instance.image_placements)
            data["body_html"] = splice_image_placements(instance.body_html, instance.image_placements, resolved)
        return data


class BlogPostAdminSerializer(serializers.ModelSerializer):
    cover_photo = serializers.PrimaryKeyRelatedField(queryset=Photo.objects.all(), required=False, allow_null=True)
    cover_photo_signed_url = serializers.SerializerMethodField()

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
            "cover_photo",
            "cover_photo_signed_url",
            "image_placements",
            "published_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "source",
            "ai_model",
            "cover_photo_signed_url",
            "published_at",
            "created_at",
            "updated_at",
        )
        extra_kwargs = {"slug": {"required": False}}  # perform_create derives it via unique_slug()

    def get_cover_photo_signed_url(self, obj):
        resolved = resolve_cover_photo(obj)
        return resolved["signed_url"] if resolved else None


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
