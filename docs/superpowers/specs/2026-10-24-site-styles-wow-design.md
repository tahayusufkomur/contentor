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
| 1.3 | One protagonist, no faces shared with peers (composer photos) | 1.1b (same files) | Task 1.3 | todo |
| 1.2 | Photo treatment per style (manifest → CSS) | none | Task 1.2 | todo |
| 1.4 | Personal chrome and sticky phone CTA | none | Task 1.4 | todo |
| 1.5 | Craft floor (detector fixes, one money formatter) | 1.2 | Task 1.5 | todo |
| 1.6 | Costume labels out | 1.5 | Task 1.6 | todo |
| 1.7a | Phone-first hero, batch A | 0.2, 1.1, 1.6 | Task 1.7 | todo |
| 1.7b | Phone-first hero, batch B | 1.7a | Task 1.7 | todo |
| 1.7c | Phone-first hero, batch C | 1.7b | Task 1.7 | todo |
| 1.8 | Gate A: before/after capture, eval, owner review | all of Phase 1 | Task 1.8 | todo |
| 2.0 | Flagship directions and comps → Gate B | 1.8 | written at start | todo |
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
