# AI Touch in Onboarding — Personalized Tenant Provisioning

**Date:** 2026-07-19
**Status:** Approved design, pre-implementation

## Goal

Use the curated asset catalogs (350 `CuratedPhoto`, 224 `CuratedLogo`) plus the
coach's wizard answers (niche, free-text description, follow-ups, goals, theme)
to make the freshly provisioned tenant feel hand-tailored instead of
generic-demo-seeded. All AI calls go through the existing `apps/core/ai.py`
provider layer — `AI_PROVIDER=cli` (Claude CLI subprocess) locally,
`AI_PROVIDER=anthropic` in prod. No new provider work.

## Non-negotiable rule

Every AI step is optional and fail-silent. Provider down, budget exhausted,
malformed/invalid ids returned, timeout — each degrades to exactly today's
behavior. Provisioning must never fail or block because of AI.

## Current state (verified)

- Wizard chapters: business → look → pages → logo → review
  (`frontend-main/src/lib/wizard/machine.ts`). Answers merge-saved into
  `Tenant.wizard_state` via `PATCH /api/v1/onboarding/wizard/state/`.
- `wizard_finalize` enqueues `provision_tenant` (`apps/core/tasks.py:178`):
  create schema → owner → `TenantConfig` → `seed_template_into_tenant`
  (niche JSON demo content, `apps/core/demo/seed_template.py`) →
  `_apply_wizard_overrides` (`tasks.py:78`) which builds pages via
  `onboarding/compose.py` and runs the existing AI copy pass
  (`_compose_pages_with_ai` → `onboarding/ai_compose.py`).
- Imagery in the seeded site flows through: `landing_sections.hero.bg_image_photo_id`,
  `about.image_photo_id` (injected by `_inject_photo_ids`,
  `seed_template.py:185`), course `thumbnail` FK, live-event cover photos.
  All ordinary tenant `Photo` rows.
- Curated photos are consumed only by the blog writer today
  (`apps/blog/curated.py` token-overlap scoring; materialization via
  `POST /api/v1/curated-photos/<pk>/use/`). Curated logos reach the wizard as a
  flat position-ordered gallery (`curated_logos/views.py:curated_catalog`).
- Feature guards that already exist and are reused as-is:
  `ONBOARDING_AI_ENABLED`, `ONBOARDING_AI_MODEL`,
  `ONBOARDING_AI_MONTHLY_BUDGET_USD` (`config/settings/base.py:318-321`).
  `prod.py` refuses `AI_PROVIDER=cli`.

## Design

### 1. Shared foundation — `apps/core/onboarding/ai_curate.py`

- **`CoachBrief`** dataclass assembled from `wizard_state`: `niche`,
  `description`, `description_followups` (Q&A pairs), `goals`, `theme`,
  `font_family`, `brand_name`, `locale`. Single source for every feature below.
- **Prefilter** — generalization of the blog writer's non-LLM token-overlap
  scoring: filter catalog rows by `kind` (photos) or all rows (logos), score
  `tags` + `title` tokens against brief tokens, return a shortlist of
  ~30–40 `(id, title, tags, kind)` tuples per slot group. Deterministic, no AI.
- **LLM pick** — one `ai.structured()` call per concern with the brief +
  shortlist metadata, strict JSON schema of ids out. Model:
  `ONBOARDING_AI_MODEL`. Budget-accounted like the existing compose pass.
- Returned ids are validated against the shortlist (hallucinated ids dropped →
  fallback for that slot).

### 2. Curated photos into pages (inside `provision_tenant`)

Runs after `seed_template_into_tenant` and after the copy pass (so AI-renamed
course titles inform photo choice), before the overlay transaction closes.

- **Slots:** hero background (`kind=hero` shortlist), about image
  (`hero`+`stock`), one thumbnail per seeded draft course (`hero`+`stock`,
  model sees course titles), live-event covers (`hero`+`stock`).
- One structured call maps slot names → curated photo ids.
- Picks are materialized as tenant `Photo` rows pointing at the shared
  `platform/curated-photos/<file>` key (same pattern as the blog `use/`
  endpoint and the curated-logo wizard path), registered via
  `register_seeded` so demo-erase still works, then written over the ids
  demo-seed injected (`bg_image_photo_id`, `image_photo_id`, course
  `thumbnail`, event covers) before `pages` are derived.
- Coach can swap any pick later in the editor — they are ordinary photos.

### 3. Smarter curated-logo ranking (wizard-time)

- Trigger: the `PATCH /wizard/state/` that completes the `business` chapter
  (description/goals present) enqueues a small Celery task keyed by tenant.
- Task: prefilter 224 logos by tag overlap → one structured call ranks the
  top ~24 → store ordered ids in `wizard_state["curated_logo_rank"]`.
- The wizard's curated-gallery fetch (wizard logo step) returns ranked ids
  first, remaining rows in today's position order. No rank present (AI off,
  task still running, task failed) → exactly today's ordering. The logo step
  itself never waits on AI.
- Re-running the business chapter re-enqueues and overwrites the rank.

### 4. Deeper copy pass (extend existing compose call)

Extend `ai_compose.compose_pages`'s output schema — same single call:

- Tenant `meta_description` (SEO, coach's locale).
- Navbar CTA label.
- Retitle + re-describe the seeded draft courses and downloads in the coach's
  voice and locale (replacing generic niche-JSON names). Applied inside the
  same overlay transaction. Renamed titles feed §2's photo call.

### 5. Blog starter post

- Seed one **draft** blog post ("welcome / my approach" style): copy generated
  from the brief in the coach's locale, illustrated with curated design
  elements (one spot illustration + one divider) chosen by the §1 matcher.
- Registered as seeded, erasable, never auto-published.

## Error handling summary

| Failure | Behavior |
|---|---|
| `ai.available()` false / `ONBOARDING_AI_ENABLED` false | All features skip; today's behavior |
| Budget exhausted | Same as disabled |
| Structured call raises / times out | Skip that feature only; log warning |
| Model returns id not in shortlist | Drop that slot → demo-seed photo stays |
| Logo-rank task not finished at logo step | Position-ordered gallery |

## Testing

- Unit tests per feature with the AI layer mocked (existing onboarding test
  pattern): brief assembly, prefilter scoring, slot validation, materialization,
  rank ordering, extended compose schema.
- One test asserting the AI-disabled provisioning path produces output
  identical to today's.
- CI/e2e run with AI off → fallback path; `make e2e` unaffected.

## Explicitly out of scope

- No schema migrations (no new columns; `wizard_state` and `pages` are JSON).
- No new settings beyond existing `ONBOARDING_AI_*`.
- No wizard preview/approval step for photo picks (invisible provisioning UX,
  decided 2026-07-19).
- No metadata enrichment backfill of `CuratedPhoto`/`CuratedLogo` (tags-based
  prefilter is sufficient for current catalog size).

## Cost estimate

Per signup in prod: photos pick + logo rank + blog post = 3 haiku-class
structured calls; the copy pass grows an existing call. Well under $0.01 per
tenant at current pricing; bounded by `ONBOARDING_AI_MONTHLY_BUDGET_USD`.
