"""Copy-on-use: the tenant's own cached copy of a remote catalog image.

The old catalog lived in contentor's bucket, so "using" a curated photo was just
a reference. The photography now lives in another service, so a use copies the
web rendition into `tenants/<slug>/curated/<asset-id>.webp` and points a tenant
media.Photo at it. From then on the image renders from the tenant's own storage
and never depends on the catalog again — a rejected or re-signed upstream asset
cannot break a published page.

The key is derived from the asset id, so a second use of the same image is a
`s3_key` lookup rather than a second download, and the copilot can still tell
which catalog asset a block's photo came from ("try another").

Spec: docs/superpowers/specs/2026-08-09-curated-images-offload-design.md
"""

import io
import logging
from urllib.parse import urlparse

import requests
from django.conf import settings

from .client import CuratedImageError, RemoteImage

logger = logging.getLogger(__name__)

CONTENT_TYPE = "image/webp"
FAILED = "that photo could not be saved to your library"


def tenant_key_for(asset_id: str) -> str:
    from apps.core.storage import build_s3_path

    return build_s3_path("curated", f"{asset_id}.webp")


def asset_id_from_key(s3_key: str) -> str:
    """The catalog asset a cached tenant key came from, or "" for anything else
    (coach uploads, legacy platform/curated-photos objects)."""
    if not isinstance(s3_key, str) or "/curated/" not in s3_key or not s3_key.endswith(".webp"):
        return ""
    return s3_key.rsplit("/", 1)[-1][: -len(".webp")]


def _host_allowed(hostname: str | None) -> bool:
    """Whether an allowlisted domain may serve rendition bytes.

    S3-compatible providers sign virtual-host style — the live URLs are
    `<bucket>.fsn1.your-objectstorage.com` — so an allowlist entry also covers its
    subdomains. The dot boundary is what keeps that safe: `fsn1.example.com`
    matches `bucket.fsn1.example.com` but never `evil-fsn1.example.com`.
    """
    if not hostname:
        return False
    # The service serves previews from its own origin; the allowlist covers
    # any object-storage host it signs URLs for.
    if hostname == urlparse(settings.CURATED_IMAGE_API_URL).hostname:
        return True
    return any(
        hostname == allowed or hostname.endswith(f".{allowed}") for allowed in settings.CURATED_IMAGE_MEDIA_HOSTS
    )


def _download(image: RemoteImage) -> bytes:
    """Rendition bytes, with the guards that a URL chosen by another service
    requires: an allowlisted https host (SSRF), the expected content type, and a
    hard byte cap enforced while streaming rather than after."""
    if image.local_path:  # offline fixture catalog
        with open(image.local_path, "rb") as handle:
            return handle.read()

    parsed = urlparse(image.web_url)
    if parsed.scheme != "https" or not _host_allowed(parsed.hostname):
        logger.error("curated image host not allowed: %s", parsed.hostname)
        raise CuratedImageError(FAILED)

    limit = settings.CURATED_IMAGE_MAX_BYTES
    try:
        with requests.get(
            image.web_url,
            stream=True,
            timeout=(settings.CURATED_IMAGE_CONNECT_TIMEOUT, settings.CURATED_IMAGE_READ_TIMEOUT),
        ) as response:
            if response.status_code != 200:
                logger.warning("curated image download %s -> %s", image.asset_id, response.status_code)
                raise CuratedImageError(FAILED)
            content_type = (response.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            if content_type != CONTENT_TYPE:
                logger.error("curated image %s served %r, expected %s", image.asset_id, content_type, CONTENT_TYPE)
                raise CuratedImageError(FAILED)
            body = bytearray()
            for chunk in response.iter_content(64 * 1024):
                body.extend(chunk)
                if len(body) > limit:
                    logger.error("curated image %s exceeds %s bytes", image.asset_id, limit)
                    raise CuratedImageError(FAILED)
    except requests.RequestException as exc:
        logger.warning("curated image download failed for %s: %s", image.asset_id, exc)
        raise CuratedImageError(FAILED) from exc
    if not body:
        raise CuratedImageError(FAILED)
    return bytes(body)


def cache_remote_image(image: RemoteImage):
    """The tenant media.Photo for this catalog image, downloading it into tenant
    storage on first use. Callers must already be inside the tenant context.
    Function-local model import: core is SHARED_APPS, media is TENANT_APPS."""
    from apps.core.platform.uploads import _store_object
    from apps.media.models import Photo

    key = tenant_key_for(image.asset_id)
    existing = Photo.objects.filter(s3_key=key).first()
    if existing is not None:
        return existing

    body = _download(image)
    _store_object(key, io.BytesIO(body), CONTENT_TYPE)
    return Photo.objects.create(
        s3_key=key,
        title=image.title,
        alt_text=image.description,
        content_type=CONTENT_TYPE,
        file_size=len(body),
        width=image.width,
        height=image.height,
    )


def auto_cover(*queries: str, keep=None):
    """A wide catalog photo for something automation just created without one
    (a seeded draft course, a copilot-created course or event), as a tenant
    media.Photo — or None. Fail-soft: content creation must never fail because
    the library is down or has nothing to offer. Must run inside the tenant
    context.

    `queries` are tried most-specific first (niche + title, then the niche
    alone); the catalog drops whatever it cannot match, so the last resort is
    browsing with no query at all.

    Prefers a match this tenant has not used yet, so three seeded courses whose
    titles the catalog has no words for don't all get the same fallback photo.
    ``keep`` filters results (e.g. no photo of another discipline).
    """
    from apps.media.models import Photo

    from . import client

    try:
        results = []
        for query in dict.fromkeys((*queries, "")):  # de-duplicated, in order
            results = [i for i in client.search(query, orientation=client.WIDE).results if keep is None or keep(i)]
            if results:
                break
        else:
            return None
        used = set(
            Photo.objects.filter(s3_key__in=[tenant_key_for(i.asset_id) for i in results]).values_list(
                "s3_key", flat=True
            )
        )
        fresh = next((image for image in results if tenant_key_for(image.asset_id) not in used), results[0])
        return cache_remote_image(fresh)
    except CuratedImageError:
        logger.warning("auto cover unavailable for %r", queries[:1])
        return None
