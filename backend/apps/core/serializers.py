from rest_framework import serializers


class CreatorSignupSerializer(serializers.Serializer):
    email = serializers.EmailField()
    name = serializers.CharField(max_length=150)
    brand_name = serializers.CharField(max_length=100)
    about_text = serializers.CharField(required=False, allow_blank=True, default="", max_length=10000)
