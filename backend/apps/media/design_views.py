"""The photo studio's API: what she can put a cover on, her designs, and Keep.

The work is in designs.py; these views map it onto HTTP. Every query runs in the active tenant's schema,
so a design of another site is a 404.
"""

from django.db import connection, transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core.copilot import content
from apps.core.curated_images.views import generation_allowance
from apps.core.permissions import IsCoachOrOwner
from apps.core.storage import generate_presigned_download_url, sign_if_s3_key
from apps.courses.models import Course
from apps.downloads.models import DownloadFile

from . import design_ai, design_export, designs, photo_edits
from .design_recipe import validate_recipe
from .design_serializers import DesignSerializer
from .models import Design, Photo

KEPT_REFUSED = "a kept cover can't be changed; edit a copy"


def _photo_url(row):
    """A link to the picture a course or event wears: its photo, else the free-text link older rows carry
    (signed as the course serializers sign it). None for no picture, or one this site may not be handed a
    link to."""
    photo = row.thumbnail
    if photo and photo.s3_key:
        return generate_presigned_download_url(photo.s3_key) or None
    return sign_if_s3_key(getattr(row, "thumbnail_url", "")) or None


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def design_targets(request):
    """Everything she can put a cover on, each with the cover it wears and its draft: her courses in her
    order, then her event series (an event kind and an exact title), the ones with a session still to come
    first, soonest first, then her downloads.

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
            "created_at": None,  # a course's, for the "New" badge its cover may carry
            "path": None,  # the page of her site it is on, which a QR code on its cover opens
            **fields,
            "photo_url": _photo_url(row),
            "cover": designs.cover_for(row, ctx),
            "draft_id": drafts.get((kind, key)),
        }

    courses = [
        target(
            "course",
            str(course.pk),
            course.title,
            course,
            status="published" if course.is_published else "draft",
            created_at=course.created_at,
            path=f"/courses/{course.slug}",
        )
        for course in Course.objects.select_related("thumbnail").order_by("order", "title")
    ]
    downloads = [
        target(
            "download",
            str(download.pk),
            download.title,
            download,
            status="published" if download.is_published else "draft",
            created_at=download.created_at,
            path="/store",
        )
        for download in DownloadFile.objects.select_related("thumbnail")
    ]
    series = []
    for kind in content.EVENT_KINDS:
        by_title = {}
        for event in content.event_model(kind).objects.select_related("thumbnail"):
            by_title.setdefault(event.title, []).append(event)
        for title, rows in by_title.items():
            to_come = [row.scheduled_at for row in rows if row.scheduled_at and row.scheduled_at >= now]
            # rows[0] is the series' first row, the one Keep reports (the newest created)
            series.append(
                target(
                    kind,
                    title,
                    title,
                    rows[0],
                    sessions=len(rows),
                    next_at=min(to_come, default=None),
                    path="/events",
                )
            )
    # a series with a session to come first, soonest first; the others after them, by title
    series.sort(key=lambda item: (item["next_at"] is None, item["next_at"] or now, item["title"].lower()))

    look, logo_url = designs.site_look(ctx)
    return Response(
        {
            "targets": courses + series + downloads,
            "in_use": designs.in_use_assets(),
            "look": look,
            "logo_url": logo_url,
            "generations_left": generation_allowance()["left"],
            "photo_ai": photo_edits.ai_available(),
            "cutout": photo_edits.cutout_available(),
            "export": design_export.available(),
            "words_ai": design_ai.available(),
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
        rows, ctx = list(rows), {}  # what is read for one design is kept in ctx for the rest
        designs.read_photos(rows, ctx)
        return Response(DesignSerializer(rows, many=True, context=ctx).data)

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
        # The recipe sent replaces the stored one: the editor always sends the whole of it. The photo
        # already on the draft stays valid after she deletes it in Media, so her words still save (Keep
        # says the photo is gone); any other id has to be one of her photos.
        stored = designs._recipe_photo(design.recipe)
        design.recipe = validate_recipe(
            recipe, photo_exists=lambda photo_id: photo_id == stored or Photo.objects.filter(pk=photo_id).exists()
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


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def design_export_view(request, pk):
    """The design as an image file to download: `{"size": "story", "format": "png" | "jpeg"}`. Drawn from what
    is saved, so the studio saves first."""
    if not design_export.available():
        return Response({"detail": "Downloads are not on for this site."}, status=503)
    design = get_object_or_404(Design, pk=pk)
    data = request.data if isinstance(request.data, dict) else {}
    size, fmt = data.get("size"), data.get("format", "png")
    if size not in design_export.WIDTHS or fmt not in design_export.FORMATS:
        return Response({"detail": "Choose a size and png or jpeg."}, status=400)
    try:
        image = design_export.render(design, size, fmt)
    except design_export.ExportError as exc:
        return Response({"detail": str(exc)}, status=503)
    name = slugify(designs.target_title(design.target_kind, design.target_key))[:60] or "cover"
    response = HttpResponse(image, content_type=design_export.FORMATS[fmt])
    response["Content-Disposition"] = f'attachment; filename="{name}-{size}.{"jpg" if fmt == "jpeg" else "png"}"'
    return response


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def design_render(request, token):
    """What the render page draws: a design and what it is for, at one size. Open to anyone holding a token
    this site signed in the last two minutes (design_export), which is how the browser sidecar reads it."""
    found = design_export.read_token(token)
    design = Design.objects.filter(pk=found[0]).first() if found else None
    if design is None:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(
        {
            "design": designs.design_payload(design, {}),
            "item": design_export.item_of(design),
            "size": found[1],
        }
    )


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def design_words(request, pk):
    """Three options for one of the cover's words: `{"part": "label" | "title" | "subtitle"}`."""
    from apps.core import ai as core_ai

    design = get_object_or_404(Design, pk=pk)
    part = request.data.get("part") if isinstance(request.data, dict) else None
    if part not in design_ai.PARTS:
        return Response({"detail": "part is label, title or subtitle."}, status=400)
    try:
        options = design_ai.suggest_words(design, part)
    except design_ai.AiUnavailableError:
        return Response({"detail": "Suggestions are not on for this site."}, status=503)
    except core_ai.AiError:
        return Response({"detail": "No words came back. Try again."}, status=502)
    return Response({"options": options})


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def design_styles(request, pk):
    """Four styles for the cover on its own photo, as recipes the studio draws and applies. `{"shown":
    ["panel", ...]}`: the layouts she has already been shown, so "Four more" brings others."""
    design = get_object_or_404(Design, pk=pk)
    shown = request.data.get("shown") if isinstance(request.data, dict) else None
    shown = [str(layout) for layout in shown if isinstance(layout, str)][:40] if isinstance(shown, list) else []
    return Response({"styles": design_ai.four_styles(design, shown)})
