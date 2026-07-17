# CLAUDE.md

Guidance for Claude Code when working in the Contentor repository.

## Project Overview

**Contentor** — multi-tenant SaaS platform for content creators ("coaches"). Coaches sign up and get a tenant subdomain where they sell courses, downloads, live sessions, and run email campaigns to their students. Each tenant is isolated via PostgreSQL schema-per-tenant (`django-tenants`), routed by Caddy.

- **Coach** = tenant owner (paying customer)
- **Student** = end user inside a tenant
- **Superadmin** = main app owner (us)

Production stack: Django 5.1 + DRF + django-tenants + Postgres 17 + Redis 7 + Celery + 2× Next.js 14, behind Caddy in both dev and prod.

## Commands

All via `make help`:

```bash
make dev               # docker compose up --build (all services hot-reload)
make dev-reset         # wipe volumes + .next, rebuild from scratch
make down              # stop + remove volumes
make logs              # tail all service logs

make migrate           # migrate_schemas (all tenants)
make migrate-shared    # public schema only
make makemigrations    # generate migration files
make seed              # seed_plans (plans + public tenant + superusers)

make test              # pytest -v inside django container
make lint              # pre-commit on all files
make format            # ruff (backend) + prettier (both frontends)
make test-app APP=billing   # one backend app's tests
make test-frontend          # frontend-customer vitest
make typecheck               # tsc --noEmit, both apps (advisory — not yet gated in make lint; see Task 3 of docs/superpowers/plans/2026-07-17-vibe-coding-restructure.md)

make shell             # Django shell
make health-check      # curl /api/health/
make e2e               # Playwright suite vs the running dev stack (Stripe specs skip)
make e2e-stripe        # + real Stripe test-mode specs (needs make stripe-listen running)
make e2e-spec SPEC=04-live-class  # one Playwright spec
```

## Architecture

### Backend (`backend/`)

Layout: `config/` (project) + `apps/` (Django apps). Settings split into `base.py` / `dev.py` / `prod.py`.

**SHARED_APPS** (public schema only):
- `apps.core` — tenants, organizations, middleware (`HeaderAwareTenantMiddleware`, `TenantRateLimitMiddleware`), routers, access service, platform serializers; also hosts the onboarding wizard (`core/onboarding/`), superadmin platform API (`core/platform/`), AI infra (`ai.py`, `assistant.py`), and demo template seeding (`core/demo/`)
- `apps.accounts` — user model, auth backends (`AdminJWTBackend`, `TenantJWTAuthentication`)
- `apps.adminkit` — no models; registers API admin sites for both SPAs via `admin_panels.py` autodiscovery
- `apps.platform_email` — platform-level email campaigns (public schema; superadmin → coaches)
- `apps.domains` — custom-domain lifecycle for tenants
- `apps.mailbox` — dual-listed: public-schema rows are the superadmin platform inbox; also in TENANT_APPS for the per-coach mailbox

**TENANT_APPS** (per-tenant schema):
- `apps.tenant_config` — per-tenant settings (theme, branding), logo studio backend, site assistant
- `apps.filters` — reusable filter options attached to content
- `apps.tags` — tagging for content lists
- `apps.courses` — course content + modules
- `apps.downloads` — file/resource downloads
- `apps.live` — video sessions via Stream.io (`getstream` SDK in `apps/live/stream_service.py`)
- `apps.media` — S3 / Hetzner object storage uploads (boto3)
- `apps.billing` — plans, subscriptions, payments via **Stripe Connect** (marketplace: `providers/connect.py`, `stripe_provider.py`, webhooks); `bypass` provider for dev/CI
- `apps.email_campaigns` — outbound campaigns; integrates MailCraft via `django-contentor-email-builder`
- `apps.notifications` — in-app/student notifications
- `apps.mailbox` — coach ↔ student mailbox (see dual-listing note above)
- `apps.usage` — per-tenant usage counters
- `apps.community` — community/discussion features
- `apps.blog` — tenant blog posts

Tenant routing: `apps.core.routers.TenantRouter` keeps tenant-only apps out of the public schema.

Auth: JWT-based. `TenantJWTAuthentication` is the default DRF auth class — public endpoints (magic link, OAuth, signup) MUST set `@authentication_classes([])`, `AllowAny` alone is not enough.

API prefix: `/api/v1/` (also `/api/health/`).

### Frontend

Two independent Next.js 14 apps, App Router, Tailwind + Radix UI:

- **`frontend-main/`** — marketing site, signup, login, coach onboarding. Routed via `Host(localhost)` / `Host(tr.localhost)` (dev) and `Host(contentor.app)` / `Host(tr.contentor.app)` (prod).
- **`frontend-customer/`** — tenant-facing portal where students consume content. Routed via Caddy catch-all (any host that isn't the marketing apex/locale). Adds Stream.io chat + video (`stream-chat-react`, `@stream-io/video-react-sdk`).

### Multi-Tenancy (critical — see also `~/.claude/.../memory/reference_multitenancy_patterns.md`)

- Browser → `/api/v1/*` → Django (direct via Caddy, NOT proxied through Next.js).
- Next.js server-side `fetch()` → Django MUST send `X-Tenant-Domain` header. Node's undici silently drops custom `Host`, so `Host: django` resolves to public.
- Build tenant domain from slug (`${slug}.${BASE_DOMAIN}`) — don't rely on `getTenantDomain()` in `generateMetadata` / `manifest.ts` (returns empty there).
- Tenant signup creates user in BOTH public (role=coach) and tenant (role=owner, is_staff). Magic link auto-registers students in tenant schema.

### Docker Services (`docker-compose.yml`)

`caddy` (:80), `postgres:17-alpine`, `redis:7-alpine`, `django` (Gunicorn :8000, runs migrations in entrypoint), `nextjs-main` (:3000), `nextjs-customer` (:3000), `celery-worker`, `celery-beat`. Optional `--profile monitoring`: prometheus, grafana, loki, cadvisor.

Only the gunicorn entrypoint runs migrations + collectstatic — celery skips to avoid races.

### Local fakes + e2e

Dev compose bundles MinIO as the object store; `AWS_ENDPOINT_EXTERNAL` controls the presigned-URL host the browser uses (must be reachable from the host, not inside Docker). `LIVE_FAKE_ENABLED=true` (set in dev `.env`) stubs GetStream so live-class specs run offline — unset to use real GetStream keys. `EMAIL_SINK_ENABLED=true` captures outbound email; read back via `GET /api/v1/dev/emails/latest/?to=` (prod refuses both flags). Dev `.env` runs `BILLING_BYPASS_ENABLED=false` (real Stripe test-mode); set it `true` for fully-offline payments (bypass provider). E2e suite lives in `e2e/` — `make e2e` runs the 24 non-Stripe specs in `e2e/specs/` (26 spec files total; the 2 Stripe specs auto-skip without `STRIPE_E2E`, and `90-logo-eval` is an AI-scored eval); `make e2e-stripe` adds the 2 Stripe specs (needs `sk_test_*` keys and `make stripe-listen` in another shell — `stripe-listen` injects `--api-key` from `.env` and forwards connect events automatically).

## MailCraft Integration

[mailCraft/](../mailCraft/) is a sibling project — standalone email builder SaaS at `mailcraft.contentor.app`. Contentor uses it via:

1. **`django-contentor-email-builder`** package ([../django-contentor-email-builder/](../django-contentor-email-builder/)) — embeds MailCraft iframe into Django admin actions. Requires `EMAIL_BUILDER_API_KEY` (format `mc_live_*`).
2. **Server-side render** — `apps.email_campaigns` calls MailCraft's `/api/v1/export/html` to materialize templates with per-recipient variables; sends via Resend.

Each personalized render counts against the MailCraft plan quota.

## Active Documentation

- **`docs/PRODUCT.md`** — living product plan (north star, feature inventory, backlog); maintained via the `/po` skill. Consult it for any "what's next / what is left" question.
- **`docs/REFERENCE.md`** — comprehensive project reference (architecture, domain model, auth/tenancy flows, billing, integrations, deploy, roadmap). **`docs/GLOSSARY.md`** — canonical terminology. Start here for full context.
- `docs/superpowers/plans/` and `docs/superpowers/specs/` — feature work specs/plans. `docs/superpowers/specs/archive/` holds specs for features fully implemented and deployed to prod — historical reference only; the top level of `specs/` holds specs for work still in progress, unmerged, undeployed, or (for `screenshot-map`/`flowmap-service`) living tooling reference.
- Older platform-level planning lives in `../docs/plans/` and `../docs/specs/` (foundation doc + initial design) — historical reference, not actively maintained.

## Flowmap — user-flow map (`tools/flowmap/`)

A local SQLite + web-server dev tool that maps the app's user journeys. It crawls both
frontends, screenshots every route, and uses the `claude` CLI to identify distinct user
flows; each flow is stored in SQLite and rendered as a left→right DAG of real screenshots
at `http://localhost:7878`. Screen keys are `"<frontend>|<url>"` (frontend = `main` or
`customer`, e.g. `customer|/admin/courses`). `flowmap.db` is gitignored — rebuild it, don't
commit it. Self-contained Node (`node:sqlite` + `node:http`, run with `--experimental-sqlite`).

Three ways Claude operates it:

- **Consult (text, no server) — use this to understand a user journey while coding.**
  `make flowmap-show` prints every flow with its ordered steps; `make flowmap-show ARGS=screens`
  lists the valid screen keys; `make flowmap-show ARGS=<id>` dumps one flow. Reads the DB
  directly — no browser, no running server.
- **Author live (server running):** while `make flowmap` serves, add/curate flows over the
  HTTP API — `POST /api/flows` `{name, description?, steps:[{from,to,label?}]}`, `GET /api/flows`,
  `GET /api/flows/:id`, `DELETE /api/flows/:id`, `GET /api/screens` (valid keys), `POST /api/reset`.
  Steps must reference existing screen keys (unknown keys are accepted but flagged as warnings).
- **Rebuild:** `make flowmap-register` re-crawls (needs the dev stack up + seeded) and re-identifies
  flows via `claude -p`; `ARGS=--reset` wipes first, `ARGS=--screens-only` refreshes every screen's
  screenshot but keeps the existing flows. Dynamic routes (`[slug]`/`[id]`) resolve to real seeded
  instances via `crawler/targets.json` (`dynamic` map, keyed by frontend then route url) — the crawl
  reports its coverage (goal: 0 skipped / 0 errored).
- **Verify one flow end-to-end:** `node --experimental-sqlite tools/flowmap/walk.js <flowId>` logs in
  per role and live-walks every step of a flow, screenshotting each into `walk-shots/flow-<id>/` and
  reporting per-step `ok`/`error`/`skipped` — use it (e.g. via a subagent per flow) to confirm a
  journey renders real pages with no errored screenshots.

Design + plan: `docs/superpowers/specs/2026-06-28-flowmap-service-design.md` and
`docs/superpowers/plans/2026-06-28-flowmap-service.md`.

## Rules

- Never create new `.md` files unless explicitly asked.
- Pre-commit must pass with zero security issues, formatting issues, errors, or warnings.
- After each implementation stage: run `make dev` and verify before claiming done.
- Never commit unless explicitly asked.
- Always verify builds pass before claiming work is done.

## Home-server deploy

Contentor is hosted on the home server (old MacBook, Ubuntu) behind the shared
Cloudflare tunnel, alongside the rest of the fleet (see `~/ws/home-server/`).
Domain `contentor.app` (apex + `tr.` locale + `*.` tenant subdomains).

- **Prod stack:** `docker-compose.prod.yml` at the repo root (self-contained;
  NOT an override of the dev compose). One Caddy edge proxy `contentor-caddy` on
  the external `edge` network is the only edge-facing container; everything else
  is on the internal network with no published host ports.
- **Routing:** one parametrized `Caddyfile` (env vars `CONTENTOR_DOMAIN` and
  `FORWARDED_PROTO`) serves both dev and prod. `/api/*`, `/static/*` and apex
  `/django-admin/*` → Django; apex + `tr.` → `nextjs-main`; every other host
  (tenant subdomains) → `nextjs-customer` (Caddy catch-all).
  Tenancy is dynamic — Django resolves the tenant from the Host header; the proxy
  needs no per-tenant config, only wildcard DNS.
- **TLS:** terminated at Cloudflare's edge; cloudflared→Caddy→Django is HTTP.
  Caddy forces `X-Forwarded-Proto https` to Django, which sets
  `SECURE_PROXY_SSL_HEADER`. WhiteNoise serves admin static.
- **Secrets:** `.env.prod` at repo root (gitignored, rsynced to the box; template
  in `.env.prod.example`). Prod runs `config.settings.prod` with live Stripe —
  `BILLING_BYPASS_ENABLED` MUST be false.
- **Deploy:** from the Mac, `cd ~/ws/home-server && ./deploy.sh contentor`
  (rsync + build + up + health). Tunnel ingress: `./deploy.sh edge`. The repo is
  reached via a symlink at `~/ws/projects-active/home-server/contentor`.
