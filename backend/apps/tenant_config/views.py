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
from apps.core import assistant
from apps.core.email import send_email
from apps.core.models import AiConversation
from apps.core.permissions import IsCoachOrOwner
from apps.courses.models import Course, Video
from apps.downloads.models import DownloadFile
from apps.media.models import Photo

from . import help_bot, logo_api
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
# Paid-tier coaches additionally get "Design with AI" — a staged, live
# conversation (apps/tenant_config/logo_converse.py) whose every design pass
# is critiqued by the model's own vision before the coach sees it. See
# docs/superpowers/specs/2026-07-11-logo-vision-critique-conversation-design.md.
#
# The engine itself lives in logo_api.py (tenant-explicit) so it can be
# shared by this JWT-authed coach studio and the wizard-token auth context.


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def logo_ai_status(request):
    return Response(logo_api.ai_status(connection.tenant))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def logo_converse(request):
    tenant = connection.tenant
    data = request.data if isinstance(request.data, dict) else {}
    config = TenantConfig.objects.first()
    raw_brief = data.get("brief") if isinstance(data.get("brief"), dict) else {}
    brief = {
        "brand_name": (config.brand_name if config else "") or "My Brand",
        "primary_hex": logo_api.THEME_PRIMARY_HEX.get(config.theme if config else "ocean", "#1a56db"),
        "niche": str(raw_brief.get("niche") or "")[:120],
        "style_chips": ", ".join(str(c)[:20] for c in (raw_brief.get("style_chips") or [])[:3]),
        "vibe": str(raw_brief.get("vibe") or "")[:200],
    }
    return Response(logo_api.converse(tenant, brief, data))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def logo_converse_finish(request):
    data = request.data if isinstance(request.data, dict) else {}
    return Response(logo_api.converse_finish(connection.tenant, data))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def logo_refine(request):
    data = request.data if isinstance(request.data, dict) else {}
    return Response(logo_api.refine(connection.tenant, data))


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

    data = request.data if isinstance(request.data, dict) else {}
    raw = data.get("messages") or []
    question = str(raw[-1].get("content") or "")[:2000] if isinstance(raw[-1] if raw else None, dict) else ""
    session_id = str(data.get("session_id") or "")[:36]

    convo = assistant.get_or_create_conversation(
        feature="help_bot",
        audience="coach",
        tenant_schema=tenant.schema_name,
        session_id=session_id,
        user=request.user,
    )
    convo = assistant.maybe_auto_release(convo)
    if convo is not None and convo.status == AiConversation.STATUS_HUMAN:
        if question:
            assistant.append_message(convo, "user", question)
        return Response({"mode": "human"})

    enabled, reason = help_bot.availability(tenant.schema_name, month=month)
    if not enabled:
        return Response({"enabled": False, "reason": reason}, status=200)

    try:
        config = TenantConfig.objects.first()
        context_block = help_bot.build_tenant_context(config, tenant)
        history = help_bot.prepare_history(data.get("messages"), context_block)
    except ValueError as exc:
        return Response({"error": str(exc)}, status=400)

    if convo is not None:
        assistant.append_message(convo, "user", question)
    response = StreamingHttpResponse(
        help_bot.sse_events(
            history, "coach", tenant.schema_name, month, question=question, session_id=session_id, conversation=convo
        ),
        content_type="text/event-stream",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def help_bot_thread(request):
    """Coach console polling endpoint for Ask Contentor's own thread (mirrors
    assistant_thread; JWT-gated, so no anon throttle needed)."""
    session = str(request.query_params.get("session") or "").strip()[:36]
    try:
        after = int(request.query_params.get("after") or 0)
    except ValueError:
        after = 0
    convo = (
        AiConversation.objects.filter(
            session_id=session, feature="help_bot", tenant_schema=connection.tenant.schema_name
        ).first()
        if session
        else None
    )
    if convo is None:
        return Response(status=404)
    convo = assistant.maybe_auto_release(convo)
    return Response(assistant.thread_payload(convo, after_id=after))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def help_bot_human_message(request):
    """Free human-mode sends from the coach console (mirrors
    assistant_human_message)."""
    data = request.data if isinstance(request.data, dict) else {}
    session = str(data.get("session_id") or "").strip()[:36]
    content = str(data.get("content") or "").strip()[:2000]
    if not content:
        return Response({"error": "empty message"}, status=400)
    convo = (
        AiConversation.objects.filter(
            session_id=session, feature="help_bot", tenant_schema=connection.tenant.schema_name
        ).first()
        if session
        else None
    )
    if convo is None:
        return Response(status=404)
    convo = assistant.maybe_auto_release(convo)
    if convo.status != AiConversation.STATUS_HUMAN:
        return Response({"mode": "ai"}, status=409)
    assistant.append_message(convo, "user", content)
    return Response({"mode": "human"})


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def help_bot_human_request(request):
    """Coach taps "talk to a human" inside their own Ask Contentor chat:
    flags the conversation and emails the configured alert address once
    (mirrors assistant_human_request; this bot has no human_handoff_enabled
    config flag to gate on)."""
    from django.utils import timezone

    tenant = connection.tenant
    data = request.data if isinstance(request.data, dict) else {}
    session = str(data.get("session_id") or "").strip()[:36]
    convo = (
        AiConversation.objects.filter(session_id=session, feature="help_bot", tenant_schema=tenant.schema_name).first()
        if session
        else None
    )
    if convo is None:
        return Response(status=404)
    if not convo.human_requested:
        convo.human_requested = True
        convo.human_requested_at = timezone.now()
        convo.save(update_fields=["human_requested", "human_requested_at", "updated_at"])
        assistant.append_message(convo, "system", "human_requested")
        try:
            label = convo.user_label or "A coach"
            send_email(
                to=settings.HELP_BOT_ALERT_EMAIL or settings.RESEND_FROM_EMAIL,
                subject=f"{label} asked for a human in Ask Contentor",
                html=(f"<p>{label} asked for a human in Ask Contentor (tenant: {tenant.schema_name}).</p>"),
            )
        except Exception:
            logger.exception("help bot: human-request email failed")
    return Response({"ok": True})
