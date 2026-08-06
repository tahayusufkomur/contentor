"""Curated-photo pick behind the copilot's set_block_image action.

Pure helpers — the pick is deterministic (token-overlap shortlist of the
CuratedPhoto catalog against the model's photo description, reusing
ai_curate.shortlist; no extra AI call), and apply_block_image is dict-in/
dict-out like blocks.py. A block's current photo traces back to its curated
source by s3_key, so a re-pick can exclude it ("try another"). DB writes
happen in the execute view. Imports are function-local to match apps/core's
cycle-dodging convention."""

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


# Catalog kinds offered per field, mirroring onboarding's ai_photos split:
# hero backgrounds only from mood-setting hero shots; inline images may also
# use stock. "courseCover" is the pseudo-field set_course_cover picks with —
# course thumbnails read well from either kind.
FIELD_KINDS = {"bgImage": ("hero",), "image": ("hero", "stock"), "courseCover": ("hero", "stock")}

SHORTLIST_LIMIT = 30


class PhotoOpError(Exception):
    """User-safe message describing why a photo operation was refused."""


def image_field_for(block_type):
    field = IMAGE_FIELDS.get(block_type)
    if field is None:
        raise PhotoOpError("photos can go on these sections only: " + ", ".join(sorted(IMAGE_FIELDS)))
    return field


def pick_photo(description, tenant, *, field, exclude_s3_key=None):
    """Best-matching enabled CuratedPhoto for the coach's real profile (niche,
    onboarding description, follow-up answers) plus the model's per-turn
    style description, or raises. Only platform-prefixed keys are candidates
    (a bad catalog key must never be signed or copied into tenant media).

    Regression guard: this used to build CoachBrief from JUST niche + the
    model's invented per-turn description, dropping the tenant's own
    onboarding description/follow-ups entirely. A niche whose word doesn't
    literally appear in the catalog's tags (e.g. "pole_dance_instructor")
    then scored 0 against every row, and shortlist's zero-score fallback is
    catalog position order — so coaches saw the same generic gym photo
    regardless of their actual niche. Building the brief from the tenant
    (same helper onboarding itself uses) restores that signal."""
    from django_tenants.utils import schema_context

    from apps.core.models import CuratedPhoto
    from apps.core.onboarding.ai_curate import brief_with_turn_style, shortlist

    kinds = FIELD_KINDS.get(field) or ("hero", "stock")
    with schema_context("public"):
        rows = [
            r
            for r in CuratedPhoto.objects.filter(enabled=True, kind__in=kinds).order_by("position", "id")
            if r.image_key.startswith("platform/") and r.image_key != (exclude_s3_key or "")
        ]
    if not rows:
        raise PhotoOpError("no photos are available in the library yet")
    brief = brief_with_turn_style(tenant, description)
    return shortlist(rows, brief, limit=SHORTLIST_LIMIT)[0]


def preview_url(row):
    """Presigned URL for the card's photo preview (24h, matches the curated
    search endpoint)."""
    from apps.core.storage import generate_presigned_download_url

    return generate_presigned_download_url(row.image_key, expiry=86400)


def tenant_photo_url(photo):
    """Presigned preview for a coach-attached tenant media.Photo (24h)."""
    from apps.core.storage import generate_presigned_download_url

    return generate_presigned_download_url(photo.s3_key, expiry=86400)


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
