# Logo Curated Library — Design

**Date:** 2026-07-12
**Status:** Design approved (revised after seeing the real assets), pending plan
**Feature area:** Logo Studio (`frontend-customer`)

## 1. Overview

Add a **curated library of hand-picked logos** to the Logo Studio. Before a coach
generates anything with AI, we suggest finished, professional logo **illustrations**
matched to their niche. A coach can **use** a curated logo as-is (free) or **create their
own** with AI (paid) seeded by the curated logo's original generation prompt. The library
is the new star of the free experience; the existing algorithmic "wall of 24" is demoted
to a secondary collapsible option.

The curated logos are **finished full-color PNG illustrations** (e.g. continuous-line art,
multi-color silhouettes, watercolor shapes), authored by the owner and stored in the repo.
They are **not** simple marks and do **not** trace cleanly to our editable recipe schema —
so picking one produces an **image-mark logo**: the illustration stays pristine as the
mark, and the coach edits the brand **name, tagline, colors, and layout** around it.

### Source of truth (already built)
The library lives at **`frontend-customer/public/logos/`**:
- `logo_meta.json` — an array of `{title, filename, prompt, tags}`.
- `<filename>.png` — the illustration, served as a static asset at `/logos/<filename>`.

This directory is committed to git, so the hand-created data is **inherently durable**
(survives `make dev-reset`, diff-reviewable in PRs). Phase 1 reads this catalog directly
on the frontend — **no DB, no backend endpoint**. A DB + superadmin management UI is a
later phase that writes back to these same files.

### Goals
- A niche-matched gallery of curated logo illustrations as the primary free entry point.
- **Use this** (free): the illustration becomes the coach's logo (image mark), with
  editable brand name / tagline / colors / layout around it, saved through the existing
  export path.
- **Create your own with AI** (paid): opens the AI chat seeded with the curated logo's
  `prompt`, so AI riffs in the same spirit. Free tier → upgrade prompt.
- Free tier can fully browse/pick/edit/save a curated logo; only AI is paid.

### Non-goals
- No tracing of these illustrations into editable recipes (they are artwork — tracing
  would wreck them). Tracing stays available for any genuinely simple/vector logos added later.
- No DB, backend endpoint, or superadmin UI in Phase 1 (the static catalog is the store).
- No change to the recipe schema, export, or brand-kit code.
- No "Improve with AI" per-card action in Phase 1 — the mark is a fixed raster illustration,
  so the text-based AI refine can't meaningfully improve it (it only touches the wordmark).
  Dropped for honesty; revisit if/when image-to-image editing exists.

## 2. Catalog format

`frontend-customer/public/logos/logo_meta.json` — array of entries (owner-authored):

```json
{
  "title": "Minimalist Yoga Meditation Silhouette Logo",
  "filename": "minimalist-yoga-meditation-logo.png",
  "prompt": "A minimalist vector logo of a person sitting in a cross-legged yoga… ",
  "tags": "yoga, meditation, logo, minimalist, zen, wellness, fitness, health, …"
}
```

- `title` — card label.
- `filename` — the PNG under `public/logos/`; image URL is `/logos/<filename>`.
- `prompt` — the generation prompt; seeds "Create your own with AI".
- `tags` — comma-separated; split into an array for **filter chips** and **niche matching**.

This is the exact format the owner already uses; the feature adopts it verbatim. No niche
field is required — niche matching derives from `tags`.

## 3. Niche matching

The tenant's niche comes from `TenantConfig.niche` (exposed to the frontend as
`config.niche`, already the unified `template_niche`/demo niche). Ranking is client-side:
a curated logo whose `tags` contain the tenant niche (case-insensitive word match) ranks
first; the rest follow in catalog order. Filter chips (from the union of all tags) let the
coach narrow further.

## 4. Coach experience — entrance restructure

The studio opens on a new **entrance** for coaches without a saved logo (a coach with a
saved logo lands in the Editor as today, with a "Browse logos" nav back). The current
`ideas` step becomes the **Browse** step hosting:

- **Two doors** at the top:
  - **Ready-made logos (free, the star)** — the niche-matched curated gallery.
  - **Design with AI (paid)** — opens the existing staged `StudioChat`; free tier → the
    existing upgrade/upsell card.
- **Curated gallery** — a responsive grid of cards, each showing the PNG illustration
  (`<img src="/logos/<filename>">`) with tag-derived filter chips. Per-card actions:
  - **Use this** *(free)* — see §5.
  - **Create your own with AI** *(paid)* — see §5; free tier → upsell.
- **Demoted "More auto-generated ideas"** — a collapsible section wrapping today's
  deterministic wall-of-24 + Shuffle (unchanged code, relocated).

## 5. Per-card actions

- **Use this** *(free, any tier).* Fetch `/logos/<filename>` as a blob → upload it via the
  existing `uploadPng` path (so it persists as a normal image mark with a `photo_id` that
  re-derives its URL on read) → set the recipe's mark to that image, keep the coach's brand
  name → drop into the Editor. Fully editable name/tagline/colors/layout; save uses the
  existing export flow (the composed logo + square mark PNGs bake in the illustration).
- **Create your own with AI** *(paid).* Open `StudioChat` with the Describe step
  pre-seeded from the curated logo's `prompt`, so AI generates in the same spirit. Reuses
  `StudioChat` verbatim + a new `seedPrompt` prop. Free tier → the existing upsell.

Paid gating reuses `LogoAiStatus.eligible` and the existing upsell UI (link
`/admin/billing/subscription`).

## 6. Free / paid boundary

- **Curated library = fully free.** Any coach can browse, pick, edit, and save a curated
  logo.
- **AI generation = paid.** Design-with-AI and Create-your-own are gated on
  `LogoAiStatus.eligible`; free tier gets the existing upgrade prompt.

## 7. Phasing

- **Phase 1 (this plan) — coach-facing, files-first, frontend-only.** Read
  `logo_meta.json` directly; entrance restructure (two doors); curated gallery (PNG cards
  + tag filter chips + niche ranking); **Use this** (image-mark logo via the existing
  upload/export path); **Create your own with AI** (seed the chat with `prompt`); free/paid
  gating; demoted wall. No backend changes.
- **Phase 2 (separate plan) — superadmin management.** A superadmin UI to add/edit/reorder
  curated logos (upload PNG + fill `title`/`prompt`/`tags`) that writes back to the
  `public/logos/` catalog (optionally via a DB projection that dumps to these files, if
  live management without a deploy is wanted). The static catalog remains the source of
  truth.

## 8. Testing

**Phase 1 is frontend-only** (vitest + Playwright):
- Catalog loader parses `logo_meta.json`, splits `tags`, ranks by niche.
- Gallery renders PNG cards; filter chips narrow results; empty/loading states.
- Entrance gating: free tier sees upsell on "Create your own" and Door 2; paid proceeds.
- "Use this" builds an image-mark recipe and lands in the Editor; "Create your own"
  pre-seeds the chat with the curated `prompt`.
- e2e: open studio → curated gallery → Use this → Editor → save.

## 9. Risks / open items
- **Illustration aspect ratio.** The PNGs are landscape (1408×768); as a studio "mark"
  (a squarish slot) they letterbox. Acceptable for Phase 1; the coach can adjust layout, or
  a future enhancement crops/pre-fits. Noted in the plan.
- **Image weight.** ~1.2 MB per PNG; fine for a small curated set, but at scale Phase 2
  should generate thumbnails for the gallery grid. Out of Phase 1 scope.
- **"Create your own" style gap.** The AI chat currently outputs recipe/trace-based marks,
  which differ stylistically from these illustrations; the `prompt` gives direction but not
  a like-for-like illustration. A future enhancement could route the prompt to full-image
  generation. Phase 1 seeds the existing chat only.
