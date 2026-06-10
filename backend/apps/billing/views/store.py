from dataclasses import asdict
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.db.models import Count
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.billing.models import Bundle, PaymentItem
from apps.billing.serializers.store import StoreItemSerializer
from apps.core.access import AccessInfo, ContentAccessService
from apps.core.currency import tenant_charge_currency
from apps.core.permissions import IsCoachOrOwner
from apps.courses.models import Course
from apps.downloads.models import DownloadFile
from apps.live.models import LiveClass, LiveStream


def _unauthenticated_access_info(price, currency=""):
    return asdict(
        AccessInfo(
            has_access=False,
            pricing_type="paid",
            price=price,
            currency=currency,
            unlock_methods=["purchase"],
        )
    )


def _bundle_original_price(bundle):
    total = Decimal("0.00")
    for item in bundle.items.all():
        content_obj = item.content_object
        if content_obj is not None:
            price = getattr(content_obj, "price", None)
            if price is not None:
                total += Decimal(str(price))
    return total


def _collect_store_items():
    """Collect all paid/active content as raw dicts (no access_info yet)."""
    items = []
    currency = tenant_charge_currency()

    # Courses: paid + published
    for course in Course.objects.filter(pricing_type="paid", is_published=True):
        items.append(
            {
                "id": course.pk,
                "title": course.title,
                "description": course.description,
                "type": "course",
                "price": course.price,
                "currency": currency,
                "thumbnail_url": course.thumbnail_url or "",
                "is_active": course.is_published,
                "item_count": 0,
                "original_price": None,
                "_obj": course,
            }
        )

    # DownloadFiles: paid
    for df in DownloadFile.objects.filter(pricing_type="paid"):
        items.append(
            {
                "id": df.pk,
                "title": df.title,
                "description": "",
                "type": "download",
                "price": df.price,
                "currency": currency,
                "thumbnail_url": "",
                "is_active": True,
                "item_count": 0,
                "original_price": None,
                "_obj": df,
            }
        )

    # LiveClasses: paid
    for lc in LiveClass.objects.filter(pricing_type="paid"):
        items.append(
            {
                "id": lc.pk,
                "title": lc.title,
                "description": lc.description,
                "type": "live_class",
                "price": lc.price,
                "currency": currency,
                "thumbnail_url": lc.thumbnail_url or "",
                "is_active": True,
                "item_count": 0,
                "original_price": None,
                "_obj": lc,
            }
        )

    # LiveStreams: paid
    for ls in LiveStream.objects.filter(pricing_type="paid"):
        items.append(
            {
                "id": ls.pk,
                "title": ls.title,
                "description": ls.description,
                "type": "live_stream",
                "price": ls.price,
                "currency": currency,
                "thumbnail_url": ls.thumbnail_url or "",
                "is_active": True,
                "item_count": 0,
                "original_price": None,
                "_obj": ls,
            }
        )

    # Bundles: active
    for bundle in Bundle.objects.filter(is_active=True).prefetch_related("items"):
        items.append(
            {
                "id": bundle.pk,
                "title": bundle.name,
                "description": bundle.description,
                "type": "bundle",
                "price": bundle.price,
                "currency": bundle.currency,
                "thumbnail_url": bundle.thumbnail_url or "",
                "is_active": bundle.is_active,
                "item_count": bundle.items.count(),
                "original_price": _bundle_original_price(bundle),
                "_obj": bundle,
            }
        )

    return items


@api_view(["GET"])
@permission_classes([AllowAny])
def store_list(request):
    items = _collect_store_items()

    # Filter by type
    type_filter = request.query_params.get("type")
    if type_filter:
        items = [i for i in items if i["type"] == type_filter]

    # Filter by search
    search = request.query_params.get("search", "").strip()
    if search:
        search_lower = search.lower()
        items = [i for i in items if search_lower in i["title"].lower()]

    # Compute access_info
    service = ContentAccessService()
    user = request.user

    for item in items:
        obj = item.pop("_obj")
        if user.is_authenticated:
            info = service.get_access_info(user, obj)
            item["access_info"] = asdict(info)
        else:
            item["access_info"] = _unauthenticated_access_info(item["price"], item["currency"])

    serializer = StoreItemSerializer(items, many=True)
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def products_list(request):
    items = _collect_store_items()

    # Build a lookup of sales counts per (content_type_id, object_id)
    sales_qs = (
        PaymentItem.objects.filter(
            payment__status__in=("completed", "partially_refunded"),
            is_refunded=False,
        )
        .values("content_type_id", "object_id")
        .annotate(count=Count("id"))
    )
    sales_map = {(row["content_type_id"], row["object_id"]): row["count"] for row in sales_qs}

    # Map type strings to ContentType model classes for lookup
    type_to_model = {
        "course": Course,
        "download": DownloadFile,
        "live_class": LiveClass,
        "live_stream": LiveStream,
        "bundle": Bundle,
    }

    result = []
    for item in items:
        item.pop("_obj")
        item_type = item["type"]
        model_class = type_to_model.get(item_type)
        if model_class:
            ct = ContentType.objects.get_for_model(model_class)
            item["sales_count"] = sales_map.get((ct.pk, item["id"]), 0)
        else:
            item["sales_count"] = 0
        # No access_info for coach view — provide empty dict placeholder
        item["access_info"] = {}
        result.append(item)

    serializer = StoreItemSerializer(result, many=True)
    return Response(serializer.data)
