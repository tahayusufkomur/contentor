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

# Catalog kinds offered per field, mirroring onboarding's ai_photos split:
# hero backgrounds only from mood-setting hero shots; inline images may also
# use stock.
FIELD_KINDS = {"bgImage": ("hero",), "image": ("hero", "stock")}

SHORTLIST_LIMIT = 30


class PhotoOpError(Exception):
    """User-safe message describing why a photo operation was refused."""


def image_field_for(block_type):
    field = IMAGE_FIELDS.get(block_type)
    if field is None:
        raise PhotoOpError("photos can go on these sections only: " + ", ".join(sorted(IMAGE_FIELDS)))
    return field


def pick_photo(description, niche, *, field, exclude_s3_key=None):
    """Best-matching enabled CuratedPhoto for the description + niche, or
    raises. Only platform-prefixed keys are candidates (a bad catalog key
    must never be signed or copied into tenant media)."""
    from django_tenants.utils import schema_context

    from apps.core.models import CuratedPhoto
    from apps.core.onboarding.ai_curate import CoachBrief, shortlist

    kinds = FIELD_KINDS.get(field) or ("hero", "stock")
    with schema_context("public"):
        rows = [
            r
            for r in CuratedPhoto.objects.filter(enabled=True, kind__in=kinds).order_by("position", "id")
            if r.image_key.startswith("platform/") and r.image_key != (exclude_s3_key or "")
        ]
    if not rows:
        raise PhotoOpError("no photos are available in the library yet")
    brief = CoachBrief(niche=str(niche or "general"), description=str(description or ""))
    return shortlist(rows, brief, limit=SHORTLIST_LIMIT)[0]


def preview_url(row):
    """Presigned URL for the card's photo preview (24h, matches the curated
    search endpoint)."""
    from apps.core.storage import generate_presigned_download_url

    return generate_presigned_download_url(row.image_key, expiry=86400)


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
