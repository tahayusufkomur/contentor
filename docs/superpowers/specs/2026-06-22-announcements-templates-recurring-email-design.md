# Announcements: Templates, Recurring, and Email — Design

Date: 2026-06-22
Status: Approved design, pending implementation plan
Builds on: the Coach Announcements Lab (`apps.notifications`, see `docs/superpowers/specs/2026-06-21-announcements-lab-design.md`).

## Summary

Extend the Coach Announcements Lab with three capabilities, built together:

1. **Templates** — a library of starter announcements (built-in set + coach-saved custom), so a non-technical coach starts from ready, theme-branded content instead of a blank box.
2. **Recurring** — send the same announcement on a simple repeating schedule (daily / weekly / monthly) in the tenant's timezone.
3. **Email** — optionally also deliver the announcement as a theme-branded email (in addition to in-app feed + push), with proper unsubscribe handling.

Audience is non-technical coaches; every surface favors plain language, pickers, and sensible defaults (see the `contentor-coach-non-technical-ux` principle). This is **not** the MailCraft campaign system in `apps.email_campaigns`; announcement email is a lightweight, transactional-style branded send.

## Goals

- Coaches start announcements from built-in, brand-aware templates and can save their own.
- Coaches can flip on "Also send as an email," delivered with the tenant's brand/theme.
- Coaches can set an announcement to repeat daily/weekly/monthly with a start and optional end.
- Emailing students is compliant: one-click unsubscribe + `List-Unsubscribe` header + opt-out suppression.
- Each concept is a small, single-purpose unit, independently testable.

## Non-goals (YAGNI)

- No cron-like arbitrary recurrence (presets only).
- No per-send channel matrix — push + feed stay as today; email is a single toggle.
- No reuse of MailCraft/`email_campaigns` rendering or quota.
- No template categories/folders, versioning, or sharing across tenants.
- No A/B testing, drip sequences, or analytics dashboards beyond per-recipient status.

## Architecture (chosen: separate single-purpose models)

Rejected alternatives: overloading `Announcement` with recurrence + template flags (muddies the sent-record semantics and history queries); `django-celery-beat` PeriodicTask per tenant (heavy, fragile under schema-aware beat). Chosen approach mirrors the existing per-minute `dispatch_due_announcements` beat and keeps responsibilities isolated.

### Data model (all tenant-schema, `apps.notifications`)

**New: `AnnouncementTemplate`** (coach-saved custom templates only; built-ins live in code)
- `name` CharField(120)
- `title` CharField(200)
- `body` TextField (sanitized HTML, via existing `sanitize_rich_text`)
- `link` CharField(500, blank)
- `link_label` CharField(200, blank) — friendly label for the link picker chip
- `created_by` FK(User, SET_NULL, null), `created_at` auto
- Meta: ordering `-created_at`

**New: `RecurringAnnouncement`** (a rule that spawns `Announcement`s)
- Content: `title`, `body`, `link`, `link_label`, `filters_json` (JSON, default dict), `also_email` (bool)
- Schedule:
  - `frequency` — choices `daily` / `weekly` / `monthly`
  - `send_time` — TimeField (tenant-local time of day)
  - `weekday` — SmallInt null (0=Mon..6=Sun; used when `weekly`)
  - `day_of_month` — SmallInt null (1..31, clamped to month length; used when `monthly`)
  - `start_date` — DateField
  - `end_date` — DateField null (null = "until I stop")
  - `next_run_at` — DateTimeField (UTC; computed)
  - `is_active` — bool default True
- `created_by` FK, `created_at` auto
- Meta: ordering `-created_at`

**Changed: `Announcement`**
- `also_email` BooleanField(default=False)
- `recurrence` FK(`RecurringAnnouncement`, SET_NULL, null, related_name="instances") — provenance of a spawned instance (null for one-off sends)

**Changed: `AnnouncementRecipient`**
- `email_status` CharField choices `none` / `sent` / `failed` (default `none`) — parallel to `push_status`

**New: `EmailOptOut`** (tenant; announcement-email suppression)
- `user` FK(User, CASCADE, null) — null allowed for email-only opt-outs
- `email` CharField(254, db_index) — lowercased
- `created_at` auto
- Unique on `email`

### Built-in templates (code constants, not DB)

A module `apps/notifications/templates_builtin.py` exposes `BUILTIN_TEMPLATES: list[dict]`, each `{ key, name, title, body, link?, link_label? }`. Bodies may contain `{brand}`, filled from `TenantConfig.brand_name` at list time. Initial set (~6): Welcome, New course live, Live-session reminder, Promo / sale, We miss you, Schedule change. Built-ins are merged with custom `AnnouncementTemplate`s in the list endpoint (built-ins first, flagged `builtin: true`, `id: "builtin:<key>"`).

## Email channel

### Rendering
- `payloads.announcement_email_html(announcement, cfg) -> (subject, html)`:
  - Inline-styled HTML only (no `<style>`/CSS vars — email-client safe), structured like `core.email.send_magic_link`'s inline approach.
  - Brand: `cfg.brand_name`, logo from `cfg.logo_url` (fallback to brand text).
  - Color: `THEME_EMAIL_COLORS: dict[TenantTheme, str]` (one hex per named theme) — because emails cannot use the frontend oklch tokens. Default to Ocean's hex if a theme is unmapped.
  - Content: subject = announcement title; H1 title; sanitized `body` HTML; a CTA button when `link` is set (absolute URL to the tenant domain + path); footer with brand + **unsubscribe link**.
  - Body HTML is the already-sanitized announcement body; re-sanitize defensively at render.

### Sending
- `services.send_announcement_emails(announcement) -> int`:
  - Recipients = the announcement's `AnnouncementRecipient` users with a non-blank email, **excluding** any in `EmailOptOut` (by email, lowercased).
  - Batched send via `core.email.send_email` (Resend), `from_name = cfg.brand_name`; set `List-Unsubscribe` (requires extending `send_email` to accept extra headers).
  - Update each recipient's `email_status` to `sent`/`failed`.
- Trigger: `send_announcement_to_recipients` (after push/feed) calls `send_announcement_emails` when `announcement.also_email`. Keep within the same fanout task; large audiences are chunked to respect Resend limits (reuse a batching helper).

### Compliance / unsubscribe
- Signed token (Django `signing`, namespaced) encodes `{tenant_schema, user_id|email}`.
- Public endpoint `GET /api/v1/notifications/email/unsubscribe/?t=<token>` (no auth, `@authentication_classes([])`) → upserts `EmailOptOut`, returns a simple confirmation page/JSON.
- Every announcement email includes the unsubscribe URL in the footer and the `List-Unsubscribe` header (mailto + URL form).
- Opt-out is per-tenant (lives in the tenant schema).

## Recurring engine

- New beat task `tasks.dispatch_due_recurrences()` (schedule: every minute, alongside `dispatch_due_announcements`):
  - For each non-public tenant, within `tenant_context`: select `RecurringAnnouncement` where `is_active and next_run_at <= now`.
  - **Exactly-once claim** (mirrors the announcements-lab atomic claim, adapted because the rule persists rather than being consumed): compute `new_next` first, then claim by `RecurringAnnouncement.objects.filter(pk=rule.pk, next_run_at=old_next).update(next_run_at=new_next, is_active=<still active?>)`. If 0 rows are updated, another worker already advanced it → skip without spawning. Only the worker that won the claim spawns.
  - Spawn a normal `Announcement` (status `scheduled`, `scheduled_at=now`, `also_email`, `recurrence=rule`, copy content + `filters_json`), then call the existing send-now path (`fanout_announcement`/`send_announcement_to_recipients`). The `Announcement` itself keeps its own exactly-once push claim, so even a double-spawn cannot double-deliver.
  - Compute the next `next_run_at` from `frequency`/`send_time`/`weekday`/`day_of_month` in `TenantConfig.timezone` (convert to UTC for storage). If the next occurrence is past `end_date`, set `is_active=False`.
- `next_run_at` is initialized on rule create/update from `start_date` + `send_time` in tenant tz (never in the past — roll forward to the next valid slot).
- Recurrence math lives in a pure, unit-tested helper `recurrence.next_occurrence(rule, after, tz)` (no DB), so daily/weekly/monthly + month-length clamping + tz + end-date are tested in isolation.

## API (coach, `IsCoachOrOwner`, under `/api/v1/admin/notifications/`)

- Templates: `GET templates/` (built-ins + custom), `POST templates/` (create custom), `DELETE templates/<id>/` (custom only; reject `builtin:` ids).
- Recurring: `GET recurring/`, `POST recurring/`, `GET/PATCH/DELETE recurring/<id>/`. PATCH recomputes `next_run_at` when schedule fields change; `is_active` toggle = pause/resume.
- Announcement create (`announcement_collection` POST): accept `also_email` (bool, default False).
- Public: `GET notifications/email/unsubscribe/` (no auth).

Serializers extend the existing notifications serializers; recurrence serializer validates field combos (e.g. `weekly` requires `weekday`, `monthly` requires `day_of_month`) and that `end_date >= start_date`.

## Frontend (`frontend-customer`, coach `/admin/notifications`)

- **Compose** (`announcement-compose.tsx`):
  - **"Start from template"** button → picker modal (built-ins + custom, search), fills title/body/link/link_label; **"Save as template"** action (prompts for a name).
  - **"Also send as an email"** toggle (plain-language helper text; shows it will use their brand).
  - **Once / Repeating** switch. *Once* keeps today's optional datetime. *Repeating* reveals plain presets: frequency (Daily/Weekly/Monthly), day picker (weekday or month-day as needed), time, start date, and "Ends: never / on date." All in the tenant's timezone, labeled as such.
  - Reuse the existing reach preview + empty-state.
- **Manage views** under `/admin/notifications`:
  - **Templates**: list custom templates, delete.
  - **Recurring**: list active rules with next-run (tenant-local), pause/resume, delete.
- API client (`lib/announcements.ts`) gains template + recurring + `also_email` types/methods.

## Testing

- Templates: built-in+custom merge, custom create/delete, `builtin:` delete rejected, `{brand}` fill.
- Email: `announcement_email_html` (subject/CTA/unsubscribe present, theme color resolved), `send_announcement_emails` suppresses opt-outs and sets `email_status`, unsubscribe endpoint upserts `EmailOptOut`, `also_email=False` sends no email.
- Recurring: `recurrence.next_occurrence` for daily/weekly/monthly incl. month-length clamp, tenant tz (e.g. non-UTC), end-date deactivation, never-in-past init; `dispatch_due_recurrences` spawns an `Announcement` + advances next run; exactly-once under duplicate dispatch.
- Regression: existing announcement send/feed/dispatch tests stay green.

## Migration / deploy notes

- New models + fields are **tenant-app** migrations — now auto-applied on deploy via the entrypoint `migrate_schemas --tenant` step (see `contentor-deploy-tenant-migrations-gotcha`). Still run `makemigrations --check` in CI.
- `core.email.send_email` gains an optional `headers` arg (for `List-Unsubscribe`) — keep backward compatible.
- Add `THEME_EMAIL_COLORS` and `RESEND_FROM_EMAIL`/`VAPID` assumptions already in prod env.

## Open questions (resolved)

- Template meaning → **starter content + branded look** (content stored; theme applied at render).
- Email control → **single "Also email" toggle**.
- Recurrence → **simple presets** (daily/weekly/monthly).
- Template source → **built-in + save custom**.
- Sequencing → **all three in one combined build**.
