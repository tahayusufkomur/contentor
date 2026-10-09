# Look variety: real layouts, not 20 skins of one page

**Status:** Phase 1 (grouping in `/setup`) and Phase 2 (this plan, A to E) built 2026-10-09, local and uncommitted. Open: `make eval-sites` per style (not run), phone-width polish, deploy. What actually shipped, and where it departs from the plan, is under "Built" at the bottom.

## Problem

The 20 site styles are 20 skins of one page:

- **Hero:** 15 of 20 are the same composition, a big headline on the left with a framed photo on the right. Only font, colour and frame differ (polaroid, arch, oval, tape, terminal window): journal, grid, pop, ledger, primer, tavola, encore, trail, maison, atelier, studiofloor, dojo, workshop, terminal, sprout. Five break the pattern: kinetic (full-bleed poster), darkroom (photo first), manuscript (title page), nocturne and sanctum (both centred type over an arched photo, near-twins).
- **Body:** every style uses one global recipe, `families.json` → `recipes.home`: hero · story · benefits · courseShowcase · philosophy · howItWorks · moments · cta. Each family renders with the same grid in all styles: story is photo left and text right, benefits is a 3-item row, howItWorks is 1-2-3 in a row, moments is a 3-box row, cta is a full band.

Phase 1 hides the problem without fixing it. `heroLayout` on each style plus grouping in `look-cards.tsx` means `/setup` leads with one look per hero layout and puts the near-twins behind "More looks". Since only five layouts exist, the four non-split leads are the same for every niche (darkroom, manuscript, kinetic, nocturne). Phase 2 gives each style a structure of its own.

## Goal and acceptance

1. For every niche in `rank_styles`, the first 6 ranked styles span at least 5 different `heroLayout`s, each one a fit for that niche (not filler).
2. No two enabled styles share both a hero layout *and* a home recipe order.
3. Contact-sheet check: render `/design-showcase?style=<id>&page=home&size=short&bare=1` for every style at 1180×885 (the wizard tile) and full page, then view them side by side. You should be able to say what each style's layout is without reading its colours or fonts.
4. `make eval-sites STYLE=<id>` passes for every style touched.

## Workstreams

### A. New hero compositions (largest win)

Re-home 10 of the 15 split heroes. The new hero becomes the style's **first** hero variant, so the default changes. The old split variant stays listed second, so existing tenants' blocks (`<style>.<name>`) still resolve, and `restyle_variant` maps by name and then by index. Update `heroLayout` in the style JSON.

| Layout (`heroLayout`) | Styles | Sketch |
|---|---|---|
| `fullbleed` (new) | trail, studiofloor | Photo covers the hero, headline overlaid bottom-left, scrim |
| `collage` (new) | pop, workshop, sprout | 3–4 photos in a playful overlapping cluster, headline across them |
| `giant` (new) | encore, grid | Headline at viewport scale, photos as a strip or row beneath |
| `cover` (new) | maison, journal | Magazine cover: masthead name on top, one tall photo, coverlines |
| `centered` (new) | dojo | Centred headline with a horizontal photo band below, ensō mark |
| `split` (keep) | ledger, primer, terminal, tavola, atelier | Unchanged; five is enough for one layout |

Also separate **nocturne vs sanctum**: give sanctum a `centered` starfield hero with no arch. The other option is merging them into one style with extra palettes.

Every new hero must take the coach's real photos (`photos` in look cards) and handle 0, 1 and 3+ photos, because collage and giant need several. Check how `fill()` in `look-tile.tsx` hands photos out per section.

### B. Per-style home recipe (cheap, big effect)

Let a style override the page order: `style.recipes?.home ?? manifest.recipes.home`. Readers:
- `backend/apps/core/onboarding/site_composer.py` (≈L493 skeleton pages, ≈L749 the AI prompt's default plan)
- `frontend-customer/src/components/setup-flow/look-tile.tsx` (`page` mode)
- `frontend-customer/src/app/design-showcase/page.tsx`

Suggested orders, so neighbours differ: kinetic leads with courseShowcase; manuscript and journal lead with story; darkroom drops benefits for moments high up; terminal puts howItWorks before courses. `sync_sections.py --check` validates styles, so extend it to reject unknown families in a style recipe.

### C. Body-section structures

Give story, benefits and howItWorks two or three genuinely different structures each, as new variant names in the styles that get them:
- story: photo left/text right (today) · full-width pull-quote with an inset photo · text-only letter
- benefits: 3-up row (today) · numbered vertical list with large numerals · bento/asymmetric grid
- howItWorks: 1-2-3 row (today) · vertical timeline · a single sentence with inline steps

Assign them so any two styles on the same hero layout differ in at least two body sections.

### D. Grouping follows the catalogue

After A, add labels for the new layouts to `HERO_LAYOUTS` in `backend/apps/tenant_config/sections.py`. `test_looks_list_every_style_once_with_its_palettes` already requires every look to have a group and at least 5 groups; raise it to the new count.

### E. Side bug to check first

On `/design-showcase?page=home`, the **moments** section renders as empty grey boxes in most styles. It may only be missing fixture photos, but confirm it isn't empty for real coaches before polishing other sections.

## Order and sizing

1. E (check, under an hour)
2. B (recipe override plus orders, about half a day; no new components)
3. A, two styles per session; contact sheet after each
4. C
5. D (labels and test, trivial)

Hero components need design judgment, so build the first of each new layout directly. Once a layout has a working reference, porting it to a second style is a well-specified batch and can go to agy.

## Contact-sheet script (acceptance check 3)

Use the dev stack and any real tenant host (for example `luna-pilates-studio.localhost`; `demo.localhost` is not a tenant). Run it from `e2e/` so `require` finds Playwright:

```js
const { chromium } = require(process.cwd() + "/node_modules/playwright");
const styles = [/* every style id */];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1180, height: 885 } });
  for (const s of styles) {
    await p.goto(`http://luna-pilates-studio.localhost/design-showcase?style=${s}&page=home&size=short&bare=1`, { waitUntil: "networkidle" });
    await p.screenshot({ path: `${s}-top.png` });
    await p.screenshot({ path: `${s}-full.png`, fullPage: true });
  }
  await b.close();
})();
```

Tile the PNGs into one sheet (PIL) and view all of them, not a sample.

## Built (2026-10-09)

**E.** Not a product bug: the moments boxes are `loading="lazy"` images that have not loaded when a full-page screenshot is taken; real coaches get a photo or the empty-image gradient. The contact-sheet script must scroll the page through before it shoots.

**B.** `style.recipes.home` overrides the manifest order (`sections.recipes(style_id)` for the backend, `styleRecipe()` in `packages/shared/src/sections/types.ts` for the frontends). All 20 styles have their own order, and `test_every_styles_home_order_survives_the_guardrails` keeps them honest: the composer's rhythm rule (no run of three of hero, story, courseShowcase, moments) silently reshuffles an order that breaks it. `sync_sections.py --check` rejects unknown families or variants in a recipe.

**A.** 11 new first hero variants: trail `overlook` and studiofloor `mirror` (fullbleed), pop `cluster`, workshop `pinboard`, sprout `mosaic` (collage), encore `lineup`, grid `plates` (giant), maison and journal `cover`, dojo `hall` and sanctum `observatory` (centered). The old split variant stays second, so stored blocks still resolve. Departures from the plan:
- `fullbleed` is photo plus a solid card (trail: route card; studiofloor: frosted glass panel), not headline-on-scrim: kinetic's `poster` already is headline-on-photo-with-scrim, and the two would have been twins.
- sanctum is `centered` (a row of three moons under a larger zodiac ring), not merged with nocturne.
- The hero family gained optional `image3` and `image4` (labelled "(some layouts)"). `collage.tsx` is the shared cluster geometry. The composer fetches only the slots a layout shows: `sections.unshown_slots`, driven by `HERO_PHOTOS` and `bodyLayouts`.
- `restyle_variant` never maps a non-intro hero onto the target's intro (a new first variant shifts every index).

**C.** An audit of all 20 showed benefits and howItWorks already vary (lists, cards, columns, bento; rows, timelines, a path). Story was the gap: all 20 are photo beside text. So each style now carries `bodyLayouts` (story, benefits, howItWorks) and a test requires any two styles on the same hero layout to differ in at least two. That needed 7 story variants (`letter` or `pull`: tavola chalkboard, primer note, atelier manifesto, workshop notecard, sprout bubble, grid essay, sanctum invocation) and 4 howItWorks variants (primer syllabus, sprout trail, grid sequence as `timeline`; atelier shortlist as `row`), built once in `story-layouts.tsx` and `how-layouts.tsx` and skinned per style. No new benefits structure was needed.

**D.** `HERO_LAYOUTS` has ten labels; the looks test requires at least ten groups, and a test requires five or more distinct layouts among the first six ranked styles for every niche. That passes, but the tail of each ranking is manifest-order filler (most niches name fewer than six styles), so "each one a fit" is only true for the niche's own styles; widening `niches` on styles is the fix and a product call.

**Verified end to end.** Full backend 2418, vitest 544, typecheck on both apps, pre-commit clean, all 20 full pages viewed, no horizontal overflow at 390 or 768. `make eval-sites` ran for two styles. The first run (workshop) exposed a regression of this work: the AI site planner overflowed its output budget (every hero now lists four photo slots), fell back to the recipe and scored 5.2. `_plan_user_turn` now lists only the photo slots a style's default layouts show (letters list none), and the planner succeeded twice on replay. Re-run: workshop/painting 5.8 (the judge's main complaint is photos that do not match "painting": the photo catalog, not layout), sanctum/wellness 7.4, equal to nocturne's 7.4 on the same brief before this work. The 8.5 bar was not met by the pre-change baselines either (maison 7.0, nocturne 7.4), so "passes" is not reachable on this machine today. The eval's broken-image check now ignores images the page does not render (a `display:none` lazy image is never fetched); it had flagged the three phone-hidden collage tiles.

**Open.** `make eval-sites STYLE=<id>` for the other 18 styles (about 7 minutes and Gemini quota each). The wizard tile (`LookTile`) feeds the hero four photo slots now, so a coach with few photos sees repeats. Phone widths: no overflow anywhere, but collage tiles on a phone are a compromise (workshop shows one polaroid). E2E on the full run: 44 passed, 2 flaky (passed on retry), 2 failed (`24-admin-logs` facet chip; `30-custom-components`, a race with the editor's logo-recipe autosave when the demo tenant already carries a curated logo): neither touches sections code, but neither was run against HEAD.
