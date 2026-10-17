"""The photo studio's API: what she can put a cover on, her designs, and Keep.

The work is in designs.py; these views map it onto HTTP. Every query runs in the active tenant's schema,
so a design of another site is a 404.
"""

from django.db import connection, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.copilot import content
from apps.core.curated_images.views import generation_allowance
from apps.core.permissions import IsCoachOrOwner
from apps.core.storage import generate_presigned_download_url
from apps.courses.models import Course

from . import designs
from .design_recipe import validate_recipe
from .design_serializers import DesignSerializer
from .models import Design, Photo

KEPT_REFUSED = "a kept cover can't be changed; edit a copy"


def _photo_url(photo):
    """A link to a Photo row, or None (no photo, or one this site may not be handed a link to)."""
    return (generate_presigned_download_url(photo.s3_key) or None) if photo and photo.s3_key else None


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def design_targets(request):
    """Everything she can put a cover on, each with the cover it wears and its draft: her courses in her
    order, then her event series (an event kind and an exact title), the ones with a session still to come
    first, soonest first.

    ponytail: this reads every session of every kind to group them into series (hundreds, not thousands).
    Aggregate in SQL (`values("title").annotate(...)`) if a calendar ever outgrows that."""
    ctx = {}  # what designs.py reads for one row is kept here for the rest
    now = timezone.now()
    drafts = {}  # newest first, so the first one seen is the target's draft
    for kind, key, draft_id in (
        Design.objects.filter(kind="cover", state="draft")
        .order_by("-updated_at")
        .values_list("target_kind", "target_key", "id")
    ):
        drafts.setdefault((kind, key), str(draft_id))

    def target(kind, key, title, row, **fields):
        return {
            "target_kind": kind,
            "target_key": key,
            "title": title,
            "sessions": None,
            "next_at": None,
            "status": None,
            **fields,
            "photo_url": _photo_url(row.thumbnail),
            "cover": designs.cover_for(row, ctx),
            "draft_id": drafts.get((kind, key)),
        }

    courses = [
        target("course", str(course.pk), course.title, course, status="published" if course.is_published else "draft")
        for course in Course.objects.select_related("thumbnail").order_by("order", "title")
    ]
    series = []
    for kind in content.EVENT_KINDS:
        by_title = {}
        for event in content.event_model(kind).objects.select_related("thumbnail"):
            by_title.setdefault(event.title, []).append(event)
        for title, rows in by_title.items():
            to_come = [row.scheduled_at for row in rows if row.scheduled_at and row.scheduled_at >= now]
            # rows[0] is the series' first row, the one Keep reports (the newest created)
            series.append(target(kind, title, title, rows[0], sessions=len(rows), next_at=min(to_come, default=None)))
    # a series with a session to come first, soonest first; the others after them, by title
    series.sort(key=lambda item: (item["next_at"] is None, item["next_at"] or now, item["title"].lower()))

    look, logo_url = designs.site_look(ctx)
    return Response(
        {
            "targets": courses + series,
            "in_use": designs.in_use_assets(),
            "look": look,
            "logo_url": logo_url,
            "generations_left": generation_allowance()["left"],
        }
    )


@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def design_list_create(request):
    """GET: her drafts and kept designs (`?state=draft|kept` for one of them). POST: open the draft of a
    course or event series: 201 when this made it, 200 when she already had one."""
    if request.method == "GET":
        state = request.query_params.get("state")
        if state not in (None, "draft", "kept"):
            return Response({"detail": "state is draft or kept."}, status=status.HTTP_400_BAD_REQUEST)
        rows = Design.objects.exclude(state="retired")  # a retired design is history, not hers any more
        if state:
            rows = rows.filter(state=state)
        return Response(DesignSerializer(rows, many=True).data)

    data = request.data if isinstance(request.data, dict) else {}
    started = timezone.now()
    try:
        draft = designs.open_draft(
            str(data.get("target_kind") or ""),
            str(data.get("target_key") or ""),
            recipe=data.get("recipe"),
            from_id=data.get("from") or None,
        )
    except designs.DesignError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    # open_draft hands back the draft she already had as it is: it is new only if this call made it.
    created = draft.created_at >= started
    return Response(DesignSerializer(draft).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsCoachOrOwner])
def design_detail(request, pk):
    """A design to read; a draft to save (PATCH, the whole recipe) or throw away (DELETE)."""
    with transaction.atomic():
        # A change waits for a Keep under way on the same design (designs.keep locks it too).
        rows = Design.objects.all() if request.method == "GET" else Design.objects.select_for_update()
        design = get_object_or_404(rows, pk=pk)
        if request.method == "GET":
            return Response(DesignSerializer(design).data)
        if design.state != "draft":
            return Response({"detail": KEPT_REFUSED}, status=status.HTTP_400_BAD_REQUEST)
        if request.method == "DELETE":
            design.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        recipe = request.data.get("recipe") if isinstance(request.data, dict) else None
        # The recipe sent replaces the stored one: the editor always sends the whole of it.
        design.recipe = validate_recipe(
            recipe, photo_exists=lambda photo_id: Photo.objects.filter(pk=photo_id).exists()
        )
        design.save(update_fields=["recipe", "updated_at"])
        return Response(DesignSerializer(design).data)


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def design_keep(request, pk):
    """Make a draft the cover of its course or event series, and write the History row that undoes it."""
    from apps.core.copilot.views import _record_audit

    design = get_object_or_404(Design, pk=pk)
    try:
        result, inverse = designs.keep(design)
    except designs.DesignError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    action = {"kind": "keep_cover", "design_id": str(design.pk), "title": result["title"], "made_by": design.made_by}
    audit_id = _record_audit(connection.tenant, request.user, action, result, inverse)
    return Response({"result": result, "audit_id": audit_id})
