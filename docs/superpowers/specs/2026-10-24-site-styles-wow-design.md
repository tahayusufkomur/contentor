# Site styles: from "ok" to "wow"

Date: 2026-10-24 · Status: diagnosis and direction agreed with the owner on 2026-10-24 ("I agree all
your points"), with one change: own photos stay optional · Evidence (git-ignored, on the owner's Mac):
`e2e/eval-shots/design/baseline-2026-10-24/` · Plans: Phase 0–1
`docs/superpowers/plans/2026-10-24-site-styles-wow-phase-0-1.md`; Phase 2 and Phase 3 plans are
written when each phase starts (§8). The status board is §7; the log is §9.

## 1. Intent

The owner's words: "All [are] ok but I really don't feel wow in any of them." This program takes the
coach sites that `/setup` composes from "correct" to "memorable": a visitor remembers the site after one
look, and the coach sees herself in it.

The frame for every decision below is two separate judgements people make about a site's looks
(Lavie & Tractinsky, 2004):

- **Classical aesthetics:** clean, orderly, pleasant.
- **Expressive aesthetics:** original, surprising, fascinating.

All 21 styles score well on the first and near zero on the second. "Wow" lives in the second. Research
on first impressions also says *where* the novelty goes: a simple, familiar layout wins the first
half-second (Tuch et al., 2012). So the fix is not stranger page structures. It is one committed
expressive move per site, on a calm and familiar skeleton, around the real person.

## 2. What the critique found

### 2.1 How it was done

- **Showcase captures:** all 21 styles rendered with identical content through
  `/design-showcase?style=<id>&page=home&bare=1`. Each was shot at desktop 1440×900 and phone 390×844,
  both the first screen and the full page.
- **Real sites:** 8 composed dev tenants (`jojo-yoga`, `ts-tango-school`, `glow`, `maralindqvist`,
  `site_eval` and others).
- **Code read:** the section code (about 37.6k lines in `frontend-customer/src/components/sections/`)
  and the composer prompts (`backend/apps/core/onboarding/site_composer.py`).
- **Two independent assessments:**
  - a design-director review that did not see these conclusions;
  - the Impeccable detector over all 21 rendered pages: 512 findings in 26 rules, false positives
    dismissed.
- **References:** 9 award-recognised coach and creator sites, captured the same way.

Contact sheets live in `baseline-2026-10-24/sheets/`. The strongest single image is
`all-21-phone-first-screens.jpg`.

### 2.2 Findings

**F1: The coach is not on her own site, and nothing proves she is good.**

- **Stock strangers.** Every coach in a niche draws photos from one shared topic search
  (`_pool_candidates`, `site_composer.py:1437`). Only her own site's earlier pages are excluded, never
  other coaches' sites.
- **"Vary" means many faces.** The plan prompt says "Vary subjects, framing and moments across the site
  so no two photos look alike" (`site_composer.py:790`). On a solo coach's site that means a different
  model in nearly every slot: about 8 on Jojo Yoga.
- **Competitors share faces.** `jojo-yoga` and `glow`, two face-yoga coaches on two different looks,
  share **23 of their ~32 stock photos** (checked in the page data).
- **Every style gets the same photo mood.** The catalog's photos are all one warm beige register.
  Only kinetic, grid, dojo, darkroom, encore and velvet treat photos at all, each in its own ad-hoc
  CSS.
- **No proof anywhere.** The style library has no proof family: no testimonials, numbers, press, video
  or social presence. The composer is rightly forbidden to invent any. Generic legacy blocks exist
  (`components/blocks/testimonials-block.tsx`, `stats-block.tsx`, `logos-block.tsx`,
  `video-block.tsx`), but they sit outside the style system and the composer never places them.

**F2: One skeleton under 21 costumes.**

- **Same hero anatomy.** All 21 heroes render the same 8 slots: eyebrow, headline, paragraph, meta chip,
  two buttons, main photo and a small inset photo. Ledger alone has no inset.
- **Same home page.** Every home page is the same 8 families reshuffled: hero, then story, philosophy,
  benefits, courseShowcase, moments and howItWorks in some order, then cta. Darkroom has 7.
- **Same rhythm.** Every section sits in the same container with the same band spacing
  (`py-20 md:py-28 lg:py-32`, or close to it). 19 of 21 styles export an eyebrow `Kicker`.
- **Five archetypes, not 21 looks.** The independent review grouped the styles:
  - editorial serif split: atelier, ledger, journal, manuscript, maison, primer, tavola, darkroom;
  - centred dark: nocturne, sanctum, velvet;
  - collage: pop, workshop, sprout;
  - loud poster: encore, kinetic, studiofloor, grid;
  - costume: terminal, trail, dojo.
- **The costumes are niche props.** Terminal windows for tech; ruled paper and A1/A2/B1 tabs for tutors;
  an astrology wheel; a hanko seal and karate-belt course badges; sun and squiggle clip-art; a
  "TRAIL HEAD" stamp. That is how theme marketplaces signal "a template for X", not how a person's brand
  looks.
- **On a phone even the costume falls away.** The phone first screens are close to identical
  (`all-21-phone-first-screens.jpg`).

**F3: Everything plays at the same volume, so there is no peak.**

- **A crowded first screen.** Ours carry 8–9 elements. The award sites carry 2–4: a name, one image or
  none, a 1–4 word statement and one button.
- **Sentence headlines.** `hero.headline` allows 70 characters (`packages/shared/src/sections/families.json`):
  - The fixture reads "Strength that feels like ease, one breath at a time".
  - Jojo's real hero repeats the same LLM cadence: "Glow from within, one calm minute at a time".
  - The detector measured the hero h1 at 30–51% of a 1280×800 viewport.
  - Pop, velvet and workshop shrink the h1 instead (`velvet/hero.tsx:110`).
- **The peak comes too early and the page fades out.** Below the hero come eight equal bands. The only
  real moment, the philosophy pull quote, arrives second or third. The page ends on a small centred
  button and a boilerplate footer.
- **Too long.** Home pages run 8.5k–11.3k px on desktop, about 15 phone screens.
- **Almost no motion:**
  - one rule shared by all 21 styles: "soft image unveil + hover breath"
    (`frontend-customer/src/styles/globals.css:92`);
  - 1–3 entrance keyframes per style;
  - scroll-linked motion in only 2 styles (grid, kinetic);
  - zero `<video>`.

**F4: The phone, where her traffic lands, gets the weakest version.**

- Coach traffic arrives from an Instagram or TikTok bio link, on a phone.
- In 14 of 21 styles the phone's first screen is mostly words: eyebrow, a 4–5 line headline, a
  paragraph and two stacked buttons. In about 10 the photo does not reach above the fold.
- No style has a sticky call to action. On the real journal tenant the hero button sits at about
  955px, below an 844px screen.

**F5: The AI-median look, and software chrome on a personal brand.**

- **Paper and terracotta.** 13 of 21 default palettes sit on warm off-white "paper", 9 use a red or
  terracotta accent, and 8 do both. Add hairline rules, small tracked mono labels and "FIG. 01" or
  "NO. 1" captions. The result is the rendition AI tools produce most often, and the eye reads it as
  generated.
- **Over-used faces.** 10 of 21 styles use faces from the most over-used list: Cormorant, Playfair
  Display, Fraunces, Newsreader, Syne, Instrument Sans, IBM Plex, DM Sans and Space Mono.
- **Colour stays in the accents.** Only 5 of 63 palettes put a saturated colour (OKLCH chroma ≥ 0.1)
  into any large field: background, surface or inverse band.
- **The header says "software":**
  - "Get Started" is written by setup (`backend/apps/tenant_config/interview_milestones.py:243`);
  - "Sign In", an Instagram icon and a sun/moon toggle sit beside it
    (`frontend-customer/src/components/shared/public-header.tsx:135`).
  - The footer ends on the platform badge.
- **The look itself is not the problem.** Cream, serif and red *can* win: Le chef d'orchestre du corps
  was Awwwards Site of the Day with it. The trouble is the medium-strength version, applied everywhere.

**F6: The pipeline optimises "ok".**

- **The eval criteria reward sameness.** `e2e/specs/91-site-eval.spec.ts:58–71` rewards "consistent
  spacing and section rhythm". It judges each page alone and anchors a 10 at "the top Framer, Webflow
  or Squarespace templates" (`:176`), so the ceiling is a template.
- **Breadth over depth.** 21 styles and about 250 section layouts were built between 2026-10-05 and
  2026-10-11, 20 of them in four days, many layouts generated per style in minutes.
- **Model priors.** The styles were designed by language models, so they converge on the model-default
  look.

**F7: Craft defects (detector true positives).**

- **Eyebrows everywhere:** an eyebrow above nearly every heading, 52 times across 11 rendered pages.
- **Cramped pull quotes:**
  - The 132-character philosophy quotes are set at display leading (0.86–1.06) in 20 of 21 styles.
  - Kinetic, encore, sanctum and studiofloor also set them in uppercase.
  - The hero meta line is uppercased through label tokens.
- **Labels too small:** 0.68rem (10.9px) in `maison/ui.tsx:22` and `darkroom/ui.tsx:24`; 0.7rem in
  `ledger/ui.tsx:23`.
- **Contrast misses:**

  | Style | Text on background | Ratio |
  |---|---|---|
  | dojo belt badges (`dojo/dojo.css:6-12`) | white on #eab308 | 1.9:1 |
  | dojo belt badges | white on #f97316 | 2.8:1 |
  | dojo belt badges | white on #16a34a | 3.3:1 |
  | dojo | #c21919 on #171310 | 3.0:1 |
  | trail | #b1b1a1 on #f1eee6 | 1.9:1 |
  | trail | #f3680f on #f1eee6 | 2.7:1 |
  | studiofloor | #ff39b5 on #f8e8fb | 2.8:1 |
  | primer, sprout | pale text on their navy CTA bands | below AA |
  | workshop | #705444 on #e0c8ad | 4.3:1 (near miss) |
  | atelier | #98602a on #fee6e5 | 4.4:1 (near miss) |

- **Bounce easing:** `pop/pop.css:260` and `sprout/sprout.css:174`.
- **Three price formats:** 18 styles copy their own `money()` into `<style>/ui.tsx` instead of using
  `formatMoney` from `@/lib/format`, so one price shows as "$49", "49.00" or "29 USD" depending on the
  look.
- **Costume labels leak into copy:** "ACT 01 //", "SETLIST //", "ENTER SET", "FIG.", "No. 1",
  "TRACK 01", "A1 A2 B1", "session.raw", "inspect.png", "TRAIL HEAD", "DETAIL".
- **The "Kind" signature.** "Kind Mornings" signs its story letter "Kind". `_name_like`
  (`site_composer.py:190`) reads two capitalised words as a person's name.

### 2.3 What works (keep it)

- The body copy is specific and voiced: "Yoga for desk bodies", "Calmer mornings. Quieter bedtimes.",
  "I know how loud mornings can get". The banned-phrase rules work.
- The craft floor is high: considered font pairs, coherent OKLCH tokens, nothing broken.
- Honest by design: real courses, prices and dated events, and no invented proof.
- Kinetic, pop, velvet and journal each have a real point of view.

### 2.4 Style by style (memorability out of 10, both reviews reconciled)

| Style | What it is → what holds it back | Score |
|---|---|---|
| kinetic | Sports poster, condensed caps, lime marquee → the most committed; red plus lime clash; wrong for gentle niches | 7 |
| pop | Magenta/lime collage, sticker badge → most personality; busy; headline squeezed into a banner | 7 |
| velvet | Oxblood, Playfair italic, faded portrait → most premium; two tenants look identical | 6 |
| journal | Magazine cover, masthead → best real site (Mara); "No. 1/No. 2" means nothing; phone H1 collapses | 6 |
| encore | Gig-poster giant caps → real scale; framed beige photos fight the poster | 6 |
| grid | Swiss grid, "FIG." captions → tidy; reads as a generic Framer template | 5 |
| terminal | Mono, green cursor, window chrome → memorable, but a costume around a yoga photo | 5 |
| atelier | Cormorant, arch photo with circle inset → the wellness Canva trope | 4 |
| darkroom | Gallery split, giant Syne → portfolio template; dead white space | 4 |
| dojo | Centred serif, ensō ring, belt badges → ring sits under the text; badges fail contrast | 4 |
| maison | Bodoni masthead → the category label is the biggest text; the H1 is small on the photo | 4 |
| sprout | Fredoka, sun and squiggle doodles → kids-app clip-art; photos below the phone fold | 4 |
| studiofloor | Neon club glow → muddy purple wash; the card covers the dancer; 158 detector findings | 4 |
| tavola | Recipe-card frame → a split hero in another font; the trattoria idea never arrives | 4 |
| trail | Card over a full-bleed photo, stamp → the card hides the subject | 4 |
| workshop | Taped polaroids, kraft card → scrapbook template; tiny photos | 4 |
| ledger | Hairline masthead, condensed serif → indistinguishable from journal and manuscript | 3 |
| manuscript | Book title page → no photo on either size; reads as a wedding invitation | 3 |
| nocturne | Navy, centred serif, glowing pill → the "calm app" default; same layout as sanctum | 3 |
| primer | Ruled notebook, A1/A2/B1 tabs → the most literal costume; the tabs look like debug UI | 3 |
| sanctum | Midnight, astrology wheel, all-caps Cinzel → a four-line caps headline, slow to read | 3 |

## 3. What "wow" looks like here

| Site (recognition) | The one move |
|---|---|
| [Kasia Siwosz](https://www.kasiasiwosz.com) (Awwwards Honorable Mention, 2025) | Monochrome; one real black-and-white portrait; "STOP PLAYING SMALL." edge to edge; numbered chapters; giant two-word interjections |
| [Yoga by Nina](https://yoga-by-nina.webflow.io) (Honorable Mention, 2022) | Three staggered words and "by Nina Park", one button, no photo in the first screen, two colours, page transitions |
| [Essor Fitness](https://coachsportifecublens.com/) (Honorable Mention, 2026) | The name as full-width type; a real phone video; "★ 4.85/5 · 60+ reviews" above the fold; a video "wall of fame" |
| [Chef Antoine Lours](https://antoinelours.com/) (Honorable Mention, 2022) | Navy and peach; C-H-E-F across a four-column grid; a horizontal-scroll story |
| [Le chef d'orchestre du corps](https://lechefdorchestreducorps.fr) (Site of the Day, 2021) | One metaphor runs the whole site; cream, serif and red done with total commitment |
| [The Podcast Coach](https://thepodcastcoach.co.uk) (Honorable Mention, 2026) | One deep green; photo masks shaped like the logo |
| [css-for-js.dev](https://css-for-js.dev), [animations.dev](https://animations.dev) | "Stop wrestling with CSS." beside the teacher's real face; the page demonstrates the skill |

The pattern: one committed idea, the real person or their real work, short words at huge scale, two or
three colours, one button. Everything else is quiet so the one moment lands. Awwwards weights design 40%,
usability 30%, creativity 20% and content 10%. The coach Honorable Mentions above won on typography,
restraint and copy, not on WebGL.

Their first screens sit next to ours in `baseline-2026-10-24/sheets/compare-phone.jpg` and
`compare-desktop.jpg`.

## 4. Goals, non-goals, anti-goals

Goals

- **G1:** after a 5-second look at the first screen, a visitor can name one thing about the site.
- **G2:** a solo coach's site reads as one person's: one protagonist, no parade of strangers, and no
  faces shared with a competitor in the same niche.
- **G3:** four flagship looks hold their own against the reference set in a blind side-by-side (owner
  plus five people), and score distinctiveness ≥ 7.5 in the eval.
- **G4:** phone first. The first screen shows the image or giant type plus one button; a sticky call to
  action follows; the home page is at most 8 phone screens.
- **G5:** the pipeline measures distinctiveness and anchors on award sites, not on templates.

Non-goals

- Making own photos required (D1).
- New niches, new languages, admin UI.
- Changing what setup asks, beyond the optional additions in WP-2.6.

Anti-goals (a failure even if it looks good)

- A "wow" that hides the offer. The primary button is always on the first screen.
- Invented proof, numbers, credentials or quotes. The copy-truth rules stand (S3).
- Slower pages. LCP must not regress; motion is CSS-first and reduced-motion safe.
- Accessibility regressions. WCAG AA contrast holds.
- Costume replacing character: no new niche props.

## 5. Decisions

Owner, 2026-10-24

- **D1: own photos stay optional, exactly as today.** The setup photos question and its skip stay as
  they are. Nothing is gated on uploads. The no-photo path is what this program improves.
- **D2:** every point of the critique is agreed. That means:
  - one protagonist and real proof;
  - styles own structure, not just skin;
  - one peak per page;
  - phone first;
  - committed colour and type;
  - personal chrome;
  - a craft floor;
  - flagships chosen by personality;
  - merging or retiring looks that cannot reach the bar;
  - an eval that measures distinctiveness.

Standing decisions this program must respect

- **S1 (2026-08-07):** stock photos show a person, gender and age matched to the niche's audience;
  no flat lays. Tight crops of hands, feet or a back view are allowed.
- **S2 (2026-10-14):** one light/dark choice shared by the site and the admin (next-themes key
  `theme`). The toggle may move out of the header; the shared behaviour stays.
- **S3:** never invent facts in copy: no testimonials, numbers, credentials, prices or schedules the
  coach did not give (`PAGE_SYSTEM_PROMPT`, "Honesty (hard rules)").
- **S4:** her own photos come first whenever she has them (`own_photos.preferred()`).

Open, with the default this program uses until the owner says otherwise

- **O1, the flagship set:** kinetic (energy), velvet (premium), journal (calm editorial) and pop
  (playful). These are the four strongest in both reviews, one per personality. Confirmed at Gate B.
- **O2:** the photo treatment covers her own photos too, for coherence. Revisit if coaches object.
- **O3:** which looks retire or merge. Decided at Gate C, from the post-Phase-2 capture and eval.
- **O4:** the site's light/dark toggle moves to the footer.

Owner, 2026-10-25 (Gate A)

- **Gate A approved as built** ("Amazing work, approved, deploy"). The photo-treatment assignment, the
  O1 flagship set (kinetic, velvet, journal, pop) and the calls listed at the gate stand as built: kinetic's
  scrim and the band duotones kept, long quotes at line-height 1.32, a renamed button with nowhere to go
  falls back to Contact, the home hero pinned to each style's phone-first variant until Phase 2.

Proposed at Gate B (WP-2.0), awaiting the owner

- **The four directions** in §7.1–§7.4, each with its alternates. Recommended, after two review rounds:
  - approve kinetic's two-ink bill;
  - approve velvet's invitation. The monogram reads stronger at 5 seconds, but it is the luxury-house
    canon the thesis refuses.
  - steer journal to the cover (see the note under 7.3);
  - approve pop's panel.
- **R11 and display caps** (the open Gate A item):
  - R11's "never uppercase over 24 characters" applies below 48 px.
  - At 48 px and above, kinetic may set its statement and its billed course titles in caps.

## 6. The bar: rules every work package follows

Each rule has a check, so a work package can prove it.

| # | Rule | Check |
|---|---|---|
| R1 | **First screen:** at most 4 elements besides the header (statement, one line, one button, one image or none). The home hero statement is at most 36 characters, or the coach's name. | `HOME_HERO_HEADLINE_MAX` enforced by the composer; phone-first spec (WP-1.7) |
| R2 | **One protagonist:** a face that stands for the coach appears in at most one slot per page. Other person slots show students or a detail crop (hands, feet, back). No stock image already used by another tenant in the same niche, unless nothing else fits. | Composer tests (WP-1.3) |
| R3 | **One peak per page:** one section is the page's moment, with a scale break (full-bleed or giant type) and its own rhythm. Everything else is quieter. | Flagship acceptance (WP-2.x); eval `rhythm` axis |
| R4 | **Phone first:** on 390×844 the first screen shows the image or the giant type, the H1 and the primary button. A sticky call to action appears after the hero. Courses and events lists show at most 3 on home, with "See all". | `e2e/specs/92-phone-first.spec.ts` (WP-1.7); sticky CTA tests (WP-1.4) |
| R5 | **Character over costume:** no niche props or jargon labels. A motif comes from the coach's content or one style idea executed at scale. | Costume-label guard test (WP-1.6); flagship review |
| R6 | **Commit to colour:** two or three colours, and at least one full section flooded with the style's colour (flagships). | Flagship acceptance |
| R7 | **Type with a point of view:** flagship display faces come from outside the over-used list (§2.2 F5), at poster scale where the style is loud. | Flagship acceptance |
| R8 | **Motion with intent:** one motion grammar per flagship. CSS scroll-driven animation preferred. Reduced motion respected. No LCP regression. | Lighthouse before/after on home (WP-2.x) |
| R9 | **Personal chrome:** the header holds her name and one offer button; "Sign in" is quiet; the toggle is not in the header. The page ends on her easiest offer. | Header/footer tests (WP-1.4) |
| R10 | **Real proof only:** proof renders only from input the coach gave, and the section hides when it is empty. | WP-2.5 tests |
| R11 | **Craft floor:** AA contrast (4.5:1 text, 3:1 large text and UI); labels ≥ 12px; text over 24 characters never uppercase; pull quotes at line-height ≥ 1.12; no bounce easing; one price format. | Detector re-run on all 21 rendered pages (WP-1.5) |

## 7. The program: work packages and status board

Every work package is one agent with a fresh context (§8). Phase 0–1 tasks are detailed in the Phase
0–1 plan. The briefs for Phase 2–3 are below; their task plans are written when the phase starts.

Status values:
- `todo`
- `in progress (<date>, <session>)`
- `done (<date>, <commit>)`
- `blocked (<why>)`

| WP | Title | Depends on | Plan | Status |
|---|---|---|---|---|
| 0.1 | Capture tool: `make design-shots` | none | Phase 0–1, Task 0.1 | done (2026-10-24, 9edf1bd5) |
| 0.2 | Realistic showcase fixtures (`fixture=` sets) | none | Task 0.2 | done (2026-10-24, d608bd88) |
| 0.3 | Eval measures distinctiveness and anchors on award sites | none | Task 0.3 | done (2026-10-24, 190cb7dd) |
| 1.1 | Hero and copy rules in the composer | none | Task 1.1 | done (2026-10-24, 3a836ecc) |
| 1.1b | At most three courses and three events on home | 1.1 (same files) | Task 1.1b | done (2026-10-24, c9c60462) |
| 1.3 | One protagonist, no faces shared with peers (composer photos) | 1.1b (same files) | Task 1.3 | done (2026-10-24, 330f48bf) |
| 1.2 | Photo treatment per style (manifest → CSS) | none | Task 1.2 | done (2026-10-24, 2fc3af85) |
| 1.4 | Personal chrome and sticky phone CTA | none | Task 1.4 | done (2026-10-24, 98648091) |
| 1.5 | Craft floor (detector fixes, one money formatter) | 1.2 | Task 1.5 | done (2026-10-24, 8a3c5635) |
| 1.6 | Costume labels out | 1.5 | Task 1.6 | done (2026-10-24, 1ff87080) |
| 1.7a | Phone-first hero, batch A | 0.2, 1.1, 1.6 | Task 1.7 | done (2026-10-24, b3790f86) |
| 1.7b | Phone-first hero, batch B | 1.7a | Task 1.7 | done (2026-10-24, 275ed6e9) |
| 1.7c | Phone-first hero, batch C | 1.7b | Task 1.7 | done (2026-10-24, 3a3e6546) |
| 1.8 | Gate A: before/after capture, eval, owner review | all of Phase 1 | Task 1.8 | done (2026-10-25, 8f2702e1 deployed) |
| 2.0 | Flagship directions and comps → Gate B | 1.8 | `plans/2026-10-24-site-styles-wow-2.0.md` | in progress (2026-10-25, eb9081a5) |
| 2.1 | Flagship build: kinetic | 2.0, 2.5 | written at start | todo |
| 2.2 | Flagship build: velvet | 2.0, 2.5 | written at start | todo |
| 2.3 | Flagship build: journal | 2.0, 2.5 | written at start | todo |
| 2.4 | Flagship build: pop | 2.0, 2.5 | written at start | todo |
| 2.5 | New families: proof, statement, video | 2.0 | written at start | todo |
| 2.6 | Setup additions: optional clip, real proof, one belief | 2.5 | written at start | todo |
| 3.1 | Human 5-second test | 2.1–2.4 | written at start | todo |
| 3.2 | Catalog consolidation → Gate C | 3.1 | written at start | todo |

Gates (the owner reviews contact sheets; nothing proceeds past a gate without a yes):

- **Gate A (after 1.8):** Phase 1 before/after. Confirms O1.
- **Gate B (inside 2.0):** the four flagship directions and their first-screen comps.
- **Gate C (inside 3.2):** which looks stay, merge or retire.

### Phase 2–3 briefs

**WP-2.0: flagship directions and comps.**
- **Input:** this spec, the baseline and Gate A sheets, the reference sheet.
- **Output:** one direction contract per flagship (O1), written into this spec as §7.1 to §7.4. Each
  contract has six blocks:
  - THESIS: the one idea and the default it refuses;
  - OWN-WORLD: palette and component language;
  - FIRST VIEWPORT: exact composition, phone and desktop;
  - SIGNATURE SECTION;
  - MOTION GRAMMAR;
  - TYPE: faces and scale.
- **Comps:** a first-screen comp per flagship, desktop and phone, generated from real coach content,
  set beside `compare-*.jpg`.
- **Method:** the Impeccable new-work flow (concept seed, then comps).
- **Gate B:** the owner approves or steers each direction.
- **Must keep:** the 12 families' content model (copy stays portable across looks); D1, S1–S4.

**WP-2.1 to 2.4: flagship builds, one agent each, sequentially.** Each flagship gets:
- its own hero anatomy and home recipe;
- one signature section no other style has (examples: manifesto interjections, a horizontal story,
  a proof wall, or the page performing the skill, such as a breath pacer, a face-yoga loop or a chess
  puzzle);
- its motion grammar;
- its committed palette with one flooded section;
- its display type at scale;
- its own header and footer variant.

Acceptance:
- R1–R11 hold, checked with the Phase 0 tools.
- The eval scores distinctiveness ≥ 7.5 and overall ≥ 8.5 on two briefs.
- Home LCP is no worse than the baseline.
- In a blind side-by-side with the reference sheet, the owner does not pick it as the weakest.

**WP-2.5: new families.**
- **proof:** testimonials pasted by the coach, numbers she states, press she names. It renders
  nothing when empty.
- **statement:** one big line or a two-word interjection, written by the composer from the coach's
  own belief.
- **video:** a hero loop or a short reel from her upload.

Each gets a manifest entry, composer support (never invented: R10, S3), editor fields, a neutral
default layout for every style, and the designed layout in each flagship.

**WP-2.6: setup additions (all optional, D1).**
- a 10-second phone clip;
- up to three testimonials she pastes, with the client's first name and consent;
- numbers she states;
- one sentence: "one thing you believe that most teachers in your field don't".

All of them feed WP-2.5. Skipping any one changes nothing else.

**WP-3.1: human 5-second test.** A protocol plus a run by the owner: five people, each flagship's first
screen shown for 5 seconds, then "what do you remember?" and "who is it for?". It records answers
against G1.

**WP-3.2: catalog consolidation (Gate C).**
- Decide which looks stay, merge into a flagship skeleton, or retire (O3).
- Migrate tenants on a retired look to the nearest flagship and palette.
- The setup gallery shows fewer, better looks.
- Niche ranking spreads peers across looks, so two face-yoga coaches do not land on the same one.

### Flagship direction contracts (WP-2.0, for Gate B)

Written with the Impeccable new-work flow: one `concept-seed` roll per flagship in Persuade mode,
each challenger fused and judged on audience identification and product clarity, and each declined
challenger donating one discipline (the "Raised by" lines). The personality (O1) was pinned and won
every collision. Every contract keeps the 12 families' content model.

Rules every contract shares:
- **First screen (R1):** four elements besides the header.
- **Motion:**
  - nothing on the first screen waits for motion (LCP), and motion starts below it or on interaction;
  - reduced motion shows every final state.
- **Photo treatments:** each contract names one. The threshold print and the halftone are new values
  for the manifest's `photoTreatment`.
- **Alternates** are listed so the owner can steer to one at Gate B.

#### 7.1 kinetic: the two-ink bill

- **THESIS:** Energy as print. Her site is a fight-night bill pulled in two inks, volt and black, with
  nothing between them. It refuses both the category's "bold" default (a dark photo, white type, a red
  button and a ticker) and the incumbent's red-and-lime clash.
- **OWN-WORLD:** Two inks and no midtones.
  - **Inks:** volt `oklch(0.93 0.21 122)` and ink `oklch(0.17 0.01 260)` (16:1).
  - **No grey:** muted text, surfaces and borders are one of the two inks. Hierarchy comes from size
    and weight, never from grey.
  - **Photos print into the field** (the threshold print): grayscale through a near-binary curve,
    multiplied onto volt. Light walls print as pure volt, so the figure stands in the field with no
    frame, and every stock photo becomes the same black print of a person.
  - **Bands, not cards:** sections are full-width bands of one ink, with no cards, rounded corners or
    shadows. Buttons are square slabs in the opposite ink, with one cut corner.
  - **Other palettes keep the roles:** Ocean prints navy on aqua, Ember burnt black on amber.
  - **Dark scheme:** the inks swap areas (a black field with a volt print), never roles.
- **FIRST VIEWPORT:**
  - **Phone:** volt to every edge.
    - The statement comes first: black caps at 64–72 px in three lines, leaning 8° as one block.
    - Her print follows: head and shoulders, bleeding off both sides, with a hard straight bottom edge.
    - One line of subhead at 17 px, then the black slab button. The button ends at 780 px or above.
  - **Desktop:** volt to every edge.
    - The statement runs across the left 54% at 112–148 px in three balanced, leaning lines.
    - The print fills the right 44% at full height, never under the letters.
    - The subhead and the button sit under the statement on clean volt.
  - **Header:** her name in black, a quiet "Sign in", the offer as a small black slab.
- **SIGNATURE SECTION:** The bill. On a black band, her home courses (three at most) are billed like a
  fight card.
  - Each title is a full-width line of volt caps, stepped one indent right of the line above.
  - Each line carries its real price and a slab button.
  - Hovering or focusing a line reverses it to volt.
  - It renders `courseShowcase` and shows nothing the coach did not give.
- **MOTION GRAMMAR:** Hard cuts, like lights switching on.
  - Bands flip between volt and black at the middle of the viewport (scroll-driven, `steps(1)`).
  - Billed lines cut to volt on focus.
  - No easing, slides or fades anywhere.
  - Reduced motion: every band in its final ink.
- **TYPE:**
  - **Faces:** Big Shoulders (Google Fonts, opsz 72, weight 900) for the statement and the bill,
    uppercase and leaning as a skewed block. Archivo (width 100) for body and UI.
  - **Scale:** the statement at 64–72 px on phones and 112–148 px on desktop; body at 17 px. Nothing
    sits between the two sizes except the bill.
  - The caps need the R11 wording proposed in §5.
- **FORM:** Seed `ea430533`.
  - **The roll** assigned candidate 4, broadcast sports graphics.
  - **The cabaret challenger won.** The fused Weimar cabaret bill beat it on both axes:
    - a poster is the gym's own wall culture across every energetic niche, where broadcast graphics
      read as sports TV;
    - two inks and one figure hold four elements, where straps, bugs and chips stack up.

    It became the build.
  - **Raised by:**
    - the torn billboard: scale jumps, no middle sizes;
    - the rain-night city: phones stack full-width bands;
    - the orizuru: one uncut sheet, no cards;
    - the risograph: photos multiply into the field;
    - the cutting bench: volt covers at least a third of every screen.
  - **Alternates:**
    - broadcast graphics (assigned, lost both axes);
    - Impeccable's pick, variable-width poster type that stretches with scroll on one volt field. Its
      risk: the most familiar sports-poster look, the closest to the incumbent.

#### 7.2 velvet: the invitation

- **THESIS:** Premium as being invited in person. The home page is a couture invitation in her name: a
  thick oxblood card laid on velvet, which opens. It refuses both the luxury canon (black, gold and
  thin serif caps over a full-bleed photo) and the incumbent's faded split portrait.
- **OWN-WORLD:** Three materials.
  - **Velvet ground** `oklch(0.16 0.035 15)`: crushed pile under one soft key light that drifts. The ground
    and the card stock are authored raster plates, not CSS gradients.
  - **Oxblood duplex card** `oklch(0.31 0.1 18)`:
    - a blush painted edge `oklch(0.8 0.07 22)`, thicker at the foot where the card's depth shows;
    - square corners;
    - a deep soft shadow onto the velvet.
  - **Champagne foil** `oklch(0.86 0.065 80)` for type, at 9:1 on the card. A metallic gradient is
    clipped to the name only.
  - **Photos are prints tipped onto the card** with a thin blush mat, warm-toned (`tint`).
  - **Two places only:** every section is either a card of the suite or set straight on velvet, with
    no other boxes. The suite's cards are the hero, events as the details card, and the closing call as
    the reply card.
  - **Buttons** are foil-edged rectangles that fill with foil on hover.
  - **Other palettes keep the roles:** Noir is a black card on black velvet with crimson edges, Satin a
    blush card on wine velvet.
  - **Schemes:** dark is native. Light mode turns the ground to blush paper and keeps the oxblood card.
  - **No wedding cues:** no script, florals, ivory stock or centred ceremony copy.
- **FIRST VIEWPORT:**
  - **Phone:** velvet and the header, then the card, the full width less 16 px margins, at 3:5. On the
    card:
    - her portrait print, 4:5 at 60% of the card's width, centred;
    - the site name in foil at 44–52 px;
    - the statement in one or two lines at 20–22 px;
    - the button, ending at 780 px or above.
  - **Desktop:** the same 3:5 card stands centred at about 84% of the viewport height, with velvet on
    both sides and the light drifting across it. The card holds the same four things. Nothing else is
    on screen.
- **SIGNATURE SECTION:** The gatefold. Past the hero, the card's two panels part from the centre to
  reveal its inside.
  - The inside floods oxblood to the full width.
  - Her belief is set in foil at monument scale: WP-2.5's statement, or the philosophy statement's
    first sentence when there is none. Her name sits under it.
  - Two detail prints (students or hands) ride on the opening panels.
- **MOTION GRAMMAR:** Slow light.
  - The key light drifts across the velvet with scroll.
  - On desktop, the foil sheen follows the pointer.
  - Cards are laid down: a 12 px settle and a growing shadow, 900 ms ease-out.
  - The gatefold opens over one screen of scroll.
  - Nothing is faster than 600 ms and nothing loops.
  - Reduced motion: still light, cards in place, the gatefold open.
- **TYPE:**
  - **Faces:** Kalnia (Google Fonts, width 100–125, weight 100–700). The name is at weight 600, the
    statement at weight 380 and width 125. Jost for body at 16–17 px.
  - **Scale:** the name at 44–52 px on phones and 72–84 px on desktop, in two lines when it must.
- **FORM:** Seed `ff412b51`.
  - **The roll** assigned candidate 7, a couture invitation.
  - **Ebru, floated pigment, is competitive.** Marbled silk reads as sensual luxury, but a moving
    pigment field fights her words. It stays a full alternate.
  - **Declined:** the other five.
  - **Raised by:**
    - the alphabet storm: her name at monument scale, not small formal type;
    - the cassette j-card: the suite unfolds panel by panel;
    - the CD-ROM console: one live area per screen;
    - the chromatophore skin: the foil answers the light;
    - the drum machine: the card keeps its proportion at every width and scales, never reflows.
  - **Alternates:**
    - ebru, a marbled ground;
    - Impeccable's pick, her initials as a house monogram at poster scale, with the portrait standing
      between the letters. Its risk: the familiar luxury-house move.
  - **Honest risk of the build:** an invitation can read as wedding stationery. The no-wedding-cues
    rule exists for that.

#### 7.3 journal: the exhibition

- **THESIS:** Calm as a museum room. The home page is a one-person exhibition: the statement cut in
  vinyl on a painted wall, and her photo hung like a work with its label. It refuses both the AI-median
  editorial (cream paper, an italic display serif, hairlines and tracked mono labels) and the
  incumbent's split cover.
- **OWN-WORLD:** Painted walls and hung prints.
  - **Default walls:**
    - gallery green `oklch(0.37 0.055 165)`, with wall ink `oklch(0.97 0.01 95)` (9:1);
    - a cool white room `oklch(0.975 0.004 100)`, with ink `oklch(0.24 0.02 165)`.
  - **Rooms:** sections are rooms. Each floods one wall colour to every edge, and the colours alternate
    down the page.
  - **Photos hang:** never full-bleed, with wall on every side and a soft contact shadow below. No frame
    and no rounded corners.
  - **Labels:** every photo has a museum label beside it in small grotesk: its caption, or for the
    hero her name as the title, her kicker as the medium line and the subhead as the note.
  - **Light:** a picture light falls from above onto the work, with no halo around it.
  - **Buttons** are plain rectangles in wall ink.
  - **Never:** kickers above headings, hairlines or italics.
  - **Other palettes repaint the walls and never move the hang:** Sage hangs on sage and stone, Dusk on
    plum and lilac.
  - **Dark scheme:** the green room deepens and the white room becomes charcoal.
- **FIRST VIEWPORT:**
  - **Two groups:** the wall text with its button, then the work with its label.
  - **Phone:** a green wall.
    - The statement as wall text at 44–48 px, in two or three lines, flush left on the wall's margin.
    - The button sits under the statement and ends at 780 px or above.
    - Her portrait hangs at 74% width on the same margin, at 4:5.
    - The label sits under the print and may fall below the fold.
  - **Desktop:** the green wall to every edge.
    - The statement on the left at 88–108 px, in two lines, with the button under it.
    - Her portrait hangs on the right at eye level, at 68% of the viewport height.
    - The label sits at the print's foot, to its left.
- **SIGNATURE SECTION:** The hang. Her moments hang in one row along a single centre line on the green
  wall, at varied sizes, each with its label (her captions). Scrolling walks along the wall: the section
  pins and the row travels sideways, one work at a time. It renders `moments`.
- **MOTION GRAMMAR:** One breath.
  - Prints below the first screen develop into view, from the wall colour to the full print over 1.2 s.
  - Every transition takes a breath (1.2 s in and out), and nothing snaps.
  - The hang travels at walking pace with scroll.
  - Reduced motion: every print developed, and the hang becomes an ordinary horizontal scroller.
- **TYPE:**
  - **Faces:** Hahmlet (Google Fonts, variable weight) at 300 for wall text and statements. Familjen
    Grotesk for labels, body and buttons.
  - **Scale:** wall text at 44–48 px on phones and 88–108 px on desktop, labels at 14 px, body at 17 px.
- **FORM:** Seed `168c71ac`.
  - **The roll** assigned candidate 3, a museum print and wall label.
  - **The design annual's plate section is competitive.** One grotesk at plate scale reads at once,
    which holds product clarity. It loses audience identification: an annual is a designer's object,
    while everyone has walked through a museum. It stays a full alternate.
  - **Declined:** the other four.
  - **Raised by:**
    - the darkroom: prints develop into view;
    - the tensegrity column: motion at breathing tempo;
    - the ASCII renderer: palettes repaint walls, never the hang;
    - the mook: no unlabelled photo;
    - the streetwear quote grammar: headings say plainly what the room holds, with no kicker.
  - **Alternates:**
    - the design annual: near-white stock, one grotesk, and her name in a round signature stamp half
      off the plate;
    - Impeccable's pick, a magazine cover with her name as the nameplate. Its risk: it is the
      incumbent's own idea done at full scale.

**Gate B note on 7.3 (WP-2.0 review):**
- **Finding:** after two review rounds, the exhibition keeps its contract and still fails G1. Its
  5-second memory is "green". The cover (`comps/journal-cover.html`) clears G1 on every set.
- **Recommendation:** steer journal to the cover.
- **If chosen, the cover's contract:**
  - it keeps this OWN-WORLD's green and Hahmlet;
  - her name becomes a full-width nameplate in Noto Serif Display, condensed (width 62.5, weight 800);
  - a full-bleed cover photo carries the statement over a scrim at the foot;
  - the hang moves to the signature section.

#### 7.4 pop: the panel

- **THESIS:** Joy as pop art. The home page is one giant comic panel in process colours. Her photo is
  screen-printed in halftone and her words sit in a speech balloon, so she is the one talking. It
  refuses both the category's pastel blobs and the incumbent's busy four-photo collage.
- **OWN-WORLD:** Process colours and one keyline.
  - **Colours:**
    - field: hot magenta `oklch(0.64 0.25 355)`;
    - print: cyan `oklch(0.86 0.12 210)`;
    - keyline and type: ink `oklch(0.18 0.02 330)` (4.9:1 on the field, 12.8:1 on cyan);
    - balloons: white.
  - **One keyline:** a single 3 px ink line draws every panel, balloon, caption box and button. States
    thicken or double the line, never change only the colour.
  - **Photos are screen prints** (the halftone): a flat cyan block under black halftone dots, made in
    CSS by averaging the grayscale photo with a dot grid, then high contrast. Stock becomes one printed
    look.
  - **Crops go to the face:** each photo's focal point and zoom come from Pix4Less
    `subject_placement`.
  - **Caption boxes** are white rectangles with the keyline. Each balloon and its tail are one
    outline.
  - **Panels:** sections are panels on the magenta field, square-cornered, with gutters of field
    between them.
  - **Other palettes keep the roles:** Sorbet is tangerine and sky, Mint teal and lemon.
  - **Dark scheme:** the field goes to deep ink-violet and the panels keep their colours.
- **FIRST VIEWPORT:**
  - **Phone:** the magenta field and the header, then one panel, the full width less 12 px.
    - Her photo is printed in cyan halftone, cropped to face and shoulders.
    - A white balloon at the panel's top left holds the statement at 28–32 px, its tail pointing at
      her.
    - A caption box straddles the panel's bottom edge with the subhead at 16 px.
    - The ink button with a white label follows and ends at 780 px or above.
  - **Desktop:** one panel spans 92% of the width and 80% of the height, and the print fills it.
    - The balloon at top left, at 56–64 px.
    - The caption box at bottom left.
    - The button inside the panel, at bottom right.
- **SIGNATURE SECTION:** The strip. Her moments run as a four-panel strip: each photo printed in
  halftone, its caption in a caption box. Panels print in one after another as they reach the middle of
  the screen. It renders `moments`.
- **MOTION GRAMMAR:** The print run.
  - Photos below the first screen print in by dot gain: the halftone dots grow from nothing to full size
    in four steps as a panel enters.
  - Balloons and buttons are pasted: scale 1.04 to 1 in 140 ms, with no overshoot.
  - Nothing fades.
  - Reduced motion: printed and pasted from the start.
- **TYPE:**
  - **Faces:** Bagel Fat One (Google Fonts) in mixed case for balloons and headings. Bricolage Grotesque
    for body, caption boxes and buttons.
  - **Scale:** the balloon statement at 28–32 px on phones and 56–64 px on desktop; body at 17 px.
- **FORM:** Seed `e7149bcc`.
  - **The roll** assigned candidate 4, pop art.
  - **Declined:** all six challengers.
  - **Raised by:**
    - the neon circuit: one keyline weight everywhere;
    - the paper menagerie: one colour reserved for what moves or is active;
    - the streaming wall: one panel speaks at a time;
    - the Merz collage: pasted, not faded;
    - the darkroom: photos print in step by step;
    - the emission-line rail: states change the line, not only the hue.
  - **Alternate:** Impeccable's pick, a die-cut sticker sheet of her photos and offers. Its risk:
    stickers are the incumbent pop's motif and a common "fun brand" look.
  - **Honest risk of the build:** pop art is the party-flyer cliché when the halftone is cheap. The dots
    must be fine, and they stay in the photos.

## 8. How we iterate

- **One work package, one agent.** A fresh context per work package keeps each agent small. The
  dispatcher (the main session) sends:
  - the spec's §5–§6;
  - the work package's task from the plan;
  - the area's `docs/wiki/` page;
  - a time budget (from the plan).

  The agent returns:
  - a short report: what changed, what it verified, and what it could not;
  - the before/after sheet path;
  - the commit sha.
- **Before and after, every time.** Each frontend work package runs `make design-shots` before it
  starts and after it ends, and puts both sheet paths in its report.
- **Plans arrive just in time.** The Phase 0–1 plan exists. The agent that starts WP-2.0, WP-2.1 to 2.6
  or WP-3.x first writes that work package's task plan with the writing-plans skill, at
  `docs/superpowers/plans/2026-10-24-site-styles-wow-<wp>.md`, links it in §7, and then executes it.
- **The board and the log are the memory.** On finishing, the agent sets its row in §7 to
  `done (<date>, <commit>)` and appends one line to §9: what changed and what it learned. Decisions
  made along the way go to §5.
- **Measure four ways:**
  - `make design-shots` sheets;
  - `make eval-sites` with the new axes (agy quota: run per gate, not per task);
  - the Impeccable detector re-run;
  - Lighthouse LCP on home for the flagships.
- **Commit and deploy.** Commit per work package (only your files; the shared checkout). Deploy at the
  gates, with the owner's Touch ID.
- **Shipped means deleted.** When the program ships, this spec and its plans are deleted, per the
  `docs/superpowers` convention.

## 9. Log (append-only)

- 2026-10-24: critique of all 21 styles. Two independent assessments plus reference research. Owner
  agreed (D1, D2). Baseline captured to `e2e/eval-shots/design/baseline-2026-10-24/` (sheets, shots,
  references, detector JSON, prototype capture scripts in `tools/`). Spec and Phase 0–1 plan written.
- 2026-10-24, WP-0.1 (9edf1bd5): `make design-shots` ports the prototype (same fold and full-page
  waits). It shoots desktop and phone concurrently: all 21 styles take about 3.3 minutes. Kinetic's
  ticker band differs between any two runs, so compare that band against this tool's own runs, not
  the sequential baseline.
- 2026-10-24, WP-0.2 (d608bd88): the showcase takes `size=real&fixture=yoga|business|family`. These
  are three composed sets under the Task 1.1 rules, with 63 distinct Pix4Less photos and one coach
  portrait per set, in the hero. Open: the yoga story photo still reads as the coach (same outfit);
  the toolbar's palette and page links drop `size` and `fixture`.
- 2026-10-24, WP-0.3 (190cb7dd): the eval has 8 axes. `rhythm` replaces
  `rhythm_whitespace`; `distinctiveness` and `protagonist` are new; the judge's 10 now matches
  award-recognised coach sites, and the best Framer, Webflow or Squarespace templates are a 7. New
  baseline, `make eval-sites STYLE=journal BRIEFS=yoga` (5 pages, judge `gemini-3.8-flash-high`),
  averages over the pages:
  - first_impression 6.6, hierarchy 7.2, rhythm 6.2, image_quality_consistency 5.6,
    copy_specificity 7.4, mobile 7.0, distinctiveness 4.8, protagonist 4.4;
  - overall 6.00 (home 7, about 6, courses 6, faq 5, contact 6): bar 8.5 not met, floor 7.5
    missed on all 5 pages;
  - `distinctiveness` is 6 on home and 4–5 on the other pages, so the axis discriminates on the
    first run. The about page's note calls it an interchangeable template, and three of five notes
    name a different stock model per slot, which is what `protagonist` (4.4) measures. One judge
    sample: re-judge before claiming a win of about one point.
  - Report (local, `e2e/eval-shots/` is git-ignored):
    `e2e/eval-shots/sites/journal-20261024-1749/report.html`.
- 2026-10-24, WP-1.1 (3a836ecc): the composer caps the home hero headline at 36 characters (inner
  pages keep 70), stops writing the hero's meta and second button, bans ", one … at a time", keeps at
  most two kickers besides the hero, and points the home hero and closing buttons at courses or
  classes. A coach with neither gets "Get in touch" → Contact, never About. Story letters are signed
  with the owner's first name (first word of `User.name`); skeleton letters stay unsigned. Open: the
  no-AI fallback still writes "Hello, I'm Kind" for a brand like "Kind Mornings"; the prompt's effect
  on a real model is first measured at Gate A.
- 2026-10-24, WP-1.1b (7204c413, c9c60462): events get a `limit` field (3, 6 or all; default all),
  honoured where the renderer picks a block's data (`limitSlice`). On home the composer sets 3 on
  courses and events, and moves a home course list off the shared `rows` layout: `rows` reads `limit`
  as a catalogue size (3 shows 6), so it stays on the courses page only. Pages stored before this keep
  their lists until recomposed. Also: an empty home button label is refilled ("Get in touch").
- 2026-10-24, WP-1.3 (4f41d9d3, c98c2412, 330f48bf): the planner briefs one person for the coach
  (`hero.image` on home, `story.image` elsewhere); every other person slot shows students or a close
  detail. The no-plan fallback briefs and four photo-slot roles in `families.json` now say the same:
  before this change they asked for the coach in four slots. Photo picking skips stock assets that
  same-niche tenants already use, and falls back to them only when nothing else fits (each slot still
  gets a distinct photo). Learned: a test that only checks "every slot is filled" passes on a page that
  repeats one photo; assert distinctness. Plans stored before this keep their old briefs until replanned.
- 2026-10-24, WP-1.2 (2fc3af85): every style manifest declares `photoTreatment` (mono 5, tint 5,
  vivid 3, soft 8); `styleVars` turns it into four `--photo-*` variables. One top-level rule in
  `globals.css` grades `[data-site-img-frame] > img[data-site-img]` and tints the frame's `::after`.
  The literal `img[data-site-img]` would also have graded the photo inside a designed cover. Per-style
  grades are gone, and so is hover-to-colour in kinetic, dojo and grid; velvet's fades moved to
  `::before`. For Gate A: kinetic keeps a 20% hero scrim for H1 contrast; grid (luminosity) and kinetic
  (multiply) keep their band duotones.
- 2026-10-24, WP-1.4 (98648091): the header holds her name, a quiet "Sign In" and one button named for
  her offer. New sites get the label from `header_cta()`; the legacy "Get Started" is relabelled at
  render. Her socials and the light/dark toggle moved to the footer, and the platform badge is quieter.
  On phones a sticky button (same label and link) appears after the first screen and hides at the
  footer. A button with nowhere to go falls back to Contact. Learned: Tailwind `max-*` variants are
  no-ops in frontend-customer (the preset defines a raw screen), so `max-sm:hidden` never hid
  anything. For Gate A: the admin "social icons in the navbar" setting is now inert.
- 2026-10-24, WP-1.5 (e9d2f4ef, 8a3c5635): detector findings on the 21 home pages fell from 512 to
  349. Undersized UI text, tiny text and bounce easing are at 0, tight leading at 1, all-caps body
  at 8 (kinetic's marquee). Low contrast is at 38, mostly the baseline's named false positives plus
  6 pixel-sampling hits. Palettes fixed in dojo, trail, studiofloor, workshop, atelier and primer.
  Every label is at least 12px. Long statements sit at line-height 1.32, the detector's 1.3 bar, above
  the 1.12 floor. One price format everywhere in the styles and the billing badge (`formatMoney`).
  Learned: the 18 `money()` copies already agreed, so the visible "$49 / 49.00 / 29 USD" mix came from
  the shared badge and grid; colour tweaks must be checked in the derived dark scheme too (trail's
  darkened ink failed AA there). Open: raw prices on public, student and admin pages outside the
  styles; caps display headings over 24 characters in the poster styles.
- 2026-10-24, WP-1.6 (84ad2fbc, 0dbe9d84, 1ff87080): costume labels are out of the nine looks the
  critique named. Gone: "ACT 01 //" and the whole studiofloor cue mechanic, "FIG.", "No. 1", the
  A1/A2/B1 tabs, terminal's window file names, `$`/`--` prefixes and dev jargon, encore's track
  captions, trail's stamps, ledger's running-head words. Prefix words fell from numerals that count
  real items. S3 fixes on the way: no heuristic "MOST POPULAR" badge, no invented "Studio Floor"
  location, no "build: passing" badges. A guard test (`costume-labels.test.ts`) bans each form. Learned:
  each costume is a family of repeats across a style's files, not a list of literals; review found the
  rest twice. Open: sprout and sanctum still show a guessed "popular" badge; terminal labels a
  location-less event "Online, live".
- 2026-10-24, WP-1.7a–c (0b8372a4 spec; b3790f86; cd167a5a, ed6fd60c, 275ed6e9; 05b45e82, 3a3e6546):
  the three batches ran in parallel (owner's call, to save time). `92-phone-first` holds every style to
  the contract; 13 of 21 failed it before. On a 390×844 phone each home hero now shows its photo (or
  manuscript's giant type), the H1 and one button. Second buttons and extra photos hide below `sm`,
  but never in the editor. Learned: the bare showcase with one 29-character headline flattered the
  heroes. Every style's short-headline "giant type" branch and the real ~60 px site header pushed
  buttons off the first screen; reviews caught it by probing headline lengths from 8 to 36 with a
  header, and the final fix wave puts both into the spec. Tablets (640–767) needed their own check:
  phone-only photo sizing that ran until `md` pushed buttons to 880–1228 px. Only each style's first
  hero variant is phone-first; the composer now pins it on home (R16).
- 2026-10-25, WP-1.8, Gate A measurements (HEAD 1b98e3cd; nothing deployed). Numbers are local and
  `e2e/eval-shots/` is git-ignored; the working files (eval tables, detector JSON, overlap
  snapshots) are in `.superpowers/sdd/2026-10-24-site-styles-wow-phase-0-1/task-1.8/`.
  - **Eval** (`make eval-sites STYLE=<id> BRIEFS=yoga,business-coaching`, 5 pages per cell, judge
    `gemini-3.8-flash-high`, one sample per page). The only baseline is WP-0.3's journal/yoga, so
    journal/yoga is the like-for-like cell. Axes in the order first_impression, hierarchy, rhythm,
    image_quality_consistency, copy_specificity, mobile, distinctiveness, protagonist, overall:
    - baseline journal/yoga: 6.6, 7.2, 6.2, 5.6, 7.4, 7.0, 4.8, 4.4, overall 6.00 (lowest page 5);
    - journal/yoga now: 6.6, 6.6, 6.2, 7.2, 7.8, 7.2, 5.2, 5.4, overall 6.20 (lowest page 6).
      Image consistency +1.6, protagonist +1.0, distinctiveness +0.4, hierarchy -0.6, the rest flat;
    - velvet/yoga: 6.4, 6.8, 5.8, 7.6, 8.4, 7.6, 5.6, 5.8, overall 6.20;
    - kinetic/yoga: 5.8, 6.4, 6.0, 4.8, 8.0, 6.2, 5.8, 4.8, overall 5.60;
    - business-coaching (niche "general"), overall: journal 5.80, velvet 5.60, kinetic 5.00; image
      consistency 5.4, 5.2 and 3.0, protagonist 4.6, 4.0 and 2.8.
    - Bar 8.5 and floor 7.5 are still missed everywhere. Distinctiveness stays at 4.4–5.8, and the
      judges' notes keep calling the pages standard or off-the-shelf templates.
    - Confounds: one judge sample per page (WP-0.3: re-judge before claiming a win of about one
      point); velvet and kinetic have no before-Phase-1 run. The scratch tenant's owner is "Site Eval", so every story letter is
      signed "Site", which the judges flag in all six runs (WP-1.1's signature rule, not a style
      defect). Kinetic's 96 "broken image" flags are its marquee's off-screen lazy copies; the
      screenshots show the photos.
    - Judge findings worth a Gate A look: the yoga home hero photo is a man on velvet and journal
      (S1 asks for the audience's gender); the contact page's hero button points at courses and the
      FAQ hero's second button has a link but no label (inner pages, not covered by WP-1.1); the
      business brief gets gym stock (thin "general" pool after peer exclusion).
  - **`92-phone-first`:** 21/21 pass at 1b98e3cd (5.2 min), under a 64 px header with headlines of
    12, 24, 26, 28, 30 and 36 characters. Tightest slack: sprout 32.1 px, tavola 32.2, terminal
    32.2, primer 35.8; every style keeps at least 32 px.
  - **Detector** (21 home pages, same URL as the baseline): 512 findings at baseline, 349 after
    WP-1.5, 355 now. Per rule, baseline then now: ai-color-palette 62 then 9; low-contrast 60 then
    38; undersized-ui-text 45 then 0; all-caps-body 24 then 8; tight-leading 22 then 1;
    tiny-text 4 then 0; bounce-easing 1 then 0; text-occlusion 3 then 2; kicker-above-heading 52
    then 51; em-dash-overuse 20 then 19; unchanged: dark-glow 59, gpt-thin-border-wide-shadow 36,
    cream-palette 21, layout-transition 21, heading-rhythm 16, gray-on-color 14, italic-serif-display
    14, image-hover-transform 12. The six findings above 349 arrived after WP-1.5 (the 1.6 and 1.7
    passes landed later): terminal's "01".."06" item counters (`numbered-section-labels`, 6, a rule that did not fire
    before), maison's 0.14em tracking on body text (`wide-tracking`, 1), dojo's 86 px H1 for the
    fixture's 51-character headline (`oversized-h1`, 1), less one kicker in journal and one dash in
    terminal. The detector's remaining 355 are mostly the baseline's named false positives
    (cream-palette, layout-transition) and studiofloor's 100.
  - **Peer overlap** (stock assets of the newest `site_eval` composition that same-niche dev
    tenants also show, by `/curated/<uuid>` and `used_assets`): yoga brief 0 of 32 (kinetic) and 0
    of 28 (journal) against maralindqvist's 33 and own_photos_check; the velvet yoga composition was
    not captured. Business brief: 0 of 28 (velvet), 1 of 26 (kinetic), 0 of 26 (journal, the newest),
    against the one tenant with data in that niche (gs-yoga-platform, 19). Bar was at most 3: met,
    but the business check is thin (one peer).
  - **Phone home length** (full-page height ÷ 844; baseline about 15 on the long fixture):
    - the long fixture is unchanged, mean 15.0 at baseline and 14.9 now, so the style code alone
      did not shorten it;
    - the real yoga fixture (composed under WP-1.1's caps) averages 11.3, range 9.1–13.2, and none
      is at 8 or below (G4 target), so the cut comes from the composer's caps, not the styles;
    - the real yoga fixture, per style: atelier 12.5, darkroom 9.1, dojo 12.9, encore 10.0, grid 9.8,
      journal 11.7, kinetic 11.1, ledger 10.8, maison 12.8, manuscript 13.2, nocturne 11.0, pop
      11.5, primer 9.3, sanctum 12.5, sprout 12.8, studiofloor 11.9, tavola 10.5, terminal 12.4, trail
      10.3, velvet 10.5, workshop 10.8;
    - the business fixture is the same within 0.6 (mean 11.1).
  - **Captures** (`index.html`, all in `e2e/eval-shots/design/`): long fixture
    `20261025-0048-gate-a/index.html`, real yoga `20261025-0051-gate-a-real/index.html`, real
    business `20261025-0054-gate-a-business/index.html`. Each has `sheets/all-21-{desktop-first-
    screens,phone-first-screens,full-home-pages,full-phone-pages}.jpg`. Baseline next to now:
    `20261025-0051-gate-a-real/sheets/pairs/pair-<style>.jpg` (21 files, long fixture) and
    `.../sheets/pair-all-21-phone-first-screens-baseline-above-gate-a-below.jpg`.
  - Learned: the phone contract holds on the real yoga fixture (all 21 first screens show the photo,
    or manuscript's type, the H1 and one button), with 9 styles photo-first, 4 with the photo behind
    the text and 8 text-first. A scratch-tenant owner named "Site Eval" skews
    every eval run (set the owner's name to the brief's before the next gate). Key the overlap
    snapshot on `used_assets`, not on page URLs: site_eval pages hold `photo_id`s.
- 2026-10-25, Gate A: the owner approved Phase 1 as built, and it was deployed from a clean worktree at
  `8f2702e1` (acemagic, then prodesk; health 200; prod files match the commit). A peer session had already
  deployed main at 22:47 the night before, before the final review fixes; this deploy carries them. Checked
  on prod: CareQueen (primer) shows the photo-first phone hero, the personal header and the sticky "Start a
  course" bar after the first screen. Existing sites keep their composed copy until recomposed: CareQueen's
  38-character headline and meta line push its button just below the first screen. Next: WP-2.0 (§8).
- 2026-10-25, WP-2.0, Gate B prepared (plan `plans/2026-10-24-site-styles-wow-2.0.md`; nothing built).
  - **Directions:** the four contracts in §7.1–§7.4 came from one Impeccable `concept-seed` roll per
    flagship in Persuade mode: kinetic `ea430533`, velvet `ff412b51`, journal `168c71ac`, pop `e7149bcc`.
    - The rolls assigned candidates 4, 7, 3 and 4 of my grounded lists.
    - Kinetic's fused Weimar-cabaret challenger beat its assignment (broadcast graphics) on both axes and
      became the build.
    - Velvet, journal and pop build their assignments, raised by the declined challengers.
  - **Comps:** static HTML first screens, because Impeccable's image generator needs `OPENAI_API_KEY`.
    - Content: the real yoga fixture, plus the business set and a 36-character statement.
    - Shot at 1440×900 and 390×844 with design-shots' fold sequence.
    - Impeccable's picks were also comped for velvet (her monogram) and journal (a magazine cover with her
      name as the nameplate).
    - Every phone button ends at 780 px or above.
    - Detector: 0 findings. Three are suppressed per file as each world's own material: journal's picture
      light, velvet's key light and velvet's foil.
  - **Review:** a fresh `impeccable-finish-reviewer` ran twice, which was the budget.
    - Round 1: kinetic fix, velvet rebuild (material), journal rebuild (composition), pop fix.
    - Round 2: kinetic, velvet and pop fix, applied with no third round. Journal rebuild, steered to the
      cover: the exhibition keeps its contract and still fails G1, while the cover clears it on every
      set (the note under 7.3).
  - **Captures** (git-ignored), in `e2e/eval-shots/design/20261025-0441-gate-b/`:
    - `index.html`;
    - `sheets/compare-gate-b-{desktop,phone}.jpg` (baseline, Gate A now, comps, award references);
    - `sheets/alternates-*`, `sheets/robustness-*`, `sheets/pairs/`.
  - **Learned:**
    - A 1-bit threshold loses a brightly lit face. A near-binary curve that sends light walls to pure
      volt keeps the face and drops the photo's frame.
    - CSS gradients don't sell a material such as velvet or card stock. Plates rendered once from SVG
      lighting filters do.
    - The comp review caught template skeletons the contract prose hid: journal's split hero and
      kinetic's photo rectangle. Judge the render, not the paragraph.

## 10. Resources

- **Galleries:**
  - Awwwards niche tag pages: [coaching](https://www.awwwards.com/websites/coaching/), `/yoga/`,
    `/wellness/`, `/fitness/`, `/chef/`;
  - [One Page Love coach tag](https://onepagelove.com/tag/coach);
  - Framer Community Gallery;
  - Webby winners;
  - Godly, Siteinspire, Land-book, Lapa Ninja, Minimal Gallery.
- **Coach templates:** Tonic Site Shop's Showit coach templates (Margarita, Paper Plane) are the
  market's best-selling line. They sell moods and complete business pages.
- **Research to quote in reviews:**
  - Lavie & Tractinsky, 2004: classical vs expressive aesthetics.
  - Lindgaard et al., 2006: first impressions in 50 ms.
  - Tuch et al., 2012: visual complexity and prototypicality in first impressions.
  - Goree et al.: web layouts homogenised after 2010.
  - Fogg et al., 2003: "design look" was the most-cited credibility factor, in 46% of comments.
- **Craft:**
  - Type: Fontshare and Velvetyne (distinctive free faces), Typewolf, Fonts In Use.
  - Motion: GSAP (free, including ScrollTrigger and SplitText), Lenis, CSS scroll-driven animations,
    the View Transitions API.
  - Books: Andy Clarke, *Art Direction for the Web*; Ellen Lupton, *Thinking with Type*; Josef
    Müller-Brockmann, *Grid Systems*.
