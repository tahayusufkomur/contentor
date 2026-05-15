# CLAUDE.md

Guidance for Claude Code when working in the Contentor repository.

## Project Overview

**Contentor** — multi-tenant SaaS platform for content creators ("coaches"). Coaches sign up and get a tenant subdomain where they sell courses, downloads, live sessions, and run email campaigns to their students. Each tenant is isolated via PostgreSQL schema-per-tenant (`django-tenants`), routed by Traefik.

- **Coach** = tenant owner (paying customer)
- **Student** = end user inside a tenant
- **Superadmin** = main app owner (us)

Production stack: Django 5.1 + DRF + django-tenants + Postgres 17 + Redis 7 + Celery + Daphne (Channels) + 2× Next.js 14 + Traefik v3.2.

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

make shell             # Django shell
make health-check      # curl /api/health/
```

## Architecture

### Backend (`backend/`)

Layout: `config/` (project) + `apps/` (Django apps). Settings split into `base.py` / `dev.py` / `prod.py`.

**SHARED_APPS** (public schema only):
- `apps.core` — tenants, organizations, middleware (`HeaderAwareTenantMiddleware`, `TenantRateLimitMiddleware`), routers, access service, platform serializers
- `apps.accounts` — user model, auth backends (`AdminJWTBackend`, `TenantJWTAuthentication`)

**TENANT_APPS** (per-tenant schema):
- `apps.tenant_config` — per-tenant settings (theme, branding)
- `apps.courses` — course content + modules
- `apps.downloads` — file/resource downloads
- `apps.live` — video sessions via Stream.io (`getstream` SDK in `apps/live/stream_service.py`)
- `apps.media` — S3 / Hetzner object storage uploads (boto3)
- `apps.billing` — plans, subscriptions, payments (model supports `iyzico` / `stripe` / `bypass` choices — SDKs not yet wired)
- `apps.email_campaigns` — outbound campaigns; integrates MailCraft via `django-contentor-email-builder`

Tenant routing: `apps.core.routers.TenantRouter` keeps tenant-only apps out of the public schema.

Auth: JWT-based. `TenantJWTAuthentication` is the default DRF auth class — public endpoints (magic link, OAuth, signup) MUST set `@authentication_classes([])`, `AllowAny` alone is not enough.

API prefix: `/api/v1/` (also `/api/health/`). WebSockets at `/ws/*` go to Daphne.

### Frontend

Two independent Next.js 14 apps, App Router, Tailwind + Radix UI:

- **`frontend-main/`** — marketing site, signup, login, coach onboarding. Routed via `Host(localhost)` / `Host(tr.localhost)` (dev) and `Host(contentor.app)` / `Host(tr.contentor.app)` (prod).
- **`frontend-customer/`** — tenant-facing portal where students consume content. Routed via Traefik wildcard `HostRegexp(.+)` (catch-all). Adds Stream.io chat + video (`stream-chat-react`, `@stream-io/video-react-sdk`).

### Multi-Tenancy (critical — see also `~/.claude/.../memory/reference_multitenancy_patterns.md`)

- Browser → `/api/v1/*` → Django (direct via Traefik, NOT proxied through Next.js).
- Next.js server-side `fetch()` → Django MUST send `X-Tenant-Domain` header. Node's undici silently drops custom `Host`, so `Host: django` resolves to public.
- Build tenant domain from slug (`${slug}.${BASE_DOMAIN}`) — don't rely on `getTenantDomain()` in `generateMetadata` / `manifest.ts` (returns empty there).
- Tenant signup creates user in BOTH public (role=coach) and tenant (role=owner, is_staff). Magic link auto-registers students in tenant schema.

### Docker Services (`docker-compose.yml`)

`traefik` (80/8080), `postgres:17-alpine`, `redis:7-alpine`, `django` (Gunicorn :8000, runs migrations in entrypoint), `django-channels` (Daphne :8001, depends on django service_healthy), `nextjs-main` (:3000), `nextjs-customer` (:3001), `celery-worker`, `celery-beat`. Optional `--profile monitoring`: prometheus, grafana, loki, cadvisor.

Only the gunicorn entrypoint runs migrations + collectstatic — daphne/celery skip to avoid races.

## MailCraft Integration

[mailCraft/](../mailCraft/) is a sibling project — standalone email builder SaaS at `mailcraft.contentor.app`. Contentor uses it via:

1. **`django-contentor-email-builder`** package ([../django-contentor-email-builder/](../django-contentor-email-builder/)) — embeds MailCraft iframe into Django admin actions. Requires `EMAIL_BUILDER_API_KEY` (format `mc_live_*`).
2. **Server-side render** — `apps.email_campaigns` calls MailCraft's `/api/v1/export/html` to materialize templates with per-recipient variables; sends via Resend.

Each personalized render counts against the MailCraft plan quota.

## Active Documentation

- `docs/superpowers/plans/` and `docs/superpowers/specs/` — recent feature work (Mar 19-25: zoom OAuth, course form consolidation, inline edit panel, email campaigns, email panel improvements).
- Older platform-level planning lives in `../docs/plans/` and `../docs/specs/` (foundation doc + initial design) — historical reference, not actively maintained.

## Rules

- Never create new `.md` files unless explicitly asked.
- Pre-commit must pass with zero security issues, formatting issues, errors, or warnings.
- After each implementation stage: run `make dev` and verify before claiming done.
- Never commit unless explicitly asked.
- Always verify builds pass before claiming work is done.
