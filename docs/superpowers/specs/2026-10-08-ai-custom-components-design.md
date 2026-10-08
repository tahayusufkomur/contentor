# AI custom components ("cx") — design

Date: 2026-10-08 · Status: approved in conversation, awaiting spec review

## Intent

When a coach asks for something the 12 section families can't express — or
the AI notices they need it — the AI builds a new section in seconds. It is
saved for that coach, renders natively at full performance (server HTML, no
iframe, no runtime code), wears whichever of the 20 site styles the coach
uses, and — once proven — joins a shared registry any coach can reuse.

**Owner's words → decisions (2026-10-08)**

| Topic | Decision |
|---|---|
| What coaches need | All three: new content shapes (itinerary, timetable, before/after…), interactive widgets (quiz, calculator, countdown…), new looks for existing families. |
| Latency | Seconds, same session. A component is **data** rendered by native code we already ship — never a deploy per request. |
| Approach | Spec-as-data on native primitives over a formal **StyleKit** contract (A). Arbitrary generated code is out. Repo code generation (C) is the *vocabulary growth loop*, not the request path. |
| Creativity | Vocabulary built by **extending existing components**: style kits, patterns modelled on the 300 hand-built variants, the variants themselves as embeddable nodes, style ornaments — plus bounded numeric knobs. "Not infinite, close enough." |
| Sharing | **Automatic after gates**; superadmin can hide/feature/quarantine. |
| Data capture | **Full integrations**: forms → inbox, leads list, waitlists, event signup, webhooks. |

## Today (what this builds on)

- **Content contract:** `packages/shared/src/sections/families.json` — 12
  families with typed field schemas; synced to
  `backend/apps/tenant_config/sections_manifest/` by `scripts/sync_sections.py`
  (`make sections-sync`, `--check` in CI). Frontend editor forms come from it
  via `toField()` in `frontend-customer/src/lib/blocks/section-defs.ts`.
- **Styles:** 20 manifests (`sections_manifest/styles/*.json`: fonts,
  palettes, radius, `photoWords`, variants per family) + React code in
  `frontend-customer/src/components/sections/<style>/` (`ui.tsx` kit, one
  component per variant, scoped CSS). 300 variants in total.
- **Blocks:** `{type: "section.<family>", variant: "<style>.<name>", …fields}`
  in `TenantConfig.pages`; `SectionBlock` → `resolveSection`;
  `clean_section_block` / `_clean_fields` shape writes; `restyle_variant`
  moves a site between styles. Active style = `TenantConfig.style` + `palette`.
- **Shared kit:** `components/sections/kit.tsx` (`Txt`, `Rich`, `Img`,
  `SmartLink`, `itemsOf`, prices) — inline editing and image fallbacks.
- **Gap:** style `ui.tsx` files mostly export the same names (`WRAP`, `H1-3`,
  `LABEL`, `NUM`, `BTN`, `BTN_GHOST`, `BTN_ON_*`, `Section`, `Kicker`,
  `Opener`, `Arrow`) by **convention only**; `grid`, `pop`, `kinetic`,
  `journal` deviate. Nothing enforces it.
- **AI:** `apps/core/ai.py` `structured()` (pydantic output, retry-once),
  `AI_PROVIDER=agentc` default. Per-feature usage models (`SiteAiUpdateUsage`
  etc.) in `apps/core/models.py`. Site AI lives in
  `apps/core/onboarding/site_ai.py`.
- **Capture today:** `POST /api/v1/contact/` → `receive_inbound` (coach
  mailbox). Email campaigns target **users only** (`CampaignRecipient.user_id`).
  No lead/contact model, no event-registration model, no Turnstile.

## 1. The vocabulary (four layers, all native code)

Everything the AI can place is a component in our codebase. The AI composes;
it never writes code, class names, CSS or HTML.

### L1 — Atoms (rendered through the StyleKit)

| Atom | Props (enums unless noted) |
|---|---|
| `Section` | `tone: base\|surface\|inverse`, `width: wrap\|narrow\|full`, `pad: sm\|md\|lg`, children |
| `Opener` | — (the style's own kicker + heading + intro; requires those fields) |
| `Kicker`, `Label`, `Badge` | `bind` |
| `Heading` | `level: 2\|3\|4`, `size: sm\|md\|lg\|display`, `bind` (no `h1` — hero owns it) |
| `Text` | `bind`, `size: sm\|md\|lg`, `muted: bool`, `measure: narrow\|normal` |
| `Rich` | `bind` (sanitized, existing `EditableBody`) |
| `Num` | `source: index\|bind`, `format: plain\|pad2\|roman` |
| `Img` | `bind`, `treatment: plain\|frame\|arch\|circle\|bleed\|polaroid`, knob `aspect` 0.5–2.5 |
| `Button` | `variant: primary\|ghost\|onInverse`, `labelBind`, `hrefBind` |
| `Link`, `Price` | `labelBind`/`hrefBind`, `bind` |
| `Icon` | `name` from a fixed allowlist (~60 lucide icons) |
| `Card` | `emphasis: none\|soft\|strong`, children |
| `Stack` | `gap: sm\|md\|lg`, `align: start\|center`, children |
| `Ornament` | `slot: divider\|badge\|sticker\|glyph`; `name` (a style's named ornament, only with `styleAffinity`) |

### L2 — Patterns (new primitives modelled on recurring shapes in the 300 variants)

| Pattern | Key props | Phase |
|---|---|---|
| `Split` | `ratio: 1/2\|5/7\|4/8\|7/5`, `mediaSide: start\|end`, `sticky: bool` | P1 |
| `Grid` | `each`, `item`, knob `cols` 1–6, `gap`, `numbering: none\|pad2\|roman\|dots`, `card` | P1 |
| `Rows` | `each`, `item`, `divider: none\|hairline\|leader`, `numbering` | P1 |
| `Timeline` | `each`, `item`, `orient: vertical\|horizontal`, `marker: num\|dot\|ornament` | P1 |
| `Steps` | `each`, `item`, `connector: line\|arrow\|none`, `numbering` | P1 |
| `Band` | `tone: inverse\|surface`, children (full-bleed colour block) | P1 |
| `Collage`, `Marquee`, `Overlap`, `Stats`, `Quote` | per catalog | P3 |

Responsive collapse rules are fixed inside each pattern (the AI never
specifies breakpoints).

### L3 — Existing layouts as nodes

`Layout {family, variant: "auto" | "<style>.<name>", bind: {familyField: specField | "$.x"}}`
renders one of the 300 hand-built variants with a synthesized block whose
fields are remapped from the component's fields. `"auto"` = the active
style's first variant for that family. The validator checks bound types
against `families.json` (text→text, items→items with compatible sub-fields).
Dynamic families (`courseShowcase`, `pricing`, `events`) embed with their
existing data source. **No refactor of existing variants** — they are used
as-is.

### Ornaments

Each style registers its decorations under semantic slots (`divider`,
`badge`, `sticker`, `glyph`, plus `media` treatments) and by name (`Enso`,
`WashiTape`, `Fleuron`, `WindowChrome`, `ZodiacRing`, `BlobImage`…). A slot
renders the active style's own ornament; a named ornament renders only when
the active style ships it and falls back to the slot otherwise.

### Knobs (continuous, bounded)

Numeric props declared with ranges in the catalog. The renderer passes them
as CSS custom properties (`style={{"--cx-cols": 5}}`) into **literal,
precompiled** classes such as `grid-cols-[repeat(var(--cx-cols),minmax(0,1fr))]`.
The server clamps values; Tailwind, CSP and theming are untouched.

### Islands (P3)

`Tabs`, `Accordion`, `Carousel`, `Countdown`, `Quiz` (answers → outcome
buckets), `Calculator` (formula as a small AST: numbers, input refs, `+ - * /
min max round` — no eval), `Reveal` (fade/rise, honours
`prefers-reduced-motion`). Each is a `next/dynamic` client chunk loaded only
on pages that use it, with server-rendered markup first.

### Growth loop

The output model includes `missing_capabilities: string[]`. When the AI can't
express an idea it lists what it lacked and degrades to the nearest valid
form. Gaps are stored (`CxGap`) and ranked for superadmin; new atoms,
patterns and ornaments ship in normal deploys. Because the prompt's catalog
is generated from `primitives.json`, the AI uses new primitives on the next
deploy with no prompt edit.

## 2. The StyleKit contract (P0)

A TS interface in `frontend-customer/src/components/sections/kit-contract.ts`;
every style's `ui.tsx` additionally exports `kit: StyleKit`, built from the
constants it already has. Existing sections keep importing their own
constants — **no visual change**.

```ts
interface StyleKit {
  id: string;
  wrap: string; narrow: string;
  display: string; h2: string; h3: string; h4: string;
  label: string; num: string; body: string; muted: string; link: string;
  button: { primary: string; ghost: string; onInverse: string };
  tone: Record<"base" | "surface" | "inverse", string>;
  card: Record<"soft" | "strong", string>;
  Section: ComponentType<{ tone?: Tone; label?: string; children: ReactNode }>;
  Kicker: ComponentType<{ children: ReactNode }>;
  Opener: ComponentType<{ block: Block; editable?: EditableContext }>;
  media?: Partial<Record<"frame" | "arch" | "circle" | "polaroid", string>>;
  ornaments?: Partial<Record<"divider" | "badge" | "sticker" | "glyph", ComponentType>>;
  named?: Record<string, ComponentType>;
  roman?: (i: number) => string;
}
```

Optional slots fall back to `DEFAULT_KIT`. `STYLE_KITS: Record<styleId,
StyleKit>` is assembled in `all-styles.ts`. `grid`, `pop`, `kinetic`,
`journal` get small adapters mapping their exports onto the interface.
`tsc` enforces completeness.

## 3. The spec (CSL v1)

```json
{
  "csl": 1,
  "name": "Retreat itinerary",
  "summary": "Day-by-day plan of a multi-day retreat",
  "target": { "kind": "new" },
  "styleAffinity": null,
  "fields": {
    "kicker":  { "type": "text", "max": 40, "label": "Kicker" },
    "heading": { "type": "text", "max": 80, "required": true, "label": "Heading" },
    "intro":   { "type": "text", "max": 220, "label": "Intro" },
    "days": { "type": "items", "min": 2, "max": 10, "label": "Days", "itemLabel": "Day",
      "fields": {
        "when":  { "type": "text", "max": 24, "label": "Day" },
        "title": { "type": "text", "max": 60, "required": true, "label": "Title" },
        "text":  { "type": "text", "max": 220, "label": "Plan" },
        "image": { "type": "image", "aspect": "3:2", "role": "a retreat scene for this day", "label": "Photo" } } }
  },
  "dynamic": null,
  "tree": { "t": "Section", "tone": "surface", "children": [
    { "t": "Opener" },
    { "t": "Timeline", "orient": "vertical", "marker": "num", "each": "days", "item": [
      { "t": "Label",   "bind": "$.when" },
      { "t": "Heading", "level": 3, "bind": "$.title" },
      { "t": "Text",    "bind": "$.text" },
      { "t": "Img",     "bind": "$.image", "treatment": "frame", "knobs": { "aspect": 1.5 } } ] } ] },
  "missing_capabilities": []
}
```

- `target`: `{kind: "new"}` (own `fields`) or `{kind: "variant", family}`
  (no own fields; binds the family's fields — a new look for an existing
  family).
- `fields` uses the `families.json` field format, so `_clean_fields` and
  `toField()` work unchanged. P3 adds `date` and `number` field types (for
  `Countdown`, `Calculator`).
- `dynamic`: `null | "courses" | "plans" | "events"` — reuses
  `fetchDynamicData`.
- Bindings: `"heading"` → block field; `"$.title"` → current item. No
  expressions.
- **Budgets:** ≤ 150 nodes, depth ≤ 8, ≤ 3 islands, ≤ 16 KB serialized.

### Source of truth

`packages/shared/src/cx/primitives.json` — every primitive: props, enum
values, knob ranges, allowed children, `island` flag, phase. Synced to the
backend by extending `scripts/sync_sections.py`. Consumers:

1. Backend pydantic validator (`apps/tenant_config/cx/spec.py`).
2. Prompt builder (catalog rendered compactly from the JSON).
3. Frontend `CX_PRIMITIVES` map — a parity test fails if any catalog entry
   lacks a component or vice versa.

### Validation rules (deterministic, `apps/tenant_config/cx/validate.py`)

1. Schema (pydantic, from the catalog).
2. Every `bind` resolves to a declared field of the right type; `$.x` only
   inside an `each`. `Opener` implies binds to `kicker`, `heading`
   (required) and `intro`.
3. Budgets above.
4. Heading levels ≥ 2 and not skipping levels.
5. Every image field has a `role`; links only via `link` fields.
6. Named ornaments only with `styleAffinity`.
7. Forms: consent field present when an email is collected for
   `lead`/`waitlist`/`webhook`; actions from the registry with valid params.
8. Variant target: `family` exists; binds only that family's fields.

On failure: one repair retry with the error list (the `core.ai` pattern).
Still failing: drop invalid nodes if a coherent tree remains (has a heading
and at least one content node), else return an error and record a `CxGap`.

## 4. Storage

**Snapshot in the block, lineage to the registry.**

- New shape: `{id, type: "cx", enabled, style, cx: {ref: "cx_7f3k@2", spec}, …content fields}`
- New look: `{id, type: "section.benefits", variant: "cx", cx: {ref, spec}, …family fields}`

The tenant's `pages` JSON is self-contained: rendering never reads the public
schema, and moderation or registry problems never break a live site. A newer
registry version reaches a site only when the coach picks "Update".

Write path (`_clean_block` gains a `cx` branch):

1. Validate `cx.spec` on **every write** (trust boundary — a hand-crafted
   PATCH can only produce what the AI could).
2. Shape content fields with `_clean_fields(spec.fields)` (or the family's
   fields for variants).
3. `restyle_variant` passes `variant: "cx"` through untouched.
4. `ref` is kept as-is (lineage only; never trusted for rendering).

## 5. Rendering and editing

- `BlockRenderer` routes `type: "cx"`, and `section.*` with `variant: "cx"`,
  to `SpecRenderer` (`frontend-customer/src/components/cx/spec-renderer.tsx`).
- `SpecRenderer {spec, block, data, editable, styleId}` — a **synchronous
  server component** walking the tree: `CX_PRIMITIVES[node.t](node, ctx)`
  with `ctx.kit = STYLE_KITS[styleId] ?? DEFAULT_KIT`. Unknown node types
  render nothing (forward compatibility, like unknown block types today).
- Output is plain SSR HTML with literal classes — the same cost as a
  hand-built section. A page without islands ships **zero extra JS**.
- Top-level text/rich/image fields render via `Txt`/`Rich`/`Img` → inline
  editing on the canvas works. Item fields edit in the sidebar repeater (same
  as today's sections). The form comes from `spec.fields` via `toField()`.
- Per-block style overrides, hide/show, drag, duplicate, undo/redo: unchanged
  (to the editor it is a block).

## 6. Generation

### Triggers

1. **Explicit:** a "Describe a section" tile in the editor palette (type or
   dictate).
2. **When needed:** Site AI (`site_ai.py`) gains a `create_component` action
   it chooses when no family fits the request (P5). The onboarding
   interviewer may propose one when the brief names an offer no family
   covers (P5).

### Compose — `POST /api/v1/admin/cx/compose/ {prompt, page, position}`

1. **Registry first.** Postgres full-text search over `name`, `summary`,
   `tags` of shared/featured components plus the tenant's own (top 20,
   niche-boosted). Their summaries go into the prompt; the AI either answers
   `{reuse: "<id>@<n>"}` + content for this coach, or a new spec + content.
   (P1 searches only the tenant's own components; P2 adds the library.)
2. **Generate** with `core.ai.structured()`. System prompt: rules, the
   generated catalog, 3 exemplar specs, the active style (id, mood, tones),
   the coach brief from `wizard_state.answers` (never invent credentials,
   testimonials or numbers — same rule as the story family).
3. **Validate** (§3) with one repair retry.
4. **Fill images** the way `site_composer` fills family images (`role` +
   the style's `photoWords`, library or Pix4Less).
5. **Persist** a `CxComponent` (private) + `CxVersion`, return the block.
   The editor store `insertBlock`s it; a "Designing…" placeholder block
   shows meanwhile.

Target ≤ 20 s on `agentc`. The request runs synchronously inside the
gunicorn timeout; if measured p95 exceeds 60 s, move to celery + polling
(the Logo Studio lesson about Cloudflare's ~100 s cap).

### Refine — `POST /api/v1/admin/cx/refine/ {block_id, page, instruction}`

Current spec + content + instruction → new spec (same output model) → new
private `CxVersion`. Content is kept for every field key that survives.

## 7. Registry (public schema, models in `apps/core/models.py` beside `CuratedLogo`)

**`CxComponent`**: `id` (`cx_` + 8 chars), `name`, `summary`, `tags`,
`niches`, `target_kind`, `family` (nullable), `author_tenant_schema`
(nullable = platform), `visibility` (`private | shared | featured | hidden`),
`keep_private` (coach toggle), `adopters` (distinct tenants), `first_live_at`,
timestamps.

**`CxVersion`**: `component` FK, `n`, `spec` (**immutable** once created),
`structural_hash` (tree with binds normalized), `example_content` (neutral,
AI-written), `checks` (gate results JSON), `created_at`.

Palette shows **My components** (P1) and **Library** (P2: shared + featured,
ranked for the coach's niche, previewed with the coach's own style).

### Auto-share gates (P2, daily celery sweep; all must pass)

1. **Renders everywhere:** `example_content` server-renders without error in
   all 20 styles × light/dark × every tone, via a secret-guarded internal
   Next route `/api/internal/cx-check` (same code as the vitest render test).
2. **Proven:** enabled on the author's published site ≥ 7 days and not
   removed.
3. **Clean:** PII scan of spec and `example_content` — emails, phones, URLs,
   brand, coach and place names from the brief.
4. **Not a duplicate:** `structural_hash` matches no shared component (a
   match increments that component's `adopters` instead).
5. **Paid author, not `keep_private`.** Terms state that component
   *structure* (never content) may be shared.

### Moderation (P2, adminkit)

Gallery of live previews (same `SpecRenderer`), hide / feature / quarantine,
adoption counts, and the ranked **Gaps** view (`CxGap`: missing capability,
count, niches, last prompt excerpt — superadmin only). Quarantine stops new
adoption; existing tenant snapshots keep rendering. A
`replace_cx_component` management command covers the rare security case.

### Cost

`CxAiUsage` (same contract as `SiteAiUpdateUsage`: tenant × month,
`compositions_used` on success, `usd_spent` on every attempt, global
kill-switch). Library reuse is free and unlimited; compose/refine are
monthly-quota'd on paid plans.

## 8. Forms and integrations (P4)

`Form` primitive: server-rendered markup + a small island for validation and
submit state. Field kinds: `text, email, phone, textarea, select, choice,
date, number, consent`. `Quiz` may chain into a Form ("email me my result").

The Form declares ordered `actions` from a backend **action registry**
(`apps/tenant_config/cx/actions.py`), each with a param schema:

| Action | Does | Status |
|---|---|---|
| `inbox` | Message into the coach mailbox; always runs first so nothing is lost | exists (`receive_inbound`) |
| `notify_coach` | Push/email ping | exists (notifications) |
| `show_result` / `go_to` | Thank-you, quiz result, or a destination chosen with the existing destination picker | frontend only |
| `lead` | Upsert into the coach's contacts: consent text + timestamp stored, double opt-in email, `EmailOptOut` honoured, tags | **new** tenant app `apps/leads` (`Lead` model, admin Contacts page, "Leads (confirmed)" campaign audience — `CampaignRecipient` gains nullable `lead_id`) |
| `waitlist` | Lead + a course/event target (picker, never an id); notified on launch / free spot | new, on `lead` |
| `register_event` | Free-event signup | new (no registration model today) |
| `webhook` | POST to the coach's https URL (Zapier/Make), from celery, SSRF-guarded | new, last |

**Submit — `POST /api/v1/cx/submit/ {block_id, page, form_id, values}`**: the
server reloads the block from `TenantConfig.pages`, resolves the spec and
Form node, validates `values` against the declared fields, then runs actions
in order, each isolated. **Action config is never read from the client.**
Protection: honeypot + `AnonRateThrottle` (as `contact_submit`) **plus
Cloudflare Turnstile**. GDPR: consent is enforced by the validator, a
privacy link is appended automatically, and leads can be exported or deleted.

Coach-facing: the block shows a plain-language receipt ("Answers go to your
inbox · People join your *Bali retreat* waitlist"); targets change via
pickers.

## 9. Phases (each gets its own implementation plan)

| Phase | Ships | Coach sees |
|---|---|---|
| **P0 StyleKit** | `kit-contract.ts`, `kit` export in all 20 styles (4 adapters), `STYLE_KITS`, `DEFAULT_KIT` | nothing |
| **P1 Core** | `primitives.json` + sync, atoms, 6 patterns, `Layout` embed, ornament slots, knobs, `SpecRenderer`, validator, `cx` block type, compose + refine (own components only), `CxComponent`/`CxVersion` (private), `CxAiUsage`, palette tile + My components | describe a section → on the canvas in seconds |
| **P2 Registry** | Library in palette, registry-first compose, variant target (new looks), gates sweep + `cx-check` route, moderation + Gaps | library of proven components; new looks |
| **P3 Interactivity** | islands, remaining patterns, `date`/`number` fields | interactive widgets |
| **P4 Forms** | Form + submit with `inbox`/`notify_coach`/`show_result`/`go_to` + Turnstile → `apps/leads` + double opt-in + campaign audience → `waitlist` → `register_event` → `webhook` | lead capture, waitlists, signups |
| **P5 Proactive** | Site AI `create_component`, interviewer proposals, gap-driven primitives | the AI suggests components when needed |

**Before P1 ships:** an eval wall — 20 real coach prompts × 4 contrasting
styles, reviewed by the owner — to tune the prompt and exemplars.

## 10. Testing

- **pytest:** validator golden specs (valid / invalid / degrade / over
  budget); `_clean_block` `cx` branch; `restyle_variant` passthrough; compose
  and refine with `core.ai` mocked (`config/settings/test.py` already pins the
  provider); gates sweep; PII scan; submit (honeypot, throttle, server-side
  action resolution, client-sent actions ignored).
- **Parity:** `primitives.json` ↔ `CX_PRIMITIVES` (vitest) and ↔ pydantic
  models (pytest); `sync_sections.py --check` covers the copy.
- **vitest** (`.ts` per repo convention): `renderToString` of fixture specs ×
  all `STYLE_KITS` — the same function the `cx-check` gate calls.
- **Playwright e2e:** describe → block on canvas → publish → public HTML
  contains it; Form → inbox message.
- **Performance:** a page with `cx` blocks and no islands ships no extra JS
  versus native sections (compare build output / Lighthouse).

## Non-goals

- Arbitrary generated code, HTML, CSS or class names in specs — ever.
- Refactoring the 300 existing variants into patterns (embedded as-is).
- Sharing coach *content* across tenants (structure only).
- Paid component marketplace or author credit.

## Risks

- **Generic-looking output.** Mitigated by L3 embedding of hand-built
  layouts, style kits and ornaments, exemplars, and the pre-P1 eval wall.
- **`renderToString` in a Next route handler** for the `cx-check` gate is
  unproven here — spike it at the start of P2; fallback is running the same
  render function in a node script invoked by celery.
- **CSL evolution.** `csl` version field; the renderer keeps old versions or a
  migration function upgrades snapshots on read.
- **Concurrent agents in the shared tree** touch `registry.tsx`,
  `section-defs.ts`, `sections.py` — check `git status` before each phase.

## Open items (owner)

- Quota numbers for compose/refine per paid plan; whether free tier gets a
  taste (e.g. 1 composition) or library-only.
- The "live ≥ 7 days" gate threshold.
