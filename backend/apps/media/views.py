from django.db.models import F, Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.pagination import StandardPagination, apply_ordering, apply_tag_filter
from apps.core.permissions import IsCoachOrOwner

from . import own_photos, photo_edits
from .models import Photo
from .serializers import PhotoCreateSerializer, PhotoSerializer

SHAPES = frozenset({"landscape", "portrait", "square"})
# Within 5% of square counts as square, so a 1000×990 crop is not "landscape".
SQUARE_SLACK = 1.05


@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def photo_list_create(request):
    if request.method == "GET":
        qs = Photo.objects.all()
        search = request.query_params.get("search", "").strip()
        if search:
            # The description too: an indexed photo is found by what it shows.
            qs = qs.filter(Q(title__icontains=search) | Q(alt_text__icontains=search))
        # own=1: the photos she uploaded; own=0: Contentor's (catalog copies, logo marks, demo content).
        own = request.query_params.get("own")
        if own == "1":
            qs = qs.exclude(index_status="")
        elif own == "0":
            qs = qs.filter(index_status="")
        # shape: the slot she is filling wants a wide, tall or square photo. One of
        # unknown size (old uploads, demo content) cannot be placed, so it is left out.
        shape = request.query_params.get("shape")
        if shape in SHAPES:
            qs = qs.filter(width__gt=0, height__gt=0)
            if shape == "landscape":
                qs = qs.filter(width__gt=F("height") * SQUARE_SLACK)
            elif shape == "portrait":
                qs = qs.filter(height__gt=F("width") * SQUARE_SLACK)
            else:
                qs = qs.filter(width__lte=F("height") * SQUARE_SLACK, height__lte=F("width") * SQUARE_SLACK)
        qs = apply_tag_filter(qs, request)
        qs = apply_ordering(qs, request, ["title", "created_at", "file_size"])
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = PhotoSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    serializer = PhotoCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    photo = serializer.save()
    own_photos.enqueue_upload(photo)
    return Response(PhotoSerializer(photo).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsCoachOrOwner])
def photo_detail(request, pk):
    try:
        photo = Photo.objects.get(pk=pk)
    except Photo.DoesNotExist:
        return Response({"detail": "Photo not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(PhotoSerializer(photo).data)

    if request.method == "PUT":
        serializer = PhotoCreateSerializer(photo, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(PhotoSerializer(photo).data)

    own_photos.forget(photo)
    photo.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


def _photo(pk):
    return Photo.objects.filter(pk=pk).first()


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def photo_colours(request, pk):
    """The colours her photo is made of, most of it first: the studio offers them beside her look's."""
    photo = _photo(pk)
    if photo is None:
        return Response({"detail": "Photo not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response({"colours": photo_edits.colours(photo)})


def _job_response(job_id: str, state: dict) -> dict:
    """What the studio follows: done once the job ended, with her new photo when it worked."""
    photo = _photo(state["photo"]) if state.get("photo") else None
    return {
        "job_id": job_id,
        "status": state["status"],
        "done": state["status"] != "running",
        "photo": PhotoSerializer(photo).data if photo else None,
    }


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def photo_cutout(request, pk):
    """Start removing her photo's background (free: our own service). 202 with the job to follow."""
    if not photo_edits.cutout_available():
        return Response({"detail": "Removing backgrounds is not on for this site."}, status=503)
    photo = _photo(pk)
    if photo is None:
        return Response({"detail": "Photo not found."}, status=status.HTTP_404_NOT_FOUND)
    job_id = photo_edits.start(photo, photo_edits.CUTOUT)
    return Response(_job_response(job_id, {"status": "running"}), status=status.HTTP_202_ACCEPTED)


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def photo_edit(request, pk):
    """Start an edit by the image model: `{"mode": "expand", "aspect": 3}` grows the photo to that shape;
    `{"mode": "erase" | "change", "instruction": "..."}` takes out or changes what it says. Each is one of the
    month's new photos: 429 once they are used."""
    from apps.core.curated_images.views import count_generation, generation_allowance

    if not photo_edits.ai_available():
        return Response({"detail": "Photo edits are not on for this site."}, status=503)
    photo = _photo(pk)
    if photo is None:
        return Response({"detail": "Photo not found."}, status=status.HTTP_404_NOT_FOUND)
    data = request.data if isinstance(request.data, dict) else {}
    mode = data.get("mode")
    words = str(data.get("instruction") or "").strip()[: photo_edits.INSTRUCTION_MAX]
    aspect = None
    if mode == photo_edits.EXPAND:
        try:
            aspect = float(data.get("aspect"))
        except (TypeError, ValueError):
            aspect = None
        if aspect is None or not 0.2 <= aspect <= 5:
            return Response({"detail": "Say the shape to extend the photo to."}, status=400)
    elif mode in (photo_edits.ERASE, photo_edits.CHANGE):
        if not words:
            return Response({"detail": "Say what to change."}, status=400)
    else:
        return Response({"detail": "Unknown edit."}, status=400)
    if generation_allowance()["left"] <= 0:
        return Response(
            {"detail": "You have used this month's image generations."}, status=status.HTTP_429_TOO_MANY_REQUESTS
        )
    count_generation()
    job_id = photo_edits.start(photo, mode, aspect=aspect, words=words)
    return Response(_job_response(job_id, {"status": "running"}), status=status.HTTP_202_ACCEPTED)


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def photo_job(request, job_id):
    """Where an edit stands. Another site's job, or one long gone, is a 404."""
    state = photo_edits.job(job_id)
    if state is None:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(_job_response(job_id, state))
