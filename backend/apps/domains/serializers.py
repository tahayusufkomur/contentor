from __future__ import annotations

from rest_framework import serializers


class DomainResultSerializer(serializers.Serializer):
    domain = serializers.CharField()
    available = serializers.BooleanField()
    price_minor = serializers.IntegerField()
    currency = serializers.CharField()
