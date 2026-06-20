from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "name", "avatar_url", "role", "is_superuser", "date_joined"]
        read_only_fields = ["id", "email", "role", "is_superuser", "date_joined"]


class StudentListSerializer(serializers.ModelSerializer):
    enrolled_count = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "name",
            "avatar_url",
            "role",
            "date_joined",
            "last_login",
            "enrolled_count",
            "last_display_mode",
            "last_platform",
        ]
        read_only_fields = fields

    def get_enrolled_count(self, obj):
        return obj.enrollments.count()


class MagicLinkRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class MagicLinkVerifySerializer(serializers.Serializer):
    token = serializers.CharField()
