import logging
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_tenants.utils import tenant_context
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core import assistant

from ..currency import tenant_charge_currency
from ..models import (
    AiConversation,
    AiTranscript,
    BlogAiUsage,
    HelpBotUsage,
    LogoAiUsage,
    PlatformPlan,
    PlatformSubscription,
    StudentBotUsage,
    Tenant,
    TenantUsage,
    WebhookEvent,
)
from ..permissions import IsSuperUser
from ..stripe_pricing import apply_amounts as _apply_amounts
from .serializers import (
    PlatformPlanCreateSerializer,
    PlatformPlanSerializer,
    PlatformPlanUpdateSerializer,
    TenantDetailSerializer,
    TenantListSerializer,
)

logger = logging.getLogger(__name__)

_PLAN_SCALAR_FIELDS = (
    "transaction_fee_pct",
    "max_students",
    "max_storage_gb",
    "max_streaming_hours",
    "max_campaign_emails",
    "is_live_enabled",
)


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


@api_view(["GET"])
@permission_classes([IsSuperUser])
def platform_usage(request):
    """Platform-wide PWA-adoption rollup across all active tenants.

    Iterates tenant schemas — fine at the current fleet size, same approach as
    `_marketplace_totals`; revisit with a nightly rollup table if tenant count
    grows. Per tenant: count last-`days` UsageEvent rows by mode + students with
    a recorded first PWA load. A broken schema is skipped, never 500s the page.
    """
    try:
        days = int(request.query_params.get("days", 30))
    except (TypeError, ValueError):
        days = 30
    days = max(1, min(days, 365))
    cutoff = timezone.now().date() - timedelta(days=days - 1)

    tenants = Tenant.objects.exclude(schema_name="public").filter(is_active=True)
    total_pwa = 0
    total_browser = 0
    total_installed = 0
    by_tenant = []
    for tenant in tenants:
        try:
            with tenant_context(tenant):
                from apps.accounts.models import User
                from apps.usage.models import UsageEvent

                totals = UsageEvent.objects.filter(day__gte=cutoff).aggregate(
                    pwa=Count("id", filter=Q(mode="pwa")),
                    browser=Count("id", filter=Q(mode="browser")),
                )
                pwa = totals["pwa"] or 0
                browser = totals["browser"] or 0
                installed = User.objects.filter(role="student", first_pwa_at__isnull=False).count()
        except Exception:  # noqa: BLE001, S112 — a broken schema must not take down the dashboard
            logger.warning("platform usage: skipping tenant %s", tenant.slug, exc_info=True)
            continue

        total_pwa += pwa
        total_browser += browser
        total_installed += installed
        if pwa or browser or installed:
            sessions = pwa + browser
            by_tenant.append(
                {
                    "tenant": tenant.name,
                    "slug": tenant.slug,
                    "installed": installed,
                    "pwa_sessions": pwa,
                    "browser_sessions": browser,
                    "pwa_pct": round(pwa / sessions * 100) if sessions else 0,
                }
            )

    by_tenant.sort(key=lambda r: (r["installed"], r["pwa_sessions"]), reverse=True)
    grand_total = total_pwa + total_browser
    return Response(
        {
            "installed_students": total_installed,
            "pwa_sessions": total_pwa,
            "browser_sessions": total_browser,
            "pwa_pct": round(total_pwa / grand_total * 100) if grand_total else 0,
            "by_tenant": by_tenant,
        }
    )


def _ai_feature_rollups(month):
    """Per-feature spend/count + kill-switch flag for one "YYYY-MM" month.

    Each feature has its own global-monthly-USD cap (env-configured); the
    kill-switch trips once cumulative spend for the month reaches that cap,
    mirroring the runtime check each feature's own view makes before calling
    the provider.
    """
    specs = [
        ("help_bot", "Help bot", HelpBotUsage, "questions", settings.HELP_BOT_GLOBAL_MONTHLY_USD),
        ("student_bot", "Student assistant", StudentBotUsage, "questions", settings.STUDENT_BOT_GLOBAL_MONTHLY_USD),
        ("blog_ai", "Blog AI", BlogAiUsage, "generations_used", settings.BLOG_AI_MONTHLY_BUDGET_USD),
        ("brand_pack", "Brand Pack", LogoAiUsage, "packs_used", settings.LOGO_AI_MONTHLY_BUDGET_USD),
    ]
    features = []
    for key, label, model, count_field, cap in specs:
        agg = model.objects.filter(month=month).aggregate(c=Sum(count_field), usd=Sum("usd_spent"))
        spent = agg["usd"] or Decimal("0")
        features.append(
            {
                "key": key,
                "label": label,
                "count": agg["c"] or 0,
                "usd_spent": str(spent),
                "usd_cap": float(cap),
                "kill_switch_tripped": spent >= Decimal(str(cap)),
            }
        )
    return features


@api_view(["GET"])
@permission_classes([IsSuperUser])
def platform_ai_usage(request):
    """Cross-feature AI spend/usage rollup for the superadmin dashboard.

    Aggregates the four AI usage meters (help bot, student assistant, blog
    AI, Brand Pack) for one month, plus top-10 tenants by combined spend, a
    rating breakdown, and a 7-day daily-question sparkline sourced from
    ``AiTranscript``. Preview transcripts (``is_preview=True`` — coach
    testing, not real usage) are excluded from the ratings and daily-question
    aggregates.
    """
    month = request.query_params.get("month") or timezone.now().strftime("%Y-%m")
    features = _ai_feature_rollups(month)

    per_tenant: dict[str, dict] = {}
    for model in (HelpBotUsage, StudentBotUsage, BlogAiUsage, LogoAiUsage):
        for row in model.objects.filter(month=month).values("tenant_schema").annotate(usd=Sum("usd_spent")):
            bucket = per_tenant.setdefault(row["tenant_schema"], {"usd": Decimal("0"), "count": 0})
            bucket["usd"] = bucket["usd"] + (row["usd"] or Decimal("0"))

    tx_month = AiTranscript.objects.filter(
        created_at__year=int(month[:4]),
        created_at__month=int(month[5:7]),
        is_preview=False,
    )
    for row in tx_month.values("tenant_schema").annotate(c=Count("id")):
        per_tenant.setdefault(row["tenant_schema"], {"usd": Decimal("0"), "count": 0})["count"] = row["c"]

    top = sorted(per_tenant.items(), key=lambda kv: kv[1]["usd"], reverse=True)[:10]

    ratings = {
        "up": tx_month.filter(rating="up").count(),
        "down": tx_month.filter(rating="down").count(),
        "unrated": tx_month.filter(rating="").count(),
    }
    week_ago = timezone.now() - timedelta(days=7)
    daily = [
        {"date": str(row["d"]), "count": row["c"]}
        for row in AiTranscript.objects.filter(created_at__gte=week_ago, is_preview=False)
        .annotate(d=TruncDate("created_at"))
        .values("d")
        .annotate(c=Count("id"))
        .order_by("d")
    ]
    return Response(
        {
            "month": month,
            "features": features,
            "top_tenants": [{"tenant_schema": k, "usd_spent": str(v["usd"]), "count": v["count"]} for k, v in top],
            "ratings": ratings,
            "daily_questions": daily,
        }
    )


# ── Superadmin AI-conversation console (/api/v1/platform/ai-conversations/…) ─
# help_bot conversations only (coach + marketing/visitor audience) — student-
# tenant chats are explicitly out of scope for superadmins (spec D6).

PLATFORM_AGENT_LABEL = "Contentor support"
_CONVO_PAGE = 20


def _help_conversation(pk):
    return AiConversation.objects.filter(pk=pk, feature="help_bot").first()


def _platform_conversation_row(c):
    last = c.messages.exclude(role="system").order_by("-id").first()
    return {
        "id": c.id,
        "session_id": c.session_id,
        "audience": c.audience,
        "tenant_schema": c.tenant_schema,
        "status": c.status,
        "user_label": c.user_label,
        "human_requested": c.human_requested,
        "message_count": c.message_count,
        "last_message": (last.content[:140] if last else ""),
        "updated_at": c.updated_at,
    }


@api_view(["GET"])
@permission_classes([IsSuperUser])
def platform_ai_conversations(request):
    qs = AiConversation.objects.filter(feature="help_bot")
    audience = request.query_params.get("audience")
    if audience in ("coach", "visitor"):
        qs = qs.filter(audience=audience)
    tenant = request.query_params.get("tenant")
    if tenant:
        qs = qs.filter(tenant_schema=tenant)
    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except ValueError:
        page = 1
    qs = qs.annotate(message_count=Count("messages")).order_by("-updated_at")
    start = (page - 1) * _CONVO_PAGE
    rows = list(qs[start : start + _CONVO_PAGE + 1])
    return Response(
        {"results": [_platform_conversation_row(c) for c in rows[:_CONVO_PAGE]], "has_more": len(rows) > _CONVO_PAGE}
    )


def _platform_int_param(request, name, source=None):
    try:
        return int((source or request.query_params).get(name) or 0)
    except (TypeError, ValueError):
        return 0


@api_view(["GET"])
@permission_classes([IsSuperUser])
def platform_ai_conversation_thread(request, pk):
    convo = _help_conversation(pk)
    if convo is None:
        return Response(status=404)
    convo = assistant.maybe_auto_release(convo)
    return Response(assistant.thread_payload(convo, after_id=_platform_int_param(request, "after")))


@api_view(["POST"])
@permission_classes([IsSuperUser])
def platform_ai_conversation_takeover(request, pk):
    convo = _help_conversation(pk)
    if convo is None:
        return Response(status=404)
    convo = assistant.maybe_auto_release(convo)
    if convo.status == AiConversation.STATUS_HUMAN:
        return Response({"error": "already_taken_over"}, status=409)
    convo.status = AiConversation.STATUS_HUMAN
    convo.agent_user_id = request.user.id
    convo.agent_label = PLATFORM_AGENT_LABEL
    convo.taken_over_at = timezone.now()
    convo.human_requested = False
    convo.save(
        update_fields=["status", "agent_user_id", "agent_label", "taken_over_at", "human_requested", "updated_at"]
    )
    assistant.append_message(convo, "system", f"agent_joined:{PLATFORM_AGENT_LABEL}")
    return Response(assistant.thread_payload(convo))


@api_view(["POST"])
@permission_classes([IsSuperUser])
def platform_ai_conversation_message(request, pk):
    convo = _help_conversation(pk)
    if convo is None:
        return Response(status=404)
    data = request.data if isinstance(request.data, dict) else {}
    content = str(data.get("content") or "").strip()[:2000]
    if not content:
        return Response({"error": "empty message"}, status=400)
    convo = assistant.maybe_auto_release(convo)
    if convo.status != AiConversation.STATUS_HUMAN:
        return Response({"error": "not_taken_over"}, status=403)
    assistant.append_message(convo, "agent", content)
    return Response(assistant.thread_payload(convo, after_id=_platform_int_param(request, "after", data)))


@api_view(["POST"])
@permission_classes([IsSuperUser])
def platform_ai_conversation_release(request, pk):
    convo = _help_conversation(pk)
    if convo is None:
        return Response(status=404)
    if convo.status == AiConversation.STATUS_HUMAN:
        convo.status = AiConversation.STATUS_AI
        convo.save(update_fields=["status", "updated_at"])
        assistant.append_message(convo, "system", "assistant_resumed")
    return Response(assistant.thread_payload(convo))
