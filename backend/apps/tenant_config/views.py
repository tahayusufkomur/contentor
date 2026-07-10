import hashlib
import json as _json
import logging
from decimal import Decimal

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.db.models import Sum
from django.http import StreamingHttpResponse
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from apps.accounts.models import User
from apps.billing.models import Payment
from apps.core import ai as core_ai
from apps.core.permissions import IsCoachOrOwner
from apps.courses.models import Course, Video
from apps.downloads.models import DownloadFile
from apps.media.models import Photo

from . import help_bot, logo_ai
from .models import TenantConfig
from .serializers import TenantConfigSerializer

logger = logging.getLogger(__name__)


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


# Logo Studio ideas are generated entirely client-side by the deterministic
# composer (frontend-customer/src/lib/logo/composer.ts) for every coach.
# Paid-tier coaches additionally get an AI "Brand Pack" — bespoke vector
# marks + brand palettes from one gated Claude call per brief — via the two
# endpoints below. See apps/tenant_config/logo_ai.py and
# docs/superpowers/specs/2026-07-08-logo-ai-brand-pack-design.md.

# Theme id -> primaryHex. KEEP IN SYNC with frontend-customer/src/lib/themes.ts.
_THEME_PRIMARY_HEX = {
    "ocean": "#1a56db",
    "ember": "#c2410c",
    "forest": "#15803d",
    "sunset": "#e11d48",
    "violet": "#7c3aed",
    "slate": "#334155",
}


def _brand_pack_cache_key(model, brand_name, niche, style_chips, vibe, primary_hex):
    raw = "|".join(
        [
            str(logo_ai.PROMPT_VERSION),
            model,
            brand_name,
            niche,
            ",".join(sorted(style_chips)),
            vibe,
            primary_hex,
        ]
    )
    digest = hashlib.sha256(raw.encode()).hexdigest()
    return f"logo-ai:pack:{digest}"


def _brand_pack_status(tenant):
    month = logo_ai._current_month()
    eligible = tenant.has_paid_platform_plan
    budget_ok = logo_ai.global_spend(month=month) < Decimal(str(settings.LOGO_AI_MONTHLY_BUDGET_USD))
    enabled = core_ai.available()[0] and budget_ok
    usage = logo_ai.tenant_usage(tenant.schema_name, month=month)
    remaining = max(0, settings.LOGO_AI_MONTHLY_PACK_LIMIT - usage.packs_used)
    refine_remaining = max(0, settings.LOGO_AI_MONTHLY_REFINE_LIMIT - usage.refinements_used)
    if not eligible:
        reason = "upgrade_required"
    elif not enabled:
        reason = "disabled"
    elif remaining <= 0:
        reason = "quota_exhausted"
    else:
        reason = None
    return {
        "enabled": enabled,
        "eligible": eligible,
        "remaining": remaining,
        "reason": reason,
        "refine_remaining": refine_remaining,
    }


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def logo_brand_pack_status(request):
    return Response(_brand_pack_status(connection.tenant))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def logo_brand_pack(request):
    """One gated Claude call -> a Brand Pack (bespoke marks + palettes) for
    the studio to multiply client-side. Always a non-empty JSON body."""
    tenant = connection.tenant
    month = logo_ai._current_month()

    if not core_ai.available()[0]:
        return Response({"pack": None, "source": "disabled", "remaining": 0})
    if not tenant.has_paid_platform_plan:
        return Response({"pack": None, "source": "upgrade_required", "remaining": 0})

    config = TenantConfig.objects.first()
    brand_name = (config.brand_name if config else "") or "My Brand"
    theme = config.theme if config else "ocean"
    primary_hex = _THEME_PRIMARY_HEX.get(theme, "#1a56db")

    data = request.data if isinstance(request.data, dict) else {}
    niche = str(data.get("niche") or "")[:120]
    style_chips = [str(c)[:20] for c in (data.get("style_chips") or []) if isinstance(c, str)][:3]
    vibe = str(data.get("vibe") or "")[:200]

    usage = logo_ai.tenant_usage(tenant.schema_name, month=month)
    remaining = max(0, settings.LOGO_AI_MONTHLY_PACK_LIMIT - usage.packs_used)

    cache_key = _brand_pack_cache_key(settings.LOGO_AI_MODEL, brand_name, niche, style_chips, vibe, primary_hex)
    cached = cache.get(cache_key)
    if cached is not None:
        return Response({"pack": cached, "source": "cache", "remaining": remaining})

    if remaining <= 0:
        return Response({"pack": None, "source": "quota_exhausted", "remaining": 0})

    if logo_ai.global_spend(month=month) >= Decimal(str(settings.LOGO_AI_MONTHLY_BUDGET_USD)):
        logger.warning("logo brand pack: monthly budget kill-switch tripped (%s)", month)
        return Response({"pack": None, "source": "disabled", "remaining": remaining})

    try:
        result = logo_ai.generate_brand_pack(brand_name, niche, primary_hex, style_chips=style_chips, vibe=vibe)
    except logo_ai.BrandPackError as exc:
        logo_ai.record_attempt_cost(tenant.schema_name, exc.cost_usd, month=month)
        logger.exception("logo brand pack: validation left nothing usable")
        return Response({"pack": None, "source": "error", "remaining": remaining})
    except Exception:
        logo_ai.record_attempt_cost(tenant.schema_name, Decimal("0"), month=month)
        logger.exception("logo brand pack: AI call failed")
        return Response({"pack": None, "source": "error", "remaining": remaining})

    logo_ai.record_attempt_cost(tenant.schema_name, result.cost_usd, month=month)
    logo_ai.record_successful_pack(tenant.schema_name, month=month)
    cache.set(cache_key, result.pack, timeout=60 * 60 * 24 * 30)  # 30 days
    return Response({"pack": result.pack, "source": "ai", "remaining": remaining - 1})


class HelpBotRateThrottle(UserRateThrottle):
    scope = "help_bot"


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def help_bot_status(request):
    """Whether the Help tab should show at all, and why not if not."""
    enabled, reason = help_bot.availability(connection.tenant.schema_name)
    return Response({"enabled": enabled, "reason": reason})


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
@throttle_classes([HelpBotRateThrottle])
def help_bot_chat(request):
    """Ask Contentor: streams the answer as SSE (`data: {...}\\n\\n` lines with
    type delta|done|error). Body: {"messages": [{role, content}, ...]} — the
    client-held transcript ending in the coach's new question. The tenant
    snapshot is injected server-side; the client never builds it."""
    tenant = connection.tenant
    month = help_bot.current_month()

    enabled, reason = help_bot.availability(tenant.schema_name, month=month)
    if not enabled:
        return Response({"enabled": False, "reason": reason}, status=200)

    data = request.data if isinstance(request.data, dict) else {}
    raw = data.get("messages") or []
    question = str(raw[-1].get("content") or "")[:2000] if isinstance(raw[-1] if raw else None, dict) else ""
    session_id = str(data.get("session_id") or "")[:36]
    try:
        config = TenantConfig.objects.first()
        context_block = help_bot.build_tenant_context(config, tenant)
        history = help_bot.prepare_history(data.get("messages"), context_block)
    except ValueError as exc:
        return Response({"error": str(exc)}, status=400)

    response = StreamingHttpResponse(
        help_bot.sse_events(history, "coach", tenant.schema_name, month, question=question, session_id=session_id),
        content_type="text/event-stream",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response
