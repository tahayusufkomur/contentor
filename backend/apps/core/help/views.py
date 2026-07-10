"""Public "Ask Contentor" endpoints for the marketing site (frontend-main).

Anonymous visitors ask pre-sales questions; the bot answers from the same
knowledge base as the coach help chat (apps.tenant_config.help_bot) but with
a visitor persona whose deep links point at marketing pages (/signup,
/pricing, /demo) — never the coach admin panel.

Anonymous = abuse surface: per-IP minute + day throttles, a dedicated spend
bucket with its own monthly caps, and the shared global kill-switch (the
bucket's spend sums into help_bot.global_spend like every tenant's).
"""

from django.conf import settings
from django.http import StreamingHttpResponse
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core import assistant
from apps.core.email import send_email
from apps.core.models import AiConversation
from apps.core.throttling import (
    AiHumanMessageThrottle,
    AiHumanRequestThrottle,
    AiThreadThrottle,
    ClientIpAnonThrottle,
)
from apps.tenant_config import help_bot

MARKETING_BUCKET = "__marketing__"
VISITOR_CONTEXT = "<visitor_context>Visitor browsing the contentor.app marketing site; not signed in.</visitor_context>"


class HelpPublicBurstThrottle(ClientIpAnonThrottle):
    scope = "help_bot_public_burst"


class HelpPublicDayThrottle(ClientIpAnonThrottle):
    scope = "help_bot_public_day"


def _availability(month=None):
    return help_bot.availability(
        MARKETING_BUCKET,
        month=month,
        usd_cap=settings.HELP_BOT_PUBLIC_MONTHLY_USD,
        question_cap=settings.HELP_BOT_PUBLIC_MONTHLY_QUESTIONS,
    )


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def help_bot_public_status(request):
    enabled, reason = _availability()
    return Response({"enabled": enabled, "reason": reason})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([HelpPublicBurstThrottle, HelpPublicDayThrottle])
def help_bot_public_chat(request):
    """Same SSE contract as the coach endpoint (delta|done|error events);
    visitor persona, marketing spend bucket, no tenant context."""
    month = help_bot.current_month()

    data = request.data if isinstance(request.data, dict) else {}
    raw = data.get("messages") or []
    question = str(raw[-1].get("content") or "")[:2000] if isinstance(raw[-1] if raw else None, dict) else ""
    session_id = str(data.get("session_id") or "")[:36]

    convo = assistant.get_or_create_conversation(
        feature="help_bot",
        audience="visitor",
        tenant_schema=MARKETING_BUCKET,
        session_id=session_id,
        user=None,
    )
    convo = assistant.maybe_auto_release(convo)
    if convo is not None and convo.status == AiConversation.STATUS_HUMAN:
        if question:
            assistant.append_message(convo, "user", question)
        return Response({"mode": "human"})

    enabled, reason = _availability(month=month)
    if not enabled:
        return Response({"enabled": False, "reason": reason}, status=200)

    try:
        history = help_bot.prepare_history(data.get("messages"), VISITOR_CONTEXT)
    except ValueError as exc:
        return Response({"error": str(exc)}, status=400)

    if convo is not None:
        assistant.append_message(convo, "user", question)
    response = StreamingHttpResponse(
        help_bot.sse_events(
            history, "visitor", MARKETING_BUCKET, month, question=question, session_id=session_id, conversation=convo
        ),
        content_type="text/event-stream",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([AiThreadThrottle])
def help_bot_public_thread(request):
    """Widget polling endpoint for the marketing chat bubble's own thread
    (mirrors assistant_thread / help_bot_thread)."""
    session = str(request.query_params.get("session") or "").strip()[:36]
    try:
        after = int(request.query_params.get("after") or 0)
    except ValueError:
        after = 0
    convo = (
        AiConversation.objects.filter(session_id=session, feature="help_bot", tenant_schema=MARKETING_BUCKET).first()
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
def help_bot_public_human_message(request):
    """Free human-mode sends from the marketing chat bubble (own throttle
    scope; mirrors assistant_human_message)."""
    data = request.data if isinstance(request.data, dict) else {}
    session = str(data.get("session_id") or "").strip()[:36]
    content = str(data.get("content") or "").strip()[:2000]
    if not content:
        return Response({"error": "empty message"}, status=400)
    convo = (
        AiConversation.objects.filter(session_id=session, feature="help_bot", tenant_schema=MARKETING_BUCKET).first()
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
def help_bot_public_human_request(request):
    """Visitor taps "talk to a human" in the marketing chat bubble: flags the
    conversation and emails the alert address once. Always on (v2 spec D9) —
    this bucket has no config-flag gate to check."""
    from django.utils import timezone

    data = request.data if isinstance(request.data, dict) else {}
    session = str(data.get("session_id") or "").strip()[:36]
    convo = (
        AiConversation.objects.filter(session_id=session, feature="help_bot", tenant_schema=MARKETING_BUCKET).first()
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
        label = "A visitor on contentor.app"
        try:
            send_email(
                to=settings.HELP_BOT_ALERT_EMAIL or settings.RESEND_FROM_EMAIL,
                subject=f"{label} asked for a human in Ask Contentor",
                html=f"<p>{label} asked for a human in the marketing site's Ask Contentor chat.</p>",
            )
        except Exception:
            import logging

            logging.getLogger(__name__).exception("help bot: public human-request email failed")
    return Response({"ok": True})
