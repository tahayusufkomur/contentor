from rest_framework import serializers
from .models import Tenant, PlatformPlan, TenantUsage


class TenantListSerializer(serializers.ModelSerializer):
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
            "iyzico_submerchant_id",
            "created_at",
        ]


class PlatformPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlatformPlan
        fields = "__all__"
