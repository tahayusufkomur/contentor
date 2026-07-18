"""Superadmin platform-asset upload: one multipart POST -> object under
platform/<prefix>/, returns {key, url}. The generic adminkit image widget
posts here (ModelAdmin.image_upload_url)."""

import io
import re
import uuid

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.core.curated_logos.clean import clean_curated_png
from apps.core.permissions import IsSuperUser
from apps.core.storage import generate_presigned_download_url, get_s3_client

_PREFIX_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
MAX_UPLOAD_BYTES = 5 * 1024 * 1024


def _store_object(key, fileobj, content_type):
    get_s3_client().upload_fileobj(fileobj, settings.AWS_BUCKET_NAME, key, ExtraArgs={"ContentType": content_type})


@api_view(["POST"])
@permission_classes([IsSuperUser])
@parser_classes([MultiPartParser, FormParser])
def platform_upload(request):
    file = request.FILES.get("file")
    if file is None:
        return Response({"detail": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)
    prefix = request.data.get("prefix") or "images"
    if not _PREFIX_RE.match(prefix):
        return Response({"detail": "Invalid prefix."}, status=status.HTTP_400_BAD_REQUEST)
    if file.size > MAX_UPLOAD_BYTES:
        return Response({"detail": "File too large (max 5 MB)."}, status=status.HTTP_400_BAD_REQUEST)
    head = file.read(8)
    file.seek(0)
    if head != _PNG_MAGIC:
        return Response({"detail": "Only PNG images are supported."}, status=status.HTTP_400_BAD_REQUEST)
    key = f"platform/{prefix}/{uuid.uuid4().hex}.png"
    # Curated library art must blend with tenant UIs: strip the white canvas
    # and crop to the mark on the way in (best effort, other prefixes as-is).
    fileobj = io.BytesIO(clean_curated_png(file.read())) if prefix == "curated-logos" else file
    _store_object(key, fileobj, "image/png")
    return Response(
        {"key": key, "url": generate_presigned_download_url(key, expiry=86400)},
        status=status.HTTP_201_CREATED,
    )
