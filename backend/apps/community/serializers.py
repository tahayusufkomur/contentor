from rest_framework import serializers

from .models import MAX_POST_IMAGES, Comment, CommunitySettings, Post, Report

ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]


class CommunitySettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommunitySettings
        fields = ["is_enabled", "welcome_message", "notify_on_coach_post"]


class CommunitySettingsPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommunitySettings
        fields = ["is_enabled", "welcome_message"]


class MemberSerializer(serializers.Serializer):
    display_name = serializers.CharField(max_length=150, required=False)
    avatar_key = serializers.CharField(max_length=500, required=False, allow_blank=True)
    avatar = serializers.SerializerMethodField(read_only=True)
    joined_at = serializers.DateTimeField(read_only=True)
    is_moderator = serializers.SerializerMethodField(read_only=True)

    def get_avatar(self, member):
        from apps.core.storage import sign_if_s3_key

        return sign_if_s3_key(member.avatar_key) if member.avatar_key else member.avatar_url

    def get_is_moderator(self, member):
        from .permissions import is_moderator

        return is_moderator(member.user)

    def update(self, member, validated_data):
        for field in ("display_name", "avatar_key"):
            if field in validated_data:
                setattr(member, field, validated_data[field])
        member.save(update_fields=["display_name", "avatar_key"])
        return member


class AuthorSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    display_name = serializers.CharField(read_only=True)
    avatar = serializers.SerializerMethodField(read_only=True)
    is_coach = serializers.SerializerMethodField(read_only=True)

    def get_avatar(self, member):
        from apps.core.storage import sign_if_s3_key

        return sign_if_s3_key(member.avatar_key) if member.avatar_key else member.avatar_url

    def get_is_coach(self, member):
        return member.user.role in ("owner", "coach") or member.user.is_staff


class CommunityPresignSerializer(serializers.Serializer):
    filename = serializers.CharField(max_length=255)
    content_type = serializers.ChoiceField(choices=ALLOWED_IMAGE_TYPES)


class PostSerializer(serializers.ModelSerializer):
    author = AuthorSerializer(read_only=True)
    images = serializers.SerializerMethodField()
    my_reaction = serializers.SerializerMethodField()
    body = serializers.CharField(max_length=10000, trim_whitespace=True)
    image_keys = serializers.ListField(
        child=serializers.CharField(max_length=500), max_length=MAX_POST_IMAGES, required=False
    )

    class Meta:
        model = Post
        fields = [
            "id",
            "author",
            "body",
            "image_keys",
            "images",
            "status",
            "is_pinned",
            "comment_count",
            "reaction_count",
            "my_reaction",
            "created_at",
            "edited_at",
        ]
        read_only_fields = ["status", "is_pinned", "comment_count", "reaction_count"]

    def validate_image_keys(self, keys):
        for key in keys:
            if "/community/" not in key:
                raise serializers.ValidationError("Invalid image key.")
        return keys

    def get_images(self, post):
        from apps.core.storage import sign_if_s3_key

        return [sign_if_s3_key(key) for key in post.image_keys]

    def get_my_reaction(self, post):
        return self.context.get("my_reactions", {}).get(post.id)


class CommentSerializer(serializers.ModelSerializer):
    author = AuthorSerializer(read_only=True)
    my_reaction = serializers.SerializerMethodField()
    body = serializers.CharField(max_length=5000, trim_whitespace=True)

    class Meta:
        model = Comment
        fields = ["id", "author", "body", "reaction_count", "my_reaction", "status", "created_at"]
        read_only_fields = ["reaction_count", "status"]

    def get_my_reaction(self, comment):
        return self.context.get("my_comment_reactions", {}).get(comment.id)


class ReportCreateSerializer(serializers.Serializer):
    reason = serializers.ChoiceField(choices=[c[0] for c in Report.REASON_CHOICES])
    detail = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")


class ReportSerializer(serializers.ModelSerializer):
    reporter = serializers.SerializerMethodField()
    target_type = serializers.SerializerMethodField()
    post = PostSerializer(read_only=True)
    comment = CommentSerializer(read_only=True)

    class Meta:
        model = Report
        fields = [
            "id",
            "reason",
            "detail",
            "status",
            "created_at",
            "reporter",
            "target_type",
            "post",
            "comment",
        ]

    def get_reporter(self, report):
        return {"display_name": report.reporter.display_name}

    def get_target_type(self, report):
        return "post" if report.post_id else "comment"


class ModerationMemberSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    display_name = serializers.CharField(read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    joined_at = serializers.DateTimeField(read_only=True)
    is_banned = serializers.BooleanField(read_only=True)
    muted_until = serializers.DateTimeField(read_only=True)
    requires_approval = serializers.BooleanField(read_only=True)
    post_count = serializers.IntegerField(read_only=True)
