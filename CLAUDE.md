# CLAUDE.md

Guidance for Claude Code when working in the Contentor repository.

## Project Overview

**Contentor** — multi-tenant SaaS for content creators ("coaches"). Coaches get a tenant subdomain where they sell courses, downloads, live sessions, and email campaigns to their students. Tenant isolation is PostgreSQL schema-per-tenant (`django-tenants`), routed by Caddy.

- **Coach** = tenant owner (paying customer) · **Student** = end user inside a tenant · **Superadmin** = us
- Stack: Django 5.1 + DRF + django-tenants + Postgres 17 + Redis 7 + Celery + 2× Next.js 14, behind Caddy in dev and prod.

## Working style — keep small changes fast

- **Small, well-scoped changes: implement directly.** No plan docs, no brainstorming ceremony, no subagent fan-out. Reserve specs/plans/multi-agent process for large or risky work.
- **Orient from docs, don't re-explore.** Read the area's `docs/wiki/` page first; `docs/REFERENCE.md` for cross-cutting context. Grep/graph-query only for what the docs don't answer.
- **Verify at the cheapest sufficient level:** `make test-changed` (plus `make e2e-changed` if user-facing), or `make test-app APP=x`. Full `make test` / full e2e only when touching shared runtime code (`apps/core` outside its tests and management commands, `packages/shared`, auth, billing providers) — `make test-changed` already encodes this, so trust its plan (`PLAN=1` to preview). `make deploy` runs the full backend suite itself: never run it separately right before deploying.
- **The dev stack is usually already running** — check `make health-check` first. If it is down, start it with `make dev-d` (detached, returns when Django is healthy); foreground `make dev` blocks an agent until the tool timeout and killing it stops the stack. Never rebuild the stack to verify a code-only change; containers hot-reload.
- **The Docker VM has 4.4 GB RAM (6 CPUs, 4 GB swap) and the RAM is fixed.** One heavy job at a time (full suite, e2e, build). `make test` stops the two Next.js dev servers for the run and restarts them; their heap caps and `mem_limit`s in `docker-compose.yml` are sized to that budget — don't raise them.
- **GitNexus `impact`/`detect_changes` are for widely-shared symbols and refactors** — skip that ceremony for small local edits; pre-commit + test-changed is the gate (see calibration note at the bottom).

## Commands

`make help` lists everything. The ones that matter day-to-day:

```bash
make dev / down / logs           # stack up (hot-reload, foreground) / stop / tail logs
make dev-d                       # stack up detached, waits for Django health (agents: use this)
make migrate | makemigrations | seed
make test-changed                # DEFAULT: only tests affected by the diff (BASE=<ref>, PLAN=1)
make test-app APP=billing        # one backend app
make test | test-fresh           # full backend suite, ~1 min (pauses Next.js dev servers) | rebuild test DB (after new migrations)
make test-frontend               # vitest, both apps
make lint | format | typecheck
make e2e-changed | e2e-spec SPEC=04-live-class | e2e | e2e-stripe
make shell | health-check | ai-check
make wiki | wiki-sync            # regenerate architecture wiki | re-mirror only
```

## Architecture

Monorepo: `backend/` (Django: `config/` + `apps/`, settings split base/dev/prod) · `frontend-main/` (marketing/signup/onboarding, Next.js 14) · `frontend-customer/` (tenant portal, Next.js 14; live video is embedded from LiveCraft) · `packages/shared` (UI + hooks used by both apps) · `e2e/` (Playwright).

Per-area deep docs live in `docs/wiki/` — read the relevant page before working in an area. Non-obvious structural facts:

- Django apps split into **SHARED_APPS** (public schema) vs **TENANT_APPS** (per-tenant schema); `apps.core.routers.TenantRouter` keeps tenant apps out of public. `apps.mailbox` is dual-listed: public rows = superadmin platform inbox, tenant rows = per-coach mailbox.
- Auth is JWT. `TenantJWTAuthentication` is the default DRF auth class — public endpoints (magic link, OAuth, signup) MUST set `@authentication_classes([])`; `AllowAny` alone is not enough.
- API prefix `/api/v1/` (+ `/api/health/`). OpenAPI at `/api/schema/` (drf-spectacular) — after changing any serializer, run `npm run gen:api` in `frontend-customer` and review the `src/types/api-generated.ts` diff; a surprising diff means the frontend contract moved.
- Routing: apex → `frontend-main`; every other host (tenant subdomains) → `frontend-customer` via Caddy catch-all. `/api/*`, `/static/*`, apex `/django-admin/*` → Django directly (NOT proxied through Next.js).

### Multi-Tenancy (critical)

- Next.js server-side `fetch()` → Django MUST send `X-Tenant-Domain` header. Node's undici silently drops custom `Host`, so `Host: django` resolves to the public schema.
- Build tenant domain from slug (`${slug}.${BASE_DOMAIN}`) — don't rely on `getTenantDomain()` in `generateMetadata` / `manifest.ts` (returns empty there).
- Tenant signup creates the user in BOTH public (role=coach) and tenant (role=owner, is_staff) schemas. Magic link auto-registers students in the tenant schema.

### Docker services (`docker-compose.yml`)

`caddy` (:80), `postgres:17-alpine`, `redis:7-alpine`, `django` (Gunicorn :8000 — its entrypoint alone runs migrations + collectstatic; celery skips to avoid races), `nextjs-main`, `nextjs-customer`, `celery-worker`, `celery-beat`, `vector` (ships every container's logs to the in-app logbook, superadmin → Logs — that IS the observability stack; there is no metrics stack).

### Local fakes + e2e

Dev compose bundles MinIO as the object store; `AWS_ENDPOINT_EXTERNAL` controls the presigned-URL host the browser uses (must be reachable from the host, not inside Docker). Live video is LiveCraft, a sibling product ([../livecraft](../livecraft/), self-hosted LiveKit): `apps.live.livecraft` creates rooms + join links and the tenant portal iframes them. Without `LIVECRAFT_URL` dev runs a fake (inert join links); for real video run `make dev` there and set `LIVECRAFT_URL=http://host.docker.internal:7800` + `LIVECRAFT_API_KEY=dev-key`. Video behaviour is tested in LiveCraft's own e2e. `EMAIL_SINK_ENABLED=true` captures outbound email — read back via `GET /api/v1/dev/emails/latest/?to=` (prod refuses it). Dev runs `BILLING_BYPASS_ENABLED=false` (real Stripe test-mode); set `true` for fully-offline payments. E2e lives in `e2e/`: `make e2e` runs the 24 non-Stripe specs (2 Stripe specs auto-skip without `STRIPE_E2E`; `90-logo-eval` is an AI-scored eval); `make e2e-stripe` adds them (needs `sk_test_*` keys + `make stripe-listen` in another shell). `make e2e-changed` maps the diff via `e2e/impact-map.json` — fail-closed, `00-smoke` always runs; the selector self-test in `make lint` fails if a spec has no map entry. `make eval-sites STYLE=<id> [BRIEFS=yoga,chess]` is the manual styled-site eval (`91-site-eval`: 12 fixture coaches composed by the real composer on the `site-eval` scratch tenant, deterministic checks + `agy` vision judge, HTML report under `e2e/eval-shots/sites/`; ~5 min per brief, never in CI).

## MailCraft

Sibling project [mailCraft/](../mailCraft/) — standalone email-builder SaaS (`mailcraft.contentor.app`). Contentor embeds it via `django-contentor-email-builder` ([../django-contentor-email-builder/](../django-contentor-email-builder/), needs `EMAIL_BUILDER_API_KEY` = `mc_live_*`), and `apps.email_campaigns` renders templates server-side through MailCraft's `/api/v1/export/html` (each personalized render counts against the MailCraft quota), sending via Resend.

## Active Documentation

- **`docs/wiki/`** — generated per-area architecture wiki (GitNexus, mirrored from `.gitnexus/wiki/` — never edit by hand). **Read the area's page(s) before working in it** — named `<area>[-<location>].md`, e.g. `billing-payments-backend-apps.md`. A git post-commit/post-merge hook auto-refreshes it in the background (debounced to one run per 6h; log `.gitnexus/wiki-refresh.log`; shims reinstall via `scripts/install-git-hooks.sh`) — commit the resulting `docs/wiki/` diff with your next commit. `make wiki` forces a refresh; `make wiki-sync` re-mirrors only. Pages describe design intent; for exact current callers/impact trust the GitNexus MCP tools.
- **`docs/PRODUCT.md`** — living product plan (north star, backlog); maintained via `/po`. Consult for any "what's next / what is left" question.
- **`docs/REFERENCE.md`** — cross-cutting reference (domain model, auth/tenancy flows, billing, integrations, deploy). **`docs/GLOSSARY.md`** — canonical terminology.
- `docs/superpowers/plans|specs/` — in-progress feature specs/plans only. Shipped ones are deleted, not archived (2026-10-07); a `docs/superpowers/specs/<date>-<name>.md` path cited in a code comment lives in git history (`git log --all -- <path>`). (`../docs/plans|specs/` at platform level = historical, ignore.)

## Rules

- Never create new `.md` files unless explicitly asked.
- Never commit unless explicitly asked.
- Pre-commit must pass clean (zero security/format/lint findings) before claiming done.
- Verify before claiming done — in the already-running dev stack or at the targeted test level from "Working style"; don't restart/rebuild the stack for code-only changes.

## Loading & feedback conventions (both frontends)

Enforced by `scripts/check-loading-patterns.mjs` in `make lint` — following them up front avoids a failed-lint round-trip:

- Async buttons: `<Button loading={loading}>` / `loadingText="Saving…"`; standalone spinners only via `<Spinner>` — never raw `<Loader2>`/`animate-spin`.
- Wrap async handlers in `useAsyncAction` (`@shared/hooks/use-async-action`): loading state, double-submit guard, default error toast.
- Client-page initial loads: `<PageState loading error skeleton>` with presets from `@/components/ui/skeletons`; every route segment needs a `loading.tsx` at or above it (built from the same presets).
- Action outcomes are sonner toasts in BOTH apps; field-level validation stays inline. Motion is CSS-only and `motion-safe:`-gated.
- Refinement loads (search/filter/sort/paginate): wrap results in `<StaleContainer pending>` — rows dim, never blank. Full skeleton only for first load or switching resource.
- Overlays that fetch open immediately with a skeleton body; never hold an overlay closed while fetching.
- Internal navigation: `<NavLink>` (never raw `next/link`) and `useNavigate()` (never `router.push`) — they drive the top progress bar. `useTransition`'s `isPending` is NOT a usable navigation signal in the App Router; `NavigationProvider` derives `isNavigating` from a pending href cleared on route commit.

## Deploy (home server)

Prod = old MacBook (Ubuntu) behind the shared Cloudflare tunnel (fleet tooling: `~/ws/home-server/`), domain `contentor.app` (apex + `*.` tenant subdomains). `docker-compose.prod.yml` is self-contained (NOT a dev-compose override); one parametrized `Caddyfile` (`CONTENTOR_DOMAIN`, `FORWARDED_PROTO`) serves dev and prod; TLS terminates at Cloudflare's edge (Caddy forces `X-Forwarded-Proto https`; WhiteNoise serves admin static). Secrets: Cloudflare KV, fetched at deploy by the fleet's `scripts/secrets.sh` (Touch ID) into RAM on the node — there is no local `.env.prod`; change a prod value with `secrets.sh set contentor <KEY> <VALUE>` (`.env.prod.example` only documents the keys). Dev reads the root `.env`. Prod runs live Stripe — `BILLING_BYPASS_ENABLED` MUST be false. Deploy from the Mac: `make deploy` (full backend tests first, `SKIP_TESTS=1` to bypass) → `~/ws/home-server/deploy.sh contentor`; tunnel ingress via `./deploy.sh edge`.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **contentor** (20772 symbols, 38388 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/contentor/context` | Codebase overview, check index freshness |
| `gitnexus://repo/contentor/clusters` | All functional areas |
| `gitnexus://repo/contentor/processes` | All execution flows |
| `gitnexus://repo/contentor/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

**GitNexus calibration (overrides the auto-generated Always/Never rules above):** the MUST `impact`/`detect_changes` rules apply when editing widely-shared symbols (`packages/shared`, `apps/core`, `api-client`, billing providers) or doing refactors/renames. For small, local changes they are optional — pre-commit + `make test-changed` is the required gate. This block is regenerated by `analyze`; this calibration note is not.
