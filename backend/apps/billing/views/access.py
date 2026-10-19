"""One URL for an item's ways in: the Access section loads and saves through it."""

from django.contrib.contenttypes.models import ContentType
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.billing import ways
from apps.billing.models import BundleItem, SubscriptionPlan
from apps.core.currency import tenant_charge_currency
from apps.core.permissions import IsCoachOrOwner

# What the section offers for an item that does not exist yet.
_NEW_ITEM_WAYS = {"free": {"window": None}, "buy": None, "plans": []}


def _payload(request, kind, item):
    """The item's ways with everything the Access section needs to draw them; ``item`` None is a new item."""
    current = ways.ways_of(item) if item else _NEW_ITEM_WAYS
    bundles = []
    if item and kind != "bundle":
        rows = BundleItem.objects.filter(
            content_type=ContentType.objects.get_for_model(item), object_id=item.pk
        ).select_related("bundle")
        bundles = [{"id": r.bundle_id, "name": r.bundle.name, "price": f"{r.bundle.price:.2f}"} for r in rows]
    return {
        "kind": kind,
        "id": item.pk if item else None,
        "ways": current,
        "describe": ways.describe(current) if item else "",
        "currency": tenant_charge_currency(),
        "allowed": list(ways.ALLOWED[kind]),
        "can_edit_plans": request.user.role == "owner",
        "plans": [
            {
                "id": p.pk,
                "name": p.name,
                "price": f"{p.price:.2f}",
                "billing_interval_months": p.billing_interval_months,
                "is_active": p.is_active,
            }
            for p in SubscriptionPlan.objects.order_by("pk")
        ],
        "bundles": bundles,
    }


@api_view(["GET", "PUT"])
@permission_classes([IsCoachOrOwner])
def access_detail(request, kind, pk):
    """GET an item's ways in and the choices; PUT ``{"ways": {...}}`` to change them.

    ``GET .../<kind>/0/?choices=1`` answers the same for an item that is not created yet.
    """
    try:
        if kind not in ways.KINDS:
            raise ways.WaysError("not_found", "I could not find that item.")
        if request.method == "GET" and pk == 0 and request.query_params.get("choices"):
            return Response(_payload(request, kind, None))
        item = ways.item_for(kind, pk)
        if request.method == "PUT":
            new = request.data.get("ways") if isinstance(request.data, dict) else None
            if not isinstance(new, dict):
                raise ways.WaysError("ways", "I could not read those settings.")
            ways.set_ways(item, new, actor=request.user)
    except ways.WaysError as error:
        code = status.HTTP_404_NOT_FOUND if error.code == "not_found" else status.HTTP_400_BAD_REQUEST
        return Response({"code": error.code, "detail": str(error)}, status=code)
    return Response(_payload(request, kind, item))
