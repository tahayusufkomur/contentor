# Error Logging, Log Viewer & User Activity Tracking — Design

**Date:** 2026-07-19
**Status:** Approved (brainstorm w/ Taha), pending implementation plan
**Scope:** dev + prod

## Problem

Logs today go to stdout and die: prod's `json-file` driver keeps ~30MB per
container (2–3 days at best), dev keeps whatever Docker Desktop holds, and the
only way to read either is `docker logs` over SSH. There is no severity/tenant/
container filtering, no search, no retention guarantee, and no way to see what
an individual user did. Successful requests produce zero log lines anywhere
(Caddy and gunicorn access logs are off; `django.request` logs only 4xx/5xx),
so "how did this user navigate?" is currently unanswerable.

## Goals

1. Superadmin log viewer at `/admin/logs` (frontend-main), dev and prod.
2. Quick filters: severity, container, tenant, user, IP, time range — all
   **dynamic facets**: each filter's options show only values (with counts)
   that exist under the other currently-active filters; zero-count options
   disappear.
3. Fast substring search over log messages.
4. 14-day hot retention in Postgres; daily gzipped archives to object storage
   (MinIO dev / Hetzner prod) kept indefinitely.
5. Per-user visibility: every app log line attributable to the user who caused
   it; a request-level activity trail (API calls + true page views, stitched
   by session) answering "what is this user doing on the site?".

## Non-goals

- Alerting/notifications on error spikes (future; Sentry SDK already ships in
  prod and remains untouched).
- Browsing S3 archives from the panel (download + `zcat | grep` instead).
- Caddy access logs (the Django-side activity trail covers request visibility).
- Coach-facing logs. Everything here is superadmin-only (`IsSuperUser`).
- Loki/Grafana. Rejected for now: ~300–400MB RAM on a box where every service
  is `mem_limit`-rationed, a second query language, and its S3 chunks are
  internal binary — useless as a human archive — while 14d retention would
  delete them anyway. Revisit only if volume grows ~100×.

## Architecture

```
all containers ── stdout ──> docker json-file driver          (unchanged; `docker logs` still works)
                                   │
vector (new service, dev + prod, mem_limit 128m)
  • docker_logs source via /var/run/docker.sock (ro)          (works on Docker Desktop AND Linux)
  • excludes its own container (no feedback loop)
  • multiline aggregation for django/celery-* (tracebacks stay one event)
  • http sink → disk buffer, batching, retry
                                   │
POST /api/v1/platform/logs/ingest/   (shared-secret X-Logs-Token; internal network only)
  • per-container-family parsing: level, logger, tenant, user, message
  • level floors: INFO+ for django/celery-*; WARNING+ for caddy/postgres/redis/nextjs-*
  • routes structured activity/pageview JSON lines → RequestEvent, everything else → LogEntry
  • bulk_create(ignore_conflicts=True) — dedupe via unique constraint
                                   │
Postgres public schema (new SHARED_APP: apps.logbook)
  • LogEntry      — app/infra log lines, 14d
  • RequestEvent  — API-call + page-view trail, 14d
  • LogArchiveDay — which (day, kind) archives landed in S3
                                   │
celery-beat  03:40 archive completed days → S3   •   04:20 purge >14d (archived-only, 21d hard cap)
                                   │
/admin/logs (frontend-main superadmin SPA)
  • tabs: Logs | Activity — shared filter bar, dynamic facets
  • GET /api/v1/platform/logs/          + /facets/
  • GET /api/v1/platform/activity/      + /facets/
```

Principles: Vector is a dumb, reliable transport — **all parsing lives in
Django** (testable Python, one place). The request path never writes to the
log tables — activity and page views travel as structured log lines through
the same pipeline.

## Components

### 1. Vector collector (`vector` service, dev + prod compose)

- Official `timberio/vector` image, pinned minor version; `docker.sock`
  mounted read-only; `cap_drop: ALL`, `read_only: true`, no ports published;
  prod `mem_limit: 128m`, `restart: unless-stopped`, json-file logging like
  the rest of the fleet.
- `docker_logs` source scoped to the compose project (label filter), excluding
  the vector container itself. Multiline: for `django` / `celery-worker` /
  `celery-beat`, a new event starts at our timestamp prefix
  (`^\d{4}-\d{2}-\d{2}T`), continuation lines append (glues tracebacks to
  their parent record). Other containers: line = event.
- `http` sink → `http://django:8000/api/v1/platform/logs/ingest/` with
  `X-Logs-Token`; JSON array encoding, batch max ~500 events / 1s flush;
  disk buffer (64MB cap, drop-oldest beyond); retries on 5xx/connection
  failure.
- Vector restart = brief collection gap (docker_logs has no persistent
  checkpoint); overlap on reconnect is absorbed by dedupe. Accepted.

### 2. `apps.logbook` (new SHARED_APP, public schema)

**LogEntry**

| field      | type                          | notes                                        |
|------------|-------------------------------|----------------------------------------------|
| ts         | DateTimeField (µs)            | docker's timestamp, not arrival time          |
| container  | CharField(64)                 | compose service name (`django`, `caddy`, …)   |
| stream     | CharField(8)                  | stdout / stderr                               |
| level      | CharField(10), choices        | DEBUG/INFO/WARNING/ERROR/CRITICAL             |
| logger     | CharField(128), blank         | e.g. `apps.blog.tasks` when parseable         |
| tenant     | CharField(63), blank, indexed | schema name from `[tenant=…]`; `-` → empty    |
| user_label | CharField(254), blank         | email from `[user=…]` when present            |
| message    | TextField                     | prefix-stripped; truncated at 16KB            |
| line_hash  | CharField(32)                 | md5(message)                                  |

Constraints/indexes: unique `(container, ts, line_hash)` (ingest retries can't
duplicate); btree `(level, ts)`, `(container, ts)`, `(tenant, ts)`,
`(user_label, ts)`; **pg_trgm GIN on message** (extension created in the
migration; postgres:17-alpine ships contrib).

**RequestEvent**

| field      | type                           | notes                                          |
|------------|--------------------------------|-------------------------------------------------|
| ts         | DateTimeField (µs)             |                                                  |
| kind       | CharField(10)                  | `api` \| `pageview`                              |
| tenant     | CharField(63), blank, indexed  | resolved by django-tenants from Host             |
| user_label | CharField(254), blank          | email when authenticated                         |
| ip         | GenericIPAddressField, null    | CF-Connecting-IP → X-Forwarded-For → REMOTE_ADDR |
| session_id | CharField(36), blank, indexed  | per-tab UUID from the frontends (see §5)         |
| method     | CharField(8), blank            | api only                                         |
| path       | CharField(512)                 | sensitive query params redacted (see below)      |
| status     | PositiveSmallInt, null         | api only                                         |
| duration_ms| PositiveInt, null              | api only                                         |
| referrer   | CharField(512), blank          | pageview only                                    |
| user_agent | CharField(256), blank          | truncated                                        |
| line_hash  | CharField(32)                  | md5 of the source JSON line                      |

Unique constraint `(kind, ts, line_hash)` — same dedupe scheme as LogEntry.

Indexes: `(kind, ts)`, `(tenant, ts)`, `(user_label, ts)`, `(session_id, ts)`,
`(ip, ts)`.

**LogArchiveDay**: `date`, `kind` (`logs` | `activity`), `object_key`,
`line_count`, `created_at`; unique `(date, kind)`.

**Query-param redaction:** before storage, values of `token`, `key`, `code`,
`signature`, `session`, `password` (settings-configurable list) are replaced
with `…` — magic-link tokens appear in URLs today and must never sit in a
14-day table or S3 archive.

### 3. Ingest endpoint

`POST /api/v1/platform/logs/ingest/` — `@authentication_classes([])` (public
endpoints MUST set this per repo auth rules) + constant-time check of
`X-Logs-Token` against `LOGS_INGEST_TOKEN` env (403 otherwise; endpoint is
never exposed via Caddy routes to the outside — Vector reaches Django on the
internal network, but the token guards it regardless). Body: JSON array from
Vector, ≤2MB, ≤500 events.

Per event: identify container family → parse → floor-filter → route:

- **django / celery-\***: our format
  `2026-07-19T12:00:00+0000 ERROR   apps.blog [tenant=x] [user=a@b.c] msg`.
  Lines whose logger is `apps.logbook.activity` carry a JSON payload and
  become RequestEvent rows instead.
- **gunicorn** (same container): `[2026-07-19 …] [123] [ERROR] msg`.
- **caddy**: JSON lines; `level` field maps directly.
- **postgres**: `LOG:` → INFO (floored out), `WARNING/ERROR/FATAL/PANIC` kept.
- **redis**: `#` marker → WARNING, else INFO (floored out).
- **nextjs-\***: keyword heuristic (`⨯`, `Error`, `error`, `warn`) → else INFO.
- Unparseable lines: kept with `level=INFO` (subject to that container's
  floor), full line as message — never dropped silently by a parse bug.

Floors (env-overridable): `django`, `celery-worker`, `celery-beat` → INFO+;
everything else → WARNING+. Response `{accepted, stored}`; DB failure → 5xx →
Vector retries from its buffer.

### 4. Identity stamping (user on every log line)

A `user_context` contextvar module in `apps.logbook`:

- `TenantJWTAuthentication.authenticate()` sets it on success (DRF resolves
  JWTs at view level, so middleware alone cannot see the user — the auth class
  is the correct hook).
- A response middleware clears it after every request (and the celery task
  boundary never sets it — task logs carry tenant only).
- `TenantContextFilter` grows a sibling `UserContextFilter`; the console
  format becomes
  `%(asctime)s %(levelname)-7s %(name)s [tenant=%(tenant)s] [user=%(user)s] %(message)s`
  (`-` when anonymous). Ingest parses it back out.

### 5. Activity trail & page-view beacon

**API activity (server-side).** `RequestActivityMiddleware` (after tenant
middleware) times the request and, in `process_response`, emits one JSON line
on logger `apps.logbook.activity`: kind=api, user (readable post-DRF because
DRF's `request.user` setter propagates to the underlying request), tenant, ip,
session id (`X-Session-Id` header when present), method, redacted path,
status, duration_ms, truncated UA. Exclusions (settings list): `/api/health/`,
`/static/*`, OPTIONS, `/api/v1/platform/logs/*` and `/api/v1/platform/activity/*`
(watching the panel must not generate activity), `/api/v1/track/*`
(pageview endpoint self-noise), `/api/v1/dev/*`.

**Page-view beacon (client-side, both frontends).** A small `TrackPageView`
client component in each app's root layout:

- On App Router route change (`usePathname`/`useSearchParams` effect), POST
  `{path, referrer}` to `/api/v1/track/pageview/` via `fetch(..., {keepalive:
  true})` with the app's normal auth header when logged in (sendBeacon can't
  set headers). Fire-and-forget; errors swallowed; never blocks navigation.
- Per-tab session id: `crypto.randomUUID()` in `sessionStorage` — session-
  scoped, first-party, no persistent identifier for anonymous visitors. Both
  apps' API clients also send it as `X-Session-Id` on every API call, so page
  views and API calls stitch into one chronological journey per session.
- Dedupe: skip if same path fired <1s ago (App Router prefetch never runs
  effects, so prefetches don't count).

**Pageview endpoint.** `POST /api/v1/track/pageview/` — authentication classes
include `TenantJWTAuthentication` but permission `AllowAny` (attribute user
when a token is present, accept anonymous otherwise). Tenant comes from the
Host header via normal tenant resolution (marketing apex → `public`). Rate
limited per IP (reuse `TenantRateLimitMiddleware` bucket, ~60/min). The view
only emits the same structured JSON log line (kind=pageview) — no DB write in
the request path; the pipeline delivers it within a flush interval (seconds).

**Privacy stance:** first-party only, no third-party sharing, session ids are
per-tab and non-persistent, IP+UA live 14 days hot and then only in the
private-bucket archive, sensitive query params redacted, superadmin-only
visibility. Disclose in the privacy policy; revisit consent UX only if
persistent identifiers are ever added.

### 6. Retention & S3 archive

- `archive_logbook_days` (beat 03:40 UTC): for each fully-elapsed day without
  a `LogArchiveDay` row, stream that day's rows ordered by ts and upload
  `logs/archive/YYYY/MM/DD.ndjson.gz` and `activity/archive/YYYY/MM/DD.ndjson.gz`
  to the existing private bucket (`AWS_BUCKET_NAME`, media's boto3 creds/
  endpoint — MinIO in dev). Record the row. Idempotent per (day, kind).
- `purge_logbook` (beat 04:20 UTC): delete rows older than 14 days **whose day
  is archived**; hard-cap: any rows older than 21 days are deleted regardless,
  logging an ERROR (which itself surfaces in the panel) so a silently failing
  archive can't grow the table forever.
- Archives are kept indefinitely (bucket lifecycle rules can be added later).

### 7. Panel API (platform, `IsSuperUser`)

- `GET /api/v1/platform/logs/` — `level`, `container`, `tenant`, `user`, `q`
  (icontains, trigram-backed), `since`, `until`; keyset pagination
  `(ts, id)`, 100/page, newest first → `{results, next_cursor}`.
- `GET /api/v1/platform/logs/facets/` — same params → per-dimension value+count
  lists (`levels`, `containers`, `tenants`, `users` top-20 + `q`-typeahead),
  where each dimension is computed with all **other** active filters applied
  and zero-count values omitted. One GROUP BY per dimension.
- `GET /api/v1/platform/activity/` + `/facets/` — same shape; filters `kind`,
  `method`, `status_class` (2xx/3xx/4xx/5xx), `tenant`, `user`, `ip`,
  `session`, `q` (path match), `since`/`until`; facets over kind, method,
  status_class, tenants, users.

Adminkit is intentionally untouched — its new static filter counts remain
right for CRUD panels; these endpoints implement true faceted search, which is
a different contract.

### 8. Frontend `/admin/logs` (frontend-main)

- New nav entry (icon: `scroll-text`) → page with two tabs, **Logs** and
  **Activity**, sharing a sticky filter bar: time-range presets (15m / 1h /
  6h / 24h / 7d / 14d, default 24h), tenant picker, user combobox (facet
  top-20 + typeahead), search input (300ms debounce).
- Logs tab adds level + container chips; Activity tab adds kind, method,
  status-class chips and an IP filter. Chips render facet counts live and
  vanish at zero; active selections stay visible (deselectable) even at zero.
- Logs table: local timestamp (ms), colored level badge (ERROR/CRITICAL red,
  WARNING amber, INFO muted), container, tenant, user, monospace one-line
  message → row click expands full message inline (`pre-wrap`, tracebacks
  readable). Activity table: timestamp, kind badge, user/IP, tenant, method +
  path, status, duration; session id chip → click filters the tab to that
  session (the chronological journey view).
- Cross-links: from an Activity row, one click to Logs pre-filtered to the
  same user + time window; and vice versa.
- Auto-refresh toggle (5s) + manual refresh + keyset "Load more". Skeleton /
  empty / error states match existing admin pages.

## Failure modes

- **Vector down/restarting**: containers keep logging to json-file; brief gap,
  overlap deduped. **Postgres down**: Vector disk-buffers and retries (panel
  is down then anyway — SSH remains the outage tool). **Log storm**: floors +
  16KB truncation + dedupe + 14d purge bound it. **Beacon abuse**: per-IP rate
  limit, payload schema-validated, anonymous rows carry only IP/UA/path.
- **Loops**: vector excluded from collection; panel/track/ingest endpoints on
  the activity exclusion list; ingest 2xx produces no log line
  (`django.request` only logs warnings).

## Testing

- **Unit (`apps.logbook`)**: parser per container family (fixture lines incl.
  a real multiline traceback), floors, tenant/user extraction, redaction,
  ingest auth + dedupe + routing (activity JSON → RequestEvent), facet
  correctness (dimension excludes own filter; zero omitted), keyset
  pagination, archive content/idempotency (against MinIO or botocore stubs,
  matching existing media-test patterns), purge guard (archived-only + 21d
  hard cap + ERROR emission), pageview endpoint (attribution, anonymous, rate
  limit), middleware exclusions.
- **Frontend**: vitest for the tracker (fires on path change, 1s dedupe,
  session id stability per tab).
- **e2e**: new spec — seed via ingest endpoint (token in dev `.env`), assert
  rows render, assert picking `error` narrows the container facet, assert a
  browsed page produces a pageview row with a session trail; register in
  `e2e/impact-map.json` (selector self-test enforces this).
- **Verification**: `make dev` + panel walkthrough before claiming done; prod
  rollout = vector service in `docker-compose.prod.yml`, `LOGS_INGEST_TOKEN`
  in `.env.prod`, `make deploy`, then verify facets/archive on the box.

## Rollout

1. Backend app + ingest + Vector in dev compose → verify logs flow locally.
2. Panel (Logs tab) → verify filters/search/facets in dev.
3. Activity middleware + beacon + Activity tab → verify journeys in dev.
4. Retention/archive tasks → verify MinIO objects + purge in dev.
5. Prod: compose + env + deploy; watch RAM (`vector` capped 128m); confirm
   day-1 archive object appears.

## Decisions log

- Postgres over Loki (RAM budget, one query system, human-readable archives).
- Vector over promtail/custom tailer (macOS Docker Desktop needs socket
  streaming, not file tails; checkpoint/batch/backpressure solved, ~60MB).
- Parsing in Django ingest, not Vector VRL (testability, single place).
- Activity/pageviews ride the log pipeline as structured lines → typed table
  at ingest (zero request-path DB writes, one transport).
- Email as user identifier (per-schema PKs collide across tenants).
- Beacon in v1 at user request; session stitching via shared `X-Session-Id`.
