"""Site assistant endpoints. Public half (student/anonymous, tenant host):
status + chat. Coach half (Task 9) lives further down this module."""

from decimal import Decimal

from django.conf import settings
from django.db import connection
from django.http import StreamingHttpResponse
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from apps.core import assistant, ipblock
from apps.core.email import send_email
from apps.core.models import AiConversation
from apps.core.permissions import IsCoachOrOwner
from apps.core.throttling import AiHumanMessageThrottle, AiHumanRequestThrottle, AiThreadThrottle, ClientIpAnonThrottle

from . import student_bot
from .models import AssistantConfig, AssistantKnowledgeEntry, AssistantLink, TenantConfig


class StudentBotBurstThrottle(ClientIpAnonThrottle):
    scope = "student_bot_burst"


class StudentBotDayThrottle(ClientIpAnonThrottle):
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
        "human_handoff": cfg.human_handoff_enabled,
        "link_whitelist": [
            link.url
            for link in AssistantLink.objects.filter(enabled=True).order_by("position", "id")[: AssistantLink.MAX_LINKS]
            if link.url.startswith("https://")
        ],
    }


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def assistant_status(request):
    if (denied := ipblock.blocked_response(request)) is not None:
        return denied
    return Response(_status_payload(connection.tenant))


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes(
    [StudentBotBurstThrottle, StudentBotDayThrottle, StudentBotUserBurstThrottle, StudentBotUserDayThrottle]
)
def assistant_chat(request):
    """SSE chat for students/visitors. Human-mode conversations short-circuit
    BEFORE gating: a human can keep answering even when the AI is capped
    (v2 spec §6.2 — human messages cost nothing)."""
    if (denied := ipblock.blocked_response(request)) is not None:
        return denied
    tenant = connection.tenant
    month = student_bot.current_month()
    data = request.data if isinstance(request.data, dict) else {}
    raw = data.get("messages") or []
    question = str(raw[-1].get("content") or "")[:2000] if raw and isinstance(raw[-1], dict) else ""
    session_id = str(data.get("session_id") or "")[:36]

    user = request.user if getattr(request.user, "is_authenticated", False) else None
    convo = assistant.get_or_create_conversation(
        feature="student_bot",
        audience="student",
        tenant_schema=tenant.schema_name,
        session_id=session_id,
        user=user,
    )
    convo = assistant.maybe_auto_release(convo)
    if convo is not None and convo.status == AiConversation.STATUS_HUMAN:
        if question:
            assistant.append_message(convo, "user", question)
        return Response({"mode": "human"})

    cfg = AssistantConfig.load()
    enabled, reason = student_bot.availability(tenant, cfg, month=month)
    if not enabled:
        return Response({"enabled": False, "reason": reason}, status=200)

    try:
        history = assistant.prepare_history(data.get("messages"), student_bot.build_viewer_context(user))
    except ValueError as exc:
        return Response({"error": str(exc)}, status=400)

    if convo is not None:
        assistant.append_message(convo, "user", question)
    response = StreamingHttpResponse(
        student_bot.sse_events(history, tenant, month, question=question, session_id=session_id, conversation=convo),
        content_type="text/event-stream",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([AiThreadThrottle])
def assistant_thread(request):
    """Widget polling endpoint. The session UUID is the bearer token (v2 spec
    D5); mismatched feature/tenant simply doesn't exist here → 404."""
    if (denied := ipblock.blocked_response(request)) is not None:
        return denied
    session = str(request.query_params.get("session") or "").strip()[:36]
    try:
        after = int(request.query_params.get("after") or 0)
    except ValueError:
        after = 0
    convo = (
        AiConversation.objects.filter(
            session_id=session, feature="student_bot", tenant_schema=connection.tenant.schema_name
        ).first()
        if session
        else None
    )
    if convo is None:
        return Response(status=404)
    convo = assistant.maybe_auto_release(convo)
    return Response(assistant.thread_payload(convo, after_id=after))


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([AiHumanMessageThrottle])
def assistant_human_message(request):
    """Free human-mode sends from the widget (own throttle scope; the AI chat
    throttles stay reserved for model-bound traffic)."""
    if (denied := ipblock.blocked_response(request)) is not None:
        return denied
    data = request.data if isinstance(request.data, dict) else {}
    session = str(data.get("session_id") or "").strip()[:36]
    content = str(data.get("content") or "").strip()[:2000]
    if not content:
        return Response({"error": "empty message"}, status=400)
    convo = (
        AiConversation.objects.filter(
            session_id=session, feature="student_bot", tenant_schema=connection.tenant.schema_name
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
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([AiHumanRequestThrottle])
def assistant_human_request(request):
    """Student taps "Talk to a human": flag the conversation and email the
    coach once (v2 spec D9). Best-effort mail — the flag is the state."""
    if (denied := ipblock.blocked_response(request)) is not None:
        return denied
    from django.utils import timezone

    tenant = connection.tenant
    cfg = AssistantConfig.load()
    if not cfg.human_handoff_enabled:
        return Response(status=403)
    data = request.data if isinstance(request.data, dict) else {}
    session = str(data.get("session_id") or "").strip()[:36]
    convo = (
        AiConversation.objects.filter(
            session_id=session, feature="student_bot", tenant_schema=tenant.schema_name
        ).first()
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
            domain = (
                tenant.domains.filter(is_primary=True).values_list("domain", flat=True).first()
                or tenant.domains.values_list("domain", flat=True).first()
                or ""
            )
            label = convo.user_label or "A visitor"
            send_email(
                to=tenant.owner_email,
                subject=f"{label} asked to talk to a human on your site",
                html=(
                    f"<p>{label} asked to talk to a human in your site assistant chat.</p>"
                    f'<p><a href="https://{domain}/admin/assistant">Open your conversations</a> '
                    f"to reply — the assistant pauses while you chat.</p>"
                ),
            )
        except Exception:
            import logging

            logging.getLogger(__name__).exception("assistant: human-request email failed")
    return Response({"ok": True})


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
        "human_handoff": cfg.human_handoff_enabled,
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
        if "human_handoff_enabled" in data:
            cfg.human_handoff_enabled = bool(data["human_handoff_enabled"])
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


def _link_payload(link):
    return {
        "id": link.id,
        "label": link.label,
        "url": link.url,
        "note": link.note,
        "enabled": link.enabled,
        "position": link.position,
    }


def _validate_link(data, partial=False):
    from urllib.parse import urlparse

    errors = {}
    if not partial or "label" in data:
        label = str(data.get("label") or "").strip()
        if not label or len(label) > 60:
            errors["label"] = "1-60 characters"
    if not partial or "url" in data:
        url = str(data.get("url") or "").strip()
        if len(url) > 500:
            errors["url"] = "at most 500 characters"
        elif url.startswith("/") and not url.startswith("//") and "\\" not in url:
            pass  # same-site path
        else:
            parsed = urlparse(url)
            if parsed.scheme != "https" or not parsed.netloc:
                errors["url"] = "must be a same-site path (/…) or an https:// URL"
    if "note" in data and len(str(data.get("note") or "")) > 160:
        errors["note"] = "at most 160 characters"
    return errors


@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def assistant_links(request):
    if request.method == "GET":
        return Response([_link_payload(link) for link in AssistantLink.objects.all()])
    data = request.data if isinstance(request.data, dict) else {}
    errors = _validate_link(data)
    if errors:
        return Response(errors, status=400)
    if AssistantLink.objects.count() >= AssistantLink.MAX_LINKS:
        return Response({"error": f"limit of {AssistantLink.MAX_LINKS} links reached"}, status=400)
    link = AssistantLink.objects.create(
        label=str(data["label"]).strip(),
        url=str(data["url"]).strip(),
        note=str(data.get("note") or "").strip(),
        enabled=bool(data.get("enabled", True)),
        position=int(data.get("position") or 0),
    )
    return Response(_link_payload(link), status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsCoachOrOwner])
def assistant_link_detail(request, pk):
    try:
        link = AssistantLink.objects.get(pk=pk)
    except AssistantLink.DoesNotExist:
        return Response(status=404)
    if request.method == "DELETE":
        link.delete()
        return Response(status=204)
    data = request.data if isinstance(request.data, dict) else {}
    errors = _validate_link(data, partial=True)
    if errors:
        return Response(errors, status=400)
    for field in ("label", "url", "note"):
        if field in data:
            setattr(link, field, str(data[field]).strip())
    if "enabled" in data:
        link.enabled = bool(data["enabled"])
    if "position" in data:
        link.position = int(data["position"] or 0)
    link.save()
    return Response(_link_payload(link))


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


# ── Human takeover console (/api/v1/admin/assistant/conversations/…) ────────


def _own_conversation(pk):
    return AiConversation.objects.filter(
        pk=pk, feature="student_bot", tenant_schema=connection.tenant.schema_name
    ).first()


def _conversation_row(c):
    last = c.messages.exclude(role="system").order_by("-id").first()
    return {
        "id": c.id,
        "session_id": c.session_id,
        "status": c.status,
        "user_label": c.user_label,
        "human_requested": c.human_requested,
        "message_count": c.message_count,
        "last_message": (last.content[:140] if last else ""),
        "updated_at": c.updated_at,
    }


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def assistant_conversations(request):
    from django.db.models import Count

    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except ValueError:
        page = 1
    qs = (
        AiConversation.objects.filter(feature="student_bot", tenant_schema=connection.tenant.schema_name)
        .annotate(message_count=Count("messages"))
        .order_by("-updated_at")
    )
    start = (page - 1) * PAGE_SIZE
    rows = list(qs[start : start + PAGE_SIZE + 1])
    return Response({"results": [_conversation_row(c) for c in rows[:PAGE_SIZE]], "has_more": len(rows) > PAGE_SIZE})


def _int_param(request, name, source=None):
    try:
        return int((source or request.query_params).get(name) or 0)
    except (TypeError, ValueError):
        return 0


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def assistant_conversation_thread(request, pk):
    convo = _own_conversation(pk)
    if convo is None:
        return Response(status=404)
    convo = assistant.maybe_auto_release(convo)
    return Response(assistant.thread_payload(convo, after_id=_int_param(request, "after")))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def assistant_conversation_takeover(request, pk):
    from django.utils import timezone

    convo = _own_conversation(pk)
    if convo is None:
        return Response(status=404)
    convo = assistant.maybe_auto_release(convo)
    if convo.status == AiConversation.STATUS_HUMAN:
        return Response({"error": "already_taken_over"}, status=409)
    label = (((getattr(request.user, "name", "") or "").split(" ")[0]) or "Coach")[:60]
    convo.status = AiConversation.STATUS_HUMAN
    convo.agent_user_id = request.user.id
    convo.agent_label = label
    convo.taken_over_at = timezone.now()
    convo.human_requested = False
    convo.save(
        update_fields=["status", "agent_user_id", "agent_label", "taken_over_at", "human_requested", "updated_at"]
    )
    assistant.append_message(convo, "system", f"agent_joined:{label}")
    return Response(assistant.thread_payload(convo))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def assistant_conversation_message(request, pk):
    convo = _own_conversation(pk)
    if convo is None:
        return Response(status=404)
    data = request.data if isinstance(request.data, dict) else {}
    content = str(data.get("content") or "").strip()[:2000]
    if not content:
        return Response({"error": "empty message"}, status=400)
    convo = assistant.maybe_auto_release(convo)
    if convo.status != AiConversation.STATUS_HUMAN:
        return Response({"error": "not_taken_over"}, status=403)
    assistant.append_message(convo, "agent", content)
    return Response(assistant.thread_payload(convo, after_id=_int_param(request, "after", data)))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def assistant_conversation_release(request, pk):
    convo = _own_conversation(pk)
    if convo is None:
        return Response(status=404)
    if convo.status == AiConversation.STATUS_HUMAN:
        convo.status = AiConversation.STATUS_AI
        convo.save(update_fields=["status", "updated_at"])
        assistant.append_message(convo, "system", "assistant_resumed")
    return Response(assistant.thread_payload(convo))
