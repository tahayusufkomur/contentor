from __future__ import annotations

from django.conf import settings
from django.db import connection
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner

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
