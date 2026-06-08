"""Coach payout onboarding via Stripe Connect (Phase B).

Mounted at `/api/v1/billing/connect/`:
  - `POST /onboard/` — create (if needed) the tenant's Express account and
    return a Stripe-hosted onboarding URL.
  - `GET  /status/`  — report Connect readiness (charges/payouts enabled) and
    whether the tenant may monetize at all (D4 gate).

Both run under tenant context (the coach app sends a tenant Host header, so
`TenantJWTAuthentication` resolves the tenant and `connection.tenant` is set).
Onboarding is gated by `is_paid_active` — Free tenants can never reach it.
"""

from __future__ import annotations

import logging

from django.db import connection
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.billing.providers import connect
from apps.billing.providers.types import ProviderError
from apps.core.monetization import can_monetize, is_paid_active
from apps.core.permissions import IsOwner

from .platform import _tenant_origin

logger = logging.getLogger(__name__)


@api_view(["POST"])
@permission_classes([IsOwner])
def connect_onboard(request):
    """Start (or resume) Stripe Connect Express onboarding for the active tenant.

    Returns `{onboarding_url}`. Refused (402) for Free / inactive tenants — they
    must upgrade to a paid plan first (D4).
    """
    tenant = connection.tenant

    if not is_paid_active(tenant):
        return Response(
            {
                "error": "UPGRADE_REQUIRED",
                "detail": "Connect onboarding requires an active paid plan. Upgrade to start selling.",
            },
            status=status.HTTP_402_PAYMENT_REQUIRED,
        )

    try:
        account_id = tenant.stripe_account_id
        if not account_id:
            account_id = connect.create_express_account(tenant=tenant, business_url=_tenant_origin(tenant))
            # Persist on the public-schema Tenant row.
            from apps.core.models import Tenant

            Tenant.objects.filter(pk=tenant.pk).update(stripe_account_id=account_id)
            tenant.stripe_account_id = account_id

        origin = _tenant_origin(tenant)
        onboarding_url = connect.create_account_link(
            account_id=account_id,
            refresh_url=f"{origin}/admin/payouts?connect=refresh",
            return_url=f"{origin}/admin/payouts?connect=return",
        )
    except ProviderError as exc:
        return Response(
            {"error": exc.code, "detail": str(exc)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response({"onboarding_url": onboarding_url}, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsOwner])
def connect_dashboard(request):
    """Return a single-use login link to the tenant's Express payouts dashboard."""
    tenant = connection.tenant
    if not tenant.stripe_account_id:
        return Response(
            {"error": "NOT_CONNECTED", "detail": "No connected account yet."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        url = connect.create_dashboard_link(account_id=tenant.stripe_account_id)
    except ProviderError as exc:
        return Response({"error": exc.code, "detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"dashboard_url": url}, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsOwner])
def connect_status(request):
    """Report the active tenant's Connect readiness and monetization eligibility.

    `charges_enabled`/`payouts_enabled` are read from the persisted (webhook-fed)
    Tenant fields. When `?refresh=1` is passed and the tenant has an account, we
    also re-fetch live from Stripe and persist — useful right after the coach
    returns from the onboarding flow, before the `account.updated` webhook lands.
    """
    tenant = connection.tenant
    account_id = tenant.stripe_account_id

    if account_id and request.query_params.get("refresh"):
        try:
            live = connect.retrieve_account_status(account_id=account_id)
            from apps.core.models import Tenant

            Tenant.objects.filter(pk=tenant.pk).update(
                stripe_charges_enabled=live.charges_enabled,
                stripe_payouts_enabled=live.payouts_enabled,
            )
            tenant.stripe_charges_enabled = live.charges_enabled
            tenant.stripe_payouts_enabled = live.payouts_enabled
        except ProviderError:
            logger.warning("connect_status refresh failed for tenant=%s", tenant.pk)

    return Response(
        {
            "connected": bool(account_id),
            "charges_enabled": bool(tenant.stripe_charges_enabled),
            "payouts_enabled": bool(tenant.stripe_payouts_enabled),
            "is_paid_active": is_paid_active(tenant),
            "can_monetize": can_monetize(tenant),
        },
        status=status.HTTP_200_OK,
    )
