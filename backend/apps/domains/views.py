from __future__ import annotations

from django.conf import settings
from django.db import connection, transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.billing.providers.types import ProviderError
from apps.core.permissions import IsCoachOrOwner

from .billing import create_domain_checkout
from .models import CustomDomain, DomainSubscription
from .pricing import compute_price
from .registrar import get_registrar
from .registrar.types import RegistrarError
from .serializers import DomainResultSerializer


def _currency() -> str:
    tenant = connection.tenant
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


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def search(request):
    q = (request.query_params.get("q") or "").strip().lower()
    if not q:
        return Response({"error": "QUERY_REQUIRED", "detail": "q is required."}, status=status.HTTP_400_BAD_REQUEST)
    reg = get_registrar()
    currency = _currency()
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


def _origin(request) -> str:
    scheme = "https" if request.is_secure() else "http"
    return f"{scheme}://{request.get_host()}"


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def checkout(request):
    domain = (request.data.get("domain") or "").strip().lower()
    if not domain:
        return Response(
            {"error": "DOMAIN_REQUIRED", "detail": "domain is required."}, status=status.HTTP_400_BAD_REQUEST
        )

    tenant = connection.tenant
    reg = get_registrar()
    try:
        if not reg.check_availability(domain).available:
            return Response(
                {"error": "UNAVAILABLE", "detail": "Domain is not available."}, status=status.HTTP_409_CONFLICT
            )
        cost = reg.get_price(domain)
    except RegistrarError as exc:
        return Response({"error": exc.code, "detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

    currency = _currency()
    price_minor, fx = compute_price(cost.cost_minor, currency)
    contact = request.data.get("contact") or {"Email": getattr(request.user, "email", "")}

    with transaction.atomic():
        cd = CustomDomain.objects.create(
            tenant=tenant,
            domain=domain,
            cost_minor=cost.cost_minor,
            price_minor=price_minor,
            currency=currency,
            fx_rate=fx,
            contact=contact,
            forward_to_email=getattr(request.user, "email", ""),
            provisioning_status="pending",
        )
        DomainSubscription.objects.create(tenant=tenant, custom_domain=cd, status="incomplete")

    success = f"{_origin(request)}/settings/domain"
    cancel = f"{_origin(request)}/settings/domain?canceled=1"
    try:
        session = create_domain_checkout(
            tenant=tenant, user=request.user, custom_domain=cd, success_url=success, cancel_url=cancel
        )
    except ProviderError as exc:
        return Response({"error": exc.code, "detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

    return Response({"checkout_url": session.url, "custom_domain_id": cd.id})
