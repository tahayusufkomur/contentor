"""Platform-subscription endpoints (coach-to-Contentor billing).

Mounted at `/api/v1/billing/platform/`. Phase 1 ships:

  - `POST /checkout/` — start a Stripe Checkout session for the active tenant
    (Starter opens as a trial for coaches who signed up without a Free plan).
  - `GET  /subscription/` — return the current PlatformSubscription state, or
    Free if none ("none" for a tenant that needs a plan).
  - `POST /subscription/` — the coach's plan actions: start a trial's plan now,
    cancel, or take a cancel back.

Cancel, portal, invoices land in Phase 2.
"""

from __future__ import annotations

import logging

from django.db import connection, transaction
from django_tenants.utils import schema_context
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.accounts.models import User
from apps.billing.providers import get_provider
from apps.billing.providers.stripe_provider import embedded_fields
from apps.billing.providers.types import ProviderError
from apps.core.constants import CURRENCY_USD, REGION_DEFAULT_LOCALE
from apps.core.currency import currency_for_country
from apps.core.models import Domain, PlatformPlan, PlatformSubscription
from apps.core.monetization import TRIAL_PLAN_NAME, trial_days_for
from apps.core.permissions import IsCoachOrOwner

logger = logging.getLogger(__name__)


def _tenant_origin(tenant) -> str:
    """Return `<scheme>://<tenant primary host>` for the active tenant.

    Scheme is `settings.SITE_SCHEME` (https in prod; http in dev, where Traefik
    has no TLS) so Stripe redirect/return URLs resolve in every environment.
    """
    from django.conf import settings as dj_settings

    scheme = getattr(dj_settings, "SITE_SCHEME", "https")
    primary = Domain.objects.filter(tenant=tenant, is_primary=True).first()
    if primary:
        return f"{scheme}://{primary.domain}"
    # Fallback — build from subdomain (which is what django-tenants installs).
    base = dj_settings.CONTENTOR_DOMAIN
    return f"{scheme}://{tenant.subdomain}.{base}"


def _resolve_locale(user, tenant) -> str:
    """Pick the locale for Stripe Checkout.

    Order: user.preferred_locale -> TenantConfig.default_locale -> region default.
    """
    locale = getattr(user, "preferred_locale", "") or ""
    if locale:
        return locale
    # tenant_config is a tenant-schema app; only readable when the active
    # connection is on the tenant schema. The view runs under tenant context
    # (TenantJWTAuthentication enforces a tenant Host header) so this is safe.
    try:
        from apps.tenant_config.models import TenantConfig

        cfg = TenantConfig.objects.first()
        if cfg and cfg.default_locale:
            return cfg.default_locale
    except Exception:  # noqa: BLE001 — public schema or missing table
        logger.debug("Could not read TenantConfig.default_locale; falling back to region default")
    return REGION_DEFAULT_LOCALE.get(tenant.region, "en")


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def start_checkout(request):
    """Start a Stripe Checkout Session for the active tenant.

    Body: `{plan_id: int}`. Returns `{checkout_url, expires_at, provider}`.

    Persists `tenant.billing_currency` (derived from `tenant.region`) on first
    checkout. Once set the value is immutable (enforced by an existing
    pre_save signal).
    """
    plan_id = request.data.get("plan_id")
    if not plan_id:
        return Response(
            {"error": "PLAN_REQUIRED", "detail": "plan_id is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # The guided /setup flow brings the coach back to itself; nothing else may
    # steer Stripe's redirect (same rule as connect_onboard).
    return_path = request.data.get("return_path")
    if return_path is not None and not str(return_path).startswith("/setup"):
        return Response(
            {"error": "INVALID_RETURN_PATH", "detail": "return_path must be a relative /setup path."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        plan = PlatformPlan.objects.get(pk=plan_id)
    except PlatformPlan.DoesNotExist:
        return Response(
            {"error": "PLAN_NOT_FOUND", "detail": "Plan does not exist."},
            status=status.HTTP_404_NOT_FOUND,
        )

    tenant = connection.tenant
    # Checkout opens a new Stripe subscription: beside a running one (a trial
    # included), both would bill. Plan switches go through support until they
    # change the subscription in place.
    running = PlatformSubscription.objects.filter(
        tenant=tenant,
        provider__in=(PlatformSubscription.PROVIDER_STRIPE, PlatformSubscription.PROVIDER_BYPASS),
        status__in=(
            PlatformSubscription.STATUS_TRIALING,
            PlatformSubscription.STATUS_ACTIVE,
            PlatformSubscription.STATUS_PAST_DUE,
        ),
    )
    if running.exists():
        return Response(
            {"error": "PLAN_RUNNING", "detail": "A plan is already running; contact support to switch plans."},
            status=status.HTTP_409_CONFLICT,
        )

    # Lock billing_currency on first checkout. We do it inside a transaction
    # with select_for_update to prevent two concurrent checkouts racing on the
    # currency assignment.
    with transaction.atomic():
        # connection.tenant is a cached instance; re-fetch with select_for_update.
        from apps.core.models import Tenant

        locked = Tenant.objects.select_for_update().get(pk=tenant.pk)
        if not locked.billing_currency:
            locked.billing_currency = CURRENCY_USD
            locked.save(update_fields=["billing_currency"])
        tenant.billing_currency = locked.billing_currency

    # Confirm a price exists for the resolved currency before hitting Stripe.
    price_entry = (plan.prices or {}).get(tenant.billing_currency, {}) if isinstance(plan.prices, dict) else {}
    if not price_entry.get("stripe_price_id"):
        return Response(
            {"error": "PRICE_NOT_AVAILABLE", "currency": tenant.billing_currency},
            status=status.HTTP_400_BAD_REQUEST,
        )

    origin = _tenant_origin(tenant)
    back = f"{origin}{return_path}" if return_path else f"{origin}/admin/billing"
    sep = "&" if "?" in back else "?"
    success_url = f"{back}{sep}checkout=success"
    cancel_url = f"{back}{sep}checkout=cancel"
    locale = _resolve_locale(request.user, tenant)

    # The plan is the owner's, on their platform account (public schema):
    # request.user is this schema's copy, whose id means someone else there.
    with schema_context("public"):
        account = User.objects.filter(email__iexact=tenant.owner_email).order_by("id").first()

    provider = get_provider()
    try:
        session = provider.create_checkout_session(
            tenant=tenant,
            user=account or request.user,
            plan=plan,
            success_url=success_url,
            cancel_url=cancel_url,
            locale=locale,
            trial_days=trial_days_for(tenant, plan),
        )
    except ProviderError as exc:
        logger.warning(
            "Provider error starting checkout for tenant=%s plan=%s: %s",
            tenant.schema_name,
            plan.pk,
            exc,
        )
        return Response(
            {"error": exc.code, "detail": str(exc)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response(
        {
            "checkout_url": session.url,
            "expires_at": session.expires_at.isoformat(),
            "provider": provider.name,
            **embedded_fields(session.client_secret),
        },
        status=status.HTTP_200_OK,
    )


def _serialize_plan(plan: PlatformPlan | None) -> dict:
    if plan is None:
        return {"id": None, "name": "Free", "is_free": True}
    return {"id": plan.pk, "name": plan.name, "is_free": plan.is_free}


def _trial_offer(tenant) -> dict | None:
    """The trial a checkout would open with right now, for the plan cards."""
    plan = PlatformPlan.objects.filter(name__iexact=TRIAL_PLAN_NAME, is_active=True).first()
    days = trial_days_for(tenant, plan) if plan else 0
    return {"plan_id": plan.pk, "days": days} if days else None


@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def get_subscription(request):
    """Return current PlatformSubscription state for the active tenant.

    Free-tier tenants (no subscription, or canceled) get `{"status": "free"}`;
    a tenant that needs a plan gets `{"status": "none", "paused": …}` instead.
    POST `{action}` applies a plan action first (see `_apply_action`).
    """
    tenant = connection.tenant
    if request.method == "POST":
        error = _apply_action(tenant, request.data.get("action"))
        if error is not None:
            return error
    elif session_id := request.query_params.get("session_id"):
        # Back from Checkout: pull the session ourselves rather than wait on
        # the webhook (it can trail the redirect; dev may get none at all).
        from .webhooks_platform import sync_platform_checkout_session

        if not tenant.is_subscription_active:
            with schema_context("public"):  # where the webhook runs, and the users it names live
                sync_platform_checkout_session(tenant, session_id)
    try:
        sub = PlatformSubscription.objects.get(tenant=tenant)
    except PlatformSubscription.DoesNotExist:
        sub = None

    if sub is None or sub.status == PlatformSubscription.STATUS_CANCELED:
        if tenant.requires_plan:
            return Response(
                {
                    "status": "none",
                    "plan": {"id": None, "name": "", "is_free": False},
                    "currency": tenant.billing_currency,
                    "is_active": False,
                    "paused": tenant.is_paused,
                    "trial": _trial_offer(tenant),
                },
                status=status.HTTP_200_OK,
            )
        # Look up the Free plan by name so the UI can render a name + id.
        from django.conf import settings as dj_settings

        free_name = getattr(dj_settings, "BILLING_FREE_PLAN_NAME", "Free")
        free_plan = PlatformPlan.objects.filter(name=free_name).first()
        return Response(
            {
                "status": "free",
                "plan": _serialize_plan(free_plan or tenant.plan),
                "currency": tenant.billing_currency,
                "is_active": False,
            },
            status=status.HTTP_200_OK,
        )

    return Response(
        {
            "status": sub.status,
            "plan": _serialize_plan(sub.plan),
            "provider": sub.provider,
            "currency": tenant.billing_currency,
            "current_period_start": sub.current_period_start.isoformat() if sub.current_period_start else None,
            "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
            "cancel_at_period_end": sub.cancel_at_period_end,
            "is_active": sub.status in ("trialing", "active", "past_due"),
            "paused": False,
            "trial": None,
        },
        status=status.HTTP_200_OK,
    )


def _apply_action(tenant, action) -> Response | None:
    """ "start_now" ends a trial today (selling opens once the first charge
    goes through), "cancel" ends the plan when its period or trial ends (a
    trial cancelled in time is never charged), "resume" takes a cancel back.
    Returns an error response, or None once applied."""
    from .webhooks_platform import _handle_subscription_event

    if action not in ("start_now", "cancel", "resume"):
        return Response({"error": "INVALID_ACTION"}, status=status.HTTP_400_BAD_REQUEST)
    sub = (
        PlatformSubscription.objects.filter(tenant=tenant, provider__in=("stripe", "bypass"))
        .exclude(status=PlatformSubscription.STATUS_CANCELED)
        .first()
    )
    if sub is None or (action == "start_now" and sub.status != PlatformSubscription.STATUS_TRIALING):
        return Response({"error": "NOT_APPLICABLE"}, status=status.HTTP_409_CONFLICT)
    try:
        updated = get_provider().update_subscription(sub, action)
    except ProviderError as exc:
        logger.warning("plan action %s failed tenant=%s: %s", action, tenant.schema_name, exc)
        return Response({"error": exc.code, "detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    if updated is not None:
        # The webhook brings the same object; syncing now shows it at once.
        _handle_subscription_event({"data": {"object": updated}})
    return None


def _compute_entitlements(tenant) -> dict:
    """Per-feature "does this tenant's plan include it" map for the admin badges.

    Each key mirrors the gate the feature's own page enforces, so the "Paid"
    badge (shown by the frontend when a value is False) never disagrees with the
    paywall the coach actually hits:

      - ``ai_blog`` / ``student_bot`` — a paid plan AND a non-zero monthly quota
        (matches ``blog.ai.availability`` / ``tenant_config.student_bot``).
      - ``site_ai`` — a paid plan AND a non-zero monthly site-edit quota.
      - ``logo_studio`` / ``platform_mailbox`` — ``has_paid_platform_plan``.
      - ``live`` — the live subscription plan's ``is_live_enabled`` flag.
      - ``payouts`` / ``selling`` — ``monetization.is_paid_active`` (paid plan +
        active sub; the gate for reaching Connect onboarding and for selling
        paid content — products, bundles, subscription plans — to students).

    Reads the live ``platform_subscription.plan`` (not the ``Tenant.plan`` FK,
    which is set at signup and is only mirrored by the grant/checkout paths) for
    every plan-quota feature.
    """
    from apps.core.monetization import is_paid_active

    plan = tenant.platform_subscription.plan if tenant.is_subscription_active else None
    paid = tenant.has_paid_platform_plan
    paid_active = is_paid_active(tenant)
    return {
        # Not a feature: lets "selling needs Starter" say "after your trial".
        "trialing": tenant.platform_subscription.status == PlatformSubscription.STATUS_TRIALING if plan else False,
        "live": bool(plan and plan.is_live_enabled),
        "ai_blog": bool(paid and plan and plan.max_ai_blog_posts > 0),
        "site_ai": bool(paid and plan and plan.max_site_ai_updates > 0),
        "student_bot": bool(paid and plan and plan.max_student_bot_questions > 0),
        "logo_studio": paid,
        "platform_mailbox": paid,
        "payouts": paid_active,
        # Selling to students (products / bundles / subscription plans) shares
        # the payouts gate — monetizing requires a paid platform plan.
        "selling": paid_active,
    }


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def get_entitlements(request):
    """Per-feature entitlement map for the active tenant.

    Powers the coach-admin "Paid feature" badges — the frontend renders a badge
    for any feature whose value is ``False`` (the plan does not include it).
    """
    return Response(_compute_entitlements(connection.tenant), status=status.HTTP_200_OK)


_SUPPORTED_CURRENCIES = ("USD", "EUR")


def _build_prices(plan: PlatformPlan) -> dict:
    """Return per-currency price summary for `plan`.

    Shape: `{"USD": {"amount_cents": int|None, "available": bool}, "EUR": {...}}`.
    `available` reflects whether a non-empty `stripe_price_id` is configured —
    the actual id is intentionally NOT exposed (provider details stay server-side).
    """
    raw = plan.prices if isinstance(plan.prices, dict) else {}
    out: dict[str, dict] = {}
    for ccy in _SUPPORTED_CURRENCIES:
        entry = raw.get(ccy) or {}
        out[ccy] = {
            "amount_cents": entry.get("amount_cents"),
            "available": bool(entry.get("stripe_price_id")),
        }
    return out


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def list_plans(request):
    """Public read-only list of platform plans, region-aware.

    Used by the marketing pricing page AND the in-tenant ChangePlanCard to
    render plan tiers. Returns:

      - `region` / `currency` — the viewer's currency (tenant billing currency,
        else guessed from the visitor's country).
      - `plans[]` — each entry has `id`, `name`, `is_free`, the legacy
        flat `currency` / `amount_cents` (marketing page back-compat), a
        full `prices` map keyed by currency, and the four limit fields
        the frontend renders as feature bullets.

    `stripe_price_id` is never returned — only a boolean `available` flag
    per currency.
    """
    # A tenant sees its own (immutable) billing currency; anonymous callers on
    # the marketing apex / wizard get one guessed from Cloudflare's country.
    region = getattr(request, "region", None) or "global"
    tenant = getattr(connection, "tenant", None)
    if tenant is not None and tenant.schema_name != "public" and tenant.billing_currency:
        currency = tenant.billing_currency
    else:
        currency = currency_for_country(request.META.get("HTTP_CF_IPCOUNTRY"))
    plans_qs = PlatformPlan.objects.filter(is_active=True).order_by("price_monthly")
    out = []
    for plan in plans_qs:
        prices = _build_prices(plan)
        default_entry = prices.get(currency, {})
        out.append(
            {
                "id": plan.pk,
                "name": plan.name,
                "is_free": plan.is_free,
                # Back-compat for the marketing pricing page which reads the
                # flat currency + amount_cents at the plan root.
                "currency": currency,
                "amount_cents": default_entry.get("amount_cents"),
                "stripe_price_id_present": default_entry.get("available", False),
                # Full per-currency price map for the in-tenant upgrade card.
                "prices": prices,
                "max_students": plan.max_students,
                "max_storage_gb": plan.max_storage_gb,
                "max_streaming_hours": plan.max_streaming_hours,
                "max_campaign_emails": plan.max_campaign_emails,
                "max_ai_blog_posts": plan.max_ai_blog_posts,
                "transaction_fee_pct": str(plan.transaction_fee_pct),
                "is_live_enabled": plan.is_live_enabled,
            }
        )
    return Response({"region": region, "currency": currency, "plans": out}, status=status.HTTP_200_OK)
