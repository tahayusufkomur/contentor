"""Demo-content admin endpoints: what is still demo, and erase the untouched.

Never touches bucket objects — seeded rows point at shared platform demo/*
keys used by every tenant. DB rows only.
"""

from collections import defaultdict

from django.db import transaction
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner

from .models import SeededObject, TenantConfig
from .seeding import fingerprint_for

# Deletion order: content first, then the media it references, so the
# reference guard sees the final set of surviving rows.
_ERASE_ORDER = [
    "billing.bundle",
    "billing.subscriptionplan",
    "live.liveclass",
    "live.livestream",
    "live.zoomclass",
    "live.onsiteevent",
    "courses.course",
    "downloads.downloadfile",
    "courses.video",
    "media.photo",
]

_ID_KEYS = {
    "courses.course": "courses",
    "downloads.downloadfile": "downloads",
    "billing.subscriptionplan": "plans",
    "billing.bundle": "bundles",
    "live.liveclass": "live_classes",
    "live.livestream": "live_streams",
    "live.zoomclass": "zoom_classes",
    "live.onsiteevent": "onsite_events",
    "courses.video": "videos",
    "media.photo": "photos",
}

_LIVE_ID_KEYS = ("live_classes", "live_streams", "zoom_classes", "onsite_events")

# Count keys collapse the four live types into one number for dialog copy.
_COUNT_KEYS = {label: ("live_events" if key in _LIVE_ID_KEYS else key) for label, key in _ID_KEYS.items()}


def _rows_by_label():
    grouped = defaultdict(list)
    for row in SeededObject.objects.select_related("content_type"):
        grouped[f"{row.content_type.app_label}.{row.content_type.model}"].append(row)
    return grouped


def _photo_referenced(photo, config) -> bool:
    import json

    from apps.courses.models import Course, Video
    from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass

    if config is not None:
        if config.logo_id == photo.pk:
            return True
        pk_str = str(photo.pk)
        if pk_str in json.dumps(config.pages or {}) or pk_str in json.dumps(config.landing_sections or {}):
            return True
    return any(
        model.objects.filter(thumbnail=photo).exists()
        for model in (Course, Video, LiveClass, LiveStream, ZoomClass, OnsiteEvent)
    )


def _video_referenced(video) -> bool:
    from apps.courses.models import Lesson

    return Lesson.objects.filter(video=video).exists()


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def demo_content(request):
    ids = {key: [] for key in _ID_KEYS.values()}
    for label, rows in _rows_by_label().items():
        key = _ID_KEYS.get(label)
        if key:
            ids[key] = [row.object_id for row in rows]
    counts = {
        "courses": len(ids["courses"]),
        "downloads": len(ids["downloads"]),
        "plans": len(ids["plans"]),
        "bundles": len(ids["bundles"]),
        "live_events": sum(len(ids[k]) for k in _LIVE_ID_KEYS),
        "videos": len(ids["videos"]),
        "photos": len(ids["photos"]),
    }
    return Response({"present": any(ids.values()), "counts": counts, "ids": ids})


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def erase_demo_content(request):
    deleted: dict[str, int] = {}
    kept: dict[str, int] = {}
    config = TenantConfig.objects.first()
    with transaction.atomic():
        grouped = _rows_by_label()
        for label in _ERASE_ORDER:
            count_key = _COUNT_KEYS[label]
            for row in grouped.get(label, []):
                model = row.content_type.model_class()
                obj = model.objects.filter(pk=row.object_id).first()
                if obj is None:
                    row.delete()
                    continue
                keep = (
                    fingerprint_for(obj) != row.fingerprint
                    or (label == "media.photo" and _photo_referenced(obj, config))
                    or (label == "courses.video" and _video_referenced(obj))
                )
                if keep:
                    kept[count_key] = kept.get(count_key, 0) + 1
                    row.delete()  # keep the object, drop the badge forever
                    continue
                obj.delete()
                row.delete()
                deleted[count_key] = deleted.get(count_key, 0) + 1
    return Response({"deleted": deleted, "kept": kept})
