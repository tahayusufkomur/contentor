# Site Styles Wow, Phase 0–1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. One task = one fresh agent (see "Execution protocol").

**Goal:** Ship the system-level fixes from the 2026-10-24 critique to all 21 site styles, and build a yardstick to measure them first:
- a sharper hero;
- one protagonist in the photos;
- a photo treatment per style;
- personal chrome;
- a clean craft floor;
- a phone-first first screen.

**Architecture:** Most fixes land once, in shared code:
- the composer's copy and photo rules (`backend/apps/core/onboarding/site_composer.py`);
- the style manifest, which gains `photoTreatment`, turned into CSS variables by `styleVars` and applied by one global image rule;
- the shared header and footer;
- the kit's money formatter.

Only the phone-first pass (Task 1.7) edits each style's `hero.tsx`, in three batches. A capture tool, realistic showcase fixtures and an upgraded eval come first, so every later task has a before and after.

**Tech Stack:**
- Backend: Django 5.1 + django-tenants (composer, `Tenant.wizard_state`), pytest.
- Frontend: Next.js 14 + Tailwind (`frontend-customer`), vitest.
- Playwright (`e2e/`).
- The shared section manifest (`packages/shared/src/sections`), copied to the backend by `make sections-sync`.

**Spec:** `docs/superpowers/specs/2026-10-24-site-styles-wow-design.md`. Read §5 (decisions) and §6 (rules) before any task. Its §7 is the status board and §9 the log.

## Global Constraints

- **Own photos stay optional (D1).** Nothing waits on, gates on or nags for uploads.
- **Stock photos keep a person in frame, gender and age matched to the audience (S1).** Detail crops (hands, feet, back view) count as a person.
- **One light/dark choice for the site and the admin (S2).** The next-themes key is `theme`. The toggle may move; its behaviour may not.
- **Never invent facts in copy (S3).** Keep `BANNED_PHRASES` and the honesty rules in `PAGE_SYSTEM_PROMPT`.
- **Hero size.** The home hero headline is at most `HOME_HERO_HEADLINE_MAX = 36` characters. Inner pages keep `families.json`'s 70.
- **Craft floor:**
  - contrast 4.5:1 for text, 3:1 for large text (≥ 24px, or ≥ 18.66px bold) and UI;
  - labels ≥ 12px (`0.75rem`);
  - text longer than 24 characters is never uppercased;
  - pull quotes at line-height ≥ 1.12.
- **Motion is CSS-only,** gated by `motion-safe:` or `@media (prefers-reduced-motion: no-preference)`.
- **Loading and feedback conventions** from the root `CLAUDE.md` apply (enforced by `make lint`).
- **Shared checkout.** Peers edit the same tree.
  - Stage only your own files, by path.
  - Never revert or format files you did not change.
  - Run `pre-commit run --files <your files>`, then `git commit --no-verify`.
- **Backend tests from an agent shell:** `docker compose exec -T django pytest <path> -n auto -q`. `make test-app` needs a TTY.
- **After editing `packages/shared/src/sections/**/*.json`:** run `make sections-sync`, then `docker compose restart django` (the manifest is cached).
- **Before any e2e run:** `pgrep -fl 'playwright test'`. Wait if another run is going. Run one heavy job at a time.
- **Capture before and after.** Every frontend task runs `make design-shots` (Task 0.1) before it starts and after it ends.

## Review Focus

1. **"Kind Mornings":** two capitalised words that are not a person's name. The story letter must not be signed "Kind". (Task 1.1, `test_story_signature_is_the_owners_first_name`.)
2. **A coach with no courses and no events.** The hero button, the header button and the sticky bar fall back to Contact. There is never an empty button or a link to the page itself. (Task 1.1, `test_home_hero_button_leads_to_the_offer`; Task 1.4, `test_header_cta_names_the_offer`.)
3. **A niche with few catalog photos.** After excluding peers' photos the pool can run dry. Every slot must still get a photo. (Task 1.3, `test_a_peer_photo_is_used_only_when_nothing_else_fits`.)
4. **A coach who renamed her header button.** Only the untouched legacy default "Get Started" is relabelled. (Task 1.4, `headerCtaLabel` test.)
5. **The editor.** Hiding an empty `meta` or second button must still show its placeholder when `editable` is set (`has()` in `kit.tsx:62` already returns true when editable). (Task 1.7, phone spec runs without `editable`; Step 4 checks the editor by hand once.)

## Calls this plan makes beyond the spec

- **The home hero cap lives in the composer,** as a page-level override in `_writable(family, page_key)`. `families.json` is untouched, so inner pages and the coach's own edits keep 70 characters.
- **The home hero's `meta`, `secondaryLabel` and `secondaryHref` are no longer written** (left empty). They stay in the manifest, so a coach can still add them in the editor.
- **Peer exclusion reads other tenants' `wizard_state.site_plan.used_assets`** (public schema), with a `ponytail:` note. Past about 1000 tenants it should move to a table.
- **The photo treatment is CSS** (filter plus a tint layer, fed by variables from the manifest), not image processing. It is reversible when the look changes. Designed covers (`CoverArt`) are never treated.
- **The legacy header label is mapped at render time** (`headerCtaLabel`): "Get Started" becomes a label for the offer. No data migration. New tenants get the new label from `header_cta()`.
- **Deploy at Gate A (Task 1.8), not per task.** Rendering changes reach existing sites at that deploy. Copy and photo rules apply to newly composed or recomposed pages only.

## Execution protocol

- **Order:**
  1. Phase 0: 0.1 → 0.2 → 0.3.
  2. Phase 1 backend: 1.1 → 1.1b → 1.3.
  3. Phase 1 frontend: 1.2 → 1.4 → 1.5 → 1.6 → 1.7a → 1.7b → 1.7c.
  4. Gate A: 1.8.

  Only one agent runs tests, builds or e2e at a time. Read-only work can overlap.
- **Dispatch.** The main session sends one fresh agent per task, with:
  - this plan's header, Global Constraints and the task;
  - spec §5 and §6;
  - the wiki page named in the task;
  - the time budget, with the instructions "if a check costs more than 15 minutes, write it down as a concern and move on" and "no measurement harnesses beyond the task's own".

  The main session checks progress about every 15 minutes, stops the agent at twice its budget, and finishes from its diff.
- **The agent's report:**
  - files changed;
  - every command run, with its result;
  - before and after `design-shots` folders (frontend tasks);
  - commit sha;
  - concerns.
- **Review.** A fresh reviewer agent checks the diff against the task's Interfaces and tests and against spec §6 (30-minute budget). Only then does the next task start.
- **Bounded mechanical batches may go to agy** (the gemini-executor skill), with this task text as the brief: Task 1.5's contrast and size list, Task 1.6. Claude reviews the result.
- **When a task is done:** set its row in spec §7 to `done (<date>, <sha>)`, and append one line to spec §9 saying what changed and what was learned.

## File Structure

| File | Responsibility | Tasks |
|---|---|---|
| `e2e/scripts/design-shots.mjs` (new) | Capture styles, tenants and references (fold + full, desktop + phone) and write `index.html` | 0.1, 0.2 |
| `e2e/fixtures/design-refs.json` (new) | The reference sites to capture | 0.1 |
| `Makefile` | `design-shots` target | 0.1 |
| `frontend-customer/src/components/sections/fixtures.ts` | `size: "real"` and `FixtureSet` content (yoga, business, family) | 0.2 |
| `frontend-customer/src/app/design-showcase/page.tsx` | `fixture=` and `size=real` params | 0.2 |
| `e2e/specs/91-site-eval.spec.ts` | New axes, award-site anchor | 0.3 |
| `backend/apps/core/onboarding/site_composer.py` | Hero and copy rules; home list limits; protagonist briefs; peer exclusion | 1.1, 1.1b, 1.3 |
| `packages/shared/src/sections/types.ts`, `styles/*.json` | `photoTreatment` | 1.2 |
| `frontend-customer/src/lib/site-styles.ts` | `styleVars` emits the photo variables | 1.2 |
| `frontend-customer/src/styles/globals.css` | One rule applies them | 1.2 |
| `backend/apps/tenant_config/defaults.py` | `header_cta(links)` | 1.4 |
| `backend/apps/tenant_config/interview_milestones.py:243`, `backend/apps/core/onboarding/compose.py:26` | Use `header_cta` | 1.4 |
| `frontend-customer/src/lib/header-cta.ts` (new) | `headerCtaLabel` | 1.4 |
| `frontend-customer/src/lib/sticky-cta.ts` (new), `components/shared/sticky-cta.tsx` (new) | The phone's sticky call to action | 1.4 |
| `frontend-customer/src/components/shared/public-header.tsx`, `public-footer.tsx`, `app/(public)/layout.tsx` | Personal chrome | 1.4 |
| `frontend-customer/src/components/sections/<style>/*` | Craft fixes, label removal, phone-first heroes | 1.5, 1.6, 1.7 |
| `e2e/specs/92-phone-first.spec.ts` (new), `e2e/impact-map.json` | The phone-first contract | 1.7 |
| `packages/shared/src/sections/families.json`, `frontend-customer/src/components/blocks/block-renderer.tsx` | `events.limit`, and `limitSlice` where a block's data is picked | 1.1b |

---

### Task 0.1: Capture tool (`make design-shots`)

Budget: 45 min. Wiki: `docs/wiki/other-e2e.md`.

**Files:**
- Create: `e2e/scripts/design-shots.mjs`
- Create: `e2e/fixtures/design-refs.json`
- Modify: `Makefile` (new target; add `design-shots` to `.PHONY` and to the e2e help regex at line 32)

**Interfaces:**
- Produces: `make design-shots [STYLES=a,b] [TENANTS=slug,slug] [REFS=1] [FIXTURE=<set>] [LABEL=<text>]`. It writes `e2e/eval-shots/design/<YYYYMMDD-HHMM>[-<LABEL>]/` (git-ignored by `e2e/.gitignore`) containing:
  - `styles/<id>-{d,m}-{fold,full}.jpg`;
  - `tenants/<slug>-{d,m}-{fold,full}.jpg`;
  - `refs/<id>-{d,m}-fold.jpg`;
  - `index.html`.

  It prints that folder's path as its last line.
- Style URL: `http://demo-yoga.localhost/design-showcase?style=<id>&page=home&bare=1`. With `FIXTURE` set, append `&size=real&fixture=<set>`.
- Default styles: every manifest in `packages/shared/src/sections/styles/*.json` with `"enabled": true`. Tenants and references are captured only when asked.
- Viewports:
  - `d`: 1440×900, `deviceScaleFactor` 1;
  - `m`: 390×844, `isMobile` and `hasTouch`;
  - `colorScheme` light for both.

- [ ] **Step 1: Port the prototype.**
  - Start from `e2e/eval-shots/design/baseline-2026-10-24/tools/capture.cjs` and `capture-refs.cjs` (the scripts that made the baseline) and port them to ESM in `design-shots.mjs`.
  - Keep the fold sequence exactly: fresh page, `networkidle`, `document.fonts.ready`, 2500 ms, viewport shot.
  - Keep the full-page sequence exactly: add style `html,body{scroll-behavior:auto!important}`; scroll in 0.8-viewport steps at 200 ms; return to top; `networkidle`; 1200 ms; full-page shot.
  - Shooting the fold after scrolling, or without the wait, captures half-animated frames.
  - References get 7000 ms before their fold shot (their loaders).
- [ ] **Step 2: Write `e2e/fixtures/design-refs.json`** as a `[{ "id", "url", "label" }]` list. Use the 8 working references from spec §3 by these ids:
  - `kasiasiwosz`, `yoga-by-nina`, `essor-fitness`, `antoine-lours`;
  - `chef-orchestre`, `podcast-coach`, `css-for-js`, `animations-dev`.

  MasterClass sits behind a bot check and thomevansfitness.com is gone. Reference captures stay in the git-ignored folder and are never committed.
- [ ] **Step 3: `index.html`.** One row per id: desktop fold (480px wide), phone fold (180px wide), links to both full pages. References go in a second table. No external assets.
- [ ] **Step 4: Run it.** `make design-shots STYLES=journal,kinetic LABEL=smoke`. Expected: 8 jpgs and an `index.html`. Open the index in the browser pane: both rows render with no blank or half-faded fold.
- [ ] **Step 5: Commit.**

```bash
git add e2e/scripts/design-shots.mjs e2e/fixtures/design-refs.json Makefile
git commit --no-verify -m "feat(e2e): make design-shots captures every style's first screen and full page"
```

### Task 0.2: Realistic showcase fixtures

Budget: 60 min. Wiki: `docs/wiki/tenant-config-site-builder-src.md`.

**Files:**
- Modify: `frontend-customer/src/components/sections/fixtures.ts`
- Modify: `frontend-customer/src/app/design-showcase/page.tsx`
- Test: `frontend-customer/src/components/sections/__tests__/fixtures.test.ts` (create)

**Interfaces:**
- Produces:
  - `export type FixtureSet = "yoga" | "business" | "family"`
  - `export const FIXTURE_SETS: FixtureSet[]`
  - `fixtureBlock(family: FamilyId, key: string, size: "long" | "short" | "real", set: FixtureSet = "yoga")`
  - `fixtureData(family: FamilyId, size: "long" | "short" | "real", set: FixtureSet = "yoga")`
  - The showcase reads `size=real` and `fixture=<set>`.
- `long` and `short` are unchanged: the stress test and the minimum.
- `real` reads like a composed site under Task 1.1's rules:
  - the home hero headline is at most 36 characters;
  - the hero `meta`, `secondaryLabel` and `secondaryHref` are "";
  - kickers only on the hero and at most two other sections;
  - 3–4 benefits, 3–4 moments, 3 steps, 3 courses.
- `real` photos are Pix4Less preview URLs (`https://pix4less.com/media/previews/<id>/web.webp`, the same form as `FIXTURE_PHOTOS`):
  - Pick them with the dev catalog client, e.g. `docker compose exec -T django python manage.py shell -c "from apps.core.curated_images import client; print([(i.asset_id, i.title) for i in client.search('business coach woman', orientation='portrait').results[:12]])"`. The dev key is unlimited.
  - S1 applies.
  - One recognisable coach portrait per page (hero on home). Every other person slot shows students or detail crops (spec R2).

- [ ] **Step 1: Write the failing test.**

```ts
import { FAMILY_IDS } from "@shared/sections/types";
import { FIXTURE_SETS, fixtureBlock } from "../fixtures";

describe("real fixture sets", () => {
  it.each(FIXTURE_SETS)("%s fills every family", (set) => {
    for (const family of FAMILY_IDS)
      expect(fixtureBlock(family, "x.y", "real", set)).toBeTruthy();
  });
  it.each(FIXTURE_SETS)("%s home hero follows the composer's rules", (set) => {
    const hero = fixtureBlock("hero", "x.y", "real", set);
    expect(String(hero.headline).length).toBeLessThanOrEqual(36);
    expect(hero.meta ?? "").toBe("");
    expect(hero.secondaryLabel ?? "").toBe("");
  });
});
```

- [ ] **Step 2: Run it.** `cd frontend-customer && npx vitest run src/components/sections/__tests__/fixtures.test.ts`. Expected: FAIL (`FIXTURE_SETS` is not exported).
- [ ] **Step 3: Implement** `REAL: Record<FixtureSet, Partial<Record<FamilyId, Block>>>` plus the two signatures, and the showcase params. Business and family get their own courses, events and plans arrays, three each.
- [ ] **Step 4: Run the test (PASS).** Then `make design-shots STYLES=velvet,journal FIXTURE=business LABEL=fixture-check`. Both pages show business content and photos.
- [ ] **Step 5: Commit** `fixtures.ts`, `page.tsx` and the test.

### Task 0.3: The eval measures distinctiveness and anchors on award sites

Budget: 45 min plus one eval run (about 5 min, agy quota). Wiki: `docs/wiki/other-e2e-specs.md`.

**Files:**
- Modify: `e2e/specs/91-site-eval.spec.ts` (`CRITERIA` at :58–71, the anchor line at :176)

**Interfaces:**
- `CRITERIA` keys, in this order:
  - `first_impression` (text unchanged)
  - `hierarchy` (unchanged)
  - `rhythm` (replaces `rhythm_whitespace`)
  - `image_quality_consistency` (unchanged)
  - `copy_specificity` (unchanged)
  - `mobile` (unchanged)
  - `distinctiveness` (new)
  - `protagonist` (new)
- `PASS` is unchanged (average 8.5, floor 7.5). The HTML report already iterates `CRITERIA`, so the new axes show up on their own. Check that they do.

- [ ] **Step 1: Set the texts exactly:**
  - `rhythm`: "Pacing with intent: quiet stretches and one or two peaks (a scale break, a full-bleed moment). Every section at the same volume is a 5; cramped blocks or dead stretches lower it."
  - `distinctiveness`: "Would a visitor remember this site tomorrow? Is there one moment only this coach's site has? If another coach in the same niche could use the page unchanged, score 5 or lower."
  - `protagonist`: "Does the site read as one real person's? Photos of the coach show one consistent person (or her own photos), not a different model in every slot; any proof is specific and real."
  - The anchor line (`:176`) becomes: "unchanged; 10 matches award-recognised coach and creator sites (an Awwwards Honorable Mention). The best Framer, Webflow or Squarespace templates are a 7."
- [ ] **Step 2: Run** `make eval-sites STYLE=journal BRIEFS=yoga`. Expected: a report with 8 axes. `distinctiveness` should come out at 6 or below on today's journal; that proves the axis discriminates. If it scores 8 or more, tighten the wording once and re-run once.
- [ ] **Step 3: Record** the scores in spec §9 as the new baseline. Commit the spec file.

### Task 1.1: Hero and copy rules in the composer

Budget: 90 min. Wiki: `docs/wiki/onboarding-wizard-site-ai-backend-apps.md`.

**Files:**
- Modify: `backend/apps/core/onboarding/site_composer.py`
- Test: `backend/apps/core/tests/test_site_composer.py` (fixtures `styled`, `FakeAI`, `catalog` are already in this file)

**Interfaces:**
- Produces:
  - `HOME_HERO_HEADLINE_MAX = 36`.
  - `HOME_LIST_MAX = {"benefits": ("items", 4), "moments": ("photos", 4), "howItWorks": ("steps", 3)}`.
  - `_writable(family, page_key=None) -> dict`:
    - for `("hero", "home")`: headline `max` 36, and `meta`, `secondaryLabel`, `secondaryHref` dropped;
    - for home lists: `max` from `HOME_LIST_MAX`;
    - otherwise unchanged.
  - Every caller passes `page_key`: `_page_user_turn`, `_repair_user_turn`, `_normalize`, `_fill_page`, `_problems`. `_build_output_models` keeps `page_key=None`.
  - `_problems(family, fields, *, strict=True, page_key=None)`.
  - `_ONE_AT_A_TIME = re.compile(r",\s+one\s+(?:\w+\s+){0,2}at\s+a\s+time\b", re.IGNORECASE)`. `_banned` returns `"…, one … at a time"` on a match.
  - `MAX_KICKERS_PER_PAGE = 2`.
  - `_limit_kickers(entries: list[dict], fields: list[dict]) -> None`. It blanks `kicker` on non-hero sections past the first two that have one, in page order.
  - `_coach_first_name(tenant) -> str`. It is the first `User.objects.filter(role="owner").order_by("id")` row's `first_name`, inside `tenant_context`, or "" when missing.
  - `_pin_home_buttons(fields: dict, ctx: dict) -> None`. On the home `hero` and home `cta`: when `ctaHref != ctx["primary"]` and `ctx["primary"]` is `/courses` or `/events`, set `ctaHref = ctx["primary"]` and `ctaLabel = ctx["primaryLabel"]`.
- Called in `compose_page` and `skeleton_pages`, after `_fill_page` / fallbacks:
  - `_limit_kickers`, then `_pin_home_buttons` (home only);
  - the story `signature` becomes `_coach_first_name(tenant)`, and the key is removed when that is "". This replaces the `name_like` pop at `:1646`.
- `_HEADLINES` values are each at most 36 characters. Rewrite the longer ones in the same voice.
- `fallback_fields("hero", "home", …)` returns no `secondaryLabel` or `secondaryHref`. Fallback lists respect `HOME_LIST_MAX` on home.
- List limits for courses and events on home are Task 1.1b.
- Exact `PAGE_SYSTEM_PROMPT` edits:
  - Replace the line starting "Headlines are short and punchy, ideally 8 words or fewer" with: "Headlines are short and say something. The home hero headline is 2 to 5 words (36 characters at most), or the coach's name: a statement a visitor remembers, not a sentence that explains. Never the pattern \"X, one Y at a time\". \"Welcome\", \"About me\" and \"Our courses\" are labels, not headlines. Kickers are 1-4 words."
  - Add after it: "Leave a kicker (the small label above a heading) empty unless it adds a fact the heading does not: a place, a time, a number, a step. At most two per page besides the hero."
  - Add to the home line under Pages: "The hero's and the closing section's buttons lead to the coach's main offer (courses, else classes), never to About."

- [ ] **Step 1: Write the failing tests:**

```python
@pytest.mark.django_db
def test_home_hero_headline_is_capped_and_repaired(styled, monkeypatch, catalog):
    def long(s):
        s[0]["headline"] = "Strength that feels like ease every single day"  # 48
        return s
    def short(s):
        for x in s:
            if x["index"] == 0:
                x["headline"] = "Strong, calm, unhurried"
        return s
    fake = FakeAI(plan=core_ai.AiError("no plan"), page_overrides=[long, short])
    monkeypatch.setattr(sc.core_ai, "structured", fake)
    blocks = sc.compose_page(styled, "home")
    assert blocks[0]["headline"] == "Strong, calm, unhurried"
    repair = [u for label, u in fake.calls if label == "contentor:compose-page"][1]
    assert "max 36" in repair

@pytest.mark.django_db
def test_home_hero_has_no_meta_or_second_button(styled, monkeypatch, catalog):
    monkeypatch.setattr(sc.core_ai, "structured", FakeAI(plan=core_ai.AiError("no plan")))
    hero = sc.compose_page(styled, "home")[0]
    assert not hero.get("meta") and not hero.get("secondaryLabel") and not hero.get("secondaryHref")

def test_inner_hero_keeps_seventy_characters():
    assert sc._writable("hero", "about")["headline"]["max"] == 70
    assert sc._writable("hero", "home")["headline"]["max"] == 36

def test_one_at_a_time_cadence_is_banned():
    assert sc._banned("Glow from within, one calm minute at a time")
    assert not sc._banned("Take it one step at a time")  # no comma clause

@pytest.mark.django_db
def test_kickers_capped_at_two_besides_the_hero(styled, monkeypatch, catalog):
    def kick(s):
        for x in s:
            x["kicker"] = "Label"
        return s
    monkeypatch.setattr(sc.core_ai, "structured", FakeAI(plan=core_ai.AiError("no plan"), page_overrides=[kick]))
    blocks = sc.compose_page(styled, "home")
    assert blocks[0]["kicker"]
    assert sum(1 for b in blocks[1:] if b.get("kicker")) <= sc.MAX_KICKERS_PER_PAGE

@pytest.mark.django_db
def test_home_hero_button_leads_to_the_offer(styled, monkeypatch, catalog):
    def about(s):
        s[0]["ctaHref"], s[0]["ctaLabel"] = "/about", "Meet us"
        return s
    monkeypatch.setattr(sc.core_ai, "structured", FakeAI(plan=core_ai.AiError("no plan"), page_overrides=[about]))
    hero = sc.compose_page(styled, "home")[0]
    assert hero["ctaHref"] in ("/courses", "/events") and hero["ctaLabel"] != "Meet us"

@pytest.mark.django_db
def test_story_signature_is_the_owners_first_name(styled, monkeypatch, catalog):
    monkeypatch.setattr(sc.core_ai, "structured", FakeAI(plan=core_ai.AiError("no plan")))
    monkeypatch.setattr(sc, "_coach_first_name", lambda tenant: "")
    assert all("signature" not in b for b in sc.compose_page(styled, "about"))
    monkeypatch.setattr(sc, "_coach_first_name", lambda tenant: "Maya")
    stories = [b for b in sc.compose_page(styled, "about") if b["type"] == "section.story"]
    assert stories and all(b["signature"] == "Maya" for b in stories)

def test_fallback_headlines_fit_the_home_cap():
    assert all(len(h) <= sc.HOME_HERO_HEADLINE_MAX for h in sc._HEADLINES.values())
```

  Also change `test_repair_fixes_failing_fields`: its `"max 70"` assertion becomes `"max 36"`, since it repairs the home hero.
- [ ] **Step 2: Run** `docker compose exec -T django pytest apps/core/tests/test_site_composer.py -n auto -q`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the Interfaces above.
- [ ] **Step 4: Run the file (all PASS),** then `make test-changed`.
- [ ] **Step 5: Commit** `site_composer.py` and the test file.

### Task 1.1b: At most three courses and three events on home

Budget: 45 min. Wiki: `docs/wiki/tenant-config-site-builder-src.md`. Runs after 1.1 (same composer file).

Today 20 of 21 styles honour `courseShowcase.limit` (for example `journal/courses.tsx:114`). No style limits events: a coach with nine classes gets nine rows on home.

**Files:**
- Modify: `packages/shared/src/sections/families.json`. Add to `events.fields`: `"limit": { "type": "select", "options": ["3", "6", "all"], "default": "all", "label": "How many" }`. The default `"all"` leaves existing blocks unchanged. Then run `make sections-sync` and restart django.
- Modify: `frontend-customer/src/components/blocks/block-renderer.tsx:24`, where the block's data slice is picked.
- Modify: `backend/apps/core/onboarding/site_composer.py`: `_cap_home_lists`.
- Test: `frontend-customer/src/components/blocks/__tests__/block-renderer.test.tsx` (create, or add to the existing tests there); `backend/apps/core/tests/test_site_composer.py`.

**Interfaces:**
- `limitSlice(block: Block, slice: unknown): unknown`, exported from `block-renderer.tsx`:
  - for `section.events` with `limit` of `"3"` or `"6"` and an array slice: the first N items;
  - otherwise the slice unchanged.
- `_cap_home_lists(entries, fields) -> None`. On home it sets `limit = "3"` on `courseShowcase` and `events`. It is called next to `_limit_kickers`. A select field is never AI-written (`_writable` skips selects), so this is the only writer.

- [ ] **Step 1: Write the failing tests:**

```ts
import { limitSlice } from "../block-renderer";

it("caps events to the block's limit", () => {
  const events = Array.from({ length: 9 }, (_, i) => ({ id: i }));
  expect((limitSlice({ type: "section.events", limit: "3" } as never, events) as unknown[]).length).toBe(3);
  expect((limitSlice({ type: "section.events", limit: "all" } as never, events) as unknown[]).length).toBe(9);
  expect(limitSlice({ type: "section.hero" } as never, events)).toBe(events);
});
```

```python
@pytest.mark.django_db
def test_home_lists_are_capped_at_three(styled, monkeypatch, catalog):
    monkeypatch.setattr(sc.core_ai, "structured", FakeAI(plan=core_ai.AiError("no plan")))
    blocks = sc.compose_page(styled, "home")
    for b in blocks:
        if b["type"] in ("section.courseShowcase", "section.events"):
            assert b["limit"] == "3"
```

  If the home recipe has no events block, add one to the plan the test composes; the guardrails allow events on home.
- [ ] **Step 2: Run both. Expected: FAIL.**
- [ ] **Step 3: Implement.** Then `make sections-sync`, restart django, `make lint`.
- [ ] **Step 4: Both PASS.** `make test-changed`.
- [ ] **Step 5: Commit** the manifest (both copies), `block-renderer.tsx`, `site_composer.py` and the tests.

### Task 1.3: One protagonist, and no faces shared with a peer

Budget: 90 min. Wiki: `docs/wiki/onboarding-wizard-site-ai-backend-apps.md`. Runs after 1.1b (same files).

**Files:**
- Modify: `backend/apps/core/onboarding/site_composer.py`:
  - `PLAN_SYSTEM_PROMPT` photo briefs (`:783-792`);
  - `_GENERIC_SUBJECTS`;
  - `_find_photo`;
  - `_attach_images`.
- Test: `backend/apps/core/tests/test_site_composer.py`

**Interfaces:**
- **Prompt.** In `PLAN_SYSTEM_PROMPT`, replace "Vary subjects, framing and moments across the site so no two photos look alike." with: "One person stands for the coach. Brief a recognisable portrait of the coach for at most one slot per page (hero.image on home, story.image on other pages), and describe the same person every time: same gender, age range, hair and clothing colour. Every other slot shows either students (different people are expected there) or a close detail of practice: hands, feet, a back view, no recognisable face. Vary framing and moments across the site."
- **Generic briefs.** `_GENERIC_SUBJECTS`:
  - `("story", "image2")` → `"instructor's hands demonstrating, close-up"`;
  - `("contact", "image")` → `"hands during practice, close-up"`;
  - the others are unchanged.
- **`_peer_assets(tenant, niche: str) -> frozenset[str]`:**
  - It returns the asset ids in `wizard_state["site_plan"]["used_assets"]` of every *other* `Tenant` whose `wizard_state["answers"]["niche"]` (else `template_niche`) equals `niche`.
  - Ids starting with `own:` are skipped.
  - Comment: `# ponytail: scans every tenant's wizard_state; move to a used-asset table past ~1000 tenants.`
- **`_find_photo(queries, aspect, used, ctx, pools=None, wanted=None, own=False, avoid=frozenset())`:**
  - Both catalog stages (the pool, then the brief queries) first try with `taken | avoid` excluded, then with `taken` alone.
  - The own-photo branch and the final "repeat a pool photo" fallback are unchanged.
- **`_attach_images`** computes `avoid = _peer_assets(tenant, ctx["niche"])` once per page and passes it on.

- [ ] **Step 1: Write the failing tests:**

```python
def test_plan_prompt_names_one_protagonist():
    assert "no two photos look alike" not in sc.PLAN_SYSTEM_PROMPT
    assert "One person stands for the coach" in sc.PLAN_SYSTEM_PROMPT

@pytest.mark.django_db
def test_peer_assets_reads_same_niche_tenants_only(styled):
    from apps.core.models import Tenant
    def ws(niche, ids):
        return {"answers": {"niche": niche}, "site_plan": {"used_assets": {"home": ids}}}
    Tenant.objects.bulk_create([  # bulk_create skips save(): no schema is created
        Tenant(schema_name="peer_same", name="Peer", wizard_state=ws("yoga", ["a1", "own:x"])),
        Tenant(schema_name="peer_other", name="Other", wizard_state=ws("cooking", ["b1"])),
    ])
    assert sc._peer_assets(styled, "yoga") == frozenset({"a1"})

@pytest.mark.django_db
def test_a_peer_photo_is_used_only_when_nothing_else_fits(styled, monkeypatch, catalog):
    monkeypatch.setattr(sc.core_ai, "structured", FakeAI(plan=core_ai.AiError("no plan")))
    pool = [i.asset_id for i in catalog.images]  # adapt to the fixture's shape
    monkeypatch.setattr(sc, "_peer_assets", lambda tenant, niche: frozenset(pool[:5]))
    assert not set(_photo_ids(sc.compose_page(styled, "home"))) & set(pool[:5])
    monkeypatch.setattr(sc, "_peer_assets", lambda tenant, niche: frozenset(pool))
    assert all(i for i in _photo_ids(sc.compose_page(styled, "about")))  # still filled
```

  Read the `catalog` fixture (`test_site_composer.py:223`) and match `pool` to its real shape. If `bulk_create` needs more required `Tenant` fields, add them; never `save()` a test tenant.
- [ ] **Step 2: Run the file.** Expected: the 3 tests FAIL.
- [ ] **Step 3: Implement** the Interfaces above.
- [ ] **Step 4: Run the file (all PASS),** then `make test-changed`.
- [ ] **Step 5: Commit.**

### Task 1.2: A photo treatment per style

Budget: 60 min. Wiki: `docs/wiki/tenant-config-site-builder-src.md`.

**Files:**
- Modify: `packages/shared/src/sections/types.ts` (add `photoTreatment: PhotoTreatment` to `SiteStyle`, and export the type)
- Modify: all 21 `packages/shared/src/sections/styles/<id>.json`
- Modify: `frontend-customer/src/lib/site-styles.ts` (`styleVars`, `:191`)
- Modify: `frontend-customer/src/styles/globals.css` (the image block at `:92`)
- Modify: drop the per-style photo filters this replaces:
  - kinetic's `imgClassName="grayscale contrast-[1.15]…"` in `hero.tsx`, `story.tsx`, `courses.tsx`, `benefits.tsx`, `contact.tsx`, `cta.tsx`, `how-it-works.tsx`, `moments.tsx`, `philosophy.tsx`;
  - the grayscale rules in `dojo/dojo.css` (`:79+`) and `grid/grid.css`;
  - studiofloor's purple wash over hero photos (`studiofloor/hero.tsx`);
  - keep encore's halftone (a texture, not a grade).
- Test: `frontend-customer/src/components/sections/__tests__/site-styles.test.ts`

**Interfaces:**
- `export type PhotoTreatment = "none" | "mono" | "soft" | "tint" | "vivid"`.
- `styleVars(style)` adds four variables:

  | Treatment | `photo-filter` | `photo-tint` | `photo-tint-blend` | `photo-tint-opacity` |
  |---|---|---|---|---|
  | `none` | `none` | `transparent` | `normal` | `0` |
  | `mono` | `grayscale(1) contrast(1.08)` | `transparent` | `normal` | `0` |
  | `soft` | `saturate(0.82) contrast(0.96) sepia(0.06)` | `transparent` | `normal` | `0` |
  | `tint` | `grayscale(0.35) contrast(1.02)` | `var(--primary)` | `color` | `0.28` |
  | `vivid` | `saturate(1.12) contrast(1.05)` | `transparent` | `normal` | `0` |

- `globals.css`:
  - `img[data-site-img] { filter: var(--photo-filter, none); }`
  - `[data-site-img-frame]:has(> img[data-site-img])::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: var(--photo-tint, transparent); mix-blend-mode: var(--photo-tint-blend, normal); opacity: var(--photo-tint-opacity, 0); }`
  - `CoverArt` frames have no `img[data-site-img]` child, so designed covers are never touched. Own photos are treated (spec O2).
- Assignment (Gate A reviews it):
  - `mono`: kinetic, grid, dojo, darkroom, ledger;
  - `tint`: velvet, nocturne, sanctum, studiofloor, terminal;
  - `vivid`: pop, sprout, encore;
  - `soft`: journal, atelier, tavola, workshop, manuscript, maison, trail, primer.

- [ ] **Step 1: Write the failing tests** in `site-styles.test.ts`:

```ts
it("every enabled style declares a photo treatment", () => {
  for (const s of Object.values(SITE_STYLES))
    expect(["none", "mono", "soft", "tint", "vivid"]).toContain(s.photoTreatment);
});
it("mono greys photos without a tint", () => {
  const v = styleVars(SITE_STYLES.kinetic);
  expect(v["photo-filter"]).toBe("grayscale(1) contrast(1.08)");
  expect(v["photo-tint-opacity"]).toBe("0");
});
it("tint washes photos in the palette's primary", () => {
  const v = styleVars(SITE_STYLES.velvet);
  expect(v["photo-tint"]).toBe("var(--primary)");
  expect(v["photo-tint-blend"]).toBe("color");
});
```

- [ ] **Step 2: Run** `cd frontend-customer && npx vitest run src/components/sections/__tests__/site-styles.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Then run `make sections-sync` and `docker compose restart django`.
- [ ] **Step 4: Verify.**
  - vitest PASSES and `make lint` is clean.
  - `make design-shots LABEL=after-1-2` beside the baseline: every style's photos now share one grade.
  - Kinetic's courses still lift on hover.
- [ ] **Step 5: Commit** the types, 21 manifests, backend manifest copy, `site-styles.ts`, `globals.css` and the per-style removals.

### Task 1.4: Personal chrome and a sticky call to action on phones

Budget: 90 min. Wiki: `docs/wiki/other-frontend-customer-public.md`.

**Files:**
- Modify: `backend/apps/tenant_config/defaults.py` (add `header_cta`)
- Modify: `backend/apps/tenant_config/interview_milestones.py:243`, `backend/apps/core/onboarding/compose.py:26` (use `header_cta`)
- Create: `frontend-customer/src/lib/header-cta.ts`, `frontend-customer/src/lib/sticky-cta.ts`, `frontend-customer/src/components/shared/sticky-cta.tsx`
- Modify: `frontend-customer/src/components/shared/public-header.tsx`, `public-footer.tsx`, `frontend-customer/src/app/(public)/layout.tsx`
- Test:
  - `backend/apps/tenant_config/tests/test_defaults.py` (create the file if absent);
  - `frontend-customer/src/lib/__tests__/header-cta.test.ts`;
  - `frontend-customer/src/lib/__tests__/sticky-cta.test.ts`.

**Interfaces:**
- `header_cta(links: Iterable[str]) -> dict` returns:
  - `{"text": "Start a course", "href": "/courses"}` when `/courses` is in links;
  - else `{"text": "Book a class", "href": "/events"}` when `/events` is in links;
  - else `{"text": "Get in touch", "href": "/contact"}`.
- `HEADER_CTA_BY_HREF` (frontend): `{"/courses": "Start a course", "/events": "Book a class", "/calendar": "Book a class", "/plans": "Join", "/contact": "Get in touch"}`.
- `headerCtaLabel(cta: { text: string; href: string }): string`:
  - text exactly `"Get Started"` → `HEADER_CTA_BY_HREF[cta.href] ?? cta.text`;
  - anything else → `cta.text`.
- `stickyCtaVisible({ scrollY, viewportHeight, footerInView }: { scrollY: number; viewportHeight: number; footerInView: boolean }): boolean`. It returns `scrollY > viewportHeight * 0.9 && !footerInView`.
- Header changes:
  - the CTA shows `headerCtaLabel(cta)`;
  - `SocialLinks` and `ThemeToggle` leave the header bar and the mobile menu;
  - "Sign In" stays a quiet ghost text link.
- Footer changes:
  - render `ThemeToggle` when `config.dark_mode_enabled !== false`. It is the same component, so the shared `theme` key holds (S2);
  - `ContentorBadge` gets a muted, smaller `className`.
- `StickyCta`:
  - mounted in `(public)/layout.tsx`;
  - `md:hidden`, fixed to the bottom, with `padding-bottom: env(safe-area-inset-bottom)`;
  - label and href are the header CTA's;
  - nothing renders when there is no CTA;
  - the footer is observed with `IntersectionObserver`;
  - motion `motion-safe:` only.

- [ ] **Step 1: Write the failing tests:**

```python
from apps.tenant_config.defaults import header_cta

def test_header_cta_names_the_offer():
    assert header_cta(["/courses", "/events"]) == {"text": "Start a course", "href": "/courses"}
    assert header_cta(["/events", "/about"]) == {"text": "Book a class", "href": "/events"}
    assert header_cta(["/about"]) == {"text": "Get in touch", "href": "/contact"}
```

```ts
import { headerCtaLabel } from "../header-cta";
import { stickyCtaVisible } from "../sticky-cta";

it("relabels only the untouched legacy default", () => {
  expect(headerCtaLabel({ text: "Get Started", href: "/courses" })).toBe("Start a course");
  expect(headerCtaLabel({ text: "Book your spot", href: "/events" })).toBe("Book your spot");
});
it("shows the sticky bar after the first screen, never over the footer", () => {
  expect(stickyCtaVisible({ scrollY: 0, viewportHeight: 844, footerInView: false })).toBe(false);
  expect(stickyCtaVisible({ scrollY: 900, viewportHeight: 844, footerInView: false })).toBe(true);
  expect(stickyCtaVisible({ scrollY: 5000, viewportHeight: 844, footerInView: true })).toBe(false);
});
```

- [ ] **Step 2: Run both. Expected: FAIL.**
  - `docker compose exec -T django pytest apps/tenant_config/tests/test_defaults.py -q`
  - `cd frontend-customer && npx vitest run src/lib/__tests__/header-cta.test.ts src/lib/__tests__/sticky-cta.test.ts`
- [ ] **Step 3: Implement.** Then grep `e2e/specs` for header selectors you moved (the theme toggle, the Instagram link, "Get Started") and update those specs.
- [ ] **Step 4: Verify.**
  - Both test runs PASS and `make lint` is clean.
  - `make e2e-changed` passes. Follow its plan; the header is shared runtime, so it may plan many specs.
  - `make design-shots TENANTS=jojo-yoga,maralindqvist LABEL=after-1-4`: the header shows the name, one offer button and a quiet "Sign In". The footer holds the toggle. On the phone, the sticky bar appears after the hero.
- [ ] **Step 5: Commit.**

### Task 1.5: Craft floor (detector fixes and one money formatter)

Budget: 90 min. Wiki: `docs/wiki/tenant-config-site-builder-src.md`. Bounded and mechanical; agy may execute it with this text as the brief.

**Files** (each line is one finding from spec §2.2 F7):
- `dojo/dojo.css:6-12` and the belt badge rule: dark text on the white, yellow, orange and green belts (≥ 4.5:1); `#c21919` text on `#171310` raised to ≥ 4.5:1.
- `packages/shared/src/sections/styles/trail.json`, plus trail CSS: `mutedForeground` ≥ 4.5:1 on the background; orange `#f3680f` only on large text, or darkened for small.
- `studiofloor.json` and its CSS: pink text on the light pink surface ≥ 4.5:1.
- `primer` and `sprout`: text on their navy CTA band ≥ 4.5:1.
- `workshop` (`#705444` on `#e0c8ad`) and `atelier` (`#98602a` on `#fee6e5`): raise to ≥ 4.5:1.
- `maison/ui.tsx:22`, `darkroom/ui.tsx:24`, `ledger/ui.tsx:23`: label size 0.75rem.
- `*/philosophy.tsx`:
  - statements over 80 characters get line-height ≥ 1.12;
  - no `uppercase` on text over 24 characters (kinetic, encore, sanctum, studiofloor quotes; label tokens that uppercase the meta line).
- `pop/pop.css:260`, `sprout/sprout.css:174`: replace the bounce curves with `cubic-bezier(0.22, 1, 0.36, 1)`.
- `money()`: delete the copies in 18 `<style>/ui.tsx`. Every call site (38 files) uses `formatMoney(price, currency)` from `@/lib/format`.
- Test: `frontend-customer/src/components/sections/__tests__/craft-floor.test.ts` (create).

- [ ] **Step 1: Write the failing guard test:**

```ts
import { readFileSync } from "node:fs";
import { globSync } from "glob";

const files = globSync("src/components/sections/*/*.{tsx,css}");

it("no style keeps its own money formatter", () => {
  for (const f of files) expect(readFileSync(f, "utf8")).not.toMatch(/export function money\(/);
});
it("no bounce easing in the styles", () => {
  for (const f of files) expect(readFileSync(f, "utf8")).not.toMatch(/cubic-bezier\([^)]*,\s*1\.[3-9]/);
});
```

  If `glob` is not already a frontend dependency, use `fs.readdirSync` instead. Never add a dependency for this.
- [ ] **Step 2: Run it. Expected: FAIL.**
- [ ] **Step 3: Fix every line in Files.**
- [ ] **Step 4: Verify.**
  - vitest PASSES and `make lint` is clean (`make sections-sync` and a django restart if a manifest changed).
  - Re-run the detector on all 21 rendered pages: for each id, run the Impeccable skill's `scripts/impeccable detect --json "http://demo-yoga.localhost/design-showcase?style=<id>&page=home&bare=1"`. Aggregate with `e2e/eval-shots/design/baseline-2026-10-24/detector/agg2.py`.
  - Expect zero `undersized-ui-text`, `tiny-text`, `tight-leading`, `bounce-easing` and `all-caps-body` (kinetic's 36px marquee excepted).
  - Expect zero `low-contrast`, except the false-positive groups named in the baseline report: the gradient backdrops on sanctum, trail and workshop; journal's underline; maison's host-body backdrop.
- [ ] **Step 5: Commit.**

### Task 1.6: Costume labels out

Budget: 45 min. Wiki: `docs/wiki/tenant-config-site-builder-src.md`.

**Files:**
- `darkroom/benefits.tsx`, `darkroom/ui.tsx`, `darkroom/hero.tsx` ("DETAIL")
- `grid/hero.tsx`, `ledger/courses.tsx` ("FIG.")
- `journal/hero.tsx` ("No. 1", "No. 2")
- `primer/hero.tsx`, `primer/ui.tsx` ("A1", "A2", "B1" tabs)
- `studiofloor/hero.tsx`, `studiofloor/courses.tsx`, `studiofloor/ui.tsx` ("ACT 01 //", "SETLIST //", "ENTER SET")
- `terminal/hero.tsx`, `terminal/cta.tsx` ("session.raw", "inspect.png", "$ " button prefixes)
- encore ("TRACK 01")
- trail (the "TRAIL HEAD" stamp)
- Test: `frontend-customer/src/components/sections/__tests__/costume-labels.test.ts` (create)

Rule (spec R5): remove decorative words that read as content or jargon. Numbers stay only where they count real items (steps, chapters). Wordless motifs (window dots, rules) may stay. Remove or reword; never invent copy.

- [ ] **Step 1: Write the failing guard test.** It reads every `.tsx` under `src/components/sections/` and expects none to contain any of these:
  - `ACT 0`, `SETLIST`, `ENTER SET`, `FIG.`, `TRACK 0`, `TRAIL HEAD`
  - `session.raw`, `inspect.png`
  - `>DETAIL<`
  - `"A1"`, `"A2"`, `"B1"`, `"No. 1"`, `"No. 2"`

  Before you write it, confirm each literal's exact form with `grep -rn` and match the source.
- [ ] **Step 2: Run it. Expected: FAIL,** listing the files.
- [ ] **Step 3: Remove the labels.** Re-run `make design-shots STYLES=darkroom,grid,ledger,journal,primer,studiofloor,terminal,encore,trail LABEL=after-1-6`. Check that no layout collapsed where a label used to sit.
- [ ] **Step 4: Verify.** The test PASSES and `make lint` is clean. Commit.

### Task 1.7: A phone-first hero, in three batches

Budget: 90 min per batch. Wiki: `docs/wiki/tenant-config-site-builder-src.md`. Needs 0.2 (`size=real`), 1.1 and 1.6.

Batches (each a separate agent, in this order; touch only your batch's style folders):
- **1.7a:** atelier, dojo, ledger, manuscript, nocturne, sanctum, sprout.
- **1.7b:** tavola, terminal, encore, grid, primer, studiofloor, trail.
- **1.7c:** darkroom, journal, kinetic, maison, pop, velvet, workshop.

**Files:**
- Create (1.7a only): `e2e/specs/92-phone-first.spec.ts`. Add `"92-phone-first"` to the `"src/components/sections"` entry and give the spec its own entry in `e2e/impact-map.json` (`make lint`'s selector self-test needs both).
- Modify: `frontend-customer/src/components/sections/<style>/hero.tsx` (and its CSS) for the batch.

**Interfaces (the contract the spec enforces):**
- URL: `/design-showcase?style=<id>&page=home&bare=1&size=real&fixture=yoga`. The hero is `[data-showcase^="hero."]`.
- **Phone, 390×844:**
  - the hero `h1`'s bottom is ≤ 844;
  - the hero's first link or button is fully inside 0–844;
  - the largest `img[data-site-img]` in the hero shows ≥ 0.4 × 844 px of its height inside the first screen.
  - Type-led exception: `manuscript` has no photo, so its h1 font-size must be ≥ 44px instead.
- **Desktop, 1440×900:**
  - the hero h1 font-size is ≥ 72px;
  - the first button's bottom is ≤ 900.
- One `test()` per style, named by the style id, so a failure names the style.

- [ ] **Step 1 (1.7a only): Write `92-phone-first.spec.ts`** to the contract. Run `make e2e-spec SPEC=92-phone-first`. Expected: FAIL for most text-first styles. Put the failing list in the report.
- [ ] **Step 2: Fix the batch's 7 heroes.**
  - The photo comes first, or sits behind the type.
  - The H1 sits on or directly under the photo.
  - One primary button. Secondary actions move below `sm` or out.
  - Raise the desktop H1 scale where the layout has room: headlines are now 36 characters at most.
  - Keep each style's character; don't borrow another style's composition.
- [ ] **Step 3: Verify.**
  - `make e2e-spec SPEC=92-phone-first`: the batch's 7 tests PASS (others may still fail until their batch).
  - `make lint` is clean.
  - `make design-shots STYLES=<batch> FIXTURE=yoga LABEL=after-1-7<x>` and `make design-shots STYLES=<batch> LABEL=after-1-7<x>-long`: no regression with long content.
- [ ] **Step 4: Check the editor once by hand.**
  - Open a styled tenant's home page in the editor (`docs/wiki` site-builder page, or `reference-browser-pane-coach-login` in memory).
  - Empty `meta` and second-button placeholders still appear on one batch style.
- [ ] **Step 5: Commit** the batch.

### Task 1.8: Gate A (before and after, eval, owner review)

Budget: 60 min, plus about 30 min of eval runs (agy quota).

- [ ] **Step 1: Capture.**
  - `make design-shots LABEL=gate-a`: long fixture, comparable with the baseline.
  - `make design-shots FIXTURE=yoga LABEL=gate-a-real`.
  - `make design-shots FIXTURE=business LABEL=gate-a-business`.
- [ ] **Step 2: Eval.** `make eval-sites STYLE=<id> BRIEFS=yoga,business` for velvet, kinetic and journal.
- [ ] **Step 3: Peer overlap.** Count shared stock asset ids between the newest `site_eval` composition and the dev tenants of the same niche. Use the page-data comparison from the critique: `/curated/<uuid>` file names in `TenantConfig.pages`. Expect ≤ 3 shared.
- [ ] **Step 4: Write the before/after summary into spec §9:**
  - eval scores per axis against Task 0.3's baseline;
  - `92-phone-first` status;
  - detector counts against the baseline;
  - the overlap count;
  - each style's phone home length in screens (the `gate-a-real` phone full-page height ÷ 844). The baseline was about 15. Phase 1 should cut it; ≤ 8 is a flagship target (spec G4);
  - the three `index.html` paths.
- [ ] **Step 5: Owner review (Gate A).**
  - Send the owner the gate-a and baseline sheets side by side.
  - Record their call on the photo-treatment assignment and O1 in spec §5.
  - Deploy: prep the commit, then the owner's Touch ID.
- [ ] **Step 6: Start Phase 2.** Set WP-2.0 to `in progress` and write its plan (spec §8).
