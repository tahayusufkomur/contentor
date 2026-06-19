# Unify Contentor on Caddy (dev + prod) — design

**Date:** 2026-06-19
**Status:** Approved, pending implementation plan

## Problem

Contentor runs two different edge proxies depending on environment:

- **dev** (`docker-compose.yml`) → Traefik v3 (routing via Docker labels + `traefik/` config)
- **prod** (`docker-compose.prod.yml`) → Caddy (routing via `Caddyfile.prod`)

This is inconsistent and duplicates the routing logic in two formats that can
drift. Caddy is already the fleet-wide prod standard — `deploy.sh` hardcodes the
convention "Caddy everywhere" (`PROXY="${PROJECT}-caddy"`). Traefik survives
**only** in contentor's dev compose.

## Goals

1. **One proxy everywhere: Caddy.** Remove Traefik from dev.
2. **One source of routing truth.** A single parametrized `Caddyfile` shared by
   dev and prod.
3. **Consistent Makefile.** Dev stays the daily driver; add symmetric
   deploy/validate helpers for prod so switching contexts is uniform.

## Non-goals / constraints

- **Do not change `deploy.sh` or the fleet convention.** The shared deploy tool
  requires a *standalone* `docker-compose.prod.yml` at the repo root
  (`docker compose -f docker-compose.prod.yml up`, validated by filename). Prod
  must remain self-contained. → We keep **two parallel compose files**, not a
  base+override or single-file scheme.
- Keep live prod low-risk: prod compose changes are minimal (a volume-mount
  rename + two env vars on the caddy service).
- Dev network model (default bridge, published Postgres/Redis ports, `monitoring`
  profile) stays dev-only and untouched.

## Decisions (from brainstorming)

| Decision | Choice | Why |
| --- | --- | --- |
| Compose layout | Two parallel Caddy files | Fleet `deploy.sh` requires standalone `docker-compose.prod.yml`; lowest risk to live prod |
| Caddyfile | One parametrized file | Single source of routing truth; kills dev/prod drift |
| Makefile scope | Dev primary + deploy/validate helpers | Real prod runs remotely via `deploy.sh`; full local prod stack (edge net/tunnel) not worth the moving parts |

## Design

### 1. Proxy — Caddy in dev (drop Traefik)

- Replace the `traefik` service in `docker-compose.yml` with a `caddy` service
  (`caddy:2-alpine`), publishing `80:80`.
- Mount the shared `./Caddyfile`.
- `environment: CONTENTOR_DOMAIN=${CONTENTOR_DOMAIN:-localhost}`,
  `FORWARDED_PROTO=http`.
- `depends_on: [django, nextjs-main, nextjs-customer]`.
- Healthcheck mirrors prod (Caddy admin API on `127.0.0.1:2019`).
- Remove **all** `traefik.*` labels from `django`, `nextjs-main`,
  `nextjs-customer`.
- Dev loses the `:8080` Traefik dashboard — no replacement needed. Caddy's
  admin API (`:2019`) stays internal (not published).

### 2. One parametrized Caddyfile (single source of routing truth)

Rename `Caddyfile.prod` → `Caddyfile`. Parametrize the two env-specific bits
with Caddy env substitution (`{$VAR:default}`):

- Hosts: `host {$CONTENTOR_DOMAIN:localhost} tr.{$CONTENTOR_DOMAIN:localhost}`
  → dev `localhost`/`tr.localhost`, prod `contentor.app`/`tr.contentor.app`.
- Proxy scheme: `header_up X-Forwarded-Proto {$FORWARDED_PROTO:http}`
  → dev `http` (default), prod `https`. This is the **only** behavioral
  dev/prod difference, and it is driven by a single env var.

Routing rules are unchanged from today's `Caddyfile.prod`:

- `/api/v1/*`, `/api/health*`, `/api/webhooks/*` → `django:8000`
- `/static/*` → `django:8000` (WhiteNoise; covers dev `/static/admin`)
- apex+locale `/django-admin/*` → `django:8000`
- apex+locale host → `nextjs-main:3000`
- everything else (tenant subdomains, incl. dev `*.localhost`) →
  `nextjs-customer:3000`

`auto_https off` and `admin 0.0.0.0:2019` stay (TLS terminates at Cloudflare in
prod; dev is plain HTTP).

**Why defaulting `FORWARDED_PROTO=http` in dev is safe:** dev settings
(`config.settings.dev`) set no `SECURE_PROXY_SSL_HEADER`, `SESSION_COOKIE_SECURE`,
or `CSRF_COOKIE_SECURE` — those live only in `prod.py`. So dev works over plain
HTTP today and continues to. Prod sets `FORWARDED_PROTO=https`, which feeds
`SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")`.

### 3. Dev compose changes (`docker-compose.yml`)

- Add the `caddy` service (above); remove the `traefik` service.
- Drop all `traefik.*` labels.
- **Unify the customer port:** change `nextjs-customer` dev command
  `npm run dev -- -p 3001` → `-p 3000`, so the single Caddyfile targets `:3000`
  in both envs. The two frontends are separate containers — no clash. Port
  `3001` was never published to the host, so nothing external breaks. (Add a
  `ports:` mapping later if direct host access is ever wanted.)
- Postgres/Redis published ports and the `monitoring` profile stay dev-only —
  untouched.

### 4. Prod compose changes (`docker-compose.prod.yml`) — minimal

- Caddy volume mount `./Caddyfile.prod` → `./Caddyfile`.
- Add `environment: CONTENTOR_DOMAIN=${CONTENTOR_DOMAIN:-contentor.app}`,
  `FORWARDED_PROTO=https` to the caddy service.
- Everything else (edge network, mem limits, restart policy, no published ports)
  unchanged. `deploy.sh` untouched.

### 5. Makefile — dev primary + deploy/validate helpers

- Add a variable to avoid duplication:
  `PROD_COMPOSE = docker compose -f docker-compose.prod.yml --env-file .env.prod`.
- Keep all existing dev targets as-is.
- Add targets (wired into `make help`):
  - `make deploy` → `cd ~/ws/home-server && ./deploy.sh contentor`
  - `make prod-build` → `$(PROD_COMPOSE) build` (catches prod build breaks
    locally; no network needed)
  - `make prod-config` → `$(PROD_COMPOSE) config` (validates merged prod compose
    + env interpolation)
- `make health-check` keeps working in dev (Caddy on `:80`).

### 6. Deleted / updated references

- Delete `traefik/` (`traefik.yml`, `dynamic/routers.yml`).
- `Caddyfile.prod` renamed to `Caddyfile`.
- Update Traefik references in `CLAUDE.md` and `docs/REFERENCE.md` to describe
  Caddy-everywhere routing.

## Verification

1. `make prod-config` — prod compose still valid, env interpolation resolves.
2. `make prod-build` — prod images still build.
3. `make dev` — then via Caddy on `:80`:
   - marketing apex (`http://localhost`) → nextjs-main
   - a tenant subdomain (`http://acme.localhost`) → nextjs-customer
   - `http://localhost/api/health/` → 200
   - `http://localhost/django-admin/` + its `/static/admin` assets load
4. `make health-check` → OK.

## Risks

- **Customer port change (3001→3000):** only reachable via the proxy today, so
  low risk; verified by the tenant-subdomain check above.
- **Caddy startup vs. Next dev compile:** `depends_on` waits for start, not
  readiness; brief 502s until Next finishes its first compile (same as Traefik
  behavior today). Acceptable for dev.
- **`*.localhost` resolution:** browsers resolve `*.localhost` to loopback, so
  tenant-subdomain routing works in dev without `/etc/hosts` edits.
