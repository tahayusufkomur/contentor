from rest_framework import serializers

from .models import CommunitySettings


class CommunitySettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommunitySettings
        fields = ["is_enabled", "welcome_message", "notify_on_coach_post"]


class CommunitySettingsPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommunitySettings
        fields = ["is_enabled", "welcome_message"]
