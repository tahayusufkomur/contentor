"""Curated-photo pick behind the copilot's set_block_image action.

The pick needs no extra AI call: the coach's own words become the query for the
remote curated catalog (curated-image-api) and the service's relevance ranking
does the rest. apply_block_image is dict-in/dict-out like blocks.py. A block's
current photo traces back to its catalog asset through its cached tenant s3_key,
so a re-pick can exclude it ("try another"). DB writes happen in the execute
view. Imports are function-local to match apps/core's cycle-dodging convention."""

from copy import deepcopy

# Which image field each block type carries (hero backgrounds vs. inline
# images) — also the allowlist of block types the copilot may set photos on.
IMAGE_FIELDS = {"hero": "bgImage", "imageText": "image"}


def image_captions(tenant, pages):
    """photo_id -> human caption ("silhouette of a ballet dancer" / a photo's
    title / "photo" as a last resort) for every IMAGE_FIELDS value set across
    `pages`. One batched query, called once per user turn — so "what photo is
    on the About block?" and the pages digest both have something to read
    instead of a raw {"url": None, "photo_id": "..."} dict, which isn't in
    BLOCK_SCHEMA and was previously invisible to the model entirely."""
    from django_tenants.utils import tenant_context

    from apps.core.copilot import blocks
    from apps.media.models import Photo

    ids = set()
    for page_value in (pages or {}).values():
        for b in blocks.page_blocks(page_value) or []:
            if not isinstance(b, dict):
                continue
            field = IMAGE_FIELDS.get(b.get("type"))
            value = b.get(field) if field else None
            if isinstance(value, dict) and value.get("photo_id"):
                ids.add(str(value["photo_id"]))
    if not ids:
        return {}
    with tenant_context(tenant):
        rows = Photo.objects.filter(pk__in=ids).values("id", "alt_text", "title")
    return {str(r["id"]): (r["alt_text"] or r["title"] or "photo") for r in rows}


# Catalog collection offered per field, mirroring onboarding's ai_photos split:
# hero backgrounds only from mood-setting wide hero shots; inline images may come
# from either collection (None = no filter). "courseCover"/"eventCover" are the
# pseudo-fields the cover actions pick with — thumbnails read well from either.
FIELD_COLLECTIONS = {
    "bgImage": "coach-heroes",
    "image": None,
    "courseCover": None,
    "eventCover": None,
}

CANDIDATE_LIMIT = 24

# One catalog search session per subject (a block, course or event), so
# "another please" moves on. The service excludes whatever a session has already
# been handed — atomically, even under concurrent calls — so contentor only has
# to remember which session belongs to which subject. The offer flow changes
# nothing until the coach applies, so exclude_s3_key cannot see the photo just
# proposed; without the session the same top match came back every turn.
# Cached, not stored: forgetting after a day is a repeat photo, not a broken
# site, and the service expires its side after 24h idle anyway.
_SESSION_KEY = "copilot:photo-session:{subject}"
_SESSION_TTL = 86400


class PhotoOpError(Exception):
    """User-safe message describing why a photo operation was refused."""


def _session_key(subject):
    from hashlib import sha256

    return _SESSION_KEY.format(subject=sha256(str(subject).encode()).hexdigest()[:32])


def search_session(subject):
    """This subject's rotation state: the catalog session it browses under, and
    how far down the query ladder it has already widened.

    The widening has to be remembered, not re-derived. shuffle_cycle_restarted
    is a one-shot flag — the service resets the session's seen-set as it wraps,
    so the very next call walks the same narrow match set again and reports
    restarted=False. Without a sticky level the pick would bounce between the
    two shots the tightest query clears forever."""
    from django.core.cache import cache

    state = (cache.get(_session_key(subject)) or {}) if subject else {}
    return str(state.get("sid") or ""), int(state.get("level") or 0)


def remember_session(subject, session_id, level):
    from django.core.cache import cache

    if subject and session_id:
        cache.set(_session_key(subject), {"sid": session_id, "level": int(level)}, timeout=_SESSION_TTL)


def image_field_for(block_type):
    field = IMAGE_FIELDS.get(block_type)
    if field is None:
        raise PhotoOpError("photos can go on these sections only: " + ", ".join(sorted(IMAGE_FIELDS)))
    return field


def pick_photo(description, tenant, *, field, exclude_s3_key=None, subject=""):
    """Best-matching catalog image for the coach's real profile (niche,
    onboarding description, follow-up answers) plus the model's per-turn style
    description. Returns a curated_images.client.RemoteImage, or raises.

    Pass `subject` (a stable id for the block/course/event being dressed) to get
    "another please" behaviour: the pick then skips what it recently offered for
    that subject and records what it hands back. Without it the pick is
    stateless, and a repeated ask returns the same rank-one asset — the offer
    changes nothing until the coach applies, so exclude_s3_key cannot see it.

    The query comes from photo_query (niche + the style this turn asked for),
    NOT brief_query. An older guard fed the coach's onboarding description in
    too, because the local catalog ranked without filtering and a niche missing
    from the tags scored zero. The remote service inverts that: it scores how
    completely an image covers every concept and discards the rest, so the extra
    prose made the search both slower and emptier (~15s for no matches, against
    ~5s with matches). The niche still steers the pick.

    Searches via search_or_browse, not search: the remote query filters, so a
    pole-dance coach whose words the catalog lacks would otherwise get an empty
    page and be told the library is empty. A generic photo they can reject beats
    a dead end.

    Because the service drops anything under its confidence floor, a precise
    query can clear as few as two shots where the niche alone clears two dozen —
    so two "another please" exhaust it. The service says when that happens
    (shuffle_cycle_restarted) and the pick then WIDENS: niche alone, then browse
    the collection. The session spans all three, so a widened query still cannot
    hand back a photo this subject has already seen."""
    from apps.core.curated_images import client as curated_client
    from apps.core.curated_images.cache import asset_id_from_key
    from apps.core.onboarding.ai_curate import CoachBrief, photo_query

    brief = CoachBrief.from_tenant(tenant)
    collection = FIELD_COLLECTIONS.get(field)
    # "Try another" excludes whatever is on the block now. The cached tenant key
    # still carries the catalog asset id, so no extra bookkeeping is needed.
    excluded = asset_id_from_key(exclude_s3_key or "")
    session_id, level = search_session(subject)

    queries = []
    for query in (
        photo_query(brief, description),  # the niche, shown the way this turn asked
        photo_query(brief),  # the niche alone
        "",  # anything in the collection
    ):
        if query not in queries:
            queries.append(query)

    # Rotating asks for ONE image at a time: everything a session is handed
    # counts as seen, so a full page per turn would burn the whole catalog on
    # the first ask and report "restarted" ever after. A stateless pick has no
    # session to spend and takes the whole ranked page.
    per_page = 1 if subject else CANDIDATE_LIMIT
    best = None  # rank one of the first query tried, for the fully-exhausted case
    for index in range(min(level, len(queries) - 1), len(queries)):
        query = queries[index]
        # Twice at most: a second look only if the one image offered is the very
        # photo already on the block, which the session now excludes anyway.
        for _attempt in (1, 2):
            try:
                page = curated_client.search_or_browse(
                    query,
                    collection=collection,
                    page=1,
                    per_page=per_page,
                    session_id=session_id,
                    shuffle=bool(subject),
                )
            except curated_client.CuratedImageError as exc:
                raise PhotoOpError(str(exc)) from exc
            session_id = page.session_id or session_id
            candidates = [image for image in page.results if image.asset_id != excluded]
            if best is None and candidates:
                best = candidates[0]
            if candidates and not page.shuffle_cycle_restarted:
                remember_session(subject, session_id, index)
                return candidates[0]
            if page.shuffle_cycle_restarted:
                # This query has nothing left to show; never come back to it.
                level = min(index + 1, len(queries) - 1)
            # Only worth a second look while this query still has unseen images
            # and the sole one it offered was the block's current photo.
            if not (subject and page.results and not candidates and not page.shuffle_cycle_restarted):
                break
    remember_session(subject, session_id, level)
    if best is None:
        raise PhotoOpError("no photos are available in the library yet")
    # Every photo the catalog can offer this subject has been shown. Starting
    # over beats refusing — the coach asked for a photo, and "no photos are
    # available" would be a lie about a full library.
    return best


def tenant_photo_url(photo):
    """Presigned preview for a coach-attached tenant media.Photo (24h)."""
    from apps.core.storage import generate_presigned_download_url

    return generate_presigned_download_url(photo.s3_key, expiry=86400)


def photo_for_action(action):
    """The tenant media.Photo an apply step should place: either the coach's own
    attached photo, or the catalog asset the card offered, cached into this
    tenant's storage on the way through. Shared by set_block_image,
    set_course_cover and set_event_cover — the three used to resolve this
    identically. Must run inside the tenant context (it writes media.Photo)."""
    from apps.media.models import Photo

    if action.get("tenant_photo_id"):
        photo = Photo.objects.filter(pk=action["tenant_photo_id"]).first()
        if photo is None:
            raise PhotoOpError("that attached photo is not in your library")
        return photo
    return cached_curated_photo(action.get("curated_asset_id"))


def cached_curated_photo(asset_id):
    """Tenant media.Photo for a catalog asset id, downloading the rendition into
    tenant storage on first use. Must run inside the tenant context."""
    from apps.core.curated_images import client as curated_client
    from apps.core.curated_images.cache import cache_remote_image

    try:
        image = curated_client.get(asset_id) if asset_id else None
    except curated_client.CuratedImageError as exc:
        raise PhotoOpError(str(exc)) from exc
    if image is None:
        raise PhotoOpError("that photo is no longer available")
    try:
        return cache_remote_image(image)
    except curated_client.CuratedImageError as exc:
        raise PhotoOpError(str(exc)) from exc


def apply_block_image(pages, page, block_id, field, photo_pk):
    """New pages dict with the block's image field pointing at the tenant
    Photo. The serializer re-signs the URL from photo_id on every read, so
    url stays None here (same shape onboarding's apply_photo_picks writes)."""
    from apps.core.copilot import blocks

    new_pages = deepcopy(pages)
    blocks_ = blocks.page_blocks((new_pages or {}).get(page))
    if blocks_ is None:
        raise PhotoOpError(f"unknown page: {page}")
    for block in blocks_:
        if isinstance(block, dict) and block.get("id") == block_id:
            block[field] = {"url": None, "photo_id": str(photo_pk)}
            return new_pages
    raise PhotoOpError(f"no block {block_id} on {page}")


DESCRIBE_MAX_DIM = 1024  # longest edge sent to the vision model
DESCRIBE_SYSTEM = (
    "You describe a photo a coach uploaded to their website's media library. "
    "Return a single plain sentence saying what the photo shows — subject, "
    "setting, mood (e.g. 'silhouette of a ballet dancer at a barre, warm "
    "backlight'). No preamble, no marketing copy. Also return 3-6 short "
    "lowercase keywords."
)


def describe_tenant_photo(photo):
    """Vision one-shot: what does this coach-uploaded photo show? Saves the
    sentence onto photo.alt_text (the retrieval surface: copilot listings,
    media search, SEO) and returns (description, cost_usd). Best-effort by
    design — no vision provider, unreadable bytes or a failed call all
    return ("", cost) and never break the upload."""
    import base64
    import io
    import logging
    from decimal import Decimal

    from django.conf import settings
    from pydantic import BaseModel, Field

    from apps.core import ai as core_ai

    logger = logging.getLogger(__name__)

    if not core_ai.supports_vision():
        return "", Decimal("0")

    class _PhotoDescription(BaseModel):
        description: str = Field(max_length=300)
        keywords: list[str] = []

    try:
        from PIL import Image

        from apps.core.storage import get_s3_client

        body = get_s3_client().get_object(Bucket=settings.AWS_BUCKET_NAME, Key=photo.s3_key)["Body"].read()
        img = Image.open(io.BytesIO(body))
        img.thumbnail((DESCRIBE_MAX_DIM, DESCRIBE_MAX_DIM))
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="JPEG", quality=85)
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception:
        logger.exception("copilot describe: could not read photo %s", photo.pk)
        return "", Decimal("0")

    try:
        parsed, cost, _ = core_ai.structured_messages(
            system=DESCRIBE_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}},
                        {"type": "text", "text": "Describe this photo."},
                    ],
                }
            ],
            output_model=_PhotoDescription,
            model=settings.COPILOT_MODEL,
            max_tokens=300,
        )
    except core_ai.AiError as exc:
        logger.exception("copilot describe: vision call failed for %s", photo.pk)
        return "", getattr(exc, "cost_usd", None) or Decimal("0")

    description = " ".join(str(parsed.description or "").split())[:300]
    if description:
        photo.alt_text = description
        photo.save(update_fields=["alt_text"])
    return description, cost
