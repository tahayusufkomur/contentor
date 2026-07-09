# AI Blog System — Design

**Date:** 2026-07-09
**Status:** Draft for review
**Scope:** Coach-facing AI blog (tenant sites) + platform blog on contentor.app (superadmin-managed)

## 1. Summary

An AI-supported blog system with two deployments of one engine:

1. **Coach blog** — every coach site gets a public `/blog`. Manual writing is free for all coaches. AI generation is a paid perk: **Starter 5, Pro 30 AI generations per month** (Free: 0, upsell like Brand Pack). Coaches either describe what they want ("guided" mode) or enable **Autopilot**, which picks a topic and writes on a schedule.
2. **Platform blog** — a public `/blog` on contentor.app for platform SEO, managed from the superadmin panel with the same AI engine, no per-month quota (global USD budget kill-switch only).

Token efficiency is a first-class requirement (see §5): one Claude call per post, cached static prompt, batched topic ideation on a cheap model, bounded output, durable USD metering with kill-switches. Estimated marginal cost: **~$0.03 per post** (30-post Pro month ≈ $1).

## 2. Decisions (confirmed with product owner)

| Decision | Choice |
|---|---|
| Quota semantics | Each AI generation (incl. full regenerate) = 1 credit. Manual edits free. Failures don't consume credits (but their USD cost is recorded). |
| Free tier | Blog feature (manual write/publish) available to **all** coaches. AI generation paid-only; Free sees `upgrade_required` upsell. |
| Autopilot publish behavior | Per-schedule coach choice: **Review first** (default — draft + notification) or **Auto-publish**. |
| Superadmin scope | Public SEO blog on contentor.app, managed in superadmin panel. No quota; global budget kill-switch applies. |
| Local dev AI backend | Local/testing uses the **Claude CLI** (owner's Claude subscription, no API spend); prod uses the Anthropic API with a key the owner provides. Selected by `BLOG_AI_PROVIDER`. |

## 3. Approaches considered

- **A. Dedicated blog app mirroring Brand Pack + recurring-announcements patterns (chosen).** New `apps/blog` tenant app; shared platform models beside `LogoAiUsage` in `apps/core`; sync single-call generation like `logo_ai.py`; Autopilot scheduling copied from `RecurringAnnouncement`/`recurrence.py`. Lowest-risk, every pattern already proven in this codebase.
- **B. Posts as website-builder pages in `TenantConfig.pages` JSON.** No migrations, reuses builder UI — rejected: no listing/pagination, no per-post URL/SEO metadata, unbounded JSON blob, no clean public API.
- **C. Async multi-step pipeline (outline → draft → polish, Celery + polling).** Higher quality ceiling — rejected for v1: 2–3× tokens per post (contradicts the token-efficiency directive), more moving parts. Sync single-call matches Brand Pack; Autopilot already runs in Celery anyway.

## 4. Data model

### Tenant schema — new app `apps/blog` (TENANT_APPS)

**`BlogPost`**
- `title`, `slug` (unique, auto from title, editable under "Advanced"), `status` (`draft`/`published`)
- `body_html` (TextField, sanitized HTML — same convention as `Announcement.body`)
- `excerpt` (listing teaser), `meta_description` (SEO), `tags` (JSON list of strings)
- `cover_image` (nullable; reuses existing media upload/presign flow — UI optional in v1)
- `source` (`manual` / `ai` / `autopilot`), `ai_model` (nullable, for audit)
- `created_by` (FK user, nullable — autopilot posts have none), `published_at`, `created_at`, `updated_at`

**`BlogTopicIdea`** — the topic queue that makes auto-topic-selection nearly free (§5)
- `title`, `angle` (one-line description), `status` (`available` / `used` / `dismissed`), `batch_id`, `created_at`

**`BlogAutopilot`** — singleton per tenant, fields mirroring `RecurringAnnouncement`
- `is_enabled`, `frequency` (`weekly`/`monthly` in v1 — the values `recurrence.next_occurrence()` already supports), `weekday`, `day_of_month`, `generate_time`
- `auto_publish` (bool, default False = review first), `next_run_at`
- Next-fire computed with the existing `apps/notifications/recurrence.next_occurrence()` honoring tenant timezone.

### Public schema — in `apps/core` (precedent: `LogoAiUsage`, `PlatformPlan`)

**`BlogAiUsage`** — durable monthly meter, unique `(tenant_schema, month)`
- `tenant_schema`, `month` ("YYYY-MM"), `generations_used`, `usd_spent`
- Two-tier accounting copied from `LogoAiUsage`: `record_attempt_cost()` charges USD on **every** attempt (feeds the global kill-switch); `record_successful_generation()` increments the quota only on success. Platform-blog generations record under `tenant_schema="public"` (USD only, no quota check).

**`PlatformBlogPost`** — same content fields as `BlogPost` (no autopilot/queue in v1; superadmin generates on demand).

**`PlatformPlan.max_ai_blog_posts`** — new int field; `seed_plans.py`: Free 0, starter 5, pro 30. Plan-differentiated limits belong on the plan row (unlike Brand Pack's flat setting).

## 5. AI engine & token efficiency (`apps/blog/ai.py`)

The engine is shared by coach generation, Autopilot, and platform-blog generation.

1. **One call per post.** Single `client.messages.parse(...)` with a Pydantic output model — `_BlogDraft {title, slug, meta_description, excerpt, tags[], sections[{heading, body_markdown}]}`. No outline/draft/polish chains. Full regenerate = a new single call = 1 credit.
2. **Prompt caching.** Static system prompt (writing rules, structure, tone guidance, output contract) sent with `cache_control: {"type": "ephemeral"}`; `PROMPT_VERSION` constant. Only the small per-request user message varies.
3. **Compact context, never page dumps.** The user message is a ~200-token brand brief assembled from existing data: brand name, niche, `TenantConfig.meta_description`, top course titles, language/locale, plus the topic and optional coach instructions. Existing post **titles** (not bodies) are included for dedup.
4. **Batched topic ideation on a cheap model.** "Auto choose the right topic" never costs a per-decision LLM call. One Haiku call generates 12 topic ideas (title + angle) → stored as `BlogTopicIdea` rows. Guided mode shows them as suggestions; Autopilot pops the oldest `available` one. Refill only when the queue drops below 3. A coach typing their own topic costs zero extra tokens.
5. **Bounded output.** `max_tokens≈3000`, target 800–1200 words. Model emits **markdown sections**, not HTML (HTML tags are ~30% token overhead); a deterministic converter renders sections → HTML → `sanitize_rich_text()` → `body_html`. Result is TipTap-editable.
6. **Models & settings** (`config/settings/base.py`, beside the `LOGO_AI_*` block):
   - `BLOG_AI_MODEL` default `claude-sonnet-5` (public SEO content — quality matters)
   - `BLOG_AI_TOPIC_MODEL` default `claude-haiku-4-5-20251001`
   - `BLOG_AI_MONTHLY_BUDGET_USD` global kill-switch (default 30), `BLOG_AI_ENABLED` feature flag
   - `BLOG_AI_PROVIDER` — `"api"` (default) or `"claude_cli"` (see below)
   - Reuses `ANTHROPIC_API_KEY`, the `_MODEL_PRICES`/cost-estimate helpers (extract the shared bits from `logo_ai.py` into a small common module rather than duplicating).

### Provider abstraction — Anthropic API (prod) vs Claude CLI (local dev)

The engine never calls Anthropic directly; it calls a provider interface with one method: `generate(system_prompt, user_prompt, model, max_tokens) → (validated pydantic object, usage/cost info)`. Two implementations, selected by `BLOG_AI_PROVIDER`:

- **`AnthropicApiProvider`** (prod, default) — the `client.messages.parse(...)` path described above, keyed by `ANTHROPIC_API_KEY` (owner provides for prod). Prompt caching applies here.
- **`ClaudeCliProvider`** (local dev/testing, runs on the owner's Claude subscription — zero API spend):
  - Subprocess: `claude -p <user_prompt> --system-prompt <system> --model <model> --output-format json --max-turns 1` with tools disallowed; parse the JSON envelope's `result` field.
  - Structured output: since the CLI has no `messages.parse`, the system prompt instructs JSON-only output matching the same schema; the result is validated with the **same Pydantic models** (one retry on validation failure). Both providers therefore return identical objects — the rest of the engine is provider-agnostic.
  - **Auth inside Docker:** macOS keychain creds don't reach containers, so use a long-lived subscription token: run `claude setup-token` once on the host → put the resulting token in local `.env` as `CLAUDE_CODE_OAUTH_TOKEN`. The dev backend image (dev target only, never prod) adds Node 20 + `@anthropic-ai/claude-code`.
  - Usage rows are still written (usd from the CLI envelope's `total_cost_usd` if present, else 0) so quota/kill-switch logic is exercised realistically in dev.
  - Subprocess timeout 120s; provider raises typed errors mapped to the same `reason` codes.
  - Local `.env` example: `BLOG_AI_PROVIDER=claude_cli`, `CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat…`. Prod `.env.prod`: `BLOG_AI_PROVIDER=api`, `ANTHROPIC_API_KEY=…`.
  - The provider layer lives in the shared AI module (beside the extracted price/cost helpers) so `logo_ai.py` can adopt it later — migrating Brand Pack is out of scope here.
  - Guard: `ai/status/` reports `enabled: false` when the selected provider is missing its credential (no key for `api`, no token/binary for `claude_cli`).
7. **Cost math.** Per post ≈ 1.5k input (mostly cache-hit) + ~1.8k output on Sonnet ≈ **$0.03**. Topic batch on Haiku < $0.01. Pro worst case (30 posts + refills) ≈ **$1/month** against a $49.90 plan.
8. **Sync, like Brand Pack.** Guided generation is a blocking DRF call (client timeout raised to ~100s; ~1.8k output tokens ≈ 25–40s). If real-world timeouts bite, fallback plan is a Celery job + status polling — noted, not built.

## 6. API surface

### Public (AllowAny — consumed by the Next public sites)
- `GET /api/v1/blog/posts/?page=N` — published only: title, slug, excerpt, cover, tags, published_at
- `GET /api/v1/blog/posts/<slug>/` — full post

### Coach admin (`/api/v1/admin/blog/…`, authenticated coach/owner)
- CRUD `posts/` (manual writing — no gate beyond auth)
- `POST generate/` `{topic_id | custom_topic, instructions?}` → checks `has_paid_platform_plan` + quota → 1 AI call → creates draft, returns it. Errors mirror Brand Pack: `upgrade_required` / `quota_exhausted` / `budget_exhausted` / `error`.
- `GET ai/status/` → `{enabled, eligible, remaining, limit, reason}` (drives the UI meter + upsell)
- `GET/POST topics/` (list queue, trigger refill), `POST topics/<id>/dismiss/`
- `GET/PATCH autopilot/`

### Platform admin
- `PlatformBlogPost` registered via `@platform_site.register` in an `admin_panels.py` (list/CRUD appear in the superadmin SPA automatically).
- `POST /api/v1/platform-admin/blog/generate/` — same engine, brand brief hardcoded to Contentor's positioning, no quota (budget kill-switch only).

## 7. Frontend

### Coach app (`frontend-customer`)
- **`/admin/blog`** — posts list with status chips + credits meter ("3 of 5 AI posts left this month"); Autopilot card (enable, frequency picker, Review-first vs Auto-publish toggle, next-run date). Free tier sees the AI panel as a Brand-Pack-style upsell; manual "New post" always works.
- **Guided AI flow** (UX modeled on Logo Studio's brief step): pick a suggested topic chip or type your own + optional "tell the AI what you want" textarea → spinner → draft opens in the editor. Regenerate button warns "uses 1 credit".
- **Editor** — reuse the TipTap setup from `admin/mailbox/message-editor.tsx` (StarterKit/Link/Placeholder/Underline) + fields for title, excerpt, meta description, tags, cover; Publish/Unpublish. Non-technical-coach rules apply: slug auto-generated, raw fields tucked under "Advanced".
- **Public site** — new routes `(public)/blog/page.tsx` (listing) and `(public)/blog/[slug]/page.tsx`, following the store/events pattern (public dynamic routes outside the 6 builder pages; nav link shown once ≥1 published post exists). **Per-post `generateMetadata`** (title, description, OG) + JSON-LD `BlogPosting` — closing the current per-page SEO gap. `blog` is already a reserved slug in `core/constants.py`, so no subdomain collision.

### Main app (`frontend-main`)
- Public `/blog` + `/blog/[slug]` with the same metadata + JSON-LD treatment, styled with the landing design system; blog added to the marketing-site sitemap.
- Superadmin: adminkit model page for list/moderation + a thin bespoke `admin/blog` compose page (topic input → generate → TipTap edit → publish; TipTap dep added to frontend-main).

## 8. Autopilot (Celery)

Copies the recurring-announcements dispatch pattern exactly:

- Beat entry `dispatch-due-blog-autopilot` (every 15 min) → loop non-public tenants under `tenant_context` → where `is_enabled` and `next_run_at` due, **atomically claim** by advancing `next_run_at` (exactly-once), then `generate_autopilot_post.delay(schema_name)`.
- The task, inside the tenant schema:
  1. Gate: `has_paid_platform_plan` + remaining quota. If out of credits → notify coach once ("Autopilot skipped — out of AI posts this month") and skip.
  2. Topic: pop oldest `available` `BlogTopicIdea`; if queue empty, run the Haiku refill first.
  3. Generate via the shared engine; save **draft** (default) or **publish** per `auto_publish`; mark topic `used`; record usage.
  4. Notify the coach via the notifications service: "Your new blog post is ready to review" / "…was published".
- Per-tenant exceptions are logged and never break the loop (existing convention).

## 9. Error handling & safety

- **Three kill-switches:** per-tenant monthly quota (plan), global monthly USD budget across all blog AI (attempts included), `BLOG_AI_ENABLED` flag.
- Failed generations record USD cost but never consume a quota credit; the endpoint returns a typed `reason` the UI maps to friendly notices.
- All AI output passes `sanitize_rich_text()` before persisting — nothing model-generated reaches a public page unsanitized; slugs are re-derived server-side, never trusted from model output.
- Public endpoints expose published posts only; drafts are never serialized there.

## 10. Testing

Follow per-app pytest conventions (`apps/blog/tests/`):
- **Engine:** Anthropic mocked (pattern from `test_logo_ai.py`) — parse/convert/sanitize path, markdown→HTML determinism, cost recording on failure, quota increment only on success.
- **Providers:** `ClaudeCliProvider` with subprocess mocked — envelope parsing, JSON-validation retry, missing-binary/missing-token → `enabled: false`; provider selection by `BLOG_AI_PROVIDER`; both providers return identical schema objects.
- **Quota/gating:** Free blocked with `upgrade_required`; Starter exhausts at 5, Pro at 30; month rollover; global budget kill-switch; platform generations bypass quota but record USD.
- **Views:** public list/detail return published only; draft 404s publicly; coach CRUD permissions; generate endpoint error reasons.
- **Autopilot:** recurrence claim exactly-once (mirror `test_recurring_dispatch.py`), draft-vs-auto-publish paths, out-of-credit notification, empty-queue refill.
- **Frontend:** builds clean; e2e smoke (coach generates draft → publishes → public page renders) added to the existing Playwright suite when run locally.

## 11. Out of scope (v1)

- Section-level AI rewrite / "improve this paragraph" (regenerate is whole-post)
- Platform-blog i18n (English only; marketing i18n exists but blog translation is a separate effort)
- Coach-site sitemaps, comments, categories beyond tags, scheduled publish-at-date for manual posts, image generation for covers
- Topic performance analytics / auto-learning which topics convert
