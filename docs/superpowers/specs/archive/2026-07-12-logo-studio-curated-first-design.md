# Logo Studio — curated-first Ideas, wall removal, reuse-the-icon

Date: 2026-07-12
Status: approved design, pending implementation plan
Scope: `frontend-customer/` (Logo Studio) + `backend/apps/core` (curated logos)

## Context

The Logo Studio is a three-step coach flow: **Brief → Ideas → Editor**. Today the
Ideas step shows a curated gallery *plus* a deterministic "wall" of 24 auto-composed
recipes behind a `<details>More auto-generated ideas` disclosure. The curated library
(shipped in the prior phase) is now the primary Browse surface; the wall is redundant
noise and drags along a large amount of dead machinery (the legacy AI Brand Pack
round-trip). Curated logos are served as 3–5 MB raster PNGs (`image` marks) — heavy,
not editable, not recolorable.

This change removes the wall entirely, makes Ideas a curated-first "complete logo
solution" (mark + name + tagline, filtered to the brief), vectorizes curated art so it
is lightweight and editable, and fixes AI refine so it reuses the coach's existing icon
instead of overwriting it.

## Goals

1. Delete the deterministic wall and its dead legacy-pack code paths.
2. Ideas = curated gallery only, filtered/ranked to the coach's brief (niche + style).
3. Picking a curated logo produces a **complete** logo (mark + brand name + tagline).
4. Curated art is converted to lightweight editable **vector** marks where feasible,
   with a PNG fallback.
5. AI refine **reuses** the current mark by default; an explicit control redraws it.

## Non-goals

- No change to the paid-tier Design-with-AI chat wizard (`studio-chat.tsx`) — it stays.
- No change to the deterministic Brief step other than adding an optional tagline field.
- No LLM-based Ideas ranking (tags only) and no AI-generated taglines (Brief field only).
- No loosening of `validate_logo_recipe` custom-mark caps (curated traces stay within them).

## Locked decisions (from design Q&A)

| Area | Decision |
|------|----------|
| Ideas filtering | **Tags only** — score curated tags against brief niche + style chips; no AI call. |
| Name + tagline | **Optional Brief field** — coach-controlled, deterministic, free. |
| Refine + icon | **Explicit "Redraw the icon" toggle, default OFF** (simpler than per-mark provenance; see F). |
| Vectorize curated | **Ingest-trace + PNG fallback** — trace at seed/admin-upload, within recipe caps. |

## Work breakdown

### A. Remove the wall

**`components/logo/studio-entrance.tsx`** — reduce to the two door cards (Ready-made /
Design with AI) + `CuratedGallery`. Remove:
- the `<details>More auto-generated ideas` block and `StudioWall` import/render;
- props `wall, wallDark, showingVariants, onToggleWallDark, onShuffle, onShowAll,
  onUseWall, onMoreLikeThisWall`.

**`components/logo/logo-studio.tsx`** — remove:
- state `wall, wallSeed, wallDark, showingVariants` and legacy `pack, packSeed`;
- functions `regenerateWall`, `handleMoreLikeThis`;
- imports/calls of `composeWall`, `moreLikeThis`, `composePackWall`;
- the session-restore branch that reconstructs a wall (`composeWall` + `composePackWall`
  fan-out) and rehydrates `pack`/`packSeed`;
- `startIdeas` no longer composes a wall — it sets `ideasReady` and `setStep("ideas")`.

**`lib/logo/composer.ts`** — delete (verified to have no remaining callers once the
above lands): `composeWall`, `moreLikeThis`, `composePackWall`, `composeDesigns`,
`composeFromPack`, `packElementsByIndex`, and pack-only constants/types
(`PACK_LAYOUTS`, `PACK_BADGES`, legacy `BrandPack.marks` fan-out). **Keep**
`composeConverseDesign`, `composeIconPreview`, `applyRefinedDesign`, and their shared
helpers (`resolveRole`, `markFillFor`, `taglineWeight`, `clampTracking`, `clampScale`,
`toCustomPaths`) — used by the chat and refine.

**`lib/logo/studio-session.ts`** — drop the persisted `pack`/`packSeed` fields and its
`composeFromPack` import (the only remaining external `composeFromPack` reference).

**Ideas nav gating** — in the step nav, replace
`disabled={s.id === "ideas" && !wall}` with `disabled={s.id === "ideas" && !ideasReady}`.
`ideasReady` is a boolean that is:
- `false` for a fresh saved-logo coach with no restored session (they reach Ideas via
  "Get new ideas" → Brief, exactly as before, when the wall was `null`);
- `true` after `startIdeas()` runs (Brief submitted this session);
- `true` on session-restore (a restored session was already past Brief).

**`components/logo/studio-wall.tsx`** — delete the file.

### B / C. No-logo flow + Ideas filtering (tags only)

Routing is unchanged: a coach with no saved `logo_recipe` starts at Brief; a coach with
one lands in the Editor. Ideas is now curated-only.

Filtering upgrades `lib/logo/library-catalog.ts` `rankByNiche` (today: matches only
`config.niche` against tags) to rank against the **brief**: build a keyword set from
`brief.niche` tokens + lowercased `brief.styleChips`, score each curated logo by tag
overlap, and sort highest-match first (stable within equal scores). `logo-studio.tsx`
re-ranks the library when the brief is submitted, falling back to `config.niche` before a
brief exists. `CuratedGallery`'s manual tag-chip filter is retained.

### D. Complete solution: name + tagline

- `Brief` (in `composer.ts`) gains an optional `tagline?: string`.
- `studio-brief.tsx` gains an optional tagline input (below niche/style).
- `handleUseCurated` seeds `name: brief.brandName || config.brand_name` **and**
  `tagline: brief.tagline ?? ""` into the produced recipe, so a picked curated logo is a
  full lockup, not a bare mark.

### E. Vectorize curated (ingest-trace + PNG fallback)

**Model** — `backend/apps/core/models.py` `CuratedLogo` gains
`mark_paths = models.JSONField(null=True, blank=True)` (list of `{d, fill}` path dicts as
returned by `trace_mark`, or null when tracing did not produce a usable mark). Migration
in `apps/core/migrations/`.

**Ingest** — trace the PNG and populate `mark_paths`:
- `seed_curated_logos.py`: after loading each PNG's bytes, call
  `apps.tenant_config.logo_trace.trace_mark(png_bytes)`; store the result (or null).
- Admin upload: on `CuratedLogo` save when `image_key` changes, (re)trace and store.
  Tracing is best-effort — never raise into `save()`; null on any failure.
- Traces are kept within the existing `trace_mark` caps (≤12 paths / ≤12k chars), which
  match `validate_logo_recipe`'s custom-mark limits, so a saved coach recipe validates.
  Art that blows the caps or traces pathologically stays `mark_paths = null` → PNG.

**API** — `curated_catalog` view adds `mark_paths` (nullable) to each row.

**Frontend** — `library-catalog.ts` `CuratedLogo` gains `markPaths?: CustomMarkPath[]`
(parsed from the response). `handleUseCurated`:
- if `markPaths` present → build a recipe whose `mark` is
  `{ type: "custom", rationale: logo.title, paths: markPaths }` (editable, recolorable,
  a few KB), with brand name + tagline (D). No PNG fetch/upload needed for the mark.
- else → today's path: fetch PNG, upload as `image` mark.

**Trade-off (intended)** — a traced mark recolors to the studio palette as a flat 2–3
color mark, which is lighter and more logo-appropriate than a gradient raster. Complex /
colorful art (e.g. gradient faces) falls back to PNG rather than tracing poorly.

### F. Reuse the icon on refine

Chosen over per-mark provenance (which would need a new stamp on the mark schema + a
migration): an **explicit "Redraw the icon" toggle** in the refine box, default OFF.

- `studio-panel.tsx` `RefinePromptBox` gains a "Redraw the icon" checkbox (default off)
  and passes its value out: `onRefine(instruction, redrawMark)`.
- `logo-studio.tsx` `handleRefine(instruction, redrawMark)`:
  - `redrawMark === false` (default) → apply the AI design's lockup (layout, badge, font,
    typography, text + tagline colors) but **keep** `recipe.mark` and its mark color roles;
  - `redrawMark === true` → today's behavior (AI-drawn mark replaces the current one).
- `composer.ts` `applyRefinedDesign(recipe, design, opts?: { keepMark?: boolean })`:
  when `keepMark`, do not overwrite `mark`, `colors.mark`, `colors.mark2`,
  `colors.mark_accent` — apply everything else. Default (no opts) is unchanged, so the
  two-pass draft/finish refine and existing tests keep working.

Outcome matches the request ("reuse the icon; can always start from scratch") for *any*
mark type, with no schema change. Correctness note: `handleRefine` calls
`applyRefinedDesign` **twice** in the two-pass flow — once to build the draft recipe it
renders for `fetchRefineFinish`, once to apply the finished design — so the `keepMark`
flag must be threaded through **both** calls; otherwise the finish pass re-overwrites the
mark the draft pass preserved.

## Testing

- **Unit** — `composer.test.ts`: remove wall/pack tests (`composeWall`, `moreLikeThis`,
  `composePackWall` and friends); add `applyRefinedDesign(..., {keepMark:true})` coverage
  (mark + mark colors preserved, lockup applied). `library-catalog.test.ts`: brief-based
  ranking (niche + chips), and `markPaths` parsing. `studio-session.test.ts`: drop
  pack/packSeed round-trip.
- **Backend** — `test_curated_logos.py`: `mark_paths` present in the API row; trace
  populated at seed for a trace-friendly fixture and null for a pathological one; save
  signal (re)traces on image change and never raises.
- **e2e** — rewrite `15-logo-studio.spec.ts` to the curated-first story: Brief (name +
  niche + chip + optional tagline) → curated "Use this" → Editor fine-tune → save,
  asserting the persisted recipe carries the name/tagline and a custom (traced) or image
  mark. Keep the Design-with-AI panel open/close assertion. Drop all wall assertions
  (Shuffle, `wall-card` count, customize-from-wall). `17-logo-curated-library.spec.ts`
  keeps curated-library specifics; the two converge on "Browse is curated-only."

## Risks / trade-offs

- **Trace quality/coverage** — the current curated set is detailed illustration; an
  unknown fraction will exceed the caps and fall back to PNG. Acceptable for v1; if too
  many fall back, a *follow-up* can raise curated caps **and** the matching
  `validate_logo_recipe` ceiling together (out of scope here).
- **Recolor surprise** — traced marks lose their original multi-color look when recolored
  to the palette. This is the intended "good for logo" behavior; the coach can still pick
  colors, and PNG-fallback art keeps its original look.
- **Shared working tree** — main moves under concurrent agents; verify branch/base before
  any ref moves (see repo memory).

## Out of scope / follow-ups

- Raising curated trace caps + recipe validation ceiling for higher-fidelity vectors.
- Capturing a traced mark's original quantized colors as a starting palette.
- AI-ranked Ideas / AI-generated taglines (deliberately deferred; Brief-field + tags now).
