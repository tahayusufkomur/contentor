# Onboarding Wizard — Phase 1 (wizard core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 2-slide signup questionnaire with the full pre-provision customization wizard (business → look → pages → logo → launch) whose answers actually shape the provisioned tenant (theme, font, navbar, modules, page layouts, logo), with static per-niche copy. AI copywriting (phase 2) and checkout/AI-logo (phase 3) come in later plans built on the interfaces defined here.

**Spec:** `docs/superpowers/specs/2026-07-13-onboarding-wizard-design.md` (approved). Phase-1 scope adjustment vs the spec's phasing table: the **curated-logo apply moves into phase 1** so both free logo doors fully work (a pickable-but-inert curated door would be broken UX). No S3 copy is needed — like demo photos, a tenant `Photo` row may point at the shared `platform/...` key.

**Architecture:** New `wizard_state` JSON on `Tenant` + a 7-day `purpose="wizard"` JWT; four new endpoints under `/api/v1/onboarding/wizard/`; a pure-data option catalog (`wizard_catalog.py`) + a pure compose function (`compose.py`) that `provision_tenant` applies **after** the existing niche seeder runs (so wizard choices override niche defaults, while harvesting the seeder's photos/copy). Frontend: the wizard lives in `frontend-main` inside the existing `/signup/verify` state machine, styled after `QuestionnaireStep`.

**Tech Stack:** Django 5.1 + DRF + django-tenants + Celery (backend), Next.js 14 App Router + next-intl + Tailwind (frontend-main), Playwright (e2e), pytest -n auto in docker.

## Global Constraints

- All commands from repo root `~/ws/projects-active/home-server/contentor`; backend tests run **inside** the container: `docker compose exec django pytest <path> -v` (suite: `make test`; after ANY new migration: `make test-fresh`).
- Public/anon endpoints MUST set `@authentication_classes([])` — `AllowAny` alone is not enough (project rule, see `apps/core/onboarding/views.py`).
- `make lint` (pre-commit + `check-i18n`) must pass with zero errors/warnings. Pre-commit does NOT lint the frontends — run `cd frontend-main && npm run lint && npm run build` explicitly where a task touches it.
- EN and TR message catalogs must stay key-identical (`node scripts/check-i18n-parity.mjs`).
- Wizard answer keys/values are server-whitelisted; unknown keys/values → 400 (never stored).
- Every block written to `TenantConfig.pages` must use types from `apps.tenant_config.defaults.KNOWN_BLOCK_TYPES` and page keys from `KNOWN_PAGE_KEYS`; hero `layout` values are exactly `centered|split|minimal`; navbar `layout` values ⊆ `{classic, centered, split, minimal, pill}` (`_NAVBAR_LAYOUTS` in `apps/tenant_config/serializers.py`).
- Theme ids are exactly `TenantTheme.values` = `ocean, ember, forest, sunset, violet, slate`; fonts used by the wizard: `Inter`, `Nunito`, `Playfair Display` (already used by niche modules).
- Commit after each task (this SDD flow is the explicitly-approved exception to the repo's "never commit unless asked" rule). Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Existing endpoints `seed-from-template/`, `skip-template/` and their client helpers stay working (deprecated, still deployed) — do not delete them.

## File Structure (phase 1)

Backend — create:
- `backend/apps/core/onboarding/wizard_catalog.py` — option sets (ids ONLY — labels live in the frontend message catalogs), per-niche theme ranking, page-layout ids + block-type sequences, recommended defaults, answer validation. Pure data/helpers, no model access.
- `backend/apps/core/onboarding/compose.py` — `build_config_overrides()` + per-page block builders + `apply_wizard_logo()`. Pure functions over dicts (models touched only in `apply_wizard_logo`).
- `backend/apps/core/onboarding/wizard.py` — the four wizard views (catalog, state read, state patch, finalize).
- `backend/apps/accounts/tests/test_wizard_token.py`, `backend/apps/core/tests/test_wizard_catalog.py`, `backend/apps/core/tests/test_wizard_state_endpoints.py`, `backend/apps/core/tests/test_wizard_compose.py`, `backend/apps/core/tests/test_wizard_finalize.py`, `backend/apps/core/tests/test_wizard_provision.py`.

Backend — modify:
- `backend/apps/accounts/tokens.py` (wizard token), `backend/config/settings/base.py` (`WIZARD_TOKEN_EXPIRY_DAYS`), `backend/apps/core/models.py` (+migration: `Tenant.wizard_state`), `backend/apps/core/onboarding/views.py` (verify returns `wizard_token`), `backend/apps/core/onboarding/urls.py` (4 routes), `backend/apps/core/tasks.py` (apply overrides + community flip + logo), `backend/apps/core/curated_logos/views.py` (+`id` in payload).

Frontend-main — create:
- `frontend-main/src/lib/wizard/types.ts`, `api.ts`, `machine.ts`, `wizard-themes.ts` — types, fetch helpers, pure step-machine, 6 swatch consts.
- `frontend-main/src/app/signup/verify/wizard/WizardShell.tsx`, `WizardFlow.tsx` (orchestrator), `steps.tsx` (chapter-1+2 step components), `pages-steps.tsx` (chapter-3), `logo-review-steps.tsx` (chapter-4+5), `previews.tsx` (mini navbar/hero/page mocks + live preview panel).
- `frontend-main/messages/en/wizard.json` + `frontend-main/messages/tr/wizard.json`.

Frontend-main — modify:
- `frontend-main/src/i18n/request.ts` (import wizard.json), `frontend-main/src/app/signup/verify/page.tsx` (mount wizard, resume), `frontend-main/src/lib/api/onboarding.ts` (keep; wizard client lives in `lib/wizard/api.ts`), `frontend-main/messages/{en,tr}/auth.json` (drop `questionnaire` namespace once unused).
- Delete at the end: `frontend-main/src/app/signup/verify/QuestionnaireStep.tsx`.

E2E — modify: `e2e/specs/01-signup-onboarding.spec.ts` (walk the wizard).

---

### Task 1: Wizard token (7-day JWT, accepts signup token too)

**Files:**
- Modify: `backend/apps/accounts/tokens.py` (after `verify_signup_token`, ~line 45)
- Modify: `backend/config/settings/base.py:191` (next to `MAGIC_LINK_EXPIRY_MINUTES`)
- Test: `backend/apps/accounts/tests/test_wizard_token.py` (create)

**Interfaces:**
- Consumes: existing `create_signup_token` payload shape (`email, name, brand_name, region, purpose, exp, iat`), `settings.SECRET_KEY`.
- Produces: `create_wizard_token(email: str, name: str, brand_name: str, region: str = "global") -> str` and `verify_wizard_token(token: str) -> dict` (accepts purposes `wizard` AND `signup`; raises `jwt.InvalidTokenError`/`jwt.ExpiredSignatureError` otherwise). Setting `WIZARD_TOKEN_EXPIRY_DAYS = 7`. Tasks 4/6 call both.

- [ ] **Step 1: Write the failing test**

Create `backend/apps/accounts/tests/test_wizard_token.py`:

```python
import jwt as pyjwt
import pytest
from django.conf import settings as dj_settings

from apps.accounts.tokens import create_signup_token, create_wizard_token, verify_wizard_token


def test_wizard_token_round_trip():
    token = create_wizard_token("a@b.com", "Coach", "Glow Studio", region="tr")
    payload = verify_wizard_token(token)
    assert payload["email"] == "a@b.com"
    assert payload["name"] == "Coach"
    assert payload["brand_name"] == "Glow Studio"
    assert payload["region"] == "tr"
    assert payload["purpose"] == "wizard"


def test_wizard_verify_accepts_signup_token():
    # Continuity: the short-lived signup token stays valid for wizard calls
    # during its 15-minute window.
    token = create_signup_token("a@b.com", "Coach", "Glow Studio")
    assert verify_wizard_token(token)["purpose"] == "signup"


def test_wizard_verify_rejects_other_purposes():
    bad = pyjwt.encode(
        {"email": "a@b.com", "purpose": "magic_link"},
        dj_settings.SECRET_KEY,
        algorithm="HS256",
    )
    with pytest.raises(pyjwt.InvalidTokenError):
        verify_wizard_token(bad)


def test_wizard_token_expires_by_days_setting(settings):
    settings.WIZARD_TOKEN_EXPIRY_DAYS = -1
    token = create_wizard_token("a@b.com", "Coach", "Glow Studio")
    with pytest.raises(pyjwt.ExpiredSignatureError):
        verify_wizard_token(token)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/accounts/tests/test_wizard_token.py -v`
Expected: FAIL — `ImportError: cannot import name 'create_wizard_token'`.

- [ ] **Step 3: Implement token functions + setting**

In `backend/config/settings/base.py`, directly under `MAGIC_LINK_EXPIRY_MINUTES = 15` (line 191), add:

```python
WIZARD_TOKEN_EXPIRY_DAYS = 7  # pre-provision onboarding wizard sessions
```

In `backend/apps/accounts/tokens.py`, directly after `verify_signup_token`, add (imports `datetime/UTC/timedelta/jwt/settings` already exist at module top):

```python
def create_wizard_token(email: str, name: str, brand_name: str, region: str = "global") -> str:
    """Long-lived token for the pre-provision onboarding wizard.

    Same claims as the signup token but a multi-day expiry, so a coach can
    leave mid-wizard and resume. Deliberately a separate purpose: extending
    the signup/magic-link TTL would also lengthen login links.
    """
    payload = {
        "email": email,
        "name": name,
        "brand_name": brand_name,
        "region": region,
        "purpose": "wizard",
        "exp": datetime.now(tz=UTC) + timedelta(days=settings.WIZARD_TOKEN_EXPIRY_DAYS),
        "iat": datetime.now(tz=UTC),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def verify_wizard_token(token: str) -> dict:
    """Accepts wizard tokens AND (still-valid) signup tokens — the signup
    token is the only credential the coach holds in the first 15 minutes."""
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    if payload.get("purpose") not in ("wizard", "signup"):
        raise jwt.InvalidTokenError("Invalid token purpose")
    return payload
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec django pytest apps/accounts/tests/test_wizard_token.py -v`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/accounts/tokens.py backend/apps/accounts/tests/test_wizard_token.py backend/config/settings/base.py
git commit -m "feat(onboarding): wizard token purpose with 7-day expiry

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `Tenant.wizard_state` field + migration

**Files:**
- Modify: `backend/apps/core/models.py` (Tenant, directly after `template_seed_status`, ~line 95)
- Create: migration via makemigrations (do not hand-write)
- Test: `backend/apps/core/tests/test_wizard_state_endpoints.py` (create; endpoint tests join it in Task 4)

**Interfaces:**
- Produces: `Tenant.wizard_state: JSONField(default=dict, blank=True)`. Canonical shape (documented for later tasks; nothing enforces it at the model layer):

```json
{
  "version": 1,
  "current_step": "look.theme",
  "answers": {
    "niche": "yoga", "description": "…", "goals": ["sell_courses"],
    "theme": "forest", "font_family": "Nunito", "navbar_layout": "classic",
    "hero_style": "centered",
    "page_layouts": {"home": "home-spotlight", "about": "about-story", "courses": "courses-grid", "pricing": "pricing-simple", "faq": "faq-list", "contact": "contact-form"},
    "logo": {"mode": "wordmark", "curated_id": null}
  },
  "step_timestamps": {"niche": "2026-07-13T10:02:11+00:00"},
  "finished_rest_for_me": false,
  "ai_compose_status": null,
  "provisioning_stage": null
}
```

- [ ] **Step 1: Write the failing test**

Create `backend/apps/core/tests/test_wizard_state_endpoints.py`:

```python
import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.tokens import create_signup_token, create_wizard_token
from apps.core.models import Tenant

pytestmark = pytest.mark.django_db(transaction=True)

SHARED_DOMAIN = "shared-test.localhost"


def _client():
    return APIClient(HTTP_HOST=SHARED_DOMAIN)


def _token(email="coach@x.com", brand="Wiz Studio"):
    return create_wizard_token(email, "Coach", brand)


@pytest.fixture()
def tenant(restore_public):
    # Row-only tenant (no schema): wizard endpoints never enter the tenant
    # schema. Mirrors apps/core/tests/test_onboarding_handoff.py.
    connection.set_schema_to_public()
    original = Tenant.auto_create_schema
    Tenant.auto_create_schema = False
    try:
        t, _ = Tenant.objects.get_or_create(
            schema_name="wiz_studio",
            defaults={
                "name": "Wiz Studio",
                "slug": "wiz-studio",
                "subdomain": "wiz-studio",
                "owner_email": "coach@x.com",
            },
        )
        t.provisioning_status = "pending"
        t.template_seed_status = "pending"
        t.wizard_state = {}
        t.save(update_fields=["provisioning_status", "template_seed_status", "wizard_state"])
    finally:
        Tenant.auto_create_schema = original
    yield t
    connection.set_schema_to_public()
    Tenant.objects.filter(schema_name="wiz_studio").delete()


def test_wizard_state_defaults_to_empty_dict(tenant):
    tenant.refresh_from_db()
    assert tenant.wizard_state == {}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_state_endpoints.py -v`
Expected: FAIL — `AttributeError`/`FieldError`: Tenant has no field `wizard_state` (the fixture's `save(update_fields=[... "wizard_state"])` errors).

- [ ] **Step 3: Add the field + generate the migration**

In `backend/apps/core/models.py`, inside `Tenant`, directly after the `template_seed_status` field, add:

```python
    wizard_state = models.JSONField(
        default=dict,
        blank=True,
        help_text=(
            "Pre-provision onboarding wizard progress + answers. "
            "Shape/versioning owned by apps.core.onboarding (wizard.py/compose.py)."
        ),
    )
```

Then generate + apply the migration:

```bash
docker compose exec django python manage.py makemigrations core
make migrate-shared
```

Expected: one new file `backend/apps/core/migrations/00XX_tenant_wizard_state.py` (AddField only).

- [ ] **Step 4: Run test to verify it passes (fresh test DB — new migration)**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_state_endpoints.py -v --create-db`
Expected: 1 PASS. (Subsequent tasks can drop `--create-db`; the rebuilt test DB is reused.)

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/models.py backend/apps/core/migrations/ backend/apps/core/tests/test_wizard_state_endpoints.py
git commit -m "feat(onboarding): Tenant.wizard_state JSON field

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Option catalog module + public catalog endpoint

**Files:**
- Create: `backend/apps/core/onboarding/wizard_catalog.py`
- Create: `backend/apps/core/onboarding/wizard.py` (catalog view only; Task 4 adds state, Task 6 adds finalize)
- Modify: `backend/apps/core/onboarding/urls.py`
- Test: `backend/apps/core/tests/test_wizard_catalog.py` (create)

**Interfaces:**
- Consumes: `KNOWN_BLOCK_TYPES`, `KNOWN_PAGE_KEYS` from `apps.tenant_config.defaults`; `available_niches()` from `apps.core.demo.seed_template`.
- Produces (used by Tasks 4–7 and the frontend):
  - Constants: `GOALS`, `THEMES`, `THEME_RANKING: dict[str, tuple]`, `FONTS: dict[id, family]`, `NAVBAR_LAYOUTS`, `HERO_STYLES`, `LOGO_MODES`, `PAGE_LAYOUTS: dict[page, tuple[{"id", "blocks"}]]`, `HOME_GOAL_BLOCKS`.
  - `recommended_answers(niche: str) -> dict` — complete default answer set.
  - `validate_answers(partial: dict) -> list[str]` — empty list = valid.
  - `catalog_payload() -> dict` — JSON body of `GET /api/v1/onboarding/wizard/catalog/`.
- **Spec deviation (deliberate):** the catalog returns **ids only, no labels**. All human-readable labels live in `frontend-main/messages/{en,tr}/wizard.json`, because this repo's i18n convention (parity-checked message catalogs, native TR review) beats shipping labels from Python.

- [ ] **Step 1: Write the failing test**

Create `backend/apps/core/tests/test_wizard_catalog.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.core.onboarding import wizard_catalog as wc
from apps.tenant_config.defaults import KNOWN_BLOCK_TYPES, KNOWN_PAGE_KEYS
from apps.tenant_config.models import TenantTheme
from apps.tenant_config.serializers import _NAVBAR_LAYOUTS

pytestmark = pytest.mark.django_db


def test_themes_match_tenant_theme_enum():
    assert set(wc.THEMES) == set(TenantTheme.values)


def test_theme_ranking_covers_all_niches_with_valid_themes():
    from apps.core.demo.seed_template import available_niches

    assert set(wc.THEME_RANKING) == set(available_niches())
    for ranked in wc.THEME_RANKING.values():
        assert len(ranked) == 3
        assert set(ranked) <= set(wc.THEMES)


def test_navbar_and_hero_enums_are_valid_subsets():
    assert set(wc.NAVBAR_LAYOUTS) <= _NAVBAR_LAYOUTS
    assert set(wc.HERO_STYLES) == {"centered", "split", "minimal"}


def test_page_layouts_cover_all_pages_with_known_blocks():
    assert set(wc.PAGE_LAYOUTS) == set(KNOWN_PAGE_KEYS)
    for options in wc.PAGE_LAYOUTS.values():
        assert len(options) >= 2
        ids = [o["id"] for o in options]
        assert len(ids) == len(set(ids))
        for option in options:
            assert set(option["blocks"]) <= KNOWN_BLOCK_TYPES
    for goal_block in wc.HOME_GOAL_BLOCKS:
        assert goal_block["goal"] in wc.GOALS
        assert goal_block["type"] in KNOWN_BLOCK_TYPES


def test_recommended_answers_complete_and_fallback():
    rec = wc.recommended_answers("yoga")
    assert rec["theme"] == "forest"
    assert set(rec["page_layouts"]) == set(KNOWN_PAGE_KEYS)
    assert rec["logo"] == {"mode": "wordmark", "curated_id": None}
    assert wc.recommended_answers("no-such-niche")["niche"] == "general"


def test_validate_answers_accepts_valid_partial():
    assert wc.validate_answers({"theme": "forest", "goals": ["sell_courses"]}) == []


@pytest.mark.parametrize(
    "partial",
    [
        {"theme": "neon"},
        {"nonsense_key": 1},
        {"description": "x" * 501},
        {"goals": ["sell_courses", "hack"]},
        {"page_layouts": {"home": "no-such-layout"}},
        {"page_layouts": {"basement": "home-spotlight"}},
        {"logo": {"mode": "ai"}},
        {"font_family": "Comic Sans"},
        {"hero_style": "gigantic"},
        {"navbar_layout": "pill"},
    ],
)
def test_validate_answers_rejects_invalid(partial):
    assert wc.validate_answers(partial) != []


def test_catalog_endpoint_serves_payload():
    resp = APIClient().get("/api/v1/onboarding/wizard/catalog/")
    assert resp.status_code == 200
    data = resp.json()
    assert "yoga" in data["niches"]
    assert len(data["page_layouts"]["home"]) == 2
    assert data["recommended"]["logo"]["mode"] == "wordmark"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_catalog.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'apps.core.onboarding.wizard_catalog'`.

- [ ] **Step 3: Implement the catalog module**

Create `backend/apps/core/onboarding/wizard_catalog.py`:

```python
"""Option catalog for the pre-provision onboarding wizard.

Single source of truth for every answer the wizard may store: option ids,
per-niche theme ranking, page-layout block sequences, and the recommended
default per step. Pure data + helpers (no model access) so it's importable
from views, Celery tasks, and tests alike.

The frontend renders steps from GET /api/v1/onboarding/wizard/catalog/ and
never hardcodes option ids; ``validate_answers`` is the write-side gate.
Labels are deliberately NOT here — they live in the frontend message
catalogs (messages/{en,tr}/wizard.json) to keep the i18n parity guard the
single translation workflow.
"""

from __future__ import annotations

from apps.tenant_config.defaults import KNOWN_PAGE_KEYS

GOALS = (
    "sell_courses",
    "run_live_classes",
    "in_person_events",
    "sell_downloads",
    "email_marketing",
    "build_community",
)

THEMES = ("ocean", "ember", "forest", "sunset", "violet", "slate")

# First entry = the niche module's own theme (demo_data/<niche>.py CONFIG),
# then two curated complements. The wizard shows these three first.
THEME_RANKING = {
    "yoga": ("forest", "slate", "violet"),
    "pilates": ("slate", "ocean", "forest"),
    "fitness": ("ember", "ocean", "slate"),
    "pole_dance": ("violet", "sunset", "slate"),
    "belly_dance": ("sunset", "violet", "ember"),
    "face_yoga": ("sunset", "forest", "violet"),
    "makeup": ("violet", "sunset", "slate"),
    "general": ("ocean", "forest", "slate"),
}

# Wizard font ids -> the TenantConfig.font_family value stored. All three
# families already ship via niche modules, so the customer frontend renders
# them today.
FONTS = {
    "inter": "Inter",
    "nunito": "Nunito",
    "playfair": "Playfair Display",
}

_RECOMMENDED_FONT = {
    "yoga": "Nunito",
    "face_yoga": "Nunito",
    "belly_dance": "Playfair Display",
    "pole_dance": "Playfair Display",
    "makeup": "Playfair Display",
}

NAVBAR_LAYOUTS = ("classic", "centered", "minimal")  # wizard subset of the 5 presets

HERO_STYLES = ("centered", "split", "minimal")  # == hero block "layout" enum

LOGO_MODES = ("wordmark", "curated")  # "ai" arrives in phase 3

# Per-page layout options. "blocks" is the block-TYPE sequence the layout
# seeds (compose.py builds the actual block dicts); the frontend draws its
# thumbnail skeletons from the same sequence. First option = recommended.
PAGE_LAYOUTS = {
    "home": (
        {"id": "home-spotlight", "blocks": ("hero", "courseGrid", "testimonials", "cta")},
        {"id": "home-story", "blocks": ("hero", "imageText", "courseGrid", "faq", "cta")},
    ),
    "about": (
        {"id": "about-story", "blocks": ("richText", "imageText")},
        {"id": "about-portrait", "blocks": ("imageText", "testimonials", "cta")},
    ),
    "courses": (
        {"id": "courses-grid", "blocks": ("courseGrid",)},
        {"id": "courses-guided", "blocks": ("richText", "courseGrid", "cta")},
    ),
    "pricing": (
        {"id": "pricing-simple", "blocks": ("pricingPlans",)},
        {"id": "pricing-reassure", "blocks": ("pricingPlans", "faq", "cta")},
    ),
    "faq": (
        {"id": "faq-list", "blocks": ("faq",)},
        {"id": "faq-welcoming", "blocks": ("richText", "faq", "cta")},
    ),
    "contact": (
        {"id": "contact-form", "blocks": ("contact",)},
        {"id": "contact-warm", "blocks": ("richText", "contact")},
    ),
}

# Appended to the home page (after courseGrid) only when the goal is picked.
HOME_GOAL_BLOCKS = (
    {"goal": "run_live_classes", "type": "upcomingEvents"},
    {"goal": "in_person_events", "type": "upcomingEvents"},
    {"goal": "sell_downloads", "type": "storeProducts"},
)

DESCRIPTION_MAX_LEN = 500


def _layout_ids(page: str) -> set[str]:
    return {option["id"] for option in PAGE_LAYOUTS[page]}


def recommended_answers(niche: str) -> dict:
    """Complete default answer set for a niche — what "finish the rest for
    me" and finalize-with-gaps apply. Unknown niches fall back to general."""
    niche = niche if niche in THEME_RANKING else "general"
    return {
        "niche": niche,
        "description": "",
        "goals": ["sell_courses"],
        "theme": THEME_RANKING[niche][0],
        "font_family": _RECOMMENDED_FONT.get(niche, "Inter"),
        "navbar_layout": "classic",
        "hero_style": "centered",
        "page_layouts": {page: options[0]["id"] for page, options in PAGE_LAYOUTS.items()},
        "logo": {"mode": "wordmark", "curated_id": None},
    }


def validate_answers(partial: dict) -> list[str]:
    """Human-readable errors for any invalid key/value; [] = valid.

    Unknown keys are errors, not ignored: the client is generated from this
    catalog, so drift means a bug (or a probe) and must not be stored.
    """
    errors: list[str] = []
    for key, value in partial.items():
        if key == "niche":
            from apps.core.demo.seed_template import available_niches

            if value not in available_niches():
                errors.append(f"unknown niche '{value}'")
        elif key == "description":
            if not isinstance(value, str) or len(value) > DESCRIPTION_MAX_LEN:
                errors.append(f"description must be a string of at most {DESCRIPTION_MAX_LEN} characters")
        elif key == "goals":
            if not isinstance(value, list) or not all(isinstance(g, str) and g in GOALS for g in value):
                errors.append("goals must be a list of known goal keys")
        elif key == "theme":
            if value not in THEMES:
                errors.append(f"unknown theme '{value}'")
        elif key == "font_family":
            if value not in FONTS.values():
                errors.append(f"unknown font '{value}'")
        elif key == "navbar_layout":
            if value not in NAVBAR_LAYOUTS:
                errors.append(f"unknown navbar layout '{value}'")
        elif key == "hero_style":
            if value not in HERO_STYLES:
                errors.append(f"unknown hero style '{value}'")
        elif key == "page_layouts":
            if not isinstance(value, dict):
                errors.append("page_layouts must be an object")
                continue
            for page, layout_id in value.items():
                if page not in KNOWN_PAGE_KEYS:
                    errors.append(f"unknown page '{page}'")
                elif layout_id not in _layout_ids(page):
                    errors.append(f"unknown layout '{layout_id}' for page '{page}'")
        elif key == "logo":
            if not isinstance(value, dict) or value.get("mode") not in LOGO_MODES:
                errors.append("logo.mode must be one of: " + ", ".join(LOGO_MODES))
            elif value.get("mode") == "curated" and not isinstance(value.get("curated_id"), int):
                errors.append("logo.curated_id must be an integer for curated mode")
            elif value.get("curated_id") is not None and not isinstance(value.get("curated_id"), int):
                errors.append("logo.curated_id must be an integer or null")
        else:
            errors.append(f"unknown answer key '{key}'")
    return errors


def catalog_payload() -> dict:
    """JSON-safe catalog served by GET /api/v1/onboarding/wizard/catalog/."""
    from apps.core.demo.seed_template import available_niches

    return {
        "niches": available_niches(),
        "goals": list(GOALS),
        "themes": list(THEMES),
        "theme_ranking": {niche: list(ranked) for niche, ranked in THEME_RANKING.items()},
        "fonts": dict(FONTS),
        "navbar_layouts": list(NAVBAR_LAYOUTS),
        "hero_styles": list(HERO_STYLES),
        "logo_modes": list(LOGO_MODES),
        "page_layouts": {
            page: [{"id": o["id"], "blocks": list(o["blocks"])} for o in options]
            for page, options in PAGE_LAYOUTS.items()
        },
        "home_goal_blocks": [dict(b) for b in HOME_GOAL_BLOCKS],
        "description_max_len": DESCRIPTION_MAX_LEN,
        "recommended": recommended_answers("general"),
    }
```

Create `backend/apps/core/onboarding/wizard.py`:

```python
"""Pre-provision onboarding wizard endpoints.

Auth model: the wizard token (or a still-valid signup token) travels in the
request BODY, like every other onboarding endpoint — no JWT exists yet.
Public views MUST keep @authentication_classes([]) (project rule).
"""

import logging

from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from . import wizard_catalog

logger = logging.getLogger(__name__)


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_catalog_view(request):
    """Option sets for the wizard UI. Public + cacheable: ids only, no PII."""
    return Response(wizard_catalog.catalog_payload())
```

In `backend/apps/core/onboarding/urls.py`, add the import and route:

```python
from .wizard import wizard_catalog_view
```

and inside `urlpatterns`:

```python
    path("wizard/catalog/", wizard_catalog_view, name="wizard-catalog"),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_catalog.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/onboarding/wizard_catalog.py backend/apps/core/onboarding/wizard.py backend/apps/core/onboarding/urls.py backend/apps/core/tests/test_wizard_catalog.py
git commit -m "feat(onboarding): wizard option catalog + public catalog endpoint

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Wizard state read/save endpoint + wizard token in verify response

**Files:**
- Modify: `backend/apps/core/onboarding/wizard.py`
- Modify: `backend/apps/core/onboarding/urls.py`
- Modify: `backend/apps/core/onboarding/views.py` (`creator_signup_verify` — both return paths)
- Test: `backend/apps/core/tests/test_wizard_state_endpoints.py` (extend from Task 2)

**Interfaces:**
- Consumes: `verify_wizard_token`/`create_wizard_token` (Task 1), `Tenant.wizard_state` (Task 2), `wizard_catalog.validate_answers` (Task 3).
- Produces:
  - `POST /api/v1/onboarding/wizard/state/` `{token}` → `{slug, status, template_status, has_paid_platform_plan, state}`.
  - `PATCH /api/v1/onboarding/wizard/state/` `{token, answers?, current_step?, finished_rest_for_me?}` → same body after merge-save. 400 `{"detail": "invalid_answers", "errors": [...]}` on bad values; 409 `{"detail": "wizard_closed"}` once provisioning/seeding started.
  - `creator_signup_verify` response gains `"wizard_token": <7-day token>` (both new-tenant and idempotent-re-verify paths).
  - Module-level `_resolve_tenant_from_wizard_token(request)` in `wizard.py` — Task 6 reuses it.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/core/tests/test_wizard_state_endpoints.py`:

```python
def _read(token):
    return _client().post("/api/v1/onboarding/wizard/state/", {"token": token}, format="json")


def _patch(token, **body):
    return _client().patch("/api/v1/onboarding/wizard/state/", {"token": token, **body}, format="json")


def test_read_state_empty(tenant):
    resp = _read(_token())
    assert resp.status_code == 200, resp.content
    data = resp.json()
    assert data["slug"] == "wiz-studio"
    assert data["state"] == {}
    assert data["has_paid_platform_plan"] is False


def test_patch_merges_answers_and_stamps(tenant):
    resp = _patch(_token(), answers={"niche": "yoga"}, current_step="business.describe")
    assert resp.status_code == 200, resp.content
    resp2 = _patch(_token(), answers={"theme": "forest"})
    state = resp2.json()["state"]
    assert state["answers"] == {"niche": "yoga", "theme": "forest"}
    assert state["current_step"] == "business.describe"
    assert set(state["step_timestamps"]) == {"niche", "theme"}
    tenant.refresh_from_db()
    assert tenant.wizard_state["answers"]["niche"] == "yoga"


def test_patch_rejects_invalid_answers(tenant):
    resp = _patch(_token(), answers={"theme": "neon"})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "invalid_answers"
    tenant.refresh_from_db()
    assert tenant.wizard_state == {}


def test_patch_rejects_unknown_key(tenant):
    assert _patch(_token(), answers={"evil": 1}).status_code == 400


def test_patch_409_once_seeding(tenant):
    tenant.template_seed_status = "seeding"
    tenant.save(update_fields=["template_seed_status"])
    resp = _patch(_token(), answers={"theme": "forest"})
    assert resp.status_code == 409
    assert _read(_token()).status_code == 200  # reads still fine


def test_signup_token_accepted(tenant):
    signup = create_signup_token("coach@x.com", "Coach", "Wiz Studio")
    assert _read(signup).status_code == 200


def test_bad_token_rejected(tenant):
    assert _read("garbage").status_code == 400


def test_verify_response_includes_wizard_token(restore_public):
    from apps.accounts.tokens import verify_wizard_token

    connection.set_schema_to_public()
    signup = create_signup_token("new@x.com", "Coach", "Fresh Studio")
    resp = _client().post("/api/v1/onboarding/signup/verify/", {"token": signup}, format="json")
    assert resp.status_code in (200, 201), resp.content
    wizard_token = resp.json()["wizard_token"]
    assert verify_wizard_token(wizard_token)["purpose"] == "wizard"
    Tenant.objects.filter(slug="fresh-studio").delete()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_state_endpoints.py -v`
Expected: new tests FAIL with 404s (`/wizard/state/` unrouted) and `KeyError: 'wizard_token'`; the Task-2 default test still passes.

- [ ] **Step 3: Implement state view + verify addition**

Append to `backend/apps/core/onboarding/wizard.py`:

```python
def _resolve_tenant_from_wizard_token(request):
    """Wizard-token variant of views._resolve_tenant_from_signup_token.

    Returns (payload, tenant, error_response); exactly one of (tenant, error)
    is None. Accepts wizard tokens and still-valid signup tokens.
    """
    from django.utils.text import slugify

    from apps.accounts.tokens import verify_wizard_token
    from apps.core.i18n_helpers import msg
    from apps.core.models import Tenant

    token = request.data.get("token")
    if not token:
        return None, None, Response({"detail": msg(request, "token_required")}, status=400)
    try:
        payload = verify_wizard_token(token)
    except Exception:
        return None, None, Response({"detail": msg(request, "token_invalid_or_expired")}, status=400)

    region = payload.get("region", "global")
    slug = slugify(payload["brand_name"])[:63]
    try:
        tenant = Tenant.objects.get(slug=slug, region=region)
    except Tenant.DoesNotExist:
        return None, None, Response({"detail": msg(request, "tenant_not_found")}, status=404)
    if tenant.owner_email != payload["email"]:
        return None, None, Response({"detail": "Token does not match tenant owner."}, status=403)
    return payload, tenant, None


def _state_body(tenant) -> dict:
    return {
        "slug": tenant.slug,
        "status": tenant.provisioning_status,
        "template_status": tenant.template_seed_status,
        "has_paid_platform_plan": tenant.has_paid_platform_plan,
        "state": tenant.wizard_state or {},
    }


@api_view(["POST", "PATCH"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_state(request):
    """POST = read current wizard state (resume); PATCH = merge-save answers.

    The token rides in the body for both verbs so it never lands in access
    logs. PATCH is last-write-wins per answer key — fine for a single coach.
    """
    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err is not None:
        return err

    if request.method == "PATCH":
        if tenant.provisioning_status != "pending" or tenant.template_seed_status in ("seeding", "ready", "skipped"):
            return Response({"detail": "wizard_closed"}, status=409)

        answers_in = request.data.get("answers") or {}
        if not isinstance(answers_in, dict):
            return Response({"detail": "answers must be an object."}, status=400)
        errors = wizard_catalog.validate_answers(answers_in)
        if errors:
            return Response({"detail": "invalid_answers", "errors": errors}, status=400)

        from django.utils import timezone

        state = dict(tenant.wizard_state or {})
        state.setdefault("version", 1)
        answers = dict(state.get("answers") or {})
        answers.update(answers_in)
        state["answers"] = answers

        stamps = dict(state.get("step_timestamps") or {})
        now = timezone.now().isoformat()
        for key in answers_in:
            stamps[key] = now
        state["step_timestamps"] = stamps

        current_step = request.data.get("current_step")
        if isinstance(current_step, str) and 0 < len(current_step) <= 40:
            state["current_step"] = current_step
        if isinstance(request.data.get("finished_rest_for_me"), bool):
            state["finished_rest_for_me"] = request.data["finished_rest_for_me"]

        tenant.wizard_state = state
        tenant.save(update_fields=["wizard_state"])
        logger.info("wizard state saved slug=%s keys=%s", tenant.slug, sorted(answers_in))

    return Response(_state_body(tenant))
```

In `backend/apps/core/onboarding/urls.py` extend the wizard import and routes:

```python
from .wizard import wizard_catalog_view, wizard_state
```

```python
    path("wizard/state/", wizard_state, name="wizard-state"),
```

In `backend/apps/core/onboarding/views.py` → `creator_signup_verify`: add the wizard token to BOTH return paths. After `slug = slugify(brand_name)[:63]` (line ~169) add:

```python
    from apps.accounts.tokens import create_wizard_token

    wizard_token = create_wizard_token(email, payload.get("name", ""), brand_name, region=region)
```

Then add `"wizard_token": wizard_token,` to the dict of the existing-tenant early `return Response({...})` and to the final `201` response dict.

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_state_endpoints.py apps/core/tests/test_onboarding_handoff.py -v`
Expected: all PASS (handoff suite proves the shared onboarding flow is untouched).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/onboarding/wizard.py backend/apps/core/onboarding/urls.py backend/apps/core/onboarding/views.py backend/apps/core/tests/test_wizard_state_endpoints.py
git commit -m "feat(onboarding): wizard state endpoint + wizard token in verify response

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: `compose.py` — answers → TenantConfig values

**Files:**
- Create: `backend/apps/core/onboarding/compose.py`
- Test: `backend/apps/core/tests/test_wizard_compose.py` (create)

**Interfaces:**
- Consumes: `wizard_catalog.PAGE_LAYOUTS/HOME_GOAL_BLOCKS/GOALS` (Task 3); the seeder-merged `landing_sections` dict shape (`hero.headline/subheadline/cta_text/cta_href/bg_image_url/bg_image_photo_id`, `about.heading/body/image_url/image_photo_id`, `testimonials.items[]`, `faq.items[]`, `cta.heading/button_text/button_href` — see `apps/tenant_config/defaults.pages_from_landing_sections`).
- Produces: `build_config_overrides(answers: dict, *, brand_name: str, landing_sections: dict, locale: str = "en") -> dict` with exactly the keys `theme, font_family, navbar_config, enabled_modules, pages`. Task 7 applies it; Task 8 adds `apply_wizard_logo` to this module.
- Module policy: `courses`, `billing`, `pages`, `analytics` are ALWAYS enabled (platform core; the setup assistant expects them); goals add `live` / `downloads` / `campaigns` / `community`.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/core/tests/test_wizard_compose.py`:

```python
import pytest

from apps.core.onboarding.compose import build_config_overrides
from apps.tenant_config.defaults import KNOWN_BLOCK_TYPES, KNOWN_PAGE_KEYS

SECTIONS = {
    "hero": {
        "headline": "Find Your Balance",
        "subheadline": "Guided practice for every level.",
        "cta_text": "Start Your Practice",
        "cta_href": "/courses",
        "bg_image_url": "demo/photos/yoga_6.jpg",
        "bg_image_photo_id": "42",
    },
    "about": {
        "heading": "About Me",
        "body": "Twelve years of teaching.",
        "image_url": "demo/photos/yoga_7.jpg",
        "image_photo_id": "43",
    },
    "testimonials": {"items": [{"name": "Priya", "text": "Changed my life.", "avatar_url": ""}]},
    "faq": {"items": [{"q": "Do I need experience?", "a": "No."}]},
    "cta": {"heading": "Ready to begin?", "button_text": "Join Now", "button_href": "/courses"},
}


def _build(answers=None, locale="en"):
    return build_config_overrides(
        answers or {}, brand_name="Glow Studio", landing_sections=SECTIONS, locale=locale
    )


def test_returns_exactly_the_override_keys():
    assert set(_build()) == {"theme", "font_family", "navbar_config", "enabled_modules", "pages"}


def test_all_pages_present_with_known_types_and_unique_ids():
    pages = _build()["pages"]
    assert set(pages) == set(KNOWN_PAGE_KEYS)
    for page in pages.values():
        types = [b["type"] for b in page["blocks"]]
        ids = [b["id"] for b in page["blocks"]]
        assert set(types) <= KNOWN_BLOCK_TYPES
        assert len(ids) == len(set(ids))
        assert all("style" not in b for b in page["blocks"])  # theme-locked


def test_pages_pass_server_validation():
    from apps.tenant_config.serializers import TenantConfigSerializer

    # The write-side gate every coach save goes through must accept our seeds.
    TenantConfigSerializer().validate_pages(_build()["pages"])


def test_design_answers_applied():
    over = _build({"theme": "forest", "font_family": "Nunito", "navbar_layout": "minimal"})
    assert over["theme"] == "forest"
    assert over["font_family"] == "Nunito"
    assert over["navbar_config"]["layout"] == "minimal"


@pytest.mark.parametrize(
    ("goals", "expect_modules", "expect_hrefs", "absent_hrefs"),
    [
        ([], [], ["/courses", "/about", "/faq"], ["/events", "/store", "/plans"]),
        (["run_live_classes"], ["live"], ["/events"], ["/store", "/plans"]),
        (["in_person_events"], ["live"], ["/events"], ["/plans"]),
        (["sell_downloads"], ["downloads"], ["/store", "/plans"], ["/events"]),
        (["sell_courses"], [], ["/plans"], ["/events", "/store"]),
        (["email_marketing"], ["campaigns"], [], ["/events", "/store", "/plans"]),
        (["build_community"], ["community"], [], ["/events", "/store", "/plans"]),
    ],
)
def test_goal_matrix(goals, expect_modules, expect_hrefs, absent_hrefs):
    over = _build({"goals": goals})
    for module in ["courses", "billing", "pages", "analytics", *expect_modules]:
        assert module in over["enabled_modules"], module
    hrefs = [link["href"] for link in over["navbar_config"]["links"]]
    for href in expect_hrefs:
        assert href in hrefs, href
    for href in absent_hrefs:
        assert href not in hrefs, href


def test_home_goal_blocks_appended_once():
    over = _build({"goals": ["run_live_classes", "in_person_events", "sell_downloads"]})
    types = [b["type"] for b in over["pages"]["home"]["blocks"]]
    assert types.count("upcomingEvents") == 1  # both live goals -> one block
    assert types.count("storeProducts") == 1


def test_hero_style_and_photo_harvest():
    split = _build({"hero_style": "split"})["pages"]["home"]["blocks"][0]
    assert split["layout"] == "split"
    assert split["heading"] == "Find Your Balance"
    assert split["bgImage"]["photo_id"] == "42"
    minimal = _build({"hero_style": "minimal"})["pages"]["home"]["blocks"][0]
    assert minimal["layout"] == "minimal"
    assert minimal["bgImage"] == {"url": None, "photo_id": None}


def test_home_story_layout_sequence():
    over = _build({"page_layouts": {"home": "home-story"}})
    assert [b["type"] for b in over["pages"]["home"]["blocks"]] == [
        "hero", "imageText", "courseGrid", "faq", "cta",
    ]


def test_tr_locale_writes_turkish_content():
    over = _build({"goals": ["sell_courses"]}, locale="tr")
    labels = [link["label"] for link in over["navbar_config"]["links"]]
    assert "Kurslar" in labels
    assert over["navbar_config"]["cta"]["text"] == "Hemen Başla"
    assert over["pages"]["pricing"]["blocks"][0]["heading"] == "Planlar ve Fiyatlar"


def test_empty_answers_still_valid():
    over = _build({})
    assert over["theme"] == "ocean"
    assert over["navbar_config"]["layout"] == "classic"
    assert len(over["pages"]["home"]["blocks"]) >= 3
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_compose.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'apps.core.onboarding.compose'`.

- [ ] **Step 3: Implement compose.py**

Create `backend/apps/core/onboarding/compose.py`:

```python
"""Turn wizard answers into TenantConfig field values.

Called by provision_tenant AFTER the niche seeder ran: the seeder-merged
``landing_sections`` (niche copy + injected photo ids) is the raw material,
and everything returned here deliberately overrides what the seeder wrote.
Pure dict-in/dict-out; ``apply_wizard_logo`` (Task 8) is this module's only
model-touching function.

The strings below are tenant CONTENT (coach-editable after provisioning),
not UI chrome — that's why they live here and not in a frontend message
catalog. TR needs native review, same caveat as the signup email strings.
"""

from __future__ import annotations

from . import wizard_catalog

COPY = {
    "en": {
        "nav_courses": "Courses",
        "nav_events": "Events",
        "nav_store": "Store",
        "nav_pricing": "Pricing",
        "nav_about": "About",
        "nav_faq": "FAQ",
        "cta": "Get Started",
        "featured_courses": "Featured Courses",
        "all_courses": "All Courses",
        "events_heading": "Upcoming Events",
        "store_heading": "Downloads & Resources",
        "testimonials_heading": "What students say",
        "faq_heading": "Frequently asked questions",
        "cta_heading": "Ready to start learning?",
        "cta_button": "Join Now",
        "plans_heading": "Plans & Pricing",
        "plans_subheading": "Choose a plan that fits your goals.",
        "about_heading": "About",
        "intro_heading": "Welcome",
        "intro_body": "Take a look around and find what fits you.",
        "contact_heading": "Get in touch",
        "contact_intro": "Have a question? Send us a message.",
        "contact_submit": "Send message",
        "contact_success": "Thanks! We'll get back to you soon.",
    },
    "tr": {
        "nav_courses": "Kurslar",
        "nav_events": "Etkinlikler",
        "nav_store": "Mağaza",
        "nav_pricing": "Planlar",
        "nav_about": "Hakkımda",
        "nav_faq": "SSS",
        "cta": "Hemen Başla",
        "featured_courses": "Öne Çıkan Kurslar",
        "all_courses": "Tüm Kurslar",
        "events_heading": "Yaklaşan Etkinlikler",
        "store_heading": "İndirilebilir Kaynaklar",
        "testimonials_heading": "Öğrenciler ne diyor",
        "faq_heading": "Sıkça sorulan sorular",
        "cta_heading": "Başlamaya hazır mısın?",
        "cta_button": "Hemen Katıl",
        "plans_heading": "Planlar ve Fiyatlar",
        "plans_subheading": "Hedeflerine uygun bir plan seç.",
        "about_heading": "Hakkımda",
        "intro_heading": "Hoş geldin",
        "intro_body": "Etrafa göz at ve sana uygun olanı bul.",
        "contact_heading": "İletişime geç",
        "contact_intro": "Bir sorun mu var? Bize mesaj gönder.",
        "contact_submit": "Mesaj gönder",
        "contact_success": "Teşekkürler! En kısa sürede dönüş yapacağız.",
    },
}

# courses/billing/pages/analytics are platform core — always on (the setup
# assistant and the default admin nav assume them). Goals add the rest.
ALWAYS_MODULES = ("analytics", "billing", "courses", "pages")
GOAL_MODULES = {
    "run_live_classes": ("live",),
    "in_person_events": ("live",),
    "sell_downloads": ("downloads",),
    "email_marketing": ("campaigns",),
    "build_community": ("community",),
}


def _t(locale: str) -> dict:
    return COPY["tr" if locale == "tr" else "en"]


def _img(url=None, photo_id=None) -> dict:
    return {"url": url or None, "photo_id": str(photo_id) if photo_id else None}


def build_config_overrides(answers: dict, *, brand_name: str, landing_sections: dict, locale: str = "en") -> dict:
    answers = answers or {}
    sections = landing_sections or {}
    goals = [g for g in (answers.get("goals") or []) if g in wizard_catalog.GOALS]
    copy = _t(locale)

    links = [{"label": copy["nav_courses"], "href": "/courses"}]
    if "run_live_classes" in goals or "in_person_events" in goals:
        links.append({"label": copy["nav_events"], "href": "/events"})
    if "sell_downloads" in goals:
        links.append({"label": copy["nav_store"], "href": "/store"})
    if "sell_courses" in goals or "sell_downloads" in goals:
        links.append({"label": copy["nav_pricing"], "href": "/plans"})
    links.append({"label": copy["nav_about"], "href": "/about"})
    links.append({"label": copy["nav_faq"], "href": "/faq"})

    modules = set(ALWAYS_MODULES)
    for goal in goals:
        modules.update(GOAL_MODULES.get(goal, ()))

    return {
        "theme": answers.get("theme") or "ocean",
        "font_family": answers.get("font_family") or "Inter",
        "navbar_config": {
            "links": links,
            "cta": {"text": copy["cta"], "href": "/courses"},
            "show_login": True,
            "layout": answers.get("navbar_layout") or "classic",
        },
        "enabled_modules": sorted(modules),
        "pages": _build_pages(answers, brand_name=brand_name, sections=sections, goals=goals, copy=copy),
    }


# --- page builders -----------------------------------------------------------


def _hero(answers, brand_name, sections) -> dict:
    hero = sections.get("hero") or {}
    style = answers.get("hero_style") or "centered"
    if style == "minimal":
        bg = _img()
    else:
        bg = _img(hero.get("bg_image_url"), hero.get("bg_image_photo_id"))
    welcome = f"Welcome to {brand_name}" if brand_name else "Welcome"
    return {
        "id": "blk_hero",
        "type": "hero",
        "enabled": True,
        "layout": style,
        "heading": hero.get("headline") or welcome,
        "subheading": hero.get("subheadline") or "",
        "ctaText": hero.get("cta_text") or "",
        "ctaHref": hero.get("cta_href") or "/courses",
        "bgImage": bg,
        "overlay": "dark",
        "overlayStrength": "medium",
    }


def _about_image_text(sections, copy, block_id="blk_about") -> dict:
    about = sections.get("about") or {}
    return {
        "id": block_id,
        "type": "imageText",
        "enabled": True,
        "heading": about.get("heading") or copy["about_heading"],
        "body": about.get("body") or "",
        "image": _img(about.get("image_url"), about.get("image_photo_id")),
        "imagePosition": "right",
    }


def _course_grid(copy, heading_key, block_id="blk_courses") -> dict:
    return {"id": block_id, "type": "courseGrid", "enabled": True, "heading": copy[heading_key]}


def _testimonials(sections, copy) -> dict:
    items = [
        {"name": it.get("name", ""), "text": it.get("text", ""), "avatar": _img(it.get("avatar_url"), it.get("avatar_photo_id"))}
        for it in (sections.get("testimonials") or {}).get("items", [])
        if isinstance(it, dict)
    ]
    return {
        "id": "blk_testimonials",
        "type": "testimonials",
        "enabled": bool(items),
        "heading": (sections.get("testimonials") or {}).get("heading") or copy["testimonials_heading"],
        "items": items,
    }


def _faq(sections, copy, block_id="blk_faq") -> dict:
    items = [
        {"q": it.get("q", ""), "a": it.get("a", "")}
        for it in (sections.get("faq") or {}).get("items", [])
        if isinstance(it, dict)
    ]
    return {"id": block_id, "type": "faq", "enabled": True, "heading": copy["faq_heading"], "items": items}


def _cta(sections, copy, block_id="blk_cta") -> dict:
    cta = sections.get("cta") or {}
    return {
        "id": block_id,
        "type": "cta",
        "enabled": True,
        "heading": cta.get("heading") or copy["cta_heading"],
        "buttonText": cta.get("button_text") or copy["cta_button"],
        "buttonHref": cta.get("button_href") or "/courses",
    }


def _intro(copy, block_id="blk_intro") -> dict:
    return {"id": block_id, "type": "richText", "enabled": True, "heading": copy["intro_heading"], "body": copy["intro_body"]}


def _goal_blocks(goals, copy) -> list[dict]:
    blocks, seen = [], set()
    for entry in wizard_catalog.HOME_GOAL_BLOCKS:
        if entry["goal"] in goals and entry["type"] not in seen:
            seen.add(entry["type"])
            heading = copy["events_heading"] if entry["type"] == "upcomingEvents" else copy["store_heading"]
            blocks.append({"id": f"blk_{entry['type'].lower()}", "type": entry["type"], "enabled": True, "heading": heading})
    return blocks


def _build_pages(answers, *, brand_name, sections, goals, copy) -> dict:
    chosen = answers.get("page_layouts") or {}

    def layout(page):
        wanted = chosen.get(page)
        valid = {o["id"] for o in wizard_catalog.PAGE_LAYOUTS[page]}
        return wanted if wanted in valid else wizard_catalog.PAGE_LAYOUTS[page][0]["id"]

    home = [_hero(answers, brand_name, sections)]
    if layout("home") == "home-story":
        home += [_about_image_text(sections, copy), _course_grid(copy, "featured_courses"), *_goal_blocks(goals, copy), _faq(sections, copy), _cta(sections, copy)]
    else:  # home-spotlight
        home += [_course_grid(copy, "featured_courses"), *_goal_blocks(goals, copy), _testimonials(sections, copy), _cta(sections, copy)]

    if layout("about") == "about-portrait":
        about = [_about_image_text(sections, copy, "blk_about_bio"), _testimonials(sections, copy), _cta(sections, copy)]
    else:  # about-story
        about = [_intro(copy, "blk_about_intro"), _about_image_text(sections, copy, "blk_about_bio")]

    courses = [_course_grid(copy, "all_courses", "blk_courses_grid")]
    if layout("courses") == "courses-guided":
        courses = [_intro(copy), *courses, _cta(sections, copy)]

    pricing = [{
        "id": "blk_pricing_plans",
        "type": "pricingPlans",
        "enabled": True,
        "heading": copy["plans_heading"],
        "subheading": copy["plans_subheading"],
    }]
    if layout("pricing") == "pricing-reassure":
        pricing += [_faq(sections, copy, "blk_pricing_faq"), _cta(sections, copy, "blk_pricing_cta")]

    faq_page = [_faq(sections, copy)]
    if layout("faq") == "faq-welcoming":
        faq_page = [_intro(copy), *faq_page, _cta(sections, copy)]

    contact_block = {
        "id": "blk_contact",
        "type": "contact",
        "enabled": True,
        "heading": copy["contact_heading"],
        "intro": copy["contact_intro"],
        "submitLabel": copy["contact_submit"],
        "successMessage": copy["contact_success"],
    }
    contact = [contact_block]
    if layout("contact") == "contact-warm":
        contact = [_intro(copy), contact_block]

    return {
        "home": {"blocks": home},
        "about": {"blocks": about},
        "courses": {"blocks": courses},
        "pricing": {"blocks": pricing},
        "faq": {"blocks": faq_page},
        "contact": {"blocks": contact},
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_compose.py -v`
Expected: all PASS. If `test_pages_pass_server_validation` fails, fix compose output (never widen the serializer).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/onboarding/compose.py backend/apps/core/tests/test_wizard_compose.py
git commit -m "feat(onboarding): compose wizard answers into TenantConfig overrides

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Finalize endpoint (defaults-fill + enqueue provisioning)

**Files:**
- Modify: `backend/apps/core/onboarding/wizard.py`
- Modify: `backend/apps/core/onboarding/urls.py`
- Test: `backend/apps/core/tests/test_wizard_finalize.py` (create)

**Interfaces:**
- Consumes: `_resolve_tenant_from_wizard_token` (Task 4), `wizard_catalog.recommended_answers` (Task 3), `provision_tenant.delay` (existing Celery task).
- Produces: `POST /api/v1/onboarding/wizard/finalize/` `{token}` → 202 `{slug, status: "pending", template_status: "seeding"}` (or 200 echo when already finalized). Side effects: `wizard_state.answers` gap-filled with recommended defaults, `template_niche`/`template_goals` synced, `template_seed_status="seeding"`, `provision_tenant.delay(tenant.id, email, name, niche)` enqueued exactly once.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/core/tests/test_wizard_finalize.py`:

```python
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
    return create_wizard_token("coach@x.com", "Coach", "Fin Studio")


@pytest.fixture()
def tenant(restore_public):
    connection.set_schema_to_public()
    original = Tenant.auto_create_schema
    Tenant.auto_create_schema = False
    try:
        t, _ = Tenant.objects.get_or_create(
            schema_name="fin_studio",
            defaults={
                "name": "Fin Studio",
                "slug": "fin-studio",
                "subdomain": "fin-studio",
                "owner_email": "coach@x.com",
            },
        )
        t.provisioning_status = "pending"
        t.template_seed_status = "pending"
        t.wizard_state = {}
        t.template_niche = ""
        t.template_goals = []
        t.save()
    finally:
        Tenant.auto_create_schema = original
    yield t
    connection.set_schema_to_public()
    Tenant.objects.filter(schema_name="fin_studio").delete()


@pytest.fixture()
def delay(monkeypatch):
    calls = []
    monkeypatch.setattr(
        "apps.core.tasks.provision_tenant.delay",
        lambda *args, **kwargs: calls.append(args),
    )
    return calls


def _finalize():
    return _client().post("/api/v1/onboarding/wizard/finalize/", {"token": _token()}, format="json")


def test_finalize_fills_defaults_and_enqueues(tenant, delay):
    tenant.wizard_state = {"answers": {"niche": "yoga", "theme": "slate"}}
    tenant.save(update_fields=["wizard_state"])

    resp = _finalize()
    assert resp.status_code == 202, resp.content

    tenant.refresh_from_db()
    answers = tenant.wizard_state["answers"]
    assert answers["theme"] == "slate"  # explicit answer preserved
    assert answers["font_family"] == "Nunito"  # yoga recommendation filled
    assert set(answers["page_layouts"]) == {"home", "about", "courses", "pricing", "faq", "contact"}
    assert answers["logo"]["mode"] == "wordmark"
    assert tenant.template_niche == "yoga"
    assert tenant.template_goals == ["sell_courses"]
    assert tenant.template_seed_status == "seeding"
    assert len(delay) == 1
    assert delay[0][0] == tenant.id
    assert delay[0][3] == "yoga"


def test_finalize_without_answers_uses_general(tenant, delay):
    resp = _finalize()
    assert resp.status_code == 202
    tenant.refresh_from_db()
    assert tenant.template_niche == "general"
    assert delay[0][3] == "general"


def test_finalize_idempotent(tenant, delay):
    assert _finalize().status_code == 202
    resp2 = _finalize()
    assert resp2.status_code == 200
    assert resp2.json()["template_status"] == "seeding"
    assert len(delay) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_finalize.py -v`
Expected: FAIL — 404 (`wizard/finalize/` unrouted).

- [ ] **Step 3: Implement finalize**

Append to `backend/apps/core/onboarding/wizard.py`:

```python
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_finalize(request):
    """"Create my platform": fill unanswered steps with recommended defaults,
    sync the legacy template fields, and enqueue provisioning. Idempotent —
    a second call is a cheap status echo, never a second enqueue."""
    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err is not None:
        return err

    if tenant.template_seed_status in ("seeding", "ready", "skipped") or tenant.provisioning_status != "pending":
        return Response(
            {"slug": tenant.slug, "status": tenant.provisioning_status, "template_status": tenant.template_seed_status}
        )

    state = dict(tenant.wizard_state or {})
    answers = dict(state.get("answers") or {})
    defaults = wizard_catalog.recommended_answers(answers.get("niche") or "general")
    merged = {**defaults, **answers}
    merged["page_layouts"] = {**defaults["page_layouts"], **(answers.get("page_layouts") or {})}
    state["answers"] = merged
    state.setdefault("version", 1)

    tenant.wizard_state = state
    tenant.template_niche = merged["niche"]
    tenant.template_goals = list(merged.get("goals") or [])[:20]
    tenant.template_seed_status = "seeding"
    tenant.save(update_fields=["wizard_state", "template_niche", "template_goals", "template_seed_status"])

    from ..tasks import provision_tenant

    provision_tenant.delay(tenant.id, payload["email"], payload.get("name", ""), merged["niche"])
    logger.info("wizard finalized slug=%s niche=%s goals=%s", tenant.slug, merged["niche"], tenant.template_goals)
    return Response({"slug": tenant.slug, "status": "pending", "template_status": "seeding"}, status=202)
```

In `backend/apps/core/onboarding/urls.py` extend the wizard import and add:

```python
    path("wizard/finalize/", wizard_finalize, name="wizard-finalize"),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_finalize.py -v`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/onboarding/wizard.py backend/apps/core/onboarding/urls.py backend/apps/core/tests/test_wizard_finalize.py
git commit -m "feat(onboarding): wizard finalize endpoint with recommended-default fill

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Apply wizard answers in `provision_tenant`

**Files:**
- Modify: `backend/apps/core/tasks.py`
- Test: `backend/apps/core/tests/test_wizard_provision.py` (create)

**Interfaces:**
- Consumes: `build_config_overrides` (Task 5), `Tenant.wizard_state` (Task 2), `CommunitySettings.load()` (`apps/community/models.py` — tenant-schema singleton, `is_enabled` is the real community gate; the `enabled_modules` entry is inert).
- Produces: `_apply_wizard_answers(tenant, answers, preferred_locale)` in `tasks.py`, called after seeding for any tenant whose `wizard_state.answers` is non-empty. Task 8 adds the logo line inside it. Legacy tenants (empty `wizard_state`) provision byte-for-byte as today.
- Ordering rule (the reason this works): the niche seeder still runs first and merges niche CONFIG (theme/navbar/landing_sections→pages); the wizard overlay then OVERWRITES `theme/font_family/navbar_config/enabled_modules/pages`, harvesting niche copy + photo ids from the seeder's `landing_sections`.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/core/tests/test_wizard_provision.py`:

```python
"""Integration: provision_tenant consumes wizard_state.

Heavy tests — each provisions a real tenant schema + runs the yoga seeder.
Kept to three cases; everything unit-testable lives in test_wizard_compose.
"""

import pytest
from django.db import connection
from django_tenants.utils import tenant_context

from apps.core.models import Tenant
from apps.core.tasks import provision_tenant

pytestmark = pytest.mark.django_db(transaction=True)

WIZARD_ANSWERS = {
    "niche": "yoga",
    "description": "Vinyasa for busy professionals.",
    "goals": ["sell_courses", "build_community"],
    "theme": "slate",  # deliberately NOT yoga's default (forest) — proves override
    "font_family": "Inter",
    "navbar_layout": "minimal",
    "hero_style": "split",
    "page_layouts": {"home": "home-story", "about": "about-story", "courses": "courses-grid",
                     "pricing": "pricing-simple", "faq": "faq-list", "contact": "contact-form"},
    "logo": {"mode": "wordmark", "curated_id": None},
}


def _make_tenant(slug, wizard_answers=None):
    connection.set_schema_to_public()
    tenant = Tenant.objects.create(
        schema_name=slug.replace("-", "_"),
        name="Prov Studio",
        slug=slug,
        subdomain=slug,
        owner_email="prov@x.com",
        provisioning_status="pending",
        template_niche="yoga",
        template_seed_status="seeding",
        wizard_state={"answers": wizard_answers} if wizard_answers else {},
    )
    return tenant


def _provision(tenant):
    provision_tenant.apply(args=[tenant.id, "prov@x.com", "Prov Coach", "yoga"])
    tenant.refresh_from_db()
    return tenant


@pytest.fixture()
def cleanup(restore_public):
    created = []
    yield created
    connection.set_schema_to_public()
    for slug in created:
        for t in Tenant.objects.filter(slug=slug):
            t.delete(force_drop=True)


def test_wizard_answers_override_niche_defaults(cleanup):
    cleanup.append("prov-wiz")
    tenant = _provision(_make_tenant("prov-wiz", WIZARD_ANSWERS))
    assert tenant.provisioning_status == "ready"
    assert tenant.template_seed_status == "ready"

    with tenant_context(tenant):
        from apps.community.models import CommunitySettings
        from apps.tenant_config.models import TenantConfig

        config = TenantConfig.objects.first()
        assert config.theme == "slate"
        assert config.font_family == "Inter"
        assert config.navbar_config["layout"] == "minimal"
        hrefs = [link["href"] for link in config.navbar_config["links"]]
        assert "/plans" in hrefs and "/events" not in hrefs and "/store" not in hrefs
        assert "community" in config.enabled_modules
        assert "live" not in config.enabled_modules
        hero = config.pages["home"]["blocks"][0]
        assert hero["type"] == "hero" and hero["layout"] == "split"
        assert hero["bgImage"]["photo_id"]  # harvested from the seeded niche photo
        assert hero["heading"] == "Find Your Balance Through Yoga"  # niche copy kept
        assert [b["type"] for b in config.pages["home"]["blocks"]][:2] == ["hero", "imageText"]
        assert config.onboarding_completed is True
        assert CommunitySettings.load().is_enabled is True
        # Seeded content still there as drafts:
        from apps.courses.models import Course

        assert Course.objects.filter(is_published=False).count() >= 6


def test_legacy_tenant_without_wizard_state_unchanged(cleanup):
    cleanup.append("prov-legacy")
    tenant = _provision(_make_tenant("prov-legacy"))
    with tenant_context(tenant):
        from apps.community.models import CommunitySettings
        from apps.tenant_config.models import TenantConfig

        config = TenantConfig.objects.first()
        assert config.theme == "forest"  # yoga niche default untouched
        assert config.onboarding_completed is False
        assert CommunitySettings.load().is_enabled is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_provision.py -v`
Expected: `test_wizard_answers_override_niche_defaults` FAILS (theme is `forest`, community disabled); the legacy test PASSES already.

- [ ] **Step 3: Implement the overlay in tasks.py**

In `backend/apps/core/tasks.py`, add after `_create_default_config` (module level):

```python
def _apply_wizard_answers(tenant, answers, preferred_locale):
    """Overlay the coach's wizard choices on the freshly-seeded tenant.

    Runs after the niche seeder so the merged landing_sections (niche copy +
    photo ids) are available as raw material — and so these values WIN over
    the niche defaults. Pure overwrites, so a Celery retry is safe.
    """
    from apps.core.onboarding.compose import build_config_overrides
    from apps.tenant_config.models import TenantConfig

    with tenant_context(tenant):
        config = TenantConfig.objects.first()
        if config is None:  # provisioning failed before config; retry will recreate
            return
        overrides = build_config_overrides(
            answers,
            brand_name=config.brand_name,
            landing_sections=config.landing_sections or {},
            locale=preferred_locale,
        )
        for field, value in overrides.items():
            setattr(config, field, value)
        config.onboarding_completed = True
        config.save()

        if "build_community" in (answers.get("goals") or []):
            from apps.community.models import CommunitySettings

            community = CommunitySettings.load()
            if not community.is_enabled:
                community.is_enabled = True
                community.save(update_fields=["is_enabled", "updated_at"])
```

In `provision_tenant`, directly after the `if niche:` seeding block (after its `tenant.save(update_fields=["template_seed_status"])`) and BEFORE `tenant.provisioning_status = "ready"`, add:

```python
        wizard_answers = (tenant.wizard_state or {}).get("answers") or {}
        if wizard_answers:
            _apply_wizard_answers(tenant, wizard_answers, preferred_locale)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_provision.py -v`
Expected: 2 PASS (allow ~1–2 min; real schemas + seeding).

Also run the seeder guardrail suites: `docker compose exec django pytest apps/core/tests/test_demo_data.py apps/core/tests/test_general_template.py apps/core/tests/test_demo_templates_navbar.py -v`
Expected: all PASS (legacy path untouched).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/tasks.py backend/apps/core/tests/test_wizard_provision.py
git commit -m "feat(onboarding): provision_tenant applies wizard answers over niche seed

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Logo apply (wordmark no-op, curated Photo + lockup) + curated `id`

**Files:**
- Modify: `backend/apps/core/curated_logos/views.py` (add `"id"` to each catalog row)
- Modify: `backend/apps/core/onboarding/compose.py` (add `apply_wizard_logo`)
- Modify: `backend/apps/core/tasks.py` (`_apply_wizard_answers` calls it)
- Test: `backend/apps/core/tests/test_wizard_provision.py` (extend) + `backend/apps/core/tests/test_curated_logo_id.py` (create)

**Interfaces:**
- Consumes: `CuratedLogo` model (`apps/core/models.py:554` — public schema; `image_key` under `platform/`), `Photo` (`apps.media.models`, tenant schema), Task 7's `_apply_wizard_answers`.
- Produces: `apply_wizard_logo(config, answers) -> None` in `compose.py` (runs inside `tenant_context`; caller saves). `GET /api/v1/logos/curated/` rows gain `"id": <int>`. Design decisions locked here: **wordmark = store nothing** (the public header already renders the brand name as text when no logo image exists — that IS the wordmark); **curated = tenant `Photo` row pointing at the shared `platform/...` key** (demo-photo precedent — no S3 copy; demo-erase is DB-only so nothing can delete the shared object) **+ `navbar_config.show_brand_name = True`** so mark + brand text form a lockup. No `logo_recipe` is written in phase 1 — the coach can rebuild a full lockup in Logo Studio later.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/core/tests/test_curated_logo_id.py`:

```python
import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.core.models import CuratedLogo

pytestmark = pytest.mark.django_db(transaction=True)


def test_curated_catalog_rows_include_id(restore_public):
    connection.set_schema_to_public()
    row = CuratedLogo.objects.create(
        title="Lotus", prompt="a lotus", tags="yoga",
        image_key="platform/curated-logos/lotus.png", enabled=True,
    )
    try:
        resp = APIClient().get("/api/v1/logos/curated/")
        assert resp.status_code == 200
        match = [r for r in resp.json() if r.get("id") == row.id]
        assert match and match[0]["title"] == "Lotus"
    finally:
        row.delete()
```

Append to `backend/apps/core/tests/test_wizard_provision.py`:

```python
def test_curated_logo_applied_at_provision(cleanup):
    from django.db import connection as conn

    from apps.core.models import CuratedLogo

    conn.set_schema_to_public()
    curated = CuratedLogo.objects.create(
        title="Lotus", prompt="a lotus", tags="yoga",
        image_key="platform/curated-logos/lotus.png", enabled=True,
    )
    cleanup.append("prov-logo")
    answers = {**WIZARD_ANSWERS, "logo": {"mode": "curated", "curated_id": curated.id}}
    try:
        tenant = _provision(_make_tenant("prov-logo", answers))
        with tenant_context(tenant):
            from apps.tenant_config.models import TenantConfig

            config = TenantConfig.objects.first()
            assert config.logo is not None
            assert config.logo.s3_key == "platform/curated-logos/lotus.png"
            assert config.navbar_config["show_brand_name"] is True
    finally:
        conn.set_schema_to_public()
        curated.delete()


def test_wordmark_logo_stores_nothing(cleanup):
    cleanup.append("prov-word")
    tenant = _provision(_make_tenant("prov-word", WIZARD_ANSWERS))  # logo.mode == wordmark
    with tenant_context(tenant):
        from apps.tenant_config.models import TenantConfig

        config = TenantConfig.objects.first()
        assert config.logo is None
        assert config.logo_url == ""
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_curated_logo_id.py apps/core/tests/test_wizard_provision.py -v`
Expected: `test_curated_catalog_rows_include_id` FAILS (no `id` key); `test_curated_logo_applied_at_provision` FAILS (`config.logo is None`); wordmark test PASSES already.

- [ ] **Step 3: Implement**

In `backend/apps/core/curated_logos/views.py`, inside the `out.append({...})` dict, add as the first entry:

```python
                "id": row.id,
```

Append to `backend/apps/core/onboarding/compose.py`:

```python
def apply_wizard_logo(config, answers) -> None:
    """Apply the wizard's logo choice. Runs inside tenant_context; the caller
    saves ``config``.

    wordmark: store nothing — with no logo image the public header renders
    the brand name as text, which IS the wordmark door's promise.
    curated: tenant Photo row pointing at the shared platform/ key (demo-photo
    precedent; no S3 copy, DB-only erase can't orphan it) + show_brand_name
    so mark + brand text form a lockup. Idempotent via the s3_key lookup.
    """
    logo = answers.get("logo") or {}
    if logo.get("mode") != "curated" or not logo.get("curated_id"):
        return

    from django_tenants.utils import schema_context

    from apps.core.models import CuratedLogo

    with schema_context("public"):
        row = CuratedLogo.objects.filter(id=logo["curated_id"], enabled=True).first()
        image_key = row.image_key if row else ""
    if not image_key.startswith("platform/"):
        return

    from apps.media.models import Photo

    photo = Photo.objects.filter(s3_key=image_key).first()
    if photo is None:
        photo = Photo.objects.create(s3_key=image_key, title="Logo")
    config.logo = photo
    config.logo_url = ""
    navbar = dict(config.navbar_config or {})
    navbar["show_brand_name"] = True
    config.navbar_config = navbar
```

In `backend/apps/core/tasks.py` → `_apply_wizard_answers`, extend the compose import and add the call directly before `config.save()`:

```python
    from apps.core.onboarding.compose import apply_wizard_logo, build_config_overrides
```

```python
        apply_wizard_logo(config, answers)
        config.save()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_curated_logo_id.py apps/core/tests/test_wizard_provision.py apps/core/tests/test_curated_logos.py -v`
Expected: all PASS (including the pre-existing curated suite).

- [ ] **Step 5: Run the full backend suite + commit**

Run: `make test`
Expected: 0 failures.

```bash
git add backend/apps/core/curated_logos/views.py backend/apps/core/onboarding/compose.py backend/apps/core/tasks.py backend/apps/core/tests/test_curated_logo_id.py backend/apps/core/tests/test_wizard_provision.py
git commit -m "feat(onboarding): curated/wordmark logo apply at provisioning + curated id

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Wizard client lib — types, API, step machine, theme swatches

Frontend-main has no unit-test runner; frontend tasks verify with `npm run lint` + `npm run build` (tsc runs inside the build), and behavior is locked by the e2e spec in Task 15.

**Files:**
- Create: `frontend-main/src/lib/wizard/types.ts`, `frontend-main/src/lib/wizard/api.ts`, `frontend-main/src/lib/wizard/machine.ts`, `frontend-main/src/lib/wizard/wizard-themes.ts`

**Interfaces:**
- Consumes: backend endpoints from Tasks 3/4/6/8; `ApiError` from `@/types/api` (same idiom as `src/lib/api/onboarding.ts`).
- Produces (imported by Tasks 10–14): `WizardCatalog`, `WizardAnswers`, `WizardState`, `WizardStateResponse`, `CuratedLogoItem`, `StepDef`, `CHAPTERS`; `getWizardCatalog()`, `readWizardState(token)`, `patchWizardState(token, body)`, `finalizeWizard(token)`, `getCuratedLogos()`; `buildSteps(catalog, answers)`, `stepIndex`, `nextStep`, `prevStep`, `progressPct`, `firstUnansweredStep`, `finishRestAnswers`; `THEME_SWATCHES`, `FONT_STACKS`.

- [ ] **Step 1: Write the four modules**

`frontend-main/src/lib/wizard/types.ts`:

```ts
export interface WizardCatalog {
  niches: string[];
  goals: string[];
  themes: string[];
  theme_ranking: Record<string, string[]>;
  fonts: Record<string, string>; // wizard font id -> font_family value
  navbar_layouts: string[];
  hero_styles: string[];
  logo_modes: string[];
  page_layouts: Record<string, { id: string; blocks: string[] }[]>;
  home_goal_blocks: { goal: string; type: string }[];
  description_max_len: number;
  recommended: WizardAnswers;
}

export interface WizardLogoAnswer {
  mode: "wordmark" | "curated";
  curated_id: number | null;
}

export interface WizardAnswers {
  niche?: string;
  description?: string;
  goals?: string[];
  theme?: string;
  font_family?: string;
  navbar_layout?: string;
  hero_style?: string;
  page_layouts?: Record<string, string>;
  logo?: WizardLogoAnswer;
}

export interface WizardState {
  version?: number;
  current_step?: string;
  answers?: WizardAnswers;
  step_timestamps?: Record<string, string>;
  finished_rest_for_me?: boolean;
}

export interface WizardStateResponse {
  slug: string;
  status: string;
  template_status: string;
  has_paid_platform_plan: boolean;
  state: WizardState;
}

export interface CuratedLogoItem {
  id: number;
  title: string;
  filename: string;
  prompt: string;
  tags: string;
  image_url: string;
  mark_paths: unknown;
}
```

`frontend-main/src/lib/wizard/api.ts`:

```ts
/** Wizard API client. Token rides in the BODY (never the URL) — same
 * convention as src/lib/api/onboarding.ts. */

import { ApiError } from "@/types/api";
import type { CuratedLogoItem, WizardAnswers, WizardCatalog, WizardStateResponse } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...init,
  });
  if (!res.ok) {
    let body: unknown = { detail: "Request failed" };
    try {
      body = await res.json();
    } catch {
      // swallow parse failure
    }
    throw new ApiError(res.status, body as Record<string, unknown>);
  }
  return res.json() as Promise<T>;
}

export function getWizardCatalog(): Promise<WizardCatalog> {
  return request("/api/v1/onboarding/wizard/catalog/");
}

export function readWizardState(token: string): Promise<WizardStateResponse> {
  return request("/api/v1/onboarding/wizard/state/", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export interface PatchWizardBody {
  answers?: WizardAnswers;
  current_step?: string;
  finished_rest_for_me?: boolean;
}

export function patchWizardState(token: string, body: PatchWizardBody): Promise<WizardStateResponse> {
  return request("/api/v1/onboarding/wizard/state/", {
    method: "PATCH",
    body: JSON.stringify({ token, ...body }),
  });
}

export function finalizeWizard(token: string): Promise<{ slug: string; status: string; template_status: string }> {
  return request("/api/v1/onboarding/wizard/finalize/", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function getCuratedLogos(): Promise<CuratedLogoItem[]> {
  return request("/api/v1/logos/curated/");
}
```

`frontend-main/src/lib/wizard/machine.ts`:

```ts
/** Pure wizard step machine — no React, no fetch. The server's catalog is
 * the vocabulary; this module only decides ORDER and SKIPPING. */

import type { WizardAnswers, WizardCatalog } from "./types";

export const CHAPTERS = ["business", "look", "pages", "logo", "launch"] as const;
export type ChapterId = (typeof CHAPTERS)[number];

export interface StepDef {
  id: string; // e.g. "business.niche", "pages.home", "review"
  chapter: ChapterId;
}

const PAGE_ORDER = ["home", "about", "courses", "pricing", "faq", "contact"] as const;

const SELLING_GOALS = ["sell_courses", "sell_downloads"];

export function buildSteps(catalog: WizardCatalog, answers: WizardAnswers): StepDef[] {
  const goals = answers.goals ?? [];
  const selling = goals.length === 0 || goals.some((g) => SELLING_GOALS.includes(g));
  const steps: StepDef[] = [
    { id: "business.niche", chapter: "business" },
    { id: "business.describe", chapter: "business" },
    { id: "business.goals", chapter: "business" },
    { id: "look.theme", chapter: "look" },
    { id: "look.font", chapter: "look" },
    { id: "look.navbar", chapter: "look" },
    { id: "look.hero", chapter: "look" },
  ];
  for (const page of PAGE_ORDER) {
    if (page === "pricing" && !selling) continue; // answers matter: no selling -> no pricing step
    if ((catalog.page_layouts[page] ?? []).length < 2) continue;
    steps.push({ id: `pages.${page}`, chapter: "pages" });
  }
  steps.push({ id: "logo", chapter: "logo" });
  steps.push({ id: "review", chapter: "launch" });
  return steps;
}

export function stepIndex(steps: StepDef[], id: string): number {
  const idx = steps.findIndex((s) => s.id === id);
  return idx === -1 ? 0 : idx;
}

export function nextStep(steps: StepDef[], id: string): StepDef | null {
  return steps[stepIndex(steps, id) + 1] ?? null;
}

export function prevStep(steps: StepDef[], id: string): StepDef | null {
  const idx = stepIndex(steps, id);
  return idx > 0 ? steps[idx - 1] : null;
}

/** Endowed progress: verify already "earned" 15%. */
export function progressPct(steps: StepDef[], id: string): number {
  return Math.round(15 + (85 * stepIndex(steps, id)) / Math.max(steps.length - 1, 1));
}

function answered(step: StepDef, answers: WizardAnswers): boolean {
  switch (step.id) {
    case "business.niche":
      return Boolean(answers.niche);
    case "business.describe":
      return answers.description !== undefined;
    case "business.goals":
      return answers.goals !== undefined;
    case "look.theme":
      return Boolean(answers.theme);
    case "look.font":
      return Boolean(answers.font_family);
    case "look.navbar":
      return Boolean(answers.navbar_layout);
    case "look.hero":
      return Boolean(answers.hero_style);
    case "logo":
      return Boolean(answers.logo);
    case "review":
      return false;
    default: {
      const page = step.id.replace("pages.", "");
      return Boolean(answers.page_layouts?.[page]);
    }
  }
}

export function firstUnansweredStep(steps: StepDef[], answers: WizardAnswers): StepDef {
  return steps.find((s) => !answered(s, answers)) ?? steps[steps.length - 1];
}

/** "Finish the rest for me": recommended values for every unanswered design
 * key (niche-aware theme/font), leaving explicit answers untouched. */
export function finishRestAnswers(catalog: WizardCatalog, answers: WizardAnswers): WizardAnswers {
  const rec = catalog.recommended;
  const niche = answers.niche ?? rec.niche ?? "general";
  const ranked = catalog.theme_ranking[niche] ?? catalog.themes;
  const pageLayouts: Record<string, string> = {};
  for (const [page, options] of Object.entries(catalog.page_layouts)) {
    pageLayouts[page] = answers.page_layouts?.[page] ?? options[0].id;
  }
  return {
    description: answers.description ?? "",
    goals: answers.goals ?? rec.goals,
    theme: answers.theme ?? ranked[0],
    font_family: answers.font_family ?? rec.font_family,
    navbar_layout: answers.navbar_layout ?? rec.navbar_layout,
    hero_style: answers.hero_style ?? rec.hero_style,
    page_layouts: pageLayouts,
    logo: answers.logo ?? { mode: "wordmark", curated_id: null },
  };
}
```

`frontend-main/src/lib/wizard/wizard-themes.ts`:

```ts
/** Swatch colors for wizard previews. primary values MIRROR
 * frontend-customer/src/lib/themes.ts primaryHex — keep in sync. */

export const THEME_SWATCHES: Record<string, { primary: string; soft: string; ink: string }> = {
  ocean: { primary: "#1a56db", soft: "#dbeafe", ink: "#0f2f6d" },
  ember: { primary: "#c2410c", soft: "#ffedd5", ink: "#7c2d12" },
  forest: { primary: "#15803d", soft: "#dcfce7", ink: "#14532d" },
  sunset: { primary: "#e11d48", soft: "#ffe4e6", ink: "#881337" },
  violet: { primary: "#7c3aed", soft: "#ede9fe", ink: "#4c1d95" },
  slate: { primary: "#334155", soft: "#e2e8f0", ink: "#0f172a" },
};

export const FONT_STACKS: Record<string, string> = {
  Inter: "var(--font-wizard-inter, 'Inter'), system-ui, sans-serif",
  Nunito: "var(--font-wizard-nunito, 'Nunito'), system-ui, sans-serif",
  "Playfair Display": "var(--font-wizard-playfair, 'Playfair Display'), serif",
};
```

- [ ] **Step 2: Verify build + lint**

Run: `cd frontend-main && npm run lint && npm run build`
Expected: lint clean; build succeeds (modules compile even though unused yet).

- [ ] **Step 3: Commit**

```bash
git add frontend-main/src/lib/wizard/
git commit -m "feat(wizard): client types, API helpers, step machine, theme swatches

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Wizard i18n catalogs + WizardShell + mini-preview components

**Files:**
- Create: `frontend-main/messages/en/wizard.json`, `frontend-main/messages/tr/wizard.json`
- Modify: `frontend-main/src/i18n/request.ts` (add wizard.json to the `Promise.all` import list and merge it like the other four catalogs)
- Create: `frontend-main/src/app/signup/verify/wizard/WizardShell.tsx`, `frontend-main/src/app/signup/verify/wizard/previews.tsx`

**Interfaces:**
- Consumes: `CHAPTERS`, `progressPct` (Task 9); `THEME_SWATCHES`, `FONT_STACKS` (Task 9); visual idioms from `QuestionnaireStep.tsx` (aurora backdrop, slide animations, footer CTA).
- Produces: `<WizardShell chapter progress canBack onBack showFinishRest onFinishRest error footer aside? children />`; preview components `MiniNavbar({layout, theme, font, brand})`, `MiniHero({style, theme, font, brand, headline})`, `MiniPageSketch({blocks, theme})`, `LivePreview({answers, brand, headline})`. i18n namespace `wizard.*` (keys below are the canonical list Tasks 11–14 use via `useTranslations("wizard")`).

- [ ] **Step 1: Create the message catalogs**

`frontend-main/messages/en/wizard.json` (top-level key `wizard`; TR file mirrors every key — translations below):

```json
{
  "wizard": {
    "chapters": { "business": "Your business", "look": "Your look", "pages": "Your pages", "logo": "Your logo", "launch": "Launch" },
    "common": { "back": "Back", "continue": "Continue", "recommended": "Recommended", "finishRest": "Finish the rest for me", "skip": "Skip for now", "saving": "Saving…", "showAll": "Show all", "preview": "Preview", "errors": { "generic": "Something went wrong. Please try again." } },
    "niche": { "heading": "What do you teach?", "subhead": "We'll shape your platform around it." },
    "niches": {
      "yoga": { "label": "Yoga", "tagline": "Flows, breathwork, balance" },
      "pilates": { "label": "Pilates", "tagline": "Core, control, posture" },
      "fitness": { "label": "Fitness", "tagline": "Strength and conditioning" },
      "pole_dance": { "label": "Pole Dance", "tagline": "Power meets grace" },
      "belly_dance": { "label": "Belly Dance", "tagline": "Rhythm and expression" },
      "face_yoga": { "label": "Face Yoga", "tagline": "Natural facial fitness" },
      "makeup": { "label": "Makeup", "tagline": "Techniques and artistry" },
      "general": { "label": "Something else", "tagline": "Your own thing" }
    },
    "describe": { "heading": "Describe what you do", "subhead": "One or two sentences. We'll use your words across your site — you can skip this.", "placeholder": "I help busy professionals build a calm daily practice…" },
    "goals": { "heading": "What will you offer?", "subhead": "Pick everything you plan to do — this shapes your pages and menu.", "items": { "sell_courses": "Sell recorded courses", "run_live_classes": "Run live online classes", "in_person_events": "Host in-person events", "sell_downloads": "Sell downloads & resources", "email_marketing": "Send email campaigns", "build_community": "Build a community" } },
    "theme": { "heading": "Pick your colors", "subhead": "Chosen for your niche — you can change this anytime." },
    "themes": { "ocean": "Ocean", "ember": "Ember", "forest": "Forest", "sunset": "Sunset", "violet": "Violet", "slate": "Slate" },
    "font": { "heading": "Pick your type", "subhead": "How your brand name and headings will read." },
    "fonts": { "inter": { "label": "Inter", "vibe": "Clean & modern" }, "nunito": { "label": "Nunito", "vibe": "Friendly & soft" }, "playfair": { "label": "Playfair Display", "vibe": "Elegant & editorial" } },
    "navbar": { "heading": "Pick your menu style", "subhead": "The header every visitor sees first." },
    "navbarLayouts": { "classic": "Classic", "centered": "Centered", "minimal": "Minimal" },
    "hero": { "heading": "Pick your welcome", "subhead": "The very first screen of your home page." },
    "heroStyles": { "centered": { "label": "Image-led", "desc": "Full-width photo with your headline" }, "split": { "label": "Split", "desc": "Headline beside a photo" }, "minimal": { "label": "Minimal", "desc": "Just your words, no photo" } },
    "pages": { "subhead": "Two looks — pick the one that feels right.", "titles": { "home": "Home page", "about": "About page", "courses": "Courses page", "pricing": "Pricing page", "faq": "FAQ page", "contact": "Contact page" } },
    "layouts": { "home-spotlight": "Spotlight", "home-story": "Storyteller", "about-story": "Story", "about-portrait": "Portrait", "courses-grid": "Clean grid", "courses-guided": "Guided", "pricing-simple": "Simple", "pricing-reassure": "Reassuring", "faq-list": "Straight list", "faq-welcoming": "Welcoming", "contact-form": "Just the form", "contact-warm": "Warm intro" },
    "logo": { "heading": "Your logo", "subhead": "Start simple — you can refine it in the Logo Studio anytime.", "wordmark": { "title": "Wordmark", "desc": "Your brand name, beautifully set" }, "curated": { "title": "Ready-made", "desc": "Pick a mark from our gallery" }, "ai": { "title": "Create with AI", "desc": "Design a custom logo in chat", "locked": "Available after launch on a paid plan" }, "useThis": "Use this", "selected": "Selected" },
    "review": { "heading": "Ready to launch?", "subhead": "Everything below is editable after launch, too.", "create": "Create my platform", "creating": "Creating your platform…", "edit": "Edit", "rows": { "niche": "Niche", "goals": "Offerings", "theme": "Colors", "font": "Type", "navbar": "Menu", "hero": "Welcome", "pages": "Pages", "logo": "Logo", "description": "About you" } }
  }
}
```

`frontend-main/messages/tr/wizard.json` — identical key tree, TR values (needs native review, same caveat as other TR copy):

```json
{
  "wizard": {
    "chapters": { "business": "İşin", "look": "Görünümün", "pages": "Sayfaların", "logo": "Logon", "launch": "Yayına al" },
    "common": { "back": "Geri", "continue": "Devam", "recommended": "Önerilen", "finishRest": "Kalanını benim için tamamla", "skip": "Şimdilik geç", "saving": "Kaydediliyor…", "showAll": "Tümünü göster", "preview": "Önizleme", "errors": { "generic": "Bir şeyler ters gitti. Lütfen tekrar deneyin." } },
    "niche": { "heading": "Ne öğretiyorsun?", "subhead": "Platformunu buna göre şekillendireceğiz." },
    "niches": {
      "yoga": { "label": "Yoga", "tagline": "Akışlar, nefes, denge" },
      "pilates": { "label": "Pilates", "tagline": "Merkez, kontrol, duruş" },
      "fitness": { "label": "Fitness", "tagline": "Güç ve kondisyon" },
      "pole_dance": { "label": "Pole Dance", "tagline": "Güç ve zarafet" },
      "belly_dance": { "label": "Oryantal Dans", "tagline": "Ritim ve ifade" },
      "face_yoga": { "label": "Yüz Yogası", "tagline": "Doğal yüz egzersizi" },
      "makeup": { "label": "Makyaj", "tagline": "Teknik ve sanat" },
      "general": { "label": "Başka bir şey", "tagline": "Kendi alanın" }
    },
    "describe": { "heading": "Ne yaptığını anlat", "subhead": "Bir iki cümle yeter. Sözlerini sitende kullanacağız — geçebilirsin.", "placeholder": "Yoğun çalışan yetişkinlere sakin bir günlük pratik kazandırıyorum…" },
    "goals": { "heading": "Neler sunacaksın?", "subhead": "Planladığın her şeyi seç — sayfalarını ve menünü buna göre kurarız.", "items": { "sell_courses": "Kayıtlı kurs sat", "run_live_classes": "Canlı online ders yap", "in_person_events": "Yüz yüze etkinlik düzenle", "sell_downloads": "İndirilebilir kaynak sat", "email_marketing": "E-posta kampanyaları gönder", "build_community": "Topluluk kur" } },
    "theme": { "heading": "Renklerini seç", "subhead": "Alanına göre önerildi — istediğin zaman değiştirebilirsin." },
    "themes": { "ocean": "Okyanus", "ember": "Kor", "forest": "Orman", "sunset": "Gün batımı", "violet": "Menekşe", "slate": "Arduvaz" },
    "font": { "heading": "Yazı tipini seç", "subhead": "Marka adın ve başlıkların böyle görünecek." },
    "fonts": { "inter": { "label": "Inter", "vibe": "Sade ve modern" }, "nunito": { "label": "Nunito", "vibe": "Samimi ve yumuşak" }, "playfair": { "label": "Playfair Display", "vibe": "Zarif ve dergi tadında" } },
    "navbar": { "heading": "Menü stilini seç", "subhead": "Her ziyaretçinin ilk gördüğü üst bar." },
    "navbarLayouts": { "classic": "Klasik", "centered": "Ortalanmış", "minimal": "Minimal" },
    "hero": { "heading": "Karşılamanı seç", "subhead": "Ana sayfanın ilk ekranı." },
    "heroStyles": { "centered": { "label": "Fotoğraflı", "desc": "Tam genişlik fotoğraf üzerinde başlığın" }, "split": { "label": "İkiye bölünmüş", "desc": "Başlık fotoğrafın yanında" }, "minimal": { "label": "Minimal", "desc": "Sadece sözlerin, fotoğrafsız" } },
    "pages": { "subhead": "İki görünüm — sana uyanı seç.", "titles": { "home": "Ana sayfa", "about": "Hakkında sayfası", "courses": "Kurslar sayfası", "pricing": "Fiyatlandırma sayfası", "faq": "SSS sayfası", "contact": "İletişim sayfası" } },
    "layouts": { "home-spotlight": "Vitrin", "home-story": "Hikâyeci", "about-story": "Hikâye", "about-portrait": "Portre", "courses-grid": "Sade ızgara", "courses-guided": "Rehberli", "pricing-simple": "Sade", "pricing-reassure": "Güven veren", "faq-list": "Düz liste", "faq-welcoming": "Sıcak karşılama", "contact-form": "Sadece form", "contact-warm": "Sıcak giriş" },
    "logo": { "heading": "Logon", "subhead": "Basit başla — Logo Stüdyosu'nda istediğin zaman geliştirebilirsin.", "wordmark": { "title": "Yazı logo", "desc": "Marka adın, özenle dizilmiş" }, "curated": { "title": "Hazır logo", "desc": "Galeriden bir amblem seç" }, "ai": { "title": "Yapay zekâ ile tasarla", "desc": "Sohbetle özel logo tasarla", "locked": "Yayından sonra ücretli planla açılır" }, "useThis": "Bunu kullan", "selected": "Seçildi" },
    "review": { "heading": "Yayına hazır mısın?", "subhead": "Aşağıdaki her şey yayından sonra da düzenlenebilir.", "create": "Platformumu oluştur", "creating": "Platformun oluşturuluyor…", "edit": "Düzenle", "rows": { "niche": "Alan", "goals": "Sunacakların", "theme": "Renkler", "font": "Yazı tipi", "navbar": "Menü", "hero": "Karşılama", "pages": "Sayfalar", "logo": "Logo", "description": "Hakkında" } }
  }
}
```

In `frontend-main/src/i18n/request.ts`, add to the `Promise.all` array (same pattern as the existing four):

```ts
    import(`../../messages/${locale}/wizard.json`).then(m => m.default),
```

and merge the new element into the returned messages object exactly like `auth`/`common` are merged (match the file's existing spread/merge style).

Run the parity guard now: `node scripts/check-i18n-parity.mjs`
Expected: exit 0.

- [ ] **Step 2: Create WizardShell**

`frontend-main/src/app/signup/verify/wizard/WizardShell.tsx` — the fixed-viewport frame every step renders inside (aurora backdrop + chapter rail + progress + footer). Visual idioms lifted from `QuestionnaireStep.tsx`:

```tsx
"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import { CHAPTERS, type ChapterId } from "@/lib/wizard/machine";

interface WizardShellProps {
  chapter: ChapterId;
  progress: number; // 0-100
  canBack: boolean;
  onBack: () => void;
  showFinishRest: boolean;
  onFinishRest: () => void;
  error: string | null;
  footer: React.ReactNode;
  children: React.ReactNode;
  aside?: React.ReactNode; // live preview (desktop)
}

export function WizardShell({
  chapter, progress, canBack, onBack, showFinishRest, onFinishRest, error, footer, children, aside,
}: WizardShellProps) {
  const t = useTranslations("wizard");
  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-background">
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="aurora animate-aurora" />
        <div className="grid-fade absolute inset-0 opacity-40" />
      </div>

      <div className="mx-auto flex h-full w-full max-w-[980px] gap-8 px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]">
        <div className="flex h-full min-w-0 flex-1 flex-col md:max-w-[440px]">
          <header className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onBack}
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-all ${
                canBack
                  ? "bg-foreground/[0.06] text-foreground/80 hover:bg-foreground/[0.1]"
                  : "pointer-events-none opacity-0"
              }`}
              aria-label={t("common.back")}
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                {CHAPTERS.map((c) => (
                  <span key={c} className={c === chapter ? "text-foreground" : undefined}>
                    {t(`chapters.${c}`)}
                  </span>
                ))}
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]">
                <div
                  className="h-full rounded-full bg-foreground transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </header>

          <div className="relative mt-6 min-h-0 flex-1 overflow-y-auto pb-2">{children}</div>

          {error && <p className="mt-2 text-center text-[12.5px] text-destructive">{error}</p>}

          <footer className="mt-4 space-y-2">
            {footer}
            {showFinishRest && (
              <button
                type="button"
                onClick={onFinishRest}
                className="w-full text-center text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("common.finishRest")}
              </button>
            )}
          </footer>
        </div>

        {aside && <aside className="hidden h-full flex-1 items-center md:flex">{aside}</aside>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the mini-preview components**

`frontend-main/src/app/signup/verify/wizard/previews.tsx` — stylized mocks (NOT the real block renderer), colored from `THEME_SWATCHES`, typeset via `FONT_STACKS`:

```tsx
"use client";

import { FONT_STACKS, THEME_SWATCHES } from "@/lib/wizard/wizard-themes";
import type { WizardAnswers } from "@/lib/wizard/types";

const FALLBACK = THEME_SWATCHES.ocean;

function swatch(theme?: string) {
  return THEME_SWATCHES[theme ?? ""] ?? FALLBACK;
}

function fontStack(font?: string) {
  return FONT_STACKS[font ?? "Inter"] ?? FONT_STACKS.Inter;
}

export function MiniNavbar({ layout, theme, font, brand }: { layout: string; theme?: string; font?: string; brand: string }) {
  const s = swatch(theme);
  const links = (
    <span className="flex gap-1.5" aria-hidden>
      {[10, 8, 9].map((w, i) => (
        <span key={i} className="h-1 rounded-full bg-current opacity-40" style={{ width: w * 2 }} />
      ))}
    </span>
  );
  return (
    <div
      className="flex h-9 w-full items-center rounded-lg border px-3 text-[10px]"
      style={{ borderColor: `${s.primary}33`, color: s.ink, background: "white" }}
    >
      {layout === "centered" ? (
        <div className="flex w-full flex-col items-center gap-1 py-1">
          <span className="font-semibold leading-none" style={{ fontFamily: fontStack(font) }}>{brand}</span>
          {links}
        </div>
      ) : layout === "minimal" ? (
        <div className="flex w-full items-center justify-between">
          <span className="font-semibold" style={{ fontFamily: fontStack(font) }}>{brand}</span>
          <span className="h-2.5 w-4 rounded-sm" style={{ background: `${s.ink}22` }} />
        </div>
      ) : (
        <div className="flex w-full items-center justify-between">
          <span className="font-semibold" style={{ fontFamily: fontStack(font) }}>{brand}</span>
          {links}
          <span className="rounded-full px-2 py-0.5 text-[8px] font-semibold text-white" style={{ background: s.primary }}>
            CTA
          </span>
        </div>
      )}
    </div>
  );
}

export function MiniHero({ style, theme, font, brand, headline }: { style: string; theme?: string; font?: string; brand: string; headline?: string }) {
  const s = swatch(theme);
  const title = headline || brand;
  if (style === "split") {
    return (
      <div className="flex h-20 w-full gap-2 rounded-lg border p-2" style={{ borderColor: `${s.primary}33`, background: "white" }}>
        <div className="flex flex-1 flex-col justify-center gap-1.5">
          <span className="line-clamp-2 text-[10px] font-bold leading-tight" style={{ color: s.ink, fontFamily: fontStack(font) }}>{title}</span>
          <span className="h-3 w-12 rounded-full text-center text-[7px] font-semibold leading-3 text-white" style={{ background: s.primary }}>CTA</span>
        </div>
        <div className="w-2/5 rounded-md" style={{ background: `linear-gradient(135deg, ${s.soft}, ${s.primary}66)` }} />
      </div>
    );
  }
  if (style === "minimal") {
    return (
      <div className="flex h-20 w-full flex-col items-center justify-center gap-1.5 rounded-lg border" style={{ borderColor: `${s.primary}33`, background: "white" }}>
        <span className="px-3 text-center text-[10px] font-bold leading-tight" style={{ color: s.ink, fontFamily: fontStack(font) }}>{title}</span>
        <span className="h-3 w-12 rounded-full text-center text-[7px] font-semibold leading-3 text-white" style={{ background: s.primary }}>CTA</span>
      </div>
    );
  }
  return (
    <div
      className="flex h-20 w-full flex-col items-center justify-center gap-1.5 rounded-lg"
      style={{ background: `linear-gradient(160deg, ${s.ink}dd, ${s.primary}bb), linear-gradient(0deg, ${s.soft}, ${s.soft})` }}
    >
      <span className="px-3 text-center text-[10px] font-bold leading-tight text-white" style={{ fontFamily: fontStack(font) }}>{title}</span>
      <span className="h-3 w-12 rounded-full bg-white/90 text-center text-[7px] font-semibold leading-3" style={{ color: s.ink }}>CTA</span>
    </div>
  );
}

/** Abstract block-type sketch rows used by layout thumbnails. */
export function MiniPageSketch({ blocks, theme }: { blocks: string[]; theme?: string }) {
  const s = swatch(theme);
  return (
    <div className="flex w-full flex-col gap-1">
      {blocks.map((type, i) => {
        const h = type === "hero" ? 24 : type === "courseGrid" || type === "storeProducts" ? 16 : 10;
        const bg =
          type === "hero"
            ? `linear-gradient(135deg, ${s.primary}aa, ${s.ink}aa)`
            : type === "cta"
              ? `${s.primary}44`
              : type === "courseGrid" || type === "pricingPlans" || type === "upcomingEvents" || type === "storeProducts"
                ? `${s.soft}`
                : `${s.ink}11`;
        return (
          <div key={`${type}-${i}`} className="w-full rounded" style={{ height: h, background: bg }}>
            {(type === "courseGrid" || type === "pricingPlans" || type === "storeProducts") && (
              <div className="flex h-full items-center justify-center gap-1 px-2">
                {[0, 1, 2].map((k) => (
                  <span key={k} className="h-3/5 flex-1 rounded-sm bg-white/80" />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Right-hand "your site is assembling" frame (desktop only). */
export function LivePreview({ answers, brand, headline }: { answers: WizardAnswers; brand: string; headline?: string }) {
  const homeBlocks = ["courseGrid", "testimonials", "cta"];
  return (
    <div className="w-full max-w-[360px] overflow-hidden rounded-2xl border border-foreground/10 bg-white shadow-xl">
      <div className="flex items-center gap-1 border-b border-foreground/10 bg-foreground/[0.03] px-3 py-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-2 w-2 rounded-full bg-foreground/15" />
        ))}
      </div>
      <div className="flex flex-col gap-2 p-3">
        <MiniNavbar layout={answers.navbar_layout ?? "classic"} theme={answers.theme} font={answers.font_family} brand={brand} />
        <MiniHero style={answers.hero_style ?? "centered"} theme={answers.theme} font={answers.font_family} brand={brand} headline={headline} />
        <MiniPageSketch blocks={homeBlocks} theme={answers.theme} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build + lint + parity**

Run: `node scripts/check-i18n-parity.mjs && cd frontend-main && npm run lint && npm run build`
Expected: parity 0 drift; lint clean; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend-main/messages/en/wizard.json frontend-main/messages/tr/wizard.json frontend-main/src/i18n/request.ts frontend-main/src/app/signup/verify/wizard/
git commit -m "feat(wizard): i18n catalogs, shell frame, mini-preview components

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Chapter 1+2 step components

**Files:**
- Create: `frontend-main/src/app/signup/verify/wizard/steps.tsx`

**Interfaces:**
- Consumes: `WizardCatalog` (Task 9), `MiniNavbar`/`MiniHero` (Task 10), `THEME_SWATCHES`/`FONT_STACKS` (Task 9), i18n namespace `wizard` (Task 10). Niche icons copied from `QuestionnaireStep.tsx`'s `NICHE_OPTIONS`.
- Produces (all `"use client"`, dumb controlled components — selection state lives in `WizardFlow`, Task 14): `SlideHeader({heading, subhead})`, `OptionCard({selected, onSelect, title, subtitle, badge, children})`, `NicheStep`, `DescribeStep`, `GoalsStep`, `ThemeStep`, `FontStep`, `NavbarStep`, `HeroStep` — prop shapes exactly as coded below.

- [ ] **Step 1: Create steps.tsx**

```tsx
"use client";

import { Brush, Check, Dumbbell, Flame, Flower2, Music4, ScanFace, Sparkles, Wind, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { FONT_STACKS, THEME_SWATCHES } from "@/lib/wizard/wizard-themes";
import type { WizardCatalog } from "@/lib/wizard/types";

import { MiniHero, MiniNavbar } from "./previews";

// Keys must match Python modules under backend demo_data/ (same list the
// old QuestionnaireStep used).
const NICHE_ICONS: Record<string, LucideIcon> = {
  yoga: Flower2, pilates: Wind, fitness: Dumbbell, pole_dance: Flame,
  belly_dance: Music4, face_yoga: ScanFace, makeup: Brush, general: Sparkles,
};

export function SlideHeader({ heading, subhead }: { heading: string; subhead: string }) {
  return (
    <div className="flex-shrink-0">
      <h2 className="text-display text-[24px] leading-tight tracking-[-0.02em] md:text-[26px]">{heading}</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{subhead}</p>
    </div>
  );
}

export function OptionCard({
  selected, onSelect, title, subtitle, badge, children,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  subtitle?: string;
  badge?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex w-full flex-col gap-2 rounded-2xl border p-3 text-left transition-all active:scale-[0.99] ${
        selected
          ? "border-primary bg-primary/[0.06]"
          : "border-foreground/[0.08] bg-foreground/[0.02] hover:border-foreground/20 hover:bg-foreground/[0.04]"
      }`}
    >
      {children}
      <span className="flex items-baseline gap-2">
        <span className="text-[13.5px] font-semibold tracking-tight">{title}</span>
        {subtitle && <span className="text-[11.5px] text-muted-foreground">{subtitle}</span>}
        {badge && (
          <span className="ml-auto rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{badge}</span>
        )}
      </span>
      {selected && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

export function NicheStep({ catalog, value, onChange }: { catalog: WizardCatalog; value?: string; onChange: (niche: string) => void }) {
  const t = useTranslations("wizard");
  return (
    <div>
      <SlideHeader heading={t("niche.heading")} subhead={t("niche.subhead")} />
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {catalog.niches.map((key) => {
          const Icon = NICHE_ICONS[key] ?? Sparkles;
          return (
            <OptionCard key={key} selected={value === key} onSelect={() => onChange(key)} title={t(`niches.${key}.label`)} subtitle={t(`niches.${key}.tagline`)}>
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${value === key ? "bg-primary text-primary-foreground" : "bg-foreground/[0.06] text-foreground/70"}`}>
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </span>
            </OptionCard>
          );
        })}
      </div>
    </div>
  );
}

export function DescribeStep({ catalog, value, onChange }: { catalog: WizardCatalog; value?: string; onChange: (text: string) => void }) {
  const t = useTranslations("wizard");
  return (
    <div>
      <SlideHeader heading={t("describe.heading")} subhead={t("describe.subhead")} />
      <textarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value.slice(0, catalog.description_max_len))}
        placeholder={t("describe.placeholder")}
        rows={5}
        className="mt-5 w-full resize-none rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] p-4 text-[14px] leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary"
      />
      <p className="mt-1 text-right text-[11px] text-muted-foreground">{(value ?? "").length}/{catalog.description_max_len}</p>
    </div>
  );
}

export function GoalsStep({ catalog, value, onChange }: { catalog: WizardCatalog; value?: string[]; onChange: (goals: string[]) => void }) {
  const t = useTranslations("wizard");
  const goals = value ?? [];
  const toggle = (key: string) =>
    onChange(goals.includes(key) ? goals.filter((g) => g !== key) : [...goals, key]);
  return (
    <div>
      <SlideHeader heading={t("goals.heading")} subhead={t("goals.subhead")} />
      <div className="mt-5 flex flex-col gap-2">
        {catalog.goals.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all active:scale-[0.99] ${
              goals.includes(key)
                ? "border-primary bg-primary/[0.06]"
                : "border-foreground/[0.08] bg-foreground/[0.02] hover:border-foreground/20 hover:bg-foreground/[0.04]"
            }`}
          >
            <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-colors ${goals.includes(key) ? "border-primary bg-primary text-primary-foreground" : "border-foreground/30"}`}>
              {goals.includes(key) && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            <span className="text-[14.5px] font-medium tracking-tight">{t(`goals.items.${key}`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ThemeStep({ catalog, niche, value, onChange, showAll, onShowAll }: { catalog: WizardCatalog; niche?: string; value?: string; onChange: (theme: string) => void; showAll: boolean; onShowAll: () => void }) {
  const t = useTranslations("wizard");
  const ranked = catalog.theme_ranking[niche ?? "general"] ?? catalog.themes;
  const shown = showAll ? [...ranked, ...catalog.themes.filter((x) => !ranked.includes(x))] : ranked;
  return (
    <div>
      <SlideHeader heading={t("theme.heading")} subhead={t("theme.subhead")} />
      <div className="mt-5 flex flex-col gap-2.5">
        {shown.map((theme, i) => {
          const s = THEME_SWATCHES[theme];
          return (
            <OptionCard key={theme} selected={value === theme} onSelect={() => onChange(theme)} title={t(`themes.${theme}`)} badge={i === 0 && !showAll ? t("common.recommended") : undefined}>
              <span className="flex gap-1.5" aria-hidden>
                {[s.primary, s.ink, s.soft].map((c) => (
                  <span key={c} className="h-6 w-10 rounded-md border border-black/5" style={{ background: c }} />
                ))}
              </span>
            </OptionCard>
          );
        })}
      </div>
      {!showAll && (
        <button type="button" onClick={onShowAll} className="mt-3 text-[12.5px] font-medium text-muted-foreground hover:text-foreground">
          {t("common.showAll")}
        </button>
      )}
    </div>
  );
}

export function FontStep({ catalog, brand, value, onChange }: { catalog: WizardCatalog; brand: string; value?: string; onChange: (family: string) => void }) {
  const t = useTranslations("wizard");
  return (
    <div>
      <SlideHeader heading={t("font.heading")} subhead={t("font.subhead")} />
      <div className="mt-5 flex flex-col gap-2.5">
        {Object.entries(catalog.fonts).map(([id, family]) => (
          <OptionCard key={id} selected={value === family} onSelect={() => onChange(family)} title={t(`fonts.${id}.label`)} subtitle={t(`fonts.${id}.vibe`)}>
            <span className="text-[22px] leading-snug" style={{ fontFamily: FONT_STACKS[family] ?? family }}>{brand}</span>
          </OptionCard>
        ))}
      </div>
    </div>
  );
}

export function NavbarStep({ catalog, brand, theme, font, value, onChange }: { catalog: WizardCatalog; brand: string; theme?: string; font?: string; value?: string; onChange: (layout: string) => void }) {
  const t = useTranslations("wizard");
  return (
    <div>
      <SlideHeader heading={t("navbar.heading")} subhead={t("navbar.subhead")} />
      <div className="mt-5 flex flex-col gap-2.5">
        {catalog.navbar_layouts.map((layout) => (
          <OptionCard key={layout} selected={value === layout} onSelect={() => onChange(layout)} title={t(`navbarLayouts.${layout}`)}>
            <MiniNavbar layout={layout} theme={theme} font={font} brand={brand} />
          </OptionCard>
        ))}
      </div>
    </div>
  );
}

export function HeroStep({ catalog, brand, theme, font, value, onChange }: { catalog: WizardCatalog; brand: string; theme?: string; font?: string; value?: string; onChange: (style: string) => void }) {
  const t = useTranslations("wizard");
  return (
    <div>
      <SlideHeader heading={t("hero.heading")} subhead={t("hero.subhead")} />
      <div className="mt-5 flex flex-col gap-2.5">
        {catalog.hero_styles.map((style) => (
          <OptionCard key={style} selected={value === style} onSelect={() => onChange(style)} title={t(`heroStyles.${style}.label`)} subtitle={t(`heroStyles.${style}.desc`)}>
            <MiniHero style={style} theme={theme} font={font} brand={brand} />
          </OptionCard>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build + lint**

Run: `cd frontend-main && npm run lint && npm run build`
Expected: clean (components compile; not mounted yet).

- [ ] **Step 3: Commit**

```bash
git add frontend-main/src/app/signup/verify/wizard/steps.tsx
git commit -m "feat(wizard): business + look chapter step components

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Chapter 3 — page-layout steps

**Files:**
- Create: `frontend-main/src/app/signup/verify/wizard/pages-steps.tsx`

**Interfaces:**
- Consumes: `WizardCatalog` (Task 9), `MiniPageSketch` (Task 10), `SlideHeader`/`OptionCard` (Task 11), i18n keys `wizard.pages.*` / `wizard.layouts.*` (Task 10).
- Produces: `PageLayoutStep({catalog, page, value, onChange, theme, goals})` — the generic step for all six page keys; `thumbnailBlocks(catalog, page, layoutBlocks, goals)` splices home goal blocks into the thumbnail so the user SEES their goals landing on the page (mirrors backend compose ordering).

- [ ] **Step 1: Create pages-steps.tsx**

```tsx
"use client";

import { useTranslations } from "next-intl";

import type { WizardCatalog } from "@/lib/wizard/types";

import { MiniPageSketch } from "./previews";
import { OptionCard, SlideHeader } from "./steps";

/** Block-type sequence for a layout thumbnail, with home-page goal blocks
 * spliced in after courseGrid — mirrors backend compose ordering. */
export function thumbnailBlocks(catalog: WizardCatalog, page: string, layoutBlocks: string[], goals: string[]): string[] {
  if (page !== "home") return layoutBlocks;
  const extra: string[] = [];
  for (const gb of catalog.home_goal_blocks) {
    if (goals.includes(gb.goal) && !extra.includes(gb.type)) extra.push(gb.type);
  }
  const idx = layoutBlocks.indexOf("courseGrid");
  if (idx === -1) return [...layoutBlocks, ...extra];
  return [...layoutBlocks.slice(0, idx + 1), ...extra, ...layoutBlocks.slice(idx + 1)];
}

export function PageLayoutStep({
  catalog, page, value, onChange, theme, goals,
}: {
  catalog: WizardCatalog;
  page: string;
  value?: string;
  onChange: (layoutId: string) => void;
  theme?: string;
  goals: string[];
}) {
  const t = useTranslations("wizard");
  const options = catalog.page_layouts[page] ?? [];
  return (
    <div>
      <SlideHeader heading={t(`pages.titles.${page}`)} subhead={t("pages.subhead")} />
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {options.map((option, i) => (
          <OptionCard
            key={option.id}
            selected={value === option.id}
            onSelect={() => onChange(option.id)}
            title={t(`layouts.${option.id}`)}
            badge={i === 0 ? t("common.recommended") : undefined}
          >
            <MiniPageSketch blocks={thumbnailBlocks(catalog, page, option.blocks, goals)} theme={theme} />
          </OptionCard>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build + lint**

Run: `cd frontend-main && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend-main/src/app/signup/verify/wizard/pages-steps.tsx
git commit -m "feat(wizard): page-layout pick steps with goal-aware thumbnails

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Chapter 4+5 — logo step + review step

**Files:**
- Create: `frontend-main/src/app/signup/verify/wizard/logo-review-steps.tsx`

**Interfaces:**
- Consumes: `getCuratedLogos()` + `CuratedLogoItem`/`WizardLogoAnswer` (Task 9; endpoint gained `id` in Task 8), `OptionCard`/`SlideHeader` (Task 11), swatches/fonts (Task 9), i18n `wizard.logo.*` / `wizard.review.*` (Task 10).
- Produces: `LogoStep({brand, niche, theme, font, value, onChange})` (`value: WizardLogoAnswer | undefined`) and `ReviewStep({catalog, answers, onEdit})` where `onEdit(stepId)` jumps back to a step. The AI door renders locked (phase 3 unlocks it).

- [ ] **Step 1: Create logo-review-steps.tsx**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Lock, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";

import { getCuratedLogos } from "@/lib/wizard/api";
import type { CuratedLogoItem, WizardAnswers, WizardCatalog, WizardLogoAnswer } from "@/lib/wizard/types";
import { FONT_STACKS, THEME_SWATCHES } from "@/lib/wizard/wizard-themes";

import { OptionCard, SlideHeader } from "./steps";

export function LogoStep({
  brand, niche, theme, font, value, onChange,
}: {
  brand: string;
  niche?: string;
  theme?: string;
  font?: string;
  value?: WizardLogoAnswer;
  onChange: (logo: WizardLogoAnswer) => void;
}) {
  const t = useTranslations("wizard");
  const [items, setItems] = useState<CuratedLogoItem[]>([]);
  useEffect(() => {
    getCuratedLogos().then(setItems).catch(() => setItems([]));
  }, []);

  // Niche-tagged marks first (lightweight port of the Logo Studio ranking).
  const ranked = useMemo(() => {
    const n = (niche ?? "").toLowerCase().replace("_", " ");
    return [...items].sort(
      (a, b) =>
        Number(b.tags.toLowerCase().includes(n)) - Number(a.tags.toLowerCase().includes(n)),
    );
  }, [items, niche]);

  const s = THEME_SWATCHES[theme ?? ""] ?? THEME_SWATCHES.ocean;
  const stack = FONT_STACKS[font ?? "Inter"] ?? FONT_STACKS.Inter;
  const mode = value?.mode ?? "wordmark";

  return (
    <div>
      <SlideHeader heading={t("logo.heading")} subhead={t("logo.subhead")} />

      <div className="mt-5 flex flex-col gap-2.5">
        <OptionCard
          selected={mode === "wordmark"}
          onSelect={() => onChange({ mode: "wordmark", curated_id: null })}
          title={t("logo.wordmark.title")}
          subtitle={t("logo.wordmark.desc")}
        >
          <span className="rounded-lg bg-white px-4 py-3 text-[20px] font-bold tracking-tight" style={{ color: s.ink, fontFamily: stack }}>
            {brand}
          </span>
        </OptionCard>

        <div>
          <p className="mb-2 mt-2 text-[12.5px] font-semibold text-muted-foreground">
            {t("logo.curated.title")} — {t("logo.curated.desc")}
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {ranked.slice(0, 8).map((item) => (
              <OptionCard
                key={item.id}
                selected={mode === "curated" && value?.curated_id === item.id}
                onSelect={() => onChange({ mode: "curated", curated_id: item.id })}
                title={item.title}
              >
                <span className="flex items-center gap-2 rounded-lg bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- presigned, short-lived URL */}
                  <img src={item.image_url} alt={item.title} className="h-10 w-10 object-contain" />
                  <span className="truncate text-[12px] font-semibold" style={{ color: s.ink, fontFamily: stack }}>{brand}</span>
                </span>
              </OptionCard>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-foreground/[0.15] px-4 py-3.5 opacity-70">
          <Lock className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block text-[13.5px] font-semibold">{t("logo.ai.title")}</span>
            <span className="block text-[11.5px] text-muted-foreground">{t("logo.ai.locked")}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export function ReviewStep({
  catalog, answers, onEdit,
}: {
  catalog: WizardCatalog;
  answers: WizardAnswers;
  onEdit: (stepId: string) => void;
}) {
  const t = useTranslations("wizard");
  const rows: { key: string; step: string; value: string }[] = [
    { key: "niche", step: "business.niche", value: answers.niche ? t(`niches.${answers.niche}.label`) : "—" },
    { key: "description", step: "business.describe", value: answers.description ? `${answers.description.slice(0, 60)}${answers.description.length > 60 ? "…" : ""}` : "—" },
    { key: "goals", step: "business.goals", value: (answers.goals ?? []).map((g) => t(`goals.items.${g}`)).join(", ") || "—" },
    { key: "theme", step: "look.theme", value: answers.theme ? t(`themes.${answers.theme}`) : "—" },
    { key: "font", step: "look.font", value: answers.font_family ?? "—" },
    { key: "navbar", step: "look.navbar", value: answers.navbar_layout ? t(`navbarLayouts.${answers.navbar_layout}`) : "—" },
    { key: "hero", step: "look.hero", value: answers.hero_style ? t(`heroStyles.${answers.hero_style}.label`) : "—" },
    { key: "pages", step: "pages.home", value: Object.values(answers.page_layouts ?? {}).map((id) => t(`layouts.${id}`)).join(" · ") || t("common.recommended") },
    { key: "logo", step: "logo", value: answers.logo?.mode === "curated" ? t("logo.curated.title") : t("logo.wordmark.title") },
  ];
  return (
    <div>
      <SlideHeader heading={t("review.heading")} subhead={t("review.subhead")} />
      <ul className="mt-5 divide-y divide-foreground/[0.06] rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02]">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-3 px-4 py-3">
            <span className="w-24 flex-shrink-0 text-[12px] font-medium text-muted-foreground">{t(`review.rows.${row.key}`)}</span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{row.value}</span>
            <button
              type="button"
              onClick={() => onEdit(row.step)}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-foreground/70 transition-colors hover:bg-foreground/[0.1]"
              aria-label={t("review.edit")}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Verify build + lint**

Run: `cd frontend-main && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend-main/src/app/signup/verify/wizard/logo-review-steps.tsx
git commit -m "feat(wizard): logo doors (wordmark/curated/locked AI) + review step

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 14: WizardFlow orchestrator + mount in verify page + retire questionnaire

**Files:**
- Create: `frontend-main/src/app/signup/verify/wizard/WizardFlow.tsx`
- Modify: `frontend-main/src/app/signup/verify/page.tsx`
- Delete: `frontend-main/src/app/signup/verify/QuestionnaireStep.tsx`
- Modify: `frontend-main/messages/en/auth.json` + `frontend-main/messages/tr/auth.json` (delete the entire `signup.questionnaire` object from BOTH — parity guard enforces it)

**Interfaces:**
- Consumes: everything from Tasks 9–13.
- Produces: `<WizardFlow token onProvisioning={(slug?) => void} />`. Save protocol: selection only updates local draft; **Continue commits the current step's slice via PATCH** (preselected recommendation commits even if untouched), Review's CTA calls `finalizeWizard` then `onProvisioning(slug)`. 409 on any PATCH → `onProvisioning()` (another tab finalized). Resume order: server `current_step` if still valid, else first unanswered step. `localStorage["contentor_wizard_token"]` is written on verify success and tried as fallback when the emailed (15-min) token has expired.
- ⚠️ After this task `make e2e`'s signup spec fails (it clicks the old questionnaire) — expected until Task 15 rewrites it. Backend suite + builds must stay green.

- [ ] **Step 1: Create WizardFlow.tsx**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { finalizeWizard, getWizardCatalog, patchWizardState, readWizardState } from "@/lib/wizard/api";
import { buildSteps, finishRestAnswers, firstUnansweredStep, nextStep, prevStep, progressPct } from "@/lib/wizard/machine";
import type { WizardAnswers, WizardCatalog, WizardLogoAnswer } from "@/lib/wizard/types";
import { ApiError } from "@/types/api";

import { WizardShell } from "./WizardShell";
import { LivePreview } from "./previews";
import { PageLayoutStep } from "./pages-steps";
import { DescribeStep, FontStep, GoalsStep, HeroStep, NavbarStep, NicheStep, ThemeStep } from "./steps";
import { LogoStep, ReviewStep } from "./logo-review-steps";

function brandFromToken(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.brand_name === "string" ? payload.brand_name : "";
  } catch {
    return "";
  }
}

export function WizardFlow({ token, onProvisioning }: { token: string; onProvisioning: (slug?: string) => void }) {
  const t = useTranslations("wizard");
  const brand = useMemo(() => brandFromToken(token), [token]);
  const [catalog, setCatalog] = useState<WizardCatalog | null>(null);
  const [answers, setAnswers] = useState<WizardAnswers>({});
  const [stepId, setStepId] = useState("business.niche");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllThemes, setShowAllThemes] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    Promise.all([getWizardCatalog(), readWizardState(token)])
      .then(([cat, res]) => {
        if (res.status !== "pending" || ["seeding", "ready", "skipped"].includes(res.template_status)) {
          onProvisioning(res.slug);
          return;
        }
        const loaded = res.state.answers ?? {};
        setCatalog(cat);
        setAnswers(loaded);
        const steps = buildSteps(cat, loaded);
        const wanted = res.state.current_step;
        setStepId(wanted && steps.some((s) => s.id === wanted) ? wanted : firstUnansweredStep(steps, loaded).id);
      })
      .catch(() => setError(t("common.errors.generic")));
  }, [token, onProvisioning, t]);

  const steps = useMemo(() => (catalog ? buildSteps(catalog, answers) : []), [catalog, answers]);
  const step = steps.find((s) => s.id === stepId) ?? steps[0];

  const draft = useCallback((partial: WizardAnswers) => setAnswers((a) => ({ ...a, ...partial })), []);

  // The slice Continue commits: the user's pick, or the preselected
  // recommendation they implicitly accepted by continuing.
  const currentSlice = useCallback((): WizardAnswers => {
    if (!catalog || !step) return {};
    const rec = catalog.recommended;
    const ranked = catalog.theme_ranking[answers.niche ?? "general"] ?? catalog.themes;
    switch (step.id) {
      case "business.niche":
        return { niche: answers.niche };
      case "business.describe":
        return { description: answers.description ?? "" };
      case "business.goals":
        return { goals: answers.goals ?? [] };
      case "look.theme":
        return { theme: answers.theme ?? ranked[0] };
      case "look.font":
        return { font_family: answers.font_family ?? rec.font_family };
      case "look.navbar":
        return { navbar_layout: answers.navbar_layout ?? rec.navbar_layout };
      case "look.hero":
        return { hero_style: answers.hero_style ?? rec.hero_style };
      case "logo":
        return { logo: answers.logo ?? ({ mode: "wordmark", curated_id: null } as WizardLogoAnswer) };
      case "review":
        return {};
      default: {
        const page = step.id.replace("pages.", "");
        const current = answers.page_layouts ?? {};
        return { page_layouts: { ...current, [page]: current[page] ?? catalog.page_layouts[page][0].id } };
      }
    }
  }, [answers, catalog, step]);

  const commit = useCallback(
    async (partial: WizardAnswers, goToId: string, extra?: { finished_rest_for_me?: boolean }) => {
      setBusy(true);
      setError(null);
      try {
        await patchWizardState(token, { answers: partial, current_step: goToId, ...extra });
        setAnswers((a) => ({ ...a, ...partial }));
        setStepId(goToId);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          onProvisioning();
          return;
        }
        setError(t("common.errors.generic"));
      } finally {
        setBusy(false);
      }
    },
    [token, onProvisioning, t],
  );

  const handleContinue = async () => {
    if (!catalog || !step || busy) return;
    if (step.id === "review") {
      setBusy(true);
      setError(null);
      try {
        const res = await finalizeWizard(token);
        onProvisioning(res.slug);
      } catch {
        setBusy(false);
        setError(t("common.errors.generic"));
      }
      return;
    }
    const next = nextStep(steps, step.id);
    await commit(currentSlice(), next?.id ?? "review");
  };

  const handleFinishRest = async () => {
    if (!catalog || busy) return;
    await commit(finishRestAnswers(catalog, answers), "logo", { finished_rest_for_me: true });
  };

  const handleBack = () => {
    const prev = step && prevStep(steps, step.id);
    if (prev && !busy) setStepId(prev.id);
  };

  if (!catalog || !step) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        {error ? <p className="text-[14px] text-destructive">{error}</p> : <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
      </div>
    );
  }

  const goals = answers.goals ?? [];
  const continueDisabled = step.id === "business.niche" && !answers.niche;
  const showPreview = step.chapter !== "business";

  let body: React.ReactNode;
  switch (step.id) {
    case "business.niche":
      body = <NicheStep catalog={catalog} value={answers.niche} onChange={(niche) => draft({ niche })} />;
      break;
    case "business.describe":
      body = <DescribeStep catalog={catalog} value={answers.description} onChange={(description) => draft({ description })} />;
      break;
    case "business.goals":
      body = <GoalsStep catalog={catalog} value={answers.goals} onChange={(g) => draft({ goals: g })} />;
      break;
    case "look.theme":
      body = (
        <ThemeStep
          catalog={catalog}
          niche={answers.niche}
          value={answers.theme ?? (catalog.theme_ranking[answers.niche ?? "general"] ?? catalog.themes)[0]}
          onChange={(theme) => draft({ theme })}
          showAll={showAllThemes}
          onShowAll={() => setShowAllThemes(true)}
        />
      );
      break;
    case "look.font":
      body = <FontStep catalog={catalog} brand={brand} value={answers.font_family ?? catalog.recommended.font_family} onChange={(font_family) => draft({ font_family })} />;
      break;
    case "look.navbar":
      body = <NavbarStep catalog={catalog} brand={brand} theme={answers.theme} font={answers.font_family} value={answers.navbar_layout ?? catalog.recommended.navbar_layout} onChange={(navbar_layout) => draft({ navbar_layout })} />;
      break;
    case "look.hero":
      body = <HeroStep catalog={catalog} brand={brand} theme={answers.theme} font={answers.font_family} value={answers.hero_style ?? catalog.recommended.hero_style} onChange={(hero_style) => draft({ hero_style })} />;
      break;
    case "logo":
      body = <LogoStep brand={brand} niche={answers.niche} theme={answers.theme} font={answers.font_family} value={answers.logo} onChange={(logo) => draft({ logo })} />;
      break;
    case "review":
      body = <ReviewStep catalog={catalog} answers={answers} onEdit={(id) => setStepId(id)} />;
      break;
    default: {
      const page = step.id.replace("pages.", "");
      body = (
        <PageLayoutStep
          catalog={catalog}
          page={page}
          value={answers.page_layouts?.[page] ?? catalog.page_layouts[page][0].id}
          onChange={(layoutId) => draft({ page_layouts: { ...(answers.page_layouts ?? {}), [page]: layoutId } })}
          theme={answers.theme}
          goals={goals}
        />
      );
    }
  }

  return (
    <WizardShell
      chapter={step.chapter}
      progress={progressPct(steps, step.id)}
      canBack={Boolean(prevStep(steps, step.id))}
      onBack={handleBack}
      showFinishRest={step.chapter !== "business" && step.id !== "review"}
      onFinishRest={handleFinishRest}
      error={error}
      aside={showPreview ? <LivePreview answers={answers} brand={brand} /> : undefined}
      footer={
        <Button type="button" variant="brand" size="lg" className="w-full" onClick={handleContinue} disabled={continueDisabled || busy}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{step.id === "review" ? t("review.creating") : t("common.saving")}</span>
            </>
          ) : step.id === "review" ? (
            t("review.create")
          ) : (
            <>
              {t("common.continue")}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      }
    >
      {body}
    </WizardShell>
  );
}
```

- [ ] **Step 2: Wire into page.tsx and retire the questionnaire**

In `frontend-main/src/app/signup/verify/page.tsx`:

1. Replace the `QuestionnaireStep` import with `import { WizardFlow } from "./wizard/WizardFlow";` and change the state union: `type VerifyState = "verifying" | "wizard" | "provisioning" | "ready" | "error";`
2. Add `const [wizardToken, setWizardToken] = useState<string | null>(null);`
3. In the verify-success handler, replace `setState("questionnaire")` with:

```tsx
        const wt = (data.wizard_token as string | undefined) ?? token;
        setWizardToken(wt);
        try {
          localStorage.setItem("contentor_wizard_token", wt);
        } catch {
          // storage unavailable (private mode) — resume via email link only
        }
        setState("wizard");
```

4. In the verify `.catch`/non-ok branch, before setting the error state, try the stored token (expired email link ≠ dead wizard):

```tsx
        const stored = typeof window !== "undefined" ? localStorage.getItem("contentor_wizard_token") : null;
        if (stored) {
          setWizardToken(stored);
          setState("wizard");
          return;
        }
```

5. Replace the questionnaire render branch with:

```tsx
  if (state === "wizard" && wizardToken) {
    return (
      <WizardFlow
        token={wizardToken}
        onProvisioning={(flowSlug) => {
          const target = flowSlug || slug;
          if (flowSlug) setSlug(flowSlug);
          setState("provisioning");
          startPolling(target);
        }}
      />
    );
  }
```

6. Delete `frontend-main/src/app/signup/verify/QuestionnaireStep.tsx`, and remove the `handleQuestionnaireSubmitted` callback (replaced by the inline `onProvisioning` above).
7. Remove the whole `signup.questionnaire` object from `frontend-main/messages/en/auth.json` AND `frontend-main/messages/tr/auth.json`.

- [ ] **Step 3: Verify build + lint + parity**

Run: `node scripts/check-i18n-parity.mjs && cd frontend-main && npm run lint && npm run build`
Expected: parity 0 drift; lint clean; build succeeds.

- [ ] **Step 4: Manual smoke (dev stack)**

Run `make dev`, then in a browser: `http://localhost/signup` → sign up with a fresh brand/email → follow the sink link (`docker compose logs django | grep "SIGNUP VERIFICATION" -A 2` prints it in DEBUG) → walk niche → describe → goals → theme → font → navbar → hero → 6 (or 5) page picks → logo → review → Create → provisioning screen → ready CTA logs into the tenant.
Expected: no console errors; refresh mid-wizard resumes at the same step.

- [ ] **Step 5: Commit**

```bash
git add frontend-main/src/app/signup/verify/ frontend-main/messages/en/auth.json frontend-main/messages/tr/auth.json
git commit -m "feat(wizard): full wizard flow replaces signup questionnaire

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 15: Rewrite the signup e2e spec for the wizard

**Files:**
- Modify: `e2e/specs/01-signup-onboarding.spec.ts` (full rewrite below)

**Interfaces:**
- Consumes: e2e helpers `latestEmail`/`firstLink` (`e2e/helpers/email`), `manage` (`e2e/helpers/compose`); EN labels from `frontend-main/messages/en/wizard.json` + `frontend-main/messages/en/auth.json`; the dev stack (`make dev`) with `EMAIL_SINK_ENABLED=true`.
- Produces: two green specs — the full wizard walk (explicit non-default picks) and the "finish the rest for me" fast path. Config-value correctness is already locked by `test_wizard_provision.py`; e2e proves the user-facing flow end to end.

- [ ] **Step 1: Rewrite the spec**

Replace the entire contents of `e2e/specs/01-signup-onboarding.spec.ts` with:

```ts
import { test, expect, type Page } from "@playwright/test";
import { latestEmail, firstLink } from "../helpers/email";
import { manage } from "../helpers/compose";
import en from "../../frontend-main/messages/en/auth.json";
import wizardMessages from "../../frontend-main/messages/en/wizard.json";

const W = wizardMessages.wizard;
const stamp = Date.now();

async function signupThroughVerify(page: Page, brand: string, email: string) {
  await page.goto("http://localhost/signup");
  await page.getByPlaceholder(en.signup.brandNamePlaceholder).fill(brand);
  await page.getByPlaceholder(en.signup.namePlaceholder).fill("E2E Coach");
  await page.getByPlaceholder(en.signup.emailPlaceholder).fill(email);
  await page.getByRole("button", { name: en.signup.submit }).click();
  await expect(page.getByRole("heading", { name: en.signup.verifyTitle })).toBeVisible({ timeout: 10_000 });

  const mail = await latestEmail(email);
  const verifyLink = firstLink(mail.html);
  expect(verifyLink, `no link found in email: ${mail.subject}`).toMatch(/signup\/verify\?token=/);
  await page.goto(verifyLink);
}

async function clickContinue(page: Page) {
  await page.getByRole("button", { name: W.common.continue, exact: true }).click();
}

async function waitForReady(page: Page) {
  await expect(page.getByText(en.signup.verify.provisioningTitle)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(en.signup.verify.readyTitle)).toBeVisible({ timeout: 120_000 });
  const cta = page.getByRole("link", { name: /localhost/ });
  await expect(cta).toBeVisible();
  expect(await cta.getAttribute("href")).toMatch(/https?:\/\/[a-z0-9-]+\.localhost/);
}

test.beforeAll(() => {
  // Self-healing sweep of tenants left by previous runs.
  manage([
    "shell",
    "-c",
    "from apps.core.models import Tenant\n" +
      "[t.delete(force_drop=True) for t in Tenant.objects.filter(slug__startswith='e2e-studio-')]",
  ]);
});

test("coach walks the full wizard and the tenant provisions", async ({ page }) => {
  test.setTimeout(300_000);
  await signupThroughVerify(page, `E2E Studio ${stamp}a`, `e2e-coach-${stamp}a@example.com`);

  // Chapter 1 — business
  await page.getByRole("button", { name: W.niches.yoga.label }).click({ timeout: 20_000 });
  await clickContinue(page); // niche
  await clickContinue(page); // describe (optional, left empty)
  await page.getByRole("button", { name: W.goals.items.sell_courses }).click();
  await clickContinue(page); // goals

  // Chapter 2 — look (pick NON-defaults to prove choices stick)
  await page.getByRole("button", { name: W.themes.slate }).click();
  await clickContinue(page);
  await page.getByRole("button", { name: W.fonts.inter.label }).click();
  await clickContinue(page);
  await page.getByRole("button", { name: W.navbarLayouts.minimal }).click();
  await clickContinue(page);
  await page.getByRole("button", { name: W.heroStyles.split.label }).click();
  await clickContinue(page);

  // Chapter 3 — pages (home explicit, rest keep the recommended preselect)
  await page.getByRole("button", { name: W.layouts["home-story"] }).click();
  await clickContinue(page); // home
  await clickContinue(page); // about
  await clickContinue(page); // courses
  await clickContinue(page); // pricing (present because sell_courses picked)
  await clickContinue(page); // faq
  await clickContinue(page); // contact

  // Chapter 4 — logo (wordmark is the preselected default)
  await expect(page.getByText(W.logo.wordmark.title)).toBeVisible();
  await clickContinue(page);

  // Chapter 5 — review + create
  await expect(page.getByText(W.review.heading)).toBeVisible();
  await page.getByRole("button", { name: W.review.create }).click();
  await waitForReady(page);
});

test("finish-the-rest-for-me fast path provisions", async ({ page }) => {
  test.setTimeout(300_000);
  await signupThroughVerify(page, `E2E Studio ${stamp}b`, `e2e-coach-${stamp}b@example.com`);

  await page.getByRole("button", { name: W.niches.general.label }).click({ timeout: 20_000 });
  await clickContinue(page); // niche
  await clickContinue(page); // describe
  await clickContinue(page); // goals (none picked — defaults land at finalize)

  // On the first look step, bail out via the escape hatch.
  await page.getByRole("button", { name: W.common.finishRest }).click();

  // Lands on the logo step; continue to review and create.
  await expect(page.getByText(W.logo.heading)).toBeVisible({ timeout: 10_000 });
  await clickContinue(page);
  await page.getByRole("button", { name: W.review.create }).click();
  await waitForReady(page);
});
```

- [ ] **Step 2: Run the spec against the dev stack**

Run: `make dev` (if not already up), wait for health, then `cd e2e && npx playwright test specs/01-signup-onboarding.spec.ts`
Expected: 2 passed. If a selector misses, fix the SPEC (labels come from wizard.json — don't fork copy).

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/01-signup-onboarding.spec.ts
git commit -m "test(e2e): signup spec walks the onboarding wizard (full + finish-rest paths)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 16: Full verification sweep + bilingual click-through

**Files:** none created — this is the release gate for the phase.

- [ ] **Step 1: Full backend suite on a fresh DB (migration added in Task 2)**

Run: `make test-fresh`
Expected: 0 failures, 0 errors (baseline was ~945+ passing; suite grows by the six wizard test files).

- [ ] **Step 2: Lint + i18n parity + frontend build**

Run: `make lint && cd frontend-main && npm run lint && npm run build && cd ..`
Expected: pre-commit fully green (zero warnings — repo rule), parity 0 drift, build clean.

- [ ] **Step 3: Full e2e suite**

Run: `make e2e`
Expected: all specs pass (Stripe specs auto-skip). Specs 09/14/15/17 exercise builder/navbar/logo surfaces and must stay green — they prove the wizard's config output renders.

- [ ] **Step 4: Manual bilingual click-through (make dev)**

EN (`http://localhost/signup`): full walk picking a CURATED logo this time → after ready, log into the tenant → `/admin` shows setup assistant with look done; `/admin/design` shows the curated logo; public site (preview password if prompted) shows chosen theme + navbar layout + brand text next to the mark.
TR (`http://tr.localhost/signup`): finish-rest path; wizard strings render in Turkish; provisioned tenant navbar says "Kurslar" and CTA "Hemen Başla".
Community check: a run with "Build a community" picked → tenant admin community section shows enabled.
Expected: no browser-console errors; refresh mid-wizard resumes at the same step; reopening `/signup/verify?token=<expired>` after localStorage was set still resumes.

- [ ] **Step 5: Wrap up**

Report results with evidence (test counts, e2e output, screenshots if useful). Do NOT push or deploy — the repo owner handles that (unpushed local-main state predates this work). Phases 2 (AI copywriting + provisioning theater) and 3 (checkout + AI logo) get their own plans on top of the interfaces this phase shipped.
