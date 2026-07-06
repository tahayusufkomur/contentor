# Superadmin Platform Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the superadmin a two-way, Gmail-style inbox in `frontend-main` for the platform's own support/unclaimed `@contentor.app` mail, reusing the coach mailbox backend in the public schema.

**Architecture:** Dual-list `apps.mailbox` in `SHARED_APPS` + `TENANT_APPS` so its tables also exist in the public schema — those public rows are the platform inbox. The existing apex `inbound/` webhook gains one fall-through branch that stores unresolved platform-domain mail in the public schema. The coach API views are remounted at `/api/v1/platform/mailbox/` under a broadened permission; the send path picks a fixed platform from-address when running in the public schema. The frontend components are ported into `frontend-main` (separate Next app) against a cookie-auth fetch client.

**Tech Stack:** Django + django_tenants, DRF, Next.js (App Router), TipTap, Resend, Cloudflare Email Routing.

## Global Constraints

- Django backend: `backend/`. Superadmin frontend: `frontend-main/`. Coach frontend: `frontend-customer/` (source of truth for components — do NOT modify it).
- The live coach mailbox (`/api/v1/mailbox/`, tenant schema) MUST keep working unchanged. Only additive backend changes; the one shared file edited for behavior is `send_message` (public-schema branch only).
- Superadmin API is guarded by `apps.core.permissions.IsSuperUser` (cookie auth, same-origin), matching `apps.platform_email`.
- Platform inbox scope: full parity MINUS the settings/address-picker tab. Mirror the CURRENT `main` coach component set (do not pull from the unmerged `feat/inbox-gmail` branch).
- Platform mail domain gate: `settings.PLATFORM_MAIL_DOMAIN` (already exists, `""`-defaulted). New setting `PLATFORM_SUPPORT_FROM` for the outbound from-address.
- Backend tests: `cd backend && python -m pytest` (django_tenants test runner). Frontend build check: `cd frontend-main && npm run build`.
- Work on branch `feat/superadmin-inbox` (already created; spec already committed there).

## File Structure

**Backend (modify):**
- `backend/config/settings/base.py` — add `apps.mailbox` to `SHARED_APPS`; add `PLATFORM_SUPPORT_FROM`.
- `backend/config/urls.py` — mount `apps.mailbox.urls_platform` at `/api/v1/platform/mailbox/`.
- `backend/apps/mailbox/views.py` — inbound fall-through branch; broaden permission on the 5 reused views.
- `backend/apps/mailbox/services.py` — `send_message` public-schema from-address branch.

**Backend (create):**
- `backend/apps/mailbox/urls_platform.py` — curated subset (conversations, reply, compose, attachments). NO settings/inbound.
- `backend/apps/mailbox/tests/test_platform_inbox.py` — platform-inbox behavior tests.

**Frontend (create in `frontend-main`):**
- `frontend-main/src/lib/platform-mailbox-api.ts` — cookie-auth fetch client, `BASE = "/api/v1/platform/mailbox"`.
- `frontend-main/src/components/ui/modal-portal.tsx` — ported from frontend-customer.
- `frontend-main/src/components/admin/mailbox/*.tsx` — ported components (7 files).
- `frontend-main/src/app/admin/inbox/page.tsx` — route page.

**Frontend (modify in `frontend-main`):**
- `frontend-main/package.json` — add TipTap deps.
- `frontend-main/src/components/shared/app-sidebar.tsx` — add "Inbox" nav item.

---

## Task 1: Public-schema tenancy + platform from-address setting

**Files:**
- Modify: `backend/config/settings/base.py:15-53` (SHARED_APPS), `:178` (near RESEND_FROM_EMAIL)
- Test: `backend/apps/mailbox/tests/test_platform_inbox.py` (create)

**Interfaces:**
- Produces: `Conversation`/`Message`/`MessageAttachment` tables exist in the public schema; `settings.PLATFORM_SUPPORT_FROM` (str, e.g. `"support@contentor.app"`).

- [ ] **Step 1: Write the failing test**

Create `backend/apps/mailbox/tests/test_platform_inbox.py`:

```python
from django.db import connection
from django_tenants.utils import get_public_schema_name, schema_context

from apps.mailbox.models import Conversation


def test_conversation_table_exists_in_public_schema(db):
    # Dual-listing apps.mailbox in SHARED_APPS creates its tables in public.
    with schema_context(get_public_schema_name()):
        conv = Conversation.objects.create(counterparty_email="visitor@example.com")
        assert Conversation.objects.filter(pk=conv.pk).exists()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest apps/mailbox/tests/test_platform_inbox.py::test_conversation_table_exists_in_public_schema -v`
Expected: FAIL — relation "mailbox_conversation" does not exist in public schema (mailbox is TENANT-only).

- [ ] **Step 3: Add `apps.mailbox` to SHARED_APPS**

In `backend/config/settings/base.py`, in the `SHARED_APPS` list, add `apps.mailbox` alongside the other public-schema apps (keep the existing `apps.mailbox` entry in `TENANT_APPS` untouched):

```python
SHARED_APPS = [
    "django_tenants",
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.admin",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "apps.core",
    "apps.accounts",
    "apps.adminkit",
    "apps.platform_email",
    "apps.domains",
    # Coach mailbox models also live in the public schema — those public rows
    # are the superadmin platform inbox. Still tenant-listed below for coaches.
    "apps.mailbox",
]
```

- [ ] **Step 4: Add the platform from-address setting**

In `backend/config/settings/base.py`, next to `RESEND_FROM_EMAIL` (~line 178):

```python
# Fixed From address for the superadmin platform inbox (public-schema mailbox).
PLATFORM_SUPPORT_FROM = os.environ.get("PLATFORM_SUPPORT_FROM", "support@contentor.app")
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && python -m pytest apps/mailbox/tests/test_platform_inbox.py::test_conversation_table_exists_in_public_schema -v`
Expected: PASS. (The pytest-django `db` fixture builds the test DB from the current app config, creating mailbox tables in public.)

If it fails with "relation does not exist" against a persisted dev DB rather than the test DB, apply migrations to the real public schema: `cd backend && python manage.py migrate_schemas --shared`. No `makemigrations` is needed — models are unchanged; only the schema they target expands.

- [ ] **Step 6: Run the full mailbox suite to confirm no coach regression**

Run: `cd backend && python -m pytest apps/mailbox/ -q`
Expected: PASS (existing coach tests unaffected).

- [ ] **Step 7: Commit**

```bash
git add backend/config/settings/base.py backend/apps/mailbox/tests/test_platform_inbox.py
git commit -m "feat(inbox): dual-list mailbox in public schema + platform from-address"
```

---

## Task 2: Inbound fall-through to the platform inbox

**Files:**
- Modify: `backend/apps/mailbox/views.py:147-186` (the `inbound` view)
- Test: `backend/apps/mailbox/tests/test_platform_inbox.py`

**Interfaces:**
- Consumes: `receive_inbound(...)` (from `apps.mailbox.inbound`), `resolve_platform_recipient` (from `apps.mailbox.identity`), `settings.PLATFORM_MAIL_DOMAIN`.
- Produces: inbound mail to an unresolved address whose domain equals `PLATFORM_MAIL_DOMAIN` is stored in the public schema; claimed coach addresses and foreign domains behave as before.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/mailbox/tests/test_platform_inbox.py`. This mirrors the signing/host pattern already used by `test_inbound_api.py` (`signing.sign_payload(raw, SECRET)`, `MAILBOX_INBOUND_SECRET` override, apex `HTTP_HOST`, `transaction=True`):

```python
import json

import pytest
from django.test import override_settings
from django_tenants.utils import get_public_schema_name, schema_context
from rest_framework.test import APIClient

from apps.mailbox import signing
from apps.mailbox.models import Conversation, Message

pytestmark = pytest.mark.django_db(transaction=True)

_SECRET = "topsecret"
_HOST = "shared-test.localhost"  # apex host → public schema


def _post_inbound(payload):
    raw = json.dumps(payload).encode()
    return APIClient().post(
        "/api/v1/mailbox/inbound/",
        data=raw,
        content_type="application/json",
        HTTP_HOST=_HOST,
        HTTP_X_MAILBOX_SIGNATURE=signing.sign_payload(raw, _SECRET),
    )


@override_settings(MAILBOX_INBOUND_SECRET=_SECRET, PLATFORM_MAIL_DOMAIN="contentor.app")
def test_unresolved_platform_domain_lands_in_public_inbox():
    resp = _post_inbound(
        {"from": "prospect@gmail.com", "to": "support@contentor.app",
         "subject": "Hi", "text": "hello", "message_id": "<p1@x>"},
    )
    assert resp.status_code == 200
    with schema_context(get_public_schema_name()):
        conv = Conversation.objects.get(counterparty_email="prospect@gmail.com")
        assert conv.messages.filter(direction="inbound", to_email="support@contentor.app").exists()
        conv.delete()  # committed row (transaction=True) — clean up cross-test leak


@override_settings(MAILBOX_INBOUND_SECRET=_SECRET, PLATFORM_MAIL_DOMAIN="contentor.app")
def test_foreign_domain_still_dropped():
    resp = _post_inbound(
        {"from": "x@y.com", "to": "hi@somewhere-else.com",
         "subject": "s", "text": "t", "message_id": "<p2@x>"},
    )
    assert resp.status_code == 200
    with schema_context(get_public_schema_name()):
        assert not Message.objects.filter(message_id="<p2@x>").exists()
```

Note: `transaction=True` means these rows commit and are not auto-rolled-back, so the first test deletes its Conversation (mirror the `_clean_custom_domains` fixture approach in `test_inbound_api.py` if you prefer a fixture). The Task 1 test at the top of this file uses the standard `db` fixture and does not need `transaction=True`; keep the module `pytestmark` compatible or scope the marker per-test if the two styles conflict.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest apps/mailbox/tests/test_platform_inbox.py -k platform_domain -v`
Expected: FAIL — `test_unresolved_platform_domain_lands_in_public_inbox` fails (message dropped, no Conversation created).

- [ ] **Step 3: Add the fall-through branch**

In `backend/apps/mailbox/views.py`, inside `inbound`, replace the current drop block:

```python
    recipient_tenant = cd.tenant if cd else resolve_platform_recipient(to_email)
    if recipient_tenant is None:
        # Unknown / disabled / not-live recipient — drop without leaking.
        return Response(status=status.HTTP_200_OK)

    with tenant_context(recipient_tenant):
        receive_inbound(
            ...
        )
    return Response(status=status.HTTP_200_OK)
```

with a version that falls through to the public platform inbox when the domain is ours:

```python
    recipient_tenant = cd.tenant if cd else resolve_platform_recipient(to_email)
    inbound_kwargs = dict(
        from_email=(payload.get("from") or "").strip(),
        to_email=to_email,
        subject=payload.get("subject") or "",
        text=payload.get("text") or "",
        html=payload.get("html") or "",
        message_id=payload.get("message_id") or "",
        in_reply_to=payload.get("in_reply_to") or "",
        references=payload.get("references") or "",
        attachments=payload.get("attachments") or [],
    )

    if recipient_tenant is not None:
        with tenant_context(recipient_tenant):
            receive_inbound(**inbound_kwargs)
        return Response(status=status.HTTP_200_OK)

    # No tenant claimed it. If it's addressed to our platform mail domain, it's
    # support/unclaimed mail → store in the public-schema platform inbox. The
    # webhook already runs at the apex (public schema), so no context switch.
    if django_settings.PLATFORM_MAIL_DOMAIN and domain == django_settings.PLATFORM_MAIL_DOMAIN:
        receive_inbound(**inbound_kwargs)
        return Response(status=status.HTTP_200_OK)

    # Foreign domain — drop without leaking.
    return Response(status=status.HTTP_200_OK)
```

(`django_settings` is already imported as `from django.conf import settings as django_settings`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest apps/mailbox/tests/test_platform_inbox.py -v`
Expected: PASS. Also run `cd backend && python -m pytest apps/mailbox/tests/test_inbound_api.py -q` — existing claimed-address routing still PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/mailbox/views.py backend/apps/mailbox/tests/test_platform_inbox.py
git commit -m "feat(inbox): route unclaimed platform-domain mail to public inbox"
```

---

## Task 3: Platform from-address on the send path

**Files:**
- Modify: `backend/apps/mailbox/services.py:39-50` (`send_message` from-address line)
- Test: `backend/apps/mailbox/tests/test_platform_inbox.py`

**Interfaces:**
- Consumes: `settings.PLATFORM_SUPPORT_FROM`, `get_public_schema_name`.
- Produces: `send_message` sends from `PLATFORM_SUPPORT_FROM` when running in the public schema; unchanged (`sending_identity(connection.tenant)`) inside a tenant schema.

- [ ] **Step 1: Write the failing test**

Append to `backend/apps/mailbox/tests/test_platform_inbox.py`:

```python
from unittest.mock import patch

from apps.mailbox import services


@override_settings(PLATFORM_SUPPORT_FROM="support@contentor.app")
def test_send_from_public_schema_uses_platform_address(db):
    with schema_context(get_public_schema_name()):
        conv = Conversation.objects.create(counterparty_email="prospect@gmail.com")
        with patch("apps.mailbox.services.send_email", return_value=True) as mock_send:
            services.send_message(conversation=conv, text="hi there")
    # send_email called with from_email = platform support address
    assert mock_send.call_args.kwargs["from_email"] == "support@contentor.app"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest apps/mailbox/tests/test_platform_inbox.py::test_send_from_public_schema_uses_platform_address -v`
Expected: FAIL — from_email resolves via `sending_identity` to `RESEND_FROM_EMAIL`, not the platform address.

- [ ] **Step 3: Branch the from-address on schema**

In `backend/apps/mailbox/services.py`, add imports at the top:

```python
from django.conf import settings
from django_tenants.utils import get_public_schema_name
```

Replace the first line of `send_message`:

```python
    from_email, _can_receive = sending_identity(connection.tenant)
```

with:

```python
    if connection.schema_name == get_public_schema_name():
        # Superadmin platform inbox — fixed support address, always sendable.
        from_email = settings.PLATFORM_SUPPORT_FROM
    else:
        from_email, _can_receive = sending_identity(connection.tenant)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest apps/mailbox/tests/test_platform_inbox.py::test_send_from_public_schema_uses_platform_address -v`
Expected: PASS.

- [ ] **Step 5: Run the send-path suite for coach regression**

Run: `cd backend && python -m pytest apps/mailbox/tests/test_services.py apps/mailbox/tests/test_api.py -q`
Expected: PASS (coach send path unchanged inside tenant schemas).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/mailbox/services.py backend/apps/mailbox/tests/test_platform_inbox.py
git commit -m "feat(inbox): platform inbox sends from fixed support address"
```

---

## Task 4: Superadmin API mount (`/api/v1/platform/mailbox/`)

**Files:**
- Create: `backend/apps/mailbox/urls_platform.py`
- Modify: `backend/apps/mailbox/views.py` (broaden permission on 5 reused views), `backend/config/urls.py:68`
- Test: `backend/apps/mailbox/tests/test_platform_inbox.py`

**Interfaces:**
- Consumes: existing views `conversation_list`, `conversation_detail`, `reply`, `compose`, `upload_attachment`.
- Produces: routes `platform-mailbox-conversation-list`, `-detail`, `-reply`, `-compose`, `-attachment-upload` under `/api/v1/platform/mailbox/`, guarded by `IsCoachOrOwner | IsSuperUser`. NO `settings/` or `inbound/` on this mount.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/mailbox/tests/test_platform_inbox.py`. Reuse the project's existing helpers for authenticating a superuser vs a regular user against the apex host — check `apps/platform_email/tests/` for the established pattern (cookie/JWT superuser client) and mirror it. Sketch:

```python
def test_superuser_lists_public_conversations(superuser_client, db):
    with schema_context(get_public_schema_name()):
        Conversation.objects.create(counterparty_email="prospect@gmail.com")
    resp = superuser_client.get("/api/v1/platform/mailbox/conversations/")
    assert resp.status_code == 200
    assert any(c["counterparty_email"] == "prospect@gmail.com" for c in resp.json())


def test_non_superuser_forbidden(auth_client, db):
    resp = auth_client.get("/api/v1/platform/mailbox/conversations/")
    assert resp.status_code == 403
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest apps/mailbox/tests/test_platform_inbox.py -k "superuser or non_superuser" -v`
Expected: FAIL — 404 (route not mounted).

- [ ] **Step 3: Broaden the permission on the 5 reused views**

In `backend/apps/mailbox/views.py`, change the decorator on `conversation_list`, `conversation_detail`, `compose`, `reply`, `upload_attachment` from:

```python
@permission_classes([IsCoachOrOwner])
```

to:

```python
@permission_classes([IsCoachOrOwner | IsSuperUser])
```

Add the import near the existing permissions import:

```python
from apps.core.permissions import IsCoachOrOwner, IsSuperUser
```

Leave `mailbox_settings` and `inbound` untouched. (A coach hitting these at their tenant host still sees only their tenant schema; a superuser hitting them at the apex sees the public schema — routing is by host/middleware, not the view.)

- [ ] **Step 4: Create the curated platform URL module**

Create `backend/apps/mailbox/urls_platform.py`:

```python
from django.urls import path

from . import views

# Superadmin platform inbox — same handlers as the coach mailbox, minus the
# address-picker settings tab and the inbound webhook. Guarded by IsSuperUser
# (via the broadened permission on the shared views).
urlpatterns = [
    path("conversations/", views.conversation_list, name="platform-mailbox-conversation-list"),
    path("conversations/<int:pk>/", views.conversation_detail, name="platform-mailbox-conversation-detail"),
    path("conversations/<int:pk>/reply/", views.reply, name="platform-mailbox-reply"),
    path("compose/", views.compose, name="platform-mailbox-compose"),
    path("attachments/", views.upload_attachment, name="platform-mailbox-attachment-upload"),
]
```

- [ ] **Step 5: Mount it**

In `backend/config/urls.py`, add next to the existing mailbox include (line ~68):

```python
    path("api/v1/mailbox/", include("apps.mailbox.urls")),
    path("api/v1/platform/mailbox/", include("apps.mailbox.urls_platform")),
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && python -m pytest apps/mailbox/tests/test_platform_inbox.py -v`
Expected: PASS. Then the full suite: `cd backend && python -m pytest apps/mailbox/ -q` — all PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/mailbox/urls_platform.py backend/apps/mailbox/views.py backend/config/urls.py backend/apps/mailbox/tests/test_platform_inbox.py
git commit -m "feat(inbox): superadmin platform mailbox API under IsSuperUser"
```

---

## Task 5: Frontend fetch client + deps + modal-portal

**Files:**
- Create: `frontend-main/src/lib/platform-mailbox-api.ts`, `frontend-main/src/components/ui/modal-portal.tsx`
- Modify: `frontend-main/package.json`

**Interfaces:**
- Produces: `platform-mailbox-api` exports mirroring the coach `lib/mailbox` (minus settings): types `ConversationListItem`, `ConversationDetail`, `MailboxMessage`, `MessageAttachment`, `OutgoingMessage`; functions `listConversations`, `getConversation`, `compose`, `reply`, `uploadAttachment`, `updateConversation`, `deleteConversation`. Base `/api/v1/platform/mailbox`. `ModalPortal` component.

- [ ] **Step 1: Add TipTap deps**

The ported `message-editor` uses TipTap. In `frontend-main/package.json`, add to `dependencies` (match versions used by `frontend-customer`):

```json
    "@tiptap/extension-link": "^2.27.2",
    "@tiptap/extension-placeholder": "^2.27.2",
    "@tiptap/extension-underline": "^2.27.2",
    "@tiptap/react": "^2.27.2",
    "@tiptap/starter-kit": "^2.27.2",
```

Run: `cd frontend-main && npm install`
Expected: installs without peer-dependency errors.

- [ ] **Step 2: Port `modal-portal`**

Create `frontend-main/src/components/ui/modal-portal.tsx` with the exact contents of `frontend-customer/src/components/ui/modal-portal.tsx` (copy verbatim — no `@/lib` imports, so it ports cleanly).

- [ ] **Step 3: Create the fetch client**

Create `frontend-main/src/lib/platform-mailbox-api.ts`. Mirror the coach `frontend-customer/src/lib/mailbox.ts` exactly for the types and function bodies, with two changes: (a) `const BASE = "/api/v1/platform/mailbox";` and (b) replace `import { clientFetch } from "@/lib/api-client";` with a local cookie-auth `clientFetch` copied from `frontend-main/src/lib/platform-email-api.ts` (same-origin credentials). OMIT `MailboxSettings`, `getSettings`, `saveSettings`, `savePlatformAddress`. Full content:

```ts
// Superadmin platform inbox API client, base `/api/v1/platform/mailbox`.
// Mirrors the coach mailbox client but drops settings; auth rides the
// same-origin admin cookie (like platform-email-api).

const BASE = "/api/v1/platform/mailbox";

async function clientFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: "same-origin",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const detail = (data && data.detail) || `Request failed (${res.status})`;
    throw new Error(Array.isArray(detail) ? detail.join(" ") : String(detail));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

function jsonFetch<T>(path: string, options?: RequestInit): Promise<T> {
  return clientFetch<T>(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
}

export interface MessageAttachment {
  id: number;
  filename: string;
  content_type: string;
  size: number;
  omitted: boolean;
  download_url: string;
}

export interface ConversationListItem {
  id: number;
  subject: string;
  counterparty_email: string;
  counterparty_name: string;
  student: number | null;
  last_message_at: string | null;
  unread_count: number;
  is_archived: boolean;
  is_spam: boolean;
  last_message_preview: string;
  last_message_has_attachments: boolean;
}

export interface MailboxMessage {
  id: number;
  direction: "inbound" | "outbound";
  from_email: string;
  to_email: string;
  text: string;
  html: string;
  is_read: boolean;
  created_at: string;
  attachments: MessageAttachment[];
}

export interface ConversationDetail extends ConversationListItem {
  messages: MailboxMessage[];
}

export interface OutgoingMessage {
  text: string;
  html?: string;
  attachment_ids?: number[];
}

export function listConversations() {
  return jsonFetch<ConversationListItem[]>(`${BASE}/conversations/`);
}

export function getConversation(id: number) {
  return jsonFetch<ConversationDetail>(`${BASE}/conversations/${id}/`);
}

export function compose(body: OutgoingMessage & { to: string; subject: string }) {
  return jsonFetch<{ conversation_id: number; message_id: number }>(
    `${BASE}/compose/`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function reply(id: number, body: OutgoingMessage) {
  return jsonFetch<{ message_id: number }>(
    `${BASE}/conversations/${id}/reply/`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function uploadAttachment(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  // No Content-Type header — the browser sets the multipart boundary.
  return clientFetch<MessageAttachment>(`${BASE}/attachments/`, {
    method: "POST",
    body: fd,
  });
}

export function updateConversation(
  id: number,
  patch: { is_archived?: boolean; is_spam?: boolean },
) {
  return jsonFetch<ConversationListItem>(`${BASE}/conversations/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteConversation(id: number) {
  return jsonFetch<void>(`${BASE}/conversations/${id}/`, { method: "DELETE" });
}
```

- [ ] **Step 4: Type-check**

Run: `cd frontend-main && npx tsc --noEmit`
Expected: no errors from the two new files (components arrive in Task 6, so unresolved component imports don't exist yet).

- [ ] **Step 5: Commit**

```bash
git add frontend-main/package.json frontend-main/package-lock.json frontend-main/src/lib/platform-mailbox-api.ts frontend-main/src/components/ui/modal-portal.tsx
git commit -m "feat(inbox): frontend-main mailbox fetch client + modal-portal + tiptap deps"
```

---

## Task 6: Frontend components port + route + nav

**Files:**
- Create: `frontend-main/src/components/admin/mailbox/{attachment-list,compose-card,conversation-list,folder-rail,inbox-client,message-editor,thread-view}.tsx`, `frontend-main/src/app/admin/inbox/page.tsx`
- Modify: `frontend-main/src/components/shared/app-sidebar.tsx`

**Interfaces:**
- Consumes: everything from `@/lib/platform-mailbox-api` and `@/components/ui/modal-portal` (Task 5).
- Produces: `/admin/inbox` route rendering `InboxClient`; an "Inbox" sidebar link.

- [ ] **Step 1: Port the 7 components**

Copy each file from `frontend-customer/src/components/admin/mailbox/` to `frontend-main/src/components/admin/mailbox/`, then apply these mechanical adaptations to every file:

- Replace all imports from `@/lib/mailbox` with `@/lib/platform-mailbox-api`.
- Verify UI imports resolve in `frontend-main`: `@/components/ui/button` (exists), `@/components/ui/modal-portal` (ported in Task 5). If any component imports another `@/components/ui/*` primitive that does NOT exist under `frontend-main/src/components/ui/` (current set: badge, button, card, input, label, page-loader, separator, skeleton, switch, table, tabs, texture-overlay), port that primitive too the same way (copy verbatim from frontend-customer; these are token-styled and dependency-light).

In `inbox-client.tsx` specifically, REMOVE all settings/address-picker wiring (the platform address is fixed, and the API client has no settings functions):
- Drop the `getSettings` import and the `MailboxSettings` type import.
- Remove any `settings`/`mailboxSettings` state, its `getSettings()` load effect, and any Settings tab/panel or "mailbox address" UI it renders.
- If `folder-rail` or the header renders a Settings entry, remove that entry.
- Keep folders (inbox/archived/spam), search, conversation list, thread view, compose, reply, attachments, delete-confirm intact.

Do NOT copy `mailbox-settings.tsx` — it is out of scope.

- [ ] **Step 2: Create the route page**

Create `frontend-main/src/app/admin/inbox/page.tsx`:

```tsx
import InboxClient from "@/components/admin/mailbox/inbox-client";

export const dynamic = "force-dynamic";

export default function InboxPage() {
  return <InboxClient />;
}
```

- [ ] **Step 3: Add the sidebar nav item**

In `frontend-main/src/components/shared/app-sidebar.tsx`, add an "Inbox" link pointing to `/admin/inbox`, placed next to the existing Email/campaigns entry. Match the existing nav-item pattern in that file exactly (same icon component source — e.g. `Mail`/`Inbox` from `lucide-react` — same wrapper markup and active-state handling as sibling items). Read the file first and mirror a neighboring entry rather than inventing markup.

- [ ] **Step 4: Type-check and build**

Run: `cd frontend-main && npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds. Resolve any leftover `@/lib/mailbox` references or missing `@/components/ui/*` primitives surfaced here by porting them (Step 1 rule).

- [ ] **Step 5: Manual smoke check**

Run the superadmin app (per the project's run recipe / `make` target for `frontend-main`), log in as a superuser, open `/admin/inbox`. Verify: the inbox renders, folders switch, an empty state shows with no conversations. (Seed one public-schema `Conversation` via Django shell if you want to see a thread: `schema_context(get_public_schema_name())` → `Conversation.objects.create(counterparty_email=...)` plus a `Message`.)

- [ ] **Step 6: Commit**

```bash
git add frontend-main/src/components/admin/mailbox frontend-main/src/app/admin/inbox frontend-main/src/components/shared/app-sidebar.tsx
git commit -m "feat(inbox): superadmin platform inbox UI + route + nav"
```

---

## Task 7: Cloudflare Email Routing — divert platform mail to the webhook (ops)

**Files:** none (Cloudflare dashboard / API + `.env` verification). This is the ops step that actually makes support mail arrive.

**Interfaces:**
- Consumes: the live apex `inbound/` webhook (`/api/v1/mailbox/inbound/`) and its `X-Mailbox-Signature` HMAC (unchanged).
- Produces: platform-support / catch-all `@contentor.app` mail delivered to the webhook instead of Gmail-forward.

- [ ] **Step 1: Confirm env is set**

Verify on the prod backend that `PLATFORM_MAIL_DOMAIN=contentor.app` and `PLATFORM_SUPPORT_FROM=support@contentor.app` are set, and `CLOUDFLARE_EMAIL_WORKER_NAME` is configured (see `.env.prod.example`). Without `PLATFORM_MAIL_DOMAIN` the Task 2 branch never fires.

- [ ] **Step 2: Point the catch-all rule at the worker**

In Cloudflare Email Routing for the `contentor.app` zone, set the **catch-all** action to the inbound Worker (the same worker claimed coach addresses already use) rather than forward-to-Gmail. Claimed coach `<x>@contentor.app` custom addresses must keep their existing routes and continue to resolve first in the backend — do NOT remove them. Reference `apps/domains/cloudflare.py::enable_email_routing` and `apps/domains/provisioning._step_email_auth` for the worker-binding pattern already in use.

⚠️ This diverts ALL unclaimed `@contentor.app` mail from Gmail into the app. Cross-check the "contentor platform mailbox address" runbook (catch-all→Gmail is currently LIVE) before flipping, and decide whether any addresses must stay on Gmail-forward.

- [ ] **Step 3: End-to-end verify**

From an external mailbox, email `support@contentor.app`. Confirm within a minute it appears in `/admin/inbox` in the superadmin panel. Reply from the panel; confirm the reply arrives at the external mailbox with `From: support@contentor.app` and threads correctly (In-Reply-To/References).

- [ ] **Step 4: Record the outcome**

Note in the PR / runbook that the catch-all now targets the webhook and which (if any) addresses were kept on Gmail-forward.

---

## Self-Review

**Spec coverage:**
- §1 Backend tenancy & models → Task 1. ✅
- §2 Inbound routing fall-through → Task 2. ✅
- §3 Read/reply/compose/attachments API (IsSuperUser, settings excluded) → Task 4. ✅
- §4 Send path from-address → Task 3. ✅
- §5 Frontend (components, route, nav, base path, drop settings) → Tasks 5–6. ✅
- §6 Cloudflare Email Worker catch-all → Task 7. ✅
- §7 Testing (backend inbound/routing/permission/send; frontend) → Tasks 2,3,4 backend; Task 6 manual smoke. ✅ (Note: automated frontend component tests from the spec are covered as a manual smoke here; add Vitest/RTL specs mirroring frontend-customer if the repo runs them — check `frontend-main` for an existing test runner before adding.)
- Risk callouts (shared migration, worker rule) → Task 1 Step 5 note + Task 7 warning. ✅

**Placeholder scan:** No TBD/TODO. Two intentional "verify against existing pattern" instructions (signing helper name in Task 2; superuser test-client fixture in Task 4; sidebar markup in Task 6) point at concrete existing files to mirror rather than leaving logic unspecified — acceptable, as the exact helper/fixture names are repo-local and must be read, not guessed.

**Type consistency:** `platform-mailbox-api.ts` type/function names match the coach `lib/mailbox` surface the components already consume (minus the removed settings symbols). Backend route names are unique (`platform-mailbox-*`). `send_message` signature unchanged (from-address computed internally). `receive_inbound(**inbound_kwargs)` uses the exact keyword set from the existing view.
