# Logo Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A full-screen "Logo Studio" in the coach portal where non-technical coaches compose a professional logo (template composer: layout + icon/initials/uploaded mark + badge + font + colors), fine-tune placement by dragging, get AI-suggested recipes, and save — exporting a wide logo PNG **and** a dedicated square mark PNG that drives favicon/PWA icons.

**Architecture:** One pure React component `LogoRenderer` renders a versioned JSON "recipe" to SVG; the live preview, fine-tune canvas, AI suggestion cards, and export all render through it. Export rasterizes the SVG client-side (fonts inlined as data URIs) to PNG and uploads through the existing presign→complete flow, then PATCHes `TenantConfig` with `logo_id/logo_url/icon_id/icon_url/logo_recipe` in one save. A small backend endpoint returns 4 recipe suggestions via Claude structured output, with a deterministic niche-keyword fallback when no API key is configured. The `/pwa-icon` route prefers the new square mark. The setup assistant's "look" item deep-links into the studio.

**Tech Stack:** Django 5.1 + DRF (tenant app `tenant_config`), `anthropic` Python SDK (`claude-opus-4-8`, structured outputs), Next.js 14 + lucide-react 0.441 + Radix Dialog (frontend-customer), Playwright e2e.

## Global Constraints

- **Branch:** create `feat/logo-studio` **from `main`** (`git checkout main && git pull && git checkout -b feat/logo-studio`). The working tree is shared with other agents — before EVERY commit run `git branch --show-current` and abort if it is not `feat/logo-studio` (see memory: agents have accidentally committed to other branches here).
- **Never push. Never merge.** Commits on the feature branch only.
- Pre-commit must pass with zero issues (`make lint` / pre-commit hooks). Note: pre-commit does NOT lint the frontends — run `npm run build` in `frontend-customer` yourself to catch TS errors.
- Backend tests: `make test` (or targeted `docker compose exec django pytest apps/tenant_config -v`). New migrations ⇒ run `make migrate` (tenant schemas) before testing against the dev stack; if pytest complains about a missing migration in the reused test DB, run `make test-fresh` once.
- `ANTHROPIC_API_KEY` is an **optional** env var — every feature must degrade gracefully without it (deterministic fallback suggestions). Never hardcode keys.
- The icon-name and font catalogs exist in BOTH `frontend-customer/src/lib/logo/catalog.ts` and `backend/apps/tenant_config/logo_ai.py` — each file must carry a "keep in sync" comment naming the other file.
- Frontend has no unit-test runner; frontend tasks verify via `npm run build` + the e2e spec in Task 11 (repo convention).
- Recipe JSON schema (version 1) — the single contract used by model, serializer validation, renderer, and AI endpoint:

```json
{
  "version": 1,
  "layout": "badge_name | icon_name | name_only",
  "name": "Zeynep Yoga",
  "mark": {"type": "icon", "icon": "flower-2"}
        | {"type": "initials"}
        | {"type": "image", "photo_id": "<uuid>", "url": "<signed or data url>"},
  "badge": "circle | rounded | squircle | none",
  "font": "Playfair Display",
  "colors": {"badge_bg": "#7c3aed", "mark_fg": "#ffffff", "text": "#111827"},
  "overrides": {"mark_offset": [0, 0], "mark_scale": 1, "name_offset": [0, 0], "name_scale": 1}
}
```

---

### Task 1: Backend — model fields + migration

**Files:**
- Modify: `backend/apps/tenant_config/models.py:15-52` (TenantConfig)
- Create: `backend/apps/tenant_config/migrations/00XX_logo_studio.py` (generated)
- Test: `backend/apps/tenant_config/tests/test_logo_studio.py`

**Interfaces:**
- Produces: `TenantConfig.icon` (FK → `media.Photo`, nullable), `TenantConfig.icon_url` (CharField), `TenantConfig.logo_recipe` (JSONField default dict). Tasks 2, 3, 10 rely on these exact names.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/tenant_config/tests/test_logo_studio.py
import pytest

from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db


def test_tenant_config_has_logo_studio_fields():
    config = TenantConfig.objects.create(brand_name="Test Brand")
    assert config.icon is None
    assert config.icon_url == ""
    assert config.logo_recipe == {}
```

Mirror the fixture style of `backend/apps/tenant_config/tests/test_views.py` (this repo's tenant-aware conftest handles schema setup; if that file creates config via a helper/fixture, reuse it instead of bare `objects.create`).

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_studio.py -v`
Expected: FAIL — `TenantConfig has no attribute 'icon'` / `icon_url`.

- [ ] **Step 3: Add the model fields**

In `backend/apps/tenant_config/models.py`, directly under the existing `logo` FK (line 18):

```python
    # Square mark exported by the Logo Studio — drives favicon / PWA icons.
    # Mirrors the logo/logo_url pair: FK preferred, raw URL as fallback.
    icon = models.ForeignKey("media.Photo", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    icon_url = models.CharField(max_length=2000, blank=True, default="")
    # Logo Studio composer state (versioned; see TenantConfigSerializer
    # .validate_logo_recipe for the shape). Empty dict = no studio design.
    logo_recipe = models.JSONField(default=dict, blank=True)
```

- [ ] **Step 4: Generate the migration**

Run: `make makemigrations`
Expected: new migration in `backend/apps/tenant_config/migrations/` adding `icon`, `icon_url`, `logo_recipe`.

- [ ] **Step 5: Apply migrations + run test**

Run: `make migrate`, then `docker compose exec django pytest apps/tenant_config/tests/test_logo_studio.py -v`
Expected: PASS. (If the reused test DB errors on the new migration: `make test-fresh`.)

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must print feat/logo-studio
git add backend/apps/tenant_config/models.py backend/apps/tenant_config/migrations/ backend/apps/tenant_config/tests/test_logo_studio.py
git commit -m "feat(logo-studio): icon FK + icon_url + logo_recipe on TenantConfig"
```

---

### Task 2: Backend — serializer (writable FKs, icon signing, recipe validation)

**Files:**
- Modify: `backend/apps/tenant_config/serializers.py` (TenantConfigSerializer)
- Test: `backend/apps/tenant_config/tests/test_logo_studio.py` (extend)

**Interfaces:**
- Consumes: Task 1 model fields.
- Produces: PATCH `/api/v1/admin/config/` accepts `logo_id` (uuid|null), `icon_id` (uuid|null), `icon_url` (str), `logo_recipe` (dict, defensively shaped). GET returns `icon_url` freshly signed from the `icon` FK when set (same pattern as `logo_url`). Frontend Tasks 7–10 rely on these field names.

**Background:** `logo_id` appears in `Meta.fields` today but resolves to a read-only attribute field — the uploader's `logo_id` write is silently dropped (documented in `views.py:_logo_signal`). This task makes both FKs genuinely writable.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/tenant_config/tests/test_logo_studio.py`:

```python
from rest_framework.test import APIClient

from apps.media.models import Photo


@pytest.fixture
def coach_client(coach_user):  # reuse the existing coach/owner auth fixture from test_views.py
    client = APIClient()
    client.force_authenticate(user=coach_user)
    return client


VALID_RECIPE = {
    "version": 1,
    "layout": "badge_name",
    "name": "Zeynep Yoga",
    "mark": {"type": "icon", "icon": "flower-2"},
    "badge": "circle",
    "font": "Playfair Display",
    "colors": {"badge_bg": "#7c3aed", "mark_fg": "#ffffff", "text": "#111827"},
    "overrides": {"mark_offset": [0, 0], "mark_scale": 1, "name_offset": [0, 0], "name_scale": 1},
}


def test_patch_writes_logo_and_icon_fks_and_recipe(coach_client):
    logo_photo = Photo.objects.create(s3_key="photos/logo.png", title="logo")
    icon_photo = Photo.objects.create(s3_key="photos/icon.png", title="icon")
    resp = coach_client.patch(
        "/api/v1/admin/config/",
        {
            "logo_id": str(logo_photo.id),
            "icon_id": str(icon_photo.id),
            "logo_recipe": VALID_RECIPE,
        },
        format="json",
    )
    assert resp.status_code == 200
    config = TenantConfig.objects.first()
    assert config.logo_id == logo_photo.id
    assert config.icon_id == icon_photo.id
    assert config.logo_recipe["layout"] == "badge_name"


def test_icon_url_is_signed_from_fk_on_read(coach_client):
    icon_photo = Photo.objects.create(s3_key="photos/icon.png", title="icon")
    config = TenantConfig.objects.first()
    config.icon = icon_photo
    config.save()
    resp = coach_client.get("/api/v1/admin/config/")
    assert resp.status_code == 200
    assert "photos/icon.png" in resp.data["icon_url"]


def test_recipe_validation_rejects_bad_layout(coach_client):
    bad = dict(VALID_RECIPE, layout="freeform-chaos")
    resp = coach_client.patch("/api/v1/admin/config/", {"logo_recipe": bad}, format="json")
    assert resp.status_code == 400


def test_recipe_validation_clamps_and_strips(coach_client):
    noisy = dict(
        VALID_RECIPE,
        name="x" * 500,
        colors={"badge_bg": "javascript:alert(1)", "mark_fg": "#fff", "text": "#111827"},
        overrides={"mark_offset": [9999, -9999], "mark_scale": 99, "name_offset": [0, 0], "name_scale": 1},
    )
    resp = coach_client.patch("/api/v1/admin/config/", {"logo_recipe": noisy}, format="json")
    assert resp.status_code == 200
    saved = TenantConfig.objects.first().logo_recipe
    assert len(saved["name"]) <= 80
    assert saved["colors"]["badge_bg"] == "#111827"       # invalid hex -> safe default
    assert saved["overrides"]["mark_offset"] == [120, -120]  # clamped
    assert saved["overrides"]["mark_scale"] == 2.0           # clamped


def test_empty_recipe_clears(coach_client):
    resp = coach_client.patch("/api/v1/admin/config/", {"logo_recipe": {}}, format="json")
    assert resp.status_code == 200
    assert TenantConfig.objects.first().logo_recipe == {}
```

Adapt fixture names to whatever `test_views.py` actually uses for an authenticated coach (read that file first — reuse, don't reinvent).

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_studio.py -v`
Expected: the 5 new tests FAIL (logo_id not persisted / icon_url missing / no validation).

- [ ] **Step 3: Implement serializer changes**

In `backend/apps/tenant_config/serializers.py`:

Add import at top:

```python
from apps.media.models import Photo
```

Inside `TenantConfigSerializer`, declare the writable FK fields (above `validate_theme`):

```python
    # Writable FK ids for the Logo Studio. DRF's auto-field for "logo_id" was
    # read-only (attname passthrough); these make the FKs the real write path.
    logo_id = serializers.PrimaryKeyRelatedField(
        source="logo", queryset=Photo.objects.all(), allow_null=True, required=False
    )
    icon_id = serializers.PrimaryKeyRelatedField(
        source="icon", queryset=Photo.objects.all(), allow_null=True, required=False
    )
```

Add recipe validation constants near `_NAVBAR_LAYOUTS`:

```python
_RECIPE_LAYOUTS = {"badge_name", "icon_name", "name_only"}
_RECIPE_BADGES = {"circle", "rounded", "squircle", "none"}
_RECIPE_MARK_TYPES = {"icon", "initials", "image"}
_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def _clean_hex(value, default="#111827"):
    value = str(value or "")
    return value if _HEX_RE.match(value) else default


def _clamp(value, lo, hi, default=0.0):
    try:
        return max(lo, min(hi, float(value)))
    except (TypeError, ValueError):
        return default
```

(add `import re` to the imports).

Add the validator method inside the serializer:

```python
    def validate_logo_recipe(self, value):
        """Defensively shape the Logo Studio recipe. Empty dict clears the
        saved design. Unknown enum values are a hard 400 (the composer never
        produces them); free-text and numbers are clamped, not rejected.
        """
        if not isinstance(value, dict):
            raise serializers.ValidationError("logo_recipe must be an object.")
        if not value:
            return {}
        layout = value.get("layout")
        if layout not in _RECIPE_LAYOUTS:
            raise serializers.ValidationError("layout must be one of: " + ", ".join(sorted(_RECIPE_LAYOUTS)) + ".")
        badge = value.get("badge")
        if badge not in _RECIPE_BADGES:
            raise serializers.ValidationError("badge must be one of: " + ", ".join(sorted(_RECIPE_BADGES)) + ".")
        raw_mark = value.get("mark") if isinstance(value.get("mark"), dict) else {}
        mark_type = raw_mark.get("type")
        if mark_type not in _RECIPE_MARK_TYPES:
            raise serializers.ValidationError("mark.type must be one of: " + ", ".join(sorted(_RECIPE_MARK_TYPES)) + ".")
        mark = {"type": mark_type}
        if mark_type == "icon":
            mark["icon"] = str(raw_mark.get("icon") or "")[:60]
        elif mark_type == "image":
            mark["photo_id"] = str(raw_mark.get("photo_id") or "")[:64]
            # Never persist data: URLs or presigned URLs — re-derived on read.
            mark["url"] = ""
        raw_colors = value.get("colors") if isinstance(value.get("colors"), dict) else {}
        raw_over = value.get("overrides") if isinstance(value.get("overrides"), dict) else {}

        def _offset(key):
            pair = raw_over.get(key) or [0, 0]
            if not isinstance(pair, (list, tuple)) or len(pair) != 2:
                pair = [0, 0]
            return [_clamp(pair[0], -120, 120), _clamp(pair[1], -120, 120)]

        return {
            "version": 1,
            "layout": layout,
            "name": str(value.get("name") or "")[:80],
            "mark": mark,
            "badge": badge,
            "font": str(value.get("font") or "Inter")[:100],
            "colors": {
                "badge_bg": _clean_hex(raw_colors.get("badge_bg")),
                "mark_fg": _clean_hex(raw_colors.get("mark_fg"), default="#ffffff"),
                "text": _clean_hex(raw_colors.get("text")),
            },
            "overrides": {
                "mark_offset": _offset("mark_offset"),
                "mark_scale": _clamp(raw_over.get("mark_scale"), 0.5, 2.0, default=1.0),
                "name_offset": _offset("name_offset"),
                "name_scale": _clamp(raw_over.get("name_scale"), 0.5, 2.0, default=1.0),
            },
        }
```

Extend `Meta.fields` with `"icon_url"`, `"icon_id"`, `"logo_recipe"` (after `"logo_id"`).

In `to_representation`, mirror the logo signing right after the existing logo block:

```python
        # Prefer icon FK over icon_url string (same contract as logo above).
        if instance.icon_id and instance.icon and instance.icon.s3_key:
            data["icon_url"] = generate_presigned_download_url(instance.icon.s3_key)
        else:
            data["icon_url"] = sign_if_s3_key(data.get("icon_url"))
        # Re-sign the recipe's image mark from its durable photo_id so the
        # studio can re-edit an uploaded mark after the original URL expired.
        recipe = data.get("logo_recipe")
        if isinstance(recipe, dict):
            mark = recipe.get("mark")
            if isinstance(mark, dict) and mark.get("type") == "image" and mark.get("photo_id"):
                photo = Photo.objects.filter(pk=mark["photo_id"]).first()
                if photo and photo.s3_key:
                    mark["url"] = generate_presigned_download_url(photo.s3_key)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/tenant_config -v`
Expected: all tenant_config tests PASS (including pre-existing `test_views.py` — the autosave-diff logic in `views.py` already prefers `logo_id` via `_logo_signal`, so no view change is needed).

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/logo-studio
git add backend/apps/tenant_config/serializers.py backend/apps/tenant_config/tests/test_logo_studio.py
git commit -m "feat(logo-studio): writable logo/icon FKs, icon signing, recipe validation"
```

---

### Task 3: Backend — AI suggestions endpoint (+ deterministic fallback)

**Files:**
- Modify: `backend/requirements/base.txt` (add `anthropic`)
- Modify: `backend/config/settings/base.py` (add `ANTHROPIC_API_KEY`)
- Create: `backend/apps/tenant_config/logo_ai.py`
- Modify: `backend/apps/tenant_config/views.py` (add `logo_suggestions` view)
- Modify: `backend/apps/tenant_config/urls.py` (add route)
- Test: `backend/apps/tenant_config/tests/test_logo_suggestions.py`

**Interfaces:**
- Consumes: `TenantConfig.brand_name`, `theme`; tenant niche via `getattr(connection.tenant, "template_niche", "")`.
- Produces: `POST /api/v1/admin/config/logo-suggestions/` (auth: `IsCoachOrOwner`, empty body) → `{"suggestions": [<recipe>, ...], "source": "ai" | "fallback"}` where each recipe matches the Global Constraints schema. Task 8's UI calls this exact URL and reads `suggestions`.

- [ ] **Step 1: Add the dependency and setting**

In `backend/requirements/base.txt` append:

```
anthropic>=0.92,<1.0
```

In `backend/config/settings/base.py` (near `RESEND_API_KEY`):

```python
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
```

Rebuild the django image so the package installs: `docker compose build django && make dev` (or `docker compose up -d --build django celery-worker`).

- [ ] **Step 2: Write the failing tests**

```python
# backend/apps/tenant_config/tests/test_logo_suggestions.py
from unittest import mock

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

URL = "/api/v1/admin/config/logo-suggestions/"


@pytest.fixture
def coach_client(coach_user):  # same auth fixture as test_logo_studio.py
    client = APIClient()
    client.force_authenticate(user=coach_user)
    return client


def _assert_valid_recipes(payload):
    assert len(payload["suggestions"]) == 4
    for recipe in payload["suggestions"]:
        assert recipe["version"] == 1
        assert recipe["layout"] in {"badge_name", "icon_name", "name_only"}
        assert recipe["badge"] in {"circle", "rounded", "squircle", "none"}
        assert recipe["mark"]["type"] in {"icon", "initials"}
        assert recipe["colors"]["badge_bg"].startswith("#")


@override_settings(ANTHROPIC_API_KEY="")
def test_fallback_suggestions_without_api_key(coach_client):
    resp = coach_client.post(URL, {}, format="json")
    assert resp.status_code == 200
    assert resp.data["source"] == "fallback"
    _assert_valid_recipes(resp.data)


@override_settings(ANTHROPIC_API_KEY="sk-test")
def test_ai_suggestions_are_validated_against_catalog(coach_client):
    fake_item = mock.Mock(
        layout="badge_name", icon="not-a-real-icon", badge="circle",
        font="Comic Sans", badge_bg="#7c3aed", mark_fg="#ffffff", text="#111827",
    )
    fake_parsed = mock.Mock(suggestions=[fake_item] * 4)
    fake_response = mock.Mock(parsed_output=fake_parsed)
    with mock.patch("apps.tenant_config.logo_ai._anthropic_client") as client_factory:
        client_factory.return_value.messages.parse.return_value = fake_response
        resp = coach_client.post(URL, {}, format="json")
    assert resp.status_code == 200
    assert resp.data["source"] == "ai"
    for recipe in resp.data["suggestions"]:
        # unknown icon replaced by a catalog icon; unknown font replaced by Inter
        assert recipe["mark"]["icon"] != "not-a-real-icon"
        assert recipe["font"] == "Inter"


@override_settings(ANTHROPIC_API_KEY="sk-test")
def test_api_error_falls_back(coach_client):
    with mock.patch("apps.tenant_config.logo_ai._anthropic_client") as client_factory:
        client_factory.return_value.messages.parse.side_effect = RuntimeError("boom")
        resp = coach_client.post(URL, {}, format="json")
    assert resp.status_code == 200
    assert resp.data["source"] == "fallback"


@override_settings(ANTHROPIC_API_KEY="")
def test_rate_limited_after_ten_calls(coach_client):
    from django.core.cache import cache
    cache.clear()
    for _ in range(10):
        assert coach_client.post(URL, {}, format="json").status_code == 200
    assert coach_client.post(URL, {}, format="json").status_code == 429
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_suggestions.py -v`
Expected: FAIL — 404 (no route).

- [ ] **Step 4: Implement `logo_ai.py`**

```python
# backend/apps/tenant_config/logo_ai.py
"""Logo Studio recipe suggestions.

AI path: Claude structured output constrained to the catalog. Fallback path:
deterministic niche-keyword picks. Both return recipes in the exact shape
``TenantConfigSerializer.validate_logo_recipe`` accepts.

KEEP IN SYNC: the icon/font catalogs mirror
``frontend-customer/src/lib/logo/catalog.ts``.
"""
from typing import Literal

from django.conf import settings
from pydantic import BaseModel

# 64 curated lucide icon names (kebab-case), 8 niche groups of 8.
ICON_NAMES = [
    # wellness
    "flower-2", "leaf", "sprout", "sun", "moon", "heart", "heart-pulse", "sparkles",
    # fitness
    "dumbbell", "bike", "trophy", "medal", "flame", "zap", "activity", "footprints",
    # music
    "music", "music-2", "mic", "headphones", "guitar", "piano", "drum", "radio",
    # education
    "book-open", "graduation-cap", "pencil", "pen-tool", "lightbulb", "brain", "library", "notebook-pen",
    # business
    "briefcase", "trending-up", "target", "bar-chart-3", "rocket", "globe", "handshake", "landmark",
    # creative
    "camera", "palette", "brush", "scissors", "wand-2", "gem", "crown", "star",
    # food
    "chef-hat", "utensils-crossed", "coffee", "cake", "apple", "wheat", "salad", "cookie",
    # lifestyle
    "home", "paw-print", "dog", "cat", "baby", "compass", "mountain", "waves",
]

FONTS = ["Inter", "Geist", "Poppins", "Nunito", "DM Sans", "Playfair Display", "Merriweather", "Lora"]

# niche keyword -> icons that read well for it (fallback path)
NICHE_ICONS = {
    "yoga": ["flower-2", "leaf", "sun", "sparkles"],
    "fitness": ["dumbbell", "flame", "trophy", "activity"],
    "music": ["music", "guitar", "mic", "headphones"],
    "business": ["briefcase", "trending-up", "target", "rocket"],
    "cooking": ["chef-hat", "utensils-crossed", "cake", "coffee"],
    "food": ["chef-hat", "salad", "apple", "coffee"],
    "art": ["palette", "brush", "camera", "gem"],
    "education": ["book-open", "graduation-cap", "lightbulb", "brain"],
}
DEFAULT_ICONS = ["sparkles", "star", "zap", "heart"]

_LAYOUTS = ("badge_name", "icon_name", "name_only")
_BADGES = ("circle", "rounded", "squircle", "none")


class _Suggestion(BaseModel):
    layout: Literal["badge_name", "icon_name", "name_only"]
    icon: str
    badge: Literal["circle", "rounded", "squircle", "none"]
    font: str
    badge_bg: str
    mark_fg: str
    text: str


class _SuggestionList(BaseModel):
    suggestions: list[_Suggestion]


def _anthropic_client():
    from anthropic import Anthropic

    return Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=20.0, max_retries=1)


def _recipe(brand_name, layout, icon, badge, font, badge_bg, mark_fg, text):
    return {
        "version": 1,
        "layout": layout,
        "name": brand_name,
        "mark": {"type": "icon", "icon": icon},
        "badge": badge,
        "font": font,
        "colors": {"badge_bg": badge_bg, "mark_fg": mark_fg, "text": text},
        "overrides": {"mark_offset": [0, 0], "mark_scale": 1, "name_offset": [0, 0], "name_scale": 1},
    }


def fallback_suggestions(brand_name, niche, primary_hex):
    icons = DEFAULT_ICONS
    for keyword, candidates in NICHE_ICONS.items():
        if keyword in (niche or "").lower():
            icons = candidates
            break
    combos = [
        ("badge_name", "circle", "Playfair Display", primary_hex, "#ffffff", "#111827"),
        ("icon_name", "none", "Inter", primary_hex, primary_hex, "#111827"),
        ("badge_name", "squircle", "Poppins", "#111827", "#ffffff", "#111827"),
        ("name_only", "none", "Lora", primary_hex, primary_hex, "#334155"),
    ]
    return [
        _recipe(brand_name, layout, icons[i % len(icons)], badge, font, bg, fg, text)
        for i, (layout, badge, font, bg, fg, text) in enumerate(combos)
    ]


def _validated(item, brand_name, niche, primary_hex):
    import re

    hex_re = re.compile(r"^#[0-9a-fA-F]{6}$")
    icons = NICHE_ICONS.get((niche or "").lower(), DEFAULT_ICONS)
    icon = item.icon if item.icon in ICON_NAMES else icons[0]
    font = item.font if item.font in FONTS else "Inter"
    layout = item.layout if item.layout in _LAYOUTS else "badge_name"
    badge = item.badge if item.badge in _BADGES else "circle"
    badge_bg = item.badge_bg if hex_re.match(item.badge_bg or "") else primary_hex
    mark_fg = item.mark_fg if hex_re.match(item.mark_fg or "") else "#ffffff"
    text = item.text if hex_re.match(item.text or "") else "#111827"
    return _recipe(brand_name, layout, icon, badge, font, badge_bg, mark_fg, text)


def ai_suggestions(brand_name, niche, primary_hex):
    """4 recipes from Claude, validated against the catalog. Raises on API
    failure — the view catches and falls back."""
    client = _anthropic_client()
    prompt = (
        f'Suggest 4 distinct logo recipes for a coaching brand.\n'
        f'Brand name: "{brand_name}"\nNiche: "{niche or "general coaching"}"\n'
        f'Brand primary color: {primary_hex}\n\n'
        f'Rules: icon must be one of: {", ".join(ICON_NAMES)}.\n'
        f'font must be one of: {", ".join(FONTS)}.\n'
        f"Colors are 6-digit hex. Make the 4 suggestions visually distinct "
        f"(vary layout, badge, font, palette); at least one should use the brand primary color. "
        f"badge_bg/mark_fg must contrast strongly; text must be readable on white."
    )
    response = client.messages.parse(
        model="claude-opus-4-8",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
        output_format=_SuggestionList,
    )
    items = list(response.parsed_output.suggestions)[:4]
    recipes = [_validated(item, brand_name, niche, primary_hex) for item in items]
    while len(recipes) < 4:
        recipes.append(fallback_suggestions(brand_name, niche, primary_hex)[len(recipes)])
    return recipes
```

- [ ] **Step 5: Add the view and route**

In `backend/apps/tenant_config/views.py` (imports: `logging`, `from django.conf import settings`, `from . import logo_ai` — plus a theme-hex map):

```python
logger = logging.getLogger(__name__)

# Theme id -> primaryHex. KEEP IN SYNC with frontend-customer/src/lib/themes.ts.
_THEME_PRIMARY_HEX = {
    "ocean": "#1a56db",
    "ember": "#c2410c",
    "forest": "#15803d",
    "sunset": "#e11d48",
    "violet": "#7c3aed",
    "slate": "#334155",
}


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def logo_suggestions(request):
    """4 Logo Studio recipe suggestions. AI when ANTHROPIC_API_KEY is set,
    deterministic niche fallback otherwise (or on any AI failure)."""
    rate_key = f"logo-suggest:{connection.tenant.schema_name}"
    count = cache.get(rate_key, 0)
    if count >= 10:
        return Response({"detail": "Suggestion limit reached. Try again in an hour."}, status=429)
    cache.set(rate_key, count + 1, timeout=3600)

    config = TenantConfig.objects.first()
    brand_name = config.brand_name if config else "My Brand"
    theme = config.theme if config else "ocean"
    primary_hex = _THEME_PRIMARY_HEX.get(theme, "#1a56db")
    niche = getattr(connection.tenant, "template_niche", "") or ""

    if settings.ANTHROPIC_API_KEY:
        try:
            suggestions = logo_ai.ai_suggestions(brand_name, niche, primary_hex)
            return Response({"suggestions": suggestions, "source": "ai"})
        except Exception:
            logger.exception("logo suggestions: AI call failed, using fallback")
    suggestions = logo_ai.fallback_suggestions(brand_name, niche, primary_hex)
    return Response({"suggestions": suggestions, "source": "fallback"})
```

(`connection` and `cache` are already imported in this module for `TenantConfigView`; verify and reuse.)

In `backend/apps/tenant_config/urls.py`:

```python
from .views import TenantConfigView, admin_stats, logo_suggestions, setup_status

urlpatterns = [
    path("config/", TenantConfigView.as_view(), name="tenant-config"),
    path("config/logo-suggestions/", logo_suggestions, name="logo-suggestions"),
    # ... existing paths unchanged
]
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/tenant_config -v`
Expected: PASS (all).

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # must print feat/logo-studio
git add backend/requirements/base.txt backend/config/settings/base.py backend/apps/tenant_config/logo_ai.py backend/apps/tenant_config/views.py backend/apps/tenant_config/urls.py backend/apps/tenant_config/tests/test_logo_suggestions.py
git commit -m "feat(logo-studio): AI recipe suggestions endpoint with deterministic fallback"
```

---

### Task 4: Frontend — recipe types + catalog

**Files:**
- Create: `frontend-customer/src/types/logo.ts`
- Create: `frontend-customer/src/lib/logo/catalog.ts`
- Modify: `frontend-customer/src/types/tenant.ts` (TenantConfig: add `icon_url`, `icon_id`, `logo_recipe`)

**Interfaces:**
- Produces (used by Tasks 5–10):
  - `LogoRecipe`, `LogoMark`, `RecipeLayout`, `RecipeBadge` types
  - `LOGO_ICONS: Record<string, LucideIcon>` (kebab-case keys), `ICON_GROUPS: {label: string; icons: string[]}[]`
  - `LOGO_FONTS: string[]`, `COLOR_PAIRS(primaryHex): {label; badge_bg; mark_fg}[]`, `TEXT_COLORS(primaryHex): string[]`
  - `defaultRecipe(brandName: string, primaryHex: string): LogoRecipe`
  - `initialsFor(name: string): string`

- [ ] **Step 1: Create `src/types/logo.ts`**

```typescript
export type RecipeLayout = "badge_name" | "icon_name" | "name_only";
export type RecipeBadge = "circle" | "rounded" | "squircle" | "none";

export type LogoMark =
  | { type: "icon"; icon: string }
  | { type: "initials" }
  | { type: "image"; photo_id: string; url: string };

export interface LogoRecipe {
  version: 1;
  layout: RecipeLayout;
  name: string;
  mark: LogoMark;
  badge: RecipeBadge;
  font: string;
  colors: { badge_bg: string; mark_fg: string; text: string };
  overrides: {
    mark_offset: [number, number];
    mark_scale: number;
    name_offset: [number, number];
    name_scale: number;
  };
}
```

- [ ] **Step 2: Create `src/lib/logo/catalog.ts`**

```typescript
// Logo Studio catalog: curated lucide icons (8 niche groups), brand fonts and
// color pairs. KEEP IN SYNC: backend/apps/tenant_config/logo_ai.py mirrors
// the icon names and fonts for AI-suggestion validation.
import type { LucideIcon } from "lucide-react";
import {
  Activity, Apple, Baby, BarChart3, Bike, BookOpen, Brain, Briefcase, Brush,
  Cake, Camera, Cat, ChefHat, Coffee, Compass, Cookie, Crown, Dog, Drum,
  Dumbbell, Flame, Flower2, Footprints, Gem, Globe, GraduationCap, Guitar,
  Handshake, Headphones, Heart, HeartPulse, Home, Landmark, Leaf, Library,
  Lightbulb, Medal, Mic, Moon, Mountain, Music, Music2, NotebookPen, Palette,
  PawPrint, Pencil, PenTool, Piano, Radio, Rocket, Salad, Scissors, Sparkles,
  Sprout, Star, Sun, Target, TrendingUp, Trophy, UtensilsCrossed, Wand2, Waves,
  Wheat, Zap,
} from "lucide-react";
import type { LogoRecipe } from "@/types/logo";

export const LOGO_ICONS: Record<string, LucideIcon> = {
  "flower-2": Flower2, leaf: Leaf, sprout: Sprout, sun: Sun, moon: Moon,
  heart: Heart, "heart-pulse": HeartPulse, sparkles: Sparkles,
  dumbbell: Dumbbell, bike: Bike, trophy: Trophy, medal: Medal, flame: Flame,
  zap: Zap, activity: Activity, footprints: Footprints,
  music: Music, "music-2": Music2, mic: Mic, headphones: Headphones,
  guitar: Guitar, piano: Piano, drum: Drum, radio: Radio,
  "book-open": BookOpen, "graduation-cap": GraduationCap, pencil: Pencil,
  "pen-tool": PenTool, lightbulb: Lightbulb, brain: Brain, library: Library,
  "notebook-pen": NotebookPen,
  briefcase: Briefcase, "trending-up": TrendingUp, target: Target,
  "bar-chart-3": BarChart3, rocket: Rocket, globe: Globe, handshake: Handshake,
  landmark: Landmark,
  camera: Camera, palette: Palette, brush: Brush, scissors: Scissors,
  "wand-2": Wand2, gem: Gem, crown: Crown, star: Star,
  "chef-hat": ChefHat, "utensils-crossed": UtensilsCrossed, coffee: Coffee,
  cake: Cake, apple: Apple, wheat: Wheat, salad: Salad, cookie: Cookie,
  home: Home, "paw-print": PawPrint, dog: Dog, cat: Cat, baby: Baby,
  compass: Compass, mountain: Mountain, waves: Waves,
};

export const ICON_GROUPS: { label: string; icons: string[] }[] = [
  { label: "Wellness", icons: ["flower-2", "leaf", "sprout", "sun", "moon", "heart", "heart-pulse", "sparkles"] },
  { label: "Fitness", icons: ["dumbbell", "bike", "trophy", "medal", "flame", "zap", "activity", "footprints"] },
  { label: "Music", icons: ["music", "music-2", "mic", "headphones", "guitar", "piano", "drum", "radio"] },
  { label: "Education", icons: ["book-open", "graduation-cap", "pencil", "pen-tool", "lightbulb", "brain", "library", "notebook-pen"] },
  { label: "Business", icons: ["briefcase", "trending-up", "target", "bar-chart-3", "rocket", "globe", "handshake", "landmark"] },
  { label: "Creative", icons: ["camera", "palette", "brush", "scissors", "wand-2", "gem", "crown", "star"] },
  { label: "Food", icons: ["chef-hat", "utensils-crossed", "coffee", "cake", "apple", "wheat", "salad", "cookie"] },
  { label: "Lifestyle", icons: ["home", "paw-print", "dog", "cat", "baby", "compass", "mountain", "waves"] },
];

// Same 8 families the Brand tab offers (brand-tab.tsx).
export const LOGO_FONTS = [
  "Inter", "Geist", "Poppins", "Nunito", "DM Sans",
  "Playfair Display", "Merriweather", "Lora",
];

export function COLOR_PAIRS(primaryHex: string) {
  return [
    { label: "Your theme", badge_bg: primaryHex, mark_fg: "#ffffff" },
    { label: "Ink", badge_bg: "#111827", mark_fg: "#ffffff" },
    { label: "Slate", badge_bg: "#334155", mark_fg: "#ffffff" },
    { label: "Forest", badge_bg: "#15803d", mark_fg: "#ffffff" },
    { label: "Terracotta", badge_bg: "#c2410c", mark_fg: "#fff7ed" },
    { label: "Rose", badge_bg: "#e11d48", mark_fg: "#fff1f2" },
    { label: "Violet", badge_bg: "#7c3aed", mark_fg: "#f5f3ff" },
    { label: "Amber", badge_bg: "#f59e0b", mark_fg: "#1f2937" },
  ];
}

export function TEXT_COLORS(primaryHex: string): string[] {
  return ["#111827", "#334155", primaryHex, "#ffffff"];
}

export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "A";
}

export function defaultRecipe(brandName: string, primaryHex: string): LogoRecipe {
  return {
    version: 1,
    layout: "badge_name",
    name: brandName || "My Brand",
    mark: { type: "initials" },
    badge: "circle",
    font: "Inter",
    colors: { badge_bg: primaryHex, mark_fg: "#ffffff", text: "#111827" },
    overrides: { mark_offset: [0, 0], mark_scale: 1, name_offset: [0, 0], name_scale: 1 },
  };
}
```

- [ ] **Step 3: Extend `TenantConfig` type**

In `frontend-customer/src/types/tenant.ts`, after `logo_id`:

```typescript
  /** Square mark exported by the Logo Studio (drives favicon/PWA icons). */
  icon_url?: string;
  icon_id?: string | null;
  /** Logo Studio composer state; empty object = no saved design. */
  logo_recipe?: Partial<import("./logo").LogoRecipe> | Record<string, never>;
```

- [ ] **Step 4: Verify it compiles**

Run: `cd frontend-customer && npx tsc --noEmit`
Expected: no errors (if any listed lucide icon doesn't exist in `lucide-react@0.441`, tsc names it — swap that icon for another from the same family and update BOTH catalogs + this plan's backend list).

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add frontend-customer/src/types/logo.ts frontend-customer/src/lib/logo/catalog.ts frontend-customer/src/types/tenant.ts
git commit -m "feat(logo-studio): recipe types and icon/font/color catalog"
```

---

### Task 5: Frontend — LogoRenderer + MarkRenderer (pure SVG)

**Files:**
- Create: `frontend-customer/src/components/logo/logo-renderer.tsx`

**Interfaces:**
- Consumes: `LogoRecipe`, `LOGO_ICONS`, `initialsFor` from Task 4.
- Produces:
  - `LogoRenderer({recipe, width?, className?, svgRef?, interactive?})` — full logo, viewBox `0 0 640 200`. Mark group carries `data-part="mark"`, name group `data-part="name"` (Task 8 hit-testing).
  - `MarkRenderer({recipe, size?, svgRef?})` — square mark, viewBox `0 0 256 256`.
  - Both accept `svgRef?: React.Ref<SVGSVGElement>` (Task 6 serializes these nodes).

- [ ] **Step 1: Implement the renderer**

```tsx
// frontend-customer/src/components/logo/logo-renderer.tsx
// Pure SVG renderer for a Logo Studio recipe. Single source of truth:
// live preview, fine-tune canvas, AI suggestion cards, and PNG export all
// render through this component, so they can never drift.
import type { Ref } from "react";
import { LOGO_ICONS, initialsFor } from "@/lib/logo/catalog";
import type { LogoRecipe } from "@/types/logo";

export const LOGO_VIEWBOX = { w: 640, h: 200 };
export const MARK_VIEWBOX = 256;

const BADGE_RX: Record<string, number> = { circle: -1, rounded: 24, squircle: 48, none: 0 };

function Badge({ shape, size, fill }: { shape: string; size: number; fill: string }) {
  if (shape === "none") return null;
  if (shape === "circle") return <circle cx={size / 2} cy={size / 2} r={size / 2} fill={fill} />;
  return <rect width={size} height={size} rx={BADGE_RX[shape] * (size / 160)} fill={fill} />;
}

/** The mark drawn into a size×size box anchored at (0,0). */
function Mark({ recipe, size }: { recipe: LogoRecipe; size: number }) {
  const { mark, badge, colors, font } = recipe;
  const hasBadge = badge !== "none";
  const fg = hasBadge ? colors.mark_fg : colors.badge_bg;
  const inner = size * (hasBadge ? 0.55 : 0.8);
  const pad = (size - inner) / 2;
  let content = null;
  if (mark.type === "icon") {
    const Icon = LOGO_ICONS[mark.icon];
    if (Icon) {
      // lucide components render a nested <svg>; x/y/width/height place it.
      content = <Icon x={pad} y={pad} width={inner} height={inner} color={fg} strokeWidth={1.75} />;
    }
  } else if (mark.type === "image") {
    content = (
      <image href={mark.url} x={pad} y={pad} width={inner} height={inner} preserveAspectRatio="xMidYMid meet" />
    );
  }
  if (!content) {
    // initials (also the fallback for unknown icon names / missing image url)
    const initials = initialsFor(recipe.name);
    content = (
      <text
        x={size / 2} y={size / 2}
        textAnchor="middle" dominantBaseline="central"
        fontFamily={`'${font}', sans-serif`} fontWeight={700}
        fontSize={size * (initials.length > 1 ? 0.38 : 0.5)} fill={fg}
      >
        {initials}
      </text>
    );
  }
  return (
    <g>
      <Badge shape={badge} size={size} fill={colors.badge_bg} />
      {content}
    </g>
  );
}

interface LogoRendererProps {
  recipe: LogoRecipe;
  width?: number;
  className?: string;
  svgRef?: Ref<SVGSVGElement>;
}

export function LogoRenderer({ recipe, width = 320, className, svgRef }: LogoRendererProps) {
  const { layout, name, colors, font, overrides } = recipe;
  const markSize = 160;
  const markY = (LOGO_VIEWBOX.h - markSize) / 2;
  const showMark = layout !== "name_only";
  const textX = showMark ? 24 + markSize + 24 : 32;
  const budget = LOGO_VIEWBOX.w - textX - 24;
  const fontSize = Math.max(30, Math.min(80, budget / (0.58 * Math.max(name.length, 3))));
  const [mdx, mdy] = overrides.mark_offset;
  const [ndx, ndy] = overrides.name_offset;
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${LOGO_VIEWBOX.w} ${LOGO_VIEWBOX.h}`}
      width={width}
      height={(width * LOGO_VIEWBOX.h) / LOGO_VIEWBOX.w}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {showMark && (
        <g
          data-part="mark"
          transform={`translate(${24 + mdx + (markSize * (1 - overrides.mark_scale)) / 2}, ${markY + mdy + (markSize * (1 - overrides.mark_scale)) / 2}) scale(${overrides.mark_scale})`}
        >
          <Mark recipe={recipe} size={markSize} />
        </g>
      )}
      <g data-part="name" transform={`translate(${ndx}, ${ndy}) scale(${overrides.name_scale})`} style={{ transformOrigin: `${textX}px ${LOGO_VIEWBOX.h / 2}px` }}>
        <text
          x={textX} y={LOGO_VIEWBOX.h / 2}
          dominantBaseline="central"
          fontFamily={`'${font}', sans-serif`} fontWeight={700}
          fontSize={fontSize} fill={colors.text}
        >
          {name}
        </text>
      </g>
    </svg>
  );
}

export function MarkRenderer({ recipe, size = 96, svgRef }: { recipe: LogoRecipe; size?: number; svgRef?: Ref<SVGSVGElement> }) {
  // Square export/preview: badge fills the box; name_only recipes fall back
  // to an initials mark so the favicon is never empty.
  const markRecipe: LogoRecipe =
    recipe.layout === "name_only" && recipe.mark.type !== "image"
      ? { ...recipe, mark: { type: "initials" }, badge: recipe.badge === "none" ? "rounded" : recipe.badge }
      : recipe;
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`}
      width={size} height={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <Mark recipe={markRecipe} size={MARK_VIEWBOX} />
    </svg>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend-customer && npx tsc --noEmit`
Expected: no errors. (If lucide's SVG props reject `x`/`y`, wrap the icon in `<g transform={translate(...)}>` and pass only `width/height/color` — lucide props extend `SVGProps<SVGSVGElement>` so `x`/`y` should be accepted.)

- [ ] **Step 3: Commit**

```bash
git branch --show-current
git add frontend-customer/src/components/logo/logo-renderer.tsx
git commit -m "feat(logo-studio): pure SVG recipe renderer (logo + square mark)"
```

---

### Task 6: Frontend — export pipeline (fonts → SVG → PNG → upload)

**Files:**
- Create: `frontend-customer/src/lib/logo/export.ts`

**Interfaces:**
- Consumes: presign endpoints `POST /api/v1/upload/presign/` + `POST /api/v1/upload/complete/` (`category: "photo"`), `clientFetch` from `@/lib/api-client`.
- Produces (Task 7 calls these):
  - `svgToPngBlob(svg: SVGSVGElement, width: number, height: number, fontFamily: string): Promise<Blob>`
  - `uploadPng(blob: Blob, filename: string): Promise<{ photo_id: string; signed_url: string }>`
  - `imageToDataUrl(url: string): Promise<string>` (fetch → blob → data URL; used for image marks)

**Gotchas this code handles (do not "simplify" them away):**
1. SVG rasterized via `<img>` is a separate document — page webfonts do NOT apply. The font must be inlined as a `@font-face` with a data-URI (fonts.gstatic serves CORS `*`).
2. `<image href>` pointing at an external URL inside an SVG-as-image is refused by browsers — image marks must be data URLs before serializing.

- [ ] **Step 1: Implement `export.ts`**

```typescript
// frontend-customer/src/lib/logo/export.ts
import { clientFetch } from "@/lib/api-client";

interface PresignResponse { upload_url: string; s3_key: string }
interface CompleteResponse { photo_id: string; signed_url: string }

/** fetch a URL (signed S3/MinIO or blob) and return it as a data: URL. */
export async function imageToDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Could not load image (${resp.status})`);
  const blob = await resp.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(blob);
  });
}

/** Google Fonts CSS for the family, with the font file inlined as data URI. */
async function fontFaceCss(fontFamily: string): Promise<string> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@700&display=swap`;
  const css = await (await fetch(cssUrl)).text();
  const match = css.match(/src:\s*url\((https:[^)]+)\)/);
  if (!match) return "";
  const fontData = await imageToDataUrl(match[1]);
  return `@font-face{font-family:'${fontFamily}';font-weight:700;src:url(${fontData});}`;
}

export async function svgToPngBlob(
  svg: SVGSVGElement,
  width: number,
  height: number,
  fontFamily: string,
): Promise<Blob> {
  // Make sure the preview font is loaded (best effort — export still works
  // with the fallback font if Google Fonts is unreachable).
  try {
    await document.fonts.load(`700 64px '${fontFamily}'`);
  } catch { /* non-fatal */ }

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  // Inline external <image> hrefs (uploaded marks) as data URLs — external
  // resources are blocked inside SVG-as-image and would blank the canvas.
  for (const img of Array.from(clone.querySelectorAll("image"))) {
    const href = img.getAttribute("href") || img.getAttribute("xlink:href") || "";
    if (href && !href.startsWith("data:")) {
      img.setAttribute("href", await imageToDataUrl(href));
    }
  }

  // Inline the webfont so <text> renders with the chosen family.
  try {
    const css = await fontFaceCss(fontFamily);
    if (css) {
      const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
      style.textContent = css;
      clone.insertBefore(style, clone.firstChild);
    }
  } catch { /* fall back to generic font */ }

  const xml = new XMLSerializer().serializeToString(clone);
  const svgUrl = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.src = svgUrl;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export async function uploadPng(
  blob: Blob,
  filename: string,
  contentType = "image/png",
): Promise<CompleteResponse> {
  const { upload_url, s3_key } = await clientFetch<PresignResponse>("/api/v1/upload/presign/", {
    method: "POST",
    body: JSON.stringify({ filename, content_type: contentType, category: "photo" }),
  });
  const put = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!put.ok) throw new Error(`Upload failed: ${put.status}`);
  return await clientFetch<CompleteResponse>("/api/v1/upload/complete/", {
    method: "POST",
    body: JSON.stringify({
      s3_key,
      category: "photo",
      content_type: contentType,
      file_size: blob.size,
      title: filename.replace(/\.[^.]+$/, ""),
    }),
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend-customer && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git branch --show-current
git add frontend-customer/src/lib/logo/export.ts
git commit -m "feat(logo-studio): client-side SVG→PNG export with inlined fonts + upload"
```

---

### Task 7: Frontend — Logo Studio dialog (controls, previews, save)

**Files:**
- Create: `frontend-customer/src/components/logo/logo-studio.tsx`

**Interfaces:**
- Consumes: Tasks 4–6 exports; `Dialog` primitives from `@/components/ui/dialog`; `Button` from `@/components/ui/button`; `getThemePalette` from `@/lib/themes`.
- Produces: `LogoStudio({ open, onOpenChange, config, onSaved })` where `onSaved(patch: Partial<TenantConfig>)` receives `{logo_id, logo_url, icon_id, icon_url, logo_recipe}` after a successful save. Tasks 8–9 extend/mount this component.

- [ ] **Step 1: Implement the studio shell**

```tsx
// frontend-customer/src/components/logo/logo-studio.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Upload, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { clientFetch } from "@/lib/api-client";
import {
  COLOR_PAIRS, ICON_GROUPS, LOGO_FONTS, LOGO_ICONS, TEXT_COLORS, defaultRecipe, initialsFor,
} from "@/lib/logo/catalog";
import { imageToDataUrl, svgToPngBlob, uploadPng } from "@/lib/logo/export";
import { getThemePalette } from "@/lib/themes";
import type { LogoRecipe, RecipeBadge, RecipeLayout } from "@/types/logo";
import type { TenantConfig } from "@/types/tenant";
import { LOGO_VIEWBOX, LogoRenderer, MarkRenderer } from "./logo-renderer";

const LAYOUTS: { id: RecipeLayout; label: string }[] = [
  { id: "badge_name", label: "Badge + name" },
  { id: "icon_name", label: "Icon + name" },
  { id: "name_only", label: "Name only" },
];
const BADGES: { id: RecipeBadge; label: string }[] = [
  { id: "circle", label: "Circle" },
  { id: "rounded", label: "Rounded" },
  { id: "squircle", label: "Squircle" },
  { id: "none", label: "None" },
];

interface LogoStudioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: TenantConfig;
  onSaved: (patch: Partial<TenantConfig>) => void;
}

function isCompleteRecipe(value: unknown): value is LogoRecipe {
  return !!value && typeof value === "object" && (value as LogoRecipe).version === 1;
}

export function LogoStudio({ open, onOpenChange, config, onSaved }: LogoStudioProps) {
  const theme = getThemePalette(config.theme);
  const [recipe, setRecipe] = useState<LogoRecipe>(() =>
    isCompleteRecipe(config.logo_recipe)
      ? (config.logo_recipe as LogoRecipe)
      : defaultRecipe(config.brand_name, theme.primaryHex),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoSvgRef = useRef<SVGSVGElement>(null);
  const markSvgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load all studio fonts once so previews render true.
  useEffect(() => {
    if (!open) return;
    const id = "logo-studio-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${LOGO_FONTS.map(
      (f) => `family=${encodeURIComponent(f)}:wght@700`,
    ).join("&")}&display=swap`;
    document.head.appendChild(link);
  }, [open]);

  const patch = (part: Partial<LogoRecipe>) => setRecipe((r) => ({ ...r, ...part }));

  async function handleMarkUpload(file: File) {
    setError(null);
    try {
      const dataUrl = await imageToDataUrl(URL.createObjectURL(file));
      // Persist the original file so the mark survives re-edit sessions; the
      // in-memory data URL is what the preview/export uses this session.
      const uploaded = await uploadPng(file, file.name, file.type);
      patch({ mark: { type: "image", photo_id: uploaded.photo_id, url: dataUrl } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function handleSave() {
    if (!logoSvgRef.current || !markSvgRef.current) return;
    setSaving(true);
    setError(null);
    try {
      const logoBlob = await svgToPngBlob(logoSvgRef.current, LOGO_VIEWBOX.w * 2, LOGO_VIEWBOX.h * 2, recipe.font);
      const markBlob = await svgToPngBlob(markSvgRef.current, 1024, 1024, recipe.font);
      const logo = await uploadPng(logoBlob, "logo.png");
      const mark = await uploadPng(markBlob, "logo-icon.png");
      const body = {
        logo_id: logo.photo_id,
        logo_url: logo.signed_url,
        icon_id: mark.photo_id,
        icon_url: mark.signed_url,
        logo_recipe: recipe,
      };
      await clientFetch("/api/v1/admin/config/", { method: "PATCH", body: JSON.stringify(body) });
      onSaved(body);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the logo — you can upload a file instead.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <DialogTitle>Logo Studio</DialogTitle>
          <div className="flex items-center gap-2">
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Use this logo
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* ── Preview column ─────────────────────────────────────────── */}
          <div className="flex min-w-0 flex-1 flex-col items-center gap-6 overflow-y-auto bg-muted/40 p-8">
            {/* Site header context, light + dark */}
            <div className="w-full max-w-xl space-y-3">
              <div className="rounded-lg border bg-white px-4 py-3 shadow-sm">
                <LogoRenderer recipe={recipe} width={240} svgRef={logoSvgRef} />
              </div>
              <div className="rounded-lg border bg-zinc-900 px-4 py-3 shadow-sm">
                <LogoRenderer recipe={recipe} width={240} />
              </div>
            </div>
            {/* Favicon + home-screen context */}
            <div className="flex items-end gap-8">
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-2 rounded-t-lg border bg-white px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
                  <MarkRenderer recipe={recipe} size={16} />
                  {recipe.name}
                </div>
                <span className="text-xs text-muted-foreground">Browser tab</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="overflow-hidden rounded-2xl shadow-md">
                  <MarkRenderer recipe={recipe} size={64} svgRef={markSvgRef} />
                </div>
                <span className="text-xs text-muted-foreground">App icon</span>
              </div>
            </div>
          </div>

          {/* ── Controls rail ──────────────────────────────────────────── */}
          <div className="w-80 shrink-0 space-y-6 overflow-y-auto border-l p-5">
            <section className="space-y-1.5">
              <p className="text-sm font-medium">Name</p>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={recipe.name}
                maxLength={80}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </section>

            <section className="space-y-1.5">
              <p className="text-sm font-medium">Layout</p>
              <div className="flex flex-wrap gap-1.5">
                {LAYOUTS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => patch({ layout: l.id })}
                    className={`rounded-md border px-2.5 py-1.5 text-xs ${recipe.layout === l.id ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground"}`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </section>

            {recipe.layout !== "name_only" && (
              <section className="space-y-1.5">
                <p className="text-sm font-medium">Mark</p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => patch({ mark: { type: "initials" } })}
                    className={`rounded-md border px-2.5 py-1.5 text-xs ${recipe.mark.type === "initials" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground"}`}
                  >
                    {initialsFor(recipe.name)} Initials
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleMarkUpload(e.target.files[0])}
                  />
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5" /> Your own
                  </Button>
                </div>
                <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
                  {ICON_GROUPS.map((group) => (
                    <div key={group.label}>
                      <p className="mb-1 text-xs text-muted-foreground">{group.label}</p>
                      <div className="grid grid-cols-8 gap-1">
                        {group.icons.map((iconName) => {
                          const Icon = LOGO_ICONS[iconName];
                          const active = recipe.mark.type === "icon" && recipe.mark.icon === iconName;
                          return (
                            <button
                              key={iconName}
                              type="button"
                              aria-label={iconName}
                              onClick={() => patch({ mark: { type: "icon", icon: iconName } })}
                              className={`flex h-8 items-center justify-center rounded-md border ${active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground"}`}
                            >
                              <Icon className="h-4 w-4" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {recipe.layout !== "name_only" && (
              <section className="space-y-1.5">
                <p className="text-sm font-medium">Badge shape</p>
                <div className="flex flex-wrap gap-1.5">
                  {BADGES.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => patch({ badge: b.id })}
                      className={`rounded-md border px-2.5 py-1.5 text-xs ${recipe.badge === b.id ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground"}`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-1.5">
              <p className="text-sm font-medium">Font</p>
              <div className="flex flex-wrap gap-1.5">
                {LOGO_FONTS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => patch({ font: f })}
                    style={{ fontFamily: `'${f}', sans-serif` }}
                    className={`rounded-md border px-2.5 py-1.5 text-xs ${recipe.font === f ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground"}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-1.5">
              <p className="text-sm font-medium">Colors</p>
              <div className="flex flex-wrap gap-1.5">
                {COLOR_PAIRS(theme.primaryHex).map((pair) => {
                  const active = recipe.colors.badge_bg === pair.badge_bg && recipe.colors.mark_fg === pair.mark_fg;
                  return (
                    <button
                      key={pair.label}
                      type="button"
                      title={pair.label}
                      onClick={() => patch({ colors: { ...recipe.colors, badge_bg: pair.badge_bg, mark_fg: pair.mark_fg } })}
                      className={`h-7 w-7 rounded-full border-2 ${active ? "border-primary" : "border-transparent"}`}
                      style={{ background: pair.badge_bg }}
                    />
                  );
                })}
                <input
                  type="color"
                  aria-label="Custom badge color"
                  value={recipe.colors.badge_bg}
                  onChange={(e) => patch({ colors: { ...recipe.colors, badge_bg: e.target.value } })}
                  className="h-7 w-7 cursor-pointer rounded-full border p-0"
                />
              </div>
              <p className="pt-1 text-xs text-muted-foreground">Name color</p>
              <div className="flex gap-1.5">
                {TEXT_COLORS(theme.primaryHex).map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    aria-label={`Name color ${hex}`}
                    onClick={() => patch({ colors: { ...recipe.colors, text: hex } })}
                    className={`h-7 w-7 rounded-full border-2 ${recipe.colors.text === hex ? "border-primary" : "border-border"}`}
                    style={{ background: hex }}
                  />
                ))}
              </div>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

Note: `handleMarkUpload` uploads the original file (any accepted image type) via `uploadPng` — rename mentally: it presigns with `content_type: "image/png"`. Fix that properly: change `uploadPng` usage here to pass the real type by extending `uploadPng(blob, filename, contentType = "image/png")` in `export.ts` and calling `uploadPng(file, file.name, file.type)`. Apply that signature change in `export.ts` now (default parameter keeps Task 6 call sites working).

- [ ] **Step 2: Verify Dialog primitives exist**

Run: `ls frontend-customer/src/components/ui/dialog.tsx`
If missing, check what the repo uses for modals (`grep -rn "DialogContent" frontend-customer/src/components | head`) and use that primitive instead — do not add a new dependency.

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend-customer && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add frontend-customer/src/components/logo/logo-studio.tsx frontend-customer/src/lib/logo/export.ts
git commit -m "feat(logo-studio): studio dialog with composer controls, previews, save"
```

---

### Task 8: Frontend — fine-tune drag mode + AI suggestions UI

**Files:**
- Modify: `frontend-customer/src/components/logo/logo-studio.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/admin/config/logo-suggestions/` (Task 3) → `{suggestions: LogoRecipe[], source: string}`; `data-part` attributes from Task 5.
- Produces: "Adjust placement" toggle (drag mark/name, snap-to-zero, scale sliders, Reset) and a "Suggest ideas" section rendering 4 clickable `LogoRenderer` cards.

- [ ] **Step 1: Add fine-tune state + handlers to `LogoStudio`**

Add state and drag logic inside the component:

```tsx
  const [adjusting, setAdjusting] = useState(false);
  const dragRef = useRef<{ part: "mark" | "name"; startX: number; startY: number; base: [number, number] } | null>(null);

  function beginDrag(e: React.PointerEvent<SVGSVGElement>) {
    if (!adjusting) return;
    const part = (e.target as Element).closest("[data-part]")?.getAttribute("data-part") as "mark" | "name" | null;
    if (!part) return;
    const base = part === "mark" ? recipe.overrides.mark_offset : recipe.overrides.name_offset;
    dragRef.current = { part, startX: e.clientX, startY: e.clientY, base: [...base] as [number, number] };
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  }

  function moveDrag(e: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const svg = e.currentTarget;
    // convert screen px to viewBox units
    const scale = LOGO_VIEWBOX.w / svg.getBoundingClientRect().width;
    const clampOff = (v: number) => Math.max(-120, Math.min(120, v));
    const snap = (v: number) => (Math.abs(v) < 6 ? 0 : v);
    const dx = snap(clampOff(drag.base[0] + (e.clientX - drag.startX) * scale));
    const dy = snap(clampOff(drag.base[1] + (e.clientY - drag.startY) * scale));
    setRecipe((r) => ({
      ...r,
      overrides: {
        ...r.overrides,
        [drag.part === "mark" ? "mark_offset" : "name_offset"]: [dx, dy],
      },
    }));
  }

  function endDrag() {
    dragRef.current = null;
  }
```

Change `LogoRenderer` (Task 5 file) to accept and spread pointer handlers onto its `<svg>`:

```tsx
interface LogoRendererProps {
  recipe: LogoRecipe;
  width?: number;
  className?: string;
  svgRef?: Ref<SVGSVGElement>;
  onPointerDown?: React.PointerEventHandler<SVGSVGElement>;
  onPointerMove?: React.PointerEventHandler<SVGSVGElement>;
  onPointerUp?: React.PointerEventHandler<SVGSVGElement>;
}
```

…spread them on the `<svg>` element, and in the studio pass `onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag}` on the light preview only.

Add the controls section (below "Colors"):

```tsx
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Placement</p>
                <button
                  type="button"
                  onClick={() => setAdjusting((v) => !v)}
                  className={`rounded-md border px-2.5 py-1 text-xs ${adjusting ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
                >
                  {adjusting ? "Done adjusting" : "Adjust placement"}
                </button>
              </div>
              {adjusting && (
                <div className="space-y-2 text-xs text-muted-foreground">
                  <p>Drag the badge or the name in the top preview. It snaps back near center.</p>
                  <label className="block">
                    Badge size
                    <input
                      type="range" min={0.5} max={2} step={0.05}
                      value={recipe.overrides.mark_scale}
                      onChange={(e) => setRecipe((r) => ({ ...r, overrides: { ...r.overrides, mark_scale: Number(e.target.value) } }))}
                      className="w-full"
                    />
                  </label>
                  <label className="block">
                    Name size
                    <input
                      type="range" min={0.5} max={2} step={0.05}
                      value={recipe.overrides.name_scale}
                      onChange={(e) => setRecipe((r) => ({ ...r, overrides: { ...r.overrides, name_scale: Number(e.target.value) } }))}
                      className="w-full"
                    />
                  </label>
                  <Button
                    type="button" variant="ghost" size="sm"
                    onClick={() => setRecipe((r) => ({ ...r, overrides: { mark_offset: [0, 0], mark_scale: 1, name_offset: [0, 0], name_scale: 1 } }))}
                  >
                    Reset placement
                  </Button>
                </div>
              )}
            </section>
```

- [ ] **Step 2: Add the AI suggestions section**

State + fetch:

```tsx
  const [suggestions, setSuggestions] = useState<LogoRecipe[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  async function fetchSuggestions() {
    setSuggesting(true);
    setError(null);
    try {
      const data = await clientFetch<{ suggestions: LogoRecipe[] }>(
        "/api/v1/admin/config/logo-suggestions/",
        { method: "POST", body: JSON.stringify({}) },
      );
      setSuggestions(data.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch ideas");
    } finally {
      setSuggesting(false);
    }
  }
```

Section at the TOP of the controls rail (first thing a coach sees):

```tsx
            <section className="space-y-2">
              <Button
                type="button" variant="outline" size="sm" className="w-full gap-2"
                onClick={fetchSuggestions} disabled={suggesting}
              >
                {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                Suggest ideas
              </Button>
              {suggestions && (
                <div className="grid grid-cols-2 gap-2" data-testid="logo-suggestions">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setRecipe({ ...s, name: recipe.name })}
                      className="rounded-md border bg-white p-2 hover:border-primary"
                    >
                      <LogoRenderer recipe={{ ...s, name: recipe.name }} width={120} />
                    </button>
                  ))}
                </div>
              )}
            </section>
```

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend-customer && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add frontend-customer/src/components/logo/logo-renderer.tsx frontend-customer/src/components/logo/logo-studio.tsx
git commit -m "feat(logo-studio): fine-tune drag placement + AI suggestion cards"
```

---

### Task 9: Frontend — integration (BrandTab, /admin/design, setup deep link)

**Files:**
- Modify: `frontend-customer/src/components/owner/brand-tab.tsx`
- Modify: `frontend-customer/src/app/admin/design/page.tsx`
- Modify: `frontend-customer/src/components/setup/catalog.ts:43` (look href)

**Interfaces:**
- Consumes: `LogoStudio` (Task 7/8).
- Produces: studio reachable from (a) the Brand tab in the edit sidebar, (b) `/admin/design` Branding card, (c) deep link `/admin/design?studio=1` used by the setup assistant's "look" item.

- [ ] **Step 1: BrandTab — promote "Create a logo"**

In `brand-tab.tsx`, add state + button next to the existing `LogoUploader` (which stays as the escape hatch):

```tsx
import { useState } from "react";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoStudio } from "@/components/logo/logo-studio";
```

Inside the component:

```tsx
  const [studioOpen, setStudioOpen] = useState(false);
```

Replace the Logo section (lines 39-45) with:

```tsx
      <div className="space-y-1.5">
        <Label>Logo</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" className="gap-1.5" onClick={() => setStudioOpen(true)}>
            <Wand2 className="h-3.5 w-3.5" />
            {config.logo_recipe && Object.keys(config.logo_recipe).length ? "Edit logo" : "Create a logo"}
          </Button>
        </div>
        <LogoUploader logoUrl={config.logo_url} onChange={(patch) => onChange(patch)} />
        <LogoStudio
          open={studioOpen}
          onOpenChange={setStudioOpen}
          config={config}
          onSaved={(patch) => onChange(patch)}
        />
      </div>
```

Note: `onChange` here is the sidebar's debounced-autosave `handleChange`; the studio has already persisted via its own PATCH, so this call only syncs local state — a redundant re-PATCH of identical values is harmless and keeps the wiring simple.

- [ ] **Step 2: /admin/design — button + `?studio=1` deep link**

In `frontend-customer/src/app/admin/design/page.tsx`:

```tsx
import { LogoStudio } from "@/components/logo/logo-studio";
```

Inside `DesignSettingsPage`:

```tsx
  const [studioOpen, setStudioOpen] = useState(false);

  // Deep link from the setup assistant: /admin/design?studio=1
  // (window.location in an effect, NOT useSearchParams — avoids the Next 14
  // client-side Suspense bailout at build time.)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("studio") === "1") {
      setStudioOpen(true);
    }
  }, []);
```

In the Branding card, above the Logo URL input:

```tsx
            <div className="space-y-2">
              <Label>Logo</Label>
              <Button type="button" variant="outline" className="gap-2" onClick={() => setStudioOpen(true)}>
                <Wand2 className="h-4 w-4" />
                {config.logo_recipe && Object.keys(config.logo_recipe).length ? "Edit logo in Logo Studio" : "Create a logo in Logo Studio"}
              </Button>
            </div>
```

(import `Wand2` in the existing lucide import line). And render, next to the page root (config is guaranteed non-null there):

```tsx
      <LogoStudio
        open={studioOpen}
        onOpenChange={setStudioOpen}
        config={config}
        onSaved={(patch) => setConfig({ ...config, ...patch })}
      />
```

- [ ] **Step 3: Setup assistant deep link**

In `frontend-customer/src/components/setup/catalog.ts` line 43:

```typescript
  look: { icon: Paintbrush, href: "/admin/design?studio=1" },
```

- [ ] **Step 4: Build**

Run: `cd frontend-customer && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add frontend-customer/src/components/owner/brand-tab.tsx frontend-customer/src/app/admin/design/page.tsx frontend-customer/src/components/setup/catalog.ts
git commit -m "feat(logo-studio): entry points — brand tab, design page, setup deep link"
```

---

### Task 10: Frontend — favicon/PWA icons prefer the square mark

**Files:**
- Modify: `frontend-customer/src/app/pwa-icon/route.tsx:25`
- Modify: `frontend-customer/src/app/manifest.ts` + any `pwa-icon?v=` producers (grep first)

**Interfaces:**
- Consumes: `icon_url` from the tenant config API (Task 2).

- [ ] **Step 1: Prefer the mark in the icon route**

In `pwa-icon/route.tsx` line 25:

```typescript
  // Prefer the Logo Studio's square mark; fall back to the wide logo, then
  // to the brand-initial tile.
  const logoUrl = config?.icon_url || config?.logo_url || null;
```

If the square mark exists it already contains its own badge background — render it edge-to-edge rather than padded onto the theme tile. Adjust: when `config?.icon_url` is set, use `pad = maskable ? Math.round(size * 0.06) : 0` (the mark's own badge provides the safe-zone margin).

- [ ] **Step 2: Version param**

Run: `grep -rn "pwa-icon" frontend-customer/src | grep -v route.tsx`
Wherever the versioned URL is built (e.g. `?v=${config.logo_id}` in `manifest.ts` / `layout.tsx`), change the version key to `config.icon_id ?? config.logo_id` so saving a new mark busts the immutable cache. Also confirm the config type used there (`lib/tenant.ts` or `types/tenant.ts`) includes `icon_url`/`icon_id` (added in Task 4).

- [ ] **Step 3: Build**

Run: `cd frontend-customer && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add frontend-customer/src/app/pwa-icon/route.tsx frontend-customer/src/app/manifest.ts
git commit -m "feat(logo-studio): favicon/PWA icons prefer the square mark"
```

---

### Task 11: E2E spec + full verification

**Files:**
- Create: `e2e/specs/15-logo-studio.spec.ts`

**Interfaces:**
- Consumes: `coachContext`, `TENANT` from `e2e/helpers/auth.ts`; the running dev stack (`make dev`, seeded demo tenant).

- [ ] **Step 1: Write the spec**

```typescript
// e2e/specs/15-logo-studio.spec.ts
//
// Coach opens the Logo Studio via the setup-assistant deep link, composes a
// logo (icon + name), saves, and the PATCH persists logo/icon/recipe. Also
// exercises the suggestions endpoint (deterministic fallback offline).

import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

test("coach creates a logo in the Logo Studio", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();

  await page.goto(`${TENANT}/admin/design?studio=1`);
  await expect(page.getByText("Logo Studio")).toBeVisible();

  // Compose: layout + a specific icon
  await page.getByRole("button", { name: "Icon + name" }).click();
  await page.getByRole("button", { name: "flower-2", exact: true }).click();

  // Suggestions work offline via the deterministic fallback
  await page.getByRole("button", { name: "Suggest ideas" }).click();
  await expect(page.getByTestId("logo-suggestions")).toBeVisible({ timeout: 15_000 });

  // Save → wait for the config PATCH and assert the payload persisted
  // Loose "admin/config" matcher — 09-builder.spec.ts matches the same PATCH
  // without the /v1 segment, so don't assume the exact browser-visible prefix.
  const patchPromise = page.waitForResponse(
    (resp) =>
      resp.url().includes("admin/config") &&
      resp.request().method() === "PATCH" &&
      resp.status() === 200,
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Use this logo" }).click();
  const patch = await patchPromise;
  const body = patch.request().postDataJSON();
  expect(body.logo_id).toBeTruthy();
  expect(body.icon_id).toBeTruthy();
  expect(body.logo_recipe.layout).toBe("icon_name");
  expect(body.logo_recipe.mark).toEqual({ type: "icon", icon: "flower-2" });

  // Dialog closes on success
  await expect(page.getByText("Logo Studio")).toBeHidden({ timeout: 15_000 });

  await coach.close();
});
```

- [ ] **Step 2: Run the new spec against the dev stack**

Run: `make dev` (if not up), then `cd e2e && npx playwright test specs/15-logo-studio.spec.ts`
Expected: PASS. Debug notes: PNG export requires MinIO reachable from the browser (`AWS_ENDPOINT_EXTERNAL` — same requirement as spec 05-media); if the save fails on the presign PUT, that spec's setup is the reference.

- [ ] **Step 3: Full verification sweep**

Run, expecting all green:
- `make test` (backend, all apps)
- `cd frontend-customer && npm run build`
- `cd e2e && npx playwright test` (full suite; Stripe specs auto-skip)
- `make lint`

- [ ] **Step 4: Manual smoke (required before claiming done)**

With `make dev` running, as a coach on the demo tenant:
1. Setup assistant → "look" item → lands in the open studio.
2. Compose with a Playfair Display font → saved PNG shows the serif font (this validates the font-inlining path — the classic failure mode renders Arial).
3. Upload a custom mark image → appears in preview → save → reopen studio → mark still renders (re-signed URL path).
4. Adjust placement: drag the badge, snap near center, save.
5. Check browser tab favicon + `/pwa-icon?size=512` shows the square mark.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add e2e/specs/15-logo-studio.spec.ts
git commit -m "test(logo-studio): e2e compose-and-save spec"
```

---

## Post-plan notes for the executor

- **Out of scope (deliberately):** blank-canvas freeform editor (fine-tune overrides only), AI *image* generation (recipes only), SVG-format export (PNG only — the pwa-icon renderer chokes on SVG logos), frontend-main signup-wizard entry point.
- **Follow-ups to surface after merge:** add `ANTHROPIC_API_KEY` to `.env.prod.example`; consider a `/po add` entry for "logo studio in signup wizard".
