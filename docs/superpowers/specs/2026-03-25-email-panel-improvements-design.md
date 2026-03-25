# Email Panel Improvements Design

**Date**: 2026-03-25
**Status**: Approved

## Summary

Three connected improvements to the email campaigns admin panel: a visual template library with previews and filters, a redesigned compose flow that eliminates duplicate templates, and an enhanced campaign dashboard with per-recipient tracking.

## 1. Templates Page Overhaul

### Current State

Templates page shows a flat list of template names with Edit/Preview/Delete actions and a Gallery toggle. No visual previews, no search, no filtering by category or tags.

### New Design

**Layout:** Full-width page with a top bar and responsive card grid below (3 columns desktop, 2 tablet, 1 mobile).

**Top bar (left to right):**
- Search input — filters templates by name, client-side, instant as-you-type
- Category filter pills: "All", "Welcome", "Newsletter", "Promotional", "Transactional", "Event" — filters by the `category` field on templates. Gallery templates always have a category. User templates inherit the category from the gallery template they were copied from; templates started from scratch have no category and appear under "All" only.
- "My Templates" / "Gallery" toggle (same as today)
- "New Email" button (navigates to compose flow)

All filtering is client-side since the full template list is loaded on mount.

**Template cards:**
- Mini HTML preview — small iframe with `pointer-events: none`, ~200px tall, CSS `transform: scale(0.4)` on a 600px-wide container to fit card width
- Template name below the preview
- Category tag badge (e.g. "newsletter" in a colored pill)
- `template_type` indicator — subtle "Gallery" badge for provided templates
- Hover overlay with action buttons (varies by mode):
  - **Library mode (templates page):** "Edit" (opens builder with this template), "Preview" (full modal), "Delete" (confirmation dialog, user templates only)
  - **Picker mode (compose Step 1):** "Use Template" overlay on entire card (creates copy and proceeds to Step 2)

**Preview rendering strategy:**
- On page load, fetch all templates via `GET /api/v1/email/templates/`
- Call `POST /api/v1/email/templates/preview/` with template IDs in batches of 20
- Backend uses EmailCraft's `POST /api/v1/export/html` with `{ json_data, variables_mode: "defaults" }` for each template — this renders HTML with default variable values (e.g. "Student" for `{{student_name}}`), no per-recipient data needed
- Backend renders in parallel using a thread pool (max 4 concurrent) with a 10-second per-template timeout. Partial results are returned — templates that fail to render appear in the `errors` map.
- Frontend caches rendered HTML in component state
- Templates without `json_data` or that fail to render show a placeholder card with template name only

### Why Not Thumbnails

EmailCraft has a `thumbnail_url` field on templates, but thumbnails aren't auto-generated. Most templates would show nothing. Live HTML rendering is heavier but gives real previews for every template.

## 2. Compose Flow Redesign

### Current State

"New Email" drops the coach into the EmailCraft builder with an empty canvas. The coach must save the template in the builder, wait for template ID resolution, then click "Next" to reach the send step. Saving creates a new template each time, leading to duplicates. The template ID resolution uses polling with retries.

### New Design

**Three-step flow on a single page** with a step indicator: `1. Choose Template → 2. Design → 3. Send`

#### Step 1: Choose Template

Same card grid as the templates page (shared component) in a "picker" context. Shows both gallery and user templates with the same search + category filters.

**First item in the grid:** "Start from Scratch" card — empty state icon with dashed border. Always visible, not affected by filters.

**When the coach picks an existing template:**
1. Frontend calls `POST /api/v1/email/templates/copy/` with `{ source_template_id: "<id>" }`
2. Backend fetches the source template's `json_data` from EmailCraft, creates a new template via EmailCraft API with name `"Copy of {original_name}"`, returns `{ id, name }`
3. Frontend stores the copy's ID and advances to Step 2

**"Start from Scratch":**
- Advances to Step 2 with no template loaded
- The builder creates a new template on first save (existing behavior)
- `MAILCRAFT_TEMPLATE_SAVED` event provides the ID after the coach saves

#### Step 2: Design

EmailCraft builder iframe, loaded with:
- The copy's template ID via `MAILCRAFT_LOAD_TEMPLATE` (if picked from Step 1)
- Empty canvas (if "Start from Scratch")

Key changes from current behavior:
- **"Next" button is always enabled** when a template ID is known (from Step 1 copy or from `MAILCRAFT_TEMPLATE_SAVED`)
- For "Start from Scratch", "Next" enables after first save (same as today but with cleaner messaging)
- "Back" returns to Step 1 with a confirmation dialog. The already-created copy stays in the user's templates (not deleted). If the coach picks a different template, a new copy is created. Orphaned copies can be cleaned up from the templates page.
- The builder's internal save updates the copy — no duplicates

#### Step 3: Send

Same as today: subject line input, recipient selector (all/by course/individual), send button. Template ID is already resolved from Step 1 or Step 2. On success, redirect to campaign dashboard.

### Why This Eliminates Duplicates

Today: every "Save" in the builder can create a new template because the parent page doesn't track the ID reliably.

New flow: one copy is created upfront (Step 1) and all builder saves update that copy. The coach never accidentally creates duplicates.

## 3. Campaign Dashboard + Detail

### Campaign List (enhanced)

**Filter bar** at the top of the existing campaigns page:
- Search input — filters by subject, client-side
- Status dropdown: "All statuses", "Sending", "Sent", "Partial", "Failed"
- Date range pills: "Last 7 days", "Last 30 days", "All time" (default: All time) — filters by `created_at` (not `sent_at`, which is null for in-progress campaigns)

Client-side filtering since campaign volumes per tenant are small (capped by email quota). The existing `listCampaigns` endpoint with `limit=100` provides enough data.

**Table rows become clickable** — clicking navigates to `/admin/email/campaigns/[id]`.

### Campaign Detail Page (new)

**Route:** `/admin/email/campaigns/[id]/page.tsx`

**Top section — metadata + email preview:**
- Left column: subject, status badge, sent date, template name, sender name, recipient summary (e.g. "5 recipients — All students"), success/failure counts
- Right column (below on mobile): rendered email HTML in a sandboxed iframe (~400px tall). The rendered HTML is stored on the `EmailCampaign` model at send time (see `rendered_html` field below) so the detail page loads instantly without calling EmailCraft. If `rendered_html` is empty (old campaigns), show "Preview not available for this campaign" placeholder.

**Bottom section — recipient table:**

| Column | Description |
|---|---|
| Name | Recipient name (snapshot at send time) |
| Email | Recipient email (snapshot at send time) |
| Status | "Sent" (green) or "Failed" (red) badge |
| Sent At | Timestamp, blank if failed |
| Error | Error message if failed, blank if sent |

No pagination — campaign recipients are bounded by quota (typically <100).

## Backend Changes

### New Model: `CampaignRecipient`

Tenant-schema model in `apps/email_campaigns/models.py`, added to `TENANT_APPS`.

| Field | Type | Description |
|---|---|---|
| `id` | BigAutoField | PK |
| `campaign` | FK to EmailCampaign | Parent campaign, `on_delete=CASCADE` |
| `user_id` | IntegerField | Recipient user ID (not FK — user may be deleted later) |
| `user_name` | CharField(255) | Snapshot of `User.name` at send time |
| `user_email` | EmailField | Snapshot of `User.email` at send time |
| `status` | CharField | `"sent"` or `"failed"` |
| `error_message` | TextField, blank | Error detail if failed |
| `sent_at` | DateTimeField, nullable | When the individual email was sent |

**Celery task change:** Inside the existing per-recipient loop in `tasks.py`, create a `CampaignRecipient` row after each send attempt (success or failure). The existing `success_count` and `failure_count` fields on `EmailCampaign` are kept and updated as before (denormalized for the campaign list view). The recipient table is the source of truth for per-recipient detail.

Additionally, the Celery task renders the first recipient's email HTML and stores it in `EmailCampaign.rendered_html` for the campaign detail preview. This avoids a synchronous EmailCraft call on the detail page.

### EmailCampaign Model Changes

| Change | Description |
|---|---|
| `sender` FK | Change `on_delete=CASCADE` to `on_delete=SET_NULL, null=True` — preserves campaign history when a coach is deleted |
| `rendered_html` | New TextField, blank — snapshot of rendered email HTML (from first recipient), stored at send time for the detail page preview |
| `recipient_summary` | New CharField(255), blank — human-readable description of the filter, e.g. "All students" or "Yoga 101, Advanced Flow". Generated at send time by looking up course names from `course_ids`. Snapshotted so it survives course deletion. |

### New Endpoints

All new endpoints are protected by `IsCoachOrOwner`, consistent with existing email endpoints.

| Endpoint | Method | Description |
|---|---|---|
| `POST /api/v1/email/templates/copy/` | POST | Copy a template for the compose flow |
| `GET /api/v1/email/campaigns/{id}/recipients/` | GET | List recipients for a campaign |
| `POST /api/v1/email/templates/preview/` | POST | Render template HTML for preview cards |

#### POST /api/v1/email/templates/copy/

**Request:** `{ "source_template_id": "<uuid>" }`

**Logic:**
1. Fetch source template from EmailCraft via `GET /api/v1/templates/{id}/` — this works for both user and gallery templates because `visible_to_org()` includes both org-owned and gallery templates
2. Create new template via EmailCraft `POST /api/v1/templates/` with `{ name: "Copy of {source.name}", json_data: source.json_data, category: source.category }` — the new template inherits the category from the source
3. Return `{ id, name }` of the new template

**Response (201):** `{ "id": "<uuid>", "name": "Copy of Welcome Email" }`

**Errors:**
- 404 if source template not found
- 502 if EmailCraft API fails

**Loading state:** Frontend shows a spinner overlay on the selected card while the copy is in progress (two API calls, up to 30 seconds worst case).

#### GET /api/v1/email/campaigns/{id}/recipients/

**Response (200):**
```json
{
  "results": [
    {
      "id": 1,
      "user_name": "Jane Doe",
      "user_email": "jane@example.com",
      "status": "sent",
      "error_message": "",
      "sent_at": "2026-03-25T10:00:00Z"
    }
  ]
}
```

#### POST /api/v1/email/templates/preview/

Batch-renders template HTML for preview cards using EmailCraft's **export** endpoint (not the render endpoint — no variables needed).

**Request:** `{ "template_ids": ["<uuid1>", "<uuid2>", ...] }`

**Logic:**
1. For each template ID, fetch full template (with `json_data`) from EmailCraft via `GET /api/v1/templates/{id}/`
2. For each template's `json_data`, call EmailCraft `POST /api/v1/export/html` with `{ json_data, variables_mode: "defaults" }` — this renders HTML using each variable's default value (e.g. "Student" for `{{student_name}}`)
3. Backend uses `concurrent.futures.ThreadPoolExecutor(max_workers=4)` to parallelize the fetch+export calls
4. Each template has a 10-second timeout. Templates that time out or fail appear in `errors` map; successful renders appear in `previews` map
5. Returns partial results — the endpoint never fails entirely due to individual template errors

**Response (200):**
```json
{
  "previews": {
    "<uuid1>": "<html>...</html>",
    "<uuid2>": "<html>...</html>"
  },
  "errors": {
    "<uuid3>": "Template not found"
  }
}
```

Max 20 templates per request to bound response size and total execution time. Frontend calls in batches if more templates exist.

### Modified Endpoints

#### GET /api/v1/email/campaigns/{id}/

Add `rendered_html` and `recipient_summary` fields to the campaign detail serializer response. Both are stored on the model (no live API calls on GET).

### New EmailCraft Client Functions

Add to `emailcraft_client.py`:

| Function | Description |
|---|---|
| `create_template(api_key, name, json_data, category)` | `POST /api/v1/templates/` — creates a new template, returns `{ id, name, ... }` |
| `export_html(api_key, json_data, variables_mode)` | `POST /api/v1/export/html` — renders template JSON to email HTML without variable substitution |

These are used by the copy endpoint and the batch preview endpoint respectively.

## Frontend Changes

### New Files

| File | Responsibility |
|---|---|
| `components/admin/email/template-card.tsx` | Shared template card component with preview iframe |
| `components/admin/email/template-grid.tsx` | Shared grid layout with search + filter pills |
| `app/admin/email/campaigns/[id]/page.tsx` | Campaign detail page |

### Modified Files

| File | Change |
|---|---|
| `app/admin/email/templates/page.tsx` | Replace flat list with `TemplateGrid` component |
| `app/admin/email/compose/page.tsx` | Replace 2-step with 3-step flow, add template picker as Step 1 |
| `app/admin/email/page.tsx` | Add filter bar, make rows clickable |
| `lib/email-api.ts` | Add `copyTemplate()`, `listCampaignRecipients()`, `previewTemplates()` functions |

### Shared Template Card Component

`template-card.tsx` is used in both the templates page and compose Step 1. Props:

```typescript
interface TemplateCardProps {
  template: EmailTemplate;
  previewHtml?: string;
  mode: "library" | "picker";
  onSelect?: () => void;      // picker mode: choose this template
  onEdit?: () => void;         // library mode: edit this template
  onDelete?: () => void;       // library mode: delete this template
  onPreview?: () => void;      // both modes: full preview modal
}
```

In "library" mode: hover shows Edit/Preview/Delete. In "picker" mode: entire card is clickable, hover shows "Use Template" overlay.

### Shared Template Grid Component

`template-grid.tsx` wraps the search bar, filter pills, and card grid. Used by both the templates page and compose Step 1.

```typescript
interface TemplateGridProps {
  templates: EmailTemplate[];
  previewHtmlMap: Record<string, string>;
  mode: "library" | "picker";
  onSelect?: (template: EmailTemplate) => void;
  onEdit?: (template: EmailTemplate) => void;
  onDelete?: (template: EmailTemplate) => void;
  showStartFromScratch?: boolean;
  onStartFromScratch?: () => void;
}
```

## Error Handling

- **Template copy fails:** Show error toast, stay on Step 1. Coach can retry.
- **Preview render fails for a template:** Show placeholder card with template name only. Don't block the page.
- **Campaign detail — template deleted:** Show "Template no longer available" in the preview area. Recipient table still works.
- **Recipient list load fails:** Show error message in the recipient section. Campaign metadata still displays.

## Migration Notes

- `CampaignRecipient` model requires a new migration in `apps/email_campaigns`
- Existing campaigns won't have recipient data (table shows "Recipient tracking not available for campaigns sent before this update")
- The compose flow change is purely frontend — no breaking backend changes for existing templates or campaigns
