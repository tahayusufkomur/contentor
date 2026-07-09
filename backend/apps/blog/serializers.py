from rest_framework import serializers

from apps.core.models import PlatformBlogPost

from .models import BlogAutopilot, BlogPost, BlogTopicIdea


class BlogPostListSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlogPost
        fields = ("slug", "title", "excerpt", "tags", "published_at")


class BlogPostDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlogPost
        fields = ("slug", "title", "excerpt", "meta_description", "tags", "body_html", "published_at")


class BlogPostAdminSerializer(serializers.ModelSerializer):
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
        )
        read_only_fields = ("id", "source", "ai_model", "published_at", "created_at", "updated_at")
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
