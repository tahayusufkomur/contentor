# Courses block display options (sub-project B) — design

**Date:** 2026-06-19
**Status:** Approved, pending implementation plan
**Context:** Second of the coach site-builder punch-list sub-projects. Sub-project
A (block-editor fixes) is complete on local `main`. This is the **frontend-only**
display-options half of the Courses-block work. The *real category taxonomy* the
user asked for (model + migration + admin + API + course-form + filter pills) is a
full-stack feature and is split into its **own** follow-up sub-project (tackled
after B, before C/D) — see Non-goals.

## Problem

The Courses block (`courseGrid`) has only three controls — `layout`
(standard/centered heading), `heading`, and `limit`. Everything else is
hardcoded in `CourseCatalogClient`:

- a fixed **3-column** grid (`sm:grid-cols-2 lg:grid-cols-3`),
- an **always-visible** search box + pricing-filter pills (All / Free / Paid /
  My Courses),
- a single **card look** (hover-lift + shadow),
- price (`PriceBadge`) and meta (instructor + lesson count) **always shown**.

Coaches want to tune the catalog's density and emphasis per page (e.g. a tight
4-column grid with no toolbar and no prices for a "featured" strip, vs. the full
browsable catalog).

## Goals

Add four display options to the Courses block, all as **block data fields**
(not `style` overrides), wired through `CourseGridBlock → CourseCatalogClient →
CourseCard`:

1. **Column count** — 2 / 3 / 4 (default 3).
2. **Card style** — Elevated / Bordered / Minimal / Overlay (default Elevated).
3. **Show search & filters** — toggle the existing search + pricing-filter
   toolbar (default on).
4. **Show price** and **Show meta** — independent toggles for `PriceBadge` and
   the instructor/lesson row (default both on).

Every default reproduces today's exact rendering, so existing saved pages are
visually unchanged.

## Why frontend-only (no backend change)

The backend's `_clean_block` (`apps/tenant_config/serializers.py`) does
`block = dict(raw)` and only sanitizes `type`, `id`, `enabled`, the clamped
`style` override, rich-text fields, and unsafe URLs. **All other block data
fields pass through untouched** — exactly like `headingLevel` in sub-project A.
The new fields are block *data*, not `style`, so `BLOCK_STYLE_ALLOWLIST` (which
governs only background/spacing/align and does not list `courseGrid`) is
irrelevant. No serializer, allowlist, or migration change.

## Non-goals

- **Real category/topic taxonomy is out of scope for B.** The data model has no
  `Course.category`; the existing filter pills are pricing-based. A managed,
  per-tenant Category taxonomy (model + migration + adminkit registration +
  course serializer field + course-edit-form picker + public category filter
  pills) is its **own full-stack sub-project**, brainstormed separately after B.
  The `showFilters` toggle added here is forward-compatible: when category pills
  land, the same toggle gates them.
- No backend changes.
- No new block types or `style` controls; only new `courseGrid` data fields.
- No changes to `frontend-main` (the Courses block is a `frontend-customer`
  site-builder block only).

## Design

### New `courseGrid` fields (registry.tsx)

Add to `defaultData` (values chosen to reproduce current rendering):

```ts
columns: "3",          // select value is a string
cardStyle: "elevated",
showFilters: true,
showPrice: true,
showMeta: true,
```

Add to `fields` (after `limit`), using the existing `select` and `toggle`
control kinds (both already supported by `owner/field-renderer.tsx`):

```ts
{ key: "columns", label: "Columns", type: "select", options: [
    { label: "2 columns", value: "2" },
    { label: "3 columns", value: "3" },
    { label: "4 columns", value: "4" },
] },
{ key: "cardStyle", label: "Card style", type: "select", options: [
    { label: "Elevated", value: "elevated" },
    { label: "Bordered", value: "bordered" },
    { label: "Minimal", value: "minimal" },
    { label: "Overlay", value: "overlay" },
] },
{ key: "showFilters", label: "Show search & filters", type: "toggle" },
{ key: "showPrice", label: "Show price", type: "toggle" },
{ key: "showMeta", label: "Show instructor & lessons", type: "toggle" },
```

### Data flow

`CourseGridBlock` reads the fields off `data` and passes them down, defaulting
**undefined → current behavior** (so older saved blocks are unchanged):

```ts
columns={Number(data.columns) || 3}
cardStyle={(data.cardStyle as CourseCardVariant) || "elevated"}
showFilters={data.showFilters !== false}
showPrice={data.showPrice !== false}
showMeta={data.showMeta !== false}
```

### `CourseCatalogClient` — columns + filter toggle

- New props: `columns`, `showFilters`, `cardStyle`, `showPrice`, `showMeta`
  (all optional, defaulting to today's behavior).
- Replace the hardcoded grid class with a **literal-string** map (Tailwind JIT
  needs full literals):

  ```ts
  const COLUMN_CLASSES: Record<number, string> = {
    2: "grid gap-4 sm:grid-cols-2",
    3: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid gap-4 sm:grid-cols-2 lg:grid-cols-4",
  };
  ```
  Use `COLUMN_CLASSES[columns] ?? COLUMN_CLASSES[3]`.
- Wrap the search + filter toolbar in `{showFilters && ( … )}`. Search/filter
  state stays harmless when hidden (defaults: `filter="all"`, `search=""`).
- Pass `variant={cardStyle} showPrice={showPrice} showMeta={showMeta}` to each
  `CourseCard`.

### `CourseCard` — style variants + price/meta toggles

Export `type CourseCardVariant = "elevated" | "bordered" | "minimal" |
"overlay"`. New props: `variant` (default `"elevated"`), `showPrice` (default
`true`), `showMeta` (default `true`). All token-only / theme-aware.

- **Elevated** (default — unchanged): `Card` with
  `hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5`.
- **Bordered**: `Card` (keeps its default `border`), drop the lift/shadow; add
  `hover:border-primary/40 transition-colors` for a calm hover.
- **Minimal**: no `Card` surface — a plain wrapper (`group overflow-hidden
  rounded-xl`), image + text only, no border/shadow/bg.
- **Overlay**: image fills the card; title + price sit over the image's bottom
  with a **token** scrim `bg-gradient-to-t from-background/90 via-background/40
  to-transparent` and `text-foreground` (no raw colors — theme-aware in all 7
  themes). Meta (when shown) renders below the image in normal flow, or is
  omitted if the overlay would crowd — keep meta below the image for overlay.

Elevated / Bordered / Minimal share the existing stacked layout (image on top,
`CardContent`/wrapper below) and differ only by wrapper classes; **Overlay** is a
distinct layout branch (content absolutely positioned over the image). Branch
`variant === "overlay"` vs. the stacked path. Gate `PriceBadge` on `showPrice`
and the instructor/lesson row on `showMeta` in both paths.

## Files

- Modify: `frontend-customer/src/lib/blocks/registry.tsx` (courseGrid
  `defaultData` + `fields`)
- Modify: `frontend-customer/src/components/blocks/course-grid-block.tsx` (pass
  props down)
- Modify: `frontend-customer/src/components/public/course-catalog-client.tsx`
  (props, column map, filter toggle, pass card props)
- Modify: `frontend-customer/src/components/public/course-card.tsx` (variant +
  price/meta props, 4 style branches)

## Verification

1. `tsc --noEmit` clean for `frontend-customer`.
2. Visual check in the running editor (dev stack), a light **and** a dark theme:
   - Columns 2 / 3 / 4 visibly change grid density.
   - Each card style renders correctly (Elevated lift, Bordered flat, Minimal
     chrome-less, Overlay scrim legible over both a thumbnail and the
     no-thumbnail gradient fallback).
   - Toggling **Show search & filters** off hides the whole toolbar; on restores
     it.
   - **Show price** / **Show meta** off hide their elements; on restore them.
3. A pre-existing saved Courses block (no new fields) renders exactly as before
   (3 columns, Elevated, toolbar + price + meta all shown).
4. Token-only check: no raw colors introduced; Overlay scrim uses `background`
   token opacities; renders in all 7 themes.

## Risks

Low. Additive, frontend-only, defaults preserve current output. The only layout
restructure is the Overlay card branch; the scrim is the one legibility-sensitive
bit and is handled token-only (`from-background/90`) so it adapts per theme. JIT
needs the column/scrim class literals spelled out (they are).
