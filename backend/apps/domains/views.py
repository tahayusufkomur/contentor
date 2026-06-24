from __future__ import annotations

from django.conf import settings
from django.db import connection, transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.billing.providers.types import ProviderError
from apps.core.models import Tenant
from apps.core.permissions import IsCoachOrOwner

from .billing import create_domain_checkout
from .models import CustomDomain, DomainSubscription
from .pricing import compute_price
from .registrar import get_registrar
from .registrar.types import RegistrarError
from .serializers import CustomDomainSerializer, DomainResultSerializer


def _currency(tenant) -> str:
    return getattr(tenant, "billing_currency", "") or settings.DOMAINS_DEFAULT_CURRENCY


def _priced(reg, availability, currency):
    price_minor = 0
    if availability.available:
        cost = reg.get_price(availability.domain)
        price_minor, _fx = compute_price(cost.cost_minor, currency)
    return {
        "domain": availability.domain,
        "available": availability.available,
        "price_minor": price_minor,
        "currency": currency,
    }


def _apex_origin() -> str:
    """Return the apex origin for Stripe redirect URLs."""
    return f"{getattr(settings, 'SITE_SCHEME', 'https')}://{settings.CONTENTOR_DOMAIN}"


def _safe_return_path(raw: str | None) -> str | None:
    """Return a safe relative path (starts with a single '/', no '\\' or '?'), or None."""
    path = (raw or "/dashboard").strip()
    if not path.startswith("/") or path.startswith("//"):
        return None
    if "\\" in path or "?" in path:
        return None
    return path


# ---------------------------------------------------------------------------
# Tenant-agnostic core. These operate on an EXPLICIT tenant and only touch
# public-schema models (CustomDomain, DomainSubscription, core.Domain) plus the
# registrar/billing services, so they work whether the request resolved to the
# tenant schema (tenant-scoped views) or to the public schema (account views).
# ---------------------------------------------------------------------------


def _search_response(tenant, q: str | None) -> Response:
    q = (q or "").strip().lower()
    if not q:
        return Response({"error": "QUERY_REQUIRED", "detail": "q is required."}, status=status.HTTP_400_BAD_REQUEST)
    reg = get_registrar()
    currency = _currency(tenant)
    try:
        primary = reg.check_availability(q)
        results = [_priced(reg, primary, currency)]
        suggestions = [_priced(reg, s, currency) for s in reg.suggest(q)]
    except RegistrarError as exc:
        return Response({"error": exc.code, "detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
    return Response(
        {
            "results": DomainResultSerializer(results, many=True).data,
            "suggestions": DomainResultSerializer(suggestions, many=True).data,
        }
    )


def _checkout_response(tenant, user, data) -> Response:
    domain = (data.get("domain") or "").strip().lower()
    if not domain:
        return Response(
            {"error": "DOMAIN_REQUIRED", "detail": "domain is required."}, status=status.HTTP_400_BAD_REQUEST
        )

    return_path = _safe_return_path(data.get("return_path"))
    if return_path is None:
        return Response(
            {"error": "BAD_RETURN_PATH", "detail": "return_path must be a relative path."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    reg = get_registrar()
    try:
        if not reg.check_availability(domain).available:
            return Response(
                {"error": "UNAVAILABLE", "detail": "Domain is not available."}, status=status.HTTP_409_CONFLICT
            )
        cost = reg.get_price(domain)
    except RegistrarError as exc:
        return Response({"error": exc.code, "detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

    currency = _currency(tenant)
    price_minor, fx = compute_price(cost.cost_minor, currency)
    contact = data.get("contact") or {"Email": getattr(user, "email", "")}

    with transaction.atomic():
        cd = CustomDomain.objects.create(
            tenant=tenant,
            domain=domain,
            cost_minor=cost.cost_minor,
            price_minor=price_minor,
            currency=currency,
            fx_rate=fx,
            contact=contact,
            forward_to_email=getattr(user, "email", ""),
            provisioning_status="pending",
        )
        DomainSubscription.objects.create(tenant=tenant, custom_domain=cd, status="incomplete")

    apex = _apex_origin()
    success = f"{apex}{return_path}"
    cancel = f"{apex}{return_path}?canceled=1"
    try:
        session = create_domain_checkout(
            tenant=tenant, user=user, custom_domain=cd, success_url=success, cancel_url=cancel
        )
    except ProviderError as exc:
        cd.delete()  # roll back the orphaned domain (cascades to DomainSubscription)
        return Response({"error": exc.code, "detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

    return Response({"checkout_url": session.url, "custom_domain_id": cd.id})


def _current_response(tenant) -> Response:
    cd = CustomDomain.objects.filter(tenant=tenant).order_by("-created_at").first()
    return Response({"custom_domain": CustomDomainSerializer(cd).data if cd else None})


def _retry_response(tenant, pk: int) -> Response:
    cd = CustomDomain.objects.filter(tenant=tenant, pk=pk).first()
    if cd is None:
        return Response({"error": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
    if cd.provisioning_status != "failed":
        return Response(
            {"error": "NOT_FAILED", "detail": "Only failed domains can retry."}, status=status.HTTP_409_CONFLICT
        )
    from .tasks import provision_domain

    provision_domain.delay(cd.id)
    return Response({"custom_domain": CustomDomainSerializer(cd).data})


def _destroy_response(tenant, pk: int) -> Response:
    from apps.core.models import Domain

    cd = CustomDomain.objects.filter(tenant=tenant, pk=pk).first()
    if cd is None:
        return Response({"error": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
    Domain.objects.filter(domain=cd.domain, tenant=tenant).delete()
    cd.provisioning_status = "lapsed"
    cd.save(update_fields=["provisioning_status", "updated_at"])
    # Best-effort Stripe cancellation.
    sub = getattr(cd, "subscription", None)
    if sub and sub.provider_subscription_id and not settings.DOMAINS_BYPASS_ENABLED:
        try:
            import stripe

            stripe.api_key = settings.STRIPE_SECRET_KEY
            stripe.Subscription.delete(sub.provider_subscription_id)
        except Exception:  # noqa: BLE001, S110 — teardown is best-effort
            pass
    return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Tenant-scoped views (resolve the tenant from the request schema). Mounted at
# /api/v1/domains/* — used when the request already runs in a tenant context.
# ---------------------------------------------------------------------------


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def search(request):
    return _search_response(connection.tenant, request.query_params.get("q"))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def checkout(request):
    return _checkout_response(connection.tenant, request.user, request.data)


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def current(request):
    return _current_response(connection.tenant)


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def retry(request, pk: int):
    return _retry_response(connection.tenant, pk)


@api_view(["DELETE"])
@permission_classes([IsCoachOrOwner])
def destroy(request, pk: int):
    return _destroy_response(connection.tenant, pk)


# ---------------------------------------------------------------------------
# Account-scoped views. Mounted under /api/v1/me/tenants/<slug>/domain/* and
# served in the PUBLIC schema, so the coach's apex (public) JWT authenticates.
# The target tenant is resolved by slug + owner_email (same ownership model as
# apps.core.me), NOT from the request schema.
# ---------------------------------------------------------------------------


def _owned_tenant(request, slug: str):
    """Resolve a tenant the requesting user owns (by email), or None."""
    email = (getattr(request.user, "email", "") or "").lower()
    if not email:
        return None
    try:
        return Tenant.objects.exclude(schema_name="public").get(slug=slug, owner_email__iexact=email)
    except Tenant.DoesNotExist:
        return None


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def account_search(request, slug):
    tenant = _owned_tenant(request, slug)
    if tenant is None:
        return Response({"error": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
    return _search_response(tenant, request.query_params.get("q"))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def account_checkout(request, slug):
    tenant = _owned_tenant(request, slug)
    if tenant is None:
        return Response({"error": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
    return _checkout_response(tenant, request.user, request.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def account_current(request, slug):
    tenant = _owned_tenant(request, slug)
    if tenant is None:
        return Response({"error": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
    return _current_response(tenant)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def account_retry(request, slug, pk: int):
    tenant = _owned_tenant(request, slug)
    if tenant is None:
        return Response({"error": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
    return _retry_response(tenant, pk)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def account_destroy(request, slug, pk: int):
    tenant = _owned_tenant(request, slug)
    if tenant is None:
        return Response({"error": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
    return _destroy_response(tenant, pk)
