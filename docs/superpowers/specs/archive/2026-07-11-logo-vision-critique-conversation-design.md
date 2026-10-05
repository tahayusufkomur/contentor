# Logo Studio: Vision Self-Critique + Staged "Design with AI" Conversation — Design

**Date:** 2026-07-11
**Status:** Approved direction from product owner ("output still not how I wanted — should
look like a pro designer designed it"; "instead of batch-generating, let people talk 1-on-1
with AI"; staged creation: "first the icon, then the line, then the tagline"), designed
in-session.
**Builds on:** `2026-07-11-logo-creative-freedom-design.md` (Brand Pack v3 / prompt v5 —
element vocabulary and validation boundary kept) and
`2026-07-10-logo-brand-pack-quality-design.md` (element compiler, kept).

## Problem

Three prompt/vocabulary iterations in, AI output still falls short of "professionally
designed" on all four axes the product owner named:

1. **Amateur marks** — shapes read as primitives stuck together, not considered marks.
2. **Broken geometry** — collisions, floating elements, imbalance. Root cause: the model
   designs blind; it has never seen a single logo it produced.
3. **Bland typography/lockups** — no designed relationship between mark and wordmark.
4. **Flat color** — marks are solid flat fills; badge gradients exist but marks can't
   use them.

Separately, the batch UX (fill a brief → 8 AI designs appear) gives the coach no way to
steer; and in the tenant navbar the brand-name text duplicates the wordmark already baked
into a saved logo image, at a fixed 32px height.

**Decided quality lever (product owner):** stay vector — push the pipeline harder. Raster
image-generation remains rejected (editor contract, cost). The ceiling is acknowledged:
clean/considered flat vector, not photorealistic "cinematic" rendering.

## Design overview

Four workstreams:

1. **Vision self-critique engine** — every AI design call becomes two passes; the browser
   renders the AI's draft with the production renderer and the AI critiques its own render
   before the coach sees anything.
2. **Staged "Design with AI" conversation** — replaces the batch Brand Pack button:
   icon → name line → tagline, 1–3 candidates per turn, iterate by chat.
3. **Mark gradients + prompt v6 craft rules** — recipe v3 widens mark colors to `Fill`;
   per-design `mark_scale` proportions; typography pairing guidance.
4. **Navbar** — `logo_size` presets; brand-name text hidden by default when a logo exists.

---

## 1. Vision self-critique engine

### Who renders: the browser

The critique pass needs an image of the draft. The server does NOT grow an SVG renderer:
the client renders drafts with the exact production `LogoRenderer` + `svgToPngBlob`
(studio fonts are already loaded), so the AI critiques pixel-for-pixel what the coach
would see. No new Python deps, no server font cache, no drift.

### Two-pass flow (per conversation turn; editor refine gains the same loop)

1. **Pass A — design.** Server → Claude (structured): stage prompt + brief/transcript →
   `{message, designs[1–3]}`. Marks compile + validate through the existing
   `_validate_pack_mark` → `validate_recipe` boundary (unchanged trust boundary).
   The validated draft is cached server-side (Redis, 10 min TTL) under a random
   `turn_token`; the response returns the draft designs + token, marked `phase: "draft"`.
2. **Client render.** The studio invisibly renders each draft design to a PNG
   (~600px wide, white card; Stage 1 renders mark-only, Stages 2–3 the full lockup)
   — sub-second.
3. **Pass B — critique.** Client posts `{token, images[]}`. The server pairs the images
   with **its own cached draft** (client-returned design JSON is never trusted), and
   calls Claude with vision: "review your own work before the client sees it" plus a
   hard checklist — collisions/collapsed geometry, balance and spacing rhythm, contrast
   on a white card, favicon survivability, mark↔wordmark proportion, typography pairing.
   The model must REDRAW failing designs, not nudge them. Corrections re-validate through
   the same boundary. Response: final `{message, designs[]}`.
4. **Degradation.** Pass B provider error, or an expired/unknown token, or the dev `cli`
   provider (no reliable vision): the already-validated draft ships as final. A failed
   Pass B never costs the coach a second turn.

Editor refine adopts the same mechanics: `logo-refine` returns the `phase: "draft"` +
`token` shape, the studio renders the draft, and the shared finish endpoint (§2)
completes it — the draft cache entry records which flow (converse turn / refine)
produced it, so quota attribution stays correct.

Image inputs are size/count-capped (≤3 images, ≤500 KB each, PNG only) — they are
untrusted client bytes used only as model input, never persisted.

### core_ai additions

`structured()` today is single-turn text. Add a variant accepting a messages array whose
content blocks may include images (base64 PNG), same `(parsed, cost_usd, model)` return
and `AiError` semantics. The `cli` provider does not implement vision — callers detect
this (`core_ai.supports_vision()`) and skip Pass B.

### Quota/cost accounting

One **turn** = Pass A + Pass B, counted once against the turn quota. Both passes'
attempt costs are recorded via the existing `record_attempt_cost` (kill-switch math
unchanged). `LOGO_AI_MODEL` stays env-configurable (default `claude-sonnet-5`); trying a
stronger model for Pass A is a post-ship eval exercise, not a code change.

---

## 2. Staged "Design with AI" conversation

### UX

The Ideas step keeps the 24-tile deterministic wall. The AI banner's "Generate AI logos"
button becomes **"Design with AI"**, opening a chat panel (right-side drawer over the
wall on desktop; full-screen sheet on mobile). Progress strip in the chat header:
**Icon → Name → Tagline**.

- **Stage 1 — Icon.** Opening the chat auto-fires the first turn from the brief (the
  coach sees concepts before typing anything): 2–3 mark-only candidates as rendered
  cards, each with its rationale. Chat replies iterate ("warmer", "combine #1's shape
  with #2's feel"); tapping a card pins it and advances.
- **Stage 2 — Name line.** With the pinned mark, the AI designs the lockup: font,
  weight/tracking/case, layout, badge, color roles, `mark_scale`, optional mark
  gradient. 2–3 full-lockup candidates per turn; iterate, pin one.
- **Stage 3 — Tagline.** Optional, always skippable: proposes tagline text (or styles
  the coach's own) and finishes the composition.

Jumping back a stage is allowed; re-pinning invalidates later stages' pins. Finishing
lands in the Editor with the complete recipe + source `elements` (editor refine keeps
working). The upsell / quota-exhausted / kill-switch-disabled states render inside the
chat panel (same `deriveAiBannerState`-style state machine).

### State & API (server stays stateless)

Transcript, stage, and pinned choices live in the existing localStorage studio session
(debounced writes, 14-day window — refresh-safe). Endpoints (JWT + `IsCoachOrOwner`,
same gates as today: paid plan, monthly quota, global budget kill-switch):

- `POST /api/v1/logo-converse/` — body `{stage, brief, transcript (capped: last 12
  messages, each ≤500 chars), pinned: {mark_elements?, lockup?}, message}` →
  `{phase: "draft", token, message, designs[], turns_remaining}`.
- `POST /api/v1/logo-converse/finish/` — body `{token, images[]}` →
  `{phase: "final", message, designs[], turns_remaining}`.
- `GET /api/v1/logo-ai/status/` — extends today's brand-pack status payload with
  `turns_remaining` (keeps `refine_remaining`).

Each stage has its own focused system prompt sharing the element vocabulary +
font catalog blocks (single source, as today). Stage 1 returns a slim
`_IconDesign` (concept, elements, rationale — no lockup fields); Stages 2–3 return
the full `_Design`.

### Retirement of the batch pack

`logo_brand_pack` endpoint, `LOGO_AI_MONTHLY_PACK_LIMIT`, `STATIC_PROMPT`'s 8-design
contract, and the pack result cache retire. New setting: `LOGO_AI_MONTHLY_TURN_LIMIT`
(default 40). `composePackWall`/`packElementsByIndex` remain only so ≤14-day-old saved
studio sessions still restore; sunset them after the window naturally expires. Editor
refine keeps its separate `LOGO_AI_MONTHLY_REFINE_LIMIT` (20).

Rough per-turn cost on sonnet: Pass A ~3–6k output tokens + Pass B with ≤3 small images
≈ $0.03–0.08; 40-turn worst case ≈ $3/tenant/month, inside the $15 global kill-switch.

---

## 3. Recipe v3: mark gradients + proportion + prompt v6

### Recipe v3 (frontend `types/logo.ts`, `migrate.ts`; backend `validate_recipe`)

- `colors.mark`, `colors.mark2`, `colors.mark_accent` widen from `string` to
  `string | Fill` (the badge's existing `Fill` type: solid / linear / radial).
  `version: 3`; migrate v2→v3 is a version bump (string forms remain valid in v3).
- Renderer paints mark fills through the existing Fill-painting helper (gradient →
  `<defs>` + `url(#id)`), one gradient def per mark role. Dark-variant and brand-kit
  recolor transform both gradient stops exactly as they already do for badge fills.
  Exports (PNG/SVG) inherit this for free — they serialize the same SVG.
- Editor: the mark color control gains the same solid/gradient toggle the badge has.

### AI contract additions (`_Design`, `_RefinedDesign`)

- `mark_scale: float = 1.0` (clamped 0.6–1.8) → composed into the recipe's existing
  `elements.mark.scale` — mark↔wordmark proportion drama with no recipe change.
- `mark_gradient: {to: <palette role>, angle: float} | null = null` — when set, the
  mark role's fill becomes a linear gradient from the design's `color_roles.mark`
  color to the named role's color (`to` ∈ primary/secondary/accent/ink — never
  white). Role-based, so palette recolor and dark mode keep working. Never applied
  to `text`/`tagline`.

### Prompt v6 (shared blocks + per-stage prompts)

- Typography pairing recipes per vibe: named font + weight + tracking + case combos
  that work (e.g. tracked-out light caps for Elegant; tight heavy lowercase for Bold),
  and mark↔name proportion guidance via `mark_scale`.
- Gradient guidance: subtle 2-stop gradients within one hue family; never on text;
  flat remains the default — a gradient must earn its place.
- Banned-cliché list (generic swoosh, sparkle, globe, atom orbits, lightbulb).
- Critique bar (Pass B): "would a $5,000 studio ship this?" + the hard checklist from §1.
- `PROMPT_VERSION → 6` (busts nothing user-visible — the pack result cache retires).

---

## 4. Navbar: logo size + brand-name visibility

### Config (backend serializer + `types/tenant.ts`)

- `navbar_config.logo_size`: `"sm" | "md" | "lg" | "xl"` → logo heights 24 / 32 / 40 /
  48 px (`h-6/h-8/h-10/h-12`). Default `"md"` (today's 32px). Validated like `layout`.
  The `pill` layout renders `xl` as `lg` (a 48px logo doesn't fit the 56px capsule).
- `navbar_config.show_brand_name`: bool, default `false`.

### Display rule (`Brand` in `public-header.tsx`)

Brand-name text renders when **no logo image exists, or `show_brand_name` is true**.
With a logo present the text disappears by default (saved studio logos contain the
wordmark; showing it twice was the bug). The `<img alt>` keeps the brand name for
accessibility. The fallback `BookOpen` icon + name behavior for logo-less tenants is
unchanged.

### Admin UI (Navbar tab)

- "Logo size" preset picker (S/M/L/XL, same visual pattern as the layout picker),
  live-previewing via the existing config patch flow.
- "Show brand name next to logo" switch — rendered only when the tenant has a logo.

---

## Non-goals

- Raster/image-model generation (re-affirmed by product owner this session).
- Server-side SVG rendering (the browser renders; explicitly chosen to avoid a Python
  renderer + font cache + drift).
- Server-persisted conversations (localStorage studio session is the state store;
  revisit only if cross-device resume is ever asked for).
- Gradients on name/tagline text.
- New layouts, badge shapes, or element primitives.

## Testing

- **Backend:** converse endpoint (paid-plan gate, turn quota, kill-switch, draft-cache
  hit/expiry, Pass-B failure → draft served, image caps, stage prompt selection);
  pydantic roundtrip for `mark_scale`/`mark_gradient`; `validate_recipe` with `Fill`
  mark colors (and rejecting malformed fills); navbar serializer shaping
  (`logo_size` enum, `show_brand_name` coercion); status payload.
- **Frontend (vitest):** migrate v2→v3 (+ existing parity fixtures untouched);
  renderer gradient-def output; `darkVariant` on gradient marks; chat state machine
  (stage advance, pin/re-pin invalidation, quota/disabled states, draft→final swap);
  `Brand` visibility rules; compose mapping of `mark_scale`/`mark_gradient`.
- **E2e:** logo-studio spec updated — AI path is now the chat (mocked AI): brief →
  Design with AI → three stages → editor → save; navbar assertions for hidden brand
  name + size classes.
- **Eval harness:** a manually-run Playwright spec (excluded from `make e2e`) drives
  3–4 fixed briefs (yoga, beauty, tech, finance) through scripted conversations and
  saves candidate walls as contact-sheet screenshots to `eval-shots/` — reproducible
  before/after evidence for any prompt change. When the dev stack uses the `cli` AI
  provider, probe CLI session limits before batch runs (see memory note).
