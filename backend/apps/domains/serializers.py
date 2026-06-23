from __future__ import annotations

from rest_framework import serializers

from .models import CustomDomain


class DomainResultSerializer(serializers.Serializer):
    domain = serializers.CharField()
    available = serializers.BooleanField()
    price_minor = serializers.IntegerField()
    currency = serializers.CharField()


class CustomDomainSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomDomain
        fields = ["id", "domain", "provisioning_status", "failed_step", "price_minor", "currency", "expires_at", "is_primary"]
