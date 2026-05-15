"""Serializers for the platform-subscription endpoints.

Kept intentionally lightweight — these are read-only response shapes for the
Subscription tile and the checkout-redirect response.
"""

from __future__ import annotations

from rest_framework import serializers


class PlatformPlanBriefSerializer(serializers.Serializer):
    """Minimal plan representation used inside the subscription endpoint."""

    id = serializers.IntegerField()
    name = serializers.CharField()
    is_free = serializers.BooleanField()


class CheckoutResponseSerializer(serializers.Serializer):
    """Shape of POST /api/v1/billing/platform/checkout/ success response."""

    checkout_url = serializers.URLField()
    expires_at = serializers.DateTimeField()
    provider = serializers.CharField()


class SubscriptionStateSerializer(serializers.Serializer):
    """Shape of GET /api/v1/billing/platform/subscription/."""

    status = serializers.CharField()
    plan = PlatformPlanBriefSerializer()
    provider = serializers.CharField(required=False, allow_blank=True)
    currency = serializers.CharField(required=False, allow_blank=True)
    current_period_start = serializers.DateTimeField(required=False, allow_null=True)
    current_period_end = serializers.DateTimeField(required=False, allow_null=True)
    cancel_at_period_end = serializers.BooleanField(required=False)
    is_active = serializers.BooleanField()
