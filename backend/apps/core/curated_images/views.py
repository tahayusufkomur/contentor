"""Coach-facing curated image library: search the remote catalog, cache on use.

Replaces the old curated_photos endpoints for photography. The `use/` contract is
unchanged — POST returns a tenant media.Photo — so the editor still materializes
before it inserts. Coach-auth (IsCoachOrOwner); only the coach's editor and the
AI writer consume this.
"""

import logging

from django.conf import settings
from django.http import FileResponse, Http404
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner

from . import client
from .cache import cache_remote_image
from .client import CuratedImageError

logger = logging.getLogger(__name__)

COLLECTIONS = {client.HERO_COLLECTION, client.STOCK_COLLECTION}


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
    collection = request.query_params.get("collection", "").strip() or None
    if collection and collection not in COLLECTIONS:
        return Response({"detail": "Unknown collection."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        page_number = max(1, int(request.query_params.get("page", "1")))
    except ValueError:
        page_number = 1
    try:
        page = client.search(
            request.query_params.get("q", ""),
            collection=collection,
            page=page_number,
            per_page=24,
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
