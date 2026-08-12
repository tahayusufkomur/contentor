"""Curated-photo candidates for the blog AI writer.

Candidates come from the remote curated catalog (curated-image-api): the topic
is the search query, and the service's relevance ranking replaces the local
token-overlap scoring this module used to do over contentor's own catalog table.
Candidate ids stay namespaced "curated:<asset-id>" so they can never collide with
tenant Photo UUIDs; resolve_curated_photo_ids() swaps chosen ones for real
tenant Photo UUIDs — caching the bytes into tenant storage — after generation.

A catalog outage is not a draft failure: candidates come back empty and the post
ships without a curated cover.

Spec: docs/superpowers/specs/2026-08-09-curated-images-offload-design.md."""

import logging

from apps.core.curated_images import client as curated_client
from apps.core.curated_images.cache import cache_remote_image

logger = logging.getLogger(__name__)

CURATED_PREFIX = "curated:"
MAX_CURATED_CANDIDATES = 8
_FALLBACK_CANDIDATES = 3


class CuratedCandidate:
    """Duck-types the .id/.title/.alt_text trio available_photos_block reads."""

    def __init__(self, image):
        self.id = f"{CURATED_PREFIX}{image.asset_id}"
        self.title = image.title
        self.alt_text = image.description


def curated_candidates(topic, limit=MAX_CURATED_CANDIDATES):
    """Best-matching catalog images for a topic. Never raises: the writer offers
    whatever it gets, and an empty list simply means no curated cover."""
    if limit <= 0:
        return []
    try:
        # No collection filter: a blog cover reads well from a hero or a stock
        # shot, and narrowing here would halve an already small candidate pool.
        page = curated_client.search(topic, page=1, per_page=limit)
        results = page.results
        if not results:
            # A topic in another language, or one the catalog simply has no words
            # for, scores zero against every row. Offer a few generic covers so
            # photo-less tenants still get a cover rather than nothing.
            results = curated_client.search(
                collection=curated_client.HERO_COLLECTION, page=1, per_page=min(limit, _FALLBACK_CANDIDATES)
            ).results
    except curated_client.CuratedImageError as exc:
        logger.warning("blog curated candidates unavailable: %s", exc)
        return []
    return [CuratedCandidate(image) for image in results]


def _materialize_id(curated_id):
    """ "curated:<asset-id>" -> cached tenant Photo UUID string, or ""."""
    asset_id = curated_id[len(CURATED_PREFIX) :]
    try:
        image = curated_client.get(asset_id)
        if image is None:
            return ""
        return str(cache_remote_image(image).id)
    except curated_client.CuratedImageError as exc:
        logger.warning("blog curated photo %s could not be cached: %s", asset_id, exc)
        return ""


def resolve_curated_photo_ids(fields):
    """Mutate a DraftResult.fields dict in place: cache chosen curated ids into
    tenant Photos. Unknown or unreachable ids fail open — "" cover, dropped
    placement — mirroring generate_post's never-invent-an-id contract.
    Must run inside the tenant context (it creates media.Photo rows)."""
    cover = fields.get("cover_photo_id", "")
    if cover.startswith(CURATED_PREFIX):
        fields["cover_photo_id"] = _materialize_id(cover)
    placements = []
    for placement in fields.get("image_placements", []):
        photo_id = placement.get("photo_id", "")
        if photo_id.startswith(CURATED_PREFIX):
            photo_id = _materialize_id(photo_id)
            if not photo_id:
                continue
        placements.append({**placement, "photo_id": photo_id})
    fields["image_placements"] = placements
