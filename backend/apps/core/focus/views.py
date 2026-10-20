"""Focus mode's endpoints (coach JWT + IsCoachOrOwner). Every answer is
synchronous and makes no model call; the outline, and the analysis of what
she types, run on the agents worker and are read through the copilot runs
endpoints. Off (FOCUS_MODE_ENABLED) means
404 everywhere but the overview, which says so."""

from django.conf import settings
from django.db import connection
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
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


def _owner_only(user, kind):
    """A membership or bundle is the owner's alone (flow.check_owner): 403 for anyone else."""
    try:
        flow.check_owner(user, kind)
    except flow.FlowError as exc:
        raise PermissionDenied(str(exc)) from exc


def _refused(kind) -> bool:
    """Its drafting refused before it starts (a post's blog gate): New is today's form, not
    questions that end in "Write it yourself". One already open carries on. Her plan and quota
    only: a slow AI hub never holds the New pages; a hub that is down is said by the guide."""
    refused = getattr(kinds.get(kind), "draft_refused", None)
    return bool(refused and refused(probe=False))


def _hers(request, creation_id):
    """Her creation, or None; every endpoint for one passes here (and so the owner check)."""
    creation = FocusCreation.objects.filter(pk=creation_id, actor=request.user, mode="focus").first()
    if creation is not None:
        _owner_only(request.user, creation.kind)
    return creation


@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def focus_root(request):
    if request.method == "GET":
        if not settings.FOCUS_MODE_ENABLED:
            return Response({"enabled": False, "kinds": [], "first": {}, "open": []})
        open_ = []
        mine = FocusCreation.objects.filter(actor=request.user, mode="focus", status="active")
        if request.user.role != "owner":  # a membership or bundle is the owner's alone
            mine = mine.exclude(kind__in=flow.OWNER_ONLY)
        for creation in mine:
            body = flow.state(creation)  # closes one whose record is gone
            if body["record"] is not None:
                open_.append({"id": creation.id, "kind": creation.kind, "record": body["record"]})
            elif body["status"] == "active":  # no record yet (G10): her working title, so Continue finds it
                open_.append(
                    {"id": creation.id, "kind": creation.kind, "record": None, "title": flow.draft_title(creation)}
                )
        on = [
            kind
            for kind in kinds.enabled()
            if (request.user.role == "owner" or kind not in flow.OWNER_ONLY) and not _refused(kind)
        ]
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
        return Response({"detail": str(exc)}, status=403 if str(exc) == "owner_only" else 400)
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
    # The guide's toast says what happened ("Sent.", "Scheduled for …").
    return Response({**flow.state(creation), "closing": flow.closing_line(creation)})


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
def focus_copy(request, creation_id):
    """Try again after the copy job (or a kind's own drafting) failed; 404 for the course."""
    creation = _hers(request, creation_id) if settings.FOCUS_MODE_ENABLED else None
    if creation is None or not flow.draft_job(creation.kind):
        return _not_found()
    return Response(flow.state(flow.retry_copy(creation)))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def focus_cover(request, creation_id):
    """One of the cover step's taps (photo, keep, more, later, edit; use: a
    photo-only cover's "Use this photo"). Each is refused, with the state
    unchanged, unless the cover is the question."""
    creation = _hers(request, creation_id) if settings.FOCUS_MODE_ENABLED else None
    if creation is None:
        return _not_found()
    data = _body(request)
    action, index, extra = data.get("action"), data.get("index"), {}
    if action in ("photo", "use"):
        # No download for a stale screen, nor for "use" on a styled cover (it has no photo of its own).
        photo_cover = kinds.get(creation.kind).COVER == "photo"
        if flow.current_field(creation) == "cover" and (action == "photo" or photo_cover):
            photo = covers.photo_for(data.get("asset_id"))
            if photo is None:  # she is told, and the shared photo stays as it was
                return Response({"detail": "photo_unavailable"}, status=409)
            (covers.set_photo if action == "photo" else covers.use_photo)(creation, photo)
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
    """The plain form's stamp: her active time from "New <kind>" to its create
    click, for the comparison in focus_timing. One stamp per record."""
    if not settings.FOCUS_MODE_ENABLED:
        return _not_found()
    data = _body(request)
    kind = str(data.get("kind") or "course")
    _owner_only(request.user, kind)
    try:
        record_id = int(data.get("record_id", data.get("course_id")))  # course_id: a tab from before the kinds
        if kind == "event":  # the form sends the row's pk and its kind; the stamp holds the event's ref
            record_id = kinds.get(kind).ref_for(data.get("event_kind"), record_id)
        record = kinds.get(kind).record(record_id)
    except (TypeError, ValueError, flow.FlowError):
        return _not_found()
    if record is None:
        return _not_found()
    owned_by = getattr(kinds.get(kind), "owned_by", None)  # optional: who made it, when not its instructor
    if not (owned_by(record, request.user) if owned_by else getattr(record, "instructor_id", None) == request.user.id):
        return _not_found()
    ms = _ms(data)
    FocusCreation.objects.get_or_create(
        mode="form",
        kind=kind,
        record_id=record_id,
        defaults={
            "actor": request.user,
            "status": "done",
            "active_ms": max(0, ms or 0),
            "finished_at": timezone.now(),
        },
    )
    return Response(status=201)
