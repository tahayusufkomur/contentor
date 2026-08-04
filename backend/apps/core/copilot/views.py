"""Copilot endpoint pair. Coach-JWT (DRF default auth + IsCoachOrOwner — do
NOT clear authentication_classes; that is only for pre-provision wizard
endpoints). No metering: no availability checks, no credits. Every model
call's USD still lands in the onboarding meter (kill-switch integrity)."""

import logging
from decimal import Decimal

from django.db import connection
from django.http import JsonResponse
from django_tenants.utils import tenant_context
from rest_framework.decorators import api_view, permission_classes, renderer_classes
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response

from apps.core import ai as core_ai
from apps.core.ai_sse import EventStreamRenderer, sse_frame, stream_response
from apps.core.copilot import blocks, engine, tokens
from apps.core.copilot.tokens import ActionTokenError
from apps.core.onboarding import ai_compose, site_ai
from apps.core.permissions import IsCoachOrOwner

logger = logging.getLogger(__name__)

MESSAGE_MAX_LEN = 2000

SELECTION_CAPS = {"path": 200, "block_id": 40, "tag": 40, "text": 200, "context": 120}


def _clean_selections(raw):
    cleaned = []
    for item in raw[:5]:
        if not isinstance(item, dict):
            continue
        cleaned.append({k: str(item.get(k) or "")[:cap] for k, cap in SELECTION_CAPS.items()})
    return cleaned


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
@renderer_classes([JSONRenderer, EventStreamRenderer])
def copilot_converse(request):
    if not ai_compose.compose_available():
        # Pre-stream guard answered as plain JSON (streamAi content-sniffs
        # and returns a JSON body as-is) — same convention as blog/site-ai.
        return JsonResponse({"kind": "unavailable"})

    tenant = connection.tenant
    data = request.data if isinstance(request.data, dict) else {}
    message = str(data.get("message") or "").strip()[:MESSAGE_MAX_LEN]
    transcript = data.get("transcript") if isinstance(data.get("transcript"), list) else []
    selections = _clean_selections(data.get("selections") if isinstance(data.get("selections"), list) else [])

    def frames():
        yield sse_frame({"type": "phase", "phase": "thinking"})
        cost = Decimal("0")
        try:
            payload, cost = engine.run_turn(tenant, transcript, selections, message)
            yield sse_frame({"type": "done", **payload})
        except core_ai.AiError as exc:
            cost = getattr(exc, "cost_usd", None) or Decimal("0")
            logger.exception("copilot converse failed schema=%s", tenant.schema_name)
            yield sse_frame({"type": "error"})
        except Exception:
            logger.exception("copilot converse failed schema=%s", tenant.schema_name)
            yield sse_frame({"type": "error"})
        finally:
            ai_compose.record_spend(tenant.schema_name, cost)

    return stream_response(frames())


def _execute(tenant, action):
    from apps.tenant_config.models import TenantConfig

    kind = action.get("kind")
    if kind == "edit_pages":
        site_ai.apply_edit(tenant, action["pages"], extras=action.get("extras"))
        return {"kind": kind, "changes_count": action.get("changes_count", 0)}
    with tenant_context(tenant):
        cfg = TenantConfig.objects.first()
        if cfg is None:
            raise blocks.BlockOpError("site is not set up yet")
        pages = cfg.pages or {}
        if kind == "add_block":
            pages = blocks.add_block(pages, action["page"], action["block"], action.get("after_block_id"))
        elif kind == "remove_block":
            pages = blocks.remove_block(pages, action["page"], action["block_id"])
        elif kind == "move_block":
            pages = blocks.move_block(pages, action["page"], action["block_id"], action.get("after_block_id"))
        else:
            raise blocks.BlockOpError(f"unknown action: {kind}")
        cfg.pages = pages
        cfg.save(update_fields=["pages"])
    return {"kind": kind, "page": action.get("page")}


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def copilot_execute(request):
    tenant = connection.tenant
    data = request.data if isinstance(request.data, dict) else {}
    try:
        action = tokens.take_action(str(data.get("token") or ""), tenant.schema_name)
    except ActionTokenError:
        return Response({"detail": "invalid_token"}, status=403)
    try:
        result = _execute(tenant, action)
    except blocks.BlockOpError as exc:
        return Response({"detail": str(exc)}, status=400)
    logger.info("copilot executed %s schema=%s", action.get("kind"), tenant.schema_name)
    return Response({"result": result})
