# Inbox Gmail Upgrade — Design

**Date:** 2026-07-04
**Status:** approved (brainstormed with user)
**Scope:** `frontend-customer` coach inbox (`/admin/inbox`), `apps.mailbox` backend, `infra/cloudflare/mailbox-worker`

## Problem

The coach inbox shipped as a minimal two-pane view: chat bubbles, a plain
`<textarea>` for replies, a centered compose modal, no folders, no search, no
attachments. Coaches expect an email client ("like Gmail"), not a DM box.

## Goals

1. Gmail-pattern layout: folder rail, full-width conversation list, in-place
   thread view.
2. Rich text compose/reply (Gmail-basics formatting) sending real HTML email.
3. Attachments in both directions, stored in object storage.
4. Gmail niceties: snippet previews, search, hover quick-actions.

Non-goals (unchanged from mailbox v1): labels, folder unread counts,
URL-per-conversation routing, pagination, AV scanning, the send-only banner and
address-claim settings flow.

## UX Design

### Layout — true Gmail pattern

Single client page (`inbox-client.tsx`), view state in React (no route changes).

- **Left rail (~180 px):** `Compose` button, then folders **Inbox / Archived /
  Spam**. Client-side filtering on the existing `is_archived` / `is_spam`
  flags (Inbox = neither). On small screens the rail collapses to a top tab
  row.
- **List view (default):** full-width rows: sender (bold + dot when
  `unread_count > 0`), subject, snippet in muted text, relative date
  right-aligned, paperclip glyph when the latest message has attachments.
  - **Hover quick-actions** on the row's right edge: archive, spam, delete
    (replaces the hidden `⋯` dropdown). In Archived/Spam folders the actions
    flip to "Move to inbox" (+ delete).
  - **Search box** above the list — client-side filter over sender name,
    email, subject, and snippet.
- **Thread view:** replaces the list; `←` back arrow returns. Header: subject
  + archive/spam/delete. Messages stack **email-style** (no bubbles): sender
  line + timestamp, older messages collapsed to a one-line snippet (click to
  expand), latest expanded. Inbound HTML renders exactly as today
  (server-sanitized via nh3, `prose` styling).
- **Reply:** rich editor inline at thread bottom. Ctrl/Cmd+Enter sends.
- **Compose:** Gmail-style floating card pinned bottom-right (fixed position):
  To, Subject, rich editor, attachment chips, Send / discard. Replaces the
  centered modal.
- Delete keeps the existing confirm dialog (destructive action).

### Rich text editor

- **TipTap** (`@tiptap/react`, StarterKit, Link extension).
- Toolbar: bold, italic, underline, bullet list, ordered list, blockquote,
  link, attach-file. House-design-system styling (token colors, focus rings).
- One shared `MessageEditor` component used by reply and compose.
- Sends `html` (`editor.getHTML()`) **and** `text` fallback
  (`editor.getText()`).

### Attachments

- **Limits:** 10 MB per file, max 4 files / ~25 MB total per message.
  Allowlist (by MIME prefix/type): `image/*`, `video/*`, `audio/*`,
  `application/pdf`, doc/docx/xls/xlsx/ppt/pptx, `application/zip`,
  `text/plain`, `text/csv`. Everything else rejected. No executables.
- **Outbound:** paperclip → file picker → immediate multipart upload per file
  to `POST /api/v1/mailbox/attachments/` → removable chips under the editor →
  `compose` / `reply` submit `attachment_ids`.
- **Inbound:** worker adds parsed attachments (base64) to the webhook payload;
  files over the per-file limit become `{filename, size, omitted: true}`
  placeholders. Webhook decodes, stores, records.
- **Display:** images as clickable thumbnails in the message body area; other
  types as chips (type icon, filename, human size). Downloads use short-lived
  presigned URLs (forced `Content-Disposition: attachment` for non-images).

## Backend Design

### Model (tenant schema — `migrate_schemas --tenant` required on deploy)

```
MessageAttachment
  message       FK Message, null=True (related_name="attachments", CASCADE;
                # null until the composer send links the uploaded file)
  filename      str
  content_type  str
  size          int (bytes)
  storage_key   str   # object storage key, e.g. mailbox/<uuid>/<filename>
  omitted       bool  # inbound file exceeded limits; no stored object
  created_at    datetime
```

Unattached uploads (composer abandoned) keep `message = NULL` until send links
them; a periodic cleanup is out of scope for v1 (volume is tiny).

### API changes (`apps.mailbox`)

- `POST /api/v1/mailbox/attachments/` — multipart, coach-only. Validates size +
  content type, streams to object storage (same boto3 client/pattern as
  `apps.media`), returns `{id, filename, content_type, size}`.
- `ComposeSerializer` / `ReplySerializer`: add optional `html` (string) and
  `attachment_ids` (list[int]). `html` is sanitized server-side with nh3
  before store/send (same policy as inbound).
- `ConversationSerializer` (list): add `last_message_preview` (~120 chars of
  latest message text) and `last_message_has_attachments` (bool).
- Message serializer: nested `attachments` with presigned `download_url`.

### Sending (`services.send_message` + `apps.core.email.send_email`)

- `send_message(..., attachment_ids=...)`: fetch owned `MessageAttachment`
  rows, pass to `send_email` as Resend `attachments`
  (`{filename, content: base64}` — read from object storage at send time),
  link rows to the created `Message`.
- `send_email` gains an optional `attachments` param appended to the Resend
  payload. Email-sink dev mode logs attachment count only.

### Inbound webhook (`apps.mailbox.inbound`)

- Accept optional `attachments: [{filename, content_type, size, content_b64?,
  omitted?}]`. Decode + store each (skip storage for `omitted`), create
  `MessageAttachment` rows on the inbound `Message`.
- Raise `DATA_UPLOAD_MAX_MEMORY_SIZE` to 30 MB (prod + dev settings) so the
  webhook accepts large signed JSON bodies.
- HMAC signature covers the full payload as before (signature is computed over
  the body string; no change needed).

### Cloudflare worker (`infra/cloudflare/mailbox-worker`)

- Include `parsed.attachments` in the payload: per file ≤10 MB → base64
  `content_b64`; larger → placeholder with `omitted: true`. Cap total included
  bytes at ~20 MB; further files become placeholders too.
- Redeploy via `npx wrangler deploy` (account-level worker, serves all zones).

## Error handling

- Upload endpoint: 400 with a human message for size/type rejection; UI shows
  toast and removes the chip.
- Send with a failed/missing attachment id → 400 (nothing sent).
- Inbound storage failure for one attachment: record it as `omitted` and keep
  the message (mail must never bounce because a thumbnail failed to store);
  log for ops.
- Presigned URL expiry: links are generated per-request; refetching the thread
  refreshes them.

## Testing

- **Backend (extend the existing mailbox suite):** upload endpoint
  (size/type/auth), compose/reply with html + sanitization + attachment
  linking, inbound webhook with attachments (stored, omitted, storage-failure),
  list serializer preview fields, Resend payload shape (mock).
- **Frontend:** typecheck + `next build`; manual browser click-through:
  folders, search, hover actions, collapsed thread expansion, rich formatting
  round-trip, attach/send/download both directions (MinIO in dev).
- **Worker:** existing pattern — deploy + live email with an image attached.

## Rollout

1. Backend + migration (tenant), settings bump, tests green.
2. Worker redeploy.
3. Frontend.
4. Live smoke: external email with image + PDF → thread shows thumbnail +
   chip; reply with formatting + attachment → received externally intact.
