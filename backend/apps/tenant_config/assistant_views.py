"""Site assistant endpoints. Public half (student/anonymous, tenant host):
status + chat. Coach half (Task 9) lives further down this module."""

from decimal import Decimal

from django.conf import settings
from django.db import connection
from django.http import StreamingHttpResponse
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle

from apps.core import assistant
from apps.core.permissions import IsCoachOrOwner

from . import student_bot
from .models import AssistantConfig, AssistantKnowledgeEntry, TenantConfig


class StudentBotBurstThrottle(AnonRateThrottle):
    scope = "student_bot_burst"


class StudentBotDayThrottle(AnonRateThrottle):
    scope = "student_bot_day"


class StudentBotUserBurstThrottle(UserRateThrottle):
    scope = "student_bot_burst"


class StudentBotUserDayThrottle(UserRateThrottle):
    scope = "student_bot_day"


def _status_payload(tenant):
    config = TenantConfig.objects.first()
    cfg = AssistantConfig.load()
    enabled, reason = student_bot.availability(tenant, cfg)
    return {
        "enabled": enabled,
        "reason": reason,
        "greeting": cfg.greeting,
        "suggested_questions": (cfg.suggested_questions or [])[:3],
        "brand": (config.brand_name if config else "") or tenant.schema_name,
    }


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def assistant_status(request):
    return Response(_status_payload(connection.tenant))


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes(
    [StudentBotBurstThrottle, StudentBotDayThrottle, StudentBotUserBurstThrottle, StudentBotUserDayThrottle]
)
def assistant_chat(request):
    """SSE chat for students/visitors on the tenant site. Same wire contract
    as the help bot; the viewer's auth state is the only per-request context."""
    tenant = connection.tenant
    month = student_bot.current_month()
    cfg = AssistantConfig.load()
    enabled, reason = student_bot.availability(tenant, cfg, month=month)
    if not enabled:
        return Response({"enabled": False, "reason": reason}, status=200)

    data = request.data if isinstance(request.data, dict) else {}
    raw = data.get("messages") or []
    question = str(raw[-1].get("content") or "")[:2000] if raw and isinstance(raw[-1], dict) else ""
    session_id = str(data.get("session_id") or "")[:36]
    signed_in = "yes" if getattr(request.user, "is_authenticated", False) else "no"
    try:
        history = assistant.prepare_history(
            data.get("messages"), f"<student_context>signed in: {signed_in}</student_context>"
        )
    except ValueError as exc:
        return Response({"error": str(exc)}, status=400)

    response = StreamingHttpResponse(
        student_bot.sse_events(history, tenant, month, question=question, session_id=session_id),
        content_type="text/event-stream",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


# ── Coach admin half (/api/v1/admin/assistant/…) ─────────────────────────────
# (UserRateThrottle is already imported at the top of this module — Task 8.)


class AssistantPreviewThrottle(UserRateThrottle):
    scope = "help_bot"  # coach-keyed, same budget of 10/min as the help chat


def _config_payload(tenant):
    cfg = AssistantConfig.load()
    month = student_bot.current_month()
    usage = student_bot.tenant_usage(tenant.schema_name, month=month)
    enabled, reason = student_bot.availability(tenant, cfg, month=month)
    return {
        "enabled": cfg.enabled,
        "greeting": cfg.greeting,
        "suggested_questions": cfg.suggested_questions or [],
        "usage": {
            "questions_used": usage.questions,
            "questions_cap": student_bot.plan_question_limit(tenant),
            "month": month,
        },
        "status": {"enabled": enabled, "reason": reason},
    }


@api_view(["GET", "PUT"])
@permission_classes([IsCoachOrOwner])
def assistant_config(request):
    tenant = connection.tenant
    if request.method == "PUT":
        data = request.data if isinstance(request.data, dict) else {}
        cfg = AssistantConfig.load()
        if "suggested_questions" in data:
            qs = data["suggested_questions"]
            if (
                not isinstance(qs, list)
                or len(qs) > 3
                or any(not isinstance(q, str) or not q.strip() or len(q) > 80 for q in qs)
            ):
                return Response({"error": "suggested_questions: up to 3 strings of at most 80 characters"}, status=400)
            cfg.suggested_questions = [q.strip() for q in qs]
        if "greeting" in data:
            greeting = str(data["greeting"] or "").strip()
            if len(greeting) > 200:
                return Response({"error": "greeting: at most 200 characters"}, status=400)
            cfg.greeting = greeting
        if "enabled" in data:
            cfg.enabled = bool(data["enabled"])
        cfg.save()
    return Response(_config_payload(tenant))


def _entry_payload(e):
    return {"id": e.id, "title": e.title, "content": e.content, "enabled": e.enabled, "updated_at": e.updated_at}


def _validate_entry(data, partial=False):
    errors = {}
    if not partial or "title" in data:
        title = str(data.get("title") or "").strip()
        if not title or len(title) > 120:
            errors["title"] = "1-120 characters"
    if not partial or "content" in data:
        content = str(data.get("content") or "").strip()
        if not content or len(content) > AssistantKnowledgeEntry.MAX_CONTENT_CHARS:
            errors["content"] = f"1-{AssistantKnowledgeEntry.MAX_CONTENT_CHARS} characters"
    return errors


@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def assistant_knowledge(request):
    if request.method == "GET":
        return Response([_entry_payload(e) for e in AssistantKnowledgeEntry.objects.all()])
    data = request.data if isinstance(request.data, dict) else {}
    errors = _validate_entry(data)
    if errors:
        return Response(errors, status=400)
    if AssistantKnowledgeEntry.objects.count() >= AssistantKnowledgeEntry.MAX_ENTRIES:
        return Response({"error": f"limit of {AssistantKnowledgeEntry.MAX_ENTRIES} entries reached"}, status=400)
    e = AssistantKnowledgeEntry.objects.create(
        title=str(data["title"]).strip(),
        content=str(data["content"]).strip(),
        enabled=bool(data.get("enabled", True)),
    )
    return Response(_entry_payload(e), status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsCoachOrOwner])
def assistant_knowledge_detail(request, pk):
    try:
        e = AssistantKnowledgeEntry.objects.get(pk=pk)
    except AssistantKnowledgeEntry.DoesNotExist:
        return Response(status=404)
    if request.method == "DELETE":
        e.delete()
        return Response(status=204)
    data = request.data if isinstance(request.data, dict) else {}
    errors = _validate_entry(data, partial=True)
    if errors:
        return Response(errors, status=400)
    for field in ("title", "content"):
        if field in data:
            setattr(e, field, str(data[field]).strip())
    if "enabled" in data:
        e.enabled = bool(data["enabled"])
    e.save()
    return Response(_entry_payload(e))


PAGE_SIZE = 20


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def assistant_transcripts(request):
    """The coach's own audit view: their students' assistant exchanges + their
    own help-bot questions. Marketing transcripts are superadmin-only."""
    from apps.core.models import AiTranscript

    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except ValueError:
        page = 1
    qs = AiTranscript.objects.filter(
        tenant_schema=connection.tenant.schema_name, feature__in=("student_bot", "help_bot")
    ).order_by("-created_at")
    start = (page - 1) * PAGE_SIZE
    rows = list(qs[start : start + PAGE_SIZE + 1])
    results = [
        {
            "id": r.id,
            "feature": r.feature,
            "audience": r.audience,
            "question": r.question,
            "answer": r.answer,
            "rating": r.rating,
            "is_preview": r.is_preview,
            "created_at": r.created_at,
        }
        for r in rows[:PAGE_SIZE]
    ]
    return Response({"results": results, "has_more": len(rows) > PAGE_SIZE})


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
@throttle_classes([AssistantPreviewThrottle])
def assistant_preview_chat(request):
    """Coach tries their own student bot from /admin/assistant without turning
    it on or spending the plan quota. USD still accrues (kill-switch
    integrity); the paid-plan gate still applies."""
    tenant = connection.tenant
    month = student_bot.current_month()
    if not tenant.has_paid_platform_plan:
        return Response({"enabled": False, "reason": "upgrade_required"}, status=200)
    if not student_bot.core_ai.available()[0]:
        return Response({"enabled": False, "reason": "disabled"}, status=200)
    if student_bot.global_spend(month=month) >= Decimal(str(settings.STUDENT_BOT_GLOBAL_MONTHLY_USD)):
        return Response({"enabled": False, "reason": "budget"}, status=200)

    data = request.data if isinstance(request.data, dict) else {}
    raw = data.get("messages") or []
    question = str(raw[-1].get("content") or "")[:2000] if raw and isinstance(raw[-1], dict) else ""
    try:
        history = assistant.prepare_history(data.get("messages"), "<student_context>signed in: no</student_context>")
    except ValueError as exc:
        return Response({"error": str(exc)}, status=400)
    response = StreamingHttpResponse(
        student_bot.sse_events(history, tenant, month, question=question, session_id="preview", is_preview=True),
        content_type="text/event-stream",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response
