# Logo Studio v2 — Phase 2: Composer + Brief + Ideas Wall

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The AI-first anchor flow — a coach describes their brand (Brief), instantly gets a wall of 24 diverse, polished, fully-editable logo options (deterministic client-side composer; AI recipes stream into the top slots when the key is set), and picks one to refine in the editor.

**Architecture:** A pure, seeded, deterministic composer module (`lib/logo/composer.ts`) maps `{brandName, niche, styleChips, seed}` → 24 v2 recipes with diversity enforcement; style chips bias the axis pools. The studio becomes a full-screen takeover with three steps (Brief → Ideas → Editor); the existing controls rail becomes the Editor step unchanged (Phase 3 rebuilds it into a canvas). The AI top-up reuses the existing `/logo-suggestions/` endpoint (v1 recipes migrated on receipt); Phase 4 upgrades that endpoint to v2 + brief inputs.

**Tech Stack:** TypeScript + Vitest (composer), React (studio steps), existing e2e Playwright.

**Spec:** `docs/superpowers/specs/2026-07-08-logo-studio-v2-design.md` §2 + §3 (Brief/Ideas). Phase 1 landed at `e770174`.

## Global Constraints

- **Branch:** `feat/logo-studio-v2-phase-2` from `main`. Shared working tree — verify `git branch --show-current` before every commit. Never push, never merge (merge happens via finishing flow at the end).
- Build gate: `npx vitest run` + `npm run build` green before every commit. Do NOT run `npm install` (no new deps this phase — avoids the bind-mount desync gotcha).
- The composer must be pure and deterministic (same input → same 24 recipes); every recipe it emits must pass backend `validate_recipe` (enums only from Phase-1 catalogs).
- KEEP-IN-SYNC: composer's niche→icon map mirrors `backend/apps/tenant_config/logo_ai.py` `NICHE_ICONS` (comment both ways).

---

### Task 1: `lib/logo/composer.ts` + vitest suite

**Files:**
- Modify: `frontend-customer/src/lib/logo/abstract.ts` (export the PRNG as `mulberry32`)
- Create: `frontend-customer/src/lib/logo/composer.ts`
- Test: `frontend-customer/src/lib/logo/__tests__/composer.test.ts`

**Interfaces (Tasks 2–3 + Phase 4 rely on):**
```ts
export type StyleChip = "Minimal" | "Bold" | "Elegant" | "Playful" | "Organic" | "Tech";
export const STYLE_CHIPS: StyleChip[];
export interface Brief { brandName: string; niche: string; styleChips: StyleChip[]; vibe: string; }
export function composeWall(brief: Brief, seed: number, count?: number /* =24 */): LogoRecipe[];
export function moreLikeThis(base: LogoRecipe, brief: Brief, seed: number, count?: number /* =8 */): LogoRecipe[];
```

**Mechanics:**
- `mulberry32(seed)` PRNG exported from `abstract.ts` (rename internal `rng`, keep behavior).
- Axis pools (layouts weighted: horizontal 0.4 / stacked 0.25 / emblem 0.15 / horizontal_reversed 0.1 / name_only 0.1; mark kinds: icon ~0.4 / abstract ~0.3 / initials ~0.3): each chip narrows palettes / font vibes / badge shapes / typography presets / abstract families; multiple chips = union; no chips = balanced defaults.
- Niche keywords → icon pool (mirror of `NICHE_ICONS` + defaults) and abstract-family pool (e.g. yoga→bloom/waves, fitness→prism/orbits, tech→grid/orbits, music→waves/orbits).
- Diversity: no two recipes share the same `(markKey, palette_id, font)`; retry a slot up to 12 times, else accept. `markKey` = `icon:<name>` / `abstract:<family>` / `initials:<style>`.
- `moreLikeThis`: locks the mark family (same icon; same abstract family w/ fresh seeds; same initials style) and the palette id; varies layout, font (same-vibe pool), badge, typography with the new seed.
- All emitted recipes: `version:2`, `name: brief.brandName || "My Brand"`, `tagline: ""`, zeroed `elements`, palette applied via `applyPalette` (so `palette_id` is set).

**Steps (TDD):**
- [ ] Failing tests: determinism (same seed → deep-equal walls), seed variation, count=24, diversity (no duplicate `(markKey,palette,font)` triples; ≥3 mark kinds; ≥8 distinct palettes), chip bias (Elegant → every font from the Elegant/Modern serif pool + no filled hexagon/diamond badges; Tech → palettes ⊆ tech pool), every recipe passes a local structural check (enums from catalogs), niche "yoga" biases icons to the yoga pool.
- [ ] Implement; `npx vitest run` green.
- [ ] Commit: `feat(logo-v2): deterministic wall composer with style chips + diversity`

### Task 2: Studio shell → full-screen 3-step takeover + Brief step

**Files:**
- Modify: `frontend-customer/src/components/logo/logo-studio.tsx` (shell: steps state, full-screen, step nav)
- Create: `frontend-customer/src/components/logo/studio-brief.tsx`

**Behavior:**
- Panel goes full-screen (`inset-4` rounded or true full-screen `inset-0`; keep `role=dialog` + Escape/focus a11y from Phase 1).
- Header: title, step tabs `Ideas`-flow: **Brief → Ideas → Editor** (tab buttons with `aria-pressed`; free navigation back/forward; Ideas tab disabled until a wall exists), Save button (enabled on Editor step only — the coach must land on the editor before saving).
- Open logic: saved recipe → `editor`; no recipe → `brief`. "Get new ideas" button in the Editor rail → `brief`.
- Brief step: brand name (prefilled from recipe.name), "What do you teach?" niche input (prefilled from `getattr(tenant, template_niche)`? not exposed client-side — leave blank unless config has something; just default ""), style chips (toggle, max 3), optional one-line vibe text, primary CTA "Show my logo ideas" → `composeWall` with a fresh seed → step `ideas` + fires the AI top-up in the background.
- Brief state lives in the shell so Ideas/Shuffle reuse it.

**Steps:**
- [ ] Implement shell + brief; `npm run build` green; dev-server route 200.
- [ ] Commit: `feat(logo-v2): full-screen studio shell with Brief step`

### Task 3: Ideas wall (24 cards, shuffle, more-like-this, AI top-up)

**Files:**
- Create: `frontend-customer/src/components/logo/studio-wall.tsx`
- Modify: `frontend-customer/src/components/logo/logo-studio.tsx` (wire step, AI top-up)

**Behavior:**
- Grid of cards (each `LogoRenderer` width ≈ 200 on a light/dark toggleable card bg), `data-testid="logo-wall"`.
- Card hover/footer actions: **Customize** (adopt recipe → step `editor`), **More like this** (replace wall with `moreLikeThis` batch + a "Show all ideas" button that re-runs `composeWall` with a new seed).
- **Shuffle** button: new seed → instant new wall.
- AI top-up: on wall creation, if a fetch to the existing `/api/v1/admin/config/logo-suggestions/` succeeds **with `source === "ai"`**, migrate the 4 recipes (rename to brief.brandName) and replace the first 4 wall slots. Fallback-source responses are ignored (the deterministic wall is already better and unlimited). Errors are silent. In-flight responses are dropped if the coach already shuffled (guard with a generation counter).
- Wall cards render ~24 LogoRenderers — memoize cards (`React.memo` on a Card component) so hover state doesn't re-render the world.

**Steps:**
- [ ] Implement; build green; manual: brief → 24 cards render, shuffle changes them, customize lands in editor with that recipe.
- [ ] Commit: `feat(logo-v2): ideas wall with shuffle, more-like-this, AI top-up`

### Task 4: e2e + phase verification

**Files:**
- Modify: `e2e/specs/15-logo-studio.spec.ts`

**Spec flow (handles both fresh + previously-saved tenant state):** open `?studio=1`; if the Editor rail is shown (saved recipe), click "Get new ideas". Fill brief name if empty, click "Show my logo ideas"; assert `logo-wall` visible with 24 cards (`[data-testid="logo-wall"] >> [data-part="name"]` count or a card testid count = 24); click Shuffle, assert cards changed (compare first card's inner HTML before/after); click the first card's Customize; in the editor pick icon `flower-2` + fill tagline; save; assert PATCH persists v2 recipe as in Phase 1 (drop the layout assertion to "is one of the five v2 layouts" since the wall card picked it).
- [ ] Run `cd e2e && npx playwright test 15-logo-studio` → PASS.
- [ ] Full gate: tenant_config pytest, vitest, build, ruff/prettier on changed files.
- [ ] Commit: `test(logo-v2): e2e covers brief -> wall -> customize -> save`

## Exit criteria
Wall of 24 renders instantly offline; every wall recipe saves cleanly through backend validation; existing editor flow intact; all suites green; branch merged to local main via finishing flow.
