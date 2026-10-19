from dataclasses import asdict

from django.contrib.contenttypes.models import ContentType
from django.db.models import Count
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.billing.models import Bundle, PaymentItem
from apps.billing.serializers.bundles import listed_items, original_price
from apps.billing.serializers.store import StoreItemSerializer
from apps.core.access import ContentAccessService
from apps.core.currency import tenant_charge_currency
from apps.core.permissions import IsCoachOrOwner
from apps.core.storage import generate_presigned_download_url, sign_if_s3_key
from apps.courses.models import Course
from apps.downloads.models import DownloadFile
from apps.live.models import LiveClass, LiveStream, OnsiteEvent
from apps.media import designs


def _thumbnail_url(obj):
    """Prefer the Photo FK (admin uploads, copilot set_course_cover) over the
    legacy raw-URL field — the same precedence the course serializer's
    thumbnail_signed_url applies, collapsed into the store's single field."""
    thumbnail = getattr(obj, "thumbnail", None)
    if thumbnail is not None and thumbnail.s3_key:
        return generate_presigned_download_url(thumbnail.s3_key)
    return sign_if_s3_key(getattr(obj, "thumbnail_url", "") or "") or ""


def _bundle_original_price(bundle, drafts: bool = True):
    return original_price(listed_items(bundle, drafts=drafts))


def _collect_store_items(drafts: bool = True):
    """Collect all paid/active content as raw dicts (no access_info yet). A bundle's
    draft items are counted and priced only with ``drafts`` (her products list)."""
    items = []
    currency = tenant_charge_currency()
    ctx = {}  # one for every item, so the covers' designs are read once

    # Courses: paid + published
    for course in Course.objects.filter(pricing_type="paid", is_published=True).select_related("thumbnail"):
        items.append(
            {
                "id": course.pk,
                "title": course.title,
                "description": course.description,
                "type": "course",
                "price": course.price,
                "currency": currency,
                "thumbnail_url": _thumbnail_url(course),
                "cover_design": designs.cover_for(course, ctx),
                "created_at": course.created_at,
                "is_active": course.is_published,
                "item_count": 0,
                "original_price": None,
                "_obj": course,
            }
        )

    # DownloadFiles: paid
    for df in DownloadFile.objects.filter(pricing_type="paid").select_related("thumbnail"):
        items.append(
            {
                "id": df.pk,
                "title": df.title,
                "description": df.description,
                "type": "download",
                "price": df.price,
                "currency": currency,
                "thumbnail_url": _thumbnail_url(df),
                "cover_design": designs.cover_for(df, ctx),
                "is_active": df.is_published,
                "item_count": 0,
                "original_price": None,
                "_obj": df,
            }
        )

    # LiveClasses: paid
    for lc in LiveClass.objects.filter(pricing_type="paid").select_related("thumbnail"):
        items.append(
            {
                "id": lc.pk,
                "title": lc.title,
                "description": lc.description,
                "type": "live_class",
                "price": lc.price,
                "currency": currency,
                "thumbnail_url": _thumbnail_url(lc),
                "cover_design": designs.cover_for(lc, ctx),
                "scheduled_at": lc.scheduled_at,
                "is_active": True,
                "item_count": 0,
                "original_price": None,
                "_obj": lc,
            }
        )

    # LiveStreams: paid
    for ls in LiveStream.objects.filter(pricing_type="paid").select_related("thumbnail"):
        items.append(
            {
                "id": ls.pk,
                "title": ls.title,
                "description": ls.description,
                "type": "live_stream",
                "price": ls.price,
                "currency": currency,
                "thumbnail_url": _thumbnail_url(ls),
                "cover_design": designs.cover_for(ls, ctx),
                "scheduled_at": ls.scheduled_at,
                "is_active": True,
                "item_count": 0,
                "original_price": None,
                "_obj": ls,
            }
        )

    # In-person classes: paid
    for event in OnsiteEvent.objects.filter(pricing_type="paid").select_related("thumbnail"):
        items.append(
            {
                "id": event.pk,
                "title": event.title,
                "description": event.description,
                "type": "onsite_event",
                "price": event.price,
                "currency": currency,
                "thumbnail_url": _thumbnail_url(event),
                "cover_design": designs.cover_for(event, ctx),
                "scheduled_at": event.scheduled_at,
                "is_active": True,
                "item_count": 0,
                "original_price": None,
                "_obj": event,
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
                "thumbnail_url": _thumbnail_url(bundle),
                "is_active": bundle.is_active,
                "item_count": len(listed_items(bundle, drafts=drafts)),
                "original_price": _bundle_original_price(bundle, drafts),
                "_obj": bundle,
            }
        )

    return items


@api_view(["GET"])
@permission_classes([AllowAny])
def store_list(request):
    # An in-person class with no date yet, or one that is over, is not for sale; nor is a held
    # class (a draft with a date) until she publishes it; nor is a download that is a draft or has
    # no file yet. Her products list still shows them.
    items = [
        i
        for i in _collect_store_items(drafts=False)
        if not (i["type"] == "onsite_event" and i["_obj"].computed_status in ("draft", "ended"))
        and not (i["type"] in ("live_class", "live_stream", "onsite_event") and i["_obj"].status == "draft")
        and not (i["type"] == "download" and not (i["_obj"].is_published and i["_obj"].file_url))
    ]

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
        item["access_info"] = asdict(service.get_access_info(user, obj))

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
        "onsite_event": OnsiteEvent,
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
