from django.db.models import Sum
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .models import Tenant, PlatformPlan, TenantUsage
from .permissions import IsSuperUser
from .serializers_platform import (
    TenantListSerializer,
    TenantDetailSerializer,
    PlatformPlanSerializer,
)


@api_view(["GET"])
@permission_classes([IsSuperUser])
def platform_dashboard(request):
    tenants = Tenant.objects.exclude(schema_name="public")
    active = tenants.filter(is_active=True).count()
    total = tenants.count()
    usage = TenantUsage.objects.aggregate(
        total_students=Sum("student_count"),
        total_storage=Sum("storage_bytes"),
    )
    return Response(
        {
            "total_tenants": total,
            "active_tenants": active,
            "total_students": usage["total_students"] or 0,
            "total_storage_bytes": usage["total_storage"] or 0,
        }
    )


@api_view(["GET"])
@permission_classes([IsSuperUser])
def platform_tenants(request):
    tenants = (
        Tenant.objects.exclude(schema_name="public")
        .select_related("plan")
        .order_by("-created_at")
    )
    serializer = TenantListSerializer(tenants, many=True)
    return Response(serializer.data)


@api_view(["GET", "PATCH"])
@permission_classes([IsSuperUser])
def platform_tenant_detail(request, slug):
    tenant = get_object_or_404(Tenant, slug=slug)
    if request.method == "PATCH":
        if "is_active" in request.data:
            tenant.is_active = request.data["is_active"]
            tenant.save(update_fields=["is_active"])
        serializer = TenantDetailSerializer(tenant)
        return Response(serializer.data)
    serializer = TenantDetailSerializer(tenant)
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsSuperUser])
def platform_plans(request):
    plans = PlatformPlan.objects.all().order_by("price_monthly")
    serializer = PlatformPlanSerializer(plans, many=True)
    return Response(serializer.data)
