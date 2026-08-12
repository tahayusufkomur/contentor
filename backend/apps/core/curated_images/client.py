"""Read side of the remote curated photo catalog (the curated-image-api service).

Contentor no longer owns the photographic library. This module is the only place
that talks to that service: it normalizes the service's Image payload into a
small RemoteImage, caches search pages in Redis, and turns every failure into a
CuratedImageError carrying a sentence a coach can read. Callers fail soft — a
catalog outage must never break the surrounding action.

Spec: docs/superpowers/specs/2026-08-09-curated-images-offload-design.md
"""

import hashlib
import json
import logging
from dataclasses import dataclass

import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

# Collections stand in for the `kind` field the remote catalog does not have.
HERO_COLLECTION = "coach-heroes"
STOCK_COLLECTION = "coach-stock"

MAX_PER_PAGE = 48
UNAVAILABLE = "the photo library is unavailable right now"


class CuratedImageError(Exception):
    """User-safe description of why a catalog operation could not be served."""


@dataclass(frozen=True)
class RemoteImage:
    """One catalog image, reduced to what contentor actually uses.

    `width`/`height` describe the WEB rendition — the one contentor caches and
    renders — not the original master. `local_path`, when set, means this came
    from the offline fixture catalog and its bytes are on disk rather than behind
    a signed URL.
    """

    asset_id: str
    title: str
    description: str
    tags: list[str]
    width: int | None
    height: int | None
    preview_url: str
    web_url: str
    local_path: str = ""


@dataclass(frozen=True)
class SearchPage:
    results: list[RemoteImage]
    page: int
    has_next: bool


def is_fake() -> bool:
    return bool(getattr(settings, "CURATED_IMAGE_API_FAKE", False))


def available() -> bool:
    """Whether the catalog can be reached at all. Surfaces (the library dialog,
    the copilot) check this before offering curated photos."""
    return is_fake() or bool(settings.CURATED_IMAGE_API_URL and settings.CURATED_IMAGE_API_KEY)


def _timeout() -> tuple[float, float]:
    return (settings.CURATED_IMAGE_CONNECT_TIMEOUT, settings.CURATED_IMAGE_READ_TIMEOUT)


def _headers() -> dict[str, str]:
    return {"X-API-Key": settings.CURATED_IMAGE_API_KEY, "Content-Type": "application/json"}


def _url(path: str) -> str:
    return f"{settings.CURATED_IMAGE_API_URL.rstrip('/')}{path}"


def _request(method: str, path: str, *, json_body: dict | None = None, allow_404: bool = False):
    """One upstream call with a single retry. Returns the parsed body, or None
    for an allowed 404. Raises CuratedImageError for everything else."""
    if not available():
        raise CuratedImageError("the photo library is not configured")
    last_error: Exception | None = None
    for _attempt in (1, 2):
        try:
            response = requests.request(method, _url(path), json=json_body, headers=_headers(), timeout=_timeout())
        except requests.RequestException as exc:  # connect/read timeouts, DNS, resets
            last_error = exc
            continue
        if allow_404 and response.status_code == 404:
            return None
        if response.status_code >= 500:
            last_error = RuntimeError(f"upstream {response.status_code}")
            continue
        if response.status_code >= 400:
            # 4xx is our own mistake (bad key, bad request) — retrying cannot fix it.
            logger.error("curated catalog %s %s -> %s %s", method, path, response.status_code, response.text[:300])
            raise CuratedImageError(UNAVAILABLE)
        try:
            return response.json()
        except ValueError as exc:
            last_error = exc
            continue
    logger.warning("curated catalog %s %s failed: %s", method, path, last_error)
    raise CuratedImageError(UNAVAILABLE)


def _image_from_payload(payload: dict) -> RemoteImage:
    renditions = payload.get("renditions") or {}
    web = renditions.get("web") or {}
    thumbnail = renditions.get("thumbnail") or {}
    web_url = web.get("url") or payload.get("url") or ""
    if not payload.get("id") or not web_url:
        raise CuratedImageError(UNAVAILABLE)
    return RemoteImage(
        asset_id=str(payload["id"]),
        title=(payload.get("title") or "")[:200],
        description=(payload.get("description") or "")[:300],
        tags=[str(tag) for tag in (payload.get("tags") or [])],
        width=web.get("width") or payload.get("width"),
        height=web.get("height") or payload.get("height"),
        preview_url=thumbnail.get("url") or web_url,
        web_url=web_url,
    )


def _cache_key(query: str, collection: str | None, page: int, per_page: int) -> str:
    digest = hashlib.sha256(json.dumps([query, collection or "", page, per_page], sort_keys=True).encode()).hexdigest()[
        :32
    ]
    return f"curated-images:v1:search:{digest}"


def search(query: str = "", *, collection: str | None = None, page: int = 1, per_page: int = 24) -> SearchPage:
    """Ranked catalog page for a plain-language query. An empty query browses
    newest-first, which is what a picker opening for the first time wants.

    Cached in Redis so a coach typing does not fan out one upstream request per
    keystroke. The TTL must stay below the service's signed-URL lifetime (15
    minutes) — a cached page hands out URLs that were signed when it was stored.
    """
    query = " ".join((query or "").split())[:2000]
    per_page = max(1, min(per_page, MAX_PER_PAGE))
    page = max(1, page)
    if is_fake():
        from . import fake

        return fake.search(query, collection=collection, page=page, per_page=per_page)

    key = _cache_key(query, collection, page, per_page)
    cached = cache.get(key)
    if cached is None:
        body = _request(
            "POST",
            "/v1/images/search",
            json_body={
                **({"query": query} if query else {}),
                **({"filters": {"collection": collection}} if collection else {}),
                "page": page,
                "per_page": per_page,
            },
        )
        cached = {
            "data": body.get("data") or [],
            "pagination": body.get("pagination") or {},
        }
        ttl = max(60, min(settings.CURATED_IMAGE_CACHE_TTL, 600))
        cache.set(key, cached, ttl)
    return SearchPage(
        results=[_image_from_payload(item) for item in cached["data"]],
        page=page,
        has_next=bool(cached["pagination"].get("has_next")),
    )


def search_or_browse(
    query: str = "", *, collection: str | None = None, page: int = 1, per_page: int = 24
) -> SearchPage:
    """Ranked page for `query`, falling back to browsing the same collection
    when the query matches nothing.

    The catalog's lexical search FILTERS as well as ranks: a coach whose subject
    vocabulary the catalog has no words for — a pole-dance studio, a query in
    another language — gets an empty page even though the library is full. The
    surfaces that must show *something* (the copilot's pick, the wizard's photo
    placement) go through here, so an unmatched niche degrades to a
    generic-but-real photo instead of "no photos are available in the library".
    apps.blog.curated rolls its own narrower fallback on purpose — a cover the
    writer cannot match should offer a handful of heroes, not a full page.

    Only page 1 falls back: a "load more" that runs off the end of a matched
    result set means the coach reached the end of their matches, not that they
    should suddenly be shown unrelated images.
    """
    first = search(query, collection=collection, page=page, per_page=per_page)
    if first.results or not query or page != 1:
        return first
    return search(collection=collection, page=1, per_page=per_page)


def get(asset_id: str) -> RemoteImage | None:
    """One image with a freshly signed rendition URL, or None if the catalog no
    longer serves it. Never cached: the caller is about to download the bytes,
    and a stale signature would fail that fetch."""
    asset_id = (asset_id or "").strip()
    if not asset_id:
        return None
    if is_fake():
        from . import fake

        return fake.get(asset_id)
    body = _request("GET", f"/v1/images/{asset_id}", allow_404=True)
    if body is None:
        return None
    return _image_from_payload(body.get("data") or {})
