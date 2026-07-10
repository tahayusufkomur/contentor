"""Site assistant endpoints. Public half (student/anonymous, tenant host):
status + chat. Coach half (Task 9) lives further down this module."""

from django.db import connection
from django.http import StreamingHttpResponse
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle

from apps.core import assistant

from . import student_bot
from .models import AssistantConfig, TenantConfig


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
