# AI Touch in Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Personalize freshly provisioned tenants using the curated photo/logo catalogs plus the coach's wizard answers — curated photos into pages, AI-ranked curated logos in the wizard, a deeper AI copy pass, and one starter blog post.

**Architecture:** A shared `CoachBrief` + token-overlap prefilter (`apps/core/onboarding/ai_curate.py`) feeds one `ai.structured()` call per concern. Photo picks and the starter post run inside the existing `provision_tenant` Celery task (LLM step in a capped worker thread, DB writes in the main thread); logo ranking runs as its own small Celery task triggered by the wizard's business-chapter save and lands in `wizard_state`. Every AI step is fail-silent: any failure degrades to today's behavior.

**Tech Stack:** Django 5.1, Celery, pydantic (via `apps.core.ai.structured`), pytest, Next.js 14 (frontend-main wizard), vitest.

**Spec:** `docs/superpowers/specs/2026-07-19-ai-touch-onboarding-design.md`

## Global Constraints

- Every AI step wraps failures and degrades to today's behavior; provisioning must never fail or block because of AI (spec "Non-negotiable rule").
- All LLM calls go through `apps.core.ai.structured` with `model=settings.ONBOARDING_AI_MODEL`, gated by `ai_compose.compose_available()` and recorded via `ai_compose.record_spend` (existing `ONBOARDING_AI_*` budget). No new settings, no schema migrations.
- Model-returned ids are validated against the prefilter shortlist; hallucinated ids are dropped (that slot keeps its demo-seed asset).
- Public-schema catalog reads use `schema_context("public")`; tenant writes only in the main task thread inside `tenant_context` (worker threads get fresh public-schema connections).
- `apps/core` uses function-local imports to dodge import cycles — keep that pattern (see `backend/apps/core/CLAUDE.md`).
- Pre-commit must pass with zero warnings; run `make lint` before each commit.
- Backend tests run inside the container: `docker compose exec django pytest <path> -v` (dev stack must be up: `make dev`).

---

### Task 1: `ai_curate.py` — CoachBrief + prefilter foundation

**Files:**
- Create: `backend/apps/core/onboarding/ai_curate.py`
- Test: `backend/apps/core/tests/test_ai_curate.py`

**Interfaces:**
- Consumes: `Tenant.wizard_state` JSON (`answers` key), nothing else.
- Produces (used by Tasks 3, 5, 8):
  - `CoachBrief` frozen dataclass: fields `niche: str`, `description: str`, `followups: tuple[tuple[str, str], ...]`, `goals: tuple[str, ...]`, `theme: str`, `font_family: str`, `brand_name: str`, `locale: str`; classmethod `CoachBrief.from_tenant(tenant, locale="en") -> CoachBrief`.
  - `brief_block(brief: CoachBrief) -> str` — `<coach_brief>` prompt section.
  - `tokens(text: str) -> set[str]`, `brief_tokens(brief) -> set[str]`.
  - `shortlist(rows, brief, *, limit=40) -> list` — rows need `.title`, `.tags` (comma-separated str), `.position`, `.pk`.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/core/tests/test_ai_curate.py
"""Unit tests for the AI-touch foundation: brief assembly + prefilter."""

from types import SimpleNamespace

from apps.core.onboarding import ai_curate


def _row(pk, title, tags, position=0):
    return SimpleNamespace(pk=pk, title=title, tags=tags, position=position)


def _tenant(answers, name="Glow Studio"):
    return SimpleNamespace(wizard_state={"answers": answers}, name=name)


def test_brief_from_tenant_reads_wizard_answers():
    tenant = _tenant(
        {
            "niche": "yoga",
            "description": "Vinyasa for busy professionals",
            "description_followups": {"items": [{"q": "Who?", "a": "Office workers"}, {"q": "", "a": "dropped"}]},
            "goals": ["sell_courses"],
            "theme": "forest",
            "font_family": "Lora",
        }
    )
    brief = ai_curate.CoachBrief.from_tenant(tenant, locale="tr")
    assert brief.niche == "yoga"
    assert brief.description == "Vinyasa for busy professionals"
    assert brief.followups == (("Who?", "Office workers"),)
    assert brief.goals == ("sell_courses",)
    assert brief.theme == "forest"
    assert brief.brand_name == "Glow Studio"
    assert brief.locale == "tr"


def test_brief_from_tenant_defaults_on_empty_state():
    brief = ai_curate.CoachBrief.from_tenant(SimpleNamespace(wizard_state=None, name="X"), locale="en")
    assert brief.niche == "general"
    assert brief.description == ""
    assert brief.followups == ()


def test_brief_block_contains_coach_words_and_language():
    brief = ai_curate.CoachBrief(
        niche="yoga", description="Calm vinyasa", followups=(("Who?", "Beginners"),), locale="tr", brand_name="Glow"
    )
    block = ai_curate.brief_block(brief)
    assert "<coach_brief>" in block and "</coach_brief>" in block
    assert "Calm vinyasa" in block
    assert 'Asked: "Who?"' in block
    assert "Turkish" in block


def test_shortlist_orders_by_token_overlap_then_position():
    brief = ai_curate.CoachBrief(niche="yoga", description="meditation and breathing for stress")
    rows = [
        _row(1, "Gym Barbell", "gym, barbell, strength", position=0),
        _row(2, "Lotus Calm", "yoga, meditation, lotus", position=5),
        _row(3, "Breathing Space", "breathing, stress, calm", position=1),
        _row(4, "Sunset", "sunset, beach", position=2),
    ]
    picked = ai_curate.shortlist(rows, brief, limit=3)
    assert [r.pk for r in picked[:2]] == [2, 3]  # both 2-token hits... 2 has yoga+meditation, 3 has breathing+stress
    assert picked[2].pk in (1, 4)  # zero-score tail filled by position


def test_shortlist_empty_brief_returns_position_order():
    brief = ai_curate.CoachBrief()
    rows = [_row(1, "B", "b", position=2), _row(2, "A", "a", position=1)]
    assert [r.pk for r in ai_curate.shortlist(rows, brief, limit=2)] == [2, 1]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/core/tests/test_ai_curate.py -v`
Expected: FAIL with `ModuleNotFoundError` / `AttributeError` (module doesn't exist).

- [ ] **Step 3: Write the implementation**

```python
# backend/apps/core/onboarding/ai_curate.py
"""Shared foundation for the onboarding AI touch (curated photos, logo rank).

One CoachBrief per tenant, assembled from wizard_state, feeds every AI-touch
call. The prefilter is deliberately non-LLM (same idea as apps.blog.curated):
lowercase token overlap between the coach's own words and each catalog row's
tags/title, so one cheap structured call only ever sees a shortlist.
Spec: docs/superpowers/specs/2026-07-19-ai-touch-onboarding-design.md
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class CoachBrief:
    niche: str = "general"
    description: str = ""
    followups: tuple[tuple[str, str], ...] = ()
    goals: tuple[str, ...] = ()
    theme: str = "ocean"
    font_family: str = "Inter"
    brand_name: str = ""
    locale: str = "en"

    @classmethod
    def from_tenant(cls, tenant, locale: str = "en") -> CoachBrief:
        answers = (tenant.wizard_state or {}).get("answers") or {}
        followups = tuple(
            (str(item.get("q") or "").strip(), str(item.get("a") or "").strip())
            for item in ((answers.get("description_followups") or {}).get("items") or [])
            if str(item.get("q") or "").strip() and str(item.get("a") or "").strip()
        )
        return cls(
            niche=answers.get("niche") or "general",
            description=str(answers.get("description") or ""),
            followups=followups,
            goals=tuple(answers.get("goals") or ()),
            theme=answers.get("theme") or "ocean",
            font_family=answers.get("font_family") or "Inter",
            brand_name=tenant.name or "",
            locale=locale,
        )


def brief_block(brief: CoachBrief) -> str:
    """Tenant-specific prompt section. Static system prompts must stay
    byte-identical across tenants (prompt caching) — everything coach-specific
    goes through here."""
    language = "Turkish" if brief.locale == "tr" else "English"
    lines = [
        "<coach_brief>",
        f"Brand: {brief.brand_name or 'a new coaching brand'}",
        f"Niche: {brief.niche}",
        f"In their own words: {brief.description or '-'}",
    ]
    for q, a in brief.followups:
        lines.append(f'Asked: "{q}" — coach answered: "{a}"')
    lines += [
        f"They plan to offer: {', '.join(brief.goals) or '-'}",
        f"Site theme: {brief.theme}; font: {brief.font_family}",
        f"The coach writes in: {language}",
        "</coach_brief>",
    ]
    return "\n".join(lines)


def tokens(text: str) -> set[str]:
    return {w for w in re.split(r"[^\w]+", (text or "").lower()) if len(w) >= 3}


def brief_tokens(brief: CoachBrief) -> set[str]:
    parts = [brief.niche.replace("_", " "), brief.description]
    parts += [f"{q} {a}" for q, a in brief.followups]
    return tokens(" ".join(parts))


def shortlist(rows, brief: CoachBrief, *, limit: int = 40) -> list:
    """Top `limit` catalog rows by token overlap with the coach's own words;
    catalog position breaks ties, zero-score rows fill the tail (a thin match
    must not shrink the model's choice set to nothing)."""
    bt = brief_tokens(brief)

    def score(row) -> int:
        return len(bt & (tokens(row.tags.replace(",", " ")) | tokens(row.title)))

    return sorted(rows, key=lambda r: (-score(r), r.position, r.pk))[:limit]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec django pytest apps/core/tests/test_ai_curate.py -v`
Expected: 5 passed.

- [ ] **Step 5: Lint and commit**

```bash
make lint
git add backend/apps/core/onboarding/ai_curate.py backend/apps/core/tests/test_ai_curate.py
git commit -m "feat(onboarding): CoachBrief + curated-catalog prefilter foundation"
```

---

### Task 2: `refresh_seeded_fingerprints` — keep demo-erase honest after AI edits

**Files:**
- Modify: `backend/apps/tenant_config/seeding.py` (append function at end)
- Test: `backend/apps/tenant_config/tests/test_seeding_fingerprints.py` (create; if the app's tests live elsewhere — check `ls backend/apps/tenant_config/tests/` — put the file beside the existing seeding tests)

**Why:** `register_seeded` fingerprints objects at seed time so the erase flow can tell coach-touched content apart. Tasks 4 and 7 mutate seeded courses/events/downloads *after* registration (AI thumbnails + renames); without refreshing fingerprints every seeded object would look coach-edited and the "Demo" badge/erase logic breaks.

**Interfaces:**
- Consumes: `SeededObject` model, `fingerprint_for(obj)` (both already in `seeding.py`).
- Produces (used by Tasks 4 and 7): `refresh_seeded_fingerprints(objs) -> None` — re-fingerprints existing `SeededObject` rows for the given model instances; silently skips unregistered objects.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/tenant_config/tests/test_seeding_fingerprints.py
"""refresh_seeded_fingerprints: post-seed AI edits must not read as coach edits."""

import pytest
from django.contrib.contenttypes.models import ContentType

from apps.tenant_config.models import SeededObject
from apps.tenant_config.seeding import fingerprint_for, refresh_seeded_fingerprints, register_seeded

pytestmark = pytest.mark.django_db


@pytest.fixture()
def download(tenant_schema):  # reuse the app's existing tenant-schema fixture name — check conftest
    from apps.downloads.models import DownloadFile

    return DownloadFile.objects.create(title="Seeded Guide")


def test_refresh_updates_fingerprint_after_mutation(download):
    register_seeded([download], niche="yoga")
    row = SeededObject.objects.get(object_id=str(download.pk))
    old_fp = row.fingerprint

    download.title = "AI Renamed Guide"
    download.save(update_fields=["title"])
    refresh_seeded_fingerprints([download])

    row.refresh_from_db()
    assert row.fingerprint != old_fp
    assert row.fingerprint == fingerprint_for(download)


def test_refresh_ignores_unregistered_objects(download):
    # No register_seeded call — must be a no-op, not an error.
    refresh_seeded_fingerprints([download])
    assert SeededObject.objects.count() == 0
```

Note for the implementer: this app's tests may use a different tenant-schema fixture (look at an existing test in `backend/apps/tenant_config/tests/` and mirror its fixtures/imports exactly — the test body above is what matters). If `DownloadFile` needs the tenant schema, copy the schema setup the neighboring tests use.

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_seeding_fingerprints.py -v`
Expected: FAIL with `ImportError: cannot import name 'refresh_seeded_fingerprints'`.

- [ ] **Step 3: Implement**

Append to `backend/apps/tenant_config/seeding.py`:

```python
def refresh_seeded_fingerprints(objs) -> None:
    """Re-baseline SeededObject fingerprints after a system-driven mutation
    (onboarding AI renames/thumbnails). Without this, AI edits made right
    after seeding would read as coach edits and break the erase flow's
    "has the coach touched this?" answer. Unregistered objects are skipped."""
    for obj in objs:
        obj.refresh_from_db()
        SeededObject.objects.filter(
            content_type=ContentType.objects.get_for_model(obj, for_concrete_model=True),
            object_id=str(obj.pk),
        ).update(fingerprint=fingerprint_for(obj))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_seeding_fingerprints.py -v`
Expected: 2 passed.

- [ ] **Step 5: Lint and commit**

```bash
make lint
git add backend/apps/tenant_config/seeding.py backend/apps/tenant_config/tests/test_seeding_fingerprints.py
git commit -m "feat(tenant-config): refresh_seeded_fingerprints for post-seed system edits"
```

---

### Task 3: `ai_photos.py` — slots, LLM pick, apply

**Files:**
- Create: `backend/apps/core/onboarding/ai_photos.py`
- Test: `backend/apps/core/tests/test_ai_photos.py`

**Interfaces:**
- Consumes: `ai_curate.CoachBrief` / `brief_block` / `shortlist` (Task 1); `apps.core.models.CuratedPhoto`; `apps.core.curated_photos.materialize.materialize_curated_photo(row) -> Photo`; `apps.core.ai.structured`; `ai_compose.record_spend(tenant_schema, usd)`; `register_seeded(objs, niche=...)` + `refresh_seeded_fingerprints(objs)` (Task 2).
- Produces (used by Task 4):
  - `Slot` frozen dataclass: `name: str`, `label: str`, `group: str` (`"hero"` or `"content"`).
  - `build_slots(answers: dict, courses, events) -> list[Slot]` — slot names: `"hero"`, `"about"`, `"course:<pk>"`, `"event:<ModelName>:<title>"`.
  - `event_groups(events) -> list[tuple[str, str, list]]` — `(model_name, title, rows)` distinct by (model, title), insertion-ordered.
  - `pick_photos(brief, slots, *, tenant_schema) -> dict[str, CuratedPhoto]` — raises `CurateError` on provider failure; empty dict when nothing to do.
  - `apply_photo_picks(picks, *, pages, courses, events, niche) -> None` — mutates `pages` in place, saves course/event rows, registers materialized photos, refreshes fingerprints. Must run inside the tenant context.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/core/tests/test_ai_photos.py
"""Unit tests for curated-photo slot picking (LLM mocked)."""

from types import SimpleNamespace

import pytest

from apps.core.onboarding import ai_photos
from apps.core.onboarding.ai_curate import CoachBrief

pytestmark = pytest.mark.django_db


class FakeCourse(SimpleNamespace):
    pass


def _course(pk, title):
    return FakeCourse(pk=pk, title=title)


def _event(pk, title, model="LiveClass"):
    e = SimpleNamespace(pk=pk, title=title)
    e.__class__.__name__  # noqa: B018 — SimpleNamespace; model name faked via type() below
    return e


def test_build_slots_hero_about_courses_events():
    courses = [_course(1, "Morning Flow"), _course(2, "Deep Stretch")]

    class LiveClass(SimpleNamespace):
        pass

    events = [LiveClass(pk=10, title="Sunrise Live"), LiveClass(pk=11, title="Sunrise Live")]
    slots = ai_photos.build_slots({"hero_style": "split"}, courses, events)
    names = [s.name for s in slots]
    assert names == ["hero", "about", "course:1", "course:2", "event:LiveClass:Sunrise Live"]
    assert slots[0].group == "hero"
    assert all(s.group == "content" for s in slots[1:])


def test_build_slots_minimal_hero_skipped():
    slots = ai_photos.build_slots({"hero_style": "minimal"}, [], [])
    assert [s.name for s in slots] == ["about"]


def test_event_groups_distinct_by_model_and_title():
    class LiveClass(SimpleNamespace):
        pass

    class ZoomClass(SimpleNamespace):
        pass

    a1, a2 = LiveClass(pk=1, title="Flow"), LiveClass(pk=2, title="Flow")
    b = ZoomClass(pk=3, title="Flow")
    groups = ai_photos.event_groups([a1, a2, b])
    assert [(m, t, [r.pk for r in rows]) for m, t, rows in groups] == [
        ("LiveClass", "Flow", [1, 2]),
        ("ZoomClass", "Flow", [3]),
    ]


def _seed_catalog():
    from apps.core.models import CuratedPhoto

    hero = CuratedPhoto.objects.create(
        title="Yoga Sunrise", tags="yoga, calm", kind="hero", image_key="platform/curated-photos/h1.jpg", position=1
    )
    stock = CuratedPhoto.objects.create(
        title="Mat Closeup", tags="yoga, mat", kind="stock", image_key="platform/curated-photos/s1.jpg", position=2
    )
    return hero, stock


def _fake_structured(picks):
    def fake(**kwargs):
        parsed = kwargs["output_model"].model_validate({"picks": picks})
        return parsed, 0.01, "claude-haiku-4-5"

    return fake


def test_pick_photos_validates_ids_and_groups(monkeypatch):
    hero, stock = _seed_catalog()
    slots = [
        ai_photos.Slot("hero", "Homepage hero", "hero"),
        ai_photos.Slot("course:1", 'Thumbnail for "Morning Flow"', "content"),
    ]
    monkeypatch.setattr(
        ai_photos.core_ai,
        "structured",
        _fake_structured(
            [
                {"slot": "hero", "photo_id": hero.pk},
                {"slot": "course:1", "photo_id": 999999},  # hallucinated -> dropped
                {"slot": "nonsense", "photo_id": stock.pk},  # unknown slot -> dropped
            ]
        ),
    )
    picks = ai_photos.pick_photos(CoachBrief(niche="yoga"), slots, tenant_schema="glow")
    assert set(picks) == {"hero"}
    assert picks["hero"].pk == hero.pk


def test_pick_photos_hero_slot_rejects_stock_kind(monkeypatch):
    hero, stock = _seed_catalog()
    slots = [ai_photos.Slot("hero", "Homepage hero", "hero")]
    monkeypatch.setattr(ai_photos.core_ai, "structured", _fake_structured([{"slot": "hero", "photo_id": stock.pk}]))
    picks = ai_photos.pick_photos(CoachBrief(niche="yoga"), slots, tenant_schema="glow")
    assert picks == {}


def test_pick_photos_no_slots_no_call(monkeypatch):
    def boom(**kwargs):
        raise AssertionError("must not call the provider with no slots")

    monkeypatch.setattr(ai_photos.core_ai, "structured", boom)
    assert ai_photos.pick_photos(CoachBrief(), [], tenant_schema="glow") == {}


def test_pick_photos_provider_error_raises_curate_error(monkeypatch):
    _seed_catalog()
    from apps.core import ai as core_ai

    def fail(**kwargs):
        raise core_ai.AiError("provider down")

    monkeypatch.setattr(ai_photos.core_ai, "structured", fail)
    with pytest.raises(ai_photos.CurateError):
        ai_photos.pick_photos(CoachBrief(niche="yoga"), [ai_photos.Slot("hero", "x", "hero")], tenant_schema="glow")
```

Notes for the implementer:
- `CuratedPhoto` is a public-schema model; these tests run in the default test schema, which for `apps/core` tests IS the public schema (see neighboring `test_curated_photos.py` for the exact fixtures used — mirror them if plain `django_db` isn't enough).
- `core_ai.AiError` — check its constructor in `backend/apps/core/ai.py` (it may require a `cost_usd` kwarg); adjust the `fail` helper to match.
- `apply_photo_picks` DB-write behavior (materialize + course/event saves + fingerprint refresh) is integration-tested in Task 4 where a real tenant schema exists; don't unit-test it here.

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/core/tests/test_ai_photos.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

```python
# backend/apps/core/onboarding/ai_photos.py
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
        slots.append(Slot(f"course:{course.pk}", f'Thumbnail for the course "{course.title}" (content list)', "content"))
    for model_name, title, _rows in event_groups(events):
        slots.append(Slot(f"event:{model_name}:{title}", f'Cover for the live event "{title}" (content list)', "content"))
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec django pytest apps/core/tests/test_ai_photos.py -v`
Expected: 7 passed.

- [ ] **Step 5: Lint and commit**

```bash
make lint
git add backend/apps/core/onboarding/ai_photos.py backend/apps/core/tests/test_ai_photos.py
git commit -m "feat(onboarding): curated-photo slot picker (prefilter + one structured call)"
```

---

### Task 4: wire photo picks into `provision_tenant`

**Files:**
- Modify: `backend/apps/core/tasks.py` (refactor `_compose_pages_with_ai` thread wrapper into `_run_ai_step`; add `_pick_photos_with_ai`; call it from `_apply_wizard_answers`)
- Test: `backend/apps/core/tests/test_wizard_provision.py` (add one integration test)

**Interfaces:**
- Consumes: `ai_photos.build_slots/pick_photos/apply_photo_picks` (Task 3), `ai_compose.compose_available()`.
- Produces (used by Tasks 5, 7, 8): `_run_ai_step(label, tenant, fn, timeout_seconds) -> tuple[result | None, str]` in `tasks.py` — runs `fn` in a one-shot worker thread with a hard cap; returns `(result, "ok")` or `(None, "failed")`; never raises. Status key `wizard_state["ai_photos_status"]` (`"ok" | "empty" | "skipped" | "failed"`).

- [ ] **Step 1: Write the failing test**

Add to `backend/apps/core/tests/test_wizard_provision.py` (reuse the module's existing `_make_tenant` / `_provision` helpers and `WIZARD_ANSWERS`):

```python
def test_provision_applies_ai_photo_picks(monkeypatch):
    """AI-picked curated photos land in pages + course thumbnails; status recorded."""
    from django_tenants.utils import schema_context

    from apps.core.models import CuratedPhoto
    from apps.core.onboarding import ai_photos

    with schema_context("public"):
        hero_row = CuratedPhoto.objects.create(
            title="Yoga Sunrise", tags="yoga, calm", kind="hero",
            image_key="platform/curated-photos/test-hero.jpg", position=1,
        )

    def fake_pick(brief, slots, *, tenant_schema):
        # Deterministic stand-in for the LLM: hero + first course slot.
        picks = {}
        for slot in slots:
            if slot.name == "hero":
                picks["hero"] = hero_row
            elif slot.name.startswith("course:") and "course" not in {k.split(":")[0] for k in picks}:
                picks[slot.name] = hero_row
        return picks

    monkeypatch.setattr(ai_photos, "pick_photos", fake_pick)
    # AI gate open for photos, closed for compose (compose has its own tests):
    from apps.core.onboarding import ai_compose

    monkeypatch.setattr(ai_compose, "compose_available", lambda: True)
    from apps.core.onboarding import ai_compose as _c  # compose call itself must not run
    monkeypatch.setattr(_c, "compose_pages", lambda *a, **k: (_ for _ in ()).throw(_c.ComposeError("off")))

    tenant = _make_tenant("prov-ai-photos", WIZARD_ANSWERS)
    tenant = _provision(tenant)

    assert tenant.provisioning_status == "ready"
    assert (tenant.wizard_state or {}).get("ai_photos_status") == "ok"
    with tenant_context(tenant):
        from apps.courses.models import Course
        from apps.media.models import Photo
        from apps.tenant_config.models import TenantConfig

        config = TenantConfig.objects.first()
        hero_block = config.pages["home"]["blocks"][0]
        photo = Photo.objects.get(s3_key="platform/curated-photos/test-hero.jpg")
        assert hero_block["bgImage"]["photo_id"] == str(photo.pk)
        assert Course.objects.filter(thumbnail=photo).exists()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_provision.py::test_provision_applies_ai_photo_picks -v`
Expected: FAIL — `ai_photos_status` is `None` (nothing wires the picker yet).

- [ ] **Step 3: Implement in `tasks.py`**

3a. Replace the thread plumbing inside `_compose_pages_with_ai` with a shared helper (keep `AI_COMPOSE_TIMEOUT_SECONDS = 90`):

```python
def _run_ai_step(label, tenant, fn, timeout_seconds):
    """Run one AI step in a capped worker thread. Returns (result, "ok") or
    (None, "failed"); NEVER raises. The thread gets fresh DB connections and
    must only do public-schema reads/writes or pure compute — tenant-schema
    writes belong to the caller's thread."""
    from concurrent.futures import ThreadPoolExecutor
    from concurrent.futures import TimeoutError as FutureTimeout

    def run():
        from django.db import close_old_connections

        close_old_connections()
        try:
            return fn()
        finally:
            close_old_connections()

    pool = ThreadPoolExecutor(max_workers=1)
    future = pool.submit(run)
    try:
        result = future.result(timeout=timeout_seconds)
    except FutureTimeout:
        logger.warning("onboarding %s timed out for %s", label, tenant.slug)
        pool.shutdown(wait=False)
        return None, "failed"
    except Exception:
        logger.exception("onboarding %s failed for %s", label, tenant.slug)
        pool.shutdown(wait=False)
        return None, "failed"
    pool.shutdown(wait=False)
    return result, "ok"


def _compose_pages_with_ai(tenant, answers, pages, preferred_locale):
    """AI copy pass. Returns (pages, status); falls back to the static pages."""
    from apps.core.onboarding import ai_compose

    if not ai_compose.compose_available():
        return pages, "skipped"

    def run():
        return ai_compose.compose_pages(
            pages,
            brand_name=tenant.name,
            niche=answers.get("niche") or "general",
            description=answers.get("description") or "",
            followups=list(((answers.get("description_followups") or {}).get("items")) or []),
            goals=list(answers.get("goals") or []),
            locale=preferred_locale,
            tenant_schema=tenant.schema_name,
        )

    result, status = _run_ai_step("ai compose", tenant, run, AI_COMPOSE_TIMEOUT_SECONDS)
    return (result if status == "ok" else pages), status
```

3b. Add the photo step (below `_compose_pages_with_ai`):

```python
AI_PHOTO_PICK_TIMEOUT_SECONDS = 60


def _pick_photos_with_ai(tenant, answers, pages, preferred_locale):
    """Curated-photo pick: LLM step in the capped thread (public-schema reads
    only), apply in this thread (we're inside tenant_context). Mutates `pages`
    in place on success. Returns a status string; never raises."""
    from apps.core.onboarding import ai_compose, ai_curate, ai_photos

    if not ai_compose.compose_available():
        return "skipped"

    from apps.courses.models import Course
    from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass

    brief = ai_curate.CoachBrief.from_tenant(tenant, locale=preferred_locale)
    courses = list(Course.objects.order_by("id")[:8])
    events = [
        *LiveClass.objects.filter(status="draft").order_by("id"),
        *LiveStream.objects.filter(status="draft").order_by("id"),
        *ZoomClass.objects.filter(status="draft").order_by("id"),
        *OnsiteEvent.objects.filter(status="draft").order_by("id"),
    ]
    slots = ai_photos.build_slots(answers, courses, events)
    picks, status = _run_ai_step(
        "ai photo pick",
        tenant,
        lambda: ai_photos.pick_photos(brief, slots, tenant_schema=tenant.schema_name),
        AI_PHOTO_PICK_TIMEOUT_SECONDS,
    )
    if status != "ok":
        return status
    if not picks:
        return "empty"
    try:
        ai_photos.apply_photo_picks(
            picks, pages=pages, courses=courses, events=events, niche=tenant.template_niche or "general"
        )
    except Exception:
        logger.exception("onboarding ai photo apply failed for %s", tenant.slug)
        return "failed"
    return "ok"
```

3c. In `_apply_wizard_answers`, after the existing compose block and before the `for field, value in overrides.items()` loop, add:

```python
        photos_status = None
        if not state.get("ai_photos_status"):
            photos_status = _pick_photos_with_ai(tenant, answers, overrides["pages"], preferred_locale)
```

and extend the state write at the bottom (replace the `if ai_status is not None:` block):

```python
        if ai_status is not None or photos_status is not None:
            if ai_status is not None:
                state["ai_compose_status"] = ai_status
            if photos_status is not None:
                state["ai_photos_status"] = photos_status
            tenant.wizard_state = state
            tenant.save(update_fields=["wizard_state"])
```

- [ ] **Step 4: Run the new test + the whole provision/compose surface**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_provision.py apps/core/tests/test_ai_compose.py apps/core/tests/test_wizard_compose.py -v`
Expected: all pass (the refactored `_compose_pages_with_ai` must not change existing behavior).

- [ ] **Step 5: Lint and commit**

```bash
make lint
git add backend/apps/core/tasks.py backend/apps/core/tests/test_wizard_provision.py
git commit -m "feat(onboarding): AI curated-photo picks inside provision_tenant"
```

---

### Task 5: curated-logo AI rank — backend task + wizard trigger

**Files:**
- Modify: `backend/apps/core/onboarding/ai_curate.py` (add `rank_logos`)
- Modify: `backend/apps/core/tasks.py` (add `rank_curated_logos` task)
- Modify: `backend/apps/core/onboarding/wizard.py` (enqueue on business-chapter PATCH)
- Test: `backend/apps/core/tests/test_ai_curate.py` (rank), `backend/apps/core/tests/test_wizard_state_endpoints.py` (trigger)

**Interfaces:**
- Consumes: Task 1 foundation; `CuratedLogo`; `ai_compose.compose_available/record_spend`.
- Produces (used by Task 6): `wizard_state["curated_logo_rank"]: list[int]` (ordered CuratedLogo ids, best first, ≤24). Celery task `apps.core.tasks.rank_curated_logos(tenant_id)`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/core/tests/test_ai_curate.py`:

```python
import pytest

pytestmark = pytest.mark.django_db  # module-level; merge with existing marks if present


def _seed_logos():
    from apps.core.models import CuratedLogo

    rows = [
        CuratedLogo.objects.create(
            title="Lotus Mark", tags="yoga, lotus, calm", image_key="platform/curated-logos/a.png", position=1
        ),
        CuratedLogo.objects.create(
            title="Barbell Mark", tags="gym, barbell", image_key="platform/curated-logos/b.png", position=2
        ),
    ]
    return rows


def test_rank_logos_returns_validated_ordered_ids(monkeypatch):
    rows = _seed_logos()
    from apps.core.onboarding import ai_curate

    def fake(**kwargs):
        parsed = kwargs["output_model"].model_validate(
            {"logo_ids": [rows[1].pk, 999999, rows[0].pk, rows[1].pk]}  # hallucination + dupe
        )
        return parsed, 0.005, "claude-haiku-4-5"

    monkeypatch.setattr(ai_curate.core_ai, "structured", fake)
    ids = ai_curate.rank_logos(ai_curate.CoachBrief(niche="yoga"), tenant_schema="glow")
    assert ids == [rows[1].pk, rows[0].pk]


def test_rank_logos_empty_catalog_no_call(monkeypatch):
    from apps.core.onboarding import ai_curate

    def boom(**kwargs):
        raise AssertionError("no call expected")

    monkeypatch.setattr(ai_curate.core_ai, "structured", boom)
    assert ai_curate.rank_logos(ai_curate.CoachBrief(), tenant_schema="glow") == []
```

Append to `backend/apps/core/tests/test_wizard_state_endpoints.py`:

```python
def test_business_chapter_patch_enqueues_logo_rank(tenant, monkeypatch):
    from apps.core import tasks as core_tasks

    calls = []
    monkeypatch.setattr(core_tasks.rank_curated_logos, "delay", lambda tenant_id: calls.append(tenant_id))

    _patch(_token(), answers={"niche": "yoga"})
    assert calls == []  # description not yet present
    _patch(_token(), answers={"description": "Vinyasa for busy professionals"})
    assert calls == [tenant.id]


def test_theme_patch_does_not_enqueue_logo_rank(tenant, monkeypatch):
    from apps.core import tasks as core_tasks

    calls = []
    monkeypatch.setattr(core_tasks.rank_curated_logos, "delay", lambda tenant_id: calls.append(tenant_id))
    _patch(_token(), answers={"niche": "yoga"})
    _patch(_token(), answers={"theme": "forest"})
    assert calls == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_ai_curate.py apps/core/tests/test_wizard_state_endpoints.py -v`
Expected: new tests FAIL (`rank_logos` / `rank_curated_logos` don't exist).

- [ ] **Step 3: Implement**

3a. Append to `ai_curate.py` (new imports at top: `from django.conf import settings`, `from django_tenants.utils import schema_context`, `from pydantic import BaseModel, Field`, `from apps.core import ai as core_ai`):

```python
LOGO_RANK_TOP = 24
LOGO_RANK_POOL = 60
LOGO_RANK_MAX_TOKENS = 600


class _LogoRank(BaseModel):
    logo_ids: list[int] = Field(default_factory=list)


# Static system prompt: byte-identical across tenants (prompt caching).
LOGO_RANK_SYSTEM_PROMPT = """You rank ready-made logo marks for a solo coach's new brand.

You receive the coach's brief and a candidate list of logo marks (id, title,
tags). Return logo_ids: the candidate ids ordered best-fit first — subject
match with the coach's niche and their own description weighs most, then
overall style fit. Return at most 24 ids; ids must come from the list.
"""


def rank_logos(brief: CoachBrief, *, tenant_schema: str) -> list[int]:
    """One structured call -> ordered CuratedLogo ids (validated, deduped,
    capped). Raises core_ai.AiError upward only as an empty result is not
    acceptable — callers treat exceptions as "no rank"."""
    from apps.core.models import CuratedLogo
    from apps.core.onboarding import ai_compose

    with schema_context("public"):
        rows = list(CuratedLogo.objects.filter(enabled=True).order_by("position", "id"))
    pool = shortlist(rows, brief, limit=LOGO_RANK_POOL)
    if not pool:
        return []
    lines = [brief_block(brief), "", "<curated_logos>"]
    lines += [f'{r.pk}: "{r.title}" tags: {r.tags}' for r in pool]
    lines.append("</curated_logos>")
    try:
        parsed, cost, _model = core_ai.structured(
            system=LOGO_RANK_SYSTEM_PROMPT,
            user="\n".join(lines),
            output_model=_LogoRank,
            model=settings.ONBOARDING_AI_MODEL,
            max_tokens=LOGO_RANK_MAX_TOKENS,
        )
    except core_ai.AiError as exc:
        ai_compose.record_spend(tenant_schema, float(getattr(exc, "cost_usd", 0) or 0))
        raise
    ai_compose.record_spend(tenant_schema, float(cost or 0))
    valid = {r.pk for r in pool}
    out: list[int] = []
    for logo_id in parsed.logo_ids:
        if logo_id in valid and logo_id not in out:
            out.append(logo_id)
    return out[:LOGO_RANK_TOP]
```

(Function-local `ai_compose` import avoids a cycle: `ai_compose` does not import `ai_curate`, but keep the local-import house style.)

3b. Add to `backend/apps/core/tasks.py`:

```python
@shared_task
def rank_curated_logos(tenant_id):
    """Wizard-time helper: AI-rank the curated logo catalog for this coach and
    stash the order in wizard_state. Fired when the business chapter is saved;
    the logo step reads the result 4 steps later. Every failure path is a
    silent no-op — the wizard falls back to the client-side keyword rank."""
    from apps.core.constants import REGION_DEFAULT_LOCALE
    from apps.core.models import Tenant
    from apps.core.onboarding import ai_compose, ai_curate

    tenant = Tenant.objects.filter(id=tenant_id).first()
    if tenant is None or tenant.provisioning_status != "pending":
        return
    if not ai_compose.compose_available():
        return
    locale = REGION_DEFAULT_LOCALE.get(tenant.region or "global", "en")
    brief = ai_curate.CoachBrief.from_tenant(tenant, locale=locale)
    try:
        ids = ai_curate.rank_logos(brief, tenant_schema=tenant.schema_name)
    except Exception:
        logger.exception("curated logo rank failed for %s", tenant.slug)
        return
    if not ids:
        return
    # Re-read right before writing: the coach is actively PATCHing answers
    # while this task runs; last-write-wins on the whole JSON is the wizard's
    # existing contract, keep the window small.
    tenant.refresh_from_db()
    state = dict(tenant.wizard_state or {})
    state["curated_logo_rank"] = ids
    tenant.wizard_state = state
    tenant.save(update_fields=["wizard_state"])
```

3c. In `wizard.py`'s `wizard_state` view, right after `logger.info("wizard state saved ...")`:

```python
        if {"description", "goals"} & set(answers_in) and answers.get("niche") and answers.get("description"):
            from ..tasks import rank_curated_logos

            rank_curated_logos.delay(tenant.id)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_ai_curate.py apps/core/tests/test_wizard_state_endpoints.py -v`
Expected: all pass.

- [ ] **Step 5: Lint and commit**

```bash
make lint
git add backend/apps/core/onboarding/ai_curate.py backend/apps/core/tasks.py backend/apps/core/onboarding/wizard.py \
  backend/apps/core/tests/test_ai_curate.py backend/apps/core/tests/test_wizard_state_endpoints.py
git commit -m "feat(onboarding): AI curated-logo ranking task, triggered by business-chapter save"
```

---

### Task 6: wizard logo step consumes the AI rank

**Files:**
- Modify: `packages/shared/src/logo/curated-rank.ts` (add `applyAiRank`)
- Modify: `frontend-customer/src/lib/__tests__/curated-rank.test.ts` (add tests — the shared module's tests live here)
- Modify: `frontend-main/src/lib/wizard/types.ts` (state type gains `curated_logo_rank`)
- Modify: `frontend-main/src/app/signup/verify/wizard/logo-review-steps.tsx` (`LogoStep` fetches the rank and applies it)

**Interfaces:**
- Consumes: `wizard_state.curated_logo_rank: number[]` (Task 5); `readWizardState(token)` from `frontend-main/src/lib/wizard/api.ts` (already exists, returns `WizardStateResponse` with `.state`).
- Produces: `applyAiRank<T extends { id: number }>(items: T[], aiRank?: number[] | null): T[]` in `curated-rank.ts` — AI-ranked ids first (in rank order, unknown ids skipped), remaining items keep their existing order.

- [ ] **Step 1: Write the failing test**

Append to `frontend-customer/src/lib/__tests__/curated-rank.test.ts`:

```typescript
import { applyAiRank } from "@shared/logo/curated-rank";

describe("applyAiRank", () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

  it("puts AI-ranked ids first in rank order, rest keep keyword order", () => {
    expect(applyAiRank(items, [3, 1]).map((x) => x.id)).toEqual([3, 1, 2, 4]);
  });

  it("skips unknown ids and handles empty/absent rank", () => {
    expect(applyAiRank(items, [99, 2]).map((x) => x.id)).toEqual([2, 1, 3, 4]);
    expect(applyAiRank(items, undefined).map((x) => x.id)).toEqual([1, 2, 3, 4]);
    expect(applyAiRank(items, []).map((x) => x.id)).toEqual([1, 2, 3, 4]);
  });
});
```

(Match the file's existing import style — if it imports from a relative path instead of `@shared/...`, follow that.)

- [ ] **Step 2: Run test to verify it fails**

Run: `make test-frontend`
Expected: FAIL — `applyAiRank` is not exported.

- [ ] **Step 3: Implement**

3a. Append to `packages/shared/src/logo/curated-rank.ts`:

```typescript
/**
 * Overlay a server-computed AI rank (ordered logo ids, best first) on an
 * already keyword-ranked list: AI picks first, everything else keeps its
 * order. Absent/empty rank = unchanged list.
 */
export function applyAiRank<T extends { id: number }>(
  items: T[],
  aiRank?: number[] | null,
): T[] {
  if (!aiRank || aiRank.length === 0) return items;
  const byId = new Map(items.map((item) => [item.id, item]));
  const picked = aiRank
    .map((id) => byId.get(id))
    .filter((item): item is T => item !== undefined);
  const pickedIds = new Set(picked.map((item) => item.id));
  return [...picked, ...items.filter((item) => !pickedIds.has(item.id))];
}
```

3b. In `frontend-main/src/lib/wizard/types.ts`, add to the wizard state interface (the type of `WizardStateResponse["state"]`):

```typescript
  curated_logo_rank?: number[];
```

3c. In `logo-review-steps.tsx`'s `LogoStep`:

```typescript
import { applyAiRank, briefKeywords, rankCuratedLogos } from "@shared/logo/curated-rank";
import { getCuratedLogos, readWizardState } from "@/lib/wizard/api";
```

(check `api.ts` — `readWizardState` may need adding to the existing import line), then inside the component:

```typescript
  const [aiRank, setAiRank] = useState<number[] | undefined>(undefined);
  useEffect(() => {
    // Server-side AI rank computed while the coach walked the look/pages
    // chapters; absent (task still running / AI off) -> keyword rank only.
    readWizardState(token)
      .then((res) => setAiRank(res.state.curated_logo_rank))
      .catch(() => setAiRank(undefined));
  }, [token]);
```

and change the `ranked` memo's return to overlay the AI rank:

```typescript
  const ranked = useMemo(
    () =>
      applyAiRank(
        rankCuratedLogos(
          items.map((item) => ({
            item,
            id: item.id,
            title: item.title,
            tags: item.tags
              .split(",")
              .map((tag) => tag.trim().toLowerCase())
              .filter(Boolean),
          })),
          briefKeywords({ niche, description }),
        ).map((ranked) => ranked.item),
        aiRank,
      ),
    [items, niche, description, aiRank],
  );
```

(`applyAiRank` needs `id` on the ranked wrapper's output — it's applied to the unwrapped `CuratedLogoItem[]`, which has `id: number`.)

- [ ] **Step 4: Run tests + typecheck**

Run: `make test-frontend && make typecheck`
Expected: vitest passes; `tsc --noEmit` clean for both apps.

- [ ] **Step 5: Lint and commit**

```bash
make lint
git add packages/shared/src/logo/curated-rank.ts frontend-customer/src/lib/__tests__/curated-rank.test.ts \
  frontend-main/src/lib/wizard/types.ts frontend-main/src/app/signup/verify/wizard/logo-review-steps.tsx
git commit -m "feat(wizard): logo step overlays server AI rank on keyword-ranked curated logos"
```

---

### Task 7: deeper copy pass — meta description, navbar CTA, draft renames

**Files:**
- Modify: `backend/apps/core/onboarding/ai_compose.py` (extend result schema, brief, prompt; return extras)
- Modify: `backend/apps/core/tasks.py` (pass draft content in; apply extras)
- Test: `backend/apps/core/tests/test_ai_compose.py` (extend), `backend/apps/core/tests/test_wizard_provision.py` (extend the Task 4 test)

**Interfaces:**
- Consumes: seeded draft `Course` rows (`pk/title/description`, `is_published=False`) and `DownloadFile` rows (`pk/title` — DownloadFile has NO description field); `refresh_seeded_fingerprints` (Task 2).
- Produces: `compose_pages(pages, *, brand_name, niche, description, followups=(), goals, locale, tenant_schema, courses=(), downloads=()) -> tuple[dict, dict]` — **breaking signature change**: now returns `(pages, extras)`. `courses`/`downloads` are sequences of plain dicts `{"id": int, "title": str, "description": str}` (description `""` for downloads). `extras` keys: `meta_description: str`, `navbar_cta: str`, `courses: dict[int, dict]`, `downloads: dict[int, dict]` (values `{"title": str, "description": str}`, clamped, only ids that were sent).

- [ ] **Step 1: Update existing tests + add new ones**

In `backend/apps/core/tests/test_ai_compose.py`: every call site of `ai_compose.compose_pages(...)` now unpacks a tuple — change `out = _compose(...)` helpers so `_compose` returns just the pages part by default and add an `_compose_full` that returns both:

```python
def _compose(monkeypatch, blocks, **overrides):
    pages, _extras = _compose_full(monkeypatch, {"blocks": blocks}, **overrides)
    return pages


def _compose_full(monkeypatch, result_dict, **overrides):
    monkeypatch.setattr(ai_compose.core_ai, "structured", _fake_structured_dict(result_dict))
    kwargs = {
        "brand_name": "Glow",
        "niche": "yoga",
        "description": "Vinyasa for busy people",
        "goals": ["sell_courses"],
        "locale": "en",
        "tenant_schema": "glow",
    }
    kwargs.update(overrides)
    return ai_compose.compose_pages(PAGES, **kwargs)


def _fake_structured_dict(result_dict):
    def fake(**kwargs):
        parsed = kwargs["output_model"].model_validate(result_dict)
        return parsed, 0.03, "claude-sonnet-5"

    return fake
```

(keep the old `_fake_structured(blocks)` name working by delegating, so untouched tests stay untouched). New tests:

```python
def test_extras_clamped_and_validated(monkeypatch):
    _pages, extras = _compose_full(
        monkeypatch,
        {
            "blocks": [],
            "meta_description": "Calm vinyasa yoga for busy professionals. " * 10,  # over 170 chars
            "navbar_cta": "Start Your Yoga Journey Today Right Now",  # over 30 chars
            "courses": [
                {"id": 1, "title": "Morning Flow Foundations", "description": "Gentle start."},
                {"id": 99, "title": "Hallucinated", "description": "x"},  # id not sent -> dropped
            ],
            "downloads": [{"id": 5, "title": "Breathing Guide"}],
        },
        courses=({"id": 1, "title": "Yoga Course 1", "description": "old"},),
        downloads=({"id": 5, "title": "Guide 1", "description": ""},),
    )
    assert len(extras["meta_description"]) <= 170
    assert len(extras["navbar_cta"]) <= 30
    assert set(extras["courses"]) == {1}
    assert extras["courses"][1]["title"] == "Morning Flow Foundations"
    assert set(extras["downloads"]) == {5}


def test_extras_empty_when_model_returns_none(monkeypatch):
    _pages, extras = _compose_full(monkeypatch, {"blocks": []})
    assert extras == {"meta_description": "", "navbar_cta": "", "courses": {}, "downloads": {}}
```

- [ ] **Step 2: Run to verify failures**

Run: `docker compose exec django pytest apps/core/tests/test_ai_compose.py -v`
Expected: new tests FAIL (tuple return / extras don't exist); old tests FAIL on unpacking until Step 3.

- [ ] **Step 3: Implement in `ai_compose.py`**

3a. Schema + caps:

```python
ITEM_TITLE_CAP = 120
ITEM_DESC_CAP = 500
META_DESCRIPTION_CAP = 170
NAVBAR_CTA_CAP = 30
MAX_ITEM_UPDATES = 12


class _ItemCopy(BaseModel):
    id: int
    title: str = ""
    description: str = ""


class _ComposeResult(BaseModel):
    blocks: list[_BlockCopy] = Field(default_factory=list)
    meta_description: str | None = None
    navbar_cta: str | None = None
    courses: list[_ItemCopy] = Field(default_factory=list)
    downloads: list[_ItemCopy] = Field(default_factory=list)
```

3b. Extend `SYSTEM_PROMPT` (append before the closing quote):

```
Also return:
- meta_description: one sentence (max 170 chars) describing this coach's site
  for search engines, in the brief's language.
- navbar_cta: a 1-3 word call-to-action button label (max 30 chars).
- courses / downloads: the draft items listed in <draft_content>, retitled in
  the coach's voice (title max 120 chars; course description 1-2 honest
  sentences, max 500 chars; downloads have titles only). Only return items
  you improve; never invent new ids.
```

3c. Brief gains a `<draft_content>` section — add to `_brief`'s signature `courses=(), downloads=()` and before the final `return`:

```python
    if courses or downloads:
        lines.append("")
        lines.append("<draft_content>")
        for c in courses:
            lines.append(f'course id={c["id"]} title="{c["title"]}" description="{(c["description"] or "")[:160]}"')
        for d in downloads:
            lines.append(f'download id={d["id"]} title="{d["title"]}"')
        lines.append("</draft_content>")
```

3d. `compose_pages` — add `courses=(), downloads=()` params, pass through to `_brief`, and build extras after `_apply`:

```python
    sent_course_ids = {c["id"] for c in courses}
    sent_download_ids = {d["id"] for d in downloads}
    extras = {
        "meta_description": _clamp_to(parsed.meta_description or "", META_DESCRIPTION_CAP),
        "navbar_cta": _clamp_to(parsed.navbar_cta or "", NAVBAR_CTA_CAP),
        "courses": {
            item.id: {"title": _clamp_to(item.title, ITEM_TITLE_CAP), "description": _clamp_to(item.description, ITEM_DESC_CAP)}
            for item in parsed.courses[:MAX_ITEM_UPDATES]
            if item.id in sent_course_ids and item.title.strip()
        },
        "downloads": {
            item.id: {"title": _clamp_to(item.title, ITEM_TITLE_CAP), "description": ""}
            for item in parsed.downloads[:MAX_ITEM_UPDATES]
            if item.id in sent_download_ids and item.title.strip()
        },
    }
    result = _apply(pages, parsed.blocks)
    _record_success(tenant_schema)
    return result, extras
```

with the tiny helper (`_clamp` is keyed to `FIELD_CAPS`; extras use raw caps):

```python
def _clamp_to(value: str, cap: int) -> str:
    return str(value)[:cap].strip()
```

3e. In `tasks.py`:

- `_compose_pages_with_ai`: before spawning the thread, gather draft content **in the caller's thread** (we're inside `tenant_context`; the worker thread's fresh connection lands on public schema):

```python
    from apps.courses.models import Course
    from apps.downloads.models import DownloadFile

    course_items = tuple(
        {"id": c.pk, "title": c.title, "description": (c.description or "")[:300]}
        for c in Course.objects.filter(is_published=False).order_by("id")[:8]
    )
    download_items = tuple(
        {"id": d.pk, "title": d.title, "description": ""} for d in DownloadFile.objects.order_by("id")[:8]
    )
```

pass `courses=course_items, downloads=download_items` into `ai_compose.compose_pages`, and return `(pages, extras, status)` — on skip/failure `extras = None`.

- `_apply_wizard_answers`: unpack the new triple; after a successful compose, apply extras (still inside `tenant_context`, before `_pick_photos_with_ai` so photo picks see the renamed course titles):

```python
        overrides["pages"], extras, ai_status = _compose_pages_with_ai(...)
        if extras:
            _apply_compose_extras(config, overrides, extras)
```

with:

```python
def _apply_compose_extras(config, overrides, extras):
    """Write the compose call's non-page outputs. Runs inside tenant_context."""
    from apps.courses.models import Course
    from apps.downloads.models import DownloadFile
    from apps.tenant_config.seeding import refresh_seeded_fingerprints

    if extras.get("meta_description"):
        config.meta_description = extras["meta_description"]
    if extras.get("navbar_cta"):
        overrides["navbar_config"]["cta"]["text"] = extras["navbar_cta"]

    touched = []
    for pk, copy in (extras.get("courses") or {}).items():
        course = Course.objects.filter(pk=pk, is_published=False).first()
        if course is None:
            continue
        course.title = copy["title"] or course.title
        if copy["description"]:
            course.description = copy["description"]
        course.save(update_fields=["title", "description"])
        touched.append(course)
    for pk, copy in (extras.get("downloads") or {}).items():
        download = DownloadFile.objects.filter(pk=pk).first()
        if download is None:
            continue
        download.title = copy["title"] or download.title
        download.save(update_fields=["title"])
        touched.append(download)
    refresh_seeded_fingerprints(touched)
```

- [ ] **Step 4: Run the compose + provision surface**

Run: `docker compose exec django pytest apps/core/tests/test_ai_compose.py apps/core/tests/test_wizard_compose.py apps/core/tests/test_wizard_provision.py apps/core/tests/test_wizard_followups.py -v`
Expected: all pass (fix any remaining tuple-unpack call sites the run reveals — `grep -rn "compose_pages(" backend/` to be sure).

- [ ] **Step 5: Lint and commit**

```bash
make lint
git add backend/apps/core/onboarding/ai_compose.py backend/apps/core/tasks.py \
  backend/apps/core/tests/test_ai_compose.py backend/apps/core/tests/test_wizard_provision.py
git commit -m "feat(onboarding): compose pass also writes meta description, navbar CTA, draft renames"
```

---

### Task 8: starter blog post

**Files:**
- Create: `backend/apps/core/onboarding/starter_post.py`
- Modify: `backend/apps/core/tasks.py` (call after `_apply_wizard_answers` in `provision_tenant`)
- Test: `backend/apps/core/tests/test_starter_post.py`

**Interfaces:**
- Consumes: `blog_ai.generate_post(brief_text, topic, instructions, photos) -> DraftResult` (`.fields`, `.cost_usd`; raises `BlogAiError` with `.cost_usd`); `blog_curated.curated_candidates(topic, limit)`; `blog_curated.resolve_curated_photo_ids(fields)`; `BlogPost` + `unique_slug`; `register_seeded`; `_run_ai_step` (Task 4); `CoachBrief` (Task 1).
- Produces: `generate_starter_draft(brief, tenant_schema) -> dict` (thread-safe LLM step; raises on failure), `create_starter_post(fields, niche) -> BlogPost | None` (tenant-context write; None if a post already exists), and `wizard_state["ai_blog_status"]`.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/core/tests/test_starter_post.py
"""Starter blog post: LLM step mocked; draft creation + idempotency."""

from types import SimpleNamespace

import pytest

from apps.core.onboarding import starter_post
from apps.core.onboarding.ai_curate import CoachBrief

pytestmark = pytest.mark.django_db


FIELDS = {
    "title": "Welcome to Glow Studio",
    "body_html": "<p>Hi, I'm your coach.</p>",
    "excerpt": "A first hello.",
    "meta_description": "Welcome post.",
    "tags": ["welcome"],
    "ai_model": "claude-haiku-4-5",
    "cover_photo_id": "",
    "image_placements": [],
}


def test_generate_starter_draft_records_spend(monkeypatch):
    from apps.blog import ai as blog_ai
    from apps.core.onboarding import ai_compose

    spends = []
    monkeypatch.setattr(ai_compose, "record_spend", lambda schema, usd: spends.append((schema, usd)))
    monkeypatch.setattr(starter_post.blog_curated, "curated_candidates", lambda topic, limit=8: [])
    monkeypatch.setattr(
        blog_ai, "generate_post", lambda brief, topic, instructions="", photos=(): SimpleNamespace(fields=dict(FIELDS), cost_usd=0.02)
    )
    fields = starter_post.generate_starter_draft(CoachBrief(niche="yoga", brand_name="Glow Studio"), "glow")
    assert fields["title"] == "Welcome to Glow Studio"
    assert spends == [("glow", 0.02)]


def test_create_starter_post_is_draft_and_seeded(tenant_with_schema):  # see note below
    from django_tenants.utils import tenant_context

    with tenant_context(tenant_with_schema):
        from apps.blog.models import BlogPost
        from apps.tenant_config.models import SeededObject

        post = starter_post.create_starter_post(dict(FIELDS), niche="yoga")
        assert post.status == "draft"
        assert post.source == "ai"
        assert post.slug  # derived server-side
        assert SeededObject.objects.filter(object_id=str(post.pk)).exists()
        # Second call: a post exists -> no duplicate.
        assert starter_post.create_starter_post(dict(FIELDS), niche="yoga") is None
        assert BlogPost.objects.count() == 1
```

Note: `tenant_with_schema` — the core tests that need a real tenant schema build one via the pattern in `test_wizard_provision.py` (`_make_tenant` + `provision_tenant.apply`). If no reusable fixture exists, create the fixture in this file using that pattern (provision once, module-scoped, niche `None` to skip seeding for speed).

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/core/tests/test_starter_post.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

```python
# backend/apps/core/onboarding/starter_post.py
"""One draft welcome blog post at provisioning time.

Reuses the blog writer's own machinery (generate_post + curated candidates +
resolve/materialize) so the post is indistinguishable from a coach-initiated
AI draft — but the spend lands on the ONBOARDING budget, not the coach's blog
quota. Draft-only, registered as seeded, erasable.
Spec: docs/superpowers/specs/2026-07-19-ai-touch-onboarding-design.md
"""

from __future__ import annotations

from apps.blog import curated as blog_curated
from apps.core.onboarding.ai_curate import CoachBrief

MAX_CANDIDATE_PHOTOS = 8


def _blog_brief(brief: CoachBrief) -> str:
    return "\n".join(
        [
            "<brand_brief>",
            f"Brand: {brief.brand_name or 'a coaching brand'}",
            f"About: {brief.niche} — {brief.description[:200] or '-'}",
            "Audience: this coach's students and prospective students.",
            "</brand_brief>",
        ]
    )


def generate_starter_draft(brief: CoachBrief, tenant_schema: str) -> dict:
    """LLM step — safe for provision_tenant's worker thread (public-schema
    reads only). Returns BlogPost-ready fields with curated:<pk> photo ids
    still unresolved. Raises on any provider failure; spend is recorded
    either way against the onboarding budget."""
    from apps.blog import ai as blog_ai
    from apps.core.onboarding import ai_compose

    language = "Turkish" if brief.locale == "tr" else "English"
    topic = f"Welcome to {brief.brand_name or 'my studio'}: what I offer and how to start"
    instructions = (
        f"Write in {language}. This is the coach's very first post, introducing themselves and their "
        f"{brief.niche} practice to brand-new students. In the coach's own words: {brief.description[:300]}"
    )
    photos = blog_curated.curated_candidates(f"{brief.niche} {brief.description}", limit=MAX_CANDIDATE_PHOTOS)
    try:
        result = blog_ai.generate_post(_blog_brief(brief), topic, instructions, photos=photos)
    except blog_ai.BlogAiError as exc:
        ai_compose.record_spend(tenant_schema, float(getattr(exc, "cost_usd", 0) or 0))
        raise
    ai_compose.record_spend(tenant_schema, float(result.cost_usd or 0))
    return result.fields


def create_starter_post(fields: dict, niche: str):
    """Persist the draft. Must run inside the tenant context. Returns the
    BlogPost, or None when the tenant already has any post (retry safety)."""
    from apps.blog.models import BlogPost, unique_slug
    from apps.tenant_config.seeding import register_seeded

    if BlogPost.objects.exists():
        return None
    blog_curated.resolve_curated_photo_ids(fields)
    cover_id = fields.get("cover_photo_id") or ""
    post = BlogPost.objects.create(
        slug=unique_slug(fields["title"]),
        status="draft",
        source="ai",
        cover_photo_id=cover_id or None,
        title=fields["title"],
        body_html=fields["body_html"],
        excerpt=fields["excerpt"],
        meta_description=fields["meta_description"],
        tags=fields["tags"],
        ai_model=fields["ai_model"],
        image_placements=fields["image_placements"],
    )
    register_seeded([post], niche=niche)
    return post
```

In `tasks.py`, add below `_pick_photos_with_ai`:

```python
AI_STARTER_POST_TIMEOUT_SECONDS = 90


def _seed_starter_post(tenant, preferred_locale):
    """One draft welcome blog post. Fail-silent; status in wizard_state."""
    from apps.core.onboarding import ai_compose, ai_curate, starter_post

    state = dict(tenant.wizard_state or {})
    if state.get("ai_blog_status"):
        return
    if not ai_compose.compose_available():
        status = "skipped"
    else:
        brief = ai_curate.CoachBrief.from_tenant(tenant, locale=preferred_locale)
        fields, status = _run_ai_step(
            "starter post",
            tenant,
            lambda: starter_post.generate_starter_draft(brief, tenant.schema_name),
            AI_STARTER_POST_TIMEOUT_SECONDS,
        )
        if status == "ok":
            try:
                with tenant_context(tenant):
                    starter_post.create_starter_post(fields, tenant.template_niche or "general")
            except Exception:
                logger.exception("starter post create failed for %s", tenant.slug)
                status = "failed"
    state["ai_blog_status"] = status
    tenant.wizard_state = state
    tenant.save(update_fields=["wizard_state"])
```

and in `provision_tenant`, right after the `_apply_wizard_answers(...)` call:

```python
        if wizard_answers:
            _apply_wizard_answers(tenant, wizard_answers, preferred_locale)
            _seed_starter_post(tenant, preferred_locale)
```

- [ ] **Step 4: Run the tests**

Run: `docker compose exec django pytest apps/core/tests/test_starter_post.py apps/core/tests/test_wizard_provision.py -v`
Expected: all pass.

- [ ] **Step 5: Lint and commit**

```bash
make lint
git add backend/apps/core/onboarding/starter_post.py backend/apps/core/tasks.py backend/apps/core/tests/test_starter_post.py
git commit -m "feat(onboarding): seed one AI-written draft welcome blog post at provisioning"
```

---

### Task 9: full verification

**Files:** none new.

- [ ] **Step 1: Full backend suite**

Run: `make test`
Expected: 0 failures. Pay attention to: every `compose_pages` call site handles the tuple return; `test_prod_settings_ai_guard` still passes (we added no settings).

- [ ] **Step 2: Frontend tests + typecheck + lint**

Run: `make test-frontend && make typecheck && make lint`
Expected: all clean, zero warnings.

- [ ] **Step 3: Live verification against the dev stack**

1. `make dev` (ensure `.env` has `AI_PROVIDER=cli` and `ONBOARDING_AI_ENABLED=true`; probe the CLI first per the project's CLI-session-limits memory: `docker compose exec django claude -p "ping" --model haiku`).
2. Ensure catalogs are seeded: `docker compose exec django python manage.py seed_curated_logos && docker compose exec django python manage.py seed_curated_photos`.
3. Walk the signup wizard on `http://localhost` with a real niche + a distinctive description (e.g. "prenatal yoga for first-time moms"). At the logo step, confirm the curated grid order changes once `curated_logo_rank` lands (compare against a second signup with AI off).
4. After provisioning, open the new tenant: hero background + about image + course thumbnails should be curated photos matching the description (check `Photo.s3_key` starts with `platform/curated-photos/`); courses/downloads renamed in the coach's voice; `meta_description` set; one draft blog post in the blog admin with a "Demo" seeded badge.
5. Kill switch: re-run a signup with `ONBOARDING_AI_ENABLED=false` — tenant must provision exactly as today (demo-seed imagery, generic names, no blog post, no `curated_logo_rank`), with statuses `skipped`.
6. `make e2e-changed` — the wizard/onboarding specs must pass (CI runs AI-off fallback path).

- [ ] **Step 4: Commit any verification fixes**

```bash
make lint
git add -A && git commit -m "test(onboarding): AI-touch verification fixes"
```

---

## Self-review notes (already applied)

- **Spec coverage:** §1 foundation → Task 1; §2 photos → Tasks 3–4; §3 logo rank → Tasks 5–6; §4 copy pass → Task 7; §5 blog post → Task 8; error-handling table → fail-silent statuses in Tasks 4/5/7/8; testing section → per-task tests + Task 9. Spec deviation (recorded): the starter post reuses the blog writer's curated-candidate flow (cover + inline placements from hero/stock/spot kinds) instead of the spec's "one spot illustration + one divider" — same intent (an illustrated draft), one less bespoke path. Fingerprint refresh (Task 2) is an addition the spec missed; without it AI edits break the seeded-object erase flow.
- **Type consistency:** `CoachBrief.from_tenant(tenant, locale=)` used in Tasks 5/4/8; `_run_ai_step` returns `(result, status)` everywhere; `compose_pages` tuple return updated at every call site named in Task 7 Step 4.
- **Known judgment calls for the implementer:** exact fixture names in `tenant_config` tests (Task 2) and the tenant-schema fixture (Task 8) must mirror the neighboring test files; `core_ai.AiError` constructor signature to be checked in Task 3.
