# Wizard Improvement Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the eight wizard improvements in `docs/superpowers/specs/2026-07-15-wizard-improvement-round-design.md` — wider layout, AI follow-up questions, honest goal wiring + setup items, per-theme/per-hero screenshots, all 5 navbar presets, a 3rd layout per page, and curated-logo verification.

**Architecture:** Backend catalog/compose/endpoint changes stay inside `apps/core/onboarding/` following the existing wizard patterns (wizard-token auth in body, `ipblock` + `ClientIpAnonThrottle` guards, `OnboardingAiUsage` budget). Screenshot capture extends the existing `tools/wizard-mockups/` scratch-tenant pipeline. The frontend wizard renders everything from the served catalog, so most new options appear without frontend logic changes; the new follow-ups step and the screenshot thumbnails are the only new UI mechanics.

**Tech Stack:** Django 5.1 + DRF + pydantic (`core_ai.structured`), Next.js 14 + framer-motion (`frontend-main`), Playwright capture tool (Node), next-intl EN/TR message catalogs.

## Global Constraints

- All commands from repo root `~/ws/projects-active/home-server/contentor`; backend tests run **inside** the container: `docker compose exec django pytest <path> -v`.
- `make lint` must pass with zero errors/warnings on files this plan touches. Run `make lint` (formatter included), not just `ruff check` — check-only lint has drifted from the formatter before.
- `frontend-main` and `frontend-customer` have NO unit-test runner (verified precedent: 2026-07-14 plan). Frontend verification = `docker compose exec nextjs-main npm run build` / `docker compose exec nextjs-customer npm run build` + browser checks. Do not add a test framework.
- Every `frontend-main/messages/en/wizard.json` change MUST have a matching `frontend-main/messages/tr/wizard.json` change (same keys), and likewise for `frontend-customer/messages/{en,tr}/admin.json` — verify with `node scripts/check-i18n-parity.mjs` after each JSON edit.
- E2e selector trap: `getByRole("button", { name })` is a SUBSTRING match. No new user-visible label on a wizard screen may contain (or be contained in) an existing label on the same screen. The labels in this plan were chosen against `e2e/specs/01-signup-onboarding.spec.ts` — do not rename them without re-checking.
- Public wizard endpoints MUST keep `@authentication_classes([])` (project rule — `AllowAny` alone is not enough).
- Commit after each task (this SDD flow is the explicitly-approved exception to the repo's "never commit unless asked" rule). Commit messages end with the `Co-Authored-By: Claude <model> <noreply@anthropic.com>` trailer of the executing agent.
- celery-worker/celery-beat do NOT hot-reload Python — restart both before trusting any live async (provisioning) behavior.
- `docker compose exec nextjs-main npm run build` inside the dev container clobbers `.next`; afterwards run `rm -rf frontend-main/.next` is NOT needed on host — instead `docker compose restart nextjs-main` if the dev server 500s.

---

### Task 1: Catalog — new goals, all 5 navbar presets, `description_followups` validation

**Files:**
- Modify: `backend/apps/core/onboarding/wizard_catalog.py`
- Test: `backend/apps/core/tests/test_wizard_catalog.py` (append)
- Modify: `frontend-main/messages/en/wizard.json`, `frontend-main/messages/tr/wizard.json`

**Interfaces:**
- Consumes: nothing new.
- Produces: `wizard_catalog.GOALS` includes `"write_blog"`, `"send_announcements"`; `wizard_catalog.NAVBAR_LAYOUTS == ("classic", "centered", "split", "minimal", "pill")`; constants `FOLLOWUP_MAX_QUESTIONS = 2`, `FOLLOWUP_QUESTION_MAX_LEN = 200`, `FOLLOWUP_ANSWER_MAX_LEN = 500`; `validate_answers` accepts key `description_followups` shaped `{"for": str, "items": [{"q": str, "a": str}]}`. Tasks 3, 4, 7 rely on these names.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/core/tests/test_wizard_catalog.py`:

```python
def test_new_goals_present():
    assert "write_blog" in wc.GOALS
    assert "send_announcements" in wc.GOALS


def test_navbar_layouts_expose_all_presets():
    assert set(wc.NAVBAR_LAYOUTS) == _NAVBAR_LAYOUTS


def test_description_followups_valid():
    answer = {"for": "Calm vinyasa for busy parents", "items": [{"q": "Who is it for?", "a": "Beginners"}]}
    assert wc.validate_answers({"description_followups": answer}) == []


def test_description_followups_empty_items_valid():
    assert wc.validate_answers({"description_followups": {"for": "x", "items": []}}) == []


def test_description_followups_invalid_shapes():
    assert wc.validate_answers({"description_followups": "nope"})
    assert wc.validate_answers({"description_followups": {"items": []}})  # missing "for"
    assert wc.validate_answers({"description_followups": {"for": "x"}})  # missing items
    assert wc.validate_answers({"description_followups": {"for": "x", "items": [{"q": "a"}]}})  # missing "a"
    assert wc.validate_answers({"description_followups": {"for": "x", "items": [{}, {}, {}]}})  # > 2 items
    assert wc.validate_answers({"description_followups": {"for": "x", "items": [{"q": "q" * 201, "a": ""}]}})
    assert wc.validate_answers({"description_followups": {"for": "x", "items": [{"q": "q", "a": "a" * 501}]}})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_catalog.py -v`
Expected: the 5 new tests FAIL (`write_blog` not in GOALS / `description_followups` reported as unknown key); pre-existing tests still pass.

- [ ] **Step 3: Implement the catalog changes**

In `backend/apps/core/onboarding/wizard_catalog.py`:

Replace the `GOALS` tuple:

```python
GOALS = (
    "sell_courses",
    "run_live_classes",
    "in_person_events",
    "sell_downloads",
    "email_marketing",
    "build_community",
    "write_blog",
    "send_announcements",
)
```

Replace the `NAVBAR_LAYOUTS` line:

```python
NAVBAR_LAYOUTS = ("classic", "centered", "split", "minimal", "pill")  # all 5 public-header presets
```

Directly after the `DESCRIPTION_MAX_LEN = 500` line add:

```python
# "Describe what you do" AI follow-up Q&A (wizard_followups.py generates the
# questions; answers feed ai_compose's brief at provisioning).
FOLLOWUP_MAX_QUESTIONS = 2
FOLLOWUP_QUESTION_MAX_LEN = 200
FOLLOWUP_ANSWER_MAX_LEN = 500
```

In `validate_answers`, add a new `elif` branch directly after the `description` branch (before `elif key == "goals":`):

```python
        elif key == "description_followups":
            items = value.get("items") if isinstance(value, dict) else None
            if (
                not isinstance(value, dict)
                or not isinstance(value.get("for"), str)
                or len(value["for"]) > DESCRIPTION_MAX_LEN
                or not isinstance(items, list)
                or len(items) > FOLLOWUP_MAX_QUESTIONS
            ):
                errors.append("description_followups must be {for, items} with at most 2 items")
                continue
            for item in items:
                if (
                    not isinstance(item, dict)
                    or not isinstance(item.get("q"), str)
                    or not isinstance(item.get("a"), str)
                    or len(item["q"]) > FOLLOWUP_QUESTION_MAX_LEN
                    or len(item["a"]) > FOLLOWUP_ANSWER_MAX_LEN
                ):
                    errors.append("description_followups items must be {q, a} strings within length caps")
                    break
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_catalog.py -v`
Expected: ALL PASS (including pre-existing `test_navbar_and_hero_enums_are_valid_subsets` — the new set is still a subset).

- [ ] **Step 5: Add the i18n labels (EN + TR)**

In `frontend-main/messages/en/wizard.json`, inside `wizard.goals.items` add after `"build_community"`:

```json
"write_blog": "Share articles & tips",
"send_announcements": "Send announcements & updates"
```

Inside `wizard.navbarLayouts` add after `"minimal"`:

```json
"split": "Split",
"pill": "Floating pill"
```

In `frontend-main/messages/tr/wizard.json`, same positions:

```json
"write_blog": "Makale ve ipuçları paylaş",
"send_announcements": "Duyuru ve güncelleme gönder"
```

```json
"split": "Bölünmüş",
"pill": "Yüzen kapsül"
```

Run: `node scripts/check-i18n-parity.mjs`
Expected: pass (zero missing keys).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/core/onboarding/wizard_catalog.py backend/apps/core/tests/test_wizard_catalog.py frontend-main/messages/en/wizard.json frontend-main/messages/tr/wizard.json
git commit -m "feat(wizard): new goals, all navbar presets, description_followups validation"
```

---

### Task 2: Compose — one new layout per page (2 → 3 options × 6 pages)

**Files:**
- Modify: `backend/apps/core/onboarding/wizard_catalog.py` (PAGE_LAYOUTS)
- Modify: `backend/apps/core/onboarding/compose.py`
- Test: `backend/apps/core/tests/test_wizard_compose.py` (append)
- Modify: `frontend-main/messages/en/wizard.json`, `frontend-main/messages/tr/wizard.json`

**Interfaces:**
- Consumes: existing block builders in `compose.py` (`_hero`, `_about_image_text`, `_course_grid`, `_testimonials`, `_faq`, `_cta`, `_intro`, `_goal_blocks`).
- Produces: 6 new layout ids — `home-complete`, `about-warm`, `courses-social`, `pricing-trust`, `faq-support`, `contact-reassure` — valid in `PAGE_LAYOUTS`, composable by `build_config_overrides`, each with an EN/TR `layouts.<id>` label. Task 9's capture list uses these exact ids. New helper `_contact(copy, block_id="blk_contact") -> dict`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/core/tests/test_wizard_compose.py`:

```python
def _types(pages, page):
    return [b["type"] for b in pages[page]["blocks"]]


def test_home_complete_layout_blocks():
    pages = _build({"page_layouts": {"home": "home-complete"}})["pages"]
    assert _types(pages, "home") == ["hero", "imageText", "courseGrid", "testimonials", "faq", "cta"]


def test_home_complete_goal_blocks_splice_after_course_grid():
    pages = _build({"page_layouts": {"home": "home-complete"}, "goals": ["sell_downloads"]})["pages"]
    assert _types(pages, "home") == ["hero", "imageText", "courseGrid", "storeProducts", "testimonials", "faq", "cta"]


def test_about_warm_layout_blocks():
    pages = _build({"page_layouts": {"about": "about-warm"}})["pages"]
    assert _types(pages, "about") == ["imageText", "faq", "cta"]


def test_courses_social_layout_blocks():
    pages = _build({"page_layouts": {"courses": "courses-social"}})["pages"]
    assert _types(pages, "courses") == ["courseGrid", "testimonials", "cta"]


def test_pricing_trust_layout_blocks():
    pages = _build({"page_layouts": {"pricing": "pricing-trust"}})["pages"]
    assert _types(pages, "pricing") == ["pricingPlans", "testimonials", "cta"]


def test_faq_support_layout_blocks():
    pages = _build({"page_layouts": {"faq": "faq-support"}})["pages"]
    assert _types(pages, "faq") == ["faq", "contact"]


def test_contact_reassure_layout_blocks_have_unique_ids():
    pages = _build({"page_layouts": {"contact": "contact-reassure"}})["pages"]
    assert _types(pages, "contact") == ["contact", "faq"]
    ids = [b["id"] for b in pages["contact"]["blocks"]]
    assert len(ids) == len(set(ids))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_compose.py -v`
Expected: the 7 new tests FAIL (unknown layout ids fall back to the first option, so block lists don't match).

- [ ] **Step 3: Add the catalog entries**

In `backend/apps/core/onboarding/wizard_catalog.py`, replace the whole `PAGE_LAYOUTS` dict with:

```python
PAGE_LAYOUTS = {
    "home": (
        {"id": "home-spotlight", "blocks": ("hero", "courseGrid", "testimonials", "cta")},
        {"id": "home-story", "blocks": ("hero", "imageText", "courseGrid", "faq", "cta")},
        {"id": "home-complete", "blocks": ("hero", "imageText", "courseGrid", "testimonials", "faq", "cta")},
    ),
    "about": (
        {"id": "about-story", "blocks": ("richText", "imageText")},
        {"id": "about-portrait", "blocks": ("imageText", "testimonials", "cta")},
        {"id": "about-warm", "blocks": ("imageText", "faq", "cta")},
    ),
    "courses": (
        {"id": "courses-grid", "blocks": ("courseGrid",)},
        {"id": "courses-guided", "blocks": ("richText", "courseGrid", "cta")},
        {"id": "courses-social", "blocks": ("courseGrid", "testimonials", "cta")},
    ),
    "pricing": (
        {"id": "pricing-simple", "blocks": ("pricingPlans",)},
        {"id": "pricing-reassure", "blocks": ("pricingPlans", "faq", "cta")},
        {"id": "pricing-trust", "blocks": ("pricingPlans", "testimonials", "cta")},
    ),
    "faq": (
        {"id": "faq-list", "blocks": ("faq",)},
        {"id": "faq-welcoming", "blocks": ("richText", "faq", "cta")},
        {"id": "faq-support", "blocks": ("faq", "contact")},
    ),
    "contact": (
        {"id": "contact-form", "blocks": ("contact",)},
        {"id": "contact-warm", "blocks": ("richText", "contact")},
        {"id": "contact-reassure", "blocks": ("contact", "faq")},
    ),
}
```

- [ ] **Step 4: Implement the compose branches**

In `backend/apps/core/onboarding/compose.py`:

Add a `_contact` builder after `_intro` (extracting the dict currently inlined in `_build_pages`):

```python
def _contact(copy, block_id="blk_contact") -> dict:
    return {
        "id": block_id,
        "type": "contact",
        "enabled": True,
        "heading": copy["contact_heading"],
        "intro": copy["contact_intro"],
        "submitLabel": copy["contact_submit"],
        "successMessage": copy["contact_success"],
    }
```

Replace the body of `_build_pages` from `home = [_hero(...)]` down to (and including) the `contact = ...` assignments with:

```python
    home = [_hero(answers, brand_name, sections)]
    home_layout = layout("home")
    if home_layout == "home-story":
        home += [
            _about_image_text(sections, copy),
            _course_grid(copy, "featured_courses"),
            *_goal_blocks(goals, copy),
            _faq(sections, copy),
            _cta(sections, copy),
        ]
    elif home_layout == "home-complete":
        home += [
            _about_image_text(sections, copy),
            _course_grid(copy, "featured_courses"),
            *_goal_blocks(goals, copy),
            _testimonials(sections, copy),
            _faq(sections, copy),
            _cta(sections, copy),
        ]
    else:  # home-spotlight
        home += [
            _course_grid(copy, "featured_courses"),
            *_goal_blocks(goals, copy),
            _testimonials(sections, copy),
            _cta(sections, copy),
        ]

    about_layout = layout("about")
    if about_layout == "about-portrait":
        about = [
            _about_image_text(sections, copy, "blk_about_bio"),
            _testimonials(sections, copy),
            _cta(sections, copy),
        ]
    elif about_layout == "about-warm":
        about = [
            _about_image_text(sections, copy, "blk_about_bio"),
            _faq(sections, copy, "blk_about_faq"),
            _cta(sections, copy),
        ]
    else:  # about-story
        about = [_intro(copy, "blk_about_intro"), _about_image_text(sections, copy, "blk_about_bio")]

    courses = [_course_grid(copy, "all_courses", "blk_courses_grid")]
    courses_layout = layout("courses")
    if courses_layout == "courses-guided":
        courses = [_intro(copy), *courses, _cta(sections, copy)]
    elif courses_layout == "courses-social":
        courses = [*courses, _testimonials(sections, copy), _cta(sections, copy)]

    pricing = [
        {
            "id": "blk_pricing_plans",
            "type": "pricingPlans",
            "enabled": True,
            "heading": copy["plans_heading"],
            "subheading": copy["plans_subheading"],
        }
    ]
    pricing_layout = layout("pricing")
    if pricing_layout == "pricing-reassure":
        pricing += [_faq(sections, copy, "blk_pricing_faq"), _cta(sections, copy, "blk_pricing_cta")]
    elif pricing_layout == "pricing-trust":
        pricing += [_testimonials(sections, copy), _cta(sections, copy, "blk_pricing_cta")]

    faq_page = [_faq(sections, copy)]
    faq_layout = layout("faq")
    if faq_layout == "faq-welcoming":
        faq_page = [_intro(copy), *faq_page, _cta(sections, copy)]
    elif faq_layout == "faq-support":
        faq_page = [*faq_page, _contact(copy, "blk_faq_contact")]

    contact = [_contact(copy)]
    contact_layout = layout("contact")
    if contact_layout == "contact-warm":
        contact = [_intro(copy), _contact(copy)]
    elif contact_layout == "contact-reassure":
        contact = [_contact(copy), _faq(sections, copy, "blk_contact_faq")]
```

(The old inline `contact_block = {...}` dict is deleted — `_contact` replaces it.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_compose.py apps/core/tests/test_wizard_catalog.py -v`
Expected: ALL PASS (catalog test `test_page_layouts_cover_all_pages_with_known_blocks` validates the new blocks; compose tests validate the sequences; `test_pages_pass_server_validation` proves the serializer accepts the new pages).

- [ ] **Step 6: Add the layout labels (EN + TR)**

In `frontend-main/messages/en/wizard.json`, inside `wizard.layouts` add:

```json
"home-complete": "Full tour",
"about-warm": "Warm & helpful",
"courses-social": "Social proof",
"pricing-trust": "Trust builder",
"faq-support": "Support hub",
"contact-reassure": "With answers"
```

In `frontend-main/messages/tr/wizard.json`, inside `wizard.layouts` add:

```json
"home-complete": "Tam tur",
"about-warm": "Samimi",
"courses-social": "Sosyal kanıt",
"pricing-trust": "Güven odaklı",
"faq-support": "Destek köşesi",
"contact-reassure": "Cevaplı"
```

Run: `node scripts/check-i18n-parity.mjs` — expected: pass.

(Label-collision check, done at plan time: on each page's screen the new label neither contains nor is contained in the existing two — e.g. "Full tour" vs "Spotlight"/"Storyteller".)

- [ ] **Step 7: Commit**

```bash
git add backend/apps/core/onboarding/wizard_catalog.py backend/apps/core/onboarding/compose.py backend/apps/core/tests/test_wizard_compose.py frontend-main/messages/en/wizard.json frontend-main/messages/tr/wizard.json
git commit -m "feat(wizard): third layout option per page via existing block builders"
```

---

### Task 3: `describe-followups` endpoint

**Files:**
- Create: `backend/apps/core/onboarding/wizard_followups.py`
- Modify: `backend/apps/core/throttling.py`
- Modify: `backend/config/settings/base.py` (throttle rate)
- Modify: `backend/apps/core/onboarding/urls.py`
- Test: `backend/apps/core/tests/test_wizard_followups.py`

**Interfaces:**
- Consumes: `wizard._resolve_tenant_from_wizard_token(request)`, `ai_compose.compose_available()`, `ai_compose.record_spend(tenant_schema, usd)`, `core_ai.structured(...)`, Task 1's `FOLLOWUP_*` constants.
- Produces: `POST /api/v1/onboarding/wizard/describe-followups/` — body `{token, description}` → `{"questions": [str]}` (0–2 items, ≤200 chars each; ALWAYS 200 with `[]` on AI-off/failure/empty description). Task 7's frontend calls this. Module-level `generate_questions(description, *, locale, tenant_schema) -> list[str]` for direct testing.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/core/tests/test_wizard_followups.py`:

```python
"""describe-followups: wizard-token AI endpoint that turns the coach's
description into <=2 follow-up questions; fail-soft [] on any AI problem."""

import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.tokens import create_wizard_token
from apps.core.models import Tenant

pytestmark = pytest.mark.django_db(transaction=True)

SHARED_DOMAIN = "shared-test.localhost"


def _client():
    return APIClient(HTTP_HOST=SHARED_DOMAIN)


def _token():
    return create_wizard_token("coach@x.com", "Coach", "Followups Studio")


@pytest.fixture()
def tenant(restore_public):
    connection.set_schema_to_public()
    t, _ = Tenant.objects.get_or_create(
        schema_name="followups_studio",
        defaults={
            "name": "Followups Studio",
            "slug": "followups-studio",
            "subdomain": "followups-studio",
            "owner_email": "coach@x.com",
        },
    )
    t.provisioning_status = "pending"
    t.save(update_fields=["provisioning_status"])
    yield t
    connection.set_schema_to_public()
    Tenant.objects.filter(schema_name="followups_studio").delete()


def _post(description):
    return _client().post(
        "/api/v1/onboarding/wizard/describe-followups/",
        {"token": _token(), "description": description},
        format="json",
    )


def test_missing_token_400(tenant):
    resp = _client().post("/api/v1/onboarding/wizard/describe-followups/", {"description": "x"}, format="json")
    assert resp.status_code == 400


def test_empty_description_returns_no_questions(tenant):
    resp = _post("   ")
    assert resp.status_code == 200
    assert resp.json() == {"questions": []}


def test_ai_unavailable_returns_no_questions(tenant, monkeypatch):
    from apps.core.onboarding import wizard_followups

    monkeypatch.setattr(wizard_followups.ai_compose, "compose_available", lambda: False)
    resp = _post("Calm vinyasa for busy parents.")
    assert resp.status_code == 200
    assert resp.json() == {"questions": []}


def test_questions_generated_capped_and_spend_recorded(tenant, monkeypatch):
    from apps.core.onboarding import wizard_followups

    monkeypatch.setattr(wizard_followups.ai_compose, "compose_available", lambda: True)
    spends = []
    monkeypatch.setattr(wizard_followups.ai_compose, "record_spend", lambda schema, usd: spends.append((schema, usd)))

    def fake_structured(**kwargs):
        return wizard_followups._Followups(questions=["Who are your students?", "  What makes you different?  ", "Three?"]), 0.01, "m"

    monkeypatch.setattr(wizard_followups.core_ai, "structured", fake_structured)
    resp = _post("Calm vinyasa for busy parents.")
    assert resp.status_code == 200
    assert resp.json()["questions"] == ["Who are your students?", "What makes you different?"]
    assert spends == [("followups_studio", 0.01)]


def test_provider_failure_returns_empty_and_records_spend(tenant, monkeypatch):
    from apps.core.onboarding import wizard_followups

    monkeypatch.setattr(wizard_followups.ai_compose, "compose_available", lambda: True)
    spends = []
    monkeypatch.setattr(wizard_followups.ai_compose, "record_spend", lambda schema, usd: spends.append(usd))

    def boom(**kwargs):
        raise wizard_followups.core_ai.AiError("provider down")

    monkeypatch.setattr(wizard_followups.core_ai, "structured", boom)
    resp = _post("Calm vinyasa.")
    assert resp.status_code == 200
    assert resp.json() == {"questions": []}
    assert spends == [0.0]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_followups.py -v`
Expected: FAIL — 404 on the URL (route not registered) / `ModuleNotFoundError: wizard_followups`.

- [ ] **Step 3: Add the throttle class and rate**

In `backend/apps/core/throttling.py`, after `class WizardLogoThrottle`:

```python
class WizardFollowupThrottle(ClientIpAnonThrottle):
    """Public (wizard-token) describe-followups AI endpoint."""

    scope = "wizard_followups"
```

In `backend/config/settings/base.py`, in `DEFAULT_THROTTLE_RATES` after the `"wizard_logo": "20/min",` line:

```python
        # Public (wizard-token) describe-followups AI endpoint — one AI call
        # per describe-step Continue, so tighter than wizard_logo.
        "wizard_followups": "10/min",
```

- [ ] **Step 4: Implement the endpoint module**

Create `backend/apps/core/onboarding/wizard_followups.py`:

```python
"""AI follow-up questions for the wizard's "describe what you do" step.

One small structured call turns the coach's free-text description into at
most two short follow-up questions; the answers come back through the
normal wizard-state PATCH (answers["description_followups"]) and feed
ai_compose's brief at provisioning. Fail-soft by design: any provider
failure, missing key, or blown budget returns {"questions": []} so the
wizard simply skips the step — never an error the UI must handle.
"""

import logging

from django.conf import settings
from pydantic import BaseModel, Field
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core import ai as core_ai
from apps.core import ipblock
from apps.core.throttling import WizardFollowupThrottle

from . import ai_compose, wizard_catalog
from .wizard import _resolve_tenant_from_wizard_token

logger = logging.getLogger(__name__)

MAX_OUTPUT_TOKENS = 300

SYSTEM_PROMPT = """You help a website copywriter interview a solo coach who
just described their business in a couple of sentences.

Return up to 2 short follow-up questions (in the language named in the
brief) whose answers would most improve the coach's website copy — for
example who their students are, what makes their approach different, or
what a new student should expect in the first session.

Hard rules:
- At most 2 questions, each a single sentence under 160 characters.
- Never ask for anything the description already answers.
- Never ask for prices, credentials, statistics, or private details.
- If the description is too thin to ask anything useful, return no
  questions rather than generic filler.
"""


class _Followups(BaseModel):
    questions: list[str] = Field(default_factory=list)


def generate_questions(description: str, *, locale: str, tenant_schema: str) -> list[str]:
    """0-2 follow-up questions, [] on any failure. Spend is recorded against
    the same OnboardingAiUsage monthly budget ai_compose draws from."""
    if not ai_compose.compose_available():
        return []
    language = "Turkish" if locale == "tr" else "English"
    user = f"Language: {language}\n<description>\n{description}\n</description>"
    try:
        parsed, cost, _model = core_ai.structured(
            system=SYSTEM_PROMPT,
            user=user,
            output_model=_Followups,
            model=settings.ONBOARDING_AI_MODEL,
            max_tokens=MAX_OUTPUT_TOKENS,
        )
    except core_ai.AiError as exc:
        ai_compose.record_spend(tenant_schema, float(getattr(exc, "cost_usd", 0) or 0))
        logger.warning("wizard followups AI failed for %s: %s", tenant_schema, exc)
        return []
    ai_compose.record_spend(tenant_schema, float(cost or 0))
    questions = [q.strip()[: wizard_catalog.FOLLOWUP_QUESTION_MAX_LEN] for q in parsed.questions if q and q.strip()]
    return questions[: wizard_catalog.FOLLOWUP_MAX_QUESTIONS]


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([WizardFollowupThrottle])
def wizard_describe_followups(request):
    if (denied := ipblock.blocked_response(request)) is not None:
        return denied
    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err is not None:
        return err
    description = str(request.data.get("description") or "")[: wizard_catalog.DESCRIPTION_MAX_LEN]
    if not description.strip():
        return Response({"questions": []})
    locale = "tr" if tenant.region == "tr" else "en"
    return Response({"questions": generate_questions(description, locale=locale, tenant_schema=tenant.schema_name)})
```

In `backend/apps/core/onboarding/urls.py`, add the import and route:

```python
from .wizard_followups import wizard_describe_followups
```

```python
    path("wizard/describe-followups/", wizard_describe_followups, name="wizard-describe-followups"),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_followups.py -v`
Expected: 5 PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/core/onboarding/wizard_followups.py backend/apps/core/onboarding/urls.py backend/apps/core/throttling.py backend/config/settings/base.py backend/apps/core/tests/test_wizard_followups.py
git commit -m "feat(wizard): describe-followups AI endpoint (fail-soft, budget-tracked)"
```

---

### Task 4: Follow-up answers feed the AI copy brief

**Files:**
- Modify: `backend/apps/core/onboarding/ai_compose.py`
- Modify: `backend/apps/core/tasks.py`
- Test: `backend/apps/core/tests/test_wizard_followups.py` (append)

**Interfaces:**
- Consumes: `answers["description_followups"]["items"]` (Task 1 shape).
- Produces: `ai_compose._brief(pages, *, brand_name, niche, description, followups, goals, locale)` and `ai_compose.compose_pages(pages, *, brand_name, niche, description, followups=(), goals, locale, tenant_schema)` — `followups` is an iterable of `{"q": str, "a": str}` dicts; only items with BOTH non-empty q and a appear in the brief.

- [ ] **Step 1: Write the failing test**

Append to `backend/apps/core/tests/test_wizard_followups.py`:

```python
def test_brief_includes_answered_followups_and_skips_unanswered():
    from apps.core.onboarding.ai_compose import _brief

    brief = _brief(
        {"home": {"blocks": []}},
        brand_name="Glow",
        niche="yoga",
        description="Calm vinyasa.",
        followups=[{"q": "Who are your students?", "a": "Busy parents"}, {"q": "Unanswered?", "a": "  "}],
        goals=["sell_courses"],
        locale="en",
    )
    assert 'Asked: "Who are your students?" — coach answered: "Busy parents"' in brief
    assert "Unanswered?" not in brief
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_followups.py::test_brief_includes_answered_followups_and_skips_unanswered -v`
Expected: FAIL — `TypeError: _brief() got an unexpected keyword argument 'followups'`.

- [ ] **Step 3: Implement**

In `backend/apps/core/onboarding/ai_compose.py`:

Change `_brief`'s signature to:

```python
def _brief(pages: dict, *, brand_name, niche, description, followups, goals, locale) -> str:
```

Immediately after the `lines = [...]` list literal closes (before the `for page_key, page in pages.items():` loop), insert this splice — it lands the Q&A lines inside `<coach_brief>`, just before it closes:

```python
    followup_lines = []
    for item in followups or []:
        q = str(item.get("q") or "").strip()
        a = str(item.get("a") or "").strip()
        if q and a:
            followup_lines.append(f'Asked: "{q}" — coach answered: "{a}"')
    if followup_lines:
        # Splice inside <coach_brief>, just before it closes.
        idx = lines.index("</coach_brief>")
        lines[idx:idx] = followup_lines
```

Change `compose_pages`'s signature and `_brief` call to:

```python
def compose_pages(pages: dict, *, brand_name, niche, description, followups=(), goals, locale, tenant_schema) -> dict:
```

```python
    user_prompt = _brief(
        pages, brand_name=brand_name, niche=niche, description=description, followups=followups, goals=goals, locale=locale
    )
```

In `backend/apps/core/tasks.py`, in the `run()` closure that calls `ai_compose.compose_pages`, add after the `description=...` line:

```python
                followups=list(((answers.get("description_followups") or {}).get("items")) or []),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_followups.py apps/core/tests/test_wizard_provision.py -v`
Expected: ALL PASS (`test_wizard_provision.py` exercises the provisioning path that now passes `followups` — if any of its mocks pin `compose_pages`'s exact signature, update the mock to accept `followups`).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/onboarding/ai_compose.py backend/apps/core/tasks.py backend/apps/core/tests/test_wizard_followups.py
git commit -m "feat(wizard): follow-up answers feed the AI copy brief"
```

---

### Task 5: Goal-driven setup-assistant items

**Files:**
- Modify: `backend/apps/tenant_config/setup_items.py`
- Test: `backend/apps/tenant_config/tests/test_setup_status.py` (append)
- Modify: `frontend-customer/src/components/setup/catalog.ts`
- Modify: `frontend-customer/messages/en/admin.json`, `frontend-customer/messages/tr/admin.json`

**Interfaces:**
- Consumes: `tenant.wizard_state["answers"]["goals"]` (list of goal keys), `apps.blog.models.BlogPost`, `apps.community.models.Post`.
- Produces: optional `extras` items `first_blog_post` (present when `write_blog` picked; auto-done when any `BlogPost` exists) and `first_community_post` (present when `build_community` picked; auto-done when any community `Post` exists). `send_announcements` needs NO new item — `first_announcement` is already in every tenant's checklist.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/tenant_config/tests/test_setup_status.py`:

```python
@pytest.fixture()
def wizard_goals_tenant(tenant_ctx):
    from django.db import connection

    from apps.core.models import Tenant

    tenant = Tenant.objects.get(schema_name=connection.schema_name)
    original = tenant.wizard_state
    tenant.wizard_state = {"answers": {"goals": ["write_blog", "build_community"]}}
    tenant.save(update_fields=["wizard_state"])
    yield tenant
    tenant.wizard_state = original
    tenant.save(update_fields=["wizard_state"])


def test_goal_driven_items_absent_without_wizard_goals(client, config):
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=False):
        body = client.get("/api/v1/admin/setup-status/").json()
    items = _items(body)
    assert "first_blog_post" not in items
    assert "first_community_post" not in items


def test_goal_driven_items_present_with_wizard_goals(client, config, wizard_goals_tenant):
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=False):
        body = client.get("/api/v1/admin/setup-status/").json()
    items = _items(body)
    assert items["first_blog_post"]["optional"] is True
    assert items["first_blog_post"]["done"] is False
    assert items["first_community_post"]["optional"] is True
    assert items["first_community_post"]["done"] is False


def test_first_blog_post_autocompletes(client, config, wizard_goals_tenant):
    from apps.blog.models import BlogPost

    BlogPost.objects.create(title="Hello", slug="hello-setup-test")
    try:
        with patch("apps.tenant_config.setup_items.can_monetize", return_value=False):
            body = client.get("/api/v1/admin/setup-status/").json()
        assert _items(body)["first_blog_post"]["done"] is True
    finally:
        BlogPost.objects.filter(slug="hello-setup-test").delete()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_setup_status.py -v`
Expected: the 3 new tests FAIL (`first_blog_post` never present); pre-existing tests pass.

- [ ] **Step 3: Implement**

In `backend/apps/tenant_config/setup_items.py`:

In `ALL_ITEM_KEYS`, add to the list literal after `"first_announcement",`:

```python
        "first_blog_post",
        "first_community_post",
```

In `compute_setup_state`, directly after the `add("first_announcement", ...)` line:

```python
    # Goal-driven extras: only for tenants whose wizard signup declared the
    # matching intent (wizard_state survives provisioning untouched).
    wizard_goals = (((getattr(tenant, "wizard_state", None) or {}).get("answers") or {}).get("goals")) or []
    if "write_blog" in wizard_goals:
        from apps.blog.models import BlogPost

        add("first_blog_post", "extras", BlogPost.objects.exists(), optional=True)
    if "build_community" in wizard_goals:
        from apps.community.models import Post

        add("first_community_post", "extras", Post.objects.exists(), optional=True)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_setup_status.py -v`
Expected: ALL PASS.

- [ ] **Step 5: Frontend catalog + labels**

In `frontend-customer/src/components/setup/catalog.ts`:

Add `MessagesSquare` and `Newspaper` to the lucide-react import list (keep it alphabetized), then add to `SETUP_CATALOG` after `first_announcement`:

```typescript
  first_blog_post: { icon: Newspaper, href: "/admin/blog" },
  first_community_post: { icon: MessagesSquare, href: "/admin/community" },
```

In `frontend-customer/messages/en/admin.json`, inside `setup.items` (after the `first_announcement` entry):

```json
"first_blog_post": {
  "title": "Write your first blog post",
  "description": "Share an article — your site's Blog section appears once the first post is published."
},
"first_community_post": {
  "title": "Say hello in your community",
  "description": "Post a welcome message so new members arrive to an active space."
}
```

In `frontend-customer/messages/tr/admin.json`, same position:

```json
"first_blog_post": {
  "title": "İlk blog yazını yaz",
  "description": "Bir makale paylaş — ilk yazı yayınlandığında sitende Blog bölümü görünür."
},
"first_community_post": {
  "title": "Topluluğunda merhaba de",
  "description": "Yeni üyeler aktif bir alana gelsin diye bir hoş geldin mesajı paylaş."
}
```

Run: `node scripts/check-i18n-parity.mjs` — expected: pass.
Run: `docker compose exec nextjs-customer npm run build` — expected: `✓ Compiled successfully`.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/tenant_config/setup_items.py backend/apps/tenant_config/tests/test_setup_status.py frontend-customer/src/components/setup/catalog.ts frontend-customer/messages/en/admin.json frontend-customer/messages/tr/admin.json
git commit -m "feat(setup): goal-driven blog/community checklist items from wizard goals"
```

---

### Task 6: Mockup tooling — `set_wizard_mockup_look` + capture domains

**Files:**
- Create: `backend/apps/core/management/commands/set_wizard_mockup_look.py`
- Modify: `backend/apps/core/management/commands/seed_wizard_mockup_tenant.py`
- Test: `backend/apps/core/tests/test_set_wizard_mockup_look.py`

**Interfaces:**
- Consumes: `settings.WIZARD_MOCKUP_TENANT_SCHEMA`, `wizard_catalog.THEMES` / `HERO_STYLES`, `compose.build_config_overrides`.
- Produces: `python manage.py set_wizard_mockup_look --theme <id>` sets `TenantConfig.theme`; `--hero <style>` rewrites the home page to `home-spotlight` blocks with that hero layout; both purge the `tenant:<schema>:config` cache. `seed_wizard_mockup_tenant` additionally creates domains `wm-theme-<id>.<CONTENTOR_DOMAIN>` (6) and `wm-hero-<style>.<CONTENTOR_DOMAIN>` (3). Task 9's capture script shells out to this command and visits those domains.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/core/tests/test_set_wizard_mockup_look.py`:

```python
"""set_wizard_mockup_look: sets theme and/or home hero style on the
wizard-mockups scratch tenant, via the real compose pipeline."""

import pytest
from django.core.management import CommandError, call_command
from django.db import connection

from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def mockup_tenant(tenant_ctx, settings):
    """Points WIZARD_MOCKUP_TENANT_SCHEMA at the already-migrated shared test
    schema instead of creating a new one — same trade-off as
    test_set_wizard_mockup_layout.py (schema creation is the most expensive
    operation in the suite)."""
    settings.WIZARD_MOCKUP_TENANT_SCHEMA = connection.schema_name
    TenantConfig.objects.get_or_create(
        defaults={"brand_name": "Mockup Test", "landing_sections": {}, "pages": {}},
    )
    return connection.schema_name


def test_sets_theme(mockup_tenant):
    call_command("set_wizard_mockup_look", theme="ember")
    assert TenantConfig.objects.first().theme == "ember"


def test_sets_hero_rebuilds_home_as_spotlight(mockup_tenant):
    call_command("set_wizard_mockup_look", hero="split")
    config = TenantConfig.objects.first()
    blocks = config.pages["home"]["blocks"]
    assert [b["type"] for b in blocks] == ["hero", "courseGrid", "testimonials", "cta"]
    assert blocks[0]["layout"] == "split"


def test_requires_at_least_one_option(mockup_tenant):
    with pytest.raises(CommandError, match="--theme and/or --hero"):
        call_command("set_wizard_mockup_look")


def test_unknown_theme_errors(mockup_tenant):
    with pytest.raises(CommandError, match="Unknown theme"):
        call_command("set_wizard_mockup_look", theme="neon")


def test_unknown_hero_errors(mockup_tenant):
    with pytest.raises(CommandError, match="Unknown hero"):
        call_command("set_wizard_mockup_look", hero="jumbo")


def test_missing_tenant_errors(settings):
    settings.WIZARD_MOCKUP_TENANT_SCHEMA = "does_not_exist_schema"
    with pytest.raises(CommandError, match="not found"):
        call_command("set_wizard_mockup_look", theme="ember")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_set_wizard_mockup_look.py -v`
Expected: FAIL — `Unknown command: 'set_wizard_mockup_look'`.

- [ ] **Step 3: Implement the command**

Create `backend/apps/core/management/commands/set_wizard_mockup_look.py`:

```python
"""Set the wizard-mockups scratch tenant's theme and/or home hero style —
used by tools/wizard-mockups/capture.mjs for the wizard's theme and
welcome (hero) screenshot sets. Same cache-invalidation notes as
set_wizard_mockup_layout: direct ORM writes must purge the 5-minute
TenantConfigView cache themselves."""

from django.conf import settings
from django.core.cache import cache
from django.core.management.base import BaseCommand, CommandError
from django_tenants.utils import tenant_context

from apps.core.models import Tenant
from apps.core.onboarding import wizard_catalog
from apps.core.onboarding.compose import build_config_overrides


class Command(BaseCommand):
    help = "Set theme and/or home hero style on the wizard-mockups tenant."

    def add_arguments(self, parser):
        parser.add_argument("--theme", help=f"One of: {', '.join(wizard_catalog.THEMES)}")
        parser.add_argument("--hero", help=f"One of: {', '.join(wizard_catalog.HERO_STYLES)}")

    def handle(self, *args, **options):
        theme = options.get("theme")
        hero = options.get("hero")
        if not theme and not hero:
            raise CommandError("Pass --theme and/or --hero.")
        if theme and theme not in wizard_catalog.THEMES:
            raise CommandError(f"Unknown theme '{theme}'. Choices: {sorted(wizard_catalog.THEMES)}")
        if hero and hero not in wizard_catalog.HERO_STYLES:
            raise CommandError(f"Unknown hero style '{hero}'. Choices: {sorted(wizard_catalog.HERO_STYLES)}")

        schema_name = settings.WIZARD_MOCKUP_TENANT_SCHEMA
        try:
            tenant = Tenant.objects.get(schema_name=schema_name)
        except Tenant.DoesNotExist:
            raise CommandError(
                f"wizard-mockups tenant (schema '{schema_name}') not found — run seed_wizard_mockup_tenant first."
            ) from None

        with tenant_context(tenant):
            from apps.tenant_config.models import TenantConfig

            config = TenantConfig.objects.first()
            if config is None:
                raise CommandError("wizard-mockups tenant has no TenantConfig — run seed_wizard_mockup_tenant first.")

            update_fields = []
            if theme:
                config.theme = theme
                update_fields.append("theme")
            if hero:
                # No page_layouts answer -> home falls back to the recommended
                # home-spotlight, so hero captures share one canonical layout.
                overrides = build_config_overrides(
                    {"hero_style": hero},
                    brand_name=config.brand_name,
                    landing_sections=config.landing_sections or {},
                    locale="en",
                )
                pages = dict(config.pages or {})
                pages["home"] = overrides["pages"]["home"]
                config.pages = pages
                update_fields.append("pages")
            config.save(update_fields=update_fields)

        cache.delete(f"tenant:{schema_name}:config")
        self.stdout.write(self.style.SUCCESS(f"look -> theme={theme or '-'} hero={hero or '-'}"))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_set_wizard_mockup_look.py apps/core/tests/test_set_wizard_mockup_layout.py -v`
Expected: ALL PASS.

- [ ] **Step 5: Add per-theme/per-hero capture domains to the seeder**

In `backend/apps/core/management/commands/seed_wizard_mockup_tenant.py`, directly after the per-layout domain loop (`self.stdout.write(f"Created {len(layout_ids)} per-layout capture domains")`), add:

```python
        # Theme and hero captures get their own domains for the same
        # frontend-customer 60s config-cache reason as the layouts above.
        look_domains = [f"wm-theme-{theme}" for theme in wizard_catalog.THEMES] + [
            f"wm-hero-{style}" for style in wizard_catalog.HERO_STYLES
        ]
        for sub in look_domains:
            Domain.objects.create(domain=f"{sub}.{settings.CONTENTOR_DOMAIN}", tenant=tenant)
        self.stdout.write(f"Created {len(look_domains)} per-look capture domains")
```

- [ ] **Step 6: Run the seeder to verify**

Run: `docker compose exec django python manage.py seed_wizard_mockup_tenant`
Expected: output includes `Created 18 per-layout capture domains` (12 old + 6 new layouts from Task 2) and `Created 9 per-look capture domains`, ends with `wizard-mockups tenant ready at: wizard-mockups.localhost`, no traceback. Then:

```bash
docker compose exec django python manage.py set_wizard_mockup_look --theme ember --hero split
```

Expected: `look -> theme=ember hero=split`. Reset afterwards:

```bash
docker compose exec django python manage.py set_wizard_mockup_look --theme forest
docker compose exec django python manage.py set_wizard_mockup_layout home home-spotlight
```

- [ ] **Step 7: Commit**

```bash
git add backend/apps/core/management/commands/set_wizard_mockup_look.py backend/apps/core/management/commands/seed_wizard_mockup_tenant.py backend/apps/core/tests/test_set_wizard_mockup_look.py
git commit -m "feat(wizard-mockups): set_wizard_mockup_look command + per-look capture domains"
```

---

### Task 7: Frontend — follow-ups step

**Files:**
- Modify: `frontend-main/src/lib/wizard/types.ts`
- Modify: `frontend-main/src/lib/wizard/api.ts`
- Modify: `frontend-main/src/lib/wizard/machine.ts`
- Modify: `frontend-main/src/app/signup/verify/wizard/WizardFlow.tsx`
- Modify: `frontend-main/src/app/signup/verify/wizard/steps.tsx`
- Modify: `frontend-main/messages/en/wizard.json`, `frontend-main/messages/tr/wizard.json`

**Interfaces:**
- Consumes: Task 3's endpoint (`{token, description}` → `{questions: string[]}`).
- Produces: `DescriptionFollowups` type `{ for: string; items: { q: string; a: string }[] }`; `getDescribeFollowups(token, description, signal?)` API helper; step id `business.followups` (chapter `business`), rendered by `FollowupsStep({ value, onChange })`. The step exists in `buildSteps` only when `answers.description_followups.items` is non-empty.

- [ ] **Step 1: Types**

In `frontend-main/src/lib/wizard/types.ts`, add after `WizardLogoAnswer`:

```typescript
export interface DescriptionFollowups {
  /** The description text these questions were generated for — lets the
   * client skip regeneration when the coach didn't change their answer. */
  for: string;
  items: { q: string; a: string }[];
}
```

And add to `WizardAnswers` after `description?: string;`:

```typescript
  description_followups?: DescriptionFollowups;
```

- [ ] **Step 2: API helper**

In `frontend-main/src/lib/wizard/api.ts`, add after `finalizeWizard`:

```typescript
export function getDescribeFollowups(
  token: string,
  description: string,
  signal?: AbortSignal,
): Promise<{ questions: string[] }> {
  return request("/api/v1/onboarding/wizard/describe-followups/", {
    method: "POST",
    body: JSON.stringify({ token, description }),
    signal,
  });
}
```

- [ ] **Step 3: Step machine**

In `frontend-main/src/lib/wizard/machine.ts`:

In `buildSteps`, replace the initial `steps` literal so the follow-ups step slots between describe and goals:

```typescript
  const steps: StepDef[] = [
    { id: "business.niche", chapter: "business" },
    { id: "business.describe", chapter: "business" },
  ];
  if ((answers.description_followups?.items?.length ?? 0) > 0) {
    steps.push({ id: "business.followups", chapter: "business" });
  }
  steps.push(
    { id: "business.goals", chapter: "business" },
    { id: "look.theme", chapter: "look" },
    { id: "look.font", chapter: "look" },
    { id: "look.navbar", chapter: "look" },
    { id: "look.hero", chapter: "look" },
  );
```

In `answered()`, add a case before `case "business.goals":`:

```typescript
    case "business.followups":
      // Never blocks resume: questions are optional; current_step decides
      // whether the coach returns here.
      return true;
```

- [ ] **Step 4: FollowupsStep component**

In `frontend-main/src/app/signup/verify/wizard/steps.tsx`:

Add `DescriptionFollowups` to the existing type import from `@/lib/wizard/types`, then add after `DescribeStep`:

```typescript
export function FollowupsStep({ value, onChange }: { value?: DescriptionFollowups; onChange: (v: DescriptionFollowups) => void }) {
  const t = useTranslations("wizard");
  const items = value?.items ?? [];
  const setAnswer = (index: number, a: string) => {
    if (!value) return;
    onChange({ ...value, items: items.map((item, i) => (i === index ? { ...item, a: a.slice(0, 500) } : item)) });
  };
  return (
    <div>
      <SlideHeader heading={t("followups.heading")} subhead={t("followups.subhead")} />
      <OptionList className="mt-5 flex flex-col gap-4">
        {items.map((item, i) => (
          <motion.div key={i} variants={itemVariants} className="flex flex-col gap-2">
            <label className="text-[14px] font-medium tracking-tight" htmlFor={`followup-${i}`}>
              {item.q}
            </label>
            <textarea
              id={`followup-${i}`}
              value={item.a}
              onChange={(e) => setAnswer(i, e.target.value)}
              rows={2}
              className="w-full resize-none rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] p-4 text-[14px] leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary"
            />
          </motion.div>
        ))}
      </OptionList>
    </div>
  );
}
```

- [ ] **Step 5: Wire WizardFlow**

In `frontend-main/src/app/signup/verify/wizard/WizardFlow.tsx`:

Add imports: `getDescribeFollowups` to the `@/lib/wizard/api` import and `FollowupsStep` to the `./steps` import (no type import needed — `followups` is inferred from `answers.description_followups`).

In `currentSlice`, add a case after `business.describe`:

```typescript
      case "business.followups":
        return answers.description_followups ? { description_followups: answers.description_followups } : {};
```

In `handleContinue`, add this branch directly after the `if (step.id === "review") { ... }` block:

```typescript
    if (step.id === "business.describe") {
      const description = answers.description ?? "";
      const stored = answers.description_followups;
      let followups = stored && stored.for === description && stored.items.length > 0 ? stored : undefined;
      if (!followups && description.trim()) {
        setBusy(true);
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 20_000);
          const res = await getDescribeFollowups(token, description, controller.signal);
          clearTimeout(timer);
          if (res.questions.length > 0) {
            followups = { for: description, items: res.questions.map((q) => ({ q, a: "" })) };
          }
        } catch {
          // AI unavailable or slow — continue without follow-ups.
        } finally {
          setBusy(false);
        }
      }
      const partial: WizardAnswers = {
        description,
        // Clear stale questions when the description changed and no new ones
        // came back, so the step disappears instead of showing old questions.
        description_followups: followups ?? { for: description, items: [] },
      };
      setDirection(1);
      await commit(partial, followups ? "business.followups" : "business.goals");
      return;
    }
```

In the `body` switch, add a case after `business.describe`:

```typescript
    case "business.followups":
      body = (
        <FollowupsStep
          value={answers.description_followups}
          onChange={(description_followups) => draft({ description_followups })}
        />
      );
      break;
```

- [ ] **Step 6: i18n (EN + TR)**

In `frontend-main/messages/en/wizard.json`, add a sibling of `describe`:

```json
"followups": {
  "heading": "A couple quick questions",
  "subhead": "Your answers help us write your site's copy in your voice. Optional — leave blank to skip."
}
```

In `frontend-main/messages/tr/wizard.json`:

```json
"followups": {
  "heading": "Birkaç kısa soru",
  "subhead": "Cevapların, site metinlerini senin ağzından yazmamıza yardımcı olur. İsteğe bağlı — boş bırakabilirsin."
}
```

Run: `node scripts/check-i18n-parity.mjs` — expected: pass.

- [ ] **Step 7: Build check**

Run: `docker compose exec nextjs-main npm run build`
Expected: `✓ Compiled successfully`, zero type errors. Then `docker compose restart nextjs-main` (dev server after a prod build in the same container).

- [ ] **Step 8: Manual verify (AI off — the dev default)**

Walk the wizard to the describe step (`http://localhost/signup` → brand → name/email → verify link from `curl -s "http://localhost/api/v1/dev/emails/latest/?to=<email>"`). Type a description, press Continue. Expected: brief busy state, then the GOALS step (AI unconfigured → `{questions: []}` → follow-ups step never appears). Confirm no console errors.

- [ ] **Step 9: Commit**

```bash
git add frontend-main/src/lib/wizard/types.ts frontend-main/src/lib/wizard/api.ts frontend-main/src/lib/wizard/machine.ts frontend-main/src/app/signup/verify/wizard/WizardFlow.tsx frontend-main/src/app/signup/verify/wizard/steps.tsx frontend-main/messages/en/wizard.json frontend-main/messages/tr/wizard.json
git commit -m "feat(wizard): AI follow-up questions step after describe"
```

---

### Task 8: Frontend — wider shell, bigger previews, split/pill minis, screenshot thumbnails

**Files:**
- Modify: `frontend-main/src/app/signup/verify/wizard/WizardShell.tsx`
- Modify: `frontend-main/src/app/signup/verify/wizard/WizardFlow.tsx`
- Modify: `frontend-main/src/app/signup/verify/wizard/pages-steps.tsx`
- Modify: `frontend-main/src/app/signup/verify/wizard/previews.tsx`
- Modify: `frontend-main/src/app/signup/verify/wizard/steps.tsx`
- Modify: `frontend-main/src/app/signup/verify/wizard/logo-review-steps.tsx`

**Interfaces:**
- Consumes: PNGs `/wizard-mockups/theme-<id>.png` and `/wizard-mockups/hero-<style>.png` (Task 9 creates them — until then every thumbnail MUST fall back gracefully).
- Produces: `ScreenshotThumbnail({ src, fallback })` in `previews.tsx` (reusable image-with-fallback inside `BrowserFrame`); `MiniNavbar` handles `split` and `pill`.

- [ ] **Step 1: Widen the shell**

In `frontend-main/src/app/signup/verify/wizard/WizardShell.tsx`, replace the column-width className:

```typescript
          className={`flex h-full w-full min-w-0 flex-col ${wide ? "md:max-w-[min(1100px,94vw)]" : "md:max-w-[640px]"}`}
```

- [ ] **Step 2: Wide steps + pages grid**

In `frontend-main/src/app/signup/verify/wizard/WizardFlow.tsx`, replace the `wide` prop value in the `WizardShell` JSX:

```typescript
      wide={step.chapter === "pages" || step.id === "look.theme" || step.id === "look.hero"}
```

In `frontend-main/src/app/signup/verify/wizard/pages-steps.tsx`, replace the `OptionList` className in `PageLayoutStep`:

```typescript
      <OptionList className="mx-auto mt-6 grid w-full grid-cols-2 gap-4 md:grid-cols-3">
```

- [ ] **Step 3: `ScreenshotThumbnail` + split/pill `MiniNavbar` + taller `MiniHero`**

In `frontend-main/src/app/signup/verify/wizard/previews.tsx`:

Change the react import to include `useState`:

```typescript
import { useEffect, useState } from "react";
```

Add after `BrowserFrame`:

```typescript
/** Real screenshot inside browser chrome, swapping to `fallback` when the
 * PNG hasn't been captured yet (tools/wizard-mockups/) — a catalog option
 * must never show a broken image. */
export function ScreenshotThumbnail({ src, fallback }: { src: string; fallback: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    <BrowserFrame>
      {/* eslint-disable-next-line @next/next/no-img-element -- static asset, no next/image loader needed */}
      <img src={src} alt="" className="block w-full" onError={() => setFailed(true)} />
    </BrowserFrame>
  );
}
```

Replace the whole `MiniNavbar` function with (adds `split` + `pill`, bumps height h-9 → h-10; the split/pill shapes mirror `frontend-customer/src/components/shared/public-header.tsx`: split = link-half, centered brand, link-half; pill = floating capsule):

```typescript
export function MiniNavbar({ layout, theme, font, brand }: { layout: string; theme?: string; font?: string; brand: string }) {
  const s = swatch(theme);
  const links = (
    <span className="flex gap-1.5" aria-hidden>
      {[10, 8, 9].map((w, i) => (
        <span key={i} className="h-1 rounded-full bg-current opacity-40" style={{ width: w * 2 }} />
      ))}
    </span>
  );
  const brandEl = (
    <span className="font-semibold" style={{ fontFamily: fontStack(font) }}>
      {brand}
    </span>
  );
  if (layout === "pill") {
    return (
      <div className="flex h-10 w-full items-center justify-center text-[10px]" style={{ color: s.ink }}>
        <div
          className="flex w-[94%] items-center justify-between rounded-full border bg-white px-3 py-1.5 shadow-sm"
          style={{ borderColor: `${s.primary}33` }}
        >
          {brandEl}
          {links}
          <span className="rounded-full px-2 py-0.5 text-[8px] font-semibold text-white" style={{ background: s.primary }}>
            CTA
          </span>
        </div>
      </div>
    );
  }
  return (
    <div
      className="flex h-10 w-full items-center rounded-lg border px-3 text-[10px]"
      style={{ borderColor: `${s.primary}33`, color: s.ink, background: "white" }}
    >
      {layout === "centered" ? (
        <div className="flex w-full flex-col items-center gap-1 py-1">
          <span className="font-semibold leading-none" style={{ fontFamily: fontStack(font) }}>{brand}</span>
          {links}
        </div>
      ) : layout === "minimal" ? (
        <div className="flex w-full items-center justify-between">
          {brandEl}
          <span className="h-2.5 w-4 rounded-sm" style={{ background: `${s.ink}22` }} />
        </div>
      ) : layout === "split" ? (
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center">
          <span className="justify-self-start">{links}</span>
          {brandEl}
          <span className="justify-self-end">{links}</span>
        </div>
      ) : (
        <div className="flex w-full items-center justify-between">
          {brandEl}
          {links}
          <span className="rounded-full px-2 py-0.5 text-[8px] font-semibold text-white" style={{ background: s.primary }}>
            CTA
          </span>
        </div>
      )}
    </div>
  );
}
```

In `MiniHero` (now the hero step's fallback and still its own preview until Task 9 lands), change every `h-20` to `h-28` (three occurrences).

- [ ] **Step 4: Theme + hero steps render screenshots**

In `frontend-main/src/app/signup/verify/wizard/steps.tsx`:

Extend the `./previews` import:

```typescript
import { MiniHero, MiniNavbar, ScreenshotThumbnail } from "./previews";
```

Replace `ThemeStep`'s `OptionList` block (the swatch strip stays, now under the screenshot; grid instead of a stacked list):

```typescript
      <OptionList className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        {shown.map((theme, i) => {
          const s = THEME_SWATCHES[theme];
          return (
            <OptionCard key={theme} selected={value === theme} onSelect={() => onChange(theme)} title={t(`themes.${theme}`)} badge={i === 0 && !showAll ? t("common.recommended") : undefined}>
              <div className="flex w-full flex-col items-center gap-2">
                <ScreenshotThumbnail src={`/wizard-mockups/theme-${theme}.png`} fallback={null} />
                <span className="flex gap-1.5" aria-hidden>
                  {[s.primary, s.ink, s.soft].map((c) => (
                    <span key={c} className="h-5 w-9 rounded-md border border-black/5" style={{ background: c }} />
                  ))}
                </span>
              </div>
            </OptionCard>
          );
        })}
      </OptionList>
```

Replace `HeroStep`'s `OptionList` block:

```typescript
      <OptionList className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {catalog.hero_styles.map((style) => (
          <OptionCard key={style} selected={value === style} onSelect={() => onChange(style)} title={t(`heroStyles.${style}.label`)} subtitle={t(`heroStyles.${style}.desc`)}>
            <ScreenshotThumbnail
              src={`/wizard-mockups/hero-${style}.png`}
              fallback={<MiniHero style={style} theme={theme} font={font} brand={brand} />}
            />
          </OptionCard>
        ))}
      </OptionList>
```

- [ ] **Step 5: Curated logo grid 8 → 12**

In `frontend-main/src/app/signup/verify/wizard/logo-review-steps.tsx`, in `LogoStep`, change:

```typescript
              {ranked.slice(0, 8).map((item) => (
```

to:

```typescript
              {ranked.slice(0, 12).map((item) => (
```

- [ ] **Step 6: Build + fallback browser check**

Run: `docker compose exec nextjs-main npm run build` — expected `✓ Compiled successfully`. Then `docker compose restart nextjs-main`.

Walk the wizard to the look chapter. Expected (theme/hero PNGs don't exist yet):
- Theme step: wide 3-column grid, each card showing ONLY the swatch strip (no broken image).
- Navbar step: 5 options — Classic, Centered, Split, Minimal, Floating pill — each mini-preview visually distinct and matching its preset's real arrangement.
- Hero step: wide 3-column grid, cards showing the (taller) `MiniHero` wireframes.
- Pages steps: 3 cards per page in a 3-column grid; the 12 existing layout screenshots still render; the 6 new layouts show the wireframe fallback.
- At 375px width (devtools): single/2-col grids, no horizontal scroll.

- [ ] **Step 7: Commit**

```bash
git add frontend-main/src/app/signup/verify/wizard/WizardShell.tsx frontend-main/src/app/signup/verify/wizard/WizardFlow.tsx frontend-main/src/app/signup/verify/wizard/pages-steps.tsx frontend-main/src/app/signup/verify/wizard/previews.tsx frontend-main/src/app/signup/verify/wizard/steps.tsx frontend-main/src/app/signup/verify/wizard/logo-review-steps.tsx
git commit -m "feat(wizard): wider shell, bigger previews, all-preset navbar minis, screenshot thumbnails"
```

---

### Task 9: Capture — extend `capture.mjs`, run it, review every PNG

**Files:**
- Modify: `tools/wizard-mockups/capture.mjs`
- Create (generated): `frontend-main/public/wizard-mockups/*.png` (27 files total: 18 layouts + 3 heroes + 6 themes)

**Interfaces:**
- Consumes: Task 6's `set_wizard_mockup_look` + domains, Task 2's layout ids.
- Produces: `theme-<id>.png` (6), `hero-<style>.png` (3), `<layout_id>.png` (18) in `frontend-main/public/wizard-mockups/` — the filenames Task 8's components request.

- [ ] **Step 1: Extend the capture script**

In `tools/wizard-mockups/capture.mjs`:

Add the 6 new entries to `LAYOUTS` (keep page grouping):

```js
  { page: "home", id: "home-complete", path: "/" },
  { page: "about", id: "about-warm", path: "/about" },
  { page: "courses", id: "courses-social", path: "/courses" },
  { page: "pricing", id: "pricing-trust", path: "/plans" },
  { page: "faq", id: "faq-support", path: "/faq" },
  { page: "contact", id: "contact-reassure", path: "/contact" },
```

Add after the `LAYOUTS` array:

```js
// Mirrors wizard_catalog.THEMES / HERO_STYLES.
const THEMES = ["ocean", "ember", "forest", "sunset", "violet", "slate"];
const HEROES = ["centered", "split", "minimal"];
// Hero cards only sell the top of the page — clip before downscaling.
const HERO_CLIP = { x: 0, y: 0, width: 1280, height: 640 };
```

Add after `setLayout`:

```js
function setLook(args) {
  execFileSync(
    "docker",
    ["compose", "exec", "-T", "django", "python", "manage.py", "set_wizard_mockup_look", ...args],
    { cwd: join(__dirname, "..", ".."), stdio: "inherit" },
  );
}
```

In `main()`, extract a capture helper and add the hero/theme passes. Replace the existing `for (const ... of LAYOUTS)` loop and the closing lines of `main()` with:

```js
  async function capture(host, path, outName, clip) {
    await page.goto(`http://${host}${path}`, { waitUntil: "networkidle", timeout: 30000 });
    // Hide Next.js's dev-only overlay, same as tools/flowmap/crawler/capture.js.
    await page.addStyleTag({ content: "nextjs-portal{display:none !important}" }).catch(() => {});
    const png = await page.screenshot({ fullPage: false, ...(clip ? { clip } : {}) });
    const downscaled = await downscale(page, png, OUTPUT_WIDTH);
    writeFileSync(join(OUT_DIR, `${outName}.png`), downscaled);
    console.log(`  -> ${outName}.png`);
  }

  for (const { page: pageKey, id, path } of LAYOUTS) {
    console.log(`${id} ...`);
    setLayout(pageKey, id);
    await capture(`wm-${id}.localhost`, path, id);
  }

  for (const style of HEROES) {
    console.log(`hero-${style} ...`);
    setLook(["--hero", style]);
    await capture(`wm-hero-${style}.localhost`, "/", `hero-${style}`, HERO_CLIP);
  }
  // Reset home (hero back to centered, spotlight layout) before theme shots.
  setLayout("home", "home-spotlight");

  for (const theme of THEMES) {
    console.log(`theme-${theme} ...`);
    setLook(["--theme", theme]);
    await capture(`wm-theme-${theme}.localhost`, "/", `theme-${theme}`);
  }
  // Leave the scratch tenant on its seeded (yoga) theme.
  setLook(["--theme", "forest"]);

  await browser.close();
  console.log(`\nDone. ${LAYOUTS.length + HEROES.length + THEMES.length} screenshots written to ${OUT_DIR}`);
```

- [ ] **Step 2: Run the capture**

Run: `make capture-wizard-mockups` (dev stack must be up; the target reseeds the scratch tenant — picking up the new domains — then captures).
Expected: 27 `-> <name>.png` lines, `Done. 27 screenshots written to ...`, no traceback. Then:

```bash
ls -la frontend-main/public/wizard-mockups/
```

Expected: exactly 27 `.png` files (18 layout + `hero-{centered,split,minimal}` + `theme-{ocean,ember,forest,sunset,violet,slate}`), each ≥ a few KB.

- [ ] **Step 3: Review EVERY PNG individually**

View all 27 files (they ARE the deliverable — sampling is not acceptable). Checks:
- The 6 theme shots differ from each other in palette and show a real, populated home page (no empty states).
- The 3 hero shots show visibly different hero arrangements (image-led / split / minimal) cropped to the hero region.
- The 6 new layout shots match their block sequences (e.g. `faq-support` shows FAQ + a contact form; `pricing-trust` shows plans + testimonials).
- No shot shows the Next.js dev overlay, a blank page, or the WRONG page.

If any pair of shots that should differ is identical, suspect the two caching layers documented in `docs/superpowers/plans/2026-07-14-wizard-mockup-screenshots.md` (execution notes) and fix before proceeding.

- [ ] **Step 4: In-wizard verification**

`docker compose restart nextjs-main`, then walk the wizard: theme step shows 3 (then 6 via "show all") real screenshots + swatches; hero step shows 3 real hero crops; every pages step shows 3 real screenshots (no wireframe fallbacks left).

- [ ] **Step 5: Commit**

```bash
git add tools/wizard-mockups/capture.mjs frontend-main/public/wizard-mockups/
git commit -m "feat(wizard-mockups): theme + hero + new-layout captures (27 shots)"
```

---

### Task 10: Verification sweep — lint, tests, e2e, community live-verify, curated logos

**Files:** none created — verification only (fixes allowed if something fails, committed separately with a matching message).

- [ ] **Step 1: Lint + full backend suite + builds**

```bash
make lint
docker compose exec django pytest -q
docker compose exec nextjs-main npm run build
docker compose exec nextjs-customer npm run build
node scripts/check-i18n-parity.mjs
```

Expected: lint zero errors/warnings; pytest all pass; both builds compile; parity passes. (`docker compose restart nextjs-main nextjs-customer` after the prod builds.)

- [ ] **Step 2: E2e**

```bash
make e2e
```

Expected: all specs pass, Stripe specs skip. Watch `01-signup-onboarding.spec.ts` and `23-wizard-ai-logo.spec.ts` specifically — the wizard now has 3 layout cards per page and 5 navbar options, but the specs click exact known labels, and with AI off the follow-ups step never appears. If a spec fails on a selector, check the substring-collision rule in Global Constraints before changing any label.

- [ ] **Step 3: Community live-verify (fresh celery)**

```bash
docker compose restart celery-worker celery-beat
```

Run a full wizard signup in the browser (new brand, e.g. "Community Check"), picking **Build a community** on the goals step, finishing with "Create my platform". After provisioning completes:

```bash
docker compose exec django python manage.py shell -c "
from django_tenants.utils import schema_context
from apps.core.models import Tenant
t = Tenant.objects.get(slug='community-check')
with schema_context(t.schema_name):
    from apps.community.models import CommunitySettings
    print('community enabled:', CommunitySettings.load().is_enabled)
"
```

Expected: `community enabled: True`. Then sign in on the new tenant as the owner and confirm the **Community** nav entry renders, and `/admin` setup assistant shows "Say hello in your community". If `is_enabled` is False on fresh celery code, STOP and root-cause (systematic-debugging) — do not patch around it.

- [ ] **Step 4: Curated logos verify**

```bash
make seed
```

Walk the wizard to the logo step. Expected: the "Ready-made" curated grid renders with images (12 max). If it's hidden, check `CuratedLogo` rows exist (`docker compose exec django python manage.py shell -c "from apps.core.models import CuratedLogo; print(CuratedLogo.objects.count())"`) — seeding, not code, is the suspect.

- [ ] **Step 5: Full-wizard browser walk (desktop + mobile)**

One complete run at 1440×900 and one at 375×812 (devtools): brand → name/email → verify → niche → describe (type text) → goals (pick several incl. new "Share articles & tips") → theme (screenshots) → font → navbar (5 minis) → hero (screenshots) → 6 pages steps (3 cards each) → logo → review → create. Expected: no dead ends, no horizontal scroll on mobile, review step lists the picked goals, provisioning completes.

- [ ] **Step 6: Final commit (only if fixes were made)**

Commit any verification fixes with `fix(wizard): <what>` messages, one concern per commit.

---

## Post-plan follow-ups (not part of this plan)

- Prod deploy + prod `GEMINI_API_KEY`/`ANTHROPIC_API_KEY` for the AI paths (follow-ups + ai_compose) to go live; until then both fail soft.
- Prod must have run `seed_curated_logos` (part of `make seed`) — deploy-checklist item.
- The owner should TR-native-review the new Turkish strings (same caveat as all wizard copy).
- If a 4th layout is ever added to a page: catalog entry + compose branch + label + `LAYOUTS` entry + re-run `make capture-wizard-mockups`.
