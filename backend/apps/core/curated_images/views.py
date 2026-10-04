"""Coach-facing curated image library: search the remote catalog, cache on use.

Replaces the old curated_photos endpoints for photography. The `use/` contract is
unchanged — POST returns a tenant media.Photo — so the editor still materializes
before it inserts. Coach-auth (IsCoachOrOwner); only the coach's editor and the
AI writer consume this.
"""

import logging
import uuid

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner

from . import client
from .cache import cache_remote_image
from .client import CuratedImageError

logger = logging.getLogger(__name__)


def _serialize(image: client.RemoteImage) -> dict:
    return {
        "id": image.asset_id,
        "title": image.title,
        "alt_text": image.description,
        "tags": image.tags,
        "width": image.width,
        "height": image.height,
        "image_url": image.preview_url,
    }


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def curated_image_search(request):
    orientation = request.query_params.get("orientation", "").strip() or None
    if orientation and orientation not in client.ORIENTATIONS:
        return Response({"detail": "Unknown orientation."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        page_number = max(1, int(request.query_params.get("page", "1")))
    except ValueError:
        page_number = 1
    try:
        page = client.search(
            request.query_params.get("q", ""),
            orientation=orientation,
            page=page_number,
        )
    except CuratedImageError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    return Response(
        {
            "results": [_serialize(image) for image in page.results],
            "page": page.page,
            "has_next": page.has_next,
        }
    )


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def curated_image_use(request, asset_id):
    try:
        image = client.get(asset_id)
    except CuratedImageError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    if image is None:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
    try:
        photo = cache_remote_image(image)
    except CuratedImageError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    from apps.media.serializers import PhotoSerializer

    return Response(PhotoSerializer(photo).data, status=status.HTTP_201_CREATED)


def _job_response(job: client.GenerationJob) -> dict:
    """What the picker polls for. A fulfilled job is copied into tenant media
    right here, so the caller gets an ordinary tenant Photo like any other pick."""
    body = {"job_id": job.job_id, "status": job.status, "done": job.done, "photo": None}
    if job.image is not None:
        from apps.media.serializers import PhotoSerializer

        body["photo"] = PhotoSerializer(cache_remote_image(job.image)).data
    return body


def _job_key(job_id: str) -> str:
    return f"curated-images:job:{job_id}"


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def curated_image_generate(request):
    """Queue a brand-new image for when search finds nothing that fits. Unlike
    search this costs credits per image, so each tenant gets a monthly cap."""
    prompt = str(request.data.get("prompt") or "").strip()
    aspect_ratio = str(request.data.get("aspect_ratio") or "16:9")
    if not prompt or aspect_ratio not in client.GENERATION_ASPECT_RATIOS:
        return Response({"detail": "Describe the image you want."}, status=status.HTTP_400_BAD_REQUEST)
    # ponytail: the cap lives in the cache, so a Redis flush resets the month.
    # Move it to a usage model if generation ever needs an audit trail.
    count_key = f"curated-images:generated:{connection.schema_name}:{timezone.now():%Y-%m}"
    if cache.get(count_key, 0) >= settings.CURATED_IMAGE_GENERATE_MONTHLY_LIMIT:
        return Response(
            {"detail": "You have used this month's image generations."}, status=status.HTTP_429_TOO_MANY_REQUESTS
        )
    try:
        job = client.generate(prompt, aspect_ratio=aspect_ratio, idempotency_key=uuid.uuid4().hex)
        body = _job_response(job)
    except CuratedImageError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    if job.done and job.image is None:  # the service refused the description outright
        return Response({"detail": "That description could not be turned into an image."}, status=422)
    cache.add(count_key, 0, timeout=40 * 86400)
    cache.incr(count_key)
    # Job ids belong to the platform's one account; remember whose this is so a
    # tenant can only poll (and collect the image of) jobs it started.
    cache.set(_job_key(job.job_id), connection.schema_name, timeout=3600)
    return Response(body, status=status.HTTP_202_ACCEPTED)


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def curated_image_generation(request, job_id):
    if cache.get(_job_key(job_id)) != connection.schema_name:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
    try:
        # Long-poll: most jobs take about a minute, so hold each status call a
        # few seconds rather than have the picker hammer the endpoint.
        job = client.generation(job_id, wait=8)
        if job is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(_job_response(job))
    except CuratedImageError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def curated_image_fixture_preview(request, asset_id):
    """Bytes for an offline fixture image. Real catalog previews are signed URLs
    straight from the service; this exists only so the picker shows something in
    dev and e2e, where there is no signed URL to hand an <img> tag (which cannot
    carry the JWT anyway). 404 whenever fake mode is off — including production,
    which refuses the flag outright."""
    if not client.is_fake():
        raise Http404
    from .fake import fixture_path

    path = fixture_path(asset_id)
    if not path:
        raise Http404
    # noqa SIM115: FileResponse takes ownership of the handle and closes it when
    # the response finishes streaming — a context manager here would close the
    # file before WSGI ever reads it.
    response = FileResponse(open(path, "rb"), content_type="image/webp")  # noqa: SIM115
    response["Cache-Control"] = f"public, max-age={settings.CURATED_IMAGE_CACHE_TTL}"
    return response
