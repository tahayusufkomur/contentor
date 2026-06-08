from decimal import Decimal

from django.db.models import Sum
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .models import PlatformPlan, Tenant, TenantUsage
from .permissions import IsSuperUser
from .serializers_platform import (
    PlatformPlanCreateSerializer,
    PlatformPlanSerializer,
    PlatformPlanUpdateSerializer,
    TenantDetailSerializer,
    TenantListSerializer,
)
from .stripe_pricing import provision_stripe_price

_PLAN_SCALAR_FIELDS = (
    "transaction_fee_pct",
    "max_students",
    "max_storage_gb",
    "max_streaming_hours",
    "max_campaign_emails",
    "is_live_enabled",
)


def _apply_amounts(plan, amounts, update_fields):
    """Provision a fresh Stripe Price per changed currency and re-point `plan`.

    Grandfathering (D1): existing subscribers keep their old Price; only the
    plan's pointer moves. When Stripe is unconfigured (dev/CI) the helper
    returns "" and we preserve any prior id rather than blanking it.
    """
    prices = dict(plan.prices or {})
    plan_key = plan.name.lower()
    for currency, amount_cents in amounts.items():
        new_price_id = provision_stripe_price(plan_key=plan_key, currency=currency, amount_cents=amount_cents)
        entry = dict(prices.get(currency) or {})
        entry["amount_cents"] = amount_cents
        if new_price_id:
            entry["stripe_price_id"] = new_price_id
        else:
            entry.setdefault("stripe_price_id", "")
        prices[currency] = entry
        # Keep the legacy USD fallback (price_monthly, in whole units) in sync.
        if currency == "USD":
            plan.price_monthly = Decimal(amount_cents) / 100
            update_fields.add("price_monthly")
    plan.prices = prices
    update_fields.add("prices")


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
    tenants = Tenant.objects.exclude(schema_name="public").select_related("plan").order_by("-created_at")
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


@api_view(["GET", "POST"])
@permission_classes([IsSuperUser])
def platform_plans(request):
    """List all plans (including archived) or create a new one.

    POST creates a plan with limits/fee and optional per-currency `amounts`;
    each amount provisions a Stripe Price. The public pricing list filters to
    `is_active=True`, so a freshly created plan is live immediately.
    """
    if request.method == "POST":
        serializer = PlatformPlanCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        amounts = data.pop("amounts", None)

        plan = PlatformPlan(
            name=data["name"],
            price_monthly=Decimal("0"),
            transaction_fee_pct=data["transaction_fee_pct"],
            max_students=data["max_students"],
            max_storage_gb=data["max_storage_gb"],
            max_streaming_hours=data["max_streaming_hours"],
            max_campaign_emails=data["max_campaign_emails"],
            is_live_enabled=data["is_live_enabled"],
        )
        if amounts:
            _apply_amounts(plan, amounts, set())
        plan.save()
        return Response(PlatformPlanSerializer(plan).data, status=status.HTTP_201_CREATED)

    plans = PlatformPlan.objects.all().order_by("price_monthly")
    serializer = PlatformPlanSerializer(plans, many=True)
    return Response(serializer.data)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsSuperUser])
def platform_plan_detail(request, pk):
    """Superadmin read/edit/archive of a single platform plan.

    PATCH edits limits, the transaction fee, the live toggle, `is_active`, and
    per-currency amounts. Changing an amount provisions a *new* Stripe Price and
    re-points the plan; existing subscribers keep their old Price (grandfathered)
    — see `apps.core.stripe_pricing`.

    DELETE archives the plan (soft — `is_active=False`); the Tenant.plan FK is
    PROTECT, so archiving is refused while tenants still reference it (409).
    """
    plan = get_object_or_404(PlatformPlan, pk=pk)
    if request.method == "GET":
        return Response(PlatformPlanSerializer(plan).data)

    if request.method == "DELETE":
        return _archive_plan(plan)

    serializer = PlatformPlanUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    update_fields: set[str] = set()

    # Archiving (is_active → False) is guarded the same way as DELETE.
    if "is_active" in data and not data["is_active"] and plan.is_active:
        return _archive_plan(plan)
    if "is_active" in data:
        plan.is_active = data["is_active"]
        update_fields.add("is_active")

    for field in _PLAN_SCALAR_FIELDS:
        if field in data:
            setattr(plan, field, data[field])
            update_fields.add(field)

    amounts = data.get("amounts")
    if amounts and not plan.is_free:
        _apply_amounts(plan, amounts, update_fields)

    if update_fields:
        plan.save(update_fields=list(update_fields))

    return Response(PlatformPlanSerializer(plan).data)


def _archive_plan(plan):
    """Soft-archive a plan, refusing if tenants still reference it (PROTECT FK)."""
    if plan.tenants.exists():
        return Response(
            {
                "detail": "Cannot archive a plan while tenants are still on it. "
                "Migrate those tenants to another plan first."
            },
            status=status.HTTP_409_CONFLICT,
        )
    if plan.is_active:
        plan.is_active = False
        plan.save(update_fields=["is_active"])
    return Response(PlatformPlanSerializer(plan).data)
