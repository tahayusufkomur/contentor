from rest_framework import serializers

from .models import CommunitySettings

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
