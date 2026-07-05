import json as _json
from decimal import Decimal

from django.core.cache import cache
from django.db import connection
from django.db.models import Sum
from rest_framework.decorators import api_view, permission_classes
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import User
from apps.billing.models import Payment
from apps.core.permissions import IsCoachOrOwner
from apps.courses.models import Course, Video
from apps.downloads.models import DownloadFile
from apps.media.models import Photo

from .models import TenantConfig
from .serializers import TenantConfigSerializer


def _logo_signal(config):
    """A stable value to diff for "did the coach's logo change" purposes.

    ``TenantConfigSerializer.to_representation`` overwrites ``logo_url`` with
    a freshly presigned URL derived from ``logo_id`` whenever a ``logo`` FK is
    set — so once that FK is populated, ``logo_url`` churns on every read and
    a round-tripped autosave would false-positive a diff (same bug class as
    the ``pages_edited`` fix above). Prefer the stable ``logo_id`` in that
    case. But ``logo_id`` is a read-only field on the serializer today — the
    only currently-live write path for a coach's logo is the raw ``logo_url``
    CharField (set directly by the logo uploader) — so when no FK governs it,
    fall back to comparing ``logo_url`` itself, which is otherwise never
    silently rewritten (``sign_if_s3_key`` leaves already-``http`` URLs
    untouched).
    """
    return config.logo_id or config.logo_url


def _strip_volatile_urls(node):
    """Recursively null out presigned-URL fields before a content diff.

    Builder image/video fields are ``{"url", "photo_id"}`` / ``{"url",
    "video_id"}`` dicts (see ``tenant_config.serializers._sign_tree``): every
    GET re-derives a fresh, uniquely-signed ``url`` from the durable asset id,
    so the same underlying asset never serializes to the same ``url`` string
    twice. Any dict carrying a ``photo_id`` or ``video_id`` key has its
    ``url`` blanked out here so a pure re-sign round-trip (autosave with no
    real edits) can't register as a content change. Only used for the
    before/after comparison in ``perform_update`` — never mutates what's
    actually persisted.
    """
    if isinstance(node, dict):
        out = {k: _strip_volatile_urls(v) for k, v in node.items()}
        if "photo_id" in out or "video_id" in out:
            out["url"] = None
        return out
    if isinstance(node, list):
        return [_strip_volatile_urls(item) for item in node]
    return node


class TenantConfigView(RetrieveUpdateAPIView):
    serializer_class = TenantConfigSerializer

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_object(self):
        cache_key = f"tenant:{connection.tenant.schema_name}:config"
        config = cache.get(cache_key)
        if config is None:
            config = TenantConfig.objects.first()
            if config:
                cache.set(cache_key, config, timeout=300)
        return config

    def perform_update(self, serializer):
        # Snapshot pre-save values for Setup Assistant auto-detection. The
        # instance may come from cache; JSON-normalize for a fair comparison.
        instance = serializer.instance
        old_pages = _json.loads(_json.dumps(instance.pages or {}, sort_keys=True))
        old_pages = _strip_volatile_urls(old_pages)
        old_look = (instance.theme, instance.font_family, _logo_signal(instance))

        config = serializer.save()

        progress = dict(config.setup_progress or {})
        edited = set(progress.get("pages_edited", []))
        new_pages = _json.loads(_json.dumps(config.pages or {}, sort_keys=True))
        new_pages = _strip_volatile_urls(new_pages)
        for key, value in new_pages.items():
            if old_pages.get(key) != value:
                edited.add(key)
        new_look = (config.theme, config.font_family, _logo_signal(config))
        changed = False
        if sorted(edited) != progress.get("pages_edited", []):
            progress["pages_edited"] = sorted(edited)
            changed = True
        if new_look != old_look and not progress.get("look_edited"):
            progress["look_edited"] = True
            changed = True
        if changed:
            config.setup_progress = progress
            config.save(update_fields=["setup_progress"])

        cache_key = f"tenant:{connection.tenant.schema_name}:config"
        cache.delete(cache_key)


def _format_storage_size(size_bytes: int) -> str:
    if size_bytes <= 0:
        return "0 MB"
    if size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    if size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def admin_stats(_request):
    students_count = User.objects.filter(role="student").count()
    courses_count = Course.objects.count()

    gross_revenue = Payment.objects.filter(
        payment_type__in=["one_time", "subscription"],
        status__in=["completed", "partially_refunded"],
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    refund_total = Payment.objects.filter(
        payment_type="refund",
        status="refunded",
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    revenue = max(gross_revenue - refund_total, Decimal("0.00"))

    photos_size = Photo.objects.aggregate(total=Sum("file_size"))["total"] or 0
    videos_size = Video.objects.aggregate(total=Sum("file_size"))["total"] or 0
    downloads_size = DownloadFile.objects.aggregate(total=Sum("file_size"))["total"] or 0
    storage_bytes = int(photos_size) + int(videos_size) + int(downloads_size)

    return Response(
        {
            "students": students_count,
            "courses": courses_count,
            "revenue": float(revenue),
            "storage_used": _format_storage_size(storage_bytes),
        }
    )


@api_view(["GET", "PATCH"])
@permission_classes([IsCoachOrOwner])
def setup_status(request):
    """Setup Assistant state: per-item checklist + dismiss + manual overrides."""
    from .setup_items import ALL_ITEM_KEYS, compute_setup_state

    config = TenantConfig.objects.first()
    if config is None:
        return Response(status=404)
    if request.method == "PATCH":
        if "dismissed" in request.data:
            config.setup_guide_dismissed = bool(request.data["dismissed"])
            config.save(update_fields=["setup_guide_dismissed"])
        if "item" in request.data:
            key = str(request.data["item"])
            if key not in ALL_ITEM_KEYS:
                return Response({"detail": "unknown_item"}, status=400)
            progress = dict(config.setup_progress or {})
            manual = dict(progress.get("manual", {}))
            if bool(request.data.get("done")):
                manual[key] = True
            else:
                manual.pop(key, None)
            progress["manual"] = manual
            config.setup_progress = progress
            config.save(update_fields=["setup_progress"])
    return Response(compute_setup_state(config, connection.tenant))
