"""Guided onboarding (/setup) endpoints — thin wrappers over setup_flow.
Coach JWT (DRF default auth) + IsCoachOrOwner, like the copilot."""

import logging

from django.db import connection
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner

from . import setup_flow

logger = logging.getLogger(__name__)


def _data(request) -> dict:
    return request.data if isinstance(request.data, dict) else {}


@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def setup_flow_state(request):
    tenant = connection.tenant
    if request.method == "POST":
        data = _data(request)
        try:
            setup_flow.act(tenant, str(data.get("action") or ""), data.get("step"), bool(data.get("publish")))
        except setup_flow.PublishBlockedError as exc:
            return Response({"detail": "publish_requirements_unmet", "blockers": exc.blockers}, status=400)
        except setup_flow.FlowError as exc:
            return Response({"detail": str(exc)}, status=400)
    return Response(setup_flow.state_body(tenant))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def setup_flow_build_page(request):
    data = _data(request)
    try:
        setup_flow.build_page(connection.tenant, str(data.get("page") or ""), bool(data.get("force")))
    except setup_flow.FlowError as exc:
        return Response({"detail": str(exc)}, status=400)
    return Response({"status": "building"}, status=202)


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def setup_flow_draft(request):
    from apps.core import ai as core_ai
    from apps.core.copilot.content import ContentOpError

    data = _data(request)
    tenant = connection.tenant
    try:
        result = setup_flow.create_draft(
            tenant, request.user, str(data.get("kind") or ""), str(data.get("prompt") or "").strip()
        )
    except setup_flow.FlowError as exc:
        return Response({"detail": str(exc)}, status=400)
    except core_ai.AiError:
        logger.exception("setup-flow draft failed schema=%s", tenant.schema_name)
        return Response({"detail": "ai_unavailable"}, status=503)
    except ContentOpError as exc:
        return Response({"detail": str(exc)}, status=400)
    return Response(result, status=201)
