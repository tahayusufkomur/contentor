# Coach Mailbox — Phase 3 (Coach UI + Address Picker) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give the coach a Gmail-style inbox in the tenant admin (list → thread → reply/compose), a settings step to pick their email address (`info@theirdomain.com`) and enable the mailbox, and harden the read path by sanitizing attacker-controlled inbound HTML. Non-custom-domain coaches see a send-only inbox with an upsell.

**Architecture:** Two backend tasks extend the Phase 1/2 `apps.mailbox` API (conversation archive/spam/delete actions, HTML sanitization on serialize, and a mailbox-settings endpoint that sets `mailbox_local_part`/`mailbox_enabled` on the coach's live `CustomDomain` and re-binds Cloudflare Email Routing to the Worker). Three frontend tasks build the `frontend-customer` admin UI on the existing `clientFetch` + admin-shell patterns and the house design system.

**Tech Stack:** Django/DRF (backend), Next.js 14 App Router + Tailwind + Radix (frontend-customer), nh3 (`sanitize_rich_text`), pytest (backend), `tsc`/`next build` + browser smoke (frontend).

## Global Constraints

- Backend tests: `docker compose exec django pytest <path> -v`. Lint changed files: `docker compose exec django ruff check <paths>`. TDD for backend.
- Frontend has NO unit test harness here and pre-commit does NOT lint the frontends. Verify frontend tasks with: `docker compose exec nextjs-customer npx tsc --noEmit -p tsconfig.json` (typecheck) AND a browser smoke at the end (dev stack is running; log in as a coach). Do NOT claim a frontend task done without a passing typecheck.
- Coach-facing API uses `IsCoachOrOwner` from `apps.core.permissions`. Empty-success responses → 204.
- Frontend API calls go through `clientFetch<T>(path, options)` from `@/lib/api-client` (handles 204, ApiError, demo-readonly). Never call `fetch` directly.
- Coach UI is for NON-TECHNICAL users: no raw paths, slugs, headers, or code. Address picker shows `___@theirdomain.com` visually. Apply the house design system (OKLCH tokens, existing admin components) — mirror an existing admin page (`src/app/admin/notifications/`, `src/app/admin/email/`).
- Inbound `Message.html` is attacker-controlled — it MUST be sanitized before it reaches the browser (Task 1). The frontend renders the sanitized field.
- Use explicit file paths in `git add` (never `-A`/`.`). Commit per task on `feat/coach-mailbox`. Do NOT push.
- Serializer key contract locked in Phase 1: conversation JSON uses key `student` (nullable PK int) + `is_spam`.

## Carry-over from Phase 2 final review

- Inbound `Message.html` is stored raw (attacker-controlled). **Task 1 sanitizes it on serialize** with `apps.tenant_config.defaults.sanitize_rich_text` (nh3). This is the render-side protection the review required — do NOT render unsanitized inbound HTML anywhere.

---

## File Structure

**Create:**
- `backend/apps/mailbox/tests/test_actions_api.py` — archive/spam/delete + sanitize tests
- `backend/apps/mailbox/tests/test_settings_api.py` — address-picker API tests
- `frontend-customer/src/lib/mailbox.ts` — typed API module
- `frontend-customer/src/app/admin/inbox/page.tsx` — inbox route (server component shell)
- `frontend-customer/src/components/admin/mailbox/inbox-client.tsx` — list + thread + composer (client)
- `frontend-customer/src/components/admin/mailbox/mailbox-settings.tsx` — address picker (client)

**Modify:**
- `backend/apps/mailbox/serializers.py` — sanitize `Message.html` output
- `backend/apps/mailbox/views.py` — archive/spam/delete actions + `settings` GET/PUT
- `backend/apps/mailbox/urls.py` — new routes
- `frontend-customer/src/components/admin/admin-shell.tsx` — Inbox nav item
- `frontend-customer/messages/en/*.json` + `messages/tr/*.json` — nav + inbox strings (match the app's existing message-file layout)

---

## Task 1: Sanitize inbound HTML + conversation archive/spam/delete actions

**Files:**
- Modify: `backend/apps/mailbox/serializers.py`, `backend/apps/mailbox/views.py`, `backend/apps/mailbox/urls.py`
- Create: `backend/apps/mailbox/tests/test_actions_api.py`

**Interfaces:**
- Produces:
  - `MessageSerializer.html` returns `sanitize_rich_text(obj.html)` (nh3-cleaned).
  - `PATCH /api/v1/mailbox/conversations/<pk>/` `{is_archived?: bool, is_spam?: bool}` → 200 with the updated `ConversationSerializer`.
  - `DELETE /api/v1/mailbox/conversations/<pk>/` → 204 (cascades messages).
  - Missing conversation → 404. All `IsCoachOrOwner`.

- [ ] **Step 1: Write the failing tests**

`backend/apps/mailbox/tests/test_actions_api.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.mailbox.models import Conversation, Message

pytestmark = pytest.mark.django_db(transaction=True)
HOST = "shared-test.localhost"


@pytest.fixture()
def client(tenant_ctx):
    coach = User.objects.create_user(
        email="coach@x.com", name="Coach", password="secret123", role="owner", is_staff=True
    )
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=coach)
    return c


def test_message_html_is_sanitized(client, tenant_ctx):
    conv = Conversation.objects.create(counterparty_email="p@x.com")
    Message.objects.create(
        conversation=conv, direction="inbound", from_email="p@x.com",
        to_email="info@coach.com", html='<p>hi</p><script>alert(1)</script>',
    )
    resp = client.get(f"/api/v1/mailbox/conversations/{conv.id}/")
    assert resp.status_code == 200
    html = resp.json()["messages"][0]["html"]
    assert "<script>" not in html
    assert "<p>hi</p>" in html


def test_archive_conversation(client, tenant_ctx):
    conv = Conversation.objects.create(counterparty_email="p@x.com")
    resp = client.patch(
        f"/api/v1/mailbox/conversations/{conv.id}/", {"is_archived": True}, format="json"
    )
    assert resp.status_code == 200
    conv.refresh_from_db()
    assert conv.is_archived is True


def test_mark_spam(client, tenant_ctx):
    conv = Conversation.objects.create(counterparty_email="p@x.com")
    resp = client.patch(
        f"/api/v1/mailbox/conversations/{conv.id}/", {"is_spam": True}, format="json"
    )
    assert resp.status_code == 200
    conv.refresh_from_db()
    assert conv.is_spam is True


def test_delete_conversation(client, tenant_ctx):
    conv = Conversation.objects.create(counterparty_email="p@x.com")
    Message.objects.create(
        conversation=conv, direction="inbound", from_email="p@x.com", to_email="info@coach.com"
    )
    resp = client.delete(f"/api/v1/mailbox/conversations/{conv.id}/")
    assert resp.status_code == 204
    assert Conversation.objects.filter(id=conv.id).count() == 0
    assert Message.objects.count() == 0


def test_action_on_missing_conversation_404(client, tenant_ctx):
    resp = client.patch("/api/v1/mailbox/conversations/99999/", {"is_archived": True}, format="json")
    assert resp.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/mailbox/tests/test_actions_api.py -v`
Expected: FAIL — sanitize assertion fails (script passes through) and PATCH/DELETE return 405/404.

- [ ] **Step 3: Sanitize the serializer**

In `backend/apps/mailbox/serializers.py`, add the import and a `SerializerMethodField` for `html` on `MessageSerializer`:

```python
from apps.tenant_config.defaults import sanitize_rich_text
```

Change `MessageSerializer` so `html` is sanitized:

```python
class MessageSerializer(serializers.ModelSerializer):
    html = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            "id", "direction", "from_email", "to_email", "text", "html",
            "is_read", "created_at",
        ]

    def get_html(self, obj) -> str:
        return sanitize_rich_text(obj.html)
```

- [ ] **Step 4: Add the action view + reuse for PATCH/DELETE**

In `backend/apps/mailbox/views.py`, extend `conversation_detail` to also accept PATCH and DELETE (or add a dedicated view). Keep GET behavior (mark read) intact. Replace the `@api_view(["GET"])` decorator on `conversation_detail` with `@api_view(["GET", "PATCH", "DELETE"])` and branch:

```python
@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsCoachOrOwner])
def conversation_detail(request, pk):
    try:
        conv = Conversation.objects.get(pk=pk)
    except Conversation.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        conv.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if request.method == "PATCH":
        changed = []
        for field in ("is_archived", "is_spam"):
            if field in request.data:
                setattr(conv, field, bool(request.data[field]))
                changed.append(field)
        if changed:
            conv.save(update_fields=changed)
        return Response(ConversationSerializer(conv).data)

    # GET: mark inbound read + zero unread (existing behavior)
    conv.messages.filter(direction="inbound", is_read=False).update(is_read=True)
    if conv.unread_count:
        conv.unread_count = 0
        conv.save(update_fields=["unread_count"])
    return Response(ConversationDetailSerializer(conv).data)
```

(The URL `conversations/<int:pk>/` from Phase 1 already maps to `conversation_detail`; no urls.py change needed for PATCH/DELETE since they share the route. If Phase 1 registered it GET-only in a way that blocks other methods, confirm the route has no method restriction beyond the decorator.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/mailbox/tests/test_actions_api.py apps/mailbox/tests/test_api.py -v`
Expected: PASS (5 new + the existing Phase 1 API tests still green — the GET path is unchanged).

- [ ] **Step 6: Lint + commit**

Run: `docker compose exec django ruff check apps/mailbox/serializers.py apps/mailbox/views.py`

```bash
git add backend/apps/mailbox/serializers.py backend/apps/mailbox/views.py backend/apps/mailbox/tests/test_actions_api.py
git commit -m "feat(mailbox): sanitize inbound html + conversation archive/spam/delete actions"
```

---

## Task 2: Mailbox settings API (address picker + enable + routing re-bind)

**Files:**
- Modify: `backend/apps/mailbox/views.py`, `backend/apps/mailbox/urls.py`
- Create: `backend/apps/mailbox/tests/test_settings_api.py`

**Interfaces:**
- Produces:
  - `GET /api/v1/mailbox/settings/` → `{has_custom_domain: bool, domain: str|"", local_part: str, enabled: bool, can_receive: bool, from_email: str}`. Derives `from_email`/`can_receive` from `sending_identity(connection.tenant)`; `domain`/`local_part`/`enabled` from the tenant's live `CustomDomain` (or defaults when none).
  - `PUT /api/v1/mailbox/settings/` `{local_part: str, enabled: bool}` → validates `local_part` (non-empty, matches `^[a-zA-Z0-9._-]+$`), requires a live custom domain to enable; persists to the `CustomDomain`; if enabling and `settings.CLOUDFLARE_EMAIL_WORKER_NAME` is set, re-binds Email Routing to the Worker via `get_cloudflare().enable_email_routing(zone_id=..., worker_name=...)`. Returns the same shape as GET. Invalid local_part → 400; enable without custom domain → 400.
  - `IsCoachOrOwner`.

- [ ] **Step 1: Write the failing tests**

`backend/apps/mailbox/tests/test_settings_api.py`:

```python
from unittest.mock import patch

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.domains.models import CustomDomain

pytestmark = pytest.mark.django_db(transaction=True)
HOST = "shared-test.localhost"


@pytest.fixture(autouse=True)
def _clean_domains():
    CustomDomain.objects.all().delete()
    yield
    CustomDomain.objects.all().delete()


@pytest.fixture()
def client(tenant_ctx):
    coach = User.objects.create_user(
        email="coach@x.com", name="Coach", password="secret123", role="owner", is_staff=True
    )
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=coach)
    return c


@override_settings(RESEND_FROM_EMAIL="no_reply@contentor.app")
def test_settings_get_without_domain(client, tenant_ctx):
    resp = client.get("/api/v1/mailbox/settings/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["has_custom_domain"] is False
    assert data["can_receive"] is False
    assert data["from_email"] == "no_reply@contentor.app"


def test_settings_put_requires_domain_to_enable(client, tenant_ctx):
    resp = client.put(
        "/api/v1/mailbox/settings/", {"local_part": "info", "enabled": True}, format="json"
    )
    assert resp.status_code == 400


def test_settings_put_rejects_bad_local_part(client, tenant_ctx):
    CustomDomain.objects.create(
        tenant=tenant_ctx, domain="coach.com", cost_minor=1, price_minor=1,
        currency="usd", provisioning_status="live",
    )
    resp = client.put(
        "/api/v1/mailbox/settings/", {"local_part": "bad address!", "enabled": True}, format="json"
    )
    assert resp.status_code == 400


@override_settings(CLOUDFLARE_EMAIL_WORKER_NAME="mailbox-inbound")
def test_settings_put_enables_and_rebinds_worker(client, tenant_ctx):
    CustomDomain.objects.create(
        tenant=tenant_ctx, domain="coach.com", cost_minor=1, price_minor=1,
        currency="usd", provisioning_status="live", cloudflare_zone_id="zone-1",
    )
    with patch("apps.mailbox.views.get_cloudflare") as mock_cf:
        resp = client.put(
            "/api/v1/mailbox/settings/", {"local_part": "support", "enabled": True}, format="json"
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["local_part"] == "support"
    assert data["enabled"] is True
    assert data["from_email"] == "support@coach.com"
    assert data["can_receive"] is True
    mock_cf.return_value.enable_email_routing.assert_called_once_with(
        zone_id="zone-1", worker_name="mailbox-inbound"
    )
    cd = CustomDomain.objects.get(domain="coach.com")
    assert cd.mailbox_local_part == "support"
    assert cd.mailbox_enabled is True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/mailbox/tests/test_settings_api.py -v`
Expected: FAIL — 404 (route not wired).

- [ ] **Step 3: Add the settings view**

In `backend/apps/mailbox/views.py`, add imports:

```python
import re

from django.conf import settings as django_settings
from django.db import connection

from apps.domains.cloudflare import get_cloudflare
from apps.domains.models import CustomDomain

from .identity import sending_identity

_LOCAL_PART_RE = re.compile(r"^[a-zA-Z0-9._-]+$")
```

and add the view:

```python
def _live_domain(tenant):
    return (
        CustomDomain.objects.filter(tenant=tenant, provisioning_status="live")
        .order_by("-is_primary", "id")
        .first()
    )


def _settings_payload(tenant):
    from_email, can_receive = sending_identity(tenant)
    cd = _live_domain(tenant)
    return {
        "has_custom_domain": cd is not None,
        "domain": cd.domain if cd else "",
        "local_part": cd.mailbox_local_part if cd else "info",
        "enabled": cd.mailbox_enabled if cd else False,
        "can_receive": can_receive,
        "from_email": from_email,
    }


@api_view(["GET", "PUT"])
@permission_classes([IsCoachOrOwner])
def mailbox_settings(request):
    tenant = connection.tenant
    if request.method == "GET":
        return Response(_settings_payload(tenant))

    local_part = (request.data.get("local_part") or "").strip()
    enabled = bool(request.data.get("enabled"))
    if not _LOCAL_PART_RE.match(local_part):
        return Response(
            {"detail": "invalid_local_part"}, status=status.HTTP_400_BAD_REQUEST
        )
    cd = _live_domain(tenant)
    if enabled and cd is None:
        return Response(
            {"detail": "custom_domain_required"}, status=status.HTTP_400_BAD_REQUEST
        )
    if cd is not None:
        cd.mailbox_local_part = local_part
        cd.mailbox_enabled = enabled
        cd.save(update_fields=["mailbox_local_part", "mailbox_enabled", "updated_at"])
        if enabled and django_settings.CLOUDFLARE_EMAIL_WORKER_NAME and cd.cloudflare_zone_id:
            get_cloudflare().enable_email_routing(
                zone_id=cd.cloudflare_zone_id,
                worker_name=django_settings.CLOUDFLARE_EMAIL_WORKER_NAME,
            )
    return Response(_settings_payload(tenant))
```

- [ ] **Step 4: Wire the route**

In `backend/apps/mailbox/urls.py`, add:

```python
    path("settings/", views.mailbox_settings, name="mailbox-settings"),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/mailbox/tests/test_settings_api.py -v`
Expected: PASS (4 tests).

- [ ] **Step 6: Whole mailbox suite + lint + commit**

Run: `docker compose exec django pytest apps/mailbox -v` (all green), then
`docker compose exec django ruff check apps/mailbox/views.py apps/mailbox/urls.py`

```bash
git add backend/apps/mailbox/views.py backend/apps/mailbox/urls.py backend/apps/mailbox/tests/test_settings_api.py
git commit -m "feat(mailbox): coach mailbox settings API (address picker + enable + worker rebind)"
```

---

## Task 3: Frontend mailbox API module

**Files:**
- Create: `frontend-customer/src/lib/mailbox.ts`

**Interfaces:**
- Produces typed `clientFetch` wrappers consumed by Tasks 4-5. Mirror the style of `frontend-customer/src/lib/announcements.ts` (typed interfaces + functions returning `clientFetch<T>(...)`).

- [ ] **Step 1: Write the module**

`frontend-customer/src/lib/mailbox.ts`:

```typescript
import { clientFetch } from "@/lib/api-client";

const BASE = "/api/v1/mailbox";

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
}

export interface ConversationDetail extends ConversationListItem {
  messages: MailboxMessage[];
}

export interface MailboxSettings {
  has_custom_domain: boolean;
  domain: string;
  local_part: string;
  enabled: boolean;
  can_receive: boolean;
  from_email: string;
}

export function listConversations() {
  return clientFetch<ConversationListItem[]>(`${BASE}/conversations/`);
}

export function getConversation(id: number) {
  return clientFetch<ConversationDetail>(`${BASE}/conversations/${id}/`);
}

export function compose(body: { to: string; subject: string; text: string }) {
  return clientFetch<{ conversation_id: number; message_id: number }>(`${BASE}/compose/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function reply(id: number, text: string) {
  return clientFetch<{ message_id: number }>(`${BASE}/conversations/${id}/reply/`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export function updateConversation(id: number, patch: { is_archived?: boolean; is_spam?: boolean }) {
  return clientFetch<ConversationListItem>(`${BASE}/conversations/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteConversation(id: number) {
  return clientFetch<void>(`${BASE}/conversations/${id}/`, { method: "DELETE" });
}

export function getSettings() {
  return clientFetch<MailboxSettings>(`${BASE}/settings/`);
}

export function saveSettings(body: { local_part: string; enabled: boolean }) {
  return clientFetch<MailboxSettings>(`${BASE}/settings/`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `docker compose exec nextjs-customer npx tsc --noEmit -p tsconfig.json`
Expected: no new errors referencing `mailbox.ts`.

```bash
git add frontend-customer/src/lib/mailbox.ts
git commit -m "feat(mailbox): frontend API module for the coach inbox"
```

---

## Task 4: Inbox UI page + sidebar nav

**Files:**
- Create: `frontend-customer/src/app/admin/inbox/page.tsx`, `frontend-customer/src/components/admin/mailbox/inbox-client.tsx`
- Modify: `frontend-customer/src/components/admin/admin-shell.tsx` (nav item), `frontend-customer/messages/en/*` + `messages/tr/*` (strings)

**Interfaces:**
- Consumes the `mailbox.ts` module (Task 3).
- Produces the coach inbox at `/admin/inbox`: a two-pane Gmail layout — conversation list (left) with counterparty name (or email), subject snippet, and an unread badge; thread pane (right) rendering messages oldest→newest with the sanitized `html` (fall back to `text`); a reply box at the bottom of an open thread; a "New message" action opening a composer (`to`, `subject`, `text`). Per-conversation overflow actions: Archive, Mark spam, Delete (with confirm). When `getSettings().can_receive` is false, show a banner: "Add a custom domain to receive replies" and keep compose working (send-only).

- [ ] **Step 1: Build the page + client component**

Follow the existing admin page pattern in `frontend-customer/src/app/admin/notifications/` (a server `page.tsx` that renders a client component inside the admin shell). Requirements for `inbox-client.tsx` (client component, `"use client"`):
- On mount, `listConversations()` and `getSettings()`.
- Left list: selectable rows; show `counterparty_name || counterparty_email`; bold + a count badge when `unread_count > 0`; relative time from `last_message_at`.
- Selecting a row calls `getConversation(id)` (which server-marks it read); re-fetch the list afterward so the unread badge clears.
- Thread pane: render each message in a bubble aligned by `direction` (inbound left, outbound right). Render `message.html` via `dangerouslySetInnerHTML` ONLY because it is server-sanitized (Task 1) — add a code comment stating this; if `html` is empty, render `text` in a `<p>` with `whitespace-pre-wrap`.
- Reply box: textarea + Send → `reply(id, text)` → re-fetch the conversation.
- "New message" button → a dialog (use the existing Radix dialog component in the repo) with `to`, `subject`, `text` → `compose(...)` → select the new conversation.
- Overflow menu per conversation: Archive → `updateConversation(id, {is_archived:true})`; Mark spam → `updateConversation(id, {is_spam:true})`; Delete → confirm then `deleteConversation(id)`; refresh the list after each. Use the house design system's destructive-action confirm for Delete.
- If `!settings.can_receive`: render a dismissible upsell banner at the top and still allow compose.
- Loading + empty states (use the repo's `empty-state` component): "No conversations yet."

Apply the house design system (tokens, existing `Button`, `Dialog`, `Card`, `DropdownMenu` components under `src/components/ui`). Do NOT hardcode colors — use tokens. Keep copy non-technical.

- [ ] **Step 2: Add the sidebar nav item**

In `frontend-customer/src/components/admin/admin-shell.tsx`, import `Inbox` from `lucide-react` and add to the `community` section's `items` (after notifications):

```tsx
        { label: t("nav.items.inbox"), href: "/admin/inbox", icon: Inbox },
```

Add the `nav.items.inbox` key to the admin nav message files for both locales (find the JSON namespace holding `nav.items.notifications` — likely `messages/en/admin.json` / `messages/tr/admin.json` — and add `"inbox": "Inbox"` / the Turkish `"inbox": "Gelen Kutusu"` alongside it). Add any other inbox UI strings you introduce to the same files for both locales.

- [ ] **Step 3: Typecheck**

Run: `docker compose exec nextjs-customer npx tsc --noEmit -p tsconfig.json`
Expected: no new type errors.

- [ ] **Step 4: Build check**

Run: `docker compose exec nextjs-customer npm run build` (or confirm the dev server compiles the `/admin/inbox` route without errors in `docker compose logs nextjs-customer`).
Expected: `/admin/inbox` compiles.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/app/admin/inbox frontend-customer/src/components/admin/mailbox/inbox-client.tsx frontend-customer/src/components/admin/admin-shell.tsx frontend-customer/messages
git commit -m "feat(mailbox): coach inbox UI (list/thread/composer) + sidebar nav"
```

---

## Task 5: Address-picker settings UI

**Files:**
- Create: `frontend-customer/src/components/admin/mailbox/mailbox-settings.tsx`
- Modify: mount it — add a "Mailbox" section to the existing `frontend-customer/src/app/admin/settings/` page (inspect that page and add a card/section), OR a `/admin/inbox` settings entry point. Prefer the existing settings page so coaches find it with other settings.

**Interfaces:**
- Consumes `getSettings()` / `saveSettings()` (Task 3).
- Produces a non-technical control: shows the coach's domain and an input for the local part rendered visually as `[ input ]@theirdomain.com` with a live preview of the full address; an Enable toggle; a Save button. When `has_custom_domain` is false, disable the controls and show an upsell ("Buy a custom domain to get your own email address" linking to the domains flow). On save, `saveSettings({local_part, enabled})`, then reflect the returned `from_email`/`can_receive`. Validate the local part client-side to `^[a-zA-Z0-9._-]+$` and show an inline error; the server re-validates.

- [ ] **Step 1: Build the component + mount it**

Implement `mailbox-settings.tsx` (`"use client"`) per the interface above, mirroring the form/card patterns already used on the admin settings page. Use house-design-system inputs, toggle (Radix Switch if present), and the toast (`sonner`) on save success/failure. Mount it as a section on `src/app/admin/settings/` (read that page first and follow its section composition).

- [ ] **Step 2: Add strings**

Add the settings strings (label, preview helper, enable toggle, upsell copy, validation error) to `messages/en/*` and `messages/tr/*` in the same namespace the settings page uses, for both locales.

- [ ] **Step 3: Typecheck + build**

Run: `docker compose exec nextjs-customer npx tsc --noEmit -p tsconfig.json`
Then confirm the settings route compiles (build or dev logs).
Expected: no new type errors; route compiles.

- [ ] **Step 4: Commit**

```bash
git add frontend-customer/src/components/admin/mailbox/mailbox-settings.tsx frontend-customer/src/app/admin/settings frontend-customer/messages
git commit -m "feat(mailbox): coach address-picker settings UI"
```

---

## Final: Browser smoke (after all tasks + reviews)

Not a code task — the controller runs this before the Phase 3 whole-branch review's sign-off:
1. Dev stack is running. Log in as a coach on a seeded tenant (frontend-customer).
2. Visit `/admin/inbox` → the page renders, the nav item is present, empty state shows.
3. Seed an inbound conversation (or POST a signed inbound webhook) and confirm it appears, opens, marks read, and the reply box sends (with Resend bypassed/faked in dev).
4. Visit the settings page → the address picker renders, shows the upsell when no custom domain.
5. Capture a screenshot of the inbox for the record.

## Self-Review notes

- **Spec coverage (Phase 3):** threaded inbox list/thread (Task 4) ✓; compose + reply (Tasks 3-4) ✓; student name display via `counterparty_name`/`student` (Task 4) ✓; archive/spam/delete (Tasks 1, 4) ✓; address picker + enable (Tasks 2, 5) ✓; no-domain send-only + upsell (Tasks 4, 5) ✓; sanitized inbound HTML render (Task 1) ✓.
- **Type consistency:** `mailbox.ts` interfaces match the DRF serializer keys (`student`, `is_spam`, sanitized `html`) and the settings payload keys from Task 2. Frontend consumes only `mailbox.ts`.
- **Deferred / out of scope:** attachments; a dedicated spam folder view (the `is_spam` flag exists but Task 4 need only exclude/label spam, full folder is later); real-time push of new inbound to an open inbox (polling/refresh is fine for v1); re-provisioning already-live domains when enabling (Task 2 re-binds on enable, which covers it).
- **Deploy note:** no new migrations in Phase 3 (reuses Phase 1/2 schema). Frontend needs a rebuild/redeploy of `nextjs-customer`.
```
