"""Curated-photo picks for a freshly provisioned tenant.

Slots (hero bg, about image, course thumbnails, live-event covers) are matched
against candidates from the remote curated catalog (curated-image-api): the
coach's own words are the search query, and ONE structured call assigns
candidates to slots. The LLM step touches no tenant schema, so it can run inside
provision_tenant's capped worker thread; apply_photo_picks does the tenant-schema
writes — including caching each chosen image into tenant storage — and runs in
the main thread.
Specs: docs/superpowers/specs/2026-07-19-ai-touch-onboarding-design.md,
docs/superpowers/specs/2026-08-09-curated-images-offload-design.md
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

from django.conf import settings
from pydantic import BaseModel, Field

from apps.core import ai as core_ai
from apps.core.curated_images import client as curated_client
from apps.core.onboarding import ai_compose
from apps.core.onboarding.ai_curate import CoachBrief, brief_block, brief_query

if TYPE_CHECKING:
    from apps.core.curated_images.client import RemoteImage

logger = logging.getLogger(__name__)

CANDIDATES_PER_GROUP = 24
MAX_SLOTS = 16
MAX_OUTPUT_TOKENS = 1000


class CurateError(Exception):
    pass


@dataclass(frozen=True)
class Slot:
    name: str  # "hero" | "about" | "course:<pk>" | "event:<ModelName>:<title>"
    label: str  # human context shown to the model
    group: str  # "hero" | "content" — which candidate list it may pick from


class _Pick(BaseModel):
    slot: str
    candidate: int  # the number the photo was listed under, not a catalog id


class _Picks(BaseModel):
    picks: list[_Pick] = Field(default_factory=list)


# Static system prompt: byte-identical across tenants (prompt caching).
SYSTEM_PROMPT = """You choose photographs for a solo coach's brand-new website.

You receive the coach's brief, a list of image slots, and two numbered candidate
photo lists (hero and content). Assign the best-fitting photo to each slot by its
candidate number.

Hard rules:
- For each slot, pick ONLY from the candidate list its slot description names.
- Return at most one pick per slot; skip a slot rather than force a bad fit.
- Prefer photos whose subject matches the coach's niche and the slot's
  purpose (hero = mood-setting wide shot; course thumbnail = matches that
  course's topic; event cover = matches that event).
- Reusing one photo for two slots is allowed only when nothing better exists.
"""


def build_slots(answers: dict, courses, events) -> list[Slot]:
    slots: list[Slot] = []
    if (answers.get("hero_style") or "centered") != "minimal":
        slots.append(Slot("hero", "Homepage hero background — sets the mood for the whole site (hero list)", "hero"))
    slots.append(Slot("about", "About-the-coach section image — portrait or ambience (content list)", "content"))
    for course in courses:
        slots.append(
            Slot(f"course:{course.pk}", f'Thumbnail for the course "{course.title}" (content list)', "content")
        )
    for model_name, title, _rows in event_groups(events):
        slots.append(
            Slot(f"event:{model_name}:{title}", f'Cover for the live event "{title}" (content list)', "content")
        )
    return slots[:MAX_SLOTS]


def event_groups(events) -> list[tuple[str, str, list]]:
    """Distinct (model_name, title) groups, insertion-ordered — seeded events
    repeat a handful of template titles, so covers are picked per template,
    not per occurrence."""
    groups: dict[tuple[str, str], list] = {}
    for row in events:
        groups.setdefault((type(row).__name__, row.title), []).append(row)
    return [(m, t, rows) for (m, t), rows in groups.items()]


def pick_photos(brief: CoachBrief, slots: list[Slot], *, tenant_schema: str) -> dict[str, RemoteImage]:
    """One structured call -> {slot_name: RemoteImage}. Candidates come from two
    catalog searches (wide hero shots, and anything for content slots) against
    the coach's own words. Model-returned candidate numbers are validated against
    the list its slot was allowed to use; anything else is dropped. Raises
    CurateError on provider or catalog failure."""
    if not slots:
        return {}
    query = brief_query(brief)
    try:
        # search_or_browse, not search: the catalog's query filters, so a coach
        # whose niche it has no words for would otherwise finish the wizard with
        # a photo-less site rather than generic-but-real imagery.
        hero_pool = curated_client.search_or_browse(
            query, collection=curated_client.HERO_COLLECTION, per_page=CANDIDATES_PER_GROUP
        ).results
        content_pool = curated_client.search_or_browse(query, per_page=CANDIDATES_PER_GROUP).results
    except curated_client.CuratedImageError as exc:
        raise CurateError(str(exc)) from exc
    if not hero_pool and not content_pool:
        return {}

    # Candidates are numbered per group rather than identified by catalog UUID:
    # a coach's whole slot list then costs a few tokens, and the model cannot
    # invent an id that happens to exist.
    numbered = {
        "hero": dict(enumerate(hero_pool, start=1)),
        "content": dict(enumerate(content_pool, start=1)),
    }

    lines = [brief_block(brief), "", "<slots>"]
    lines += [f"{s.name}: {s.label}" for s in slots]
    lines.append("</slots>")
    for group_name, pool in numbered.items():
        lines.append(f"<{group_name}_photos>")
        lines += [f'{number}: "{image.title}" tags: {", ".join(image.tags)}' for number, image in pool.items()]
        lines.append(f"</{group_name}_photos>")

    try:
        parsed, cost, _model = core_ai.structured(
            system=SYSTEM_PROMPT,
            user="\n".join(lines),
            output_model=_Picks,
            model=settings.ONBOARDING_AI_MODEL,
            max_tokens=MAX_OUTPUT_TOKENS,
        )
    except core_ai.AiError as exc:
        ai_compose.record_spend(tenant_schema, float(getattr(exc, "cost_usd", 0) or 0))
        raise CurateError(str(exc)) from exc
    ai_compose.record_spend(tenant_schema, float(cost or 0))

    slot_group = {s.name: s.group for s in slots}
    out: dict[str, RemoteImage] = {}
    for pick in parsed.picks:
        group = slot_group.get(pick.slot)
        if group and pick.slot not in out and pick.candidate in numbered[group]:
            out[pick.slot] = numbered[group][pick.candidate]
    return out


def apply_photo_picks(picks: dict[str, RemoteImage], *, pages: dict, courses, events, niche: str) -> None:
    """Cache the picked catalog images into this tenant's storage and write them
    into the pages dict (in place) / course thumbnails / event covers. Must run
    inside the tenant context (creates media.Photo rows).

    One image that cannot be cached costs that slot only — a brand-new site with
    five photos out of six beats a provisioning run that failed outright."""
    from apps.core.curated_images.cache import cache_remote_image
    from apps.tenant_config.seeding import refresh_seeded_fingerprints, register_seeded

    created = []

    def photo_for(image):
        try:
            photo = cache_remote_image(image)
        except curated_client.CuratedImageError as exc:
            logger.warning("onboarding could not cache curated image %s: %s", image.asset_id, exc)
            return None
        created.append(photo)
        return photo

    course_by_pk = {str(c.pk): c for c in courses}
    groups = {f"event:{m}:{t}": rows for m, t, rows in event_groups(events)}
    touched = []

    for slot_name, image in picks.items():
        photo = photo_for(image)
        if photo is None:
            continue
        if slot_name == "hero":
            for page in pages.values():
                for block in page.get("blocks", []):
                    if block.get("type") == "hero":
                        block["bgImage"] = {"url": None, "photo_id": str(photo.pk)}
        elif slot_name == "about":
            for page in pages.values():
                for block in page.get("blocks", []):
                    if block.get("type") == "imageText":
                        block["image"] = {"url": None, "photo_id": str(photo.pk)}
        elif slot_name.startswith("course:"):
            course = course_by_pk.get(slot_name.split(":", 1)[1])
            if course is not None:
                course.thumbnail = photo
                course.thumbnail_url = photo.s3_key
                course.save(update_fields=["thumbnail", "thumbnail_url"])
                touched.append(course)
        elif slot_name in groups:
            for event in groups[slot_name]:
                event.thumbnail = photo
                event.thumbnail_url = photo.s3_key
                event.save(update_fields=["thumbnail", "thumbnail_url"])
            touched.extend(groups[slot_name])

    register_seeded(created, niche=niche)
    refresh_seeded_fingerprints(touched)
