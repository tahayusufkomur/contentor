"""Guided onboarding (/setup) endpoints — thin wrappers over setup_flow.
Coach JWT (DRF default auth) + IsCoachOrOwner, like the copilot."""

import logging

from django.db import connection
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner
from apps.core.throttling import SetupInterviewThrottle

from . import interview, interview_golive, interview_milestones, setup_flow
from .interview_brief import touch

logger = logging.getLogger(__name__)


def _data(request) -> dict:
    return request.data if isinstance(request.data, dict) else {}


def _setup_over() -> Response | None:
    """The interview and go-live act only while guided setup is running."""
    from .models import TenantConfig

    flow = (TenantConfig.objects.first() or TenantConfig()).setup_flow or {}
    if flow.get("status") != "active":
        return Response({"detail": "setup_finished"}, status=409)
    return None


@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def setup_flow_state(request):
    tenant = connection.tenant
    touch(tenant)
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


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
@throttle_classes([SetupInterviewThrottle])
def setup_flow_turn(request):
    if (over := _setup_over()) is not None:
        return over
    data = _data(request)
    choice = data.get("choice") if isinstance(data.get("choice"), dict) else None
    try:
        body = interview.run_turn(
            connection.tenant,
            str(data.get("message") or ""),
            spoken=bool(data.get("spoken")),
            choice=choice,
            field=str(data.get("field") or "") or None,
        )
    except interview_milestones.ChoiceError as exc:
        return Response({"detail": str(exc)}, status=400)
    return Response(body)


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def setup_flow_logos(request):
    from .interview_brief import answers_of

    try:
        page = max(int(request.query_params.get("page") or 0), 0)
    except ValueError:
        page = 0
    tenant = connection.tenant
    return Response(interview_milestones.logo_cards(tenant, answers_of(tenant), page))


@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def setup_flow_golive(request):
    tenant = connection.tenant
    touch(tenant)
    if request.method == "POST":
        if (over := _setup_over()) is not None:
            return over
        action = str(_data(request).get("action") or "")
        try:
            if action == "publish":
                interview_golive.publish(tenant)
            elif action == "make_free":
                interview_golive.make_free(tenant)
            else:
                return Response({"detail": "unknown_action"}, status=400)
        except setup_flow.PublishBlockedError as exc:
            return Response({"detail": "publish_requirements_unmet", "blockers": exc.blockers}, status=400)
    return Response(interview_golive.golive_state(tenant))
