"""Curated-photo candidates for the blog AI writer.

Selection is deliberately non-LLM: lowercase token overlap between the topic
and each catalog row's tags/title, scored in python over the (small) enabled
catalog. Candidate ids are namespaced "curated:<pk>" so they can never collide
with tenant Photo UUIDs; resolve_curated_photo_ids() swaps chosen ones for
real materialized Photo UUIDs after generation.
Spec: docs/superpowers/specs/2026-07-19-curated-photos-design.md."""

import re

from django_tenants.utils import schema_context

from apps.core.curated_photos.materialize import materialize_curated_photo
from apps.core.models import CuratedPhoto

CURATED_PREFIX = "curated:"
MAX_CURATED_CANDIDATES = 8
_FALLBACK_HEROES = 3


class CuratedCandidate:
    """Duck-types the .id/.title/.alt_text trio available_photos_block reads."""

    def __init__(self, row):
        self.id = f"{CURATED_PREFIX}{row.pk}"
        self.title = row.title
        self.alt_text = row.alt_text


def _tokens(text):
    return {w for w in re.split(r"[^\w]+", (text or "").lower()) if len(w) >= 3}


def curated_candidates(topic, limit=MAX_CURATED_CANDIDATES):
    if limit <= 0:
        return []
    topic_tokens = _tokens(topic)
    with schema_context("public"):
        rows = list(
            CuratedPhoto.objects.filter(enabled=True, kind__in=CuratedPhoto.AI_KINDS).order_by("position", "id")
        )
    scored = []
    for row in rows:
        row_tokens = _tokens(row.tags.replace(",", " ")) | _tokens(row.title)
        score = len(topic_tokens & row_tokens)
        if score:
            scored.append((score, row))
    scored.sort(key=lambda pair: (-pair[0], pair[1].position, pair[1].pk))
    picked = [row for _, row in scored[:limit]]
    if not picked:
        # Language mismatch or thin tagging: still offer a few generic covers
        # so photo-less tenants get a cover rather than nothing.
        picked = [row for row in rows if row.kind == "hero"][: min(limit, _FALLBACK_HEROES)]
    return [CuratedCandidate(row) for row in picked]


def _materialize_id(curated_id):
    """ "curated:<pk>" -> materialized tenant Photo UUID string, or ""."""
    pk = curated_id[len(CURATED_PREFIX) :]
    row = None
    if pk.isdigit():
        with schema_context("public"):
            row = CuratedPhoto.objects.filter(pk=pk, enabled=True).first()
    if row is None:
        return ""
    return str(materialize_curated_photo(row).id)


def resolve_curated_photo_ids(fields):
    """Mutate a DraftResult.fields dict in place: materialize chosen curated
    ids into tenant Photos. Unknown ids fail open — "" cover, dropped
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
