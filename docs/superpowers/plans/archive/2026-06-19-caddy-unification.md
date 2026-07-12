# Caddy Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Contentor use Caddy as its only edge proxy in both dev and prod, driven by one parametrized `Caddyfile`, with a Makefile that handles dev/prod consistently.

**Architecture:** Replace Traefik in the dev compose with a Caddy service. Rename `Caddyfile.prod` → `Caddyfile` and parametrize the two env-specific bits (hostname, forwarded-proto) with Caddy `{$VAR:default}` substitution so both composes mount the same file. Keep the two compose files separate and self-contained (the fleet `deploy.sh` requires a standalone `docker-compose.prod.yml`). Add deploy/validate helpers to the Makefile.

**Tech Stack:** Docker Compose, Caddy 2 (alpine), Make, Django/Next.js (unchanged).

## Global Constraints

- **Do NOT change `~/ws/home-server/deploy.sh` or the fleet convention.** Prod must stay a standalone `docker-compose.prod.yml` runnable via `docker compose -f docker-compose.prod.yml up`.
- **Caddyfile routing rules must stay byte-for-byte equivalent** to the current `Caddyfile.prod` except for the two parametrized values: `{$CONTENTOR_DOMAIN:localhost}` (hostnames) and `{$FORWARDED_PROTO:http}` (the `X-Forwarded-Proto` header value).
- Dev defaults: `CONTENTOR_DOMAIN=localhost`, `FORWARDED_PROTO=http`. Prod: `CONTENTOR_DOMAIN=contentor.app`, `FORWARDED_PROTO=https`.
- Both frontends listen on internal port **3000** in every env (dev customer changes from 3001 → 3000).
- Internal service names stay identical (`django`, `redis`, `postgres`, `nextjs-main`, `nextjs-customer`) so app env carries over.
- Never commit unless explicitly asked (contentor CLAUDE.md). Each task below ends with a *suggested* commit the user can approve; do not run it without the user's go-ahead.
- After implementation: `make dev` and verify before claiming done (contentor CLAUDE.md).

## File map

- **Rename + edit:** `Caddyfile.prod` → `Caddyfile` (parametrize 2 values)
- **Modify:** `docker-compose.yml` (swap Traefik→Caddy, drop labels, customer port 3001→3000)
- **Modify:** `docker-compose.prod.yml` (mount `./Caddyfile`, add 2 env vars on caddy)
- **Modify:** `Makefile` (add `PROD_COMPOSE` var + `deploy`/`prod-build`/`prod-config` targets, help)
- **Delete:** `traefik/traefik.yml`, `traefik/dynamic/routers.yml`, `traefik/` dir
- **Modify (docs):** `CLAUDE.md`, `docs/REFERENCE.md` (Traefik → Caddy references)

---

### Task 1: Parametrize the Caddyfile (rename `Caddyfile.prod` → `Caddyfile`)

**Files:**
- Rename: `Caddyfile.prod` → `Caddyfile`
- Edit: `Caddyfile` (two substitutions)

**Interfaces:**
- Produces: a `./Caddyfile` that both compose files will mount at `/etc/caddy/Caddyfile`. Reads env vars `CONTENTOR_DOMAIN` (default `localhost`) and `FORWARDED_PROTO` (default `http`).

- [ ] **Step 1: Rename the file with git**

```bash
cd ~/ws/projects-active/home-server/contentor
git mv Caddyfile.prod Caddyfile
```

- [ ] **Step 2: Parametrize the forwarded-proto header (3 occurrences)**

In `Caddyfile`, every `reverse_proxy django:8000 { ... }` block currently has:

```
header_up X-Forwarded-Proto https
```

Replace all three with:

```
header_up X-Forwarded-Proto {$FORWARDED_PROTO:http}
```

- [ ] **Step 3: Parametrize the hostnames (2 occurrences)**

The `@admin` matcher:

```
@admin {
	host contentor.app tr.contentor.app
	path /django-admin /django-admin/*
}
```

becomes:

```
@admin {
	host {$CONTENTOR_DOMAIN:localhost} tr.{$CONTENTOR_DOMAIN:localhost}
	path /django-admin /django-admin/*
}
```

The `@main` matcher:

```
@main host contentor.app tr.contentor.app
```

becomes:

```
@main host {$CONTENTOR_DOMAIN:localhost} tr.{$CONTENTOR_DOMAIN:localhost}
```

Leave the `@api`, `@static`, the customer catch-all `handle { reverse_proxy nextjs-customer:3000 }`, `admin 0.0.0.0:2019`, and `auto_https off` blocks unchanged. (Customer already targets `:3000` in the prod file — confirm it still says `nextjs-customer:3000`.)

- [ ] **Step 4: Validate the Caddyfile syntax (with dev defaults)**

Run:

```bash
docker run --rm -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

Expected: `Valid configuration`. The `{$VAR:default}` placeholders resolve to their defaults (`localhost`, `http`) since the env vars are unset here.

- [ ] **Step 5: Suggested commit (await user OK before running)**

```bash
git add Caddyfile
git commit -m "refactor: parametrize Caddyfile for dev+prod (rename from Caddyfile.prod)"
```

---

### Task 2: Point the prod compose at the shared Caddyfile

**Files:**
- Modify: `docker-compose.prod.yml` (the `caddy` service block, ~lines 19–43)

**Interfaces:**
- Consumes: the `./Caddyfile` from Task 1.
- Produces: a prod `caddy` service that injects `CONTENTOR_DOMAIN=contentor.app` and `FORWARDED_PROTO=https` so the shared Caddyfile renders the prod hostnames/scheme.

- [ ] **Step 1: Update the volume mount**

In `docker-compose.prod.yml`, under `services.caddy.volumes`, change:

```yaml
      - ./Caddyfile.prod:/etc/caddy/Caddyfile:ro
```

to:

```yaml
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
```

- [ ] **Step 2: Add the env vars to the caddy service**

In the `caddy` service, add an `environment:` block (place it just after `logging: *logging`, before `volumes:`):

```yaml
    environment:
      - CONTENTOR_DOMAIN=${CONTENTOR_DOMAIN:-contentor.app}
      - FORWARDED_PROTO=https
```

- [ ] **Step 3: Validate the merged prod compose + env interpolation**

Run:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod config >/dev/null && echo "PROD COMPOSE OK"
```

Expected: `PROD COMPOSE OK` (no errors). Confirms the mount + env interpolation resolve.

- [ ] **Step 4: Suggested commit (await user OK)**

```bash
git add docker-compose.prod.yml
git commit -m "refactor(prod): mount shared Caddyfile; pass domain+proto to caddy"
```

---

### Task 3: Replace Traefik with Caddy in the dev compose

**Files:**
- Modify: `docker-compose.yml` (remove `traefik` service ~lines 2–14; add `caddy` service; strip `traefik.*` labels from `django`/`nextjs-main`/`nextjs-customer`; change customer port)

**Interfaces:**
- Consumes: `./Caddyfile` from Task 1.
- Produces: dev stack reachable on host `:80` via Caddy; `nextjs-customer` now listens on `3000`.

- [ ] **Step 1: Replace the `traefik` service with a `caddy` service**

Delete the entire `traefik:` service block (the `image: traefik:v3.7` block with ports `80`/`8080`, the docker.sock + `./traefik` volumes, and its healthcheck). In its place, add:

```yaml
  caddy:
    image: caddy:2-alpine
    container_name: contentor-caddy-dev
    ports:
      - "80:80"
    environment:
      - CONTENTOR_DOMAIN=${CONTENTOR_DOMAIN:-localhost}
      - FORWARDED_PROTO=http
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
    depends_on:
      - django
      - nextjs-main
      - nextjs-customer
    healthcheck:
      test: ["CMD", "wget", "-q", "-O-", "http://127.0.0.1:2019/config/"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 20s
```

- [ ] **Step 2: Strip the Traefik labels from `django`**

In the `django` service, delete the entire `labels:` block (the `traefik.enable`, `traefik.http.routers.django-api.*`, `traefik.http.routers.django-admin.*`, and `traefik.http.services.django.*` lines). Leave the rest of the service unchanged.

- [ ] **Step 3: Strip the Traefik labels from `nextjs-main`**

In the `nextjs-main` service, delete its entire `labels:` block (all `traefik.*` lines).

- [ ] **Step 4: Strip labels + unify the port on `nextjs-customer`**

In the `nextjs-customer` service:
- Delete its entire `labels:` block (all `traefik.*` lines).
- Change the command from:

```yaml
    command: npm run dev -- -p 3001
```

to:

```yaml
    command: npm run dev -- -p 3000
```

- [ ] **Step 5: Validate the dev compose**

Run:

```bash
docker compose -f docker-compose.yml config >/dev/null && echo "DEV COMPOSE OK"
```

Expected: `DEV COMPOSE OK`. Also confirm no `traefik` references remain:

```bash
grep -n traefik docker-compose.yml || echo "no traefik refs — good"
```

Expected: `no traefik refs — good`.

- [ ] **Step 6: Suggested commit (await user OK)**

```bash
git add docker-compose.yml
git commit -m "refactor(dev): replace Traefik with Caddy; unify customer port to 3000"
```

---

### Task 4: Delete the `traefik/` directory

**Files:**
- Delete: `traefik/traefik.yml`, `traefik/dynamic/routers.yml`, and the `traefik/` directory.

**Interfaces:**
- Consumes: nothing references `traefik/` after Task 3.

- [ ] **Step 1: Confirm nothing else references the traefik dir**

Run:

```bash
cd ~/ws/projects-active/home-server/contentor
grep -rn "traefik" . --include='*.yml' --include='*.yaml' --include='Makefile' --include='*.sh' --exclude-dir=.git 2>/dev/null || echo "clean"
```

Expected: only matches (if any) are in docs/specs — no compose/Makefile/script refs. (Docs are handled in Task 6.)

- [ ] **Step 2: Remove the directory with git**

```bash
git rm -r traefik
```

- [ ] **Step 3: Suggested commit (await user OK)**

```bash
git commit -m "chore: remove unused traefik config dir"
```

---

### Task 5: Add Makefile deploy/validate helpers

**Files:**
- Modify: `Makefile` (`.PHONY` line, add `PROD_COMPOSE` var, add 3 targets, update `help`)

**Interfaces:**
- Produces: `make deploy`, `make prod-build`, `make prod-config`. Dev targets unchanged.

- [ ] **Step 1: Add the `PROD_COMPOSE` variable near the top**

After the `.PHONY:` line (line 1), add the prod targets to `.PHONY` and define the variable. Change the `.PHONY` line to include the new targets:

```makefile
.PHONY: help dev dev-reset down build restart reset migrate migrate-shared makemigrations shell test test-backend lint logs health-check seed seed-demos seed-demos-force format stripe-listen deploy prod-build prod-config

PROD_COMPOSE = docker compose -f docker-compose.prod.yml --env-file .env.prod
```

- [ ] **Step 2: Add a Deploy section with the three targets**

Append at the end of the Makefile:

```makefile
# ============================================================================
# Deploy (prod runs remotely on the home server via deploy.sh)
# ============================================================================

deploy: ## Deploy contentor to the home server (rsync + build + up + health)
	cd ~/ws/home-server && ./deploy.sh contentor

prod-build: ## Build the prod images locally (catches prod build breaks; no network needed)
	$(PROD_COMPOSE) build

prod-config: ## Validate the prod compose + .env.prod interpolation
	$(PROD_COMPOSE) config >/dev/null && echo "prod compose OK"
```

- [ ] **Step 3: Add a Deploy group to `make help`**

In the `help:` target, after the `--- Utilities ---` block (the `shell|health-check` grep line), add:

```makefile
	@echo ""
	@echo "\033[1;33m--- Deploy ---\033[0m"
	@grep -E '^(deploy|prod-build|prod-config):.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
```

- [ ] **Step 4: Verify the targets exist and help renders**

Run:

```bash
make help | grep -E 'deploy|prod-build|prod-config'
make prod-config
```

Expected: help lists the three targets; `make prod-config` prints `prod compose OK`.

- [ ] **Step 5: Suggested commit (await user OK)**

```bash
git add Makefile
git commit -m "feat(make): add deploy + prod-build/prod-config helpers"
```

---

### Task 6: Update docs (Traefik → Caddy)

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/REFERENCE.md`

**Interfaces:**
- Produces: docs that describe Caddy-everywhere routing (no behavior change).

- [ ] **Step 1: Find every Traefik mention in the docs**

```bash
cd ~/ws/projects-active/home-server/contentor
grep -rn -i "traefik" CLAUDE.md docs/REFERENCE.md
```

- [ ] **Step 2: Update `CLAUDE.md`**

Edit the prose so it reflects Caddy in both envs. Specifically:
- Project Overview line: change "behind Caddy in prod (dev uses Traefik v3.x)" → "behind Caddy in both dev and prod".
- "routed by Traefik" (multi-tenancy intro) → "routed by Caddy".
- `frontend-customer` routing note: replace the Traefik `HostRegexp(.+)` description with "Caddy catch-all (any host that isn't the marketing apex/locale)".
- `frontend-main` routing note: keep the host list but drop "(dev)" Traefik framing — it's now the same Caddy rule in both, parametrized by `CONTENTOR_DOMAIN`.
- Docker Services section: change `traefik (80/8080)` → `caddy (:80)`; update the "Browser → /api/v1/* → Django (direct via Traefik...)" note to say "via Caddy".

- [ ] **Step 3: Update `docs/REFERENCE.md`**

Apply the same Traefik → Caddy corrections to any routing/architecture/deploy sections surfaced by the grep. Where it documents the dev proxy or label-based routing, replace with the parametrized-Caddyfile description (one Caddyfile, `CONTENTOR_DOMAIN`/`FORWARDED_PROTO` env vars).

- [ ] **Step 4: Verify no stale Traefik references remain in docs**

```bash
grep -rn -i "traefik" CLAUDE.md docs/REFERENCE.md || echo "docs clean"
```

Expected: `docs clean` (or only an intentional historical note).

- [ ] **Step 5: Suggested commit (await user OK)**

```bash
git add CLAUDE.md docs/REFERENCE.md
git commit -m "docs: describe Caddy-everywhere routing (was Traefik in dev)"
```

---

### Task 7: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Bring up the dev stack on Caddy**

```bash
cd ~/ws/projects-active/home-server/contentor
make dev
```

Wait for `nextjs-main`/`nextjs-customer` to finish their first compile (watch logs).

- [ ] **Step 2: Verify API + health through Caddy**

In another terminal:

```bash
curl -sf http://localhost/api/health/ && echo "  API OK"
make health-check
```

Expected: health JSON + `API OK`, and `make health-check` prints `OK`.

- [ ] **Step 3: Verify marketing apex routes to nextjs-main**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost/
```

Expected: `200` (served by `nextjs-main`).

- [ ] **Step 4: Verify a tenant subdomain routes to nextjs-customer**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: acme.localhost" http://localhost/
```

Expected: `200`/`30x` from the customer app (not the marketing site). Browsers resolve `*.localhost` to loopback; the `Host` header here forces the catch-all route.

- [ ] **Step 5: Verify Django admin + its static assets**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost/django-admin/
```

Expected: `30x` (redirect to login) — proves `/django-admin` → Django. Optionally load `http://localhost/django-admin/` in a browser and confirm CSS (`/static/admin/...`) loads.

- [ ] **Step 6: Tear down**

```bash
make down
```

- [ ] **Step 7: Final report**

Confirm all checks passed. Report any failures with the exact output (systematic-debugging before patching). Do not claim done until Steps 2–5 are green.

---

## Self-Review

**Spec coverage:**
- Goal 1 (Caddy everywhere / drop Traefik) → Tasks 3, 4.
- Goal 2 (one parametrized Caddyfile) → Tasks 1, 2.
- Goal 3 (consistent Makefile) → Task 5.
- Customer port unify (3001→3000) → Task 3 Step 4 + Caddyfile (already `:3000`).
- Prod compose minimal change → Task 2.
- Docs update → Task 6.
- Verification plan → Task 7.
- Constraint "don't touch deploy.sh / keep standalone prod compose" → honored (two separate files; Task 2 only edits the mount + env).

**Placeholder scan:** No TBD/TODO; every code/edit step shows the exact before→after content or command.

**Type/name consistency:** Service names (`caddy`, `django`, `nextjs-main`, `nextjs-customer`) and env var names (`CONTENTOR_DOMAIN`, `FORWARDED_PROTO`) are consistent across Tasks 1–3. Port `3000` consistent in Caddyfile + dev compose. `PROD_COMPOSE` var name consistent in Task 5.
