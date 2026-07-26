"""Coach-facing Site AI: the reveal chat's engine, metered monthly.

Auth is the DRF default (TenantJWTAuthentication) + IsCoachOrOwner — do NOT
clear authentication_classes here; that is only for the pre-provision wizard
endpoints, which have no session.

Note: site_ai.apply_edit() writes TenantConfig.pages directly rather than
through TenantConfigView's serializer, so an AI apply does not populate
setup_progress["pages_edited"] the way a manual page edit does. The reveal
chat behaves the same way; feeding the setup checklist from AI applies is a
separate concern.
"""

import logging
from decimal import Decimal

from django.db import connection
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes, renderer_classes
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response

from apps.core.ai_sse import EventStreamRenderer, sse_frame, stream_response
from apps.core.onboarding import ai_compose, site_ai
from apps.core.permissions import IsCoachOrOwner

logger = logging.getLogger(__name__)

INSTRUCTION_MAX_LEN = 400


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def site_ai_status(request):
    """Remaining monthly site-edit allowance for this tenant."""
    return Response(site_ai.availability(connection.tenant))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
@renderer_classes([JSONRenderer, EventStreamRenderer])
def site_ai_preview(request):
    """Stream a proposed edit. FREE — previewing never consumes an allowance;
    only Apply does. USD still accrues on every attempt (kill-switch).

    Gated on the platform-wide onboarding AI budget (ai_compose.compose_available:
    ONBOARDING_AI_ENABLED, provider availability, global spend < budget) BEFORE
    opening the stream. Deliberately no per-coach rate limit here — a free
    coach can preview on repeat (they can never Apply), and
    TenantRateLimitMiddleware exempts the tenant's own coach anyway — so the
    budget check is what stops that loop from burning the SAME budget every
    new signup's AI reveal draws from.
    """
    if not ai_compose.compose_available():
        # Pre-stream guard, same convention as apps/blog/views.py's
        # _guard_response: answer plain JSON — bypassing DRF's renderer
        # negotiation with JsonResponse, exactly like that guard does for a
        # streaming request — since streamAi() content-type-sniffs and
        # returns a JSON body as-is instead of parsing it as SSE frames.
        return JsonResponse({"pages": None, "source": "unavailable"})

    tenant = connection.tenant
    data = request.data if isinstance(request.data, dict) else {}
    instruction = str(data.get("instruction") or "").strip()[:INSTRUCTION_MAX_LEN]

    def frames():
        yield sse_frame({"type": "phase", "phase": "thinking"})
        cost = Decimal("0")
        try:
            pages, _extras, cost = site_ai.preview_edit(tenant, instruction)
            yield sse_frame({"type": "done", "pages": pages})
        except Exception:
            logger.exception("admin site-edit preview failed schema=%s", tenant.schema_name)
            yield sse_frame({"type": "error", "source": "error"})
        finally:
            site_ai.record_attempt_cost(tenant.schema_name, cost)

    return stream_response(frames())


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def site_ai_apply(request):
    """Persist a previewed edit, spending one monthly allowance unit.

    402 when there is nothing left — a soft refusal, not a wall: the coach can
    still edit manually for free on every plan.
    """
    tenant = connection.tenant
    status = site_ai.availability(tenant)
    if not status["enabled"]:
        return Response(
            {
                "detail": "site_ai_unavailable",
                "reason": status["reason"],
                "remaining": status["remaining"],
            },
            status=402,
        )

    data = request.data if isinstance(request.data, dict) else {}
    site_ai.apply_edit(tenant, data.get("pages") or {})
    site_ai.record_update(tenant.schema_name)
    remaining = max(0, status["remaining"] - 1)
    logger.info("admin site-edit applied schema=%s remaining=%d", tenant.schema_name, remaining)
    return Response({"remaining": remaining})
