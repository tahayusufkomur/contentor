"""Curated-photo picks for a freshly provisioned tenant.

Slots (hero bg, about image, course thumbnails, live-event covers) are matched
against a token-overlap shortlist of the CuratedPhoto catalog; ONE structured
call assigns photos to slots. The LLM step is pure + public-schema-only so it
can run inside provision_tenant's capped worker thread; apply_photo_picks does
the tenant-schema writes and runs in the main thread.
Spec: docs/superpowers/specs/2026-07-19-ai-touch-onboarding-design.md
"""

from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings
from django_tenants.utils import schema_context
from pydantic import BaseModel, Field

from apps.core import ai as core_ai
from apps.core.models import CuratedPhoto
from apps.core.onboarding import ai_compose
from apps.core.onboarding.ai_curate import CoachBrief, brief_block, shortlist

HERO_KINDS = ("hero",)
CONTENT_KINDS = ("hero", "stock")
SHORTLIST_LIMIT = 30
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
    photo_id: int


class _Picks(BaseModel):
    picks: list[_Pick] = Field(default_factory=list)


# Static system prompt: byte-identical across tenants (prompt caching).
SYSTEM_PROMPT = """You choose photographs for a solo coach's brand-new website.

You receive the coach's brief, a list of image slots, and two candidate photo
lists (hero and content). Assign the best-fitting photo to each slot.

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


def pick_photos(brief: CoachBrief, slots: list[Slot], *, tenant_schema: str) -> dict[str, CuratedPhoto]:
    """One structured call -> {slot_name: CuratedPhoto row}. Model-returned
    ids are validated against the shortlist AND the slot's kind group;
    anything else is dropped. Raises CurateError on provider failure."""
    if not slots:
        return {}
    with schema_context("public"):
        rows = list(CuratedPhoto.objects.filter(enabled=True).order_by("position", "id"))
    hero_pool = shortlist([r for r in rows if r.kind in HERO_KINDS], brief, limit=SHORTLIST_LIMIT)
    content_pool = shortlist([r for r in rows if r.kind in CONTENT_KINDS], brief, limit=SHORTLIST_LIMIT)
    if not hero_pool and not content_pool:
        return {}

    lines = [brief_block(brief), "", "<slots>"]
    lines += [f"{s.name}: {s.label}" for s in slots]
    lines.append("</slots>")
    for group_name, pool in (("hero", hero_pool), ("content", content_pool)):
        lines.append(f"<{group_name}_photos>")
        lines += [f'{r.pk}: "{r.title}" tags: {r.tags}' for r in pool]
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

    allowed = {"hero": {r.pk for r in hero_pool}, "content": {r.pk for r in content_pool}}
    by_id = {r.pk: r for r in hero_pool + content_pool}
    slot_group = {s.name: s.group for s in slots}
    out: dict[str, CuratedPhoto] = {}
    for pick in parsed.picks:
        group = slot_group.get(pick.slot)
        if group and pick.photo_id in allowed[group] and pick.slot not in out:
            out[pick.slot] = by_id[pick.photo_id]
    return out


def apply_photo_picks(picks: dict[str, CuratedPhoto], *, pages: dict, courses, events, niche: str) -> None:
    """Materialize picked rows into tenant Photos and write them into the
    pages dict (in place) / course thumbnails / event covers. Must run inside
    the tenant context (creates media.Photo rows)."""
    from apps.core.curated_photos.materialize import materialize_curated_photo
    from apps.tenant_config.seeding import refresh_seeded_fingerprints, register_seeded

    created = []

    def photo_for(row):
        photo = materialize_curated_photo(row)
        created.append(photo)
        return photo

    course_by_pk = {str(c.pk): c for c in courses}
    groups = {f"event:{m}:{t}": rows for m, t, rows in event_groups(events)}
    touched = []

    for slot_name, row in picks.items():
        photo = photo_for(row)
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
