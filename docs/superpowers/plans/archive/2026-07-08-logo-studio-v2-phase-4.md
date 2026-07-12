# Logo Studio v2 — Phase 4: Brand Kit + AI v2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) A downloadable brand kit — transparent PNGs in light + dark variants, favicon sizes, and a true SVG vector with text converted to paths — so the logo is usable beyond the platform. (2) The AI path graduates to schema v2: the suggestions endpoint accepts the brief (style chips + vibe + niche) and returns 8 full v2 recipes via structured output; the deterministic fallback also returns v2.

**Architecture:**
- `lib/logo/brand-kit.ts`: `darkVariant(recipe)` (readable-on-dark color derivation), `svgWithTextPaths(svg)` (opentype.js; TTFs fetched per (family,weight) from fontsource's jsDelivr mirror — `https://cdn.jsdelivr.net/fontsource/fonts/<slug>@latest/latin-<weight>-normal.ttf` — because Google's css2 only serves woff2 to browser UAs and opentype.js can't parse woff2), `buildBrandKit(...)` zips everything with jszip. SVG failure degrades to a PNG-only kit + message (spec rule). Text-attr lookup walks ancestor `<g>`s (split/overlap initials put font attrs on the group).
- `studio-editor.tsx` gains a "Download brand kit" button + hidden off-screen renderers (dark logo variant) refs feeding the kit.
- Backend: `logo_recipe.py` grows the full `PALETTES` table (colors mirrored from catalog.ts — needed to resolve `palette_id` server-side; `PALETTE_IDS` derives from it). `logo_ai.py` gets `_SuggestionV2` (layout/mark/badge/palette_id/font/weight/case/tracking/tagline enums constrained to catalogs), an 8-suggestion brief-aware prompt, and v2 assembly + validation; `views.logo_suggestions` accepts `{style_chips, vibe, niche}` and both paths return v2. Frontend `aiTopUp` sends the brief.

**Deps:** `jszip`, `opentype.js` (frontend-customer). **After `npm install`, immediately `docker compose restart nextjs-customer`** (bind-mounted package.json desync gotcha from Phase 1).

**Spec:** §4 of `docs/superpowers/specs/2026-07-08-logo-studio-v2-design.md`.

## Tasks

### Task 1: deps + `lib/logo/brand-kit.ts` (+ vitest for darkVariant)
- `darkVariant`: text → `#ffffff` when relative luminance < 0.45; tagline → `#cbd5e1` likewise; when the badge is `none`/outline-only and its solid fill is dark, lighten the fill to `#e5e7eb` (that fill paints the mark in those modes).
- `svgWithTextPaths(svgEl)`: clone; inline `<image>` hrefs as data URIs; for every `<text>`: resolve family/weight/size/anchor/letter-spacing/fill (walking ancestor groups), load TTF via fontsource (cached per family:weight), lay out glyph-by-glyph with tracking, baseline `y + (ascender+descender)/2 * (size/unitsPerEm)`, replace with `<path>`.
- `buildBrandKit({ lightSvg, darkSvg, markSvg, recipe })` → `Blob` (zip): `logo.png` (1024w) / `logo@2x.png` (2048w) / `logo-dark.png` / `logo-dark@2x.png` / `mark.png` (1024) / `favicon-512.png` / `favicon-192.png` / `favicon-48.png` / `logo.svg` / `logo-dark.svg` + returns `{ blob, svgIncluded }`.
- Vitest: darkVariant derivations (pure); slug/luminance helpers.
- Commit: `feat(logo-v2): brand kit builder (dark variant, text->paths svg, zip)`

### Task 2: Brand kit UI in the editor
- Below the context previews: "Brand kit" section with a single `Download brand kit (.zip)` button + note when SVG was skipped. Hidden fixed-offscreen `LogoRenderer` for the dark variant (ref), reusing `logoSvgRef`/`markSvgRef` for light/mark.
- Commit: `feat(logo-v2): downloadable brand kit in the editor`

### Task 3: Backend AI v2 (+ palette table) + frontend brief wiring
- `logo_recipe.py`: `PALETTES: dict[str, dict]` (badge fill/mark/text/tagline per id; `theme` resolved with the request's primary hex); `PALETTE_IDS = set(PALETTES)`.
- `logo_ai.py`: `_SuggestionV2` pydantic (all enums Literal from catalogs), `ai_suggestions(brief…) -> 8 v2 recipes` (assembled + `validate_recipe`d), prompt carries brand/niche/chips/vibe + catalogs; `fallback_suggestions` wrapped with `upgrade_recipe` → v2.
- `views.logo_suggestions`: parse `{style_chips, vibe, niche}` from the body (niche falls back to tenant `template_niche`); responses are v2 both paths.
- Tests: rewrite `test_logo_suggestions.py` assertions to v2 (`_assert_valid_recipes`: version 2, enums, colors shape); mock uses the new schema fields; rate-limit test unchanged in spirit.
- Frontend `aiTopUp`: POST body `{style_chips, vibe, niche}` from the brief; v2 recipes pass through `migrateRecipe` untouched.
- Commit: `feat(logo-v2): AI suggestions v2 (brief-aware, 8 recipes) + palette table`

### Task 4: e2e + gates + merge
- e2e: after save assertions pass, reopen the studio (`?studio=1` reload), click `Download brand kit`, assert Playwright `download` event with a `.zip` filename.
  (Reopen because save closes the dialog.) Reorder: trigger download before saving instead — simpler: in the editor, click Download brand kit, await download, THEN save.
- Full gates + prettier/ruff → merge to local main, delete branch, update memory.

## Exit criteria
Coach downloads a working brand kit (PNGs always; SVG when fonts fetchable); AI path emits brief-aware v2 recipes with graceful fallback; all suites green; merged to local main.
