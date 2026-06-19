from decimal import Decimal

from rest_framework import serializers

from ..constants import CURRENCY_CHOICES
from ..models import PlatformPlan, Tenant

_VALID_CURRENCIES = {c[0] for c in CURRENCY_CHOICES}


class TenantListSerializer(serializers.ModelSerializer):
    plan_name = serializers.CharField(source="plan.name", default=None)
    subscription_status = serializers.CharField(source="platform_subscription.status", default=None)

    class Meta:
        model = Tenant
        fields = [
            "id",
            "name",
            "slug",
            "owner_email",
            "is_active",
            "provisioning_status",
            "plan_name",
            "subscription_status",
            "stripe_charges_enabled",
            "stripe_payouts_enabled",
            "created_at",
        ]


class TenantDetailSerializer(serializers.ModelSerializer):
    plan_name = serializers.CharField(source="plan.name", default=None)

    class Meta:
        model = Tenant
        fields = [
            "id",
            "name",
            "slug",
            "owner_email",
            "is_active",
            "provisioning_status",
            "plan_name",
            "subdomain",
            "stripe_account_id",
            "stripe_charges_enabled",
            "stripe_payouts_enabled",
            "billing_currency",
            "iyzico_submerchant_id",
            "created_at",
        ]


class PlatformPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlatformPlan
        fields = "__all__"


class PlatformPlanUpdateSerializer(serializers.Serializer):
    """Superadmin-editable fields for a platform plan.

    `name` is intentionally NOT editable: it is the stable key the seed command
    upserts by and the Stripe lookup_key derives from. `amounts` is a per-currency
    map of minor units (USD cents / TRY kuruş), e.g. {"USD": 1990, "TRY": 99900};
    each entry that changes provisions a fresh Stripe Price (grandfathering).
    """

    transaction_fee_pct = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        required=False,
        min_value=Decimal("0"),
        max_value=Decimal("100"),
    )
    max_students = serializers.IntegerField(required=False, min_value=0)
    max_storage_gb = serializers.IntegerField(required=False, min_value=0)
    max_streaming_hours = serializers.IntegerField(required=False, min_value=0)
    max_campaign_emails = serializers.IntegerField(required=False, min_value=0)
    is_live_enabled = serializers.BooleanField(required=False)
    is_active = serializers.BooleanField(required=False)
    amounts = serializers.DictField(child=serializers.IntegerField(min_value=0), required=False)

    def validate_amounts(self, value):
        return _validate_currency_map(value)


class PlatformPlanCreateSerializer(serializers.Serializer):
    """Create a new platform plan (superadmin).

    `name` is the stable key (unique, case-insensitive) the Stripe lookup_key
    derives from, so it's required and immutable afterward. Limits/fee default
    to 0 and `amounts` is optional — a Free-style plan can be created with no
    amounts at all, while paid plans provision a Stripe Price per currency.
    """

    name = serializers.CharField(max_length=50)
    transaction_fee_pct = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        required=False,
        default=Decimal("0"),
        min_value=Decimal("0"),
        max_value=Decimal("100"),
    )
    max_students = serializers.IntegerField(required=False, default=0, min_value=0)
    max_storage_gb = serializers.IntegerField(required=False, default=0, min_value=0)
    max_streaming_hours = serializers.IntegerField(required=False, default=0, min_value=0)
    max_campaign_emails = serializers.IntegerField(required=False, default=0, min_value=0)
    is_live_enabled = serializers.BooleanField(required=False, default=False)
    amounts = serializers.DictField(child=serializers.IntegerField(min_value=0), required=False)

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Name is required.")
        if PlatformPlan.objects.filter(name__iexact=name).exists():
            raise serializers.ValidationError("A plan with this name already exists.")
        return name

    def validate_amounts(self, value):
        return _validate_currency_map(value)


def _validate_currency_map(value):
    invalid = set(value) - _VALID_CURRENCIES
    if invalid:
        raise serializers.ValidationError(
            f"Unsupported currency code(s): {', '.join(sorted(invalid))}. "
            f"Allowed: {', '.join(sorted(_VALID_CURRENCIES))}."
        )
    return value
