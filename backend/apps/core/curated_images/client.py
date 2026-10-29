"""Read side of the remote photo catalog: Pix4Less (https://pix4less.com/docs).

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
from dataclasses import dataclass, replace
from urllib.parse import urljoin

import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

# What a hero background or a cover asks for: the catalog has no "hero" kind,
# but a wide shot is what those slots need.
WIDE = "landscape"
ORIENTATIONS = frozenset({"landscape", "portrait", "square"})
# The exact shapes the search can filter to (POST /v1/images/search filters.aspect_ratio).
SEARCH_ASPECT_RATIOS = frozenset({"16:9", "1:1", "4:3", "3:2", "9:16", "4:5"})

# Where the main subject sits in the frame, as the catalog observed it from the
# pixels (`subject_placement`; None = not observed). `left_third` leaves the
# right free for copy, `right_third` the mirror.
PLACEMENTS = frozenset({"centered", "left_third", "right_third", "off_center"})
# What a text-overlay slot wants. The first two are catalog values and can be
# sent as a search filter; NOT_CENTERED ("the words run along the bottom") is
# only a client-side rule, since the filter takes one value.
NOT_CENTERED = "not_centered"
_PLACEMENT_MATCH = {
    "left_third": {"left_third"},
    "right_third": {"right_third"},
    NOT_CENTERED: {"left_third", "right_third", "off_center"},
}
_PLACEMENT_WRONG = {
    "left_third": {"centered", "right_third"},
    "right_third": {"centered", "left_third"},
    NOT_CENTERED: {"centered"},
}

MAX_PER_PAGE = 12  # the service's hard page size
# What a search returns: photographs, or logo marks (symbols without text on a
# transparent background). The service never mixes the two.
PHOTO = "photo"
LOGO = "logo"
UNAVAILABLE = "the photo library is unavailable right now"
OUT_OF_CREDITS = "image credits are used up for now"

# Generation (POST /v1/images/generate): the service's default model caps its
# prompt at 451 characters, and a job ends in exactly one of these states.
GENERATION_PROMPT_MAX = 450
GENERATION_ASPECT_RATIOS = frozenset({"16:9", "1:1", "4:3", "9:16", "4:5"})
GENERATION_DONE = frozenset({"fulfilled", "failed", "rejected"})


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
    subject_placement: str | None = None
    # Logo marks only (kind=logo): ink colours as hex, most used first.
    colors: tuple[str, ...] = ()


@dataclass(frozen=True)
class SearchPage:
    results: list[RemoteImage]
    page: int
    has_next: bool
    # Set when the caller searched with a session. The service remembers what a
    # session has already been handed and excludes it (atomically, even under
    # concurrent calls), which is what "show me another" rides on.
    session_id: str = ""
    # The session has now seen every match above the service's confidence floor,
    # so this page restarts at the highest-confidence one. Callers that want
    # genuine variety treat it as "widen the query", not "here is something new".
    shuffle_cycle_restarted: bool = False


@dataclass(frozen=True)
class GenerationJob:
    """A queued/finished request for a brand-new image. `image` is set only
    once the job is fulfilled; failed and rejected jobs never get one."""

    job_id: str
    status: str
    image: RemoteImage | None = None

    @property
    def done(self) -> bool:
        return self.status in GENERATION_DONE


def is_fake() -> bool:
    return bool(getattr(settings, "CURATED_IMAGE_API_FAKE", False))


def available() -> bool:
    """Whether the catalog can be reached at all. Surfaces (the library dialog,
    the copilot) check this before offering curated photos."""
    return is_fake() or bool(settings.CURATED_IMAGE_API_URL and settings.CURATED_IMAGE_API_KEY)


def logos_available() -> bool:
    """Whether logo marks come from this catalog (LOGO_SOURCE=pix4less) rather
    than the local CuratedLogo table."""
    return settings.LOGO_SOURCE == "pix4less" and available()


def _timeout() -> tuple[float, float]:
    return (settings.CURATED_IMAGE_CONNECT_TIMEOUT, settings.CURATED_IMAGE_READ_TIMEOUT)


def _headers() -> dict[str, str]:
    return {"X-API-Key": settings.CURATED_IMAGE_API_KEY, "Content-Type": "application/json"}


def _url(path: str) -> str:
    return f"{settings.CURATED_IMAGE_API_URL.rstrip('/')}{path}"


def _request(
    method: str,
    path: str,
    *,
    json_body: dict | None = None,
    allow_404: bool = False,
    headers: dict | None = None,
    read_timeout: float | None = None,
    files: dict | None = None,
    data: dict | None = None,
):
    """One upstream call with a single retry. Returns the parsed body, or None
    for an allowed 404. Raises CuratedImageError for everything else. With
    ``files`` the body is multipart (``data`` its plain fields), not JSON."""
    if not available():
        raise CuratedImageError("the photo library is not configured")
    timeout = (_timeout()[0], read_timeout) if read_timeout else _timeout()
    base = {"X-API-Key": settings.CURATED_IMAGE_API_KEY} if files else _headers()  # requests sets the multipart type
    last_error: Exception | None = None
    for _attempt in (1, 2):
        try:
            response = requests.request(
                method,
                _url(path),
                json=json_body,
                headers={**base, **(headers or {})},
                timeout=timeout,
                **({"files": files, "data": data or {}} if files else {}),
            )
        except requests.ReadTimeout as exc:
            # The service took the request and is being slow. A second attempt
            # only doubles the wait before the same failure and piles load onto
            # something already struggling — give up and let the caller degrade.
            last_error = exc
            break
        except requests.RequestException as exc:  # connect timeouts, DNS, resets
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
            raise CuratedImageError(OUT_OF_CREDITS if response.status_code == 402 else UNAVAILABLE)
        try:
            return response.json()
        except ValueError as exc:
            last_error = exc
            continue
    logger.warning("curated catalog %s %s failed: %s", method, path, last_error)
    raise CuratedImageError(UNAVAILABLE)


def _absolute(url: str) -> str:
    """Preview URLs come back as paths on the service's own origin
    (/media/previews/<id>/web.webp); a browser on a tenant domain and the
    copy-on-use download both need the full URL."""
    return urljoin(f"{settings.CURATED_IMAGE_API_URL.rstrip('/')}/", url) if url else ""


def _image_from_payload(payload: dict) -> RemoteImage:
    renditions = payload.get("renditions") or {}
    web = renditions.get("web") or {}
    thumbnail = renditions.get("thumbnail") or {}
    web_url = _absolute(web.get("url") or payload.get("url") or "")
    if not payload.get("id") or not web_url:
        raise CuratedImageError(UNAVAILABLE)
    return RemoteImage(
        asset_id=str(payload["id"]),
        title=(payload.get("title") or "")[:200],
        description=(payload.get("description") or "")[:300],
        tags=[str(tag) for tag in (payload.get("tags") or [])],
        width=web.get("width") or payload.get("width"),
        height=web.get("height") or payload.get("height"),
        preview_url=_absolute(thumbnail.get("url") or "") or web_url,
        web_url=web_url,
        subject_placement=payload.get("subject_placement") if payload.get("subject_placement") in PLACEMENTS else None,
        colors=tuple(str(c) for c in ((payload.get("logo") or {}).get("colors") or [])),
    )


def placement_filter(wanted: str | None) -> str | None:
    """The catalog filter value for a wanted placement, or None when it cannot
    be asked of the server (NOT_CENTERED) or nothing is wanted."""
    return wanted if wanted in PLACEMENTS else None


def placement_rank(wanted: str | None, image: "RemoteImage") -> int:
    """0 = fits the wanted placement, 1 = unknown (or no requirement), 2 =
    known wrong: the subject would sit under the text. Sort by it ascending."""
    seen = image.subject_placement
    if not wanted or seen is None or seen not in PLACEMENTS:
        return 1 if wanted else 0
    if seen in _PLACEMENT_MATCH.get(wanted, ()):
        return 0
    return 2 if seen in _PLACEMENT_WRONG.get(wanted, ()) else 1


def by_placement(images, wanted: str | None) -> list:
    """`images` best placement first (stable: catalog/relevance order kept
    within a rank). Known-wrong ones stay last rather than vanish, so a
    caller that must show something still can."""
    return sorted(images, key=lambda i: placement_rank(wanted, i)) if wanted else list(images)


def orientation_of(aspect) -> str:
    """An aspect like 4:5 → portrait, 16:9 → landscape, 1:1 (or nonsense) → square."""
    try:
        w, h = (float(x) for x in str(aspect).split(":"))
    except ValueError:
        return "square"
    return "portrait" if w < h else "landscape" if w > h else "square"


def _cache_key(
    query: str, shape: str | None, page: int, per_page: int, placement: str | None = None, kind: str = PHOTO
) -> str:
    digest = hashlib.sha256(
        json.dumps([query, shape or "", page, per_page, placement or "", kind], sort_keys=True).encode()
    ).hexdigest()[:32]
    return f"curated-images:v4:search:{digest}"


def search(
    query: str = "",
    *,
    orientation: str | None = None,
    aspect_ratio: str | None = None,
    subject_placement: str | None = None,
    page: int = 1,
    per_page: int = MAX_PER_PAGE,
    session_id: str = "",
    shuffle: bool = False,
    kind: str = PHOTO,
) -> SearchPage:
    """Ranked catalog page for a plain-language query, over the whole library.
    An empty query browses newest-first, which is what a picker opening for the
    first time wants. `orientation` narrows to landscape/portrait/square;
    `aspect_ratio` (one of SEARCH_ASPECT_RATIOS) to that exact shape instead;
    `subject_placement` (one of PLACEMENTS) to photos whose main subject sits
    there, composing with either. `kind=LOGO` searches the logo marks instead
    of the photographs.

    Cached in Redis so a coach typing does not fan out one upstream request per
    keystroke. The TTL must stay below the service's signed-URL lifetime (15
    minutes) — a cached page hands out URLs that were signed when it was stored.

    `session_id` + `shuffle` ask the service for the next matches this session
    has NOT been shown — how "another please" gets a different photo. Those
    calls deliberately skip the cache: the whole point is that two identical
    requests return different images, and a shared cache key would both defeat
    that and hand one session's page to another.
    """
    query = " ".join((query or "").split())[:2000]
    per_page = max(1, min(per_page, MAX_PER_PAGE))
    page = max(1, page)
    if aspect_ratio not in SEARCH_ASPECT_RATIOS:
        aspect_ratio = None
    subject_placement = placement_filter(subject_placement)  # the service 400s on anything else
    if is_fake():
        from . import fake

        return fake.search(
            query,
            orientation=orientation_of(aspect_ratio) if aspect_ratio else orientation,
            page=page,
            per_page=per_page,
            session_id=session_id,
            shuffle=shuffle,
            kind=kind,
        )

    sessioned = bool(session_id or shuffle)
    key = _cache_key(query, aspect_ratio or orientation, page, per_page, subject_placement, kind)
    filters = {
        **({"aspect_ratio": aspect_ratio} if aspect_ratio else {"orientation": orientation} if orientation else {}),
        **({"subject_placement": subject_placement} if subject_placement else {}),
    }
    cached = None if sessioned else cache.get(key)
    if cached is None:
        body = _request(
            "POST",
            "/v1/images/search",
            json_body={
                **({"kind": LOGO} if kind == LOGO else {}),
                **({"query": query} if query else {}),
                **({"filters": filters} if filters else {}),
                **({"session_id": session_id} if session_id else {}),
                **({"shuffle": True} if shuffle else {}),
                "page": page,
                "per_page": per_page,
            },
        )
        cached = {
            "data": body.get("data") or [],
            "pagination": body.get("pagination") or {},
            "session_id": str(body.get("session_id") or ""),
            "restarted": bool(body.get("shuffle_cycle_restarted")),
        }
        if not sessioned:
            ttl = max(60, min(settings.CURATED_IMAGE_CACHE_TTL, 600))
            cache.set(key, cached, ttl)
    return SearchPage(
        results=[_image_from_payload(item) for item in cached["data"]],
        page=page,
        has_next=bool(cached["pagination"].get("has_next")),
        session_id=cached.get("session_id") or "",
        shuffle_cycle_restarted=bool(cached.get("restarted")),
    )


def search_or_browse(
    query: str = "",
    *,
    orientation: str | None = None,
    subject_placement: str | None = None,
    page: int = 1,
    per_page: int = MAX_PER_PAGE,
    session_id: str = "",
    shuffle: bool = False,
    kind: str = PHOTO,
) -> SearchPage:
    """Ranked page for `query`, falling back to browsing (same orientation)
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

    `subject_placement` is asked for first; when it empties the page the call
    repeats without it (then falls back to browsing as above).
    """
    subject_placement = placement_filter(subject_placement)
    first = search(
        query,
        orientation=orientation,
        subject_placement=subject_placement,
        page=page,
        per_page=per_page,
        session_id=session_id,
        shuffle=shuffle,
        kind=kind,
    )
    if first.results or page != 1:
        return first
    if subject_placement:
        # Nothing on that query has the subject where the layout needs it: the
        # same query without the filter (callers then rank unknown above wrong).
        return search_or_browse(
            query,
            orientation=orientation,
            page=1,
            per_page=per_page,
            session_id=session_id or first.session_id,
            shuffle=shuffle,
            kind=kind,
        )
    if not query:
        return first
    return search(
        orientation=orientation,
        page=1,
        per_page=per_page,
        session_id=session_id or first.session_id,
        shuffle=shuffle,
        kind=kind,
    )


def logo_query(subject: str) -> str:
    """The catalog query for logo marks about `subject` ("yoga", "yoga
    elegant"), or "" (browse) when it has none: a subject nothing is drawn for
    still gets marks to choose from. Search pages with what this returns so
    every page of a walk agrees. `subject` is English (see ai_curate.english_terms).

    The service answers "yoga logo" far better than a bare "yoga" (measured
    2026-10-12: twelve marks against none), so the word is added here.
    """
    subject = " ".join((subject or "").split())
    query = f"{subject} logo" if subject else ""
    return query if query and search(query, kind=LOGO).results else ""


def search_shaped(query: str, aspect: str, *, per_page: int = MAX_PER_PAGE) -> SearchPage:
    """Matches for a slot that renders at `aspect` ("4:5", "16:9"): photos of
    that exact shape first, so the crop keeps the subject; topped up with the
    same orientation when the catalog has no such shape or too few of it."""
    exact = search(query, aspect_ratio=aspect, per_page=per_page) if aspect in SEARCH_ASPECT_RATIOS else None
    if exact and len(exact.results) >= per_page:
        return exact
    near = search(query, orientation=orientation_of(aspect), per_page=per_page)
    if not exact:
        return near
    ids = {i.asset_id for i in exact.results}
    extra = [i for i in near.results if i.asset_id not in ids][: per_page - len(exact.results)]
    return replace(exact, results=[*exact.results, *extra])


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


def _job_from_payload(body: dict) -> GenerationJob:
    data = (body or {}).get("data") or {}
    if not data.get("id"):
        raise CuratedImageError(UNAVAILABLE)
    status = str(data.get("status") or "")
    image = data.get("image") if status == "fulfilled" else None
    return GenerationJob(job_id=str(data["id"]), status=status, image=_image_from_payload(image) if image else None)


def generate(prompt: str, *, aspect_ratio: str = "16:9", idempotency_key: str) -> GenerationJob:
    """Queue a brand-new image for when the library has nothing that fits.

    Unlike search this is charged per image, and the result joins the service's
    public catalog — callers gate it (see views.curated_image_generate). The
    idempotency key makes the single retry in _request safe: the service replays
    the first response instead of queueing (and charging for) a second job.
    """
    prompt = " ".join((prompt or "").split())[:GENERATION_PROMPT_MAX]
    if not prompt:
        raise CuratedImageError("describe the image you want")
    if is_fake():
        from . import fake

        return fake.generate(prompt)
    body = _request(
        "POST",
        "/v1/images/generate",
        json_body={"query": prompt, "aspect_ratio": aspect_ratio},
        headers={"Idempotency-Key": idempotency_key},
    )
    return _job_from_payload(body)


def generation(job_id: str, *, wait: int = 0) -> GenerationJob | None:
    """Current state of a generation job, or None if the service does not know
    it. `wait` long-polls (the service holds the request up to 25s) so callers
    don't hammer the status endpoint while a ~1 minute job runs."""
    if is_fake():
        from . import fake

        return fake.generation(job_id)
    path = f"/v1/generation-requests/{job_id}" + (f"?wait={wait}" if wait else "")
    body = _request("GET", path, allow_404=True, read_timeout=wait + 10 if wait else None)
    return None if body is None else _job_from_payload(body)


# ── the coach's own photos: one private space per tenant ─────────────────────
#
# The service describes and indexes an uploaded image the way it does its own
# catalog (minutes to hours), and only a search that names the tenant's space
# finds it. Contentor keeps the bytes it renders in the tenant's own storage
# (apps.media.own_photos); the service holds a copy to search.

OWN_IN_FLIGHT = frozenset({"uploading", "indexing"})
OWN_UPLOAD_TIMEOUT = 60  # the service stores three renditions before it answers


@dataclass(frozen=True)
class OwnUpload:
    """One of the coach's photos in the service's private collection.
    ``status``: uploading | indexing (being described) | ready | failed."""

    upload_id: str
    status: str
    title: str = ""
    description: str = ""
    failure: str = ""
    subject_placement: str | None = None


def _own_upload(data: dict) -> OwnUpload:
    if not data.get("id") or not data.get("status"):
        raise CuratedImageError(UNAVAILABLE)
    image = data.get("image") or {}
    return OwnUpload(
        upload_id=str(data["id"]),
        status=str(data["status"]),
        title=str(image.get("title") or "")[:200],
        description=str(image.get("description") or "")[:300],
        failure=str(data.get("failure") or "")[:300],
        subject_placement=image.get("subject_placement") if image.get("subject_placement") in PLACEMENTS else None,
    )


def private_upload(body: bytes, filename: str, content_type: str, *, space: str, tags=()) -> OwnUpload:
    """Hand one of the coach's photos to the service to describe and index in
    ``space``. The same bytes again answer the upload already there."""
    if is_fake():
        from . import fake

        return fake.private_upload(body, filename, space=space, tags=tags)
    labels = ",".join(t.replace(",", " ").strip()[:80] for t in tags if t and len(t.strip()) >= 2)
    answer = _request(
        "POST",
        "/v1/private/images",
        files={"file": (filename, body, content_type)},
        data={"space": space, **({"tags": labels} if labels else {})},
        read_timeout=OWN_UPLOAD_TIMEOUT,
    )
    return _own_upload((answer or {}).get("data") or {})


def private_status(upload_id: str) -> OwnUpload | None:
    """Where an upload stands (with what the service wrote about it once it is
    ready), or None when the service no longer has it."""
    if is_fake():
        from . import fake

        return fake.private_status(upload_id)
    answer = _request("GET", f"/v1/private/images/{upload_id}", allow_404=True)
    return None if answer is None else _own_upload(answer.get("data") or {})


def private_search(
    query: str = "", *, space: str, orientation: str | None = None, per_page: int = MAX_PER_PAGE
) -> list[tuple[str, RemoteImage]]:
    """The coach's own ready photos that match ``query``, best first, as
    (upload id, image). An empty query lists the newest. Never cached: a photo
    that just became ready should be found on the next search."""
    query = " ".join((query or "").split())[:2000]
    per_page = max(1, min(per_page, MAX_PER_PAGE))
    if is_fake():
        from . import fake

        return fake.private_search(query, space=space, orientation=orientation, per_page=per_page)
    body = _request(
        "POST",
        "/v1/images/search",
        json_body={
            "scope": "private",
            "space": space,
            **({"query": query} if query else {}),
            **({"filters": {"orientation": orientation}} if orientation in ORIENTATIONS else {}),
            "per_page": per_page,
        },
    )
    found = []
    for item in (body or {}).get("data") or []:
        if item.get("upload_id"):
            found.append((str(item["upload_id"]), _image_from_payload(item)))
    return found


def private_delete(upload_id: str) -> None:
    """Remove a photo and its description from the service for good. An upload
    it no longer has counts as removed."""
    if is_fake():
        from . import fake

        return fake.private_delete(upload_id)
    _request("DELETE", f"/v1/private/images/{upload_id}", allow_404=True)
