# Contentor — Codebase Audit Findings

_Generated 2026-07-12. Consolidates a structural sweep (4 read-only explorers) and two
adversarially-verified deep-audit runs (14-dimension + lean Opus re-verify)._

## How to read this

Each finding is tagged with **severity** and **confidence**:

| Confidence | Meaning |
|---|---|
| `CONFIRMED` | An independent adversarial verifier re-read the cited code and found no mitigating guard. |
| `PLAUSIBLE` | Evidence holds; real-world impact depends on conditions not fully verified. |
| `UNVERIFIED` | Finder-reported with concrete file evidence; verification pass was cut off by a rate limit. Treat as high-probability, confirm before fixing. |
| `SWEEP` | From the initial structural read; not adversarially verified — these are architecture/maintenance observations, not exploit claims. |

Severity: 🔴 critical · 🟠 high · 🟡 medium · ⚪ low.

Locations are `path:line` relative to the repo root.

**Two audit facts that frame everything below:**
- The repo has **no CI** and the frontend pre-commit hooks never fire (dead `^frontend/` path) — nothing automatically gates any of this.
- Deploy **rsyncs the working tree** (`--delete`, no rollback), so an unreviewed change to `main` *is* a production push. Fix on branches; review before merge.

---

## Section index

- [A. Security — tenant isolation & auth](#a-security--tenant-isolation--auth)
- [B. Security — access control / paid content](#b-security--access-control--paid-content)
- [C. Security — injection, XSS, SSRF, uploads](#c-security--injection-xss-ssrf-uploads)
- [D. Billing & payments correctness](#d-billing--payments-correctness)
- [E. Reliability & production ops](#e-reliability--production-ops)
- [F. Database & performance](#f-database--performance)
- [G. Architecture & code duplication](#g-architecture--code-duplication)
- [H. Dev cycle, CI & tooling](#h-dev-cycle-ci--tooling)
- [I. Dependencies & build](#i-dependencies--build)
- [J. Dead code & repo weight](#j-dead-code--repo-weight)
- [K. API contract consistency](#k-api-contract-consistency)
- [L. Frontend quality](#l-frontend-quality)
- [M. Testing](#m-testing)
- [N. Git & branch hygiene](#n-git--branch-hygiene)

---

## A. Security — tenant isolation & auth

- 🟠 `CONFIRMED` — **`AdminJWTBackend` accepts a JWT minted for any tenant** — `backend/apps/accounts/backends.py:22`. No `tenant_id`/region/purpose claim check (unlike `TenantJWTAuthentication`). User IDs are per-schema sequences, so `id=1` is the staff owner in every schema; if `/django-admin/` is ever reached under a tenant schema, one owner's token authenticates as another's. Also 500s on tokens lacking `user_id`.
- 🟡 `CONFIRMED` — **No CSRF on the cookie-auth path** — `backend/apps/accounts/authentication.py:27`, dead config at `backend/config/settings/base.py:77`. `CsrfViewMiddleware`/`CSRF_TRUSTED_ORIGINS` are set but never apply; `SameSite=Lax` does not isolate tenant subdomains (shared registrable domain). State-changing GET handlers exist (`backend/apps/downloads/views.py:88`) and are forgeable.
- 🟡 `UNVERIFIED` — **Rate-limit admin bypass keyed only on JWT role, ignoring `tenant_id`** — `backend/apps/core/middleware/rate_limit.py:28`. Any coach/owner token exempts throttling on every other tenant.
- 🟡 `UNVERIFIED` — **`X-Tenant-Domain` trusted from any client** — `backend/apps/core/middleware/tenant.py:19`. No proxy secret; an anonymous caller can select a victim tenant's schema on AllowAny endpoints (fill its rate-limit window, drive its AI spend).
- ⚪ `UNVERIFIED` — **Public assistant endpoints authorize on a client-supplied session UUID** — `backend/apps/tenant_config/assistant_views.py:131`.
- ⚪ `UNVERIFIED` — **CORS regex trusts every `*.contentor.app` sibling subdomain** — `backend/config/settings/prod.py:43`. Any tenant subdomain is an allowed origin for any other.

## B. Security — access control / paid content

- 🔴 `CONFIRMED` — **Cross-tenant paywall bypass via Stream token** — `backend/apps/live/stream_service.py:148`. The GetStream token is app-wide per-user, not scoped to the class; any student can join any tenant's paid live class/stream.
- 🟠 `CONFIRMED` — **Zoom join link + meeting ID exposed to anonymous users** — `backend/apps/live/serializers.py:297`. No access check.
- 🟠 `CONFIRMED` — **On-site event exact address exposed to anonymous users** — `backend/apps/live/serializers.py:342`.
- 🟠 `CONFIRMED` — **Live-stream chat channel membership is fully open** — `backend/apps/live/views.py:291`. Any valid Stream token can read/post in any paid stream's chat.
- 🟡 `PLAUSIBLE` — **Stream `host` role granted to any owner/coach** for a class they do not instruct — `backend/apps/live/views.py:171`.

## C. Security — injection, XSS, SSRF, uploads

- 🟠 `CONFIRMED` — **Stored XSS: tenant `custom_css` injected raw into a `<style>` tag** on every tenant page — `frontend-customer/src/components/shared/tenant-theme-style.tsx:12`.
- 🟠 `CONFIRMED` — **Stored XSS: blog `body_html`** stored & rendered unsanitized (public blog) — `backend/apps/blog/serializers.py:30`.
- 🟠 `CONFIRMED` — **Stored XSS: lesson `content_html`** unsanitized (to enrolled students) — `backend/apps/courses/serializers.py:332`.
- 🟠 `CONFIRMED` — **SSRF + worker hang: push fan-out POSTs to arbitrary user-supplied URLs with no timeout** — `backend/apps/notifications/services.py:38`.
- 🟠 `CONFIRMED` — **Upload "complete" trusts a client-supplied `s3_key` with no tenant-prefix check** — `backend/apps/core/uploads/views.py:57`. Arbitrary object read/signing.
- 🟠 `CONFIRMED` — **Presigned PUT has no content-length-range / max-size** — `backend/apps/core/storage.py:35`. Unbounded storage cost-DoS.
- 🟠 `CONFIRMED` — **No per-tenant storage quota enforced** — `backend/apps/core/quotas.py:76`. `enforce_max_storage_gb` is a Phase-0 log-only stub, never called.
- 🟡 `CONFIRMED` — **Multipart initiate mints up to 10,000 presigned part URLs with no size cap** — `backend/apps/core/uploads/multipart.py:21`. A single object can reach ~50 TB.
- 🟡 `CONFIRMED` — **Owner/coach JWT fully bypasses the upload rate-limit** — `backend/apps/core/middleware/rate_limit.py:48`. No global DRF throttle either.
- 🟡 `CONFIRMED` — **Community presign reachable by students at the 100/min default bucket** (not the 10/min upload rate) — `backend/apps/community/views.py:77`.
- 🟡 `UNVERIFIED` — **Presigned upload allows arbitrary Content-Type** (no MIME allowlist) — `backend/apps/core/uploads/serializers.py:6`.
- ⚪ `CONFIRMED` — **Abandoned/never-completed uploads are never garbage-collected** — `backend/apps/core/uploads/views.py:52`. Orphaned objects + dangling multipart parts accrue permanent cost.

## D. Billing & payments correctness

- 🔴 `CONFIRMED` — **Failed Stripe webhooks are permanently dropped** — `backend/apps/billing/views/webhooks.py:736`. The dedup insert precedes processing, so a retried, previously-failed event hits the "already seen" fast-path and no-ops (paying customer never gets access).
- 🟠 `CONFIRMED` — **Canceled coach keeps paid plan forever** — `backend/apps/billing/views/webhooks.py:769`. `subscription.deleted` is acknowledged-but-deferred; no period-end enforcement.
- 🟠 `CONFIRMED` — **`payment_item_refund` has no locking/transaction** — `backend/apps/billing/views/payments.py:292`. Concurrent requests double-refund real money.
- 🟠 `CONFIRMED` — **One `STRIPE_WEBHOOK_SECRET` cannot verify both platform and Connect endpoints** — `backend/apps/billing/providers/stripe_provider.py:124`.
- 🟡 `UNVERIFIED` — **`checkout.session.completed` ignores `payment_status`** — `backend/apps/billing/views/webhooks.py:253`. Unpaid/async sessions grant access.
- 🟡 `UNVERIFIED` — **Plan change corrupts subscription currency** (set from `SubscriptionPlan.currency`, defaults `TRY`) — `backend/apps/billing/views/webhooks.py:441`.
- 🟡 `UNVERIFIED` — **Webhook upserts overwrite `billing_amount` with the current plan price**, breaking grandfathered pricing — `backend/apps/billing/views/webhooks.py:320`.
- 🟡 `UNVERIFIED` — **Marketplace renewals recorded with `platform_fee=0` / `submerchant_payout=0`** — `backend/apps/billing/views/webhooks.py:452`. Coach earnings/fees understated.
- 🟡 `UNVERIFIED` — **`.delay()` called inside the webhook DB transaction** (no `transaction.on_commit`) — `backend/apps/domains/webhooks.py:81`.
- 🟡 `UNVERIFIED` — **Stripe network call executed inside the webhook's atomic transaction** — `backend/apps/billing/views/webhooks.py:243`.
- ⚪ `UNVERIFIED` — **`checkout.session.expired` unhandled** — `backend/apps/billing/views/webhooks.py:41`. Abandoned checkouts leave `Payment` rows `pending` forever.
- ⚪ `UNVERIFIED` — **No reconciliation for the redirect/webhook race** — `backend/apps/billing/providers/stripe_provider.py:78`. `session_id` reaches success URLs but is never consumed server-side.
- `SWEEP` — **`iyzico` provider declared but unimplemented**; `stripe_provider.py` still has `NotImplementedError` stubs. Roadmap ballast reading as live code.

## E. Reliability & production ops

- 🔴 `CONFIRMED` — **No database backup automation anywhere** — `home-server/deploy.sh:132`. All tenant schemas live on one home-server Postgres volume with no `pg_dump`/snapshot/restore. One disk failure or bad migration = total, unrecoverable loss of every coach's data. **Highest-value fix in the entire audit.**
- 🟠 `CONFIRMED` — **Prod serves the whole platform on 2 sync gunicorn workers** while ~9 endpoint families block on external HTTP for 30–240s — `docker-compose.prod.yml:98`. Two concurrent AI requests (even anonymous) take every tenant offline.
- 🟠 `CONFIRMED` — **Celery broker/results on non-durable, LRU-evicting Redis** — `docker-compose.prod.yml:74`. Queued tasks (signup provisioning, campaigns) silently dropped under memory pressure.
- 🟠 `CONFIRMED` — **Zero production observability/alerting** — `docker-compose.prod.yml:18`. Incidents are undetectable. Compounded by ↓.
- 🟡 `CONFIRMED` — **`prod.txt` is never installed** — `backend/Dockerfile:13` always installs `dev.txt`. So prod ships test tooling and **neither Sentry nor Prometheus**, despite both being declared.
- 🟡 `UNVERIFIED` — **`sentry-sdk` declared but never initialized** — `backend/requirements/prod.txt:2`. No `sentry_sdk.init()` anywhere.
- 🟡 `UNVERIFIED` — **`django-prometheus` declared, Prometheus scrapes `django:8000`, but the app exposes no `/metrics`** — `backend/requirements/prod.txt:3`. Scrape job permanently empty.
- 🟠 `CONFIRMED` — **`provision_tenant` (new-coach signup) is not idempotent** — `backend/apps/core/tasks.py:53`. A retry after partial progress creates a duplicate `TenantConfig`, then crashes on the duplicate owner user, bricking the signup. (Also has **zero test coverage** — see §M.)
- 🟡 `PLAUSIBLE` — **`renew_domain` has no retry/failure state and is non-idempotent** — `backend/apps/domains/tasks.py:22`. A transient AWS error silently skips a paid domain renewal.
- 🟡 `UNVERIFIED` — **`provision_domain` retry budget (~11 min) far shorter than SSL/NS propagation**; async Route53 `OperationId` discarded — `backend/apps/domains/tasks.py:13`.
- 🟡 `UNVERIFIED` — **Lost/crashed `send_campaign_emails` leaves the campaign `SENDING` forever**, and the dedup guard then blocks resending — `backend/apps/email_campaigns/tasks.py:35`.
- 🟡 `UNVERIFIED` — **Client-aborted SSE chat streams skip `on_complete`** — `backend/apps/core/assistant.py:74`. AI spend never accrues to the per-tenant quota / global kill-switch; no transcript audited.
- 🟡 `UNVERIFIED` — **All Celery work shares one queue at concurrency 2** — `docker-compose.prod.yml:128`. Long campaign/AI/domain tasks starve signup provisioning.
- 🟡 `UNVERIFIED` — **Celery worker/beat have no healthcheck** — `docker-compose.prod.yml:121`. A hung-but-alive worker stalls all async work silently.
- 🟡 `UNVERIFIED` — **`dispatch_due_recurrences` runs the full push+email fan-out inline in the every-minute beat task** — `backend/apps/notifications/tasks.py:152`.
- ⚪ `UNVERIFIED` — **Per-minute beat tasks iterate every tenant schema; `LiveReminderLog` grows unboundedly** — `backend/config/celery.py:12`.
- ⚪ `UNVERIFIED` — **`resend`/GetStream calls have no explicit timeout; Stripe left at 80s default, no `max_network_retries`** — `backend/apps/core/email.py:50`.
- ⚪ `UNVERIFIED` — **Single points of failure inherent to one-box deploy** (one Caddy, one cloudflared, one Postgres) — `docker-compose.prod.yml:196`. Accept explicitly; the backup gap is the actionable part.
- `SWEEP` — **Migrations + demo reseed run on the container entrypoint** (180s healthcheck `start_period`); a slow/failed migration wedges the deploy. No atomicity guarantee on power loss mid-migrate.
- `SWEEP` — **`monitoring/` (Prometheus/Grafana/Loki) is dev-only**, excluded from prod via `.deployignore`; `.deployignore` also references a nonexistent `/traefik/`.

## F. Database & performance

- 🟡 `CONFIRMED` — **Course list: ~5 extra queries per course, unpaginated by default on a public endpoint** — `backend/apps/courses/views.py:62`.
- 🟠 `CONFIRMED` — **`store_list` runs a full per-item access check for authenticated users** — `backend/apps/billing/views/store.py:161`. N+1 over every paid item, unpaginated.
- 🟡 `PLAUSIBLE` — **Mailbox conversation list loads the entire mailbox into memory** (every message body + attachment) to render a 120-char preview — `backend/apps/mailbox/views.py:44`.
- 🟡 `UNVERIFIED` — **`enrolled_courses`: ~10 queries per enrollment** on the student dashboard — `backend/apps/courses/views.py:234`.
- 🟡 `UNVERIFIED` — **`student_list` unpaginated with per-student `enrollments.count()` N+1** — `backend/apps/accounts/views.py:372`.
- 🟡 `UNVERIFIED` — **Notifications feed returns every announcement ever received, full body, no pagination** — `backend/apps/notifications/views.py:63`.
- 🟡 `UNVERIFIED` — **Superadmin dashboard runs one aggregate query per tenant schema per page load (×2 endpoints)** + an unindexable `WebhookEvent` scan, uncached — `backend/apps/core/platform/views.py:89`.
- 🟡 `UNVERIFIED` — **`calendar_events` has no date window and no pagination** — `backend/apps/live/views.py:443`. Loads and Python-sorts every event across 4 tables.
- 🟡 `UNVERIFIED` — **Course detail recomputes the access decision 3+ times** (~15–20 queries for one object) — `backend/apps/courses/serializers.py:198`.
- ⚪ `UNVERIFIED` — **Mailbox detail: no prefetch on messages/attachments** — `backend/apps/mailbox/views.py:86`.
- ⚪ `UNVERIFIED` — **`UsageEvent.day` has no index** — `backend/apps/usage/models.py:22`. Date-range aggregates scan; the platform rollup repeats it per schema.
- ⚪ `UNVERIFIED` — **`platform_tenants` returns every tenant unpaginated** — `backend/apps/core/platform/views.py:161`.
- ⚪ `UNVERIFIED` — **`campaign_recipients` returns every recipient unpaginated** — `backend/apps/email_campaigns/views.py:338`.
- ⚪ `UNVERIFIED` — **`platform_ai_conversations`: one "last message" query per conversation row** — `backend/apps/core/platform/views.py:567`.
- ⚪ `UNVERIFIED` — **`Payment` has no index on `status`/`payment_type`/`created_at`** although every access check + earnings aggregate filters on them — `backend/apps/billing/models/core.py:89`.
- _Note: the "live class/stream/zoom/onsite list N+1" claim from run 1 was **refuted** on re-check — those endpoints paginate. Not a finding._

## G. Architecture & code duplication

_From the structural sweep — the maintainability core._

- `SWEEP` — **Two god-apps hold ~49% of the backend.** `apps/core` (16,977 LOC / 122 files) mixes tenants, middleware, platform admin, AI assistant, uploads, onboarding, help bot, and demo seeding — anything "misc" lands here. `apps/tenant_config` (11,041 LOC) fuses three unrelated subsystems: theming, a ~1,960-LOC logo-generation engine (`logo_ai.py` 680, `logo_geometry.py` 607, `logo_converse.py` 399, `logo_recipe.py` 277), and three chatbots.
- `SWEEP` — **~7,500 LOC of hand-written demo-seed data inside `apps/core`** — `management/commands/seed_demo_tenant.py` (1,007) + 7 per-niche fixture files (`demo_data/fitness.py`, `yoga.py`, `pilates.py`, `belly_dance.py`, `face_yoga.py`, `makeup.py`, `pole_dance.py`, ~700 LOC each). Must be hand-updated on every content-model change.
- `SWEEP` — **Function-based-view boilerplate everywhere.** 42 files of `@api_view` vs 7 class-based; the same paginate/order/tag-filter/access sequence is re-implemented per app (e.g. `apps/courses/views.py:43`, `apps/live/views.py:39`). A shared list mixin would delete it.
- `SWEEP` — **Role check `request.user.role in ("owner","coach")` inlined 31 times** across non-test view code, while the existing `IsCoachOrOwner` permission (`apps/core/permissions.py`) sits mostly unused.
- `SWEEP` — **Serializer proliferation with no shared base** — courses declares 9, live 10, in a copy-pasted List/Detail/Create triad shape.
- `SWEEP` — **Four near-identical AI usage-meter models** (`LogoAiUsage`, `HelpBotUsage`, `BlogAiUsage`, `StudentBotUsage`, `apps/core/models.py:348-507`). A fifth AI feature means a fifth table + migration.
- `SWEEP` — **`apps/live` models four parallel session types** (LiveClass, LiveStream, ZoomClass, OnsiteEvent), each with its own serializer trio + view functions — a lot of near-duplicate CRUD.
- `SWEEP` — **~2,500 LOC of "shared" frontend code is maintained twice and has drifted:**
  - **admin-kit** vendored into both apps by `scripts/sync-admin-kit.sh` (wired into no hook/Makefile) — **all 8 mirrored files now differ**, `model-page.tsx` effectively a fork (370 changed lines). 1,636 LOC ×2.
  - **shadcn `components/ui`**: 11 shared components, **only 1 (`modal-portal.tsx`) still byte-identical**; `badge/button/card/input/label/separator/skeleton/switch/table/tabs` all drifted.
  - **`lib/auth.ts`, `lib/constants.ts`, `lib/utils.ts`** copied into both apps, all drifted.
- `SWEEP` — **God-components (frontend):** `frontend-customer/src/app/admin/live/page.tsx` (1,743 LOC / 51 hooks), `components/admin/course-form.tsx` (1,142), `lib/logo/composer.ts` (989), `components/logo/studio-panel.tsx` (892), `components/admin/media-browser.tsx` (717); `frontend-main/src/app/admin/ai/page.tsx` (819 / 22 hooks), `components/shared/help-bubble.tsx` (688).
- `SWEEP` — **API client is centralized in `frontend-customer` but hand-rolled in `frontend-main`.** Customer has `clientFetch`/`serverFetch`; main re-implements `fetch` + `X-Tenant-Domain` header assembly in each of `lib/auth.ts`, `lib/tenants.ts`, `lib/platform-blog.ts`, etc. `X-Tenant-Domain` is set manually across ~20 files.
- 🟡 `SWEEP` — **`serverFetch` calls `res.json()` unconditionally** on both error and success paths — `frontend-customer/src/lib/api-server.ts:25-28`. Any empty/204 Django response throws a parse error (the known bug class that already bit `clientFetch`; `frontend-main/src/lib/auth.ts` has the same). ~42 raw `.json()` calls across the two `lib/` trees.
- `SWEEP` — **~80 env vars read via 78 raw `os.environ` calls in `base.py`**, untyped, no schema; `.env.example` documents a fraction. 12 prod-only AI/mail vars absent from the dev template.
- 🟡 `SWEEP` — **Unsafe bypass defaults:** `BILLING_BYPASS_ENABLED` defaults **`True`** in `backend/config/settings/base.py:322` (prod only survives because `prod.py` hard-fails); `DOMAINS_BYPASS_ENABLED` hardcoded `True` in base + dev. A dev on plain `base` silently gets bypass behavior.
- `SWEEP` — **Bespoke `conftest.py` (270 LOC)** keeps a single never-dropped shared tenant schema, a hand-ordered 33-model `TENANT_CLEANUP_MODELS` cleanup list, a raw-SQL truncate, and a Redis key-purge autouse fixture. Fast but fragile — every new model/cached endpoint has non-obvious conftest obligations. (See §M for the concrete leak.)

## H. Dev cycle, CI & tooling

- 🟠 `SWEEP` — **No CI exists** (no `.github/`, no GitLab, nothing). The only gate is locally-run pre-commit.
- 🟠 `SWEEP` — **Frontend pre-commit hooks are dead** — `.pre-commit-config.yaml:41-53` scope eslint/prettier to `^frontend/` and `cd frontend`, but the apps are `frontend-main/`/`frontend-customer/`. Zero files match; the hooks have never fired.
- 🟠 `SWEEP` — **Neither frontend has an ESLint config**, so `next lint` is effectively a no-op despite `eslint-config-next` being installed.
- 🟡 `SWEEP` — **Frontend dependency changes silently require a manual rebuild** — `node_modules` are baked into the image while `package.json` is bind-mounted over it; `make dev`'s `--build` doesn't reconcile them.
- 🟡 `SWEEP` — **Deploy is `rsync --delete` of the laptop working tree** — ships uncommitted files + the 50+ unpushed commits, no SHA pinning, no rollback; `.env.prod` is rsynced (gitignored). Recovery = re-rsync a prior tree.
- 🟡 `SWEEP` — **E2E is hard-serial** (`workers:1`, 23 specs, `retries:1`) because specs mutate shared tenant state; can't run without the full live docker stack; reinstalls chromium + `npm install` on every invocation.
- ⚪ `SWEEP` — **`mypy` + `django-stubs` + `drf-stubs` configured but never invoked** — `backend/requirements/dev.txt:6`, `pyproject.toml [tool.mypy]`. No hook/target/CI runs it.
- ⚪ `SWEEP` — **Backend Dockerfile has no wheel cache and runs `INSTALL_CLAUDE_CLI=1` (network curl) on cold dev build**; gunicorn dev `--timeout 300` to accommodate a blocking AI call.
- ⚪ `SWEEP` — **CLAUDE.md says "17 e2e specs"; there are 23.** Doc drift.

## I. Dependencies & build

- 🟠 `CONFIRMED` — **Backend pinned to EOL Django 5.1** — `backend/requirements/base.txt:1`. No more security patches; upgrade to 5.2 LTS.
- 🟡 `UNVERIFIED` — **`gunicorn` capped at 22.x, below the 23.0.0 request-smuggling fix (CVE-2024-6827)** — `backend/requirements/base.txt:7`.
- 🟡 `UNVERIFIED` — **No Python lockfile/hashes** — `backend/requirements/base.txt:1`. Range pins make builds non-reproducible.
- 🟡 `UNVERIFIED` — **`npm ci || npm install` fallback defeats the lockfile** in all frontend build stages — `frontend-main/Dockerfile:5`.
- ⚪ `UNVERIFIED` — **Backend image is single-stage** — build toolchain (gcc, libpq-dev) ships in the runtime — `backend/Dockerfile:8`.
- ⚪ `UNVERIFIED` — **`Pillow` upper bound spans two majors (10.x + 11.x)** — `backend/requirements/base.txt:22`.
- ⚪ `UNVERIFIED` — **`vtracer` (heavy compiled Rust wheel) used in exactly one non-test file** — `backend/requirements/base.txt:21`.
- `SWEEP` — Frontends aligned (Next 14.2.35 — patched for CVE-2025-29927, React 18.3.1). **TipTap stack in `frontend-main` imported in exactly one file** (`components/admin/mailbox/message-editor.tsx`) — heavy for one surface. `@mediapipe/tasks-vision` needs a postinstall patch + webpack alias (known fragility).

## J. Dead code & repo weight

- 🟡 `UNVERIFIED` — **`apps/core/quotas.py` is a dead ~110-line enforcement module** — `backend/apps/core/quotas.py:63`. No call site imports it; plan quotas (students/storage/streaming/campaign-emails) are enforced nowhere.
- 🟡 `UNVERIFIED` — **Entire `apps/domains` API (5 endpoints) is consumed by no frontend and no e2e** — `backend/apps/domains/urls.py:5`. Custom-domain Phase-1 backend with no coach UI; unreachable + unauthenticated-surface cost.
- 🟡 `UNVERIFIED` — **Dead `frontend-customer` components shipped** — `frontend-customer/src/components/landing/` directory, `edit-button`, `file-uploader` never imported.
- ⚪ `UNVERIFIED` — **Dead billing serializers** — `CheckoutResponseSerializer`, `SubscriptionStateSerializer`, transitively `PlatformPlanBriefSerializer` — `backend/apps/billing/serializers/platform.py:20`.
- `SWEEP` — **119 of the repo's 125 doc files are one-shot finished-work plans/specs** in `docs/superpowers/` (67 plans + 52 specs). History, not reference — archive candidate. 191 markdown files repo-wide.
- `SWEEP` — **`docs/screenshot-map/index.html` is a 3.8 MB tracked generated artifact** — the largest tracked file by 10×. Un-track + regenerate.
- `SWEEP` — **~1.4 GB of deletable local scratch** (regenerable): `tools/flowmap/walk-shots/` (119 M) + `flowmap.db*` (18 M), `.claude/worktrees/` (39 M, stale since May 12), `test-results/`, node_modules/.next. Git history itself is healthy (1.86 MiB packed).
- `SWEEP` — **Roadmap duplicated** between `docs/REFERENCE.md §15` and `docs/PRODUCT.md`; `CLAUDE.md` architecture section overlaps `REFERENCE.md`. Pick one home to avoid drift.

## K. API contract consistency

- ⚪ `CONFIRMED` — **Fragmented error-response shape; both frontends only read `data.detail`** — `frontend-customer/src/types/api.ts:6`. ~36+ endpoints surface a generic "API Error" instead of the real message.
- 🟡 `UNVERIFIED` — **Many write endpoints hand-parse `request.data` instead of a DRF serializer** — e.g. `backend/apps/community/moderation_views.py:137`. Skips validation + type coercion.
- 🟡 `UNVERIFIED` — **No OpenAPI/machine-readable schema**; 237 function-based `@api_view` handlers return ad-hoc dicts — `backend/config/urls.py:36`. Frontends hand-maintain every type.
- 🟡 `UNVERIFIED` — **Inconsistent datetime serialization** — hand-built dicts emit `.isoformat()` (`+00:00`) while serializer endpoints emit DRF `Z`; null-guarding arbitrary — `backend/apps/billing/views/payments.py:579`.
- ⚪ `UNVERIFIED` — **`blog_topics` returns HTTP 200 with an in-body error sentinel** on real failures — `backend/apps/blog/views.py:167`.
- ⚪ `UNVERIFIED` — **Hand-rolled field-error maps in tags/community** duplicate DRF's shape but are unreadable by the frontend — `backend/apps/tags/views.py:28`.
- `SWEEP` — **Both `next.config.mjs` proxy `/api/v1/*` to `django:8000`** — a second, overlapping path to the backend alongside the direct-via-Caddy path CLAUDE.md prescribes.

## L. Frontend quality

- 🟠 `CONFIRMED` — **`/admin/design` eagerly bundles jszip + opentype.js + full Logo Studio into the route JS** — `frontend-customer/src/app/admin/design/page.tsx:18`. No `next/dynamic` used anywhere in either app.
- 🟡 `UNVERIFIED` — **Public tenant blocks/cards use raw `<img>` instead of `next/image`** — `frontend-customer/src/components/blocks/hero-block.tsx:96`. Hurts LCP/CLS on SEO-facing sites.
- 🟡 `UNVERIFIED` — **Design settings page hangs on an infinite skeleton if the config fetch fails** (no error/retry UI) — `frontend-customer/src/app/admin/design/page.tsx:31`.
- ⚪ `UNVERIFIED` — **Email dashboard silently swallows a failed campaigns fetch**, showing an empty list indistinguishable from "no campaigns" — `frontend-customer/src/app/admin/email/page.tsx:47`.

## M. Testing

- 🟡 `CONFIRMED` — **`TENANT_CLEANUP_MODELS` is missing ~14 tenant models** that `transaction=True` tests commit rows into — `backend/conftest.py:181`. Cross-test data-leak / flaky-test time-bomb.
- 🟠 `CONFIRMED` — **`provision_tenant` has zero test coverage and never executes in the suite** — `backend/apps/core/tasks.py:10`. The new-coach signup path is entirely unverified.
- ⚪ `CONFIRMED` — **`email_campaigns` app has 0 tests** — `backend/apps/email_campaigns/tasks.py:36`. Plan email-quota + per-recipient MailCraft billing entirely unverified.
- 🟡 `UNVERIFIED` — **E2E money path stops at "payment completed"** — `e2e/specs/21-stripe-marketplace.spec.ts:205`. The payout/application-fee split (coach earnings) is never verified end-to-end.
- ⚪ `UNVERIFIED` — **No time-mocking anywhere**; month/day-boundary logic in usage + recurring dispatch relies on real `now()` and can flake — `backend/apps/notifications/tests/test_recurring_dispatch.py:1`.

## N. Git & branch hygiene

- 🟡 `UNVERIFIED` — **`feat/ai-assistants-v2` is rotting ~94 commits behind main and contains a stranded cross-tenant security fix** — rescue before it rots further.
- 🟡 `UNVERIFIED` — **`worktree-ai-nav-grouping-and-blog-images` ~50 commits behind**; blog-image work overlaps merged code.
- ⚪ `UNVERIFIED` — **`claude/*` branch cleanup** — two are safe to delete (0 unique commits); one is a divergent stale experiment that must **not** be blind-deleted.
- `SWEEP` — **`main` habitually 50+ commits unpushed** (the laptop is the only copy); 2 stale `.claude/worktrees` from May 12.

---

## Remediation plan

Findings above are grouped into **14 branch-sized work units across 5 phases**, sequenced
worst-risk-first. Each unit is scoped to ship as one reviewable change. Effort: `S` < 1h ·
`M` ~half-day · `L` 1–2 days · `XL` multi-day. **Nothing merges to `main` → deploy without
review** (deploy rsyncs the working tree with no rollback).

Status legend for tracking: `[ ]` not started · `[~]` in progress · `[x]` done (branch pending review) · `[merged]`.

### Phase 0 — Stop active harm (this week)

- `[x]` **P0-A · Database backup + recovery** — `S` — _Critical E._ Done: `scripts/backup_db.sh` (pg_dumpall → gzip → offsite S3 + retention) + `scripts/restore_db.sh` (confirmed restore + dev drill). Dump mechanic smoke-tested (898 KB from dev DB). **Manual prod step remaining:** install aws-cli + the nightly cron on the box (see script header). _Media-bucket backup still TODO._
- `[x]` **P0-B · Stored-XSS sanitization** — `M` — _§C._ Done: new `apps/core/sanitize.py` (`clean_rich_html` via nh3, `clean_css`); wired into every write serializer for blog `body_html` (admin + platform), lesson `content_html` (create + nested-create), and tenant `custom_css`, plus a render-side guard in `generateThemeCSS`. 13 sanitizer tests + 408 affected-app tests green; frontend typechecks. Verified `<script>`/`onerror`/`javascript:` neutralized, safe HTML/CSS preserved.
- `[x]` **P0-C · Live-app access checks** — `M` — _§B._ Done: Stream tokens scoped via `call_cids` (class) + `call_cids`+`channel_cids` (stream) so a token can't be replayed to other calls/chats; Zoom link/meeting-id + on-site exact address stripped from serialized output for viewers without access (free events stay public); `host` role limited to instructor/owner. 7 new tests; live suite 53 green. _Full end-to-end chat/video verification needs a real GetStream (fake stubs it locally)._
- `[x]` **P0-D · Webhook idempotency ordering** — `M` — _§D crit._ Done: dedup row now short-circuits only when already processed (`processed_at` set); unprocessed rows reprocess on Stripe retry, `processing_error` cleared on success. Domain provisioning enqueued via `transaction.on_commit`. New reprocess-on-retry test; billing+domains 159 green. _Moving the best-effort Stripe receipt-URL read out of the handler txn deferred to P1-A (money-path rework)._

### Phase 1 — Money & auth correctness

- `[ ]` **P1-A · Billing correctness** — `L` — _§D._ Enforce `subscription.deleted`/period-end; lock `payment_item_refund`; split platform vs Connect webhook secrets; check `payment_status`; stop overwriting `billing_amount`/currency (grandfathering + TRY-default); record real `platform_fee`/payout; handle `session.expired` + redirect/webhook reconciliation. Verify `make e2e-stripe` + a new payout-split assertion.
- `[ ]` **P1-B · Auth & secret hardening** — `M` — _§A._ `AdminJWTBackend` tenant/region/purpose claim check; `Secure`+`HttpOnly`+`SameSite` cookies in prod; prod guard failing on default `SECRET_KEY`/`ALLOWED_HOSTS`; stop logging tokens + PII; stop echoing raw Stripe/Route53 exceptions.
- `[ ]` **P1-C · Throttling & CSRF** — `M` — _§A/§C._ Real CSRF for the cookie path (or double-submit token); throttle signup/magic-link/auth + a global default; key rate-limit per-IP and validate `X-Tenant-Domain`/JWT-tenant match; move state-changing GETs to POST.
- `[ ]` **P1-D · Upload safety & quotas** — `M` — _§C._ Content-length-range + MIME allowlist on presigns; cap multipart parts/total; validate `s3_key` tenant-prefix; **wire the dead `quotas.py`** enforce calls; GC orphaned uploads; community presign → 10/min bucket.

### Phase 2 — Reliability & production ops

- `[ ]` **P2-A · Serve without self-DoS** — `M` — _§E._ Async gunicorn workers (or more workers) + move the ~9 blocking external calls off the request path; SSRF-guard + timeout every external call.
- `[ ]` **P2-B · Durable Celery + task correctness** — `M` — _§E._ Dedicated persistent broker (AOF Redis / RabbitMQ) separate from LRU cache; idempotent `provision_tenant`/`renew_domain` with retry+failure state; recover stuck `SENDING` campaigns; accrue AI spend on SSE abort; split queues; worker/beat healthchecks; bound `LiveReminderLog`.
- `[ ]` **P2-C · Observability** — `S` — _§E._ Fix Dockerfile to install `prod.txt`; actually `sentry_sdk.init()` + wire `django-prometheus` (or drop both); add uptime/error alerting; cap docker log growth.

### Phase 3 — Safety net & currency (prevents regression)

- `[ ]` **P3-A · CI + working lint gates** — `M` — _§H._ GitHub Actions (backend ruff+pytest w/ Postgres+Redis; per-frontend prettier+tsc+build). Fix the dead `^frontend/` pre-commit paths; add real ESLint configs; wire or drop mypy.
- `[ ]` **P3-B · Dependency & image currency** — `M` — _§I._ Django 5.1(EOL) → 5.2 LTS; gunicorn ≥ 23; Python lockfile+hashes; drop `npm ci || npm install`; multi-stage backend image; tighten Pillow.

### Phase 4 — Maintainability (lowest risk, opportunistic)

- `[ ]` **P4-A · Kill dead code & repo weight** — `S` — _§G/§J/§N._ Delete/flag `apps/domains`, dead billing serializers, dead frontend components, `iyzico`/stripe stubs; archive `docs/superpowers` (119 files); un-track the 3.8 MB screenshot-map; delete the 2 zero-commit `claude/*` branches + stale worktrees; **rescue the stranded cross-tenant fix in `feat/ai-assistants-v2` before merging/closing it.**
- `[ ]` **P4-B · Shared frontend package + de-boilerplate** — `L` — _§G._ Extract admin-kit + ui primitives + `clientFetch`/`serverFetch` + constants into an npm-workspace `packages/shared` (reconcile the drift first); delete `sync-admin-kit.sh`; give `frontend-main` the shared API client; add an empty-body guard to `serverFetch`. Backend: one shared list mixin + enforce `IsCoachOrOwner` (kills 31 inline checks); collapse the 4 AI usage models; extract demo seeding + logo engine out of the god-apps; typed settings schema for the ~80 env vars (flip bypass defaults safe-off).
- `[ ]` **P4-C · API consistency + performance + tests** — `L` — _§F/§K/§M._ One error envelope + shared DRF exception handler + `drf-spectacular`; serializer-validate hand-parsed writes; fix N+1/pagination + missing indexes on the hot endpoints; `next/dynamic` heavy bundles; fix `TENANT_CLEANUP_MODELS`; first tests for `email_campaigns`/`provision_tenant`; extend e2e money path; add time-mocking.

### Rough shape

- **Phase 0:** ~1–1.5 days — the highest-value work in the plan.
- **Phases 1–2:** the bulk — ~1–1.5 weeks focused.
- **Phases 3–4:** ongoing; P3-A ideally lands right after Phase 0 so CI guards the rest.

---

## Confidence & method notes

- **Not exhaustive on `UNVERIFIED` items:** the first deep-audit run's verification pass was truncated by a rate limit, so ~55 findings carry finder evidence but no adversarial confirmation. They cite real code — confirm before fixing, don't assume.
- **`SWEEP` items are architectural observations**, not exploit claims; they were not adversarially verified because they aren't the kind of claim that refutes cleanly (they're about maintenance cost, not correctness).
- **One claim was refuted** and excluded: "live list endpoints N+1" — those endpoints paginate.
- A companion **remediation plan** (5 phases, 14 branch-sized work units) sequences these fixes worst-risk-first; ask to have it written alongside this doc.
