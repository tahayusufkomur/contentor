"""Wizard-token custom-domain endpoints (pre-auth onboarding).

Auth model mirrors apps.core.onboarding.wizard: no JWT exists yet, so the
wizard token travels in the request BODY (never the URL) and every view here
MUST keep @authentication_classes([]) (project rule). The tenant row already
exists during the wizard, so these views reuse the tenant-agnostic core of
views.py with the wizard's own success/cancel URLs — the coach never leaves
the onboarding flow except for the Stripe hop itself.
"""

from __future__ import annotations

import logging

from django.conf import settings
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import CustomDomain
from .serializers import CustomDomainSerializer
from .views import _checkout_response, _search_response

logger = logging.getLogger(__name__)


def _resolve(request):
    """(payload, tenant, error_response) from the body token. Local import —
    apps.core.onboarding.wizard pulls in billing providers at module load."""
    from apps.core.onboarding.wizard import _resolve_tenant_from_wizard_token

    return _resolve_tenant_from_wizard_token(request)


def _coach_user(payload, tenant):
    """Get-or-create the REAL coach User row, exactly like wizard_checkout —
    same (email, region) key provision_tenant later reuses, so provisioning
    just picks this row up. The row supplies the registrant fallback email
    and forward_to_email on the CustomDomain."""
    from apps.accounts.models import User
    from apps.core.constants import REGION_DEFAULT_LOCALE

    region = tenant.region or "global"
    user, _ = User.objects.get_or_create(
        email=payload["email"],
        region=region,
        defaults={
            "name": payload.get("name", ""),
            "role": "coach",
            "preferred_locale": REGION_DEFAULT_LOCALE.get(region, "en"),
            "accessible_regions": [],
        },
    )
    return user


def _current(tenant) -> Response:
    cd = (
        CustomDomain.objects.filter(tenant=tenant)
        .exclude(provisioning_status="lapsed")
        .order_by("-created_at")
        .first()
    )
    return Response({"custom_domain": CustomDomainSerializer(cd).data if cd else None})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_domain_search(request):
    """Availability search. POST (not GET) so the token stays out of logs."""
    payload, tenant, err = _resolve(request)
    if err is not None:
        return err
    return _search_response(tenant, request.data.get("q"))


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_domain_checkout(request):
    """Start the domain purchase from inside the wizard. Success/cancel land
    back on /signup/verify on the SAME host the wizard runs on (tr. locale
    included) — the stashed localStorage token is per-origin, so returning to
    the apex from a tr. wizard would strand the coach."""
    payload, tenant, err = _resolve(request)
    if err is not None:
        return err

    # A canceled checkout leaves an unpaid husk behind (pending row, sub still
    # "incomplete") that would collide with the domain-unique constraint on a
    # retry — clear those; refuse only when a real purchase exists. If a stale
    # husk's Stripe session is somehow still open in another tab, its webhook
    # resolves no CustomDomain and is dropped — same orphan the dashboard
    # cancel path already tolerates.
    existing = CustomDomain.objects.filter(tenant=tenant).exclude(provisioning_status="lapsed")
    husks = existing.filter(provisioning_status="pending", subscription__status="incomplete")
    if existing.exclude(pk__in=husks.values("pk")).exists():
        return Response({"error": "ALREADY_PURCHASED", "detail": "This site already has a custom domain."}, status=409)
    husks.delete()

    user = _coach_user(payload, tenant)
    scheme = "https" if request.is_secure() else "http"
    origin = f"{scheme}://{request.get_host()}"
    return _checkout_response(
        tenant,
        user,
        request.data,
        success_url=f"{origin}/signup/verify",
        cancel_url=f"{origin}/signup/verify?domain_canceled=1",
    )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_domain_sync(request):
    """Return-from-checkout probe + status read, one shape for both. With a
    `session_id` we activate the purchase server-side instead of waiting for
    the webhook (local dev receives none; prod's can trail the redirect).
    With a `custom_domain_id` under DOMAINS_BYPASS_ENABLED we activate the
    bypass "purchase" directly — there is no Stripe session to retrieve.
    With neither, this is a plain read of the current domain."""
    payload, tenant, err = _resolve(request)
    if err is not None:
        return err

    session_id = request.data.get("session_id")
    bypass_id = request.data.get("custom_domain_id")
    if settings.DOMAINS_BYPASS_ENABLED and bypass_id:
        from .webhooks import activate_domain_checkout

        cd = CustomDomain.objects.filter(tenant=tenant, pk=bypass_id, provisioning_status="pending").first()
        if cd is not None:
            activate_domain_checkout(cd)
            logger.info("wizard domain bypass activated slug=%s domain=%s", tenant.slug, cd.domain)
    elif isinstance(session_id, str) and session_id.strip():
        from .webhooks import sync_domain_checkout_session

        if sync_domain_checkout_session(tenant, session_id.strip()):
            logger.info("wizard domain checkout synced slug=%s", tenant.slug)
    return _current(tenant)
