import logging
from collections import defaultdict
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from django_tenants.utils import tenant_context
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .currency import tenant_charge_currency
from .models import PlatformPlan, PlatformSubscription, Tenant, TenantUsage, WebhookEvent
from .permissions import IsSuperUser
from .serializers_platform import (
    PlatformPlanCreateSerializer,
    PlatformPlanSerializer,
    PlatformPlanUpdateSerializer,
    TenantDetailSerializer,
    TenantListSerializer,
)
from .stripe_pricing import provision_stripe_price

logger = logging.getLogger(__name__)

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


def _platform_mrr():
    """Active coach subscriptions: count + monthly recurring revenue by currency.

    Each tenant is billed in its charge currency; the amount comes from the
    plan's per-currency price (legacy USD fallback)."""
    subs = (
        PlatformSubscription.objects.filter(status=PlatformSubscription.STATUS_ACTIVE)
        .exclude(tenant__schema_name="public")
        .select_related("plan", "tenant")
    )
    mrr: dict[str, Decimal] = defaultdict(Decimal)
    for sub in subs:
        currency = tenant_charge_currency(sub.tenant)
        entry = sub.plan.get_price(currency) or sub.plan.get_price("USD")
        if entry:
            mrr[currency if sub.plan.get_price(currency) else "USD"] += Decimal(entry["amount_cents"]) / 100
    return {
        "active_subscriptions": subs.count(),
        "mrr_by_currency": {k: str(v.quantize(Decimal("0.01"))) for k, v in mrr.items()},
    }


def _marketplace_totals(tenants=None):
    """Aggregate student→coach payments across tenant schemas.

    Sums gross volume and the platform's application-fee cut per currency,
    excluding the coaches' own platform-subscription payments. Iterates the
    tenant schemas — fine at the current fleet size; revisit with a rollup
    table if tenant count grows large.
    """
    if tenants is None:
        tenants = Tenant.objects.exclude(schema_name="public").filter(is_active=True)
    gross: dict[str, Decimal] = defaultdict(Decimal)
    fees: dict[str, Decimal] = defaultdict(Decimal)
    payment_count = 0
    for tenant in tenants:
        try:
            with tenant_context(tenant):
                from apps.billing.models import Payment

                rows = (
                    Payment.objects.filter(
                        status__in=("completed", "partially_refunded"),
                        platform_subscription__isnull=True,
                    )
                    .values("currency")
                    .annotate(gross=Sum("amount"), fees=Sum("platform_fee"), n=Count("id"))
                )
                for row in rows:
                    cur = (row["currency"] or "USD").upper()
                    gross[cur] += row["gross"] or Decimal("0")
                    fees[cur] += row["fees"] or Decimal("0")
                    payment_count += row["n"]
        except Exception:  # noqa: BLE001, S112 — a broken schema must not take down the dashboard
            logger.warning("marketplace totals: skipping tenant %s", tenant.slug, exc_info=True)
            continue
    return {
        "gross_by_currency": {k: str(v) for k, v in gross.items()},
        "fees_by_currency": {k: str(v) for k, v in fees.items()},
        "payment_count": payment_count,
    }


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
    plan_distribution = list(
        tenants.values("plan__name").annotate(count=Count("id")).order_by("-count").values_list("plan__name", "count")
    )
    recent = tenants.select_related("plan").order_by("-created_at")[:5]
    webhook_failures = WebhookEvent.objects.filter(~Q(processing_error="")).count()
    return Response(
        {
            "total_tenants": total,
            "active_tenants": active,
            "total_students": usage["total_students"] or 0,
            "total_storage_bytes": usage["total_storage"] or 0,
            "monetization_ready_tenants": tenants.filter(stripe_charges_enabled=True).count(),
            "plan_distribution": [{"plan": name or "None", "count": count} for name, count in plan_distribution],
            "platform_subscriptions": _platform_mrr(),
            "marketplace": _marketplace_totals(),
            "webhook_failures": webhook_failures,
            "recent_tenants": [
                {
                    "name": t.name,
                    "slug": t.slug,
                    "plan_name": t.plan.name if t.plan else None,
                    "provisioning_status": t.provisioning_status,
                    "is_active": t.is_active,
                    "created_at": t.created_at,
                }
                for t in recent
            ],
        }
    )


@api_view(["GET"])
@permission_classes([IsSuperUser])
def platform_tenants(request):
    tenants = (
        Tenant.objects.exclude(schema_name="public")
        .select_related("plan", "platform_subscription")
        .order_by("-created_at")
    )
    q = (request.query_params.get("q") or "").strip()
    if q:
        tenants = tenants.filter(Q(name__icontains=q) | Q(slug__icontains=q) | Q(owner_email__icontains=q))
    serializer = TenantListSerializer(tenants, many=True)
    return Response(serializer.data)


def _tenant_detail_payload(tenant):
    data = TenantDetailSerializer(tenant).data
    sub = PlatformSubscription.objects.filter(tenant=tenant).select_related("plan").first()
    data["platform_subscription"] = (
        {
            "plan": sub.plan.name,
            "status": sub.status,
            "provider": sub.provider,
            "cancel_at_period_end": sub.cancel_at_period_end,
            "current_period_end": sub.current_period_end,
        }
        if sub
        else None
    )
    usage = TenantUsage.objects.filter(tenant=tenant).order_by("-month").first()
    data["usage"] = (
        {
            "month": usage.month,
            "student_count": usage.student_count,
            "storage_bytes": usage.storage_bytes,
            "streaming_minutes": usage.streaming_minutes,
            "emails_sent": usage.emails_sent,
        }
        if usage
        else None
    )
    data["marketplace"] = _marketplace_totals([tenant])
    return data


@api_view(["GET", "PATCH"])
@permission_classes([IsSuperUser])
def platform_tenant_detail(request, slug):
    tenant = get_object_or_404(Tenant, slug=slug)
    if request.method == "PATCH" and "is_active" in request.data:
        tenant.is_active = request.data["is_active"]
        tenant.save(update_fields=["is_active"])
    return Response(_tenant_detail_payload(tenant))


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


@api_view(["GET"])
@permission_classes([IsSuperUser])
def platform_subscriptions(request):
    """All coach→platform subscriptions, for the superadmin billing page."""
    subs = (
        PlatformSubscription.objects.exclude(tenant__schema_name="public")
        .select_related("tenant", "plan")
        .order_by("-created_at")
    )
    out = []
    for sub in subs:
        currency = tenant_charge_currency(sub.tenant)
        entry = sub.plan.get_price(currency) or sub.plan.get_price("USD") or {}
        out.append(
            {
                "id": sub.pk,
                "tenant_name": sub.tenant.name,
                "tenant_slug": sub.tenant.slug,
                "plan": sub.plan.name,
                "status": sub.status,
                "provider": sub.provider,
                "amount": str((Decimal(entry.get("amount_cents", 0)) / 100).quantize(Decimal("0.01"))),
                "currency": currency if sub.plan.get_price(currency) else "USD",
                "cancel_at_period_end": sub.cancel_at_period_end,
                "current_period_end": sub.current_period_end,
                "created_at": sub.created_at,
            }
        )
    return Response(out)


@api_view(["GET"])
@permission_classes([IsSuperUser])
def platform_webhook_events(request):
    """Recent provider webhook events for ops debugging.

    `?status=failed` filters to events with a processing error; `?status=pending`
    to received-but-unprocessed ones. `?event_type=` substring-filters the type.
    """
    events = WebhookEvent.objects.order_by("-received_at")
    status_filter = request.query_params.get("status") or ""
    if status_filter == "failed":
        events = events.filter(~Q(processing_error=""))
    elif status_filter == "pending":
        events = events.filter(processed_at__isnull=True)
    event_type = (request.query_params.get("event_type") or "").strip()
    if event_type:
        events = events.filter(event_type__icontains=event_type)
    try:
        limit = min(int(request.query_params.get("limit", 100)), 500)
    except ValueError:
        limit = 100
    return Response(
        [
            {
                "id": e.pk,
                "provider": e.provider,
                "provider_event_id": e.provider_event_id,
                "event_type": e.event_type,
                "received_at": e.received_at,
                "processed_at": e.processed_at,
                "processing_error": e.processing_error,
            }
            for e in events[:limit]
        ]
    )


@api_view(["GET"])
@permission_classes([IsSuperUser])
def platform_webhook_event_detail(request, pk):
    """Full webhook event including the raw payload."""
    event = get_object_or_404(WebhookEvent, pk=pk)
    return Response(
        {
            "id": event.pk,
            "provider": event.provider,
            "provider_event_id": event.provider_event_id,
            "event_type": event.event_type,
            "received_at": event.received_at,
            "processed_at": event.processed_at,
            "processing_error": event.processing_error,
            "payload": event.payload,
        }
    )
