# Stunning Pages — Design

**Date:** 2026-10-04 · **Status:** draft, awaiting owner review · **Owner:** Taha
**Followed by:** Spec 2, *Guided coach onboarding* (written after this one; draft decisions in the appendix).

## Goal

Every new coach site looks designed, not assembled — consistently, for every niche — and the AI that
builds it runs on the Agent Container hub's Gemini accounts.

"Consistently" is measured, not hoped for: an eval renders sites for 12 fixture coaches and a style
only reaches signups once its pages score average ≥ 8.5 and no page below 7.5, plus the owner's
sign-off on the report.

## Why

The current design system cannot amaze. The demo tenant's home page is a centred headline on a pale
gradient, then plain sections and a course grid. The catalog has ~17 block types with one layout each
(hero has 3), and "themes" are six colour presets plus one font. An AI arranging those blocks
perfectly still produces that look. The guided onboarding (Spec 2) only amazes if the pages it shows do.

## What exists today (build on it)

- **Block tree:** `TenantConfig.pages` holds `{page: {blocks: [...]}}`. The catalog is hand-mirrored in
  three places: `frontend-customer/src/lib/blocks/registry.tsx` (fields, editor UI),
  `backend/apps/tenant_config/defaults.py` + `serializers.py::_clean_block` (validation, style
  allowlist), and `backend/apps/core/copilot/blocks.py::BLOCK_SCHEMA` (the copilot's write surface).
- **Themes:** `frontend-customer/src/lib/themes.ts` — OKLCH CSS variables per palette (light/dark),
  injected by `TenantThemeStyle`; `TenantConfig.theme` + `font_family`.
- **AI:** `backend/apps/core/ai.py` — providers `anthropic` and `cli` behind `structured()` and
  `stream_text()`. Prod has no AI key today.
- **Composition:** provisioning (`apps/core/tasks.py`) builds pages with `onboarding/compose.py`, then
  `ai_compose.compose_pages` rewrites whitelisted text fields, `ai_photos.pick_photos` fills image slots
  from Pix4Less.
- **Copilot:** `apps/core/copilot/engine.py` — one `structured()` call per coach message returning
  answer | ask | actions (26 action kinds incl. add/remove/move block, edit theme/navbar, set block image,
  create course/event/post). Unmetered.
- **Pix4Less:** `apps/core/curated_images/client.py` — `search`, `search_or_browse`, `get`, copy-on-use
  download; `generate` exists but is not used by this design.
- **Agent Container hub:** `/opt/stacks/agent-container` on the home server. `POST /vendors/gemini/runs`
  → poll `GET /runs/:id`, events at `GET /runs/:id/events`. Three Gemini accounts, `HUB_MAX_CONCURRENT=3`,
  shared with Pix4Less. Runs `agy -p … --dangerously-skip-permissions` in containers that bind-mount
  the whole `~/ws`.

## Decisions (owner, 2026-10-04)

1. **Section library, not freeform AI HTML.** Consistency comes from designed layouts the AI fills, never
   from layouts the AI invents.
2. **Families own content, styles own layouts.** ~12 families × 4 styles × 1–2 variants ≈ 60 layouts.
   Switching style keeps all content.
3. **Styles are picked from researched directions.** Claude researches and proposes 6 directions; the
   owner picks 4 and their build order.
4. **Images: Pix4Less catalog search only** (no generation), at least at launch.
5. **The wizard's Theme + Font steps become one Style step.**
6. **Agent hub used as it is** — no hub code or config changes. The prompt-injection exposure this
   creates is an accepted risk with the mitigations in *Security*.
7. **Pass bar:** deterministic checks 100%, vision average ≥ 8.5, no page < 7.5, owner sign-off.
8. **Two specs:** this one first; it ships on the existing reveal screen. The guided flow is Spec 2.

## Non-goals

- The guided, no-scroll onboarding flow (Spec 2).
- Image generation (revisit only if the eval's image-consistency scores fall short).
- Restyling existing tenants. Tenants without a `style` render exactly as today.
- Any change to the Agent Container hub.
- Abuse detection / bans beyond the logging below (deferred by owner).

---

## Architecture

### 1. The section manifest — one catalog

One JSON manifest replaces the three hand-kept mirrors. Everything that needs the catalog derives from it:
the frontend registry (editor fields), backend validation, the copilot's block schema, and the
composer's prompt.

- **Source of truth:** `packages/shared/src/sections/manifest.json`.
- **Backend copy:** `backend/apps/tenant_config/sections_manifest.json` (the Django build context is
  `./backend` only). `make sections-sync` copies it; `make lint` fails when the two differ.

**Families** define content. Each family has one schema:

```jsonc
{
  "families": {
    "hero": {
      "kind": "content",                 // content | dynamic (renders tenant data)
      "aiWritable": true,                // false = AI never writes or adds it
      "fields": {
        "kicker":   { "type": "text", "max": 40 },
        "headline": { "type": "text", "max": 60, "required": true },
        "subhead":  { "type": "text", "max": 160 },
        "cta":      { "type": "link", "labelMax": 24 }
      },
      "images": [
        { "slot": "main",   "aspect": "4:5",  "role": "coach-in-action", "required": true },
        { "slot": "detail", "aspect": "1:1",  "role": "texture-or-detail" }
      ]
    }
  }
}
```

Field types: `text` (`max`), `richtext` (`max` = plain-text length; HTML sanitised by the existing
rich-text allowlist), `link` (internal destination, as `DestinationButton` enforces today), `bool`,
`select` (`options`), `items` (repeater: `min`, `max`, item `fields`), and image slots (`aspect`,
`role`). Dynamic families additionally declare their data `source` (`courses`, `plans`, `events`) and
render real tenant rows.

**Launch families (12):** `hero`, `story` (coach intro + portrait), `benefits`, `courseShowcase`
(dynamic: courses), `howItWorks`, `philosophy`, `moments` (photo strip/masonry), `pricing` (dynamic:
plans), `faq`, `cta`, `contact`, `events` (dynamic: upcoming events).

**Honesty is structural.** No family has a testimonial, stats, credential, award or press slot.
`philosophy` holds the coach's own stated beliefs drawn from their description. The existing 17 blocks
enter the manifest as legacy entries; `testimonials`, `stats`, `logos`, `gallery` and `video` keep
`aiWritable: false`, matching the copilot's current exclusions.

**Styles** define layouts and tokens:

```jsonc
{
  "styles": {
    "editorial": {
      "enabled": false,                  // flipped only after the eval report is signed off
      "label": "Editorial calm",
      "niches": ["yoga", "wellness", "art"],     // affinity, used to rank the Style step
      "tokens": { "palette": { "light": { … } }, "fonts": { "display": "…", "body": "…" },
                  "typeScale": "…", "radius": "…", "surface": "grain|hairline|shadow" },
      "rhythm": { "alternateBackgrounds": true, "maxConsecutiveImageHeavy": 1 },
      "photo":  { "words": "soft natural light, warm tones, candid, editorial" },
      "variants": { "hero": ["split", "fullBleed"], "story": ["portraitLong"], … },
      "recipes": { "home": ["hero", "story", "benefits", "courseShowcase", "philosophy", "cta"],
                   "about": [ … ] }
    }
  }
}
```

Every enabled style must provide at least one variant for every launch family (validated by the sync
check), so any page can be restyled without losing a section.

### 2. Stored block shape

New sections are ordinary blocks in `TenantConfig.pages`:

```json
{ "id": "blk_a1b2c3d4", "type": "section.hero", "variant": "editorial.split",
  "kicker": "…", "headline": "…", "subhead": "…", "cta": { … },
  "images": { "main": { "photo_id": "…" }, "detail": { "photo_id": "…" } },
  "style": { "background": "muted" } }
```

- `type` = `section.<family>`; `variant` = `<styleId>.<variantName>`. (The plan confirms no code assumes
  block types are bare identifiers; if one does, use `section_<family>` instead.)
- **Restyle mapping:** switching to style S maps each block's variant to S's variant at the same index
  within that family, else S's first variant. Content fields are untouched; image slots keep their
  photos unless the coach asks for new ones.
- Validation: `_clean_block` validates `section.*` blocks against the manifest (unknown fields dropped,
  over-length text rejected, unknown variant → the style's first variant for that family).

### 3. Rendering (frontend-customer)

- `TenantThemeStyle`: when `config.style` is set, emit the style's tokens (palette variables, font
  families, type scale, radius, surface) instead of `generateThemeCSS(theme, font_family)`.
- `BlockRenderer` resolves `section.*` blocks to
  `src/components/sections/<style>/<family>-<variant>.tsx`. Each layout is a plain React component reading
  only its family's fields and the style tokens.
- Fonts per style load the same way `font_family` loads today (the plan confirms the mechanism).
- Motion is CSS-only and `motion-safe:`-gated (repo convention).
- **Editor:** registry entries for `section.*` are generated from the manifest — content fields from the
  family schema, plus a "Layout" select listing the tenant style's variants for that family. A styled
  tenant's block palette offers its style's families plus the legacy blocks no family replaces (`video`,
  `storeProducts`); an unstyled tenant's palette is unchanged. Switching style happens server-side
  (copilot `edit_style`, §6), not in the editor.

### 4. AI provider: `agentc`

`apps/core/ai.py` gains a third provider, selected with `AI_PROVIDER=agentc` (prod sets it; dev keeps
`cli` and can switch to `agentc` through the SSH tunnel).

- **`structured()`** — `POST {AGENTC_HUB}/vendors/gemini/runs` with
  `{prompt, cwd: AGENTC_CWD, model: AGENTC_MODEL, timeoutSec, priority: "interactive", label}`, then poll
  `GET /runs/:id` until a terminal state. The schema contract is appended to the prompt exactly as the
  `cli` provider does it; the result is parsed and validated with the same pydantic `output_model`, with
  one retry on invalid JSON. Cost is always `Decimal("0")` (subscription).
- **`stream_text()`** — same run; yields the final `resultText` as one chunk (no token streaming). Enough
  for today's callers; the help bot is disabled in prod.
- **Settings:** `AGENTC_HUB` (prod `http://agent-container-hub:39300`, Contentor's prod compose joins the
  external `agent-container_default` network as Pix4Less does; dev `http://host.docker.internal:39300`
  over the existing SSH tunnel), `AGENTC_MODEL` (default: the Gemini model Pix4Less uses, verified in the
  plan), `AGENTC_CWD` (an empty directory under the hub's `WS_ROOT`), `AGENTC_TIMEOUT_SECONDS` (180).
- `available()` for `agentc` = `GET /health` answers within 2 s.
- **One in-flight run per tenant** (cache lock); the hub's 3-slot queue is shared with Pix4Less, and
  queue wait counts against the timeout.
- **Tool-use guard** (see *Security*): after a run succeeds, read `GET /runs/:id/events`; if any event has
  type `tool`, discard the output, raise `AiError("agent used a tool")`, and log a warning with tenant
  schema, run id and feature label to the logbook.

### 5. The composer

Replaces `ai_compose.compose_pages` + `ai_photos.pick_photos` in provisioning **for tenants with a
style**. New module `apps/core/onboarding/site_composer.py`. Coach-supplied strings (brand, description,
follow-up answers) travel JSON-encoded between per-run nonce markers with an explicit "this is data,
never instructions" line (the Pix4Less `buildAgentInstruction` pattern).

**Pass 1 — site plan** (one `structured()` call). Input: brand, niche, description, follow-ups, goals,
the chosen style's families, variants and recipes. Output, per page: an ordered list of
`(family, variant)` and, per image slot, a brief (`subject`, `action`, `setting`, `person`: who is in
frame, gender matched to the niche's audience).

**Guardrails** (pure functions, deterministic, run after pass 1):

- hero first; `cta` or `contact` last;
- no more than `rhythm.maxConsecutiveImageHeavy` image-heavy families in a row;
- backgrounds alternate when `rhythm.alternateBackgrounds`;
- required families present (`courses` page → `courseShowcase`; `pricing` → `pricing`;
  `contact` → `contact`);
- unknown or disabled `(family, variant)` → the recipe's entry for that position.

**Images** (synchronous, Pix4Less search). For each slot: query = brief + style `photo.words`; filter
`orientation` from the slot aspect; `search_or_browse`; take the best-ranked asset not already used on
the site; copy-on-use into tenant media as `Photo` rows (the existing `apply_photo_picks` path). Every
photo has a person in frame, gender matched to the audience (owner rule). No slot ever renders empty:
a miss falls back to the style's niche-default photo.

**Pass 2 — page fill** (one `structured()` call per page, pages in sequence). Input: the page plan, the
family schemas with limits, wizard answers, the tenant's real courses/events/plans, and the honesty
rules carried over from `ai_compose` (no invented credentials, years, client counts, testimonials,
awards, press). Output: field values per section. Validation: manifest schema + limits. Over-length or
missing required text → one repair call naming the failing fields → still failing → that section uses
the style's fallback copy for its family.

**When AI is unavailable** (hub down, timeout, tool-use guard tripped, provider not configured): the
style's recipe + niche copy pack + search images. Layouts are designed, so the fallback still looks
designed; the AI raises quality, it does not decide whether the page works.

Typical cost of one site: 1 plan call + 6 fill calls (+ repairs), ~12 searches + ~12 downloads
(≈ 24 credits ≈ $0.05).

### 6. Copilot

- `BLOCK_SCHEMA` derives from the manifest (`aiWritable` families only), so every existing action
  (add/remove/move/edit block fields) works on `section.*` blocks, with the same variant validation.
- New action **`edit_style`** — switch the tenant's style; applies the restyle mapping (§2).
- **`set_block_image`** searches with the style's `photo.words` added and excludes the current asset
  ("try another"), for any family image slot.
- The copilot runs through the same provider, so it inherits the tool-use guard.

### 7. Wizard: the Style step

- `look.theme` + `look.font` become one `look.style` step — changed in **both**
  `frontend-main/src/lib/wizard/machine.ts` and `backend/apps/core/onboarding/wizard_catalog.py`.
- It lists only `enabled` styles, ranked by niche affinity, top one marked Recommended (no AI call in the
  wizard). One enabled style → step skipped, that style applied. Zero enabled styles → the old Theme and
  Font steps stay (today's behaviour).
- Previews: one full-page screenshot per style of the showcase's sample home page, captured with
  `tools/wizard-mockups/capture.mjs` (per style, not per niche — see the capture OOM note).
- **Resume:** a coach whose `current_step` is `look.theme` or `look.font` resumes at `look.style`;
  existing `theme`/`font` answers stay valid for coaches already past those steps.
- `wizard_answers.style` → `TenantConfig.style` at provisioning.

### 8. Data model

- `TenantConfig.style` — `CharField(max_length=40, blank=True, default="")`; `""` = legacy rendering.
- No new tables. Composer state is transient (provisioning task); images are ordinary `Photo` rows.
- Migration: one tenant-app migration adding the field. Existing tenants are untouched.

---

## Quality loop

### Phase 0 — directions (owner gate before any layout is built)

Claude studies top coach/creator sites and the best Framer, Webflow, Showit and Kajabi templates, then
publishes a **Directions** page: 6 candidate styles, each with reference links, palette, font pair, a
real HTML hero mock, its photo words, and 3 Pix4Less search results for those words. The owner picks 4
and their build order.

### Showcase route

`/__showcase` in frontend-customer (dev, and superadmin in prod): every family × variant × style with
fixture content, at phone and desktop widths. The owner reviews layouts here; `capture.mjs` uses it for
Style-step previews.

### Per-layout checks (automated, CI)

A Playwright spec over the showcase, mapped in `e2e/impact-map.json`:

- renders at 375, 768, 1280 and 1536 px with **longest** and **shortest** allowed fixture content —
  no horizontal overflow, no clipped text (`scrollWidth > clientWidth` on text nodes), no broken images;
- axe: AA contrast, no critical violations.

### Eval harness (`make eval-sites`, manual — like `90-logo-eval`)

1. 12 fixture coach briefs (yoga, business coaching, language tutoring, fitness, music, painting,
   cooking, wellness, photography, dance, chess, career coaching), each assigned the style under test.
2. Each runs the real composer end to end (plan → guardrails → images → fill) on a scratch tenant.
3. Playwright screenshots every page at 1440 px and 390 px.
4. Deterministic checks: overflow, broken or empty image slots, fallback copy used, contrast. Must all
   pass.
5. Vision score: the local `agy` CLI (Gemini) judges each screenshot pair against a rubric — first
   impression, hierarchy, rhythm and whitespace, image quality and consistency across the site, copy
   specificity (not generic), mobile — returning 1–10 per criterion and an overall score.
6. Output: an HTML gallery report (screenshots + scores + the judge's notes), published for the owner.

**Pass bar per style:** deterministic 100%, overall average ≥ 8.5, no page < 7.5, owner sign-off.
Only then does the style's `enabled` flip. The eval reruns whenever prompts, layouts or photo words
change.

---

## Security

**Accepted risk (owner decision 6).** Composer and copilot prompts contain coach-controlled text, and the
hub runs Gemini with `--dangerously-skip-permissions` in containers that bind-mount the whole `~/ws`. A
prompt-injected run could read workspace files (including secrets) and return them in its output, which
Contentor would render on the coach's page, or send them over the network.

**Mitigations (no hub change):**

1. **Tool-use guard** (§4): the composer and copilot never need tools; any run whose events include a
   tool call has its output discarded and is logged against the tenant. This closes the
   "secret rendered on my page" path.
2. Coach text is JSON-encoded inside per-run nonce markers, marked as data.
3. Existing input caps stay (description 500, follow-up answers 500, copilot instruction 400 chars).
4. Output is only ever schema-validated JSON written through the manifest validator; nothing from a run
   is executed.

**Residual:** network exfiltration during a run is not prevented. Revisit with a sandboxed hub pool (no
workspace mount) before scaling signups or if the guard ever trips.

## Error handling

| Failure | Behaviour |
|---|---|
| Hub unreachable / `available()` false | Composer fallback (recipe + niche copy + search); provisioning continues |
| Run times out or is rejected | Same fallback for the affected pass; logged |
| Tool-use guard trips | Output discarded; fallback; warning in logbook with tenant + run id |
| Invalid JSON twice | `AiError`; fallback for that pass |
| Over-length text after repair | That section uses the style's fallback copy |
| Pix4Less search empty / errors / no key | Style's niche-default photo for that slot |
| Copilot run fails | Existing copilot error path ("couldn't do that — try again") |

## Testing

- **Backend (pytest):** manifest validation and sync check; `_clean_block` for `section.*`; restyle
  mapping; guardrails (pure functions, table-driven); `agentc` provider against a fake hub (success,
  timeout, rejected, invalid-then-valid JSON, tool-use guard); composer fallback paths; honesty filter;
  wizard step resume mapping.
- **Frontend (vitest):** registry generated from the manifest; variant resolution (unknown variant →
  the style's first for that family); Style step ranking.
- **Lint:** manifest copies in sync; every enabled style covers every launch family.
- **E2E:** `01-signup-onboarding` covers the Style step; new per-layout spec over the showcase.
- **Eval:** manual gate per style (above), not CI.

## Rollout (each phase shippable)

| Phase | Delivers | Gate |
|---|---|---|
| P0 | Directions page | Owner picks 4 styles + order |
| P1 | Manifest (legacy 17 blocks, zero visual change), derived registry/validation/copilot schema; `agentc` provider + tool-use guard; prod compose joins the hub network | Existing tests green; serialised pages byte-identical |
| P2 | Style 1: tokens, 12 families' layouts, showcase, per-layout checks | Layout checks green; owner reviews showcase |
| P3 | Composer (plan, guardrails, search images, fill, fallbacks) for styled tenants; copilot `edit_style` + manifest-aware edits | Unit tests; dev signup produces a styled site on the reveal screen |
| P4 | Wizard Style step (both machines + resume); eval harness; eval style 1 | Pass bar + owner sign-off → `enabled: true` → live for signups |
| P5–P7 | Styles 2, 3, 4 — layouts → eval → sign-off → enable | Pass bar per style |

## Prerequisites and open items

- **Pix4Less prod API key** is still pending (memory note). Until it lands, prod uses niche-default
  photos.
- **Gemini consumer subscriptions serving customer traffic** — owner's call, same setup Pix4Less runs.
- **Capacity:** the hub runs 3 jobs at a time, shared with Pix4Less; a site is ~7 calls of tens of
  seconds each. Fine at today's signup volume; the eval records time-to-composed-site so the number is
  known before scaling.
- Verify in the plan: the hub's Gemini model id; how `font_family` fonts load; that no code assumes bare
  block-type identifiers.

---

## Appendix — draft decisions for Spec 2 (guided onboarding)

Agreed in the same session, to be reconfirmed when Spec 2 is written:

- After provisioning the coach lands on `https://<slug>.contentor.app/setup`, a full-viewport no-scroll
  shell (step rail, page preview scrolling inside its frame, copilot chat). It is the only place they can
  go until the flow ends.
- **Chat power:** blocks + look — add/remove/reorder sections, rewrite text, swap images, change
  style/navbar; all through the copilot and the manifest validator. In guided mode actions apply
  immediately with per-turn Undo (the site is not public yet).
- **Unlimited** for every plan; abuse detection deferred.
- **No demo content:** provisioning seeds no template content, starter post or draft products; the coach
  creates their real content in the flow.
- **Draft step order:** first course → first event (if goals + plan allow) → first blog post (if goal) →
  pages (home, about, courses, pricing if plans exist, faq, contact) → payouts (if selling) → go live.
  Skipping event/blog removes that go-live requirement; course and payouts (when selling) stay required.
  Step 11 offers "publish later" as the only exit. Owner raised page quality before approving this order
  — reconfirm.
- **End the content-first A/B test:** everyone gets the classic wizard → guided flow; delete the holdout
  bucketing and `content.*` wizard steps.
- The reveal screen and `RevealChat` are deleted once the guided flow ships.
- Existing tenants are marked as having completed the flow.
