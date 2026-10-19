"""Focus mode's endpoints (coach JWT + IsCoachOrOwner). Every answer is
synchronous and makes no model call; the outline, and the analysis of what
she types, run on the agents worker and are read through the copilot runs
endpoints. Off (FOCUS_MODE_ENABLED) means
404 everywhere but the overview, which says so."""

from django.conf import settings
from django.db import connection
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner
from apps.tenant_config.models import FocusCreation

from . import covers, flow, kinds


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
        on = kinds.enabled()
        first = {kind: flow.question(kind, kinds.get(kind).RECIPE.questions[0].id) for kind in on}
        return Response({"enabled": True, "kinds": on, "first": first, "open": open_})
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
    creation = flow.finish(
        creation, publish=data.get("publish") is True, announce=data.get("announce") is True, active_ms=_ms(data)
    )
    return Response(flow.state(creation))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def focus_announce(request, creation_id):
    """Marketing's draft: ``{"schedule": bool}`` (focus mode ends) or ``{"retry": true}``."""
    creation = _hers(request, creation_id) if settings.FOCUS_MODE_ENABLED else None
    if creation is None:
        return _not_found()
    data = _body(request)
    if data.get("retry") is True:
        creation = flow.retry_announcement(creation)
    elif isinstance(data.get("schedule"), bool):
        creation = flow.decide_announcement(creation, schedule=data["schedule"], active_ms=_ms(data))
    return Response(flow.state(creation))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def focus_descriptions(request, creation_id):
    creation = _hers(request, creation_id) if settings.FOCUS_MODE_ENABLED else None
    if creation is None:
        return _not_found()
    return Response(flow.state(flow.retry_descriptions(creation)))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def focus_cover(request, creation_id):
    """One of the cover step's taps (photo, keep, more, later, edit). Each is
    refused, with the state unchanged, unless the cover is the question."""
    creation = _hers(request, creation_id) if settings.FOCUS_MODE_ENABLED else None
    if creation is None:
        return _not_found()
    data = _body(request)
    action, index, extra = data.get("action"), data.get("index"), {}
    if action == "photo":
        if flow.current_field(creation) == "cover":  # no download for a stale screen
            photo = covers.photo_for(data.get("asset_id"))
            if photo is None:  # she is told, and the shared photo stays as it was
                return Response({"detail": "photo_unavailable"}, status=409)
            covers.set_photo(creation, photo)
    elif action == "keep":
        covers.keep(creation, index, request.user)
    elif action == "more":
        covers.more(creation)
    elif action == "later":
        covers.later(creation)
    elif action == "edit":
        extra["design_id"] = covers.open_for_edit(creation, index)
    creation.refresh_from_db()
    return Response({**flow.state(creation), **extra})


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def focus_photos(request, creation_id):
    creation = _hers(request, creation_id) if settings.FOCUS_MODE_ENABLED else None
    if creation is None:
        return _not_found()
    try:
        page = max(1, int(request.query_params.get("page", "1")))
    except ValueError:
        page = 1
    return Response(covers.photo_row(creation, connection.tenant, request.query_params.get("q", ""), page))


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
