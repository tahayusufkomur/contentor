"""Pictures in emails, on links that keep working.

Tenant storage is private (presigned links last an hour) and her own photos are AVIF, which most
inboxes don't show. An email therefore points at ``/api/v1/email/i/<token>/`` on her own site: the token
signs the stored key, and the route streams an email-safe copy (JPEG, or PNG when it has transparency,
at most 1200 px wide), made on the first request and kept next to her files.
"""

import hashlib
import io
import logging
from urllib.parse import unquote, urlsplit

from botocore.exceptions import ClientError
from django.conf import settings
from django.core import signing
from django.http import HttpResponse
from PIL import Image, ImageOps
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny

from apps.core.storage import build_s3_path, get_s3_client, is_signable_key

logger = logging.getLogger(__name__)

_SALT = "email_campaigns.image"
# ?a= on a picture link crops it to this shape, centred a little above the middle (faces sit high).
ASPECTS = {"16:9": 16 / 9, "3:2": 3 / 2, "4:3": 4 / 3, "1:1": 1.0, "4:5": 4 / 5}
EMAIL_MAX_WIDTH = 1200  # px: a full-width image in a 600 px email on a 2x screen
MAX_SOURCE_BYTES = 40 * 1024 * 1024  # a guard, not a limit: no photo she stores is this big
YEAR = 365 * 24 * 3600


class NotAnImageError(Exception):
    pass


def stable_url(key: str, *, site: str) -> str:
    """The lasting link to a stored object, on ``site`` (her site, or the platform's)."""
    return f"{site}/api/v1/email/i/{signing.dumps(key, salt=_SALT, compress=True)}/"


def with_aspect(url: str, aspect: str) -> str:
    """The same lasting picture cropped to ``aspect``; any other link is left as it is."""
    if "/api/v1/email/i/" not in (url or "") or aspect not in ASPECTS:
        return url
    return url.split("?", 1)[0] + f"?a={aspect}"


def _own_key(url: str) -> str:
    """The key behind a link into our own bucket (a presigned or plain storage URL a field kept), else ""."""
    marker = f"/{settings.AWS_BUCKET_NAME}/"
    path = urlsplit(url).path
    return unquote(path.split(marker, 1)[1]) if settings.AWS_BUCKET_NAME and marker in path else ""


def stable_url_for(photo=None, stored: str = "", *, site: str) -> str:
    """A Photo's (or a stored key's) lasting link; an outside https link stays as it is; "" for none. A
    link into our own storage (it expires, or the bucket is private) becomes a lasting link too."""
    key = photo.s3_key if photo is not None and getattr(photo, "s3_key", "") else (stored or "")
    if not key:
        return ""
    if key.startswith(("https://", "http://")):
        own = _own_key(key)
        return stable_url(own, site=site) if own else key
    return stable_url(key, site=site)


def _crop(im, ratio: float):
    width = min(im.width, EMAIL_MAX_WIDTH)
    height = round(width / ratio)
    if height > im.height:
        height = im.height
        width = round(height * ratio)
    return ImageOps.fit(im, (max(1, width), max(1, height)), Image.Resampling.LANCZOS, centering=(0.5, 0.4))


def email_safe(body: bytes, aspect: str | None = None) -> tuple[bytes, str]:
    """Any image Pillow reads, as (bytes, content type) every mail client shows: PNG when it has
    transparency, JPEG otherwise; upright, at most EMAIL_MAX_WIDTH wide (cropped to ``aspect`` when
    given), colour profile kept, other metadata dropped. (MailCraft's templates_api.generation.email_safe.)"""
    try:
        im = ImageOps.exif_transpose(Image.open(io.BytesIO(body)))
        if aspect in ASPECTS:
            im = _crop(im, ASPECTS[aspect])
        im.thumbnail((EMAIL_MAX_WIDTH, EMAIL_MAX_WIDTH * 4))
        icc = {"icc_profile": im.info["icc_profile"]} if im.info.get("icc_profile") else {}
        out = io.BytesIO()
        if im.mode in ("RGBA", "LA", "PA") or (im.mode == "P" and "transparency" in im.info):
            im = im.convert("RGBA")
            if im.getchannel("A").getextrema()[0] < 255:
                im.save(out, "PNG", optimize=True, **icc)
                return out.getvalue(), "image/png"
        im.convert("RGB").save(out, "JPEG", quality=85, optimize=True, progressive=True, **icc)
        return out.getvalue(), "image/jpeg"
    except (OSError, ValueError, Image.DecompressionBombError) as e:
        raise NotAnImageError(str(e)) from e


def _derived_key(key: str, aspect: str | None) -> str:
    name = f"{key}|{aspect or ''}"
    return build_s3_path("email", hashlib.sha1(name.encode(), usedforsecurity=False).hexdigest())


def email_copy(key: str, aspect: str | None = None) -> tuple[bytes, str]:
    """The email-safe copy of a stored object (cropped to ``aspect``), made and kept on first use."""
    client, bucket = get_s3_client(), settings.AWS_BUCKET_NAME
    derived = _derived_key(key, aspect)
    try:
        obj = client.get_object(Bucket=bucket, Key=derived)
        return obj["Body"].read(), obj.get("ContentType") or "image/jpeg"
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") not in ("NoSuchKey", "404"):
            raise
    source = client.get_object(Bucket=bucket, Key=key)
    if (source.get("ContentLength") or 0) > MAX_SOURCE_BYTES:
        raise NotAnImageError("too large")
    body, content_type = email_safe(source["Body"].read(), aspect)
    client.put_object(Bucket=bucket, Key=derived, Body=body, ContentType=content_type)
    return body, content_type


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def email_image(request, token: str):
    """Public: inboxes fetch these without a session. Only keys this site may hand out are served."""
    try:
        key = signing.loads(token, salt=_SALT)
    except signing.BadSignature:
        return HttpResponse(status=404)
    if not isinstance(key, str) or not is_signable_key(key):
        return HttpResponse(status=404)
    aspect = request.GET.get("a")
    try:
        body, content_type = email_copy(key, aspect if aspect in ASPECTS else None)
    except ClientError:
        return HttpResponse(status=404)
    except NotAnImageError:
        logger.warning("email image %s is not an image", key)
        return HttpResponse(status=404)
    response = HttpResponse(body, content_type=content_type)
    response["Cache-Control"] = f"public, max-age={YEAR}, immutable"
    return response
