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

## Architecture decision (Approach 2, chosen)

**Revised from the original Approach 1.** Implementation surfaced that students live in the **tenant** schema, not public (per CLAUDE.md: magic-link students are auto-registered in the tenant schema; only coaches exist in public). A public-schema event table therefore **cannot hold a real FK to a student**.

So telemetry lives **per-tenant**: `apps.usage` is a **TENANT app** and `UsageEvent` sits in each tenant's own schema with a real `user` FK to that tenant's users. Per-student display and the coach dashboard are naturally tenant-scoped with full referential integrity (the schema *is* the tenant — no `tenant` column needed). The superadmin platform-wide view (Phase C) aggregates across tenants by iterating tenant schemas (or a periodic rollup). Rejected: public table with a user FK (impossible — students aren't in public); public table with a FK-less `user_id` int (keeps superadmin a single query but loses integrity); 3rd-party (can't surface per-student in our own admin).

## Data model — new TENANT app `apps.usage`

Register `"apps.usage"` in **TENANT_APPS** (per-tenant schema).

`UsageEvent` (lives in the tenant schema — no tenant column; the schema identifies the tenant):
- `user` → FK `settings.AUTH_USER_MODEL` (the tenant's user, e.g. a student)
- `mode` — `CharField(choices=[("pwa","PWA"),("browser","Browser")])`
- `platform` — `CharField(choices=[("ios","iOS"),("android","Android"),("desktop","Desktop"),("other","Other")])`
- `day` — `DateField`
- `created_at` — `DateTimeField(auto_now_add=True)`
- `Meta.unique_together = ("user","mode","platform","day")` → self-dedupes to one row/day per dimension.

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
  - Validate `mode`/`platform` against the choices (400 otherwise). Record only when `request.user.role == "student"` (else 204 no-op).
  - `UsageEvent.objects.get_or_create(user=request.user, mode=mode, platform=platform, day=timezone.now().date())` (idempotent). The request runs in the tenant's schema (customer subdomain), so the row lands in that tenant — no `tenant` column needed.
  - Update `User`: set `last_display_mode`, `last_platform`; set `first_pwa_at = now()` if `mode == "pwa"` and it's null. `save(update_fields=[...])`.
  - Return `204`.

## Read surfaces

1. **Per-student (coach admin):** add `last_display_mode` + `last_platform` to the student serializer (the coach's student list/detail already serializes `User`). Frontend shows a small badge (e.g. `📱 PWA · iOS` / `🌐 Browser`). No new query — denormalized fields.
2. **Coach dashboard** — `GET /api/v1/admin/usage/summary/?days=30` (owner/coach only): returns `{ pwa_sessions, browser_sessions, pwa_pct, installed_students, daily: [{day, pwa, browser}] }` aggregated from the tenant's own `UsageEvent` rows (naturally scoped — the request runs in that tenant's schema, no tenant filter needed). A widget on the coach `/admin` dashboard renders the split + trend + install count.
3. **Superadmin dashboard** — platform/superadmin API that aggregates **across tenants** by iterating tenant schemas (the `send_live_reminders`/`email_campaigns` pattern: loop tenants, `with tenant_context(tenant):` count) or a nightly rollup into a public summary table: platform-wide totals + `by_tenant: [{tenant, pwa_pct, installed}]`. A widget in the superadmin panel. (Phase C decides iterate-live vs rollup based on tenant count.)

## Cross-cutting

- **Privacy:** only coarse `platform` is derived from the UA; the raw User-Agent is never stored. Daily dedupe means at most one row per user/mode/platform/day.
- **Multi-tenancy:** `UsageEvent` lives in each tenant's schema (real `user` FK, full integrity); coach reads are naturally scoped to the active tenant; the superadmin spans tenants by iterating schemas (or a rollup). The denormalized `User` last-seen fields are written on the tenant's user row (students live in the tenant schema), so the coach's student list reads them directly.
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

- **Superadmin aggregation cost (Phase C)** — iterating tenant schemas to count events is O(tenants); fine at current scale, but Phase C should decide iterate-live vs a nightly rollup into a public summary table once tenant count grows.
- **`day` timezone** — uses server (UTC) date; trend buckets are UTC days. Acceptable for adoption metrics; revisit if per-tenant-tz buckets are ever needed.
- **Multi-tenant student identity** — students are per-tenant rows (magic-link registers them in each tenant's schema), so `last_display_mode` and `UsageEvent` are naturally per-tenant; no cross-tenant bleed.
