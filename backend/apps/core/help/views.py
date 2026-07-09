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
from rest_framework.throttling import AnonRateThrottle

from apps.tenant_config import help_bot

MARKETING_BUCKET = "__marketing__"
VISITOR_CONTEXT = "<visitor_context>Visitor browsing the contentor.app marketing site; not signed in.</visitor_context>"


class HelpPublicBurstThrottle(AnonRateThrottle):
    scope = "help_bot_public_burst"


class HelpPublicDayThrottle(AnonRateThrottle):
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
    enabled, reason = _availability(month=month)
    if not enabled:
        return Response({"enabled": False, "reason": reason}, status=200)

    data = request.data if isinstance(request.data, dict) else {}
    try:
        history = help_bot.prepare_history(data.get("messages"), VISITOR_CONTEXT)
    except ValueError as exc:
        return Response({"error": str(exc)}, status=400)

    response = StreamingHttpResponse(
        help_bot.sse_events(history, "visitor", MARKETING_BUCKET, month),
        content_type="text/event-stream",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response
