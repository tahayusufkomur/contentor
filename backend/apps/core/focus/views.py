"""Focus mode's endpoints (coach JWT + IsCoachOrOwner). Every answer is
synchronous and makes no model call; the outline runs on the agents worker
and is read through the copilot runs endpoints. Off (FOCUS_MODE_ENABLED) means
404 everywhere but the overview, which says so."""

from django.conf import settings
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner
from apps.tenant_config.models import FocusCreation

from . import flow
from .recipes import RECIPES


def _not_found():
    return Response({"detail": "not_found"}, status=404)


def _body(request) -> dict:
    return request.data if isinstance(request.data, dict) else {}


def _ms(data):
    try:
        return int(data.get("active_ms"))
    except (TypeError, ValueError):
        return None


def _text(data, key):
    value = data.get(key)
    return value if isinstance(value, str) else None


def _hers(request, creation_id):
    return FocusCreation.objects.filter(pk=creation_id, actor=request.user, mode="focus").first()


@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def focus_root(request):
    if request.method == "GET":
        if not settings.FOCUS_MODE_ENABLED:
            return Response({"enabled": False, "first": {}, "open": []})
        open_ = []
        for creation in FocusCreation.objects.filter(actor=request.user, mode="focus", status="active"):
            record = flow.state(creation)["record"]  # closes one whose record is gone
            if record is not None:
                open_.append({"id": creation.id, "kind": creation.kind, "record": record})
        first = {kind: flow.question(kind, recipe.questions[0].id) for kind, recipe in RECIPES.items()}
        return Response({"enabled": True, "first": first, "open": open_})
    if not settings.FOCUS_MODE_ENABLED:
        return _not_found()
    data = _body(request)
    try:
        creation = flow.start(
            request.user,
            str(data.get("kind") or ""),
            value=_text(data, "value"),
            text=_text(data, "text"),
            delegate=data.get("delegate") is True,
            rest=data.get("rest") is True,
            active_ms=_ms(data),
        )
    except flow.FlowError as exc:
        return Response({"detail": str(exc)}, status=400)
    return Response(flow.state(creation), status=201)


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def focus_detail(request, creation_id):
    creation = _hers(request, creation_id) if settings.FOCUS_MODE_ENABLED else None
    if creation is None:
        return _not_found()
    return Response(flow.state(creation))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def focus_answer(request, creation_id):
    creation = _hers(request, creation_id) if settings.FOCUS_MODE_ENABLED else None
    if creation is None:
        return _not_found()
    data = _body(request)
    creation = flow.answer(
        creation,
        str(data.get("field") or ""),
        value=_text(data, "value"),
        text=_text(data, "text"),
        delegate=data.get("delegate") is True,
        rest=data.get("rest") is True,
        active_ms=_ms(data),
    )
    return Response(flow.state(creation))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def focus_finish(request, creation_id):
    creation = _hers(request, creation_id) if settings.FOCUS_MODE_ENABLED else None
    if creation is None:
        return _not_found()
    data = _body(request)
    creation = flow.finish(creation, publish=data.get("publish") is True, active_ms=_ms(data))
    return Response(flow.state(creation))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def focus_leave(request, creation_id):
    creation = _hers(request, creation_id) if settings.FOCUS_MODE_ENABLED else None
    if creation is None:
        return _not_found()
    data = _body(request)
    creation = flow.leave(creation, abandon=data.get("abandon") is True, active_ms=_ms(data))
    return Response(flow.state(creation))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def focus_form_timing(request):
    """The plain form's stamp: her active time from "New course" to its create
    click, for the comparison in focus_timing. One stamp per course."""
    from apps.courses.models import Course

    if not settings.FOCUS_MODE_ENABLED:
        return _not_found()
    data = _body(request)
    try:
        course_id = int(data.get("course_id"))
    except (TypeError, ValueError):
        return _not_found()
    if not Course.objects.filter(pk=course_id, instructor=request.user).exists():
        return _not_found()
    ms = _ms(data)
    FocusCreation.objects.get_or_create(
        mode="form",
        kind="course",
        record_id=course_id,
        defaults={
            "actor": request.user,
            "status": "done",
            "active_ms": max(0, ms or 0),
            "finished_at": timezone.now(),
        },
    )
    return Response(status=201)
