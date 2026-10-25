# Site Styles Wow, WP-2.0 (Flagship Directions and Comps → Gate B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan runs natively in the session that wrote it (the dispatcher asked for that); Task 4's review is the one fresh agent.

**Goal:** Four flagship directions (kinetic, velvet, journal, pop), each written as a contract into spec §7.1–§7.4 and proven by a rendered first-screen comp on desktop and phone, set beside the baseline and Gate A sheets and handed to the owner at Gate B.

**Architecture:** No product code changes in this work package.
- **Directions** come from the Impeccable new-work flow (`reference/new-work.md` §3 "Create or replace the visual world"), one `concept-seed` roll per flagship in Persuade mode. Each roll is fused and judged against the incumbent style's point of view (spec §2.3) and the rules R1–R11.
- **Comps** are standalone HTML first screens, one responsive file per flagship, in the git-ignored capture folder. They use the real yoga fixture's copy and Pix4Less photos.
- **Captures:** a small Playwright script shoots the comps with `design-shots`' fold sequence. PIL lays them into sheets next to the Gate A captures of the same content and the award references.

**Tech Stack:** Impeccable CLI 4.5.0 (`concept-seed`, `detect`), Playwright from `e2e/node_modules`, Python PIL, Google Fonts.

**Spec:** `docs/superpowers/specs/2026-10-24-site-styles-wow-design.md`: §5 (decisions), §6 (R1–R11), §7's WP-2.0 brief, §9 (log). Phase 0–1 ledger: `.superpowers/sdd/2026-10-24-site-styles-wow-phase-0-1/deferred.md` (git-ignored).

## Global Constraints

- **Nothing is built before Gate B's yes.** The flagship sections, manifests and the composer (WP-2.1–2.5) stay untouched.
- **The content model stays.** The 12 families' fields are unchanged, so copy stays portable across looks. A comp shows only:
  - fields the `hero` family has: `kicker`, `headline`, `subhead`, `ctaLabel`, `meta`, `image`, `image2`–`image4`;
  - the shared header: her name, a quiet "Sign in" and one offer button (R9).
- **D1, S1–S4.**
  - Own photos stay optional.
  - Stock shows a person of the audience's gender and age.
  - One light/dark choice.
  - No invented facts: no testimonials, ratings, numbers or press in a comp, even as decoration.
- **R1:** at most 4 first-screen elements besides the header. The home statement is at most 36 characters, or her name.
- **R4:** on 390×844 the first screen shows the photo or the giant type, the H1 and the primary button, with at least 30 px of slack under 844 (WP-1.7's bar, with a 64 px header).
- **R5:** no niche props and no jargon labels. A motif comes from her content or from the style's one idea at scale.
- **R6:** two or three colours, and each contract names its flooded section.
- **R7:** display faces sit outside both over-used lists:
  - spec F5: Cormorant, Playfair Display, Fraunces, Newsreader, Syne, Instrument Sans, IBM Plex, DM Sans, Space Mono;
  - Impeccable: Lora, Crimson, Space Grotesk, Inter as display, DM Serif, Outfit, Plus Jakarta Sans.

  Faces load through the style's Google Fonts query (`frontend-customer/src/lib/site-styles.ts:328`). A face from elsewhere names its self-hosting cost in TYPE.
- **R8:** CSS-first motion, scroll-driven where it scrolls. Content is visible with motion off. No LCP regression.
- **R11:** AA contrast, labels ≥ 12 px, no uppercase text over 24 characters (see the R11 call below), pull quotes at line-height ≥ 1.12, no bounce easing.
- **Four distinct anatomies.** No two flagships share a hero anatomy, a palette family or a display face (G3).
- **Shared checkout.** Stage by path, run `pre-commit run --files <files>`, then `git commit --no-verify`. Never run `make lint` as is. The capture folder `e2e/eval-shots/` is git-ignored, and the comps stay there.

## Review Focus

1. **A 36-character headline.** Giant type is where WP-1.7 lost the button below the phone fold. Task 3 renders every comp with a 36-character statement on both viewports, and the button must keep 30 px of slack.
2. **A coach outside body niches.** The business fixture (Elena Marsh, leadership) has no pose photos. Task 3 renders every comp with that set; the composition must not depend on a yoga shot.
3. **The dark scheme (S2).** Each OWN-WORLD block says what the world does when the visitor's scheme is dark. Task 1 Step 4 checks the line exists; the comps are captured light, like `design-shots`.
4. **The style's other two palettes.** Each OWN-WORLD block names the colour roles, so the flooded section survives the alternates. Task 1 Step 4 checks it.
5. **Motion off.** Each MOTION GRAMMAR block says what reduced motion shows. The first screen is complete with no animation (LCP). Task 1 Step 4 checks it; Task 3 shoots after motion settles.

## Calls this plan makes beyond the spec

- **Comps are rendered HTML, not generated images.** Impeccable's `generate-image` needs `OPENAI_API_KEY`, which is not set, and this harness has no native image tool. HTML comps render the real faces and copy exactly. In Impeccable's terms this is the code-led path: the comp becomes the WP-2.x critique reference.
- **Content is the real yoga fixture** (`frontend-customer/src/components/sections/fixtures.ts`, `realYoga`, coach Maya Laurent). It is the content Gate A's `20261025-0051-gate-a-real` captures show, so each comp pairs with its Gate A "now". The business set and a 36-character headline are the robustness strip.
- **The Impeccable decision round is Gate B itself.** There is no mid-work decision page. Each contract lists its competitive challengers in one line each, so the owner can steer to one.
- **Contract shape.** Each contract carries the spec's six blocks plus a FORM line (seed key, alternates), which Impeccable's §5 asks for. The FINISH line belongs to the WP-2.x builds.
- **R11 and display caps.** The open Gate A item: caps display headings over 24 characters in the poster styles. If a contract sets its statement in caps, it proposes the R11 wording in §5 for the owner to accept at Gate B.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `docs/superpowers/specs/2026-10-24-site-styles-wow-design.md` | §7 board row and plan link, §7.1–§7.4 contracts, §9 log line, §5 Gate B decisions | 1, 4 |
| `docs/superpowers/plans/2026-10-24-site-styles-wow-2.0.md` | This plan | none |
| `e2e/eval-shots/design/<YYYYMMDD-HHMM>-gate-b/comps/{kinetic,velvet,journal,pop}.html` (git-ignored) | One responsive first-screen comp per flagship | 2 |
| `…-gate-b/comps/content.js` | Copy and photo URLs from `fixtures.ts` (yoga, business, 36-character variant), chosen by `?set=` | 2 |
| `…-gate-b/tools/capture.cjs`, `tools/sheets.py` | Shots and sheets | 3 |
| `…-gate-b/shots/`, `sheets/`, `index.html` | Evidence for Gate B | 3 |

---

### Task 1: Concept seeds and the four direction contracts

Budget: 90 min.

**Files:**
- Modify: the spec, new §7.1–§7.4 after the WP-2.6–3.2 briefs, under a heading "Flagship direction contracts (WP-2.0)".

**Interfaces:**
- Produces: four contracts with the labels THESIS, OWN-WORLD, FIRST VIEWPORT, SIGNATURE SECTION, MOTION GRAMMAR, TYPE and FORM. Task 2 builds each comp from its FIRST VIEWPORT, OWN-WORLD and TYPE blocks; WP-2.1–2.4 build from the whole contract.

- [x] **Step 1: Ground each flagship** (`new-work.md` §3, steps 1–2).
  - One sentence each: the mechanism (one coach selling her own courses to people who arrive from her bio link on a phone), the personality from O1, the visitor's scene, what the first screen must prove (G1), and the rut. The rut is both the incumbent's Gate A first screen and its predictable opposite.
  - Seven candidates from the coach-and-student world, spanning at least three material families. No niche props (R5), and none of the tools the audience operates.
- [x] **Step 2: Roll.** For each flagship, run `"<skill>/scripts/impeccable" concept-seed --scope direction --mode persuade` and follow its printed rules.
  - Record the seed key.
  - Fuse each challenger and give it a verdict on audience identification and product clarity: wins, competitive or declined.
  - Name each raise after its donor.
  - The personality (O1) is brief-pinned and wins collisions; only materials translate.
- [x] **Step 3: Write §7.1–§7.4.** One contract per flagship, about 150–250 words.
  - **FIRST VIEWPORT** lists every first-screen element, phone and desktop, with its scale and position, and where the button sits.
  - **SIGNATURE SECTION** names a section no other style has (spec WP-2.1–2.4 examples) and the family it renders. It invents no content.
  - **FORM** carries the seed key and one line per competitive challenger.
- [x] **Step 4: Check every contract**, and fix it inline:
  - at most 4 elements besides the header;
  - a 36-character statement fits;
  - the flooded section is named;
  - faces are off both lists and on Google Fonts, or carry a cost line;
  - the dark-scheme line, the palette-roles line and the reduced-motion line are present;
  - no element outside the content model;
  - no two contracts share an anatomy, a palette family or a face.
- [x] **Step 5: Verify:** `grep -c "^- \*\*THESIS\|^- \*\*OWN-WORLD\|^- \*\*FIRST VIEWPORT\|^- \*\*SIGNATURE SECTION\|^- \*\*MOTION GRAMMAR\|^- \*\*TYPE\|^- \*\*FORM" <spec>` prints 28.

### Task 2: First-screen comps

Budget: 120 min.

**Files:**
- Create: `…-gate-b/comps/content.js` and `comps/{kinetic,velvet,journal,pop}.html`.

**Interfaces:**
- Consumes: Task 1's contracts.
- Produces: `comps/<id>.html?set=yoga|business|yoga36` renders the first screen at any width. 1440×900 and 390×844 are the measured sizes, and Task 3 shoots both.

- [x] **Step 1: `content.js`.** One `window.COMP_CONTENT` object, read from `fixtures.ts` without rewording:
  - `yoga`: `realYoga`'s hero, Maya Laurent, header button "Start the 7-day course";
  - `business`: `realBusiness`'s hero, Elena Marsh;
  - `yoga36`: `yoga` with a 36-character headline, "Strong, unhurried yoga for real life".

  Photos are the `px()` URLs `https://pix4less.com/media/previews/<id>/web.webp` from the `YOGA` and `BIZ` maps.
- [x] **Step 2: Build each comp** to its contract.
  - Header: her name, a quiet "Sign in" and the offer button.
  - Faces from Google Fonts.
  - Each photo carries its style's treatment.
  - Entrance motion settles within 2 s, and with reduced motion everything shows at once.
- [x] **Step 3: Craft floor.** Run `"<skill>/scripts/impeccable" detect --json comps/` once. Fix mechanical findings, and note each dismissed one with its reason.
- [x] **Step 4: Verify.** Open each comp in the browser pane at 1440×900 and 390×844 with each set:
  - nothing clips;
  - the button shows on the phone with at least 30 px under 844;
  - fonts and photos load.

### Task 3: Capture and sheets

Budget: 30 min.

**Files:**
- Create: `…-gate-b/tools/capture.cjs` and `tools/sheets.py`.

**Interfaces:**
- Consumes: the comps.
- Produces:
  - `shots/<id>-<set>-{d,m}-fold.jpg`;
  - `sheets/compare-gate-b-desktop.jpg`, `sheets/compare-gate-b-phone.jpg`;
  - `sheets/robustness-{desktop,phone}.jpg`;
  - `sheets/pairs/pair-<id>.jpg`;
  - `index.html`.

- [x] **Step 1: `capture.cjs <dir>`.** Use Playwright from `e2e/node_modules`.
  - Viewports: `d` 1440×900 at scale 1; `m` 390×844 with `isMobile` and `hasTouch`.
  - Colour scheme light.
  - The fold sequence of `e2e/scripts/design-shots.mjs`: fresh page, `networkidle`, `document.fonts.ready`, 2500 ms, then the viewport shot.
- [x] **Step 2: `sheets.py <dir>`.** Built on `baseline-2026-10-24/tools/compare.py`'s tile and sheet functions.
  - **Compare sheets** have three rows of four, in the order kinetic, velvet, journal, pop:
    1. "GATE A NOW (same content)": `20261025-0051-gate-a-real/styles/<id>-{d,m}-fold.jpg`;
    2. "GATE B COMPS": the yoga shots;
    3. the four award references from the baseline compare sheets: `baseline-2026-10-24/refs/{kasiasiwosz,yoga-by-nina,essor-fitness,antoine-lours}-{d,m}-fold.jpg`.
  - **Robustness sheets:** one row per flagship with yoga, business and yoga36.
  - **Pairs:** Gate A beside the comp, phone and desktop.
- [x] **Step 3: Run both and open every sheet once.** Each tile shows what its label claims: no blank tile, no half-loaded photo, no fallback font.

### Task 4: Fresh review and Gate B

Budget: 45 min.

- [x] **Step 1: Review.** Spawn `impeccable:impeccable-finish-reviewer`, fresh, with no forked history. Give it:
  - the WP-2.0 brief and R1–R11;
  - §7.1–§7.4;
  - the comp paths;
  - the yoga and robustness shots;
  - the reference shots;
  - the craft-floor reference `"<skill>/reference/craft-floor.md"`.

  Apply its material fixes in one batch and recapture once. No second round unless it says rebuild.
- [x] **Step 2: Log.** Append one §9 line: what was made, the seed keys, the sheet paths, and what was learned. Link this plan in §7's Plan column.
- [x] **Step 3: Commit** the spec and the plan:

```bash
pre-commit run --files docs/superpowers/specs/2026-10-24-site-styles-wow-design.md docs/superpowers/plans/2026-10-24-site-styles-wow-2.0.md
git add docs/superpowers/specs/2026-10-24-site-styles-wow-design.md docs/superpowers/plans/2026-10-24-site-styles-wow-2.0.md
git commit --no-verify -m "docs(styles): WP-2.0 flagship directions and comps for Gate B"
```

- [x] **Step 4: Hand Gate B to the owner.**
  - Send the compare sheets, the robustness sheets and `index.html`.
  - Ask for approve or steer per flagship, plus any R11 wording the contracts propose.
  - Record the answers in §5.
  - On a yes, set WP-2.0 to `done (<date>, <commit>)`. Until then it stays `in progress`.
