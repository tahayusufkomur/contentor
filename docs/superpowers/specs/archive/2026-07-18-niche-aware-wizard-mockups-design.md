# Niche-Aware Wizard Mockup Screenshots — Design

**Date:** 2026-07-18
**Status:** Approved design, pre-implementation

## Problem

The signup wizard's theme, hero, and page-layout steps show real screenshots
captured from a single scratch tenant hard-coded to the **yoga** niche
(`seed_wizard_mockup_tenant.py`, `NICHE = "yoga"`). A coach who picks
`belly_dance` on step 1 then chooses layouts while looking at yoga imagery.
Niche is already first-class everywhere else: it drives theme ranking, font
recommendation, and per-niche demo content seeding at provisioning.

## Goal

Every screenshot in the wizard reflects the niche the coach picked on step 1.
Full matrix: all 27 shots (18 page layouts + 3 heroes + 6 themes) captured per
niche.

## Non-Goals

- No runtime/generated screenshots — this stays a manual dev capture tool.
- No per-niche set for `general` (its content module is deliberately sparse —
  no plans, FAQ disabled — and produces empty-state screenshots). `general`
  maps to the yoga set, which is exactly what every coach sees today.
- No S3/CDN hosting — assets remain committed static files.

## Decisions (user-approved)

- **Coverage:** full matrix, every screenshot per niche.
- **Storage:** git-committed static assets, **WebP** instead of PNG
  (~70% smaller; full matrix ≈ 189 files ≈ 25MB vs ≈ 90MB PNG).
- **Pipeline approach:** keep the single scratch tenant, parametrize it by
  niche, loop captures (vs. 8 persistent scratch tenants, or client-side photo
  compositing — both rejected: DB clutter / fake-looking composites).

## Design

### Backend — seed command

`seed_wizard_mockup_tenant` gains `--niche <name>` (default `yoga`), validated
against `demo_seed` `available_niches()`. Nothing else changes: same schema
name, same per-layout/per-look capture domains, so reseeding to a different
niche is just re-running the command (it already tears down and recreates).

### Capture tool (`tools/wizard-mockups/capture.mjs`)

- Wrap the existing 27-shot sequence in a per-niche loop over the 7 real
  niches (`yoga, pilates, fitness, pole_dance, belly_dance, face_yoga,
  makeup` — everything in `demo_seed/data/` except `general`). For each niche:
  shell out to `manage.py seed_wizard_mockup_tenant --niche <n>`, then capture
  the full set into `frontend-main/public/wizard-mockups/<niche>/`.
- **WebP output:** the in-page canvas downscale switches
  `toDataURL("image/png")` → `toDataURL("image/webp", 0.85)`. No new
  dependencies (Chromium supports WebP canvas export).
- `--niche <name>` CLI arg to re-capture a single niche while iterating.
- The broken-media guard (refuses to write when any image/media request
  fails) stays and applies per niche — it is the safety net against a niche
  whose demo photos are missing from MinIO/S3.

### Frontend (`frontend-main/src/app/signup/verify/wizard/`)

- New helper, e.g. `mockupSrc(niche, name)` → `/wizard-mockups/<dir>/<name>.webp`
  where `dir` = the niche if it has a captured set, else `yoga`
  (`general`, unset, and unknown niches all resolve to `yoga`).
- `ThemeStep` and `HeroStep` already receive `niche`; `PageLayoutStep` gets a
  `niche` prop passed from `WizardFlow` (one prop).
- Fallback chain upgraded to two stages: niche file → yoga file → existing
  CSS sketch (`MiniHero` / `MiniPageSketch` / swatches). A newly added niche
  works before its screenshots are captured, and a missing single file never
  shows a broken image.

### Asset layout & migration

```
frontend-main/public/wizard-mockups/
  yoga/         home-spotlight.webp ... theme-slate.webp   (27 files)
  pilates/      ...
  belly_dance/  ...
  ...           (7 niche dirs total)
```

The current 27 flat PNGs are deleted in the same change; the yoga set is
re-captured fresh as `yoga/*.webp`. No references to the flat paths remain
(grep `wizard-mockups/` across the repo as part of implementation).

## Content-completeness audit (done during design)

All 7 non-general niche JSONs have identical full structure: 3 courses,
2 subscription plans, 4 FAQ items, 3 testimonials, hero/about/cta/courses
sections enabled, 5–8 photos + 5 videos each. **No content enrichment
needed.** Remaining verification is visual: eyeball each niche's captured set
once (the capture guard already catches missing media; sparse-content
empty-states are ruled out by the audit).

## Testing

- **Backend:** seed command accepts a valid `--niche`, rejects an unknown one.
- **Frontend:** unit test for the `mockupSrc` mapping (niche dir, general→yoga,
  unknown→yoga) and the two-stage fallback behavior.
- **Visual/e2e:** run the full capture; walk the wizard as a `belly_dance`
  signup in the browser and confirm theme/hero/layout cards show belly-dance
  imagery; confirm existing wizard e2e specs still pass (`make e2e-changed`).

## Risks

- **Capture runtime:** 7 × (reseed + 27 captures) is roughly 30–45 min. This
  is a manual, occasional tool; `--niche` keeps iteration cheap.
- **Repo weight:** ~25MB of WebP committed. Accepted trade-off (user decision)
  for zero infra and offline-safe dev/e2e.
- **Drift:** when a layout/theme/hero is added to `wizard_catalog.py`, the
  capture must be re-run for all 7 niches, not just once. The existing
  fallback chain means a forgotten capture degrades gracefully (yoga file or
  sketch), never a broken image.
