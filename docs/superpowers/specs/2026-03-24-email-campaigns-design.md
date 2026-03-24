# Email Campaigns Feature Design

**Date**: 2026-03-24
**Status**: Approved

## Summary

Coaches can draft beautiful email templates using the EmailCraft embeddable builder and send customized emails to their students. Templates are stored in EmailCraft, sending is handled via Resend, and a campaign log tracks all sent emails.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Coach Admin (frontend-customer)                    │
│                                                     │
│  /admin/email/              - Campaign list + log   │
│  /admin/email/templates     - Template library      │
│  /admin/email/compose       - Compose & send flow   │
│                                                     │
│  EmailCraft iframe embedded in template editor      │
│  postMessage ← MAILCRAFT_SAVE → parent page         │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│  Django Backend (new app: apps/email_campaigns)      │
│                                                      │
│  POST /api/v1/email/session     → proxy to EmailCraft│
│  GET  /api/v1/email/templates   → proxy to EmailCraft│
│  POST /api/v1/email/send        → render + Resend    │
│  GET  /api/v1/email/campaigns   → campaign log       │
│                                                      │
│  Models: EmailCampaign (log only)                    │
│  No local template storage — EmailCraft owns that    │
└──────────┬──────────────┬────────────────────────────┘
           │              │
           ▼              ▼
   ┌──────────────┐  ┌─────────┐
   │  EmailCraft   │  │ Resend  │
   │  (templates,  │  │ (SMTP   │
   │   render,     │  │  send)  │
   │   sessions)   │  │         │
   └──────────────┘  └─────────┘
```

### Key Decisions

- New Django app `email_campaigns` keeps email logic isolated.
- Backend proxies all EmailCraft calls — API key never reaches the frontend.
- Only one new model (`EmailCampaign`) for the send log — templates live in EmailCraft.
- Tenant's EmailCraft org is provisioned lazily (first time a coach opens the email feature).
- The org's API key is stored in `TenantConfig` (new field).
- Approach: **Session Token per Coach** — most secure, clean separation.

## Data Model

### New Django settings

| Setting | Description |
|---|---|
| `EMAILCRAFT_TOKEN` | Master site token for provisioning orgs. Platform-level secret from `.env`. |
| `EMAILCRAFT_BASE_URL` | Base URL for EmailCraft API. Default: `https://emailcraft.contentor.app` |

### New field on `TenantConfig`

| Field | Type | Description |
|---|---|---|
| `emailcraft_api_key` | CharField, nullable | EmailCraft org API key. Set once during lazy provisioning. Server-side secret — must be excluded from all serializers and admin displays. |

### New model: `EmailCampaign`

This is a **tenant-schema model** (in `TENANT_APPS`). No FK to `Tenant` — tenant context is implicit via schema isolation, consistent with all other tenant models (Course, Enrollment, TenantConfig, etc.).

| Field | Type | Description |
|---|---|---|
| `id` | BigAutoField, PK | Primary key (integer, consistent with all other models) |
| `subject` | CharField | Email subject line |
| `template_id` | CharField | EmailCraft template UUID reference |
| `template_name` | CharField | Snapshot of template name at send time |
| `sender` | FK to User | Coach who sent the campaign |
| `recipient_filter` | JSONField | See recipient filter spec below |
| `recipient_count` | IntegerField | Number of intended recipients |
| `success_count` | IntegerField, default 0 | Emails successfully sent |
| `failure_count` | IntegerField, default 0 | Emails that failed to send |
| `status` | CharField | `"sending"`, `"sent"`, `"partial"`, `"failed"` |
| `created_at` | DateTimeField | Auto-set on creation |
| `sent_at` | DateTimeField, nullable | Set when sending completes |

**Status definitions:**
- `"sending"` — Celery task is in progress
- `"sent"` — All emails delivered successfully
- `"partial"` — Some emails failed (see `success_count`/`failure_count`)
- `"failed"` — All emails failed or quota exceeded before sending

### Recipient filter spec

The `recipient_filter` JSONField stores the targeting criteria. Filter types:

| Type | Shape | Query logic |
|---|---|---|
| `all` | `{"type": "all"}` | All `User` records with `role="student"` and `is_active=True` in the tenant schema |
| `course` | `{"type": "course", "course_ids": [1, 2]}` | Users enrolled in any of the specified courses (via `Enrollment` model). Integer PKs matching `Course.id`. |
| `individual` | `{"type": "individual", "user_ids": [1, 5, 12]}` | Specific users by integer PK (`User.id`). Must have `role="student"`. |

No local template storage. Templates managed entirely by EmailCraft API.

## Backend API Endpoints

All under `/api/v1/email/`, protected by `IsCoachOrOwner`.

### Provisioning & Sessions

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/email/session` | POST | Creates an EmailCraft session token for the iframe. Lazily provisions the tenant's EmailCraft org if `emailcraft_api_key` is null. Returns `{ sessionToken, expiresAt }` |

### Templates (proxy to EmailCraft)

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/email/templates` | GET | Lists tenant's templates from EmailCraft |
| `/api/v1/email/templates/:id` | GET | Get single template with full JSON |
| `/api/v1/email/templates/:id` | DELETE | Delete a template |
| `/api/v1/email/gallery` | GET | Lists EmailCraft gallery templates |

### Sending

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/email/send` | POST | Body: `{ template_id, subject, recipient_filter }`. **Synchronously** creates an `EmailCampaign` record with `status: "sending"` and returns `{ campaign_id, status: "sending" }`. Then dispatches a Celery task that: (1) fetches recipient list from filter, (2) calls EmailCraft render API per recipient with variables, (3) sends each via Resend, (4) updates campaign `success_count`/`failure_count`, (5) increments `TenantUsage.emails_sent`. Duplicate sends are prevented by rejecting requests if an identical campaign (same `template_id` + `subject`) is already in `"sending"` status for this sender. Simple field comparison — avoids fragile JSONField equality checks. |

### Campaign Log

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/email/campaigns` | GET | List past campaigns (paginated, newest first) |
| `/api/v1/email/campaigns/:id` | GET | Campaign detail with recipient filter info |

## Frontend Routes & UI

All in `frontend-customer/src/app/admin/email/`.

### `/admin/email` — Campaign Dashboard

- Default landing page for the email feature.
- Shows list of past campaigns: subject, date, recipient count, status.
- "New Email" button navigates to compose flow.
- "Templates" button navigates to template library.

### `/admin/email/templates` — Template Library

- Grid/list of saved templates fetched from EmailCraft API.
- Each card shows template name, last modified.
- Actions: Edit (opens composer with template loaded), Delete.
- "Browse Gallery" button to view EmailCraft gallery templates.
- Clicking a gallery template creates a copy in the tenant's templates.

### `/admin/email/compose` — Compose & Send

Two-step flow on a single page:

**Step 1: Design**
- EmailCraft iframe embedded (full width, ~800px height).
- Loaded via session token from `POST /api/v1/email/session`.
- If opened from template library, loads existing template via `MAILCRAFT_LOAD_TEMPLATE` postMessage.
- Coach designs the email, clicks Save → `MAILCRAFT_SAVE` postMessage captured.
- "Next" button becomes active after save.

**Step 2: Send**
- Subject line input.
- Recipient selector:
  - Radio: "All students" / "By course" / "Individual students"
  - Course dropdown (multi-select) when "By course" selected.
  - Student search/picker when "Individual" selected.
- Shows recipient count preview.
- "Send" button calls `POST /api/v1/email/send`.
- Success redirects to campaign dashboard.

Editing an existing template: `/admin/email/compose?template=<emailcraft_template_id>` (query param).

## EmailCraft Integration Details

### Lazy Org Provisioning

First time a coach opens the email feature, the `POST /api/v1/email/session` endpoint:

1. Checks `TenantConfig.emailcraft_api_key`.
2. If null → calls EmailCraft `POST /api/v1/site/provision` with `Authorization: Token <EMAILCRAFT_TOKEN>` and `{ "name": "<tenant_brand_name>" }`.
3. Stores the returned `api_key.raw` in `TenantConfig.emailcraft_api_key`.
4. Configures default variables on the org: `student_name`, `student_email`, `course_name`, `coach_name`, `brand_name`.

### Session Token Flow

1. Backend calls `POST /api/v1/auth/session` with `X-API-Key: <tenant's emailcraft key>` and `{ "origin": "<tenant's domain>" }`.
2. Returns session token (4-hour TTL) to frontend.
3. Frontend embeds `<iframe src="https://emailcraft.contentor.app/builder/?sessionToken=<token>">`.

### Render + Send Flow (Celery Task)

The Celery task receives `campaign_id` and `schema_name` as parameters. It uses `tenant_context(tenant)` to activate the correct schema before querying recipients or updating the campaign record — following the same pattern as `apps.core.tasks.provision_tenant`. Note: `TenantUsage` lives in the public schema, so the usage update must happen **outside** the `tenant_context` block (or via `connection.set_schema_to_public()`) to avoid cross-schema issues.

**Sender identity**: Campaign emails are sent with Resend's `"Name <email>"` format: `from="{coach_name} via {brand_name} <{settings.RESEND_FROM_EMAIL}>"`. This requires extending the existing `send_email` utility to accept an optional `from_name` parameter that composes the from field as `f"{from_name} <{settings.RESEND_FROM_EMAIL}>"`. Per-tenant custom from addresses are deferred to a future iteration.

**Registration**: `apps.email_campaigns` must be added to `TENANT_APPS` in settings so the `EmailCampaign` model is created in each tenant's schema.

For each recipient:

1. Call EmailCraft `POST /api/v1/render` with `X-API-Key: <tenant's emailcraft key>` and `{ template_id, variables: { student_name, student_email, course_name, coach_name, brand_name } }`.
2. EmailCraft returns rendered HTML.
3. Send via Resend with `from_name`, `to=student.email`, `subject=subject`, `html=rendered_html`.
4. Increment `campaign.success_count` on success, `campaign.failure_count` on failure.
5. After all recipients: update `TenantUsage.emails_sent += success_count` (in public schema), set campaign status to `"sent"`, `"partial"`, or `"failed"` (in tenant schema).
6. Respect `PlatformPlan.max_campaign_emails` — check quota before sending and mid-batch to enforce the real limit (mitigates TOCTOU race between quota check and task execution).

### postMessage Handling

Note: The event names use `MAILCRAFT_*` prefix — this is dictated by the EmailCraft library (the product was originally named MailCraft). These are not custom events.

- Listen for `MAILCRAFT_SAVE` → capture `{ html, json }`, store template_id from the save.
- Send `MAILCRAFT_LOAD_TEMPLATE` → load existing template when editing.
- Check `MAILCRAFT_READY` → show loading state until builder is ready.

### Template Variables

| Variable | Source |
|---|---|
| `student_name` | `User.name` of recipient |
| `student_email` | `User.email` of recipient |
| `course_name` | Course name when filtering by a single course. Empty for "all students" or multi-course filters — coaches should avoid using this variable in those contexts. |
| `coach_name` | `User.name` of sender |
| `brand_name` | `TenantConfig.brand_name` |

## Error Handling & Quota

### Quota Enforcement

- Before sending, check `TenantUsage.emails_sent + recipient_count <= PlatformPlan.max_campaign_emails`.
- If exceeded → return 403: "Email quota exceeded for this month."
- Partial sends: if quota runs out mid-batch, the Celery task stops, marks campaign as `"partial"` with `success_count`/`failure_count` reflecting actual delivery.

### Error Handling

- **EmailCraft API down**: Session endpoint returns 503, frontend shows "Email builder temporarily unavailable".
- **Render fails for a recipient**: Skip that recipient, increment `failure_count`, continue with others. Campaign marked `"partial"` if some succeeded.
- **Resend fails**: Same skip-and-continue approach. Status reflects via `success_count`/`failure_count`.
- **Provisioning fails**: Return 500 on session endpoint, coach sees error and can retry.

### No retry mechanism for now

Failed individual sends are logged but not automatically retried.

## Deferred / Future Considerations

- **Unsubscribe links**: CAN-SPAM/GDPR compliance requires unsubscribe. Deferred — will add in a follow-up iteration.
- **Per-tenant custom from addresses**: Requires Resend domain verification per tenant. V1 uses shared `noreply@contentor.app` with custom `from_name`.
- **Delivery webhooks**: Resend bounce/complaint webhooks for reputation management. Not needed for V1.
- **Session token refresh**: 4-hour TTL is sufficient for most editing sessions. If needed later, frontend can re-fetch on expiry.
- **Template deletion cascade**: Deleting a template does not affect campaign log — `template_name` is snapshotted at send time.
- **Rate limiting**: Campaign-specific throttling (e.g., max 1 send per minute) may be needed if abuse occurs. Existing `TenantRateLimitMiddleware` covers basic protection for now.
