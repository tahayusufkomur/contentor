# Onboarding Wizard — pre-provision customization + AI-personalized seeding

**Date:** 2026-07-13
**Status:** Approved design, pending implementation plan
**Owner decision highlights:** pre-provision architecture (A), contextual upgrade for AI logo, AI writes pages + all copy (courses/events stay static drafts), full design-step depth (theme, font, navbar, hero, all 6 page layouts).

## 1. Summary

Replace the current 2-slide signup questionnaire with a full step-by-step customization wizard that runs **before** tenant provisioning. The user progressively designs their platform — business profile, features, look, page layouts, logo — through quick 2–3-option visual picks. On "Create my platform", provisioning consumes the answers: it wires features into navigation/modules, builds the 6 builder pages from the chosen layouts, and uses AI (shared `core_ai` provider) to write every headline and copy block in the brand's voice. The tenant that comes out of provisioning is close to launch-ready.

**Conversion thesis:** progressive investment. Each small, easy choice increases commitment; "Create my platform" is the climax that follows investment, not the cold start that precedes it.

### Goals

- Signup → wizard → provisioned tenant that already looks like *their* platform (theme, fonts, navbar, page layouts, logo, personalized copy).
- Features question actually gates pages/nav/modules (today `template_goals` is stored but never read).
- AI-personalized page copy for **all** signups (free included), with a safe static fallback.
- Capture payment at the highest-intent moment (AI logo desire) without adding a mandatory plan step.
- Resumable, measurable funnel (server-persisted state, per-step timestamps).

### Non-goals

- AI does not create/choose courses, downloads, events, or plans — those remain today's static per-niche draft seeds with `SeededObject` registry.
- No superadmin funnel dashboard yet (timestamps are stored; UI later).
- No A/B-testing framework.
- No change to the demo-tenant seeder (`seed_demo_tenant`) or the setup assistant's item logic.
- Existing `seed-from-template/` + `skip-template/` endpoints stay functional during transition (deprecated, removed later).

## 2. UX flow (approved)

Entry unchanged: signup form (brand name, your name, email) → verify email → wizard (replaces `QuestionnaireStep`). Progress rail with chapters, pre-filled ~15% after verify ("account created ✓"). Every step preselects a recommended option — Continue is always one click. Back always works; all answers editable from Review.

**Chapter 1 — Your business**
1. **Niche** — existing 8 niches, visual cards.
2. **Describe your business** — optional free text, 1–2 sentences, per-niche placeholder examples. Feeds AI copy (tagline, hero, about). Skippable without guilt.
3. **What will you offer?** — the existing 6 goals (`sell_courses`, `run_live_classes`, `in_person_events`, `sell_downloads`, `email_marketing`, `build_community`), plain-language multi-select with descriptions.

**Chapter 2 — Your look**
4. **Theme** — top 3 palettes ranked by niche (niche module's default theme first), "show all 6" expander.
5. **Font** — 2–3 pairings rendered with the user's brand name.
6. **Navbar style** — 3 of the 5 existing presets (`classic`, `centered`, `minimal`), shown as mini navbars with brand name + chosen theme.
7. **Hero style** — image-led / gradient / minimal.

**Chapter 3 — Your pages** — one pick per page key (`home`, `about`, `courses`, `pricing`, `faq`, `contact`), 2–3 mini-layout thumbnails each, rendered with chosen theme + font + brand copy snippets. Steps auto-skip when goals make them irrelevant (e.g. no paid-offering goal → skip `pricing` layout step; its page gets the default layout and is left out of the navbar).

**Chapter 4 — Your logo** — three doors:
- **Ready-made (free):** curated gallery (`GET /api/v1/logos/curated/`, already unauthenticated), ranked by niche tags, each mark composed live with brand name + theme colors.
- **Create with AI (paid):** opens contextual upgrade — plan cards + Stripe checkout inline. On return, the AI logo chat unlocks in place. No mandatory plan step for anyone else.
- **Wordmark (default):** clean text lockup from brand name + chosen font + theme color.

**Chapter 5 — Launch**
- **Review:** assembled mini-preview (logo in navbar, theme, home layout) + one editable row per choice + **Create my platform**.
- **Provisioning theater:** staged progress ("Building your space… writing your homepage… setting up draft courses…") → existing magic-link handoff.

**Cross-cutting**
- **Live preview panel:** mini browser frame (right side desktop, collapsible mobile) showing the homepage assembling as choices land. Rendered by the same lightweight mock components as option thumbnails — *not* the real block renderer.
- **"Finish the rest for me":** quiet link from Chapter 2 onward; applies recommendations to remaining design steps and jumps to the logo chapter.
- **Resume:** state saves server-side per step; reopening the wizard URL (wizard token in query/localStorage) resumes at the furthest step.
- **i18n:** all wizard strings EN + TR (frontend-main is bilingual); catalog labels localized.

## 3. Architecture

Pre-provision wizard in `frontend-main`, server-persisted state (approved option A).

```
frontend-main /signup/verify (wizard UI, mock previews)
   │  wizard token (JWT, purpose="wizard", 7d)
   ▼
/api/v1/onboarding/wizard/*  (catalog, GET/PATCH state, finalize, checkout, logo-converse)
   │ writes
   ▼
Tenant.wizard_state (public schema JSON)
   │ finalize → provision_tenant.delay()
   ▼
provision_tenant (Celery): schema → users → config-from-answers → static seed
   → AI page compose (non-fatal) → logo apply → ready
```

### 3.1 Data model

`Tenant` (public schema, `backend/apps/core/models.py`) gains one field:

- `wizard_state` — `JSONField(default=dict, blank=True)`:

```json
{
  "version": 1,
  "current_step": "look.theme",
  "answers": {
    "niche": "yoga",
    "description": "I teach vinyasa to busy professionals…",
    "goals": ["sell_courses", "build_community"],
    "theme": "forest",
    "font_family": "Inter",
    "navbar_layout": "classic",
    "hero_style": "image",
    "page_layouts": {"home": "home-classic", "about": "about-story"},
    "logo": {"mode": "curated|ai|wordmark", "curated_id": 12, "recipe": {…}}
  },
  "step_timestamps": {"niche": "2026-07-13T10:02:11Z"},
  "finished_rest_for_me": false,
  "ai_compose_status": null,
  "provisioning_stage": null
}
```

`template_niche` / `template_goals` stay: `finalize` copies `answers.niche` / `answers.goals` into them so the existing seeder, setup assistant, and curated-logo ranking keep working unmodified.

### 3.2 Wizard token

`create_signup_token` is minted with `MAGIC_LINK_EXPIRY_MINUTES` — too short for a multi-day wizard, and extending it would lengthen login links too. New token purpose in `apps/accounts/tokens.py`:

- `create_wizard_token(tenant_slug, email, region)` — JWT `purpose="wizard"`, TTL `WIZARD_TOKEN_EXPIRY_DAYS` (default 7).
- Minted and returned by `creator_signup_verify` alongside its current response; carried by the wizard in URL + localStorage.
- All new wizard endpoints authenticate with it (existing short-lived signup token also accepted during its window, for continuity). `onboarding_handoff` and `provisioning_status` accept both.

### 3.3 API surface (all under `/api/v1/onboarding/`)

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `wizard/catalog/` | GET | none (public, cacheable) | Option sets: niches, goals, themes-per-niche ranking, fonts, navbar presets, hero styles, page layouts (ids + block skeleton summaries + copy snippets), plan cards. Labels shipped in both EN and TR (client picks locale). Single source of truth for steps. |
| `wizard/` | GET | wizard token | Current `wizard_state` + `has_paid_platform_plan` + provisioning status → resume + post-checkout unlock. |
| `wizard/` | PATCH | wizard token | Merge-save `{answers: {...}, current_step}`. Every key validated against the catalog (unknown keys/values rejected). Stamps `step_timestamps`. Rejected once provisioning has started. |
| `wizard/finalize/` | POST | wizard token | Applies recommended defaults to any unanswered steps, syncs `template_niche`/`template_goals`, sets `template_seed_status="seeding"`, enqueues `provision_tenant`. Idempotent. |
| `wizard/checkout/` | POST | wizard token | `{plan_id, interval}` → Stripe Checkout Session for the platform subscription (same metadata as the in-app upgrade flow so the existing `_handle_checkout_session_completed` → `PlatformSubscription.update_or_create(tenant=…)` webhook works unchanged — tenant row already exists pre-provision). `success_url`/`cancel_url` return to the logo step. |
| `wizard/logo-converse/`, `wizard/logo-converse/finish/`, `wizard/logo-refine/` | POST | wizard token + `tenant.has_paid_platform_plan` | Pre-tenant variants of the Logo Studio AI endpoints (see 3.6). |

Existing `seed-from-template/` / `skip-template/` remain but are no longer called by the new UI.

### 3.4 Server-side option catalog + goals wiring

New module `backend/apps/core/onboarding/wizard_catalog.py` (pure data + helpers):

- **Page layouts:** per page key, 2–3 named layouts. Each layout = ordered block skeleton: required blocks, optional blocks (AI may include/omit), and per-block copy slots (field name, per-niche default text, max length). Home layout ids stay conceptually aligned with the frontend `PAGE_TEMPLATES` names ("Classic", "Storyteller") but the server catalog is canonical for the wizard. All block types ⊆ the existing whitelist in `defaults.py`; dynamic blocks (`courseGrid`, `pricingPlans`, `upcomingEvents`, `storeProducts`) only appear when the matching goal is picked.
- **Theme ranking:** niche module's CONFIG theme first + 2 curated complements per niche.
- **Fonts / navbar presets / hero styles:** wizard-exposed subsets of existing options.

New module `backend/apps/core/onboarding/compose.py`:

- `build_config_overrides(answers) -> dict` — pure function producing `TenantConfig` values: `theme`, `font_family`, `navbar_config` (layout preset + links derived from goals + CTA), `enabled_modules`, and `pages` skeletons (chosen layout, goal-gated blocks, per-niche default copy filled into slots).
- Goals matrix: `sell_courses`→ `courses`+`billing` modules + Courses nav; `run_live_classes`/`in_person_events`→ `live` + Events nav; `sell_downloads`→ `downloads` + Store nav; `email_marketing`→ `campaigns`; `build_community`→ flag for provisioning to set `CommunitySettings.is_enabled=True` in the tenant schema (the `enabled_modules` "community" entry is inert). Pricing nav link only with a paid-offering goal. About always present.
- Applied in `provision_tenant` in place of parts of `_create_default_config()` when `wizard_state.answers` exist; legacy path (no wizard answers) keeps current behavior.

### 3.5 AI page composition (during provisioning)

New `backend/apps/core/onboarding/ai_compose.py`, called from `provision_tenant` after static seeding:

- **Brief:** brand name, niche, description, goals, locale (TR region → Turkish copy, else English), and the page skeletons with copy slots (current default text + max lengths).
- **One `core_ai.structured()` call** (same pattern as `apps/blog/ai.py`) → pydantic model: per page, per block id, replacement values for whitelisted **text fields only**, plus include/omit decisions for the layout's optional blocks and item counts for list blocks (FAQ items, feature bullets). The AI cannot invent block types, pages, or fields.
- **Validation:** block types/pages/fields whitelisted, `sanitize_rich_text` / `sanitize_block_style`, length caps. Testimonial blocks keep the niche module's demo testimonials (registered as seeded/demo) — the AI does not fabricate social proof.
- **Failure policy — non-fatal:** hard time budget (~90 s), any error/timeout/AI-unavailable → keep the static skeleton copy (per-niche defaults are already decent), set `wizard_state.ai_compose_status = "ok"|"failed"|"skipped"`, continue provisioning. One compose per tenant (idempotency guard on `ai_compose_status`).
- **Cost control:** available to all signups (email-verified). New `ONBOARDING_AI_MONTHLY_BUDGET_USD` global kill-switch + usage rows following the existing per-feature usage-model pattern (like `BlogAiUsage`). Estimated cost ≈ one structured call (~$0.01–0.05) per signup.

### 3.6 Logo chapter backend

- **Curated:** wizard stores `logo.mode="curated"` + curated logo id + text-layout choice (brand name/tagline placement). During provisioning, a server-side apply copies the curated S3 object into the tenant's media prefix and writes the image-mark recipe + brand text into `TenantConfig` (server-side equivalent of today's browser-driven "Use this").
- **Wordmark:** the wizard client builds the text-lockup recipe (brand name + font + theme color) with the composer libs; server validates via `validate_logo_recipe` and stores it in `wizard_state.answers.logo.recipe`; provisioning writes it to `TenantConfig.logo_recipe` and runs the standard logo/icon export.
- **AI:** the pre-tenant endpoints reuse `logo_converse.py` / `logo_image.py` / `logo_trace.py`, refactored so the entry points take an explicit brief + a state adapter instead of reading/writing `TenantConfig` (the tenant schema doesn't exist yet). Brief inputs: brand name (Tenant), niche + description (answers), primary hex from the chosen theme via `_THEME_PRIMARY_HEX`. Quotas: existing public-schema `LogoAiUsage` keyed by tenant — already works pre-provision. Result recipe → `wizard_state.answers.logo.recipe`, applied at provisioning like the wordmark path.
- Gating for AI: `tenant.has_paid_platform_plan` (live subscription created by the pre-provision checkout webhook) + existing monthly turn/refine quotas + global budget.

### 3.7 Provisioning changes + theater

`provision_tenant` (`backend/apps/core/tasks.py`) additions, in order: config-from-answers (3.4) → static niche seed (unchanged) → AI compose (3.5) → logo apply (3.6) → `CommunitySettings` flip if flagged → mark `onboarding_completed=True`. A `provisioning_stage` value (stored in `wizard_state`) is updated at each checkpoint; `provisioning_status/` exposes it; the UI maps stages to friendly lines. Retries stay idempotent — each step guards on already-applied state.

### 3.8 Frontend (`frontend-main`)

- Wizard replaces `QuestionnaireStep` inside the `/signup/verify` state machine: `verifying → wizard(chapters) → provisioning → ready`.
- Step definitions driven by the catalog response; local step machine with optimistic PATCH-per-step (debounced), Back/Review navigation, auto-skip rules, "finish the rest for me".
- **Mock preview components** (new, small): mini navbar, mini hero, mini page thumbnails, live preview frame — styled from the real theme palettes and fonts. The pure tokens/palettes and the pure logo composer/renderer modules are shared from `frontend-customer` (one-time mirrored copy with a sync note, following the `sync-admin-kit.sh` precedent — extraction to a shared package is explicitly out of scope).
- Curated gallery: fetch `logos/curated/`, rank by niche tags client-side (port of `library-catalog.ts` ranking), compose lockups with the shared composer.
- Checkout return: `?step=logo&upgraded=1` → poll `wizard/` until `has_paid_platform_plan` (webhook lag tolerance ~10 s) → unlock AI chat.
- Mobile-first responsive; preview collapses to a bottom sheet.

## 4. Error handling

| Failure | Behavior |
|---|---|
| AI compose fails/times out/unavailable | Static per-niche copy stands; `ai_compose_status="failed"`; provisioning succeeds. |
| AI logo chat errors/quota/budget | Same reason codes as Logo Studio (`ok/upgrade_required/budget/quota/unavailable`); curated + wordmark doors always available. |
| Checkout abandoned | Return to logo step, nothing lost; free doors unaffected. |
| Webhook lag after payment | UI polls `wizard/`; after ~10 s shows "payment received, still syncing" state with retry. |
| Wizard token expired (>7 d) | Wizard shows "resume" screen → re-sends the signup email (re-mints token) via existing resend mechanics. |
| PATCH after provisioning started | 409; UI routes to provisioning screen. |
| Invalid/unknown answer values | 400 per key; catalog is the whitelist. |
| Celery provisioning failure | Existing retry/failed handling unchanged; wizard answers persist for retry. |

## 5. Testing

- **Backend unit:** wizard token purpose/TTL; PATCH whitelist validation per answer key; finalize defaults + `template_niche`/`goals` sync + idempotency; `build_config_overrides` goals matrix (parametrized over all 6 goals); catalog integrity (all blocks ∈ `defaults.py` whitelist, all pages ∈ `KNOWN_PAGE_KEYS`, every layout has required copy slots); AI compose parse→sanitize→apply with a faked provider; AI failure → fallback + status; logo apply (curated/wordmark/AI recipe paths); checkout endpoint (Stripe stubbed) + webhook attaching `PlatformSubscription` to a `provisioning_status="pending"` tenant; `CommunitySettings` flip.
- **Backend integration:** full `provision_tenant` with a complete `wizard_state` (AI mocked ok and failing) → assert resulting `TenantConfig` pages/navbar/modules/theme/logo.
- **E2E (Playwright, existing harness):** wizard happy path with AI mocked; "finish the rest for me" path; refresh-resume mid-wizard; curated logo pick; paid AI-logo path via the `BILLING_BYPASS` provider.
- **Manual:** full browser click-through (EN + TR) before deploy, per project norm.

## 6. Phasing

1. **Wizard core** — wizard token, `wizard_state` + endpoints, catalog, all steps in `frontend-main` (logo chapter shows curated/wordmark only), goals wiring, layout-skeleton seeding with static copy, replaces questionnaire. Shippable alone; description answer stored but unused.
2. **AI copywriting** — `ai_compose` in provisioning, budget/usage rows, provisioning theater stages.
3. **Logo chapter, full** — server-side curated apply at provisioning, pre-provision checkout, wizard-token AI-logo endpoints (logo_converse refactor), post-checkout unlock UX.
4. **Funnel hardening** — drop-off recovery email (re-minted wizard token), funnel timestamp surfacing in superadmin, optional IP-block reuse on wizard AI endpoints.

Phases 1→3 are the feature as approved; phase 4 is follow-up polish. Within each phase: tests-first per project norms, 2-option layout catalogs can start small (2 per page) and grow.

## 7. Compatibility notes

- Tenants created before this feature (no `wizard_state.answers`) provision exactly as today.
- Setup assistant items are computed from live state and pick up wizard results automatically (theme set, pages populated, logo present); `demo_cleanup` still applies to static seeds.
- `skipTemplate()` client helper + endpoints stay until the new wizard is verified in prod, then get removed.
