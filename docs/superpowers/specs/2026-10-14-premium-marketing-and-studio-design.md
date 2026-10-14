# Premium marketing site and coach studio — design

Date: 2026-10-14 · Status: approved in conversation by the owner 2026-10-14; spec awaiting the owner's review · Phase 0 done 2026-10-14 · Phase 4 done 2026-10-14 · Phase 1 done 2026-10-14 · media cache rule created 2026-10-14, live check pending Phase 5 · Phase 2 done 2026-10-14 · Phase 3 done 2026-10-14

## 1. Goal

A coach who opens `contentor.app` should feel within seconds that she is entering a premium,
professional space: a place that will make her work look better and run more smoothly. The story
leads with the craft and the tools (her site, courses, live classes, messages, the assistant);
revenue follows as the consequence, never as the headline. That feeling must continue through
signup, the dashboard and into her studio (`/admin` in `frontend-customer`).

What the owner said (2026-10-14): the current dark, teal look feels inauthentic and does not match
the business. Refactor every page, including the coach-facing admin, to be consistent and premium,
with far more imagery and some video, in the manner of apple.com: its animations, transitions,
storytelling, image quality and components.

Success looks like:

- The landing reads as a sequence of chapters, each carried by real product footage or photography,
  not by icons and gradients.
- Light paper, ink type, one warm accent; colour comes from the pictures.
- Every public page and the studio share one visual system, one typeface and one motion grammar.
- The landing stays fast: LCP under 2.5 s on the poster, CLS under 0.05, at most 8 MB of media on a
  full desktop scroll, 4 MB on a phone.
- Reduced-motion users get the same page, still.

## 2. Decisions

| # | Decision | Source |
|---|---|---|
| D1 | "Admin" means the coach-facing surfaces: the coach dashboard in `frontend-main` and the coach studio shell in `frontend-customer`. The superadmin console is untouched. | Owner, 2026-10-14 |
| D2 | The studio is re-skinned to the new visual system, not kept on the house design system. This deliberately leaves the s3Administrator house tokens for Contentor; a future session must not "restore" them. | Owner, 2026-10-14 |
| D3 | Media is real product footage recorded from the running app, plus Pix4Less photography with a person in frame and a few image-to-video loops. No stock footage of actors, no invented mockups. | Owner, 2026-10-14 |
| D4 | Light-first and monochrome. Marketing pages render light always, as apple.com does; the only dark is two cinematic chapters. The marketing theme toggle goes. The studio keeps the coach's one light/dark choice (owner, 2026-10-14, "one dark toggle for site and admin"), so the token set has a dark variant. | Owner, 2026-10-14; refined here |
| D5 | Accent is brass. One warm hue for links, the primary pill and small highlights; never a background. Apple blue was offered and declined. | Owner, 2026-10-14 |
| D6 | Geist everywhere. SF Pro cannot be licensed for the web; Geist is already installed in `frontend-main` and is the closest neighbour. The studio moves from Instrument to Geist so both apps feel like one product. Tenant sites keep their per-look fonts. | Constraint + design |
| D7 | Token names do not change. The shadcn names (`--background`, `--foreground`, `--muted`, `--primary`, `--marketing-accent`, …) keep every shared primitive working; only their values change. `--accent` stays the hover tint; `--marketing-accent` becomes brass. | Design |
| D8 | The five unused themes in `frontend-main` (matte, graphite, graphite-plus/bright, dim, midnight) are deleted. Light and dark remain. | Design |
| D9 | No new runtime dependency. framer-motion, next-themes, next-intl and geist are already installed; the motion kit is built on framer-motion, simple reveals stay CSS. | Constraint |
| D10 | The studio's 44 pages are not rewritten. They inherit the look through the shell and the shared primitives (`packages/shared/src/ui`). Only the shell, the primitives and the Overview welcome are touched. | Scope |
| D11 | Copy is rewritten in phase 2 with the copywriting and page-CRO skills, through `messages/en/marketing.json`. This spec gives each chapter a brief, not final lines. Only the English locale exists. | Scope |
| D12 | The e2e impact map, the loading/feedback conventions (`scripts/check-loading-patterns.mjs`), `<NavLink>`/`useNavigate()` and the pre-commit gate apply unchanged. | Constraint |

## 3. Findings (survey of 2026-10-14)

- `frontend-main/src/styles/globals.css` carries the house design system ported from
  s3Administrator: seven OKLCH themes plus a teal `--marketing-accent` (`oklch(0.55 0.15 195)`).
  `ThemeProvider` defaults to the system theme, so most visitors land on near-black with a teal
  headline. That is the look the owner rejects.
- The landing (`src/app/page.tsx`) is nine sections, each wrapped in `ScrollReveal`:
  hero (text + a framed wordmark), a hand-built fake studio window (`ProductMockup`), a tagline
  with five category pills, four feature cards with SVG illustrations, three stats, three steps,
  founding creators, FAQ, final CTA. No photograph or video anywhere; `public/` holds only
  `logo.svg`.
- Motion primitives exist and are sound: `ScrollReveal` (IntersectionObserver + CSS vars, expo
  ease, reduced-motion aware), `Counter`, `Parallax`, and a native `animation-timeline: view()`
  hero fade. framer-motion 12 is installed and used by the signup shell.
- Pricing (380 lines) is a three-card layout with a `Parallax` ambient layer. Blog index and post
  are plain prose pages. Login uses an "aurora + grid" `AuthShell`; signup uses a full-screen
  `SignupShell` with the same aurora. The dashboard renders `glass-pane` cards.
- The studio shell (`frontend-customer/src/components/admin/admin-shell.tsx`, refactor phases 0–3
  done 2026-10-13) is a 256 px card-coloured sidebar, a top bar with the search pill, the assistant
  button and "View site", a section tab strip, and the page. Its tokens are the same house set in
  `frontend-customer/src/styles/globals.css`, font Instrument. Its Overview page shows four lifetime
  counters; Phase 4 of the admin refactor (the Today feed) is the next planned change there.
- Both apps consume `packages/shared/src/ui/*` through one-line shims and share
  `packages/shared/tailwind-preset.ts`. That is the one place a shared visual system can live.
- Pix4Less (`../pix4less`) ships the pattern the owner liked: `HeroBackgroundVideo` (poster first,
  load on idle, pause off-screen, honours reduced motion and save-data) over mp4 motion previews
  made from stills. Its lesson: the 14.8 MB hero was the heaviest part of the page; the re-encode
  note in its `docs/cloudflare-cache-rules.md` targets 2–4 MB.
- Recording tooling exists: Playwright in `e2e/` and the headless Chromium sidecar `infra/browser`.
  Seeded demo tenants (`seed_dev_tenants`) and the twelve site-eval fixture coaches give styled
  sites to film.
- e2e coverage of `frontend-main` is signup (01), login code (11), impersonation (10) and admin
  specs; `00-smoke` does not assert landing content. Landing changes are therefore gated by a
  visual pass, not by a spec.

## 4. Approaches considered

- **A. Restyle in place.** Re-value tokens, keep every section. Cheapest, reads as a palette swap.
- **B. One shared look plus a chapter rebuild (chosen).** A shared token and motion system feeds
  both apps; the landing is rebuilt as chapters on real media; the other public pages are restyled;
  the studio is re-skinned through its shell and primitives.
- **C. Full redesign of every studio page.** Rebuilds 44 pages by hand for little gain over B.

## 5. Target design

### 5.1 Visual system

Lives in `packages/shared/src/styles/tokens.css` (new) and `packages/shared/tailwind-preset.ts`
(extended). Both apps' `globals.css` import the token sheet and delete their own token blocks.

Light tokens (marketing and studio light):

| Token | Value | Role |
|---|---|---|
| `--background` | `oklch(1 0 0)` | paper |
| `--muted` | `oklch(0.97 0.004 80)` | second paper, alternating sections, tiles |
| `--card` | `oklch(1 0 0)` | tiles on second paper |
| `--foreground` | `oklch(0.2 0.005 80)` | ink |
| `--muted-foreground` | `oklch(0.5 0.01 80)` | secondary text, 4.5:1 on both papers |
| `--border` | `oklch(0.9 0.004 80)` | hairline |
| `--primary` / `--primary-foreground` | ink / paper | the primary button |
| `--accent` / `--accent-foreground` | `oklch(0.95 0.005 80)` / ink | hover tint (unchanged role) |
| `--marketing-accent` | `oklch(0.52 0.12 65)` | brass: links, highlights, 4.5:1 on paper |
| `--marketing-accent-foreground` | paper | text on a brass fill (rare) |
| `--ring` | ink | 3 px focus ring |
| `--radius` | `0.75rem` | studio controls; media tiles use 18 px; pills use 999 px |

Dark tokens (studio dark and the landing's cinematic chapters): background `oklch(0.13 0.005 80)`,
card `oklch(0.18 0.005 80)`, muted `oklch(0.22 0.005 80)`, foreground `oklch(0.96 0.004 80)`,
muted-foreground `oklch(0.72 0.006 80)`, border `oklch(1 0 0 / 10%)`, primary paper on ink,
marketing-accent `oklch(0.78 0.11 75)`. A cinematic chapter is simply `<section class="dark">`;
`frontend-main`'s `darkMode` variant collapses to `.dark` only.

Type (Geist; preset `fontSize` entries, desktop / phone):

| Name | Size / line / tracking | Use |
|---|---|---|
| `display` | 80 / 1.05 / −0.03em (56 on phone) | hero line |
| `display-2` | 56 / 1.07 / −0.028em (40) | chapter titles |
| `title` | 40 / 1.1 / −0.02em (32) | section titles, studio welcome |
| `title-2` | 28 / 1.14 / −0.015em (24) | tile titles |
| `body-lg` | 21 / 1.4 / −0.01em (19) | chapter lead |
| `body` | 17 / 1.47 / −0.01em | prose |
| `caption` | 14 / 1.43 | captions, studio secondary |
| `eyebrow` | 12 / 1 / +0.12em uppercase | existing `.text-eyebrow` |

Layout: text column 980 px, media column 1440 px, gutter 24 px, chapter padding 120 px desktop and
72 px phone. Marketing tiles are flat on second paper with no shadow and no border; studio cards are
hairline-bordered, no shadow. Marketing buttons are pills (`rounded-full` passed at the call site);
studio buttons keep `--radius`. The ambient classes (`aurora`, `grid-fade`, `warm-gradient`,
`glass-*`, `brand-gradient`) are deleted with their last user.

### 5.2 Motion kit

Four primitives in `frontend-main/src/components/motion/`, all reduced-motion aware through
framer-motion's `MotionConfig reducedMotion="user"` plus the existing CSS guard:

- `Chapter` — section wrapper: id for the local nav, optional `dark`, eyebrow + title + lead that
  hold at the top of the chapter and scale to 0.96 and fade as the chapter leaves. Replaces the
  per-section boilerplate.
- `ScrollScrub` — a sticky stage inside a tall track (default 300 vh). `useScroll({ target })`
  gives progress 0–1; progress drives `video.currentTime` (written in a requestAnimationFrame when
  it changes by more than one frame) and caption bands, each `{ from, to, node }` fading in and out
  across its window. Scrub clips are encoded all-keyframe (`-g 1`) so seeks are instant. Reduced
  motion: poster plus the last band, static, no sticky track.
- `Reveal` — the existing `ScrollReveal`, kept as is, with a `stagger` prop for grids.
- `SnapGallery` — horizontal `scroll-snap`, arrow buttons, keyboard, `aria-roledescription=
  "carousel"`, dots. Native scrolling, no JS motion.

`MediaVideo` (in `packages/shared/src/ui/`) is Pix4Less's `HeroBackgroundVideo` generalised:
`src`, `poster`, `aspect`, `loop`, `sources` for a phone-sized encode via `<source media>`. Poster
first, load after idle or `load`, play only in view, pause off-screen, muted + `playsInline`, honours
reduced motion and `saveData`. One component serves hero, tiles and scrub stages (scrub passes
`controlled`).

### 5.3 Media pipeline

`scripts/footage/` (new):

- `record.ts` — Playwright, 1600×1000 at device scale 2, `recordVideo`, drives real flows on the
  dev stack and writes webm per flow. Flows: the setup interview answering and the look gallery
  opening; the composer building the pages (staged on a scratch tenant parked at a setup question
  with its page milestones pre-fired, so the build runs on cue); the
  studio Overview; "Describe it" drafting a course; scheduling a live class; a student on a phone
  (375×812) opening a lesson and a live class; six-second cuts of the site in four looks on
  desktop and phone. The AI steps run against the real hub once; the recordings are the artefact.
- `encode.sh` — ffmpeg: h264 CRF 23, `maxrate` 2.5 Mbit/s, `-movflags +faststart`; a webm vp9
  twin; `-g 1` only for scrub clips; a phone encode at 720 px wide; an AVIF poster from the first
  frame; a 2x AVIF still per tile. Output under `frontend-main/public/media/{clips,posters,stills}`
  plus `media.json` (path, width, height, bytes, kind).
- A vitest (`frontend-main/src/lib/__tests__/media-budget.test.ts`) reads `media.json` and fails
  if the hero clip exceeds 3 MB, any clip 2 MB, the whole folder 35 MB, or a referenced file is
  missing. That is the check that keeps the budget honest.

Photography: Pix4Less `search_images` with person-in-frame descriptions per niche (yoga, music,
dance, fitness, cooking, language, martial arts, crafts), 4:5 for look cards and 16:9 for banners,
downloaded once, stored as AVIF at 1600 and 800 px, alt text from the Pix4Less description, licence
noted in `media.json`. Four to six loops of five seconds come from the same image-to-video step that
produced the Pix4Less motion previews; if that route is manual, Veo through the existing Gemini key.

*Planning amendment (2026-10-14):* the plans settled the media list as the 44 keys the landing
consumes (Phase 2 plan, "Contracts consumed"). Twelve niches instead of eight: beauty, family,
outdoors and wellness are added. The loops are seven ≤ 4 s studio screen loops cut from the
recordings, for the chapter 4 bento. The image-to-video loops, the 16:9 banners and the studio
Overview take are not planned because no page consumes them; add them when a page does.
Every small still is exactly half the width of its full one.

Serving: `public/` through Next as today. A Cloudflare cache rule for `contentor.app/media/*`
mirrors the Pix4Less "videos" rule. Media is committed to git up to the 35 MB cap; if it churns it
moves to the Hetzner bucket and `media.json` carries absolute URLs.

### 5.4 Landing chapters

Header: 48 px, translucent paper with blur, wordmark left, four links, "Start free" as an ink
pill right. Under it on the landing an Apple-style local nav, 44 px, sticky, chapter anchors on the
left and the CTA on the right. Footer: four columns, caption type, legal line. `frontend-main`'s
`ThemeProvider` defaults to light with no system detection; the theme toggle leaves the marketing
header and the dashboard and stays only in the superadmin sidebar.

1. **Hero.** One display line and one body-lg line over a full-bleed `MediaVideo` of a finished
   coach site on desktop and phone (the four-looks cut). CTA pill. Scrolls out with the existing
   hero fade. Brief: the stage is hers; no product noun in the headline.
2. **"Say what you teach. We build the rest."** `ScrollScrub` of the interview answering, the look
   gallery sliding in, the pages composing. Three caption bands. Brief: speed without effort.
3. **"A site that looks like you."** `SnapGallery` of look cards: a 4:5 coach photograph beside the
   look's phone render, look name as caption. Twelve of the twenty looks, chosen for niche
   spread. Brief: identity, not templates.
4. **"Every tool, one calm place."** Bento grid of studio tiles (courses, live, messages, community,
   media, blog AI, logo studio): 2x still, a short loop on hover and on tap. Brief: the day's work.
5. **Dark. "An assistant that drafts. You approve."** `ScrollScrub` of "Describe it" producing a
   course outline, the review card, then Undo. Brief: control stays with her.
6. **"Your students, on every screen."** Phone footage in a device frame beside two tiles: the
   student dashboard, a live class. Brief: their experience is the product.
7. **Dark. "Then the money follows."** Three flat tiles: Stripe and memberships, payouts, her brand
   only on the receipt. Short. Brief: consequence, not promise. No invented numbers.
8. **Close.** Founding creators restyled as one paper tile; pricing teaser (three plan names and
   prices from the plans endpoint); FAQ as an accordion with the chevron rotating; final CTA on
   second paper.

### 5.5 Other public pages

- **Pricing.** Compare layout: three columns on second paper, a sticky plan-header row, prices in
  `title`, a feature table with ink checks, FAQ accordion. Data and `PricingCta` unchanged; the
  `Parallax` layer goes.
- **Blog.** Index: the newest post as a 1440 px cover with its title in `display-2`, then a
  three-column grid. Post: cover, 680 px measure, `body`, the existing progress line as a reading
  bar. The platform blog model has no cover field today (`PlatformBlogPost`), so the cover slot
  renders a tokenised placeholder (16:9 tile, initial, tag eyebrow) until a follow-up adds
  `cover_photo_url` to the model, serializer and superadmin composer; the frontend type already
  carries the optional field.
- **Login, callback.** `AuthShell` becomes a white page: a 420 px centered form; on desktop a single
  4:5 coach photograph fills the other half with the wordmark over it. No aurora, no grid.
- **Signup, verify.** `SignupShell` keeps its stages, slides and progress; backdrop becomes paper.
- **Dashboard.** Platform cards on second paper: monogram, name in `title-2`, domain, status as a
  coloured dot and word, the same actions. A live thumbnail of the site is a later step, not this.

### 5.6 Coach studio

- `frontend-customer` imports the shared token sheet; `--font-sans` becomes Geist (add the `geist`
  package there; it is already in `frontend-main`). Public tenant pages are unaffected: the tenant
  theme sheet still overrides `:root` outside `/admin`.
- Sidebar: 240 px, second paper, hairline right edge, items in `caption` weight 500 with 16 px
  icons, the active item an ink-on-paper pill, section labels as eyebrows.
- Top bar: 52 px, the search pill and the assistant button as paper pills with hairlines.
- Section tabs: a segmented control on second paper with an ink pill for the active tab.
- Primitives (`packages/shared/src/ui`): Card flat with a hairline and 16 px radius; Button heights
  unchanged, ink primary, paper outline; Input 40 px with a hairline and the 3 px ink ring; Table
  rows 48 px with hairlines only. Nothing changes in their APIs.
- Overview: a welcome header, "Good morning, {name}" in `title` over the site's look name and
  palette swatches with "View site", then the existing cards restyled. The Today feed of the admin
  refactor's Phase 4 lands in this page later; this phase only sets its frame.
- A grep in the phase's verification lists admin files still using raw colour utilities
  (`bg-white`, `text-gray-*`, `bg-slate-*`, hex); each is switched to a token.

### 5.7 Accessibility and performance

- Every chapter reads top to bottom without motion; `ScrollScrub` and `MediaVideo` degrade to the
  poster. Captions are real text, never baked into video.
- Contrast: 4.5:1 for text on both papers and in dark chapters; brass is used for text only at the
  listed value. Focus is a 3 px ink ring everywhere.
- Budgets measured with the Chrome DevTools Lighthouse tool on `http://localhost/` (desktop and
  phone): LCP ≤ 2.5 s, CLS ≤ 0.05, INP ≤ 200 ms. Media ≤ 8 MB desktop and ≤ 4 MB phone on a full
  scroll. Landing JavaScript ≤ 250 KB gzipped.

## 6. Phases

Each phase gets its own implementation plan (writing-plans) and ships on its own.

| Phase | Deliverable | Gate |
|---|---|---|
| 0 Foundations | shared token sheet and preset, dead themes removed, Geist in both apps, motion kit, `MediaVideo`, header, local nav, footer | `make typecheck`, `make lint`, `make test-frontend`, `make e2e-spec SPEC=00-smoke` |
| 1 Media | `scripts/footage/`, recordings, Pix4Less picks, loops, encodes, `media.json`, the budget test | budget test green |
| 2 Landing | the eight chapters, copy in `marketing.json`, Cloudflare media cache rule | Lighthouse budgets, reduced-motion and phone pass, axe clean |
| 3 Public pages | pricing, blog, login, signup, verify, dashboard | `make e2e-spec` for 01, 11, 25 |
| 4 Studio | tokens in `frontend-customer`, shell, primitives, Overview frame, raw-colour sweep | e2e 00, 02, 05, 25, 27 |
| 5 Ship | visual pass at 375, 1024 and 1440 in both colour schemes where they apply, `make deploy`, prod screenshots | prod verified |

Phases 0 and 1 run in parallel (one heavy job at a time on the VM: recordings and e2e never
overlap). Phase 2 needs both. Phase 4 needs 0 only. Phase 1's studio takes (studio tiles, loops, the assistant scrub, the setup and student takes) are re-recorded after Phase 4 merges and before Phase 5 deploys, so the footage shows the new studio; its coach stills and site takes need nothing after Phase 0. Phase 3 needs 0, and its login photograph
needs the `still-yoga` still from Phase 1 (the page falls back to second paper until it lands).

## 7. Verification

- Unit: the `media.json` budget test; a test for `ScrollScrub`'s band math (progress → opacity).
- `make test-changed` for each phase; `make e2e-changed` with `PLAN=1` first, since any
  `app/admin/**` path fails closed to the full suite and the listed specs are run instead.
- Lighthouse and axe through the Chrome DevTools MCP on the landing, pricing and the studio
  Overview, before and after phase 2 and phase 4.
- Visual pass with the browser pane at three widths; reduced motion toggled through DevTools
  emulation; Safari checked once on the Mac for autoplay and scrub.
- After `make deploy`: health on apex and a tenant, prod screenshots of the landing and the
  studio Overview, a cold load with DevTools showing the media cache rule hitting.

## 8. Risks

- **Media weight and repo growth.** Held by the budget test and the 35 MB cap; the bucket is the
  escape hatch.
- **Scrub jank.** All-keyframe clips are larger; they are capped at 2 MB each by shortening them,
  not by lowering the cap.
- **Safari autoplay.** Muted + `playsInline` + poster; verified once by hand.
- **The studio re-skin touching 44 pages.** Only tokens, shell and primitives change; the raw-colour
  grep catches the pages that bypass them. The font change can shift widths; the five e2e specs
  and a scroll through every section in the browser pane are the net.
- **VM budget.** Recordings, e2e and builds never run together.
- **"Exactly Apple."** Principles and grammar are copied; no Apple asset, font or copy is.

## 9. Not doing

- The superadmin console, the student portal and the tenant site styles.
- Rewriting any studio page, or the Today feed itself (admin refactor Phase 4).
- A Turkish locale, a new component library, parallax, filmed actors, dark mode on marketing.
- Live site thumbnails on the dashboard (listed as a later step).
