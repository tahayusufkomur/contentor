# Logo Studio v2 — "Powerful Studio" Design

**Date:** 2026-07-08
**Status:** Approved design, pending implementation plan
**Supersedes:** the v1 Logo Studio scope (docs/superpowers/plans/2026-07-07-logo-studio.md) — v1 stays live throughout; v2 grows it in place.

## Goal

Turn the Logo Studio from a basic template composer into a flagship, Looka-style
studio: a coach describes their brand, gets a wall of 24 polished, distinct logo
options instantly, refines their pick on a direct-manipulation canvas, and walks
away with both a configured site (header logo, favicon, PWA icons) and a
downloadable brand kit.

Non-negotiable invariant carried over from v1: **one SVG renderer
(`LogoRenderer`/`MarkRenderer`) is the single source of truth** for live
preview, canvas, wall cards, PNG/SVG export, favicon and PWA icons. Everything
in this design extends that renderer; nothing bypasses it.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Main gap | All of it — flagship, multi-phase |
| Anchor flow | AI-first, Looka-style (brief → wall of options → editor) |
| Generation | Parametric recipes (no image-gen); AI composes recipes, deterministic composer is the engine |
| Editor depth | Freeform-lite: fixed element set (mark, name, tagline), directly draggable/scalable on canvas with snap guides; no arbitrary layers |
| Exports | Yes — downloadable brand kit (transparent PNGs, true SVG, favicon sizes) |
| Architecture | Approach A: recipe schema v2 + grown renderer, full-screen studio; keep the single-renderer invariant |

## Section 1 — Recipe schema v2 & renderer growth

The recipe stays a versioned JSON blob validated by the backend
(`validate_logo_recipe`) and mirrored in TS (`frontend-customer/src/types/logo.ts`).

### Schema v2 (shape, not final field names)

```ts
interface LogoRecipeV2 {
  version: 2;
  layout: "horizontal" | "horizontal_reversed" | "stacked" | "name_only" | "emblem";
  name: string;
  tagline: string;                       // "" = no tagline element
  mark:
    | { type: "icon"; icon: string; style: "outline" | "solid" }
    | { type: "initials"; style: "plain" | "monogram" | "split" | "overlap" }
    | { type: "abstract"; family: "orbits" | "bloom" | "waves" | "prism" | "knot" | "grid"; seed: number }
    | { type: "image"; photo_id: string; url: string };
  badge: {
    shape: "none" | "circle" | "rounded" | "squircle" | "hexagon" | "shield" | "diamond";
    outline: boolean;                    // outline-only variant; fill lives in colors.badge
  };
  typography: {
    name:    { font: string; weight: 400 | 500 | 600 | 700 | 800; tracking: number; case: "none" | "upper" | "title" };
    tagline: { font: string; weight: 400 | 500 | 600 | 700 | 800; tracking: number; case: "none" | "upper" | "title" };
  };
  colors: {
    palette_id: string | null;           // curated palette reference, null = custom
    badge: Fill;                         // the badge's fill (single source; badge object holds shape/outline)
    mark: string;                        // hex
    text: string;                        // hex
    tagline: string;                     // hex
  };
  elements: {                            // placement overrides on top of layout base slots
    mark:    { offset: [number, number]; scale: number };
    name:    { offset: [number, number]; scale: number };
    tagline: { offset: [number, number]; scale: number };
  };
}

type Fill =
  | { type: "solid"; color: string }
  | { type: "linear"; from: string; to: string; angle: number }
  | { type: "radial"; from: string; to: string };
```

### Vocabulary

- **Layouts (5):** horizontal (mark left of text), horizontal_reversed (mark
  right), stacked (mark above centered text), name_only (wordmark),
  emblem (name rendered inside the badge container, tagline below it).
- **Tagline:** optional second text element with its own typography + color.
- **Marks:**
  - `icon` — existing 64-icon catalog, plus a style axis (outline = current
    lucide stroke look; solid = filled rendering).
  - `initials` — monogram styles: plain (today's), monogram (circled,
    interlocked feel), split (initials separated by a divider), overlap.
  - `abstract` — **new**: 6 seeded parametric SVG symbol generator families
    (orbits, bloom, waves, prism, knot, grid). Each family is a pure function
    `(seed, colors) → SVG group`; the recipe stores only `{family, seed}` so
    the same recipe always renders identically everywhere (client, export,
    AI cards). This is the main source of Looka-like variety.
  - `image` — upload, unchanged from v1.
- **Badges (7 shapes):** none, circle, rounded, squircle, hexagon, shield,
  diamond; fill is solid or gradient (linear with angle, radial); outline-only
  variant.
- **Typography:** font catalog grows 8 → ~20 Google Fonts, grouped in 5 vibes
  (Modern, Elegant, Bold, Playful, Minimal). Per-text-element weight
  (400–800), letter-spacing (tracking), case transform (upper / title /
  as-typed).
- **Colors:** ~24 curated palettes (each defines badge fill — possibly a
  gradient — mark fg, name color, tagline color), plus per-element custom
  color pickers. "Your theme" palette derived from the tenant's primary color
  stays the first option.
- **Placement:** keep v1's proven model — the layout computes base slots; each
  element stores `{offset, scale}` on top. No rotation, no z-order, no
  arbitrary elements (YAGNI). Tracking is em-relative letter-spacing.
- **Square mark (favicon/PWA):** `MarkRenderer` keeps v1's rules — it renders
  only the mark (never name/tagline), and `name_only` recipes fall back to an
  initials mark so the favicon is never empty (every other layout, emblem
  included, already carries a real mark).

### Migration v1 → v2

- A pure function mirrored in **both** TS and Python (same KEEP-IN-SYNC comment
  discipline as the icon catalog): maps v1 `layout` (`badge_name`/`icon_name`/
  `name_only`) + `badge` + `colors` + `overrides` into the v2 shape with
  defaults for new fields (empty tagline, solid fills, weight 700, tracking 0,
  case none).
- Backend `validate_logo_recipe` accepts v1 and v2; v1 is upgraded on read.
  Saves always write v2. Existing coach logos re-open exactly as saved.

## Section 2 — Generation engine

- **Deterministic client-side composer** (TS module):
  `compose({ brandName, nicheKeywords, styleChips, seed }) → LogoRecipeV2[24]`.
  Instant, offline, zero cost. The AI-first experience never depends on
  `ANTHROPIC_API_KEY` — same philosophy as v1's fallback, promoted to engine.
- **Style chips** (choose up to 3): Minimal, Bold, Elegant, Playful, Organic,
  Tech. Chips bias the axes (e.g. Elegant → serif fonts, wide tracking, muted
  palettes, thin/outline badges; Bold → display fonts, strong gradient badges,
  high contrast). Niche keywords reuse + expand the existing keyword→icon
  mapping and also select abstract families.
- **Diversity enforcement:** the 24 results are spread across layouts, mark
  types (niche icons / monograms / abstracts), palettes and font vibes, with a
  simple axis-distance check so no two cards are near-duplicates.
- **Shuffle** = new seed → instant new wall.
- **"More like this"** on a card: lock its mark family + palette mood, vary the
  other axes with new seeds. Deterministic, no AI call.
- **AI as taste, streamed on top:** when the key is set, the studio also calls
  the backend AI endpoint (extended `/api/v1/admin/config/logo-suggestions/`,
  now accepting the brief + style chips + optional free-text vibe and
  returning 8–12 v2 recipes via structured output). The deterministic wall
  renders immediately; AI picks stream into the top slots on arrival. AI
  failure or timeout is invisible — the wall is already there.
- **Rate-limiter fix folded in:** the 10/hr/tenant limiter charges only real
  AI calls, no longer the free deterministic path (logged minor from v1).

## Section 3 — Studio experience (Brief → Ideas → Editor)

- **Full-screen takeover** replacing the current `max-w-6xl` modal. Same
  `ModalPortal` + a11y pattern (Escape-with-save-guard, `role="dialog"`,
  focus-in/restore) and the `?studio=1` deep link keeps working. Three steps
  across the top; free back-and-forth navigation.
- **Step 1 · Brief:** brand name (prefilled from config), niche / what-you-teach
  (prefilled when known), style chips, optional one-line "describe your vibe"
  free text (consumed only by the AI path).
- **Step 2 · Ideas:** wall of 24 cards on a light/dark toggleable background;
  Shuffle; per-card "Customize" and "More like this". A coach re-editing an
  existing logo skips straight to the Editor with their saved recipe; a
  "Get new ideas" action returns here.
- **Step 3 · Editor (freeform-lite canvas):**
  - Center canvas with light/dark preview toggle. Click an element (mark /
    name / tagline) to select: bounding box + corner scale handles; drag to
    move with snap guides (center lines, edge alignment, v1's snap-to-zero)
    and arrow-key nudge.
  - Contextual right panel: element selected → that element's controls (mark
    picker incl. icon/monogram/abstract browsing; or font, weight, case,
    tracking, color). Nothing selected → global tabs: Layout, Palette, Badge.
  - Real-context previews below the canvas carry over from v1: site header
    (light + dark), browser tab, app icon.
  - `aria-pressed` on all toggle buttons (logged v1 minor, fixed here).
- **Save pipeline unchanged:** render → wide logo PNG + square mark PNG →
  upload → PATCH `logo_recipe` + `logo_id/logo_url/icon_id/icon_url`. Favicon
  and PWA icon pipelines are untouched. The EditSidebar debounced autosave
  gets the same base64-stripping treatment as LogoStudio's own PATCH (logged
  v1 minor, fixed here).

## Section 4 — Brand kit, backend, error handling, testing

### Brand kit (Editor panel)

Individual downloads + "Download all (.zip)" via `jszip`:

- Transparent logo PNG, light and dark variants (dark variant auto-derives
  readable text/mark colors), at 1024w and 2048w.
- Square mark PNG (1024) + favicon sizes (512 / 192 / 48).
- **True SVG vector** with text converted to paths via `opentype.js` (font
  `.ttf`s fetched from Google Fonts at export time) so the file renders
  identically anywhere without webfonts. If a font fetch fails, the coach
  still gets PNGs plus a clear message — never a broken SVG.

### Backend (`apps.tenant_config` only; no new models/migrations)

- `validate_logo_recipe`: accept v1 + v2, upgrade v1 on read, always save v2.
- `logo_ai.py`: mirrored v2 catalog (fonts, palettes, abstract families, icon
  styles — KEEP-IN-SYNC comments both ways), richer structured-output schema,
  brief/style-chip/vibe inputs.
- Rate limiter charges only real AI calls.

### Error handling

- Composer is pure/deterministic — cannot fail.
- AI path silently absent on error/timeout; wall never blocks on it.
- Upload/save keep v1's error surface (inline error + "upload a file instead"
  affordance).
- SVG export degrades to PNG-only with a message.

### Testing

- **Backend:** v2 validation, v1→v2 migration, AI schema tests alongside
  `test_logo_studio.py`.
- **Frontend unit:** composer determinism + diversity; migration function.
- **e2e:** extend `e2e/specs/15-logo-studio.spec.ts` — brief → wall renders
  24 → customize → select/drag → save; download assertion for the brand kit.

### Phasing (each phase leaves main shippable)

1. Schema v2 + renderer growth + migration (TS + Python).
2. Composer + Brief + Ideas wall.
3. Freeform-lite editor canvas + contextual panels.
4. Brand kit + AI upgrade + polish/a11y.

### Out of scope

- The pre-existing Satori `/pwa-icon` blank-fallback bug (separate ticket —
  see the logo-studio memory / `/po` backlog).
- Arbitrary layers, shapes, extra text elements; element rotation.
- AI image generation (raster marks).
- Logo history/versioning.
