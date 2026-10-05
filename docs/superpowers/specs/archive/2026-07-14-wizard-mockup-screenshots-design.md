# Wizard Page-Layout Mockup Screenshots — Design

**Date:** 2026-07-14
**Status:** Design approved, pending plan
**Feature area:** Pre-provision onboarding wizard (`frontend-main`)

## 1. Overview

The "Your pages" step of the signup wizard lets a coach pick between 2 layout variants
for each of 6 pages (home, about, courses, pricing, faq, contact — 12 combinations
total). Today each option renders `MiniPageSketch`: an abstract stack of colored bars,
one per content block, sized/colored by block type. User testing found this unclear —
in particular, `home-spotlight` and `home-story` were reported as "the same mockup." They
aren't literally identical (different block counts), but the only structural difference
is a single block rendered at 7% opacity — invisible at thumbnail size. The abstract
sketch has no ability to show real photos, real text density, or real visual texture, so
even correctly-differentiated layouts read as noise.

This design replaces the wireframe with a **real screenshot of the actual rendered page**
for each of the 12 layout combinations, captured once from a dedicated scratch tenant and
shipped as static images.

### Goals
- Each of the 12 page/layout OptionCards shows a real, recognizable screenshot of what
  that layout actually produces — real demo photos, real text, real spacing.
- Zero new runtime infrastructure: no new API endpoint, no S3, no DB table. Images are
  static files shipped with `frontend-main`.
- Zero risk to real public-facing demo tenants (`/demo/<niche>`) — capture never touches
  them.
- Existing behavior for other steps (navbar style, hero style, the aside "your site is
  assembling" live preview) is unchanged — those stay abstract because they are about
  reflecting the coach's live color/font choice, not page structure, and real screenshots
  can't reflect an in-progress choice without much heavier live-rendering machinery.

### Non-goals
- No live/dynamic screenshot generation. Images are captured offline, once, and re-captured
  manually when demo content or page templates change meaningfully.
- No niche-specific screenshot variants (96 images for 12 layouts × 8 niches). One
  representative capture per layout, using generic showcase content.
- No change to `MiniPageSketch`, `MiniNavbar`, `MiniHero`, or the `LivePreview` aside panel.
- No change to the wizard's actual `page_layouts` answer data model — this only changes
  what's rendered inside the OptionCard.

## 2. Scratch tenant

A new tenant, `schema_name="wizard-mockups"`, `is_demo=True` (protected by the existing
`DemoReadOnlyMiddleware`/read-only conventions the same way other demo tenants are). The
public marketing site's `/demo/<niche>` route resolves by direct slug lookup
(`demo-<niche>`) — it has no browsable listing — so as long as this tenant's slug doesn't
follow that `demo-<niche>` convention, it's simply never reachable by a real visitor; no
extra exclusion logic needed. Seeded once from the existing `demo_general` niche seed data
(generic content suits every layout equally — this isn't meant to look like a yoga studio
or a fitness brand, just a plausible content-rich site).

Its only purpose: being cycled through all 12 `page_layouts` values during capture. It is
never read by any user-facing code path other than the capture script.

## 3. Capture script

`tools/wizard-mockups/capture.mjs` — a Playwright script, run manually via
`make capture-wizard-mockups`. For each of the 12 `(page, layout_id)` pairs from
`wizard_catalog.PAGE_LAYOUTS`:

1. Call a small Django management command (`set_wizard_mockup_layout <page> <layout_id>`)
   that reuses the existing `apps.core.onboarding.compose._build_pages` compiler — the
   same code that turns a wizard `page_layouts` answer into a real `blocks` array during
   actual provisioning — to compute `blocks` for `<page>` at `<layout_id>` (other pages
   keep their current layout), and writes the result into `wizard-mockups`'s
   `TenantConfig.pages[<page>]`. This guarantees the captured screenshot is exactly what a
   real coach's site would render for that choice, not a hand-approximated stand-in.
2. Load `http://wizard-mockups.localhost/<page-path>` (dev) in a headless browser at a
   fixed viewport (1280×900).
3. Screenshot the top portion of the page (hero block + first content block — enough to
   show real structure without trying to compress an entire long page into a thumbnail).
4. Save to `frontend-main/public/wizard-mockups/<layout_id>.png`.

Output is committed to git as static assets — ordinary versioned files, reviewable in a
PR diff like any other image asset.

## 4. Frontend change

`PageLayoutStep`'s `OptionCard` (in `pages-steps.tsx`) renders
`<img src="/wizard-mockups/{option.id}.png" alt="..." />` when a captured asset exists for
that layout id, and falls back to the current `MiniPageSketch` wireframe otherwise. The
fallback means a future 13th layout option (added to the catalog before its screenshot is
captured) degrades gracefully instead of showing a broken image.

## 5. Testing

- Frontend: a test for `PageLayoutStep` confirming it renders the `<img>` for a layout id
  with a known asset, and falls back to `MiniPageSketch` for an unknown one.
- No backend test needed for the capture script itself (it's a manually-run dev tool, not
  part of the request path) — the `set_wizard_mockup_layout` management command gets a
  thin test confirming it writes the expected field.
