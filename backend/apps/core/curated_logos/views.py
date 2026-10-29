"""Public read side of the curated logo library: the Logo Studio's Browse
entrance fetches this from tenant subdomains. Unauthenticated by design —
the catalog is platform-global marketing-style content."""

from django.utils.translation import gettext as _
from django_tenants.utils import schema_context
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core.models import CuratedLogo
from apps.core.permissions import IsCoachOrOwner
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
                "id": row.id,
                "title": row.title,
                "filename": key.rsplit("/", 1)[-1],
                "prompt": row.prompt,
                "tags": row.tags,
                "image_url": generate_presigned_download_url(key, expiry=86400),
                "mark_paths": row.mark_paths,
            }
        )
    return Response(out)


LIBRARY_PAGES = 2  # 24 marks: the Studio's Ideas wall shows twenty


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def library(request):
    """The Logo Studio's ready-made marks for a query ("yoga elegant").

    With LOGO_SOURCE=pix4less they come from the remote catalog. Otherwise, or
    when it cannot be reached, ``source: "local"`` sends the Studio to the
    local catalog above. Coach-only and cached per query (client.search), so
    anonymous traffic cannot run catalog searches.

    ponytail: one wall of 24, no "load more"; page it when coaches ask.
    """
    from apps.core.curated_images import client

    if not client.logos_available():
        return Response({"source": "local"})
    try:
        query = client.logo_query(request.query_params.get("q", ""))
        marks = []
        for page in range(1, LIBRARY_PAGES + 1):
            found = client.search(query, kind=client.LOGO, page=page)
            marks += found.results
            if not found.has_next:
                break
    except client.CuratedImageError:
        return Response({"source": "local"})
    return Response(
        {
            "source": "pix4less",
            "results": [
                {
                    "id": m.asset_id,
                    "title": m.title,
                    "description": m.description,
                    "tags": m.tags,
                    "image_url": m.preview_url,
                }
                for m in marks
            ],
        }
    )


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def library_use(request, asset_id):
    """Take a catalog mark into this tenant: its image is copied into her
    storage (a media.Photo) and traced, so the Studio can recolour it. A mark
    that does not trace into a flat vector comes back as the image alone."""
    import uuid

    from apps.core.copilot.logos import traced_paths
    from apps.core.curated_images import client
    from apps.core.curated_images.cache import cached_asset
    from apps.media.serializers import PhotoSerializer

    try:
        asset_id = str(uuid.UUID(asset_id))
    except ValueError:
        asset_id = ""
    photo = cached_asset(asset_id) if asset_id and client.logos_available() else None
    if photo is None:
        return Response({"detail": _("That logo isn't available right now.")}, status=404)
    return Response({"photo": PhotoSerializer(photo).data, "mark_paths": traced_paths(photo.s3_key) or None})
