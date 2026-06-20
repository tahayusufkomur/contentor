# PWA / Browser Usage Tracking — Design Spec

**Date:** 2026-06-20
**Status:** Draft for review
**Builds on:** the Student PWA feature (`2026-06-20-student-pwa-design.md`) — reuses its `isStandalone()` signal.

## Goal

Know how students reach a coach's app — installed **PWA** vs **browser** — and on what platform. Surface it three ways:
1. **Per-student** in the coach admin (last-seen mode + device on the student record).
2. **Coach adoption dashboard** — tenant-scoped (their students): % PWA, install count, trend.
3. **Superadmin adoption dashboard** — platform-wide across tenants, with a per-tenant breakdown.

Plus the raw capture that underpins all three. (Install **nudge** already ships in the Student PWA feature — out of scope here.)

## Scope

**In scope**
- First-party capture of `(user, tenant, mode, platform, day)` on app load.
- Hybrid storage: a shared `UsageEvent` table (trends/history) + denormalized last-seen on `User` (fast admin display).
- Coach + superadmin read APIs and dashboard widgets; per-student badge in the coach admin.

**Out of scope (v1)**
- Tracking coaches' own (admin) usage — students are the PWA audience.
- Full funnels / session analytics / a 3rd-party tool (PostHog/GA). First-party only.
- Per-event device detail beyond coarse platform (no raw User-Agent stored — privacy).
- Real-time; daily granularity is enough.

## Architecture decision (Approach 1, chosen)

Telemetry lives in the **public schema** as a shared app `apps.usage`, with a `tenant` FK for attribution. One source feeds all three surfaces: superadmin aggregation is a single query, the coach dashboard filters by tenant, and per-student display reads denormalized fields on the (shared) `User`. Rejected: per-tenant-schema events + rollup job (more moving parts for the same result); 3rd-party (can't surface per-student inside our own admin, messy multi-tenant separation).

## Data model — new shared app `apps.usage`

Register `"apps.usage"` in **SHARED_APPS** (public schema).

`UsageEvent`:
- `user` → FK `settings.AUTH_USER_MODEL`
- `tenant` → FK to the django-tenants tenant model (the `get_tenant_model()` model in `apps.core`; reference by its concrete label, e.g. `"core.Tenant"` — verify the exact name at implementation)
- `mode` — `CharField(choices=[("pwa","PWA"),("browser","Browser")])`
- `platform` — `CharField(choices=[("ios","iOS"),("android","Android"),("desktop","Desktop"),("other","Other")])`
- `day` — `DateField`
- `created_at` — `DateTimeField(auto_now_add=True)`
- `Meta.unique_together = ("user","tenant","mode","platform","day")` → self-dedupes to one row/day per dimension.

Denormalized on `User` (`apps.accounts`, shared — shared migration):
- `last_display_mode` — `CharField(blank=True, default="")`
- `last_platform` — `CharField(blank=True, default="")`
- `first_pwa_at` — `DateTimeField(null=True, blank=True)` (first time seen in PWA mode → "installed" proxy)

## Capture flow

- **Client reporter** (`frontend-customer`): a small client component mounted in the root layout (next to the existing PWA components). On mount, for an authenticated load only, it checks a `sessionStorage` flag; if unset, it detects:
  - `mode` = `isStandalone() ? "pwa" : "browser"` (reuse `@/lib/push`).
  - `platform` = coarse from `navigator.userAgent`: iphone/ipad/ipod → `ios`, android → `android`, else `desktop` (→ `other` only if UA missing).
  Then POSTs `{mode, platform}` to `/api/v1/me/usage/` via `clientFetch` and sets the `sessionStorage` flag (so it fires at most once per browser session). Failures are swallowed (telemetry must never break the page).
- **Endpoint** `POST /api/v1/me/usage/` (default `TenantJWTAuthentication`, `IsAuthenticated`):
  - Validate `mode`/`platform` against the choices (400 otherwise).
  - Resolve the tenant from `connection.tenant` (django-tenants); `user = request.user`.
  - `UsageEvent.objects.get_or_create(user=user, tenant=tenant, mode=mode, platform=platform, day=timezone.now().date())` (idempotent).
  - Update `User`: set `last_display_mode`, `last_platform`; set `first_pwa_at = now()` if `mode == "pwa"` and it's null. `save(update_fields=[...])`.
  - Return `204`.
  - `UsageEvent` is a SHARED-app model → django-tenants writes it to the public schema regardless of the request's tenant; the `tenant` FK records attribution.

## Read surfaces

1. **Per-student (coach admin):** add `last_display_mode` + `last_platform` to the student serializer (the coach's student list/detail already serializes `User`). Frontend shows a small badge (e.g. `📱 PWA · iOS` / `🌐 Browser`). No new query — denormalized fields.
2. **Coach dashboard** — `GET /api/v1/admin/usage/summary/?days=30` (owner/coach only, tenant-scoped to `connection.tenant`): returns `{ pwa_sessions, browser_sessions, pwa_pct, installed_students, daily: [{day, pwa, browser}] }` aggregated from `UsageEvent` filtered by the current tenant. A widget on the coach `/admin` dashboard renders the split + trend + install count.
3. **Superadmin dashboard** — endpoint in the platform/superadmin API (no tenant filter): platform-wide totals + `by_tenant: [{tenant, pwa_pct, installed}]`. A widget in the superadmin panel.

## Cross-cutting

- **Privacy:** only coarse `platform` is derived from the UA; the raw User-Agent is never stored. Daily dedupe means at most one row per user/mode/platform/day.
- **Multi-tenancy:** `UsageEvent` is shared/public with a `tenant` FK; coach reads filter by `connection.tenant`; superadmin reads span all tenants. Per-student `User` fields are global to the user (one person, one device profile) — acceptable for the coach's view.
- **Auth:** capture + coach summary use `TenantJWTAuthentication`; superadmin endpoint uses the existing superadmin auth/permission.
- **i18n:** new student-facing strings: none (reporter is invisible). Admin/dashboard labels → `en` + `tr`.
- **Failure isolation:** the client reporter and the capture endpoint must degrade silently; a telemetry failure never affects the page or the user's request.

## Testing

- Backend (pytest): `UsageEvent` daily dedupe (unique constraint); `POST /me/usage/` upserts + updates `User` last-seen + sets `first_pwa_at` once; coach summary aggregates and is **tenant-scoped** (one tenant's events don't leak into another's numbers); superadmin summary spans tenants + per-tenant breakdown.
- Frontend: reporter fires at most once per session (sessionStorage guard) and only when authenticated; build passes. Dashboard widgets render from the summary payloads.

## Rollout (suggested phases — one plan each)

- **Phase A — Capture + per-student:** `apps.usage` + `UsageEvent` + `User` fields + `/me/usage/` endpoint + client reporter + per-student badge in coach admin. (Foundation + cheapest read surface.)
- **Phase B — Coach dashboard:** `/api/v1/admin/usage/summary/` + the coach `/admin` widget.
- **Phase C — Superadmin dashboard:** platform-wide endpoint + superadmin panel widget.

## Risks / open questions

- **Tenant FK from a shared model** to the django-tenants tenant model — confirm the concrete model label and that the FK/migration behaves in the public schema (verify against `apps.core` at implementation).
- **`day` timezone** — uses server (UTC) date; trend buckets are UTC days. Acceptable for adoption metrics; revisit if per-tenant-tz buckets are ever needed.
- **Multi-tenant student identity** — a user who is a student in several tenants has one global `last_display_mode` on `User`; per-tenant `UsageEvent` rows still attribute sessions correctly, so dashboards stay accurate.
