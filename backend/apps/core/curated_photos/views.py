"""Coach-facing curated photo library: search + materialize ("use").

CuratedPhoto is public-schema; these endpoints are called from tenant hosts,
so reads hop to the public schema explicitly (same pattern as curated logos).
Coach-auth (IsCoachOrOwner) — unlike the curated LOGO catalog this is not an
anonymous endpoint; only the coach's editor and the AI writer consume it."""

from django.db.models import Q
from django_tenants.utils import schema_context
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.models import CuratedPhoto
from apps.core.permissions import IsCoachOrOwner
from apps.core.storage import generate_presigned_download_url

from .materialize import materialize_curated_photo

MAX_RESULTS = 60


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def curated_photo_search(request):
    kind = request.query_params.get("kind", "").strip()
    query = request.query_params.get("q", "").strip()
    with schema_context("public"):
        qs = CuratedPhoto.objects.filter(enabled=True)
        if kind:
            qs = qs.filter(kind=kind)
        if query:
            qs = qs.filter(Q(title__icontains=query) | Q(tags__icontains=query))
        rows = list(qs.order_by("position", "id")[:MAX_RESULTS])
    out = []
    for row in rows:
        # Never sign anything outside the platform prefix (a bad key must not
        # become a presigned URL into tenant storage).
        if not row.image_key.startswith("platform/"):
            continue
        out.append(
            {
                "id": row.id,
                "title": row.title,
                "kind": row.kind,
                "tags": row.tags,
                "width": row.width,
                "height": row.height,
                "image_url": generate_presigned_download_url(row.image_key, expiry=86400),
            }
        )
    return Response(out)


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def curated_photo_use(request, pk):
    with schema_context("public"):
        row = CuratedPhoto.objects.filter(pk=pk, enabled=True).first()
    if row is None:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
    photo = materialize_curated_photo(row)
    from apps.media.serializers import PhotoSerializer

    return Response(PhotoSerializer(photo).data, status=status.HTTP_201_CREATED)
