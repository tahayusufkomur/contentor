from rest_framework import serializers


class CreatorSignupSerializer(serializers.Serializer):
    email = serializers.EmailField()
    name = serializers.CharField(max_length=150)
    brand_name = serializers.CharField(max_length=100)
