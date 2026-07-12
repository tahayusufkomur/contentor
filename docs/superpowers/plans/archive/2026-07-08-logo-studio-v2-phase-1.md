# Logo Studio v2 — Phase 1: Schema v2 + Renderer Growth + Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the logo recipe from schema v1 to schema v2 (5 layouts, tagline, monogram/abstract/solid-icon marks, 7 badge shapes with gradient fills, 20 fonts with weight/tracking/case, 24 curated palettes) with lossless v1→v2 auto-migration on both sides, while the existing studio UI keeps working end-to-end.

**Architecture:** The recipe stays a versioned JSON blob; `LogoRenderer`/`MarkRenderer` stay the single source of truth for preview, export, favicon and PWA icons. A pure migration function exists twice — TS (`lib/logo/migrate.ts`) and Python (`apps/tenant_config/logo_recipe.py`) — with identical output, each carrying a KEEP-IN-SYNC comment naming the other. The backend accepts v1 and v2, upgrades v1 on read/write, and always persists v2. The current studio panels are minimally adapted to v2 field names (the new Brief/Wall/canvas UX is Phases 2–3; brand kit + AI upgrade is Phase 4).

**Tech Stack:** Django 5.1 + DRF (`apps.tenant_config`), Next.js 14 + lucide-react + Tailwind (frontend-customer), Vitest (new, pure-logic tests only), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-07-08-logo-studio-v2-design.md` (approved). This plan is Phase 1 of 4; Phases 2 (composer + wall), 3 (canvas editor), 4 (brand kit + AI) get their own plan files once this phase lands — matching the community-feature per-phase precedent.

## Global Constraints

- **Branch:** create `feat/logo-studio-v2` **from `main`** (`git checkout main && git checkout -b feat/logo-studio-v2`). The working tree is shared with other agents — before EVERY commit run `git branch --show-current` and abort if it is not `feat/logo-studio-v2`.
- **Never push. Never merge.** Commits on the feature branch only.
- Pre-commit must pass with zero issues. Pre-commit does NOT lint the frontends — run `npm run build` in `frontend-customer` yourself to catch TS errors before every commit that touches frontend code.
- Backend tests: `docker compose exec django pytest apps/tenant_config -v` (fast) or `make test`. No new model fields in this phase ⇒ no migrations.
- Frontend pure-logic tests: `npx vitest run` inside `frontend-customer` (set up in Task 1). React components are NOT unit-tested (repo convention) — they verify via `npm run build` + the e2e spec.
- **Known red-build window:** Tasks 1–3 flip `types/logo.ts` and `catalog.ts` to v2 before their consumers update, so `npm run build` is expected RED until Task 4 Step 4 restores it (vitest/pytest still gate each task). From Task 4 on, a clean build is mandatory before every commit. Do not "fix" the interim red build by re-adding v1 exports.
- `ANTHROPIC_API_KEY` stays optional; nothing in this phase may require it.
- KEEP-IN-SYNC pairs (each file must carry a comment naming its mirror):
  - `frontend-customer/src/lib/logo/catalog.ts` ⇄ `backend/apps/tenant_config/logo_ai.py` (icons/fonts — existing)
  - `frontend-customer/src/lib/logo/migrate.ts` ⇄ `backend/apps/tenant_config/logo_recipe.py` (v1→v2 migration — new)
- Recipe JSON schema **v2** — the single contract for this whole phase:

```json
{
  "version": 2,
  "layout": "horizontal | horizontal_reversed | stacked | name_only | emblem",
  "name": "Zeynep Yoga",
  "tagline": "",
  "mark": {"type": "icon", "icon": "flower-2", "style": "outline | solid"}
        | {"type": "initials", "style": "plain | monogram | split | overlap"}
        | {"type": "abstract", "family": "orbits | bloom | waves | prism | knot | grid", "seed": 7}
        | {"type": "image", "photo_id": "<uuid>", "url": "<signed or data url>"},
  "badge": {"shape": "none | circle | rounded | squircle | hexagon | shield | diamond", "outline": false},
  "typography": {
    "name":    {"font": "Playfair Display", "weight": 700, "tracking": 0, "case": "none | upper | title"},
    "tagline": {"font": "Inter", "weight": 500, "tracking": 0.08, "case": "upper"}
  },
  "colors": {
    "palette_id": "ink",
    "badge": {"type": "solid", "color": "#7c3aed"}
           | {"type": "linear", "from": "#7c3aed", "to": "#4f46e5", "angle": 135}
           | {"type": "radial", "from": "#7c3aed", "to": "#4f46e5"},
    "mark": "#ffffff",
    "text": "#111827",
    "tagline": "#6b7280"
  },
  "elements": {
    "mark":    {"offset": [0, 0], "scale": 1},
    "name":    {"offset": [0, 0], "scale": 1},
    "tagline": {"offset": [0, 0], "scale": 1}
  }
}
```

- v1→v2 migration contract (identical in TS and Python; the parity fixture in Tasks 1–2 encodes it):
  - `layout`: `badge_name`→`horizontal`, `icon_name`→`horizontal`, `name_only`→`name_only`. (v1's badge_name/icon_name rendered identically — only the badge field differed in practice.)
  - `mark`: icon → `{type:"icon", icon, style:"outline"}`; initials → `{type:"initials", style:"plain"}`; image → unchanged shape.
  - `badge` (string) → `{shape: <v1 badge>, outline: false}`.
  - `font` → `typography.name = {font, weight:700, tracking:0, case:"none"}`; `typography.tagline = {font, weight:500, tracking:0.08, case:"upper"}`.
  - `colors` → `{palette_id: null, badge:{type:"solid",color:badge_bg}, mark: mark_fg, text, tagline: "#6b7280"}`.
  - `overrides` → `elements` (`mark_offset/mark_scale`→`elements.mark`, `name_offset/name_scale`→`elements.name`, tagline zeroed).
  - `tagline` → `""`.

---

### Task 1: Frontend — Vitest + v2 types + `migrateRecipe`

**Files:**
- Modify: `frontend-customer/package.json` (add vitest devDependency + `test` script)
- Create: `frontend-customer/vitest.config.ts`
- Modify: `frontend-customer/src/types/logo.ts` (v2 types; keep v1 types for migration input)
- Create: `frontend-customer/src/lib/logo/migrate.ts`
- Test: `frontend-customer/src/lib/logo/__tests__/migrate.test.ts`

**Interfaces:**
- Produces (Tasks 3–9 rely on these exact names, from `@/types/logo`):
  - `RecipeLayout = "horizontal" | "horizontal_reversed" | "stacked" | "name_only" | "emblem"`
  - `BadgeShape`, `TextCase`, `FontWeight = 400|500|600|700|800`, `Fill`, `AbstractFamily`, `LogoMark`, `TextStyle`, `ElementPlacement`, `LogoRecipe` (version 2), `LogoRecipeV1`, `AnyLogoRecipe`
  - From `@/lib/logo/migrate`: `migrateRecipe(recipe: AnyLogoRecipe): LogoRecipe` and `isRecipe(value: unknown): value is AnyLogoRecipe` (replaces logo-studio's local `isCompleteRecipe`).

- [ ] **Step 1: Install vitest and add config**

```bash
cd frontend-customer && npm install -D vitest
```

`frontend-customer/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

// Pure-logic tests only (src/lib/logo). React components are covered by
// `npm run build` + the Playwright e2e suite, per repo convention.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { include: ["src/**/__tests__/**/*.test.ts"] },
});
```

Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 2: Rewrite `src/types/logo.ts` with v1 + v2 types**

```ts
// Logo Studio recipe types. v2 is the live schema; v1 is kept only as the
// input type for lib/logo/migrate.ts. Validation source of truth:
// backend/apps/tenant_config/logo_recipe.py.

export type RecipeLayoutV1 = "badge_name" | "icon_name" | "name_only";
export type RecipeBadgeV1 = "circle" | "rounded" | "squircle" | "none";
export type LogoMarkV1 =
  | { type: "icon"; icon: string }
  | { type: "initials" }
  | { type: "image"; photo_id: string; url: string };

export interface LogoRecipeV1 {
  version: 1;
  layout: RecipeLayoutV1;
  name: string;
  mark: LogoMarkV1;
  badge: RecipeBadgeV1;
  font: string;
  colors: { badge_bg: string; mark_fg: string; text: string };
  overrides: {
    mark_offset: [number, number];
    mark_scale: number;
    name_offset: [number, number];
    name_scale: number;
  };
}

export type RecipeLayout =
  | "horizontal"
  | "horizontal_reversed"
  | "stacked"
  | "name_only"
  | "emblem";
export type BadgeShape =
  | "none"
  | "circle"
  | "rounded"
  | "squircle"
  | "hexagon"
  | "shield"
  | "diamond";
export type TextCase = "none" | "upper" | "title";
export type FontWeight = 400 | 500 | 600 | 700 | 800;
export type AbstractFamily = "orbits" | "bloom" | "waves" | "prism" | "knot" | "grid";

export type Fill =
  | { type: "solid"; color: string }
  | { type: "linear"; from: string; to: string; angle: number }
  | { type: "radial"; from: string; to: string };

export type LogoMark =
  | { type: "icon"; icon: string; style: "outline" | "solid" }
  | { type: "initials"; style: "plain" | "monogram" | "split" | "overlap" }
  | { type: "abstract"; family: AbstractFamily; seed: number }
  | { type: "image"; photo_id: string; url: string };

export interface TextStyle {
  font: string;
  weight: FontWeight;
  tracking: number; // em-relative letter-spacing, e.g. 0.08
  case: TextCase;
}

export interface ElementPlacement {
  offset: [number, number];
  scale: number;
}

export interface LogoRecipe {
  version: 2;
  layout: RecipeLayout;
  name: string;
  tagline: string; // "" = no tagline element
  mark: LogoMark;
  badge: { shape: BadgeShape; outline: boolean };
  typography: { name: TextStyle; tagline: TextStyle };
  colors: {
    palette_id: string | null;
    badge: Fill;
    mark: string;
    text: string;
    tagline: string;
  };
  elements: { mark: ElementPlacement; name: ElementPlacement; tagline: ElementPlacement };
}

export type AnyLogoRecipe = LogoRecipeV1 | LogoRecipe;
```

- [ ] **Step 3: Write the failing migration test**

`frontend-customer/src/lib/logo/__tests__/migrate.test.ts` — the v1 fixture and expected v2 output below are the **parity fixture**: Task 2's Python test uses the exact same JSON.

```ts
import { describe, expect, it } from "vitest";
import { isRecipe, migrateRecipe } from "@/lib/logo/migrate";
import type { LogoRecipe, LogoRecipeV1 } from "@/types/logo";

// KEEP IN SYNC: backend/apps/tenant_config/tests/test_logo_recipe.py uses
// this exact fixture pair to guarantee TS/Python migration parity.
const V1: LogoRecipeV1 = {
  version: 1,
  layout: "badge_name",
  name: "Zeynep Yoga",
  mark: { type: "icon", icon: "flower-2" },
  badge: "circle",
  font: "Playfair Display",
  colors: { badge_bg: "#7c3aed", mark_fg: "#ffffff", text: "#111827" },
  overrides: { mark_offset: [4, -2], mark_scale: 1.2, name_offset: [0, 0], name_scale: 0.9 },
};

const V2: LogoRecipe = {
  version: 2,
  layout: "horizontal",
  name: "Zeynep Yoga",
  tagline: "",
  mark: { type: "icon", icon: "flower-2", style: "outline" },
  badge: { shape: "circle", outline: false },
  typography: {
    name: { font: "Playfair Display", weight: 700, tracking: 0, case: "none" },
    tagline: { font: "Playfair Display", weight: 500, tracking: 0.08, case: "upper" },
  },
  colors: {
    palette_id: null,
    badge: { type: "solid", color: "#7c3aed" },
    mark: "#ffffff",
    text: "#111827",
    tagline: "#6b7280",
  },
  elements: {
    mark: { offset: [4, -2], scale: 1.2 },
    name: { offset: [0, 0], scale: 0.9 },
    tagline: { offset: [0, 0], scale: 1 },
  },
};

describe("migrateRecipe", () => {
  it("upgrades the parity fixture exactly", () => {
    expect(migrateRecipe(V1)).toEqual(V2);
  });

  it("passes v2 recipes through untouched", () => {
    expect(migrateRecipe(V2)).toBe(V2);
  });

  it("maps icon_name to horizontal keeping the badge, initials to plain style", () => {
    const out = migrateRecipe({
      ...V1,
      layout: "icon_name",
      badge: "none",
      mark: { type: "initials" },
    });
    expect(out.layout).toBe("horizontal");
    expect(out.badge).toEqual({ shape: "none", outline: false });
    expect(out.mark).toEqual({ type: "initials", style: "plain" });
  });

  it("maps name_only to name_only and image marks unchanged", () => {
    const out = migrateRecipe({
      ...V1,
      layout: "name_only",
      mark: { type: "image", photo_id: "abc", url: "data:x" },
    });
    expect(out.layout).toBe("name_only");
    expect(out.mark).toEqual({ type: "image", photo_id: "abc", url: "data:x" });
  });
});

describe("isRecipe", () => {
  it("accepts v1 and v2, rejects junk", () => {
    expect(isRecipe(V1)).toBe(true);
    expect(isRecipe(V2)).toBe(true);
    expect(isRecipe(null)).toBe(false);
    expect(isRecipe({})).toBe(false);
    expect(isRecipe({ version: 3 })).toBe(false);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd frontend-customer && npx vitest run`
Expected: FAIL — cannot resolve `@/lib/logo/migrate`.

- [ ] **Step 5: Implement `src/lib/logo/migrate.ts`**

```ts
// v1 → v2 recipe migration. Pure, lossless for everything v1 could express.
// KEEP IN SYNC: backend/apps/tenant_config/logo_recipe.py implements the
// identical upgrade in Python — change both together (parity fixture:
// __tests__/migrate.test.ts / tests/test_logo_recipe.py).
import type {
  AnyLogoRecipe,
  LogoMark,
  LogoRecipe,
  TextStyle,
} from "@/types/logo";

export function isRecipe(value: unknown): value is AnyLogoRecipe {
  if (!value || typeof value !== "object") return false;
  const v = (value as { version?: unknown }).version;
  return v === 1 || v === 2;
}

export function migrateRecipe(recipe: AnyLogoRecipe): LogoRecipe {
  if (recipe.version === 2) return recipe;
  const mark: LogoMark =
    recipe.mark.type === "icon"
      ? { type: "icon", icon: recipe.mark.icon, style: "outline" }
      : recipe.mark.type === "image"
        ? { type: "image", photo_id: recipe.mark.photo_id, url: recipe.mark.url }
        : { type: "initials", style: "plain" };
  const name: TextStyle = { font: recipe.font, weight: 700, tracking: 0, case: "none" };
  return {
    version: 2,
    layout: recipe.layout === "name_only" ? "name_only" : "horizontal",
    name: recipe.name,
    tagline: "",
    mark,
    badge: { shape: recipe.badge, outline: false },
    typography: {
      name,
      tagline: { font: recipe.font, weight: 500, tracking: 0.08, case: "upper" },
    },
    colors: {
      palette_id: null,
      badge: { type: "solid", color: recipe.colors.badge_bg },
      mark: recipe.colors.mark_fg,
      text: recipe.colors.text,
      tagline: "#6b7280",
    },
    elements: {
      mark: { offset: recipe.overrides.mark_offset, scale: recipe.overrides.mark_scale },
      name: { offset: recipe.overrides.name_offset, scale: recipe.overrides.name_scale },
      tagline: { offset: [0, 0], scale: 1 },
    },
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend-customer && npx vitest run`
Expected: PASS (6 tests). Note: `npm run build` is expected to FAIL right now — `logo-renderer.tsx`/`logo-studio.tsx`/`catalog.ts` still use the removed v1 type shape. That is deliberate; Tasks 3–4 fix them. Do NOT run the build gate for this commit only.

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # must print feat/logo-studio-v2
git add frontend-customer/package.json frontend-customer/package-lock.json frontend-customer/vitest.config.ts frontend-customer/src/types/logo.ts frontend-customer/src/lib/logo/migrate.ts frontend-customer/src/lib/logo/__tests__/migrate.test.ts
git commit -m "feat(logo-v2): recipe v2 types + v1->v2 migration (vitest)"
```

---

### Task 2: Backend — `logo_recipe.py` (upgrade + v2 validation), serializer delegation

**Files:**
- Create: `backend/apps/tenant_config/logo_recipe.py`
- Modify: `backend/apps/tenant_config/serializers.py` (`validate_logo_recipe` delegates; keep `_clean_photo_id` usage)
- Test: `backend/apps/tenant_config/tests/test_logo_recipe.py` (new)
- Modify: `backend/apps/tenant_config/tests/test_logo_studio.py` (v1-PATCH assertions now expect upgraded v2 output)

**Interfaces:**
- Consumes: the parity fixture from Task 1.
- Produces: `logo_recipe.upgrade_recipe(value: dict) -> dict` (v1 dict → v2 dict; v2 passthrough), `logo_recipe.validate_recipe(value: dict) -> dict` (defensively shaped v2; raises `rest_framework.serializers.ValidationError` on bad enums). `TenantConfigSerializer.validate_logo_recipe` returns `{}` for empty dict, else `validate_recipe(upgrade_recipe(value))`. PATCHing a v1 recipe persists and returns v2. Read path (`to_representation`) also upgrades stored v1 blobs so GET always serves v2.

- [ ] **Step 1: Write the failing tests**

`backend/apps/tenant_config/tests/test_logo_recipe.py`:

```python
"""Migration parity + v2 validation for the Logo Studio recipe.

KEEP IN SYNC: the V1/V2 parity fixture mirrors
frontend-customer/src/lib/logo/__tests__/migrate.test.ts exactly.
"""

import pytest
from rest_framework import serializers as drf_serializers

from apps.tenant_config.logo_recipe import upgrade_recipe, validate_recipe

V1 = {
    "version": 1,
    "layout": "badge_name",
    "name": "Zeynep Yoga",
    "mark": {"type": "icon", "icon": "flower-2"},
    "badge": "circle",
    "font": "Playfair Display",
    "colors": {"badge_bg": "#7c3aed", "mark_fg": "#ffffff", "text": "#111827"},
    "overrides": {"mark_offset": [4, -2], "mark_scale": 1.2, "name_offset": [0, 0], "name_scale": 0.9},
}

V2 = {
    "version": 2,
    "layout": "horizontal",
    "name": "Zeynep Yoga",
    "tagline": "",
    "mark": {"type": "icon", "icon": "flower-2", "style": "outline"},
    "badge": {"shape": "circle", "outline": False},
    "typography": {
        "name": {"font": "Playfair Display", "weight": 700, "tracking": 0, "case": "none"},
        "tagline": {"font": "Playfair Display", "weight": 500, "tracking": 0.08, "case": "upper"},
    },
    "colors": {
        "palette_id": None,
        "badge": {"type": "solid", "color": "#7c3aed"},
        "mark": "#ffffff",
        "text": "#111827",
        "tagline": "#6b7280",
    },
    "elements": {
        "mark": {"offset": [4, -2], "scale": 1.2},
        "name": {"offset": [0, 0], "scale": 0.9},
        "tagline": {"offset": [0, 0], "scale": 1},
    },
}


def test_upgrade_matches_ts_parity_fixture():
    assert upgrade_recipe(V1) == V2


def test_upgrade_passes_v2_through():
    assert upgrade_recipe(V2) == V2


def test_upgrade_icon_name_and_initials_and_image():
    out = upgrade_recipe({**V1, "layout": "icon_name", "badge": "none", "mark": {"type": "initials"}})
    assert out["layout"] == "horizontal"
    assert out["badge"] == {"shape": "none", "outline": False}
    assert out["mark"] == {"type": "initials", "style": "plain"}
    out = upgrade_recipe({**V1, "layout": "name_only", "mark": {"type": "image", "photo_id": "abc", "url": "x"}})
    assert out["layout"] == "name_only"
    assert out["mark"]["type"] == "image"


def test_validate_recipe_shapes_valid_v2():
    shaped = validate_recipe(V2)
    assert shaped == {**V2, "mark": {"type": "icon", "icon": "flower-2", "style": "outline"}}


def test_validate_recipe_rejects_bad_enums():
    for patch in (
        {"layout": "diagonal"},
        {"badge": {"shape": "star", "outline": False}},
        {"mark": {"type": "hologram"}},
        {"mark": {"type": "icon", "icon": "flower-2", "style": "3d"}},
        {"mark": {"type": "initials", "style": "cursive"}},
        {"mark": {"type": "abstract", "family": "fractal", "seed": 1}},
        {"colors": {**V2["colors"], "badge": {"type": "conic", "color": "#fff"}}},
    ):
        with pytest.raises(drf_serializers.ValidationError):
            validate_recipe({**V2, **patch})


def test_validate_recipe_clamps_freeform_values():
    noisy = {
        **V2,
        "name": "x" * 300,
        "tagline": "y" * 300,
        "typography": {
            "name": {"font": "F" * 300, "weight": 900, "tracking": 9, "case": "sideways"},
            "tagline": {"font": "", "weight": "bold", "tracking": -9, "case": "upper"},
        },
        "colors": {**V2["colors"], "mark": "purple", "text": None, "tagline": 5, "palette_id": "p" * 99},
        "elements": {
            "mark": {"offset": [999, -999], "scale": 99},
            "name": {"offset": "junk", "scale": None},
            "tagline": {"offset": [1, 2], "scale": 0.01},
        },
    }
    shaped = validate_recipe(noisy)
    assert len(shaped["name"]) == 80 and len(shaped["tagline"]) == 120
    assert shaped["typography"]["name"]["weight"] == 700  # unknown weight -> default
    assert shaped["typography"]["name"]["case"] == "none"
    assert shaped["typography"]["name"]["tracking"] == 0.4  # clamped to max
    assert shaped["typography"]["tagline"]["tracking"] == -0.1  # clamped to min
    assert shaped["colors"]["mark"] == "#ffffff" and shaped["colors"]["text"] == "#111827"
    assert shaped["colors"]["palette_id"] is None  # unknown/overlong id -> null
    assert shaped["elements"]["mark"] == {"offset": [120, -120], "scale": 3.0}
    assert shaped["elements"]["name"] == {"offset": [0, 0], "scale": 1.0}
    assert shaped["elements"]["tagline"]["scale"] == 0.4


def test_validate_recipe_abstract_seed_clamped_to_int():
    shaped = validate_recipe({**V2, "mark": {"type": "abstract", "family": "bloom", "seed": 7.9}})
    assert shaped["mark"] == {"type": "abstract", "family": "bloom", "seed": 7}
    shaped = validate_recipe({**V2, "mark": {"type": "abstract", "family": "bloom", "seed": "x"}})
    assert shaped["mark"]["seed"] == 1
```

In `test_logo_studio.py`, update every assertion that PATCHes a v1 recipe and asserts the stored/echoed value: the response and `config.logo_recipe` now contain the **upgraded v2** shape (`version == 2`, `layout == "horizontal"`, `mark` gains `"style": "outline"`, etc.). Where a test asserts exact equality with the v1 payload, assert against `upgrade_recipe(<that payload>)` instead (import it at the top of the file).

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_recipe.py -v`
Expected: FAIL — `ModuleNotFoundError: apps.tenant_config.logo_recipe`.

- [ ] **Step 3: Implement `backend/apps/tenant_config/logo_recipe.py`**

```python
"""Logo Studio recipe v2: v1 upgrade + defensive validation.

KEEP IN SYNC: frontend-customer/src/lib/logo/migrate.ts implements the
identical v1->v2 upgrade in TypeScript — change both together (parity
fixture: tests/test_logo_recipe.py / __tests__/migrate.test.ts).

Philosophy matches v1 validation (serializers.validate_logo_recipe):
unknown enum values are a hard 400 (the studio/composer never produces
them); free text and numbers are clamped, not rejected.
"""

import re

from rest_framework import serializers

LAYOUTS = {"horizontal", "horizontal_reversed", "stacked", "name_only", "emblem"}
BADGE_SHAPES = {"none", "circle", "rounded", "squircle", "hexagon", "shield", "diamond"}
MARK_TYPES = {"icon", "initials", "abstract", "image"}
ICON_STYLES = {"outline", "solid"}
INITIALS_STYLES = {"plain", "monogram", "split", "overlap"}
ABSTRACT_FAMILIES = {"orbits", "bloom", "waves", "prism", "knot", "grid"}
FILL_TYPES = {"solid", "linear", "radial"}
CASES = {"none", "upper", "title"}
WEIGHTS = {400, 500, 600, 700, 800}

_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
# Curated palette ids; KEEP IN SYNC with PALETTES in
# frontend-customer/src/lib/logo/catalog.ts ("theme" is the tenant-derived one).
PALETTE_IDS = {
    "theme", "ink", "slate", "forest", "terracotta", "rose", "violet", "amber",
    "ocean-fade", "sunset-fade", "mint-fade", "berry-fade", "midnight-fade", "gold-fade",
    "sage", "clay", "sky", "plum", "sand", "coral", "pine", "mono", "cocoa", "lavender",
}


def _hex(value, default):
    value = str(value or "")
    return value if _HEX_RE.match(value) else default


def _num(value, lo, hi, default):
    try:
        return max(lo, min(hi, float(value)))
    except (TypeError, ValueError):
        return default


def upgrade_recipe(value):
    """v1 dict -> v2 dict; v2 (or anything else) passes through untouched."""
    if not isinstance(value, dict) or value.get("version") != 1:
        return value
    raw_mark = value.get("mark") if isinstance(value.get("mark"), dict) else {}
    if raw_mark.get("type") == "icon":
        mark = {"type": "icon", "icon": raw_mark.get("icon", ""), "style": "outline"}
    elif raw_mark.get("type") == "image":
        mark = {"type": "image", "photo_id": raw_mark.get("photo_id", ""), "url": raw_mark.get("url", "")}
    else:
        mark = {"type": "initials", "style": "plain"}
    colors = value.get("colors") if isinstance(value.get("colors"), dict) else {}
    over = value.get("overrides") if isinstance(value.get("overrides"), dict) else {}
    font = value.get("font", "Inter")
    return {
        "version": 2,
        "layout": "name_only" if value.get("layout") == "name_only" else "horizontal",
        "name": value.get("name", ""),
        "tagline": "",
        "mark": mark,
        "badge": {"shape": value.get("badge", "circle"), "outline": False},
        "typography": {
            "name": {"font": font, "weight": 700, "tracking": 0, "case": "none"},
            "tagline": {"font": font, "weight": 500, "tracking": 0.08, "case": "upper"},
        },
        "colors": {
            "palette_id": None,
            "badge": {"type": "solid", "color": colors.get("badge_bg", "#111827")},
            "mark": colors.get("mark_fg", "#ffffff"),
            "text": colors.get("text", "#111827"),
            "tagline": "#6b7280",
        },
        "elements": {
            "mark": {"offset": over.get("mark_offset", [0, 0]), "scale": over.get("mark_scale", 1)},
            "name": {"offset": over.get("name_offset", [0, 0]), "scale": over.get("name_scale", 1)},
            "tagline": {"offset": [0, 0], "scale": 1},
        },
    }


def _enum(value, allowed, field):
    if value not in allowed:
        raise serializers.ValidationError(f"{field} must be one of: " + ", ".join(sorted(str(a) for a in allowed)) + ".")
    return value


def _fill(value, default_color):
    value = value if isinstance(value, dict) else {}
    fill_type = _enum(value.get("type"), FILL_TYPES, "fill.type")
    if fill_type == "solid":
        return {"type": "solid", "color": _hex(value.get("color"), default_color)}
    fill = {"type": fill_type, "from": _hex(value.get("from"), default_color), "to": _hex(value.get("to"), default_color)}
    if fill_type == "linear":
        fill["angle"] = _num(value.get("angle"), 0, 360, 135)
    return fill


def _text_style(value, default_weight):
    value = value if isinstance(value, dict) else {}
    weight = value.get("weight")
    return {
        "font": str(value.get("font") or "Inter")[:100],
        "weight": weight if weight in WEIGHTS else default_weight,
        "tracking": _num(value.get("tracking"), -0.1, 0.4, 0),
        "case": value.get("case") if value.get("case") in CASES else "none",
    }


def _placement(value):
    value = value if isinstance(value, dict) else {}
    pair = value.get("offset") or [0, 0]
    if not isinstance(pair, list | tuple) or len(pair) != 2:
        pair = [0, 0]
    return {
        "offset": [_num(pair[0], -120, 120, 0), _num(pair[1], -120, 120, 0)],
        "scale": _num(value.get("scale"), 0.4, 3.0, 1.0),
    }


def validate_recipe(value, clean_photo_id=lambda v: str(v or "")):
    """Defensively shape a v2 recipe dict. Raises ValidationError on bad
    enums; clamps free text/numbers. ``clean_photo_id`` is injected by the
    serializer so image marks reuse its UUID clamping."""
    raw_mark = value.get("mark") if isinstance(value.get("mark"), dict) else {}
    mark_type = _enum(raw_mark.get("type"), MARK_TYPES, "mark.type")
    if mark_type == "icon":
        mark = {
            "type": "icon",
            "icon": str(raw_mark.get("icon") or "")[:60],
            "style": _enum(raw_mark.get("style", "outline"), ICON_STYLES, "mark.style"),
        }
    elif mark_type == "initials":
        mark = {"type": "initials", "style": _enum(raw_mark.get("style", "plain"), INITIALS_STYLES, "mark.style")}
    elif mark_type == "abstract":
        mark = {
            "type": "abstract",
            "family": _enum(raw_mark.get("family"), ABSTRACT_FAMILIES, "mark.family"),
            "seed": int(_num(raw_mark.get("seed"), 0, 10_000_000, 1)),
        }
    else:  # image — never persist urls; re-derived on read from photo_id.
        mark = {"type": "image", "photo_id": clean_photo_id(raw_mark.get("photo_id")), "url": ""}

    raw_badge = value.get("badge") if isinstance(value.get("badge"), dict) else {}
    raw_typo = value.get("typography") if isinstance(value.get("typography"), dict) else {}
    raw_colors = value.get("colors") if isinstance(value.get("colors"), dict) else {}
    raw_elements = value.get("elements") if isinstance(value.get("elements"), dict) else {}
    palette_id = raw_colors.get("palette_id")

    return {
        "version": 2,
        "layout": _enum(value.get("layout"), LAYOUTS, "layout"),
        "name": str(value.get("name") or "")[:80],
        "tagline": str(value.get("tagline") or "")[:120],
        "mark": mark,
        "badge": {
            "shape": _enum(raw_badge.get("shape"), BADGE_SHAPES, "badge.shape"),
            "outline": bool(raw_badge.get("outline", False)),
        },
        "typography": {
            "name": _text_style(raw_typo.get("name"), 700),
            "tagline": _text_style(raw_typo.get("tagline"), 500),
        },
        "colors": {
            "palette_id": palette_id if palette_id in PALETTE_IDS else None,
            "badge": _fill(raw_colors.get("badge"), "#111827"),
            "mark": _hex(raw_colors.get("mark"), "#ffffff"),
            "text": _hex(raw_colors.get("text"), "#111827"),
            "tagline": _hex(raw_colors.get("tagline"), "#6b7280"),
        },
        "elements": {
            "mark": _placement(raw_elements.get("mark")),
            "name": _placement(raw_elements.get("name")),
            "tagline": _placement(raw_elements.get("tagline")),
        },
    }
```

- [ ] **Step 4: Delegate from the serializer (write path + read path)**

In `serializers.py`, add `from . import logo_recipe as logo_recipe_lib` to the imports, replace the body of `validate_logo_recipe` with:

```python
    def validate_logo_recipe(self, value):
        """Defensively shape the Logo Studio recipe (schema v2; v1 input is
        upgraded first). Empty dict clears the saved design. See
        logo_recipe.validate_recipe for the shape contract."""
        if not isinstance(value, dict):
            raise serializers.ValidationError("logo_recipe must be an object.")
        if not value:
            return {}
        return logo_recipe_lib.validate_recipe(
            logo_recipe_lib.upgrade_recipe(value), clean_photo_id=_clean_photo_id
        )
```

and delete the now-unused module constants `_RECIPE_LAYOUTS`, `_RECIPE_BADGES`, `_RECIPE_MARK_TYPES` (keep `_HEX_RE`, `_clean_hex`, `_clamp` — other validators use them). In `to_representation`, upgrade stored v1 blobs before the image-mark re-signing block:

```python
        recipe = data.get("logo_recipe")
        if isinstance(recipe, dict) and recipe.get("version") == 1:
            recipe = logo_recipe_lib.upgrade_recipe(recipe)
            data["logo_recipe"] = recipe
```

(the existing `mark.get("type") == "image"` re-signing code below it works unchanged on the upgraded dict).

- [ ] **Step 5: Run the tenant_config suite**

Run: `docker compose exec django pytest apps/tenant_config -v`
Expected: `test_logo_recipe.py` all PASS; `test_logo_studio.py` PASS after its Step-1 assertion updates; everything else untouched and green.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must print feat/logo-studio-v2
git add backend/apps/tenant_config/logo_recipe.py backend/apps/tenant_config/serializers.py backend/apps/tenant_config/tests/test_logo_recipe.py backend/apps/tenant_config/tests/test_logo_studio.py
git commit -m "feat(logo-v2): backend recipe v2 validation + v1 upgrade on read/write"
```

---

### Task 3: Frontend — catalog v2 (fonts with vibes/weights, 24 palettes, fill helpers, defaultRecipe v2)

**Files:**
- Modify: `frontend-customer/src/lib/logo/catalog.ts`
- Test: `frontend-customer/src/lib/logo/__tests__/catalog.test.ts` (new)

**Interfaces:**
- Consumes: Task 1 types.
- Produces (Tasks 4–8 + Phase 2 rely on these exact names):
  - `LOGO_ICONS`, `ICON_GROUPS`, `initialsFor` — unchanged.
  - `FontEntry = { family: string; vibe: FontVibe; weights: FontWeight[] }`, `FontVibe = "Modern"|"Elegant"|"Bold"|"Playful"|"Minimal"`, `LOGO_FONTS: FontEntry[]` (20 entries), `LOGO_FONT_FAMILIES: string[]`, `fontEntry(family: string): FontEntry`.
  - `Palette = { id: string; label: string; badge: Fill; mark: string; text: string; tagline: string }`, `PALETTES(primaryHex: string): Palette[]` (24 entries, first id `"theme"`), `applyPalette(recipe: LogoRecipe, p: Palette): LogoRecipe`.
  - `TEXT_COLORS(primaryHex)` — unchanged.
  - `defaultRecipe(brandName: string, primaryHex: string): LogoRecipe` — now returns v2.

- [ ] **Step 1: Write the failing catalog test**

`frontend-customer/src/lib/logo/__tests__/catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  LOGO_FONTS, LOGO_FONT_FAMILIES, PALETTES, defaultRecipe, fontEntry,
} from "@/lib/logo/catalog";

const HEX = /^#[0-9a-fA-F]{6}$/;

describe("font catalog", () => {
  it("has 20 fonts across 5 vibes with legal weights", () => {
    expect(LOGO_FONTS).toHaveLength(20);
    expect(new Set(LOGO_FONTS.map((f) => f.vibe)).size).toBe(5);
    for (const f of LOGO_FONTS) {
      expect(f.weights.length).toBeGreaterThanOrEqual(4);
      for (const w of f.weights) expect([400, 500, 600, 700, 800]).toContain(w);
    }
    expect(new Set(LOGO_FONT_FAMILIES).size).toBe(20);
  });

  it("fontEntry falls back to Inter for unknown families", () => {
    expect(fontEntry("Nope").family).toBe("Inter");
    expect(fontEntry("Lora").family).toBe("Lora");
  });
});

describe("palettes", () => {
  it("has 24 unique palettes, theme first, valid colors", () => {
    const palettes = PALETTES("#1a56db");
    expect(palettes).toHaveLength(24);
    expect(palettes[0].id).toBe("theme");
    expect(new Set(palettes.map((p) => p.id)).size).toBe(24);
    for (const p of palettes) {
      expect(p.mark).toMatch(HEX);
      expect(p.text).toMatch(HEX);
      expect(p.tagline).toMatch(HEX);
      if (p.badge.type === "solid") expect(p.badge.color).toMatch(HEX);
      else {
        expect(p.badge.from).toMatch(HEX);
        expect(p.badge.to).toMatch(HEX);
      }
    }
  });
});

describe("defaultRecipe", () => {
  it("returns a v2 recipe seeded from the brand", () => {
    const r = defaultRecipe("Zeynep Yoga", "#1a56db");
    expect(r.version).toBe(2);
    expect(r.layout).toBe("horizontal");
    expect(r.colors.badge).toEqual({ type: "solid", color: "#1a56db" });
    expect(r.typography.name.weight).toBe(700);
    expect(r.elements.tagline).toEqual({ offset: [0, 0], scale: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend-customer && npx vitest run src/lib/logo/__tests__/catalog.test.ts`
Expected: FAIL — `LOGO_FONTS` has 8 string entries / missing exports.

- [ ] **Step 3: Rewrite the fonts/palettes/default sections of `catalog.ts`**

Keep the file header, `LOGO_ICONS`, `ICON_GROUPS`, `initialsFor` as they are (the KEEP-IN-SYNC comment with `logo_ai.py` stays). Add `import type { Fill, FontWeight, LogoRecipe } from "@/types/logo";` (the `Palette` interface is defined in this file, not in types). Replace `LOGO_FONTS`, `COLOR_PAIRS`, `defaultRecipe` with:

```ts
export type FontVibe = "Modern" | "Elegant" | "Bold" | "Playful" | "Minimal";
export interface FontEntry {
  family: string;
  vibe: FontVibe;
  weights: FontWeight[];
}

const W_FULL: FontWeight[] = [400, 500, 600, 700, 800];
const W_TO_700: FontWeight[] = [400, 500, 600, 700];

// 20 Google Fonts, 4 per vibe. weights list which of 400..800 the family
// actually ships — the UI and export must only request these.
export const LOGO_FONTS: FontEntry[] = [
  { family: "Inter", vibe: "Modern", weights: W_FULL },
  { family: "Geist", vibe: "Modern", weights: W_FULL },
  { family: "DM Sans", vibe: "Modern", weights: W_FULL },
  { family: "Plus Jakarta Sans", vibe: "Modern", weights: W_FULL },
  { family: "Playfair Display", vibe: "Elegant", weights: W_FULL },
  { family: "Lora", vibe: "Elegant", weights: W_TO_700 },
  { family: "EB Garamond", vibe: "Elegant", weights: W_FULL },
  { family: "Cormorant Garamond", vibe: "Elegant", weights: W_TO_700 },
  { family: "Poppins", vibe: "Bold", weights: W_FULL },
  { family: "Montserrat", vibe: "Bold", weights: W_FULL },
  { family: "Archivo", vibe: "Bold", weights: W_FULL },
  { family: "Space Grotesk", vibe: "Bold", weights: W_TO_700 },
  { family: "Nunito", vibe: "Playful", weights: W_FULL },
  { family: "Quicksand", vibe: "Playful", weights: W_TO_700 },
  { family: "Baloo 2", vibe: "Playful", weights: W_FULL },
  { family: "Fredoka", vibe: "Playful", weights: W_TO_700 },
  { family: "Work Sans", vibe: "Minimal", weights: W_FULL },
  { family: "Manrope", vibe: "Minimal", weights: W_FULL },
  { family: "Sora", vibe: "Minimal", weights: W_FULL },
  { family: "Outfit", vibe: "Minimal", weights: W_FULL },
];

export const LOGO_FONT_FAMILIES = LOGO_FONTS.map((f) => f.family);

export function fontEntry(family: string): FontEntry {
  return LOGO_FONTS.find((f) => f.family === family) ?? LOGO_FONTS[0];
}

export interface Palette {
  id: string;
  label: string;
  badge: Fill;
  mark: string;
  text: string;
  tagline: string;
}

const solid = (color: string): Fill => ({ type: "solid", color });
const linear = (from: string, to: string, angle = 135): Fill => ({ type: "linear", from, to, angle });

// 24 curated palettes. KEEP IN SYNC: backend/apps/tenant_config/
// logo_recipe.py PALETTE_IDS lists exactly these ids.
export function PALETTES(primaryHex: string): Palette[] {
  return [
    { id: "theme", label: "Your theme", badge: solid(primaryHex), mark: "#ffffff", text: "#111827", tagline: "#6b7280" },
    { id: "ink", label: "Ink", badge: solid("#111827"), mark: "#ffffff", text: "#111827", tagline: "#6b7280" },
    { id: "slate", label: "Slate", badge: solid("#334155"), mark: "#ffffff", text: "#334155", tagline: "#64748b" },
    { id: "forest", label: "Forest", badge: solid("#15803d"), mark: "#ffffff", text: "#14532d", tagline: "#4d7c0f" },
    { id: "terracotta", label: "Terracotta", badge: solid("#c2410c"), mark: "#fff7ed", text: "#7c2d12", tagline: "#9a3412" },
    { id: "rose", label: "Rose", badge: solid("#e11d48"), mark: "#fff1f2", text: "#881337", tagline: "#9f1239" },
    { id: "violet", label: "Violet", badge: solid("#7c3aed"), mark: "#f5f3ff", text: "#4c1d95", tagline: "#6d28d9" },
    { id: "amber", label: "Amber", badge: solid("#f59e0b"), mark: "#1f2937", text: "#78350f", tagline: "#92400e" },
    { id: "ocean-fade", label: "Ocean fade", badge: linear("#0ea5e9", "#1d4ed8"), mark: "#ffffff", text: "#0c4a6e", tagline: "#0369a1" },
    { id: "sunset-fade", label: "Sunset fade", badge: linear("#f97316", "#e11d48"), mark: "#ffffff", text: "#7c2d12", tagline: "#c2410c" },
    { id: "mint-fade", label: "Mint fade", badge: linear("#34d399", "#0d9488"), mark: "#022c22", text: "#134e4a", tagline: "#0f766e" },
    { id: "berry-fade", label: "Berry fade", badge: linear("#a855f7", "#db2777"), mark: "#ffffff", text: "#581c87", tagline: "#86198f" },
    { id: "midnight-fade", label: "Midnight fade", badge: linear("#1e293b", "#0f172a"), mark: "#93c5fd", text: "#0f172a", tagline: "#475569" },
    { id: "gold-fade", label: "Gold fade", badge: linear("#fbbf24", "#d97706"), mark: "#451a03", text: "#78350f", tagline: "#a16207" },
    { id: "sage", label: "Sage", badge: solid("#84a98c"), mark: "#f0fdf4", text: "#354f52", tagline: "#52796f" },
    { id: "clay", label: "Clay", badge: solid("#b08968"), mark: "#fefae0", text: "#5f4b32", tagline: "#7f5539" },
    { id: "sky", label: "Sky", badge: solid("#38bdf8"), mark: "#082f49", text: "#0c4a6e", tagline: "#0284c7" },
    { id: "plum", label: "Plum", badge: solid("#6b21a8"), mark: "#faf5ff", text: "#3b0764", tagline: "#7e22ce" },
    { id: "sand", label: "Sand", badge: solid("#e7e5e4"), mark: "#44403c", text: "#292524", tagline: "#78716c" },
    { id: "coral", label: "Coral", badge: solid("#fb7185"), mark: "#4c0519", text: "#881337", tagline: "#be123c" },
    { id: "pine", label: "Pine", badge: solid("#065f46"), mark: "#d1fae5", text: "#064e3b", tagline: "#047857" },
    { id: "mono", label: "Mono", badge: solid("#404040"), mark: "#fafafa", text: "#171717", tagline: "#737373" },
    { id: "cocoa", label: "Cocoa", badge: solid("#4a2c2a"), mark: "#fde68a", text: "#3f1d1b", tagline: "#78350f" },
    { id: "lavender", label: "Lavender", badge: solid("#c4b5fd"), mark: "#312e81", text: "#3730a3", tagline: "#6366f1" },
  ];
}

export function applyPalette(recipe: LogoRecipe, p: Palette): LogoRecipe {
  return {
    ...recipe,
    colors: { palette_id: p.id, badge: p.badge, mark: p.mark, text: p.text, tagline: p.tagline },
  };
}

export function TEXT_COLORS(primaryHex: string): string[] {
  return ["#111827", "#334155", primaryHex, "#ffffff"];
}

export function defaultRecipe(brandName: string, primaryHex: string): LogoRecipe {
  return {
    version: 2,
    layout: "horizontal",
    name: brandName || "My Brand",
    tagline: "",
    mark: { type: "initials", style: "plain" },
    badge: { shape: "circle", outline: false },
    typography: {
      name: { font: "Inter", weight: 700, tracking: 0, case: "none" },
      tagline: { font: "Inter", weight: 500, tracking: 0.08, case: "upper" },
    },
    colors: {
      palette_id: "theme",
      badge: { type: "solid", color: primaryHex },
      mark: "#ffffff",
      text: "#111827",
      tagline: "#6b7280",
    },
    elements: {
      mark: { offset: [0, 0], scale: 1 },
      name: { offset: [0, 0], scale: 1 },
      tagline: { offset: [0, 0], scale: 1 },
    },
  };
}
```

Delete `COLOR_PAIRS` (replaced by `PALETTES`; Task 4 updates its one consumer).

- [ ] **Step 4: Run tests**

Run: `cd frontend-customer && npx vitest run`
Expected: PASS (catalog + migrate suites). Build still red until Task 4 — expected.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/logo-studio-v2
git add frontend-customer/src/lib/logo/catalog.ts frontend-customer/src/lib/logo/__tests__/catalog.test.ts
git commit -m "feat(logo-v2): font vibes/weights catalog, 24 palettes, v2 defaultRecipe"
```

---

### Task 4: Frontend — renderer v2 (layout engine, tagline, fills) + studio adaptation; build green again

**Files:**
- Modify: `frontend-customer/src/components/logo/logo-renderer.tsx` (substantial rewrite)
- Modify: `frontend-customer/src/components/logo/logo-studio.tsx` (v2 field adaptation, no UX redesign)
- Modify: `frontend-customer/src/lib/logo/export.ts` (multi-font/weight embedding)

**Interfaces:**
- Consumes: Tasks 1, 3 (`migrateRecipe`, `isRecipe`, `fontEntry`, `PALETTES`, `applyPalette`, `defaultRecipe`).
- Produces (Tasks 5–9 + Phases 2–3 rely on these):
  - `logoViewBox(layout: RecipeLayout): { w: number; h: number }` — horizontal/horizontal_reversed/name_only → 640×200, stacked → 480×360, emblem → 480×400.
  - `LogoRenderer({ recipe, width, className, svgRef, onPointerDown, onPointerMove, onPointerUp })` — accepts v2 only; `data-part` groups now `"mark" | "name" | "tagline"`.
  - `MarkRenderer({ recipe, size, svgRef })` — v2; never renders name/tagline; `name_only` falls back to an initials mark (other layouts, emblem included, carry a real mark); `badge.shape:"none"` falls back to `"rounded"` in the fallback case (v1 rule carried over).
  - `useFillPaint` helper stays internal; gradient `<defs>` ids are namespaced with React `useId()` so many renderers can coexist on one page (the Phase-2 wall needs this).
  - `svgToPngBlob(svg, width, height, fonts: {family: string; weight: number}[])` — signature change (was a single `fontFamily` string).

- [ ] **Step 1: Rewrite `logo-renderer.tsx`**

Full replacement (keep the file-header comment about single source of truth):

```tsx
// Pure SVG renderer for a Logo Studio recipe (schema v2). Single source of
// truth: live preview, fine-tune canvas, suggestion/wall cards, and PNG/SVG
// export all render through this component, so they can never drift.
"use client";

import { useId, type Ref } from "react";
import { LOGO_ICONS, initialsFor } from "@/lib/logo/catalog";
import type { Fill, LogoRecipe, RecipeLayout, TextStyle } from "@/types/logo";

export const MARK_VIEWBOX = 256;

export function logoViewBox(layout: RecipeLayout): { w: number; h: number } {
  if (layout === "stacked") return { w: 480, h: 360 };
  if (layout === "emblem") return { w: 480, h: 400 };
  return { w: 640, h: 200 };
}

function applyCase(text: string, style: TextStyle): string {
  if (style.case === "upper") return text.toUpperCase();
  if (style.case === "title")
    return text.replace(/\S+/g, (w) => w[0]!.toUpperCase() + w.slice(1));
  return text;
}

/** Fitted font size so `text` occupies at most `budget` px width. */
function fitFontSize(text: string, style: TextStyle, budget: number, max = 80): number {
  const perChar = 0.58 + style.tracking;
  return Math.max(22, Math.min(max, budget / (perChar * Math.max(text.length, 3))));
}

/** Paints a Fill: solid -> color string; gradients -> url(#id) + <defs>. */
function useFillPaint(fill: Fill, key: string): { paint: string; defs: React.ReactNode } {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (fill.type === "solid") return { paint: fill.color, defs: null };
  const id = `lg-${key}-${uid}`;
  if (fill.type === "linear") {
    const rad = ((fill.angle - 90) * Math.PI) / 180;
    const x = Math.cos(rad) / 2, y = Math.sin(rad) / 2;
    return {
      paint: `url(#${id})`,
      defs: (
        <linearGradient id={id} x1={0.5 - x} y1={0.5 - y} x2={0.5 + x} y2={0.5 + y}>
          <stop offset="0%" stopColor={fill.from} />
          <stop offset="100%" stopColor={fill.to} />
        </linearGradient>
      ),
    };
  }
  return {
    paint: `url(#${id})`,
    defs: (
      <radialGradient id={id}>
        <stop offset="0%" stopColor={fill.from} />
        <stop offset="100%" stopColor={fill.to} />
      </radialGradient>
    ),
  };
}

const SQUIRCLE_RX = 48 / 160;
const ROUNDED_RX = 24 / 160;

export function Badge({
  shape, size, paint, outline,
}: { shape: string; size: number; paint: string; outline: boolean }) {
  if (shape === "none") return null;
  const stroke = outline
    ? { fill: "none", stroke: paint, strokeWidth: size * 0.05 }
    : { fill: paint };
  const inset = outline ? size * 0.025 : 0;
  const s = size - inset * 2;
  if (shape === "circle") return <circle cx={size / 2} cy={size / 2} r={s / 2} {...stroke} />;
  if (shape === "rounded" || shape === "squircle") {
    const rx = (shape === "squircle" ? SQUIRCLE_RX : ROUNDED_RX) * s;
    return <rect x={inset} y={inset} width={s} height={s} rx={rx} {...stroke} />;
  }
  // hexagon / shield / diamond as normalized paths scaled to `size`.
  const paths: Record<string, string> = {
    hexagon: "M0.5 0.02 L0.92 0.26 V0.74 L0.5 0.98 L0.08 0.74 V0.26 Z",
    shield: "M0.5 0.02 L0.94 0.16 V0.52 C0.94 0.78 0.74 0.94 0.5 0.99 C0.26 0.94 0.06 0.78 0.06 0.52 V0.16 Z",
    diamond: "M0.5 0.02 L0.98 0.5 L0.5 0.98 L0.02 0.5 Z",
  };
  return (
    <path
      d={paths[shape]}
      transform={`translate(${inset},${inset}) scale(${s})`}
      {...(outline
        ? { fill: "none", stroke: paint, strokeWidth: 0.05 } // unit space — scaled with the path
        : { fill: paint })}
    />
  );
}

/** Mark content only (icon / initials / abstract / image) — no badge. */
export function MarkContent({
  recipe, size, color,
}: { recipe: LogoRecipe; size: number; color: string }) {
  const { mark, typography } = recipe;
  if (mark.type === "icon") {
    const Icon = LOGO_ICONS[mark.icon];
    if (Icon) {
      const solidProps =
        mark.style === "solid"
          ? { fill: color, strokeWidth: 1 }
          : { fill: "none", strokeWidth: 1.75 };
      return <Icon x={0} y={0} width={size} height={size} color={color} {...solidProps} />;
    }
  }
  if (mark.type === "image" && mark.url) {
    return (
      <image href={mark.url} x={0} y={0} width={size} height={size} preserveAspectRatio="xMidYMid meet" />
    );
  }
  // initials (plain fallback for unknown icons / missing image urls too)
  const initials = initialsFor(recipe.name);
  const style = mark.type === "initials" ? mark.style : "plain";
  return (
    <InitialsMark initials={initials} style={style} size={size} color={color} font={typography.name.font} />
  );
}

function InitialsMark({
  initials, style, size, color, font,
}: { initials: string; style: string; size: number; color: string; font: string }) {
  const family = `'${font}', sans-serif`;
  const base = size * (initials.length > 1 ? 0.42 : 0.55);
  if (style === "split" && initials.length > 1) {
    return (
      <g fontFamily={family} fontWeight={700} fill={color}>
        <text x={size * 0.30} y={size / 2} textAnchor="middle" dominantBaseline="central" fontSize={base}>{initials[0]}</text>
        <line x1={size / 2} y1={size * 0.2} x2={size / 2} y2={size * 0.8} stroke={color} strokeWidth={size * 0.02} />
        <text x={size * 0.70} y={size / 2} textAnchor="middle" dominantBaseline="central" fontSize={base}>{initials[1]}</text>
      </g>
    );
  }
  if (style === "overlap" && initials.length > 1) {
    return (
      <g fontFamily={family} fontWeight={700}>
        <text x={size * 0.40} y={size / 2} textAnchor="middle" dominantBaseline="central" fontSize={base * 1.15} fill={color} opacity={0.55}>{initials[0]}</text>
        <text x={size * 0.60} y={size / 2} textAnchor="middle" dominantBaseline="central" fontSize={base * 1.15} fill={color}>{initials[1]}</text>
      </g>
    );
  }
  if (style === "monogram") {
    return (
      <g>
        <circle cx={size / 2} cy={size / 2} r={size * 0.46} fill="none" stroke={color} strokeWidth={size * 0.03} />
        <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" fontFamily={family} fontWeight={700} fontSize={base * 0.8} fill={color} letterSpacing={initials.length > 1 ? "0.05em" : undefined}>{initials}</text>
      </g>
    );
  }
  return (
    <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" fontFamily={family} fontWeight={700} fontSize={base} fill={color}>{initials}</text>
  );
}

/** Badge + inset mark content (the classic composed mark).
 * `emblem` mode shrinks + raises the content so the name (drawn by
 * LogoRenderer on top of the badge) fits in the lower half. */
function ComposedMark({
  recipe, size, emblem = false,
}: { recipe: LogoRecipe; size: number; emblem?: boolean }) {
  const hasBadge = recipe.badge.shape !== "none";
  const { paint, defs } = useFillPaint(recipe.colors.badge, "badge");
  // Solid color stand-in for the badge fill (gradient -> its `from` stop):
  // used when the mark itself must carry the badge color (no badge, or
  // outline-only badge — v1 behavior generalized to gradient fills).
  const badgeSolid =
    recipe.colors.badge.type === "solid" ? recipe.colors.badge.color : recipe.colors.badge.from;
  const fg = hasBadge && !recipe.badge.outline ? recipe.colors.mark : badgeSolid;
  const inner = size * (emblem ? 0.3 : hasBadge ? 0.55 : 0.8);
  const padX = (size - inner) / 2;
  const padY = emblem ? size * 0.18 : padX;
  return (
    <g>
      {defs && <defs>{defs}</defs>}
      <Badge shape={recipe.badge.shape} size={size} paint={paint} outline={recipe.badge.outline} />
      <g transform={`translate(${padX}, ${padY})`}>
        <MarkContent recipe={recipe} size={inner} color={fg} />
      </g>
    </g>
  );
}

function TextEl({
  value, style, color, x, y, anchor, fontSize,
}: {
  value: string; style: TextStyle; color: string;
  x: number; y: number; anchor: "start" | "middle"; fontSize: number;
}) {
  return (
    <text
      x={x} y={y}
      textAnchor={anchor}
      dominantBaseline="central"
      fontFamily={`'${style.font}', sans-serif`}
      fontWeight={style.weight}
      fontSize={fontSize}
      letterSpacing={`${style.tracking}em`}
      fill={color}
    >
      {applyCase(value, style)}
    </text>
  );
}

interface Slots {
  mark: { x: number; y: number; size: number } | null;
  name: { x: number; y: number; anchor: "start" | "middle"; budget: number; max: number };
  tagline: { x: number; y: number; anchor: "start" | "middle"; budget: number } | null;
  emblem: boolean;
}

function computeSlots(recipe: LogoRecipe): Slots {
  const { layout, tagline } = recipe;
  const vb = logoViewBox(layout);
  const hasTagline = tagline.trim().length > 0;
  if (layout === "horizontal" || layout === "horizontal_reversed") {
    const markSize = 160;
    const markX = layout === "horizontal" ? 24 : vb.w - 24 - markSize;
    const textX = layout === "horizontal" ? 24 + markSize + 24 : 32;
    const budget = vb.w - markSize - 24 * 3;
    return {
      mark: { x: markX, y: (vb.h - markSize) / 2, size: markSize },
      name: { x: textX, y: hasTagline ? vb.h / 2 - 22 : vb.h / 2, anchor: "start", budget, max: 80 },
      tagline: hasTagline ? { x: textX, y: vb.h / 2 + 42, anchor: "start", budget } : null,
      emblem: false,
    };
  }
  if (layout === "stacked") {
    return {
      mark: { x: (vb.w - 150) / 2, y: 24, size: 150 },
      name: { x: vb.w / 2, y: hasTagline ? 240 : 262, anchor: "middle", budget: vb.w - 48, max: 64 },
      tagline: hasTagline ? { x: vb.w / 2, y: 300, anchor: "middle", budget: vb.w - 64 } : null,
      emblem: false,
    };
  }
  if (layout === "emblem") {
    return {
      mark: { x: (vb.w - 280) / 2, y: 20, size: 280 },
      name: { x: vb.w / 2, y: 20 + 280 * 0.68, anchor: "middle", budget: 280 * 0.72, max: 44 },
      tagline: hasTagline ? { x: vb.w / 2, y: 20 + 280 + 46, anchor: "middle", budget: vb.w - 64 } : null,
      emblem: true,
    };
  }
  // name_only
  return {
    mark: null,
    name: { x: vb.w / 2, y: hasTagline ? vb.h / 2 - 18 : vb.h / 2, anchor: "middle", budget: vb.w - 64, max: 88 },
    tagline: hasTagline ? { x: vb.w / 2, y: vb.h / 2 + 46, anchor: "middle", budget: vb.w - 96 } : null,
    emblem: false,
  };
}

interface LogoRendererProps {
  recipe: LogoRecipe;
  width?: number;
  className?: string;
  svgRef?: Ref<SVGSVGElement>;
  onPointerDown?: React.PointerEventHandler<SVGSVGElement>;
  onPointerMove?: React.PointerEventHandler<SVGSVGElement>;
  onPointerUp?: React.PointerEventHandler<SVGSVGElement>;
}

export function LogoRenderer({
  recipe, width = 320, className, svgRef, onPointerDown, onPointerMove, onPointerUp,
}: LogoRendererProps) {
  const vb = logoViewBox(recipe.layout);
  const slots = computeSlots(recipe);
  const { elements, colors, typography } = recipe;
  const name = applyCase(recipe.name, typography.name);
  const nameSize = fitFontSize(name, typography.name, slots.name.budget, slots.name.max);
  const tagline = applyCase(recipe.tagline, typography.tagline);
  const taglineSize = slots.tagline
    ? Math.min(nameSize * 0.42, fitFontSize(tagline, typography.tagline, slots.tagline.budget, 30))
    : 0;

  // In the emblem layout the badge is the big container; name sits inside it
  // and must contrast with the badge fill -> use colors.mark for the name.
  const nameColor = slots.emblem ? colors.mark : colors.text;

  const place = (key: "mark" | "name" | "tagline", cx: number, cy: number) => {
    const p = elements[key];
    return `translate(${p.offset[0] + cx * (1 - p.scale)}, ${p.offset[1] + cy * (1 - p.scale)}) scale(${p.scale})`;
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${vb.w} ${vb.h}`}
      width={width}
      height={(width * vb.h) / vb.w}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {slots.mark && (
        <g
          data-part="mark"
          transform={place("mark", slots.mark.x + slots.mark.size / 2, slots.mark.y + slots.mark.size / 2)}
        >
          <g transform={`translate(${slots.mark.x}, ${slots.mark.y})`}>
            <ComposedMark recipe={recipe} size={slots.mark.size} emblem={slots.emblem} />
          </g>
        </g>
      )}
      <g data-part="name" transform={place("name", slots.name.x, slots.name.y)}>
        <TextEl value={recipe.name} style={typography.name} color={nameColor} x={slots.name.x} y={slots.name.y} anchor={slots.name.anchor} fontSize={nameSize} />
      </g>
      {slots.tagline && (
        <g data-part="tagline" transform={place("tagline", slots.tagline.x, slots.tagline.y)}>
          <TextEl value={recipe.tagline} style={typography.tagline} color={colors.tagline} x={slots.tagline.x} y={slots.tagline.y} anchor={slots.tagline.anchor} fontSize={taglineSize} />
        </g>
      )}
    </svg>
  );
}

export function MarkRenderer({
  recipe, size = 96, svgRef,
}: { recipe: LogoRecipe; size?: number; svgRef?: Ref<SVGSVGElement> }) {
  // Square export/preview: badge fills the box; never renders name or
  // tagline (spec: "Square mark" rule). Only name_only needs the initials
  // fallback — every other layout (emblem included) carries a real mark.
  const needsFallback = recipe.layout === "name_only" && recipe.mark.type !== "image";
  const markRecipe: LogoRecipe = needsFallback
    ? {
        ...recipe,
        mark: { type: "initials", style: "plain" },
        badge: { ...recipe.badge, shape: recipe.badge.shape === "none" ? "rounded" : recipe.badge.shape },
      }
    : recipe;
  return (
    <svg ref={svgRef} viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`} width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <ComposedMark recipe={markRecipe} size={MARK_VIEWBOX} />
    </svg>
  );
}
```

Notes for the implementer:
- The emblem layout renders the name **on top of** the badge (the badge comes from the mark group, which is larger there); `nameColor = colors.mark` keeps it readable.
- Element placement scales around each element's own center (`place()`), matching v1's mark behavior and removing v1's browser-finicky CSS `transform-origin` on the name (a logged v1 minor — now fixed by construction).
- `useFillPaint` is called by `ComposedMark` only (one badge per svg) — `useId()` keeps gradient ids unique across many rendered logos on one page.

- [ ] **Step 2: Update `export.ts` for multiple fonts/weights**

Replace `fontFaceCss` and the `svgToPngBlob` signature:

```ts
async function fontFaceCss(fontFamily: string, weight: number): Promise<string> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@${weight}&display=swap`;
  const css = await (await fetch(cssUrl)).text();
  const blocks = css.match(/@font-face\s*{[^}]+}/g) || [];
  const latinBlock =
    blocks.find((block) => /unicode-range:\s*U\+0000-00FF/i.test(block)) ?? blocks[0];
  const match = latinBlock?.match(/src:\s*url\((https:[^)]+)\)/);
  if (!match) return "";
  const fontData = await imageToDataUrl(match[1]);
  return `@font-face{font-family:'${fontFamily}';font-weight:${weight};src:url(${fontData});}`;
}

export interface FontSpec {
  family: string;
  weight: number;
}

export async function svgToPngBlob(
  svg: SVGSVGElement,
  width: number,
  height: number,
  fonts: FontSpec[],
): Promise<Blob> {
```

Inside, replace the single-font warm + embed with a loop over a de-duplicated font list:

```ts
  const unique = fonts.filter(
    (f, i) => fonts.findIndex((g) => g.family === f.family && g.weight === f.weight) === i,
  );
  for (const f of unique) {
    try {
      await document.fonts.load(`${f.weight} 64px '${f.family}'`);
    } catch {
      /* non-fatal */
    }
  }
```

and

```ts
  try {
    const css = (await Promise.all(unique.map((f) => fontFaceCss(f.family, f.weight)))).join("");
    if (css) {
      const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
      style.textContent = css;
      clone.insertBefore(style, clone.firstChild);
    }
  } catch {
    /* fall back to generic font */
  }
```

Update the comment block at the top of the file mentioning "700 weight only" to say fonts are embedded per (family, weight) pair actually used by the recipe. Everything else (image inlining, canvas rasterize, `uploadPng`) is unchanged.

- [ ] **Step 3: Adapt `logo-studio.tsx` to v2 (mechanical field renames, same UX)**

Precise edit list — the visible UI stays panel-driven; only the recipe wiring changes:

1. Imports: replace `COLOR_PAIRS` with `PALETTES, applyPalette`; add `LOGO_FONTS` (now `FontEntry[]`) and `fontEntry`; import `isRecipe, migrateRecipe` from `@/lib/logo/migrate`; import `logoViewBox` instead of `LOGO_VIEWBOX`; import `type { FontSpec }` from `@/lib/logo/export`; extend the type imports from `@/types/logo` with `AnyLogoRecipe, BadgeShape, FontWeight, TextCase` (Task 6's controls use the latter two).
2. `LAYOUTS` constant becomes the five v2 layouts:

```ts
const LAYOUTS: { id: RecipeLayout; label: string }[] = [
  { id: "horizontal", label: "Mark + name" },
  { id: "horizontal_reversed", label: "Name + mark" },
  { id: "stacked", label: "Stacked" },
  { id: "emblem", label: "Emblem" },
  { id: "name_only", label: "Name only" },
];
```

3. `BADGES` gains the new shapes (`hexagon`, `shield`, `diamond`) and patches `badge.shape` (object), not `badge` (string):

```ts
const BADGES: { id: BadgeShape; label: string }[] = [
  { id: "circle", label: "Circle" }, { id: "rounded", label: "Rounded" },
  { id: "squircle", label: "Squircle" }, { id: "hexagon", label: "Hexagon" },
  { id: "shield", label: "Shield" }, { id: "diamond", label: "Diamond" },
  { id: "none", label: "None" },
];
// onClick: patch({ badge: { ...recipe.badge, shape: b.id } })
```

4. Recipe seeding (both the `useState` initializer and the reopen `useEffect`): `isCompleteRecipe(config.logo_recipe) ? config.logo_recipe : default` becomes

```ts
isRecipe(config.logo_recipe) ? migrateRecipe(config.logo_recipe) : defaultRecipe(config.brand_name, theme.primaryHex)
```

(delete the local `isCompleteRecipe`).
5. Font-loading `useEffect`: build the css2 URL from the full catalog with each font's real weights:

```ts
link.href = `https://fonts.googleapis.com/css2?${LOGO_FONTS.map(
  (f) => `family=${encodeURIComponent(f.family)}:wght@${f.weights.join(";")}`,
).join("&")}&display=swap`;
```

(import `LOGO_FONTS` — now the `FontEntry[]`.)
6. Font buttons: iterate `LOGO_FONTS`, patch `typography`:

```ts
onClick={() => patch({
  typography: {
    ...recipe.typography,
    name: { ...recipe.typography.name, font: f.family },
    tagline: { ...recipe.typography.tagline, font: f.family },
  },
})}
// active check: recipe.typography.name.font === f.family
```

7. Colors section: replace the `COLOR_PAIRS` swatch loop with `PALETTES(theme.primaryHex)` and `onClick={() => setRecipe(applyPalette(recipe, pair))}`; a palette swatch's preview background is `pair.badge.type === "solid" ? pair.badge.color : \`linear-gradient(135deg, ${pair.badge.from}, ${pair.badge.to})\``; active check `recipe.colors.palette_id === pair.id`. The custom `<input type="color">` patches `{ colors: { ...recipe.colors, palette_id: null, badge: { type: "solid", color: e.target.value } } }`. Text-color buttons patch `colors.text` as before (also set `palette_id: null`).
8. Mark buttons: initials button patches `{ mark: { type: "initials", style: "plain" } }`; icon buttons patch `{ mark: { type: "icon", icon: iconName, style: "outline" } }`; active check for icons ignores `style`.
9. Drag + sliders: `recipe.overrides.mark_offset` → `recipe.elements.mark.offset` (same for `name`); the drag setter becomes

```ts
setRecipe((r) => ({
  ...r,
  elements: { ...r.elements, [drag.part]: { ...r.elements[drag.part], offset: [dx, dy] } },
}));
```

`beginDrag` reads `recipe.elements[part].offset` and accepts `part` values `"mark" | "name" | "tagline"`. The two sliders read/write `recipe.elements.mark.scale` / `recipe.elements.name.scale`. "Reset placement" writes the three zeroed placements. `moveDrag`'s viewBox scale becomes `logoViewBox(recipe.layout).w / svg.getBoundingClientRect().width`.
10. Save: viewbox + fonts:

```ts
const vb = logoViewBox(recipe.layout);
const fonts: FontSpec[] = [
  { family: recipe.typography.name.font, weight: recipe.typography.name.weight },
  ...(recipe.tagline.trim()
    ? [{ family: recipe.typography.tagline.font, weight: recipe.typography.tagline.weight }]
    : []),
];
const logoBlob = await svgToPngBlob(logoSvgRef.current, vb.w * 2, vb.h * 2, fonts);
const markBlob = await svgToPngBlob(markSvgRef.current, 1024, 1024, fonts);
```

11. Suggestions: the endpoint still returns v1 recipes until Phase 4 — migrate them on receipt:

```ts
setSuggestions(data.suggestions.map((s) => migrateRecipe(s as AnyLogoRecipe)));
```

and the card click stays `setRecipe({ ...s, name: recipe.name })`.
12. Add a Tagline input under the Name input (the tagline element must be reachable this phase):

```tsx
<section className="space-y-1.5">
  <p className="text-sm font-medium">Tagline (optional)</p>
  <input
    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
    value={recipe.tagline}
    maxLength={120}
    placeholder="e.g. Yoga for busy mothers"
    onChange={(e) => patch({ tagline: e.target.value })}
  />
</section>
```

13. The `recipe.layout !== "name_only"` guards on the Mark/Badge sections remain correct for v2 (all other layouts show a mark).

- [ ] **Step 4: Build + tests**

Run: `cd frontend-customer && npx vitest run && npm run build`
Expected: vitest PASS; `next build` completes with no TS errors. Fix any missed v1 field references the compiler surfaces (the compiler is the safety net for this rename).

- [ ] **Step 5: Manual smoke via dev stack**

Run: `make dev` (if not already up). Open `http://<tenant>.localhost/admin/design?studio=1`:
- Studio opens, all five layout buttons render, previews update.
- A pre-existing v1 recipe (if the seeded tenant has one) opens correctly migrated.
- Tagline input adds a second text line; drag still works; save round-trips (PATCH 200, dialog closes, header logo updates).

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must print feat/logo-studio-v2
git add frontend-customer/src/components/logo/ frontend-customer/src/lib/logo/export.ts frontend-customer/src/components/logo/logo-studio.tsx
git commit -m "feat(logo-v2): renderer v2 (5 layouts, tagline, gradient badges) + studio v2 wiring"
```

---

### Task 5: Frontend — abstract seeded mark generators

**Files:**
- Create: `frontend-customer/src/lib/logo/abstract.ts` (pure spec functions)
- Create: `frontend-customer/src/components/logo/abstract-mark.tsx` (spec → JSX)
- Modify: `frontend-customer/src/components/logo/logo-renderer.tsx` (`MarkContent` renders abstract marks)
- Modify: `frontend-customer/src/components/logo/logo-studio.tsx` (abstract picker row in the Mark section)
- Test: `frontend-customer/src/lib/logo/__tests__/abstract.test.ts`

**Interfaces:**
- Consumes: `AbstractFamily` type (Task 1).
- Produces:
  - `abstractSpec(family: AbstractFamily, seed: number): AbstractShape[]` — pure, deterministic; `AbstractShape = { kind: "circle"|"ellipse"|"path"|"rect"|"line"; opacity: number; stroke?: boolean; strokeWidth?: number; ... }` in **unit space** (0..1 coordinates, scaled by the component).
  - `<AbstractMark family seed color size />` React component (Phase 2's wall + Task 5's picker reuse it).

- [ ] **Step 1: Write the failing determinism/diversity test**

`frontend-customer/src/lib/logo/__tests__/abstract.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ABSTRACT_FAMILIES, abstractSpec } from "@/lib/logo/abstract";

describe("abstractSpec", () => {
  it("covers all six families", () => {
    expect(ABSTRACT_FAMILIES).toEqual(["orbits", "bloom", "waves", "prism", "knot", "grid"]);
  });

  it("is deterministic per (family, seed)", () => {
    for (const family of ABSTRACT_FAMILIES) {
      expect(abstractSpec(family, 42)).toEqual(abstractSpec(family, 42));
    }
  });

  it("varies with the seed", () => {
    for (const family of ABSTRACT_FAMILIES) {
      expect(JSON.stringify(abstractSpec(family, 1))).not.toEqual(
        JSON.stringify(abstractSpec(family, 2)),
      );
    }
  });

  it("stays in unit space", () => {
    for (const family of ABSTRACT_FAMILIES) {
      for (const seed of [1, 7, 999]) {
        for (const shape of abstractSpec(family, seed)) {
          for (const v of Object.values(shape)) {
            if (typeof v === "number") expect(Math.abs(v)).toBeLessThanOrEqual(1.5);
          }
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend-customer && npx vitest run src/lib/logo/__tests__/abstract.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/logo/abstract.ts`**

```ts
// Seeded parametric SVG symbol generators — the "abstract" mark family.
// Pure data ("spec") functions: (family, seed) -> shapes in unit space
// (0..1 box). components/logo/abstract-mark.tsx maps a spec to JSX. Keeping
// the spec pure lets vitest assert determinism without a DOM.
import type { AbstractFamily } from "@/types/logo";

export const ABSTRACT_FAMILIES: AbstractFamily[] = [
  "orbits", "bloom", "waves", "prism", "knot", "grid",
];

export type AbstractShape =
  | { kind: "circle"; cx: number; cy: number; r: number; opacity: number; stroke?: boolean; strokeWidth?: number }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; rotate: number; opacity: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number; rx: number; opacity: number }
  | { kind: "path"; d: string; opacity: number; stroke?: boolean; strokeWidth?: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; strokeWidth: number; opacity: number };

// mulberry32 — tiny deterministic PRNG.
function rng(seed: number): () => number {
  let t = (seed || 1) >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;
const rnd = (r: () => number, lo: number, hi: number) => lo + r() * (hi - lo);
const pick = <T,>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)]!;

function orbits(r: () => number): AbstractShape[] {
  const shapes: AbstractShape[] = [
    { kind: "circle", cx: 0.5, cy: 0.5, r: rnd(r, 0.1, 0.16), opacity: 1 },
    { kind: "circle", cx: 0.5, cy: 0.5, r: rnd(r, 0.3, 0.38), opacity: 0.9, stroke: true, strokeWidth: 0.035 },
  ];
  const satellites = 2 + Math.floor(r() * 3);
  const ringR = (shapes[1] as { r: number }).r;
  for (let i = 0; i < satellites; i++) {
    const a = rnd(r, 0, TAU);
    shapes.push({
      kind: "circle",
      cx: 0.5 + Math.cos(a) * ringR,
      cy: 0.5 + Math.sin(a) * ringR,
      r: rnd(r, 0.045, 0.075),
      opacity: i === 0 ? 1 : 0.7,
    });
  }
  return shapes;
}

function bloom(r: () => number): AbstractShape[] {
  const petals = pick(r, [5, 6, 7, 8]);
  const rx = rnd(r, 0.1, 0.14);
  const ry = rnd(r, 0.2, 0.26);
  const shapes: AbstractShape[] = [];
  for (let i = 0; i < petals; i++) {
    shapes.push({
      kind: "ellipse", cx: 0.5, cy: 0.5 - ry * 0.85, rx, ry,
      rotate: (360 / petals) * i, opacity: 0.82,
    });
  }
  shapes.push({ kind: "circle", cx: 0.5, cy: 0.5, r: rnd(r, 0.07, 0.1), opacity: 1 });
  return shapes;
}

function waves(r: () => number): AbstractShape[] {
  const rows = pick(r, [3, 4]);
  const amp = rnd(r, 0.05, 0.09);
  const shapes: AbstractShape[] = [];
  for (let i = 0; i < rows; i++) {
    const y = 0.3 + (0.4 / (rows - 1)) * i;
    const phase = rnd(r, -0.08, 0.08);
    const d =
      `M0.08 ${y.toFixed(3)}` +
      ` Q${(0.29 + phase).toFixed(3)} ${(y - amp).toFixed(3)} 0.5 ${y.toFixed(3)}` +
      ` T0.92 ${y.toFixed(3)}`;
    shapes.push({ kind: "path", d, opacity: 1 - i * 0.22, stroke: true, strokeWidth: 0.055 });
  }
  return shapes;
}

function prism(r: () => number): AbstractShape[] {
  const shapes: AbstractShape[] = [];
  const tris = pick(r, [3, 4]);
  for (let i = 0; i < tris; i++) {
    const cx = rnd(r, 0.4, 0.6);
    const cy = rnd(r, 0.42, 0.58);
    const size = rnd(r, 0.28, 0.42);
    const rot = rnd(r, 0, TAU);
    const pts = [0, 1, 2].map((k) => {
      const a = rot + (TAU / 3) * k;
      return `${(cx + Math.cos(a) * size).toFixed(3)} ${(cy + Math.sin(a) * size).toFixed(3)}`;
    });
    shapes.push({ kind: "path", d: `M${pts[0]} L${pts[1]} L${pts[2]} Z`, opacity: i === 0 ? 0.95 : 0.45 });
  }
  return shapes;
}

function knot(r: () => number): AbstractShape[] {
  const rings = pick(r, [2, 3]);
  const ringR = rnd(r, 0.17, 0.21);
  const spread = rnd(r, 0.1, 0.14);
  const start = rnd(r, 0, TAU);
  const shapes: AbstractShape[] = [];
  for (let i = 0; i < rings; i++) {
    const a = start + (TAU / rings) * i;
    shapes.push({
      kind: "circle",
      cx: 0.5 + Math.cos(a) * spread,
      cy: 0.5 + Math.sin(a) * spread,
      r: ringR,
      opacity: 0.85,
      stroke: true,
      strokeWidth: 0.05,
    });
  }
  return shapes;
}

function grid(r: () => number): AbstractShape[] {
  const shapes: AbstractShape[] = [];
  const cell = 0.24;
  const gap = 0.04;
  const origin = 0.5 - (cell * 3 + gap * 2) / 2;
  const accent = Math.floor(r() * 9);
  for (let i = 0; i < 9; i++) {
    if (r() < 0.25 && i !== accent) continue; // seeded holes
    const x = origin + (i % 3) * (cell + gap);
    const y = origin + Math.floor(i / 3) * (cell + gap);
    if (i === accent) {
      shapes.push({ kind: "circle", cx: x + cell / 2, cy: y + cell / 2, r: cell / 2, opacity: 1 });
    } else {
      shapes.push({ kind: "rect", x, y, w: cell, h: cell, rx: cell * 0.28, opacity: 0.8 });
    }
  }
  return shapes;
}

const GENERATORS: Record<AbstractFamily, (r: () => number) => AbstractShape[]> = {
  orbits, bloom, waves, prism, knot, grid,
};

export function abstractSpec(family: AbstractFamily, seed: number): AbstractShape[] {
  return GENERATORS[family](rng(seed));
}
```

- [ ] **Step 4: Implement `src/components/logo/abstract-mark.tsx`**

```tsx
// Renders an abstractSpec into a size×size SVG group. Stroked shapes use
// fill:none so the mark reads as line-work; opacity layers give depth with
// a single brand color.
import { abstractSpec } from "@/lib/logo/abstract";
import type { AbstractFamily } from "@/types/logo";

export function AbstractMark({
  family, seed, color, size,
}: { family: AbstractFamily; seed: number; color: string; size: number }) {
  const shapes = abstractSpec(family, seed);
  return (
    <g>
      {shapes.map((s, i) => {
        if (s.kind === "circle") {
          return s.stroke ? (
            <circle key={i} cx={s.cx * size} cy={s.cy * size} r={s.r * size} fill="none" stroke={color} strokeWidth={(s.strokeWidth ?? 0.04) * size} opacity={s.opacity} />
          ) : (
            <circle key={i} cx={s.cx * size} cy={s.cy * size} r={s.r * size} fill={color} opacity={s.opacity} />
          );
        }
        if (s.kind === "ellipse") {
          return (
            <ellipse key={i} cx={s.cx * size} cy={s.cy * size} rx={s.rx * size} ry={s.ry * size} transform={`rotate(${s.rotate} ${0.5 * size} ${0.5 * size})`} fill={color} opacity={s.opacity} />
          );
        }
        if (s.kind === "rect") {
          return <rect key={i} x={s.x * size} y={s.y * size} width={s.w * size} height={s.h * size} rx={s.rx * size} fill={color} opacity={s.opacity} />;
        }
        if (s.kind === "line") {
          return <line key={i} x1={s.x1 * size} y1={s.y1 * size} x2={s.x2 * size} y2={s.y2 * size} stroke={color} strokeWidth={s.strokeWidth * size} opacity={s.opacity} strokeLinecap="round" />;
        }
        // path: scale unit coords via transform (numbers inside d are 0..1)
        return s.stroke ? (
          <path key={i} d={s.d} transform={`scale(${size})`} fill="none" stroke={color} strokeWidth={s.strokeWidth ?? 0.04} opacity={s.opacity} strokeLinecap="round" vectorEffect="none" />
        ) : (
          <path key={i} d={s.d} transform={`scale(${size})`} fill={color} opacity={s.opacity} />
        );
      })}
    </g>
  );
}
```

(Stroke widths for scaled paths stay in unit space because the whole path is scaled — 0.055 unit ≈ 5.5% of the box, matching the circle strokes which are multiplied out.)

- [ ] **Step 5: Wire into `MarkContent` (logo-renderer.tsx)**

In `MarkContent`, before the initials fallback:

```tsx
  if (mark.type === "abstract") {
    return <AbstractMark family={mark.family} seed={mark.seed} color={color} size={size} />;
  }
```

(import `AbstractMark` at the top).

- [ ] **Step 6: Add the abstract picker row to the studio's Mark section**

In `logo-studio.tsx`, below the initials/upload row, above the icon groups:

```tsx
<div>
  <p className="mb-1 text-xs text-muted-foreground">Abstract</p>
  <div className="grid grid-cols-6 gap-1">
    {ABSTRACT_FAMILIES.map((family) => {
      const active = recipe.mark.type === "abstract" && recipe.mark.family === family;
      const seed = recipe.mark.type === "abstract" ? recipe.mark.seed : 1;
      return (
        <button
          key={family}
          type="button"
          aria-label={`Abstract ${family}`}
          aria-pressed={active}
          onClick={() =>
            patch({
              mark: { type: "abstract", family, seed: active ? seed + 1 : seed },
            })
          }
          className={`flex h-9 items-center justify-center rounded-md border ${active ? "border-primary bg-primary/10" : "hover:border-foreground"}`}
        >
          <svg viewBox="0 0 24 24" width={20} height={20}>
            <AbstractMark family={family} seed={seed} color="currentColor" size={24} />
          </svg>
        </button>
      );
    })}
  </div>
  {recipe.mark.type === "abstract" && (
    <p className="mt-1 text-xs text-muted-foreground">Click again to shuffle the shape.</p>
  )}
</div>
```

(import `ABSTRACT_FAMILIES` from `@/lib/logo/abstract` and `AbstractMark` from `./abstract-mark`.) Clicking an active family bumps the seed — a free "shuffle this symbol" affordance.

- [ ] **Step 7: Tests + build**

Run: `cd frontend-customer && npx vitest run && npm run build`
Expected: all PASS, build clean. Then in the dev stack, pick each abstract family in the studio and confirm the previews (wide + mark + favicon row) render a sensible symbol.

- [ ] **Step 8: Commit**

```bash
git branch --show-current   # must print feat/logo-studio-v2
git add frontend-customer/src/lib/logo/abstract.ts frontend-customer/src/components/logo/abstract-mark.tsx frontend-customer/src/components/logo/logo-renderer.tsx frontend-customer/src/components/logo/logo-studio.tsx frontend-customer/src/lib/logo/__tests__/abstract.test.ts
git commit -m "feat(logo-v2): six seeded abstract mark families"
```

---

### Task 6: Frontend — typography & mark-style controls (weight, case, tracking, icon style, monogram styles)

**Files:**
- Modify: `frontend-customer/src/components/logo/logo-studio.tsx` (Font section + Mark section additions)

**Interfaces:**
- Consumes: Task 3 `LOGO_FONTS: FontEntry[]`, `fontEntry`; Task 4 v2 wiring.
- Produces: studio UI writes every v2 typography/mark-style field, so any recipe the Phase-2 composer can emit is also hand-editable. No new exports.

- [ ] **Step 1: Replace the Font section with vibe-grouped fonts + weight/case/tracking controls**

```tsx
<section className="space-y-1.5">
  <p className="text-sm font-medium">Font</p>
  {(["Modern", "Elegant", "Bold", "Playful", "Minimal"] as const).map((vibe) => (
    <div key={vibe}>
      <p className="mb-1 text-xs text-muted-foreground">{vibe}</p>
      <div className="flex flex-wrap gap-1.5">
        {LOGO_FONTS.filter((f) => f.vibe === vibe).map((f) => (
          <button
            key={f.family}
            type="button"
            aria-pressed={recipe.typography.name.font === f.family}
            onClick={() =>
              patch({
                typography: {
                  ...recipe.typography,
                  name: { ...recipe.typography.name, font: f.family },
                  tagline: { ...recipe.typography.tagline, font: f.family },
                },
              })
            }
            style={{ fontFamily: `'${f.family}', sans-serif` }}
            className={`rounded-md border px-2.5 py-1.5 text-xs ${recipe.typography.name.font === f.family ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground"}`}
          >
            {f.family}
          </button>
        ))}
      </div>
    </div>
  ))}

  <div className="flex items-center gap-3 pt-1">
    <label className="flex-1 text-xs text-muted-foreground">
      Weight
      <select
        className="mt-0.5 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
        value={recipe.typography.name.weight}
        onChange={(e) =>
          patch({
            typography: {
              ...recipe.typography,
              name: { ...recipe.typography.name, weight: Number(e.target.value) as FontWeight },
            },
          })
        }
      >
        {fontEntry(recipe.typography.name.font).weights.map((w) => (
          <option key={w} value={w}>{{ 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extra bold" }[w]}</option>
        ))}
      </select>
    </label>
    <label className="flex-1 text-xs text-muted-foreground">
      Case
      <select
        className="mt-0.5 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
        value={recipe.typography.name.case}
        onChange={(e) =>
          patch({
            typography: {
              ...recipe.typography,
              name: { ...recipe.typography.name, case: e.target.value as TextCase },
            },
          })
        }
      >
        <option value="none">As typed</option>
        <option value="title">Title Case</option>
        <option value="upper">UPPERCASE</option>
      </select>
    </label>
  </div>
  <label className="block text-xs text-muted-foreground">
    Letter spacing
    <input
      type="range" min={-0.05} max={0.3} step={0.01}
      value={recipe.typography.name.tracking}
      onChange={(e) =>
        patch({
          typography: {
            ...recipe.typography,
            name: { ...recipe.typography.name, tracking: Number(e.target.value) },
          },
        })
      }
      className="w-full"
    />
  </label>
</section>
```

If the selected font's `weights` don't include the current weight after a font switch, clamp it in the font-button onClick: `weight: (fontEntry(f.family).weights.includes(recipe.typography.name.weight) ? recipe.typography.name.weight : 700)`.

- [ ] **Step 2: Icon style + monogram style rows in the Mark section**

Under the icon grid, add (shown only when the current mark is an icon):

```tsx
{recipe.mark.type === "icon" && (
  <div className="flex gap-1.5">
    {(["outline", "solid"] as const).map((style) => (
      <button
        key={style}
        type="button"
        aria-pressed={recipe.mark.type === "icon" && recipe.mark.style === style}
        onClick={() => recipe.mark.type === "icon" && patch({ mark: { ...recipe.mark, style } })}
        className={`rounded-md border px-2.5 py-1 text-xs capitalize ${recipe.mark.type === "icon" && recipe.mark.style === style ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground"}`}
      >
        {style}
      </button>
    ))}
  </div>
)}
```

And replace the single initials button with the four monogram styles:

```tsx
<div className="flex flex-wrap gap-1.5">
  {(["plain", "monogram", "split", "overlap"] as const).map((style) => {
    const active = recipe.mark.type === "initials" && recipe.mark.style === style;
    return (
      <button
        key={style}
        type="button"
        aria-pressed={active}
        onClick={() => patch({ mark: { type: "initials", style } })}
        className={`rounded-md border px-2.5 py-1.5 text-xs capitalize ${active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-foreground"}`}
      >
        {initialsFor(recipe.name)} {style}
      </button>
    );
  })}
  {/* keep the existing "Your own" upload button after these */}
</div>
```

- [ ] **Step 3: Add `aria-pressed` to the remaining toggle groups**

Layout, badge-shape, palette, text-color, and font buttons all gain `aria-pressed={<their existing active check>}` (logged v1 a11y minor — closed for the whole studio in this task).

- [ ] **Step 4: Build + smoke**

Run: `cd frontend-customer && npm run build` — clean. Dev-stack smoke: switch weight/case/tracking and watch the preview; pick each monogram style; toggle icon outline/solid.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/logo-studio-v2
git add frontend-customer/src/components/logo/logo-studio.tsx
git commit -m "feat(logo-v2): typography controls, monogram styles, icon solid style, aria-pressed"
```

---

### Task 7: Backend — keep AI/fallback suggestions valid against the richer catalog

**Files:**
- Modify: `backend/apps/tenant_config/logo_ai.py` (FONTS list + KEEP-IN-SYNC note; still emits v1)
- Modify: `backend/apps/tenant_config/views.py` (`logo_suggestions` — rate limiter charges only the AI path)
- Test: `backend/apps/tenant_config/tests/test_logo_studio.py` (extend the suggestions tests)

**Interfaces:**
- Consumes: Task 2 (`upgrade_recipe` guarantees v1 suggestions upgrade cleanly), Task 3 font catalog.
- Produces: `POST /api/v1/admin/config/logo-suggestions/` unchanged in shape (still 4 v1 recipes + `source`); deterministic fallback calls are no longer rate-limited. The full v2 AI generation endpoint is **Phase 4** — this task only keeps Phase-1 reality consistent.

- [ ] **Step 1: Write the failing rate-limit test**

Add to `test_logo_studio.py` (mirror the file's existing suggestion-test fixtures):

```python
def test_fallback_suggestions_are_not_rate_limited(coach_client, settings):
    settings.ANTHROPIC_API_KEY = ""
    for _ in range(12):  # > the 10/hr AI budget
        resp = coach_client.post("/api/v1/admin/config/logo-suggestions/")
        assert resp.status_code == 200
        assert resp.json()["source"] == "fallback"


def test_fallback_fonts_exist_in_v2_catalog():
    from apps.tenant_config.logo_ai import FONTS

    # Task 3's catalog keeps all 8 v1 families, so fallback recipes stay valid.
    for font in FONTS:
        assert font in {
            "Inter", "Geist", "DM Sans", "Plus Jakarta Sans", "Playfair Display", "Lora",
            "EB Garamond", "Cormorant Garamond", "Poppins", "Montserrat", "Archivo",
            "Space Grotesk", "Nunito", "Quicksand", "Baloo 2", "Fredoka",
            "Work Sans", "Manrope", "Sora", "Outfit",
        }
```

- [ ] **Step 2: Run to verify the rate-limit test fails**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_logo_studio.py -v -k "fallback"`
Expected: `test_fallback_suggestions_are_not_rate_limited` FAILS (11th call → 429).

- [ ] **Step 3: Move the rate charge inside the AI branch**

In `views.py` `logo_suggestions`, replace the unconditional counter block:

```python
    config = TenantConfig.objects.first()
    brand_name = config.brand_name if config else "My Brand"
    theme = config.theme if config else "ocean"
    primary_hex = _THEME_PRIMARY_HEX.get(theme, "#1a56db")
    niche = getattr(connection.tenant, "template_niche", "") or ""

    if settings.ANTHROPIC_API_KEY:
        # Only real AI calls consume the hourly budget — the deterministic
        # fallback below is free and unlimited (logged v1 minor, fixed).
        rate_key = f"logo-suggest:{connection.tenant.schema_name}"
        count = cache.get(rate_key, 0)
        if count >= 10:
            return Response({"detail": "Suggestion limit reached. Try again in an hour."}, status=429)
        cache.set(rate_key, count + 1, timeout=3600)
        try:
            suggestions = logo_ai.ai_suggestions(brand_name, niche, primary_hex)
            return Response({"suggestions": suggestions, "source": "ai"})
        except Exception:
            logger.exception("logo suggestions: AI call failed, using fallback")
    suggestions = logo_ai.fallback_suggestions(brand_name, niche, primary_hex)
    return Response({"suggestions": suggestions, "source": "fallback"})
```

- [ ] **Step 4: Update `logo_ai.py`'s sync comment**

The module docstring's KEEP-IN-SYNC paragraph gains: "catalog.ts now carries 20 fonts (FontEntry[]); this module still emits v1 recipes restricted to the 8 original families — all present in v2. Full v2 emission lands in Phase 4." (`FONTS` list itself is unchanged.)

- [ ] **Step 5: Run the suite**

Run: `docker compose exec django pytest apps/tenant_config -v`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must print feat/logo-studio-v2
git add backend/apps/tenant_config/views.py backend/apps/tenant_config/logo_ai.py backend/apps/tenant_config/tests/test_logo_studio.py
git commit -m "fix(logo-v2): rate-limit only real AI suggestion calls"
```

---

### Task 8: Frontend — EditSidebar autosave stops re-sending the base64 mark

**Files:**
- Modify: `frontend-customer/src/components/owner/edit-sidebar.tsx` (the debounced autosave payload builder around line 111–128)

**Interfaces:**
- Consumes: nothing new.
- Produces: the debounced config autosave strips `logo_recipe.mark.url` for image marks before PATCH (same wire rule as LogoStudio's own save; the backend re-derives the url from `photo_id` on read).

- [ ] **Step 1: Locate the autosave PATCH body**

In `edit-sidebar.tsx`, the debounced effect (`Every change autosaves (debounced)`, line ~111) serializes the draft config. Find where the PATCH body is built (the `clientFetch("/api/v1/admin/config/", { method: "PATCH", ... })` call inside the debounce callback).

- [ ] **Step 2: Strip the image-mark data URL**

Immediately before the body is serialized, add:

```ts
// The backend discards mark.url for image marks on write and re-derives it
// from photo_id on read (validate_logo_recipe) — re-sending the session's
// base64 data URL just bloats every autosave PATCH by the whole image.
// Same wire rule LogoStudio.handleSave applies. Strip a v1 blob's shape too
// (pre-migration saves): both versions keep mark.url at the same path.
const recipe = draft.logo_recipe as { mark?: { type?: string; url?: string } } | undefined;
const wireLogoRecipe =
  recipe && recipe.mark?.type === "image"
    ? { ...recipe, mark: { ...recipe.mark, url: "" } }
    : draft.logo_recipe;
```

and send `logo_recipe: wireLogoRecipe` in the PATCH body (only when `logo_recipe` was being sent at all — if the autosave already sends a partial diff and `logo_recipe` isn't in it, wrap the strip in that condition).

- [ ] **Step 3: Build + smoke**

Run: `cd frontend-customer && npm run build` — clean. Dev-stack: upload a mark image in the studio, save, then nudge any sidebar setting; in devtools' network tab confirm the autosave PATCH's `logo_recipe.mark.url` is `""`.

- [ ] **Step 4: Commit**

```bash
git branch --show-current   # must print feat/logo-studio-v2
git add frontend-customer/src/components/owner/edit-sidebar.tsx
git commit -m "fix(logo-v2): edit-sidebar autosave strips base64 image-mark url"
```

---

### Task 9: e2e — v2 studio spec + whole-phase verification

**Files:**
- Modify: `e2e/specs/15-logo-studio.spec.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: green e2e proof that compose → save persists a v2 recipe; the phase's definition of done.

- [ ] **Step 1: Update the spec for v2**

Replace the compose/assert section of `15-logo-studio.spec.ts`:

```ts
  // Compose: v2 layout + a specific icon + a tagline
  await page.getByRole("button", { name: "Mark + name" }).click();
  await page.getByRole("button", { name: "flower-2", exact: true }).click();
  await page.getByPlaceholder("e.g. Yoga for busy mothers").fill("Move every day");

  // Suggestions still work offline via the deterministic fallback (v1
  // recipes, migrated to v2 client-side on receipt)
  await page.getByRole("button", { name: "Suggest ideas" }).click();
  await expect(page.getByTestId("logo-suggestions")).toBeVisible({ timeout: 15_000 });
```

and the PATCH assertions:

```ts
  const body = patch.request().postDataJSON();
  expect(body.logo_id).toBeTruthy();
  expect(body.icon_id).toBeTruthy();
  expect(body.logo_recipe.version).toBe(2);
  expect(body.logo_recipe.layout).toBe("horizontal");
  expect(body.logo_recipe.tagline).toBe("Move every day");
  expect(body.logo_recipe.mark).toEqual({ type: "icon", icon: "flower-2", style: "outline" });
  expect(body.logo_recipe.badge.shape).toBeTruthy();
  expect(body.logo_recipe.typography.name.weight).toBeGreaterThanOrEqual(400);
```

(Everything else in the spec — deep link, heading scoping, dialog close — stays.)

- [ ] **Step 2: Run the spec**

Run: `make e2e ARGS="15-logo-studio"` (or the repo's per-spec invocation: `cd e2e && npx playwright test 15-logo-studio`)
Expected: PASS.

- [ ] **Step 3: Whole-phase verification gate**

```bash
docker compose exec django pytest apps/tenant_config -v      # all green
cd frontend-customer && npx vitest run && npm run build      # all green
make lint                                                    # pre-commit clean
```

Then a manual browser pass on `?studio=1`: five layouts, tagline, an abstract mark, a gradient palette, weight/case/tracking, drag, save, reload → recipe reopens identically (round-trip through backend validation).

- [ ] **Step 4: Commit**

```bash
git branch --show-current   # must print feat/logo-studio-v2
git add e2e/specs/15-logo-studio.spec.ts
git commit -m "test(logo-v2): e2e covers v2 compose + save round-trip"
```

---

## Phase exit criteria

- All existing v1 recipes (seeded or coach-saved) open and save correctly as v2 — no data loss, no visual surprise beyond the fixed name-scale transform-origin bug.
- `apps/tenant_config` pytest suite, frontend vitest suite, `npm run build`, `make lint`, and the logo e2e spec are all green.
- Branch `feat/logo-studio-v2` contains only this phase's commits; not merged, not pushed.
- Phases 2–4 are unblocked: the composer (Phase 2) emits v2 recipes against Task 3's catalog; the canvas editor (Phase 3) manipulates `elements.*`; brand kit + AI schema (Phase 4) build on `logoViewBox`/`svgToPngBlob(fonts)` and `logo_recipe.py`.
