"""Public read side of the curated logo library: the Logo Studio's Browse
entrance fetches this from tenant subdomains. Unauthenticated by design —
the catalog is platform-global marketing-style content."""

from django_tenants.utils import schema_context
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core.models import CuratedLogo
from apps.core.storage import generate_presigned_download_url


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def curated_catalog(request):
    # CuratedLogo is a SHARED_APPS model — its table exists only in the public
    # schema, but this endpoint is called from tenant hosts.
    with schema_context("public"):
        rows = list(CuratedLogo.objects.filter(enabled=True).order_by("position", "id"))
    out = []
    for row in rows:
        key = row.image_key or ""
        # Never sign anything outside the platform prefix (a bad key must not
        # become a presigned URL into tenant storage).
        if not key.startswith("platform/"):
            continue
        out.append(
            {
                "title": row.title,
                "filename": key.rsplit("/", 1)[-1],
                "prompt": row.prompt,
                "tags": row.tags,
                "image_url": generate_presigned_download_url(key, expiry=86400),
                "mark_paths": row.mark_paths,
            }
        )
    return Response(out)
