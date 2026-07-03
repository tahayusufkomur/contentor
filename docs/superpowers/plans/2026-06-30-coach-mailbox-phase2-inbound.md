# Coach Mailbox — Phase 2 (Inbound) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Deliver inbound email into the coach mailbox: a signed webhook that a Cloudflare Email Worker calls for every message sent to a coach's custom domain, resolves the recipient domain to its tenant, stores the message as a threaded inbound `Message`, links the sender to a student, and the provisioning change that points the domain's catch-all rule at the Worker instead of forwarding to the coach's Gmail.

**Architecture:** Cloudflare Email Routing catch-all → Cloudflare Email Worker (account-level, reused across all zones) → `POST /api/v1/mailbox/inbound/` (HMAC-signed). The Django webhook runs in the public schema, resolves `recipient domain → CustomDomain → Tenant`, switches into the tenant schema, and stores the message. Builds directly on Phase 1's `apps.mailbox` models and `get_or_create_conversation`.

**Tech Stack:** Django 5.1, DRF, django-tenants, Cloudflare Email Routing + Email Workers (JS, deployed via wrangler), HMAC-SHA256, pytest.

## Global Constraints

- Backend tests run inside the django container: `docker compose exec django pytest <path> -v` (the `make test` target does NOT pass args). Run `make migrate` for tenant migrations, `make migrate-shared` for shared.
- Lint ONLY changed files: `docker compose exec django ruff check <paths>` (repo-wide `make lint` fails on pre-existing/unrelated violations).
- Public webhook endpoints use `@csrf_exempt`, `@api_view(["POST"])`, `@authentication_classes([])`, `@permission_classes([AllowAny])` (per CLAUDE.md, AllowAny alone is not enough). Read the raw body via `request.body` and the signature via `request.META.get("HTTP_X_MAILBOX_SIGNATURE", "")`.
- `apps.mailbox` is a TENANT app → new migrations apply via `make migrate` (`migrate_schemas --tenant`).
- Inbound to an unknown / mailbox-disabled / not-live recipient domain → respond HTTP 200 and drop (never leak which domains exist, never retry). A bad/missing signature → HTTP 401. A duplicate (same `message_id`) → HTTP 200, store nothing.
- Use explicit file paths in `git add` (never `-A`/`.`) — shared working tree with unrelated uncommitted changes. Commit per task on `feat/coach-mailbox`. Do NOT push.
- Tenant-scoped tests use the `tenant_ctx` fixture + `pytestmark = pytest.mark.django_db(transaction=True)`.
- HMAC: signature = lowercase hex of `HMAC-SHA256(secret, raw_request_body_bytes)`, compared with `hmac.compare_digest`. Secret = `settings.MAILBOX_INBOUND_SECRET`.

## Carry-over from Phase 1 final review

- The Phase 1 final review flagged that `get_or_create_conversation` filters `is_archived=False` and the `filter().first()`-then-`create()` is **not atomic** — under inbound concurrency two messages from a new sender can create duplicate conversations. **Task 1 fixes this** with a partial unique constraint + race-safe get-or-create. This is the right place to land it (inbound is the first real concurrent caller).

---

## File Structure

**Create:**
- `backend/apps/mailbox/inbound.py` — `receive_inbound(...)` service (tenant-context)
- `backend/apps/mailbox/signing.py` — `sign_payload`, `verify_inbound_signature`
- `backend/apps/mailbox/migrations/0002_conversation_unique_open.py` — partial unique constraint (generated)
- `backend/apps/mailbox/tests/test_inbound.py`
- `backend/apps/mailbox/tests/test_signing.py`
- `backend/apps/mailbox/tests/test_inbound_api.py`
- `infra/cloudflare/mailbox-worker/src/index.js` — the Email Worker
- `infra/cloudflare/mailbox-worker/wrangler.toml`
- `infra/cloudflare/mailbox-worker/package.json`
- `infra/cloudflare/mailbox-worker/README.md` — deploy + binding instructions

**Modify:**
- `backend/apps/mailbox/services.py` — make `get_or_create_conversation` race-safe
- `backend/apps/mailbox/views.py` — add `inbound` webhook view
- `backend/apps/mailbox/urls.py` — add `inbound/` route
- `backend/apps/mailbox/models.py` — add `Conversation.Meta.constraints`
- `backend/config/settings/base.py` — `MAILBOX_INBOUND_SECRET`, `CLOUDFLARE_EMAIL_WORKER_NAME`
- `backend/apps/domains/cloudflare/base.py` / `client.py` / `fake.py` — `enable_email_routing(..., worker_name="")`
- `backend/apps/domains/provisioning.py` — route catch-all to Worker when `mailbox_enabled`
- `backend/apps/domains/tests/` — update email-routing tests for the worker path

---

## Task 1: Race-safe conversation + `receive_inbound` service

**Files:**
- Modify: `backend/apps/mailbox/models.py` (add `Conversation.Meta.constraints`), `backend/apps/mailbox/services.py` (race-safe get-or-create)
- Create: `backend/apps/mailbox/inbound.py`, `backend/apps/mailbox/migrations/0002_conversation_unique_open.py`, `backend/apps/mailbox/tests/test_inbound.py`

**Interfaces:**
- Consumes: `Conversation`, `Message`, `get_or_create_conversation` (Phase 1).
- Produces: `receive_inbound(*, from_email: str, to_email: str, subject: str, text: str = "", html: str = "", message_id: str = "", in_reply_to: str = "", references: str = "") -> Message | None`. Returns the stored inbound `Message`, or `None` if a message with the same non-empty `message_id` already exists (idempotency). Stores `direction="inbound"`, `is_read=False`; increments `conversation.unread_count`; sets `conversation.last_message_at`.

- [ ] **Step 1: Add the partial unique constraint to the model**

In `backend/apps/mailbox/models.py`, add a `constraints` entry to `Conversation.Meta` (keep `app_label` and `ordering`):

```python
    class Meta:
        app_label = "mailbox"
        ordering = ["-last_message_at", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["counterparty_email"],
                condition=models.Q(is_archived=False),
                name="uniq_open_conversation_per_counterparty",
            )
        ]
```

- [ ] **Step 2: Generate + apply the migration**

Run: `docker compose exec django python manage.py makemigrations mailbox`
Expected: creates `0002_*` with an `AddConstraint`. Rename the file to `0002_conversation_unique_open.py` if Django picked another suffix (keep the `0002` prefix and update the migration's `name=` only if the file rename requires it — the migration class needs no change).
Run: `make migrate`
Expected: applies cleanly (no existing duplicate open conversations in any tenant — this is a new feature).

- [ ] **Step 3: Write the failing service tests**

`backend/apps/mailbox/tests/test_inbound.py`:

```python
import pytest

from apps.accounts.models import User
from apps.mailbox.inbound import receive_inbound
from apps.mailbox.models import Conversation, Message

pytestmark = pytest.mark.django_db(transaction=True)


def test_receive_stores_inbound_and_links_student(tenant_ctx):
    student = User.objects.create_user(
        email="stu@x.com", name="Stu", password="secret123", role="student"
    )
    msg = receive_inbound(
        from_email="stu@x.com", to_email="info@coach.com", subject="Question",
        text="hi coach", message_id="<m1@x.com>",
    )
    assert msg is not None
    assert msg.direction == "inbound"
    assert msg.is_read is False
    conv = msg.conversation
    assert conv.student_id == student.id
    assert conv.unread_count == 1
    assert conv.last_message_at is not None


def test_receive_is_idempotent_on_message_id(tenant_ctx):
    first = receive_inbound(
        from_email="p@x.com", to_email="info@coach.com", subject="Hi",
        text="one", message_id="<dup@x.com>",
    )
    second = receive_inbound(
        from_email="p@x.com", to_email="info@coach.com", subject="Hi",
        text="one again", message_id="<dup@x.com>",
    )
    assert first is not None
    assert second is None
    assert Message.objects.filter(message_id="<dup@x.com>").count() == 1
    assert Conversation.objects.get(counterparty_email="p@x.com").unread_count == 1


def test_receive_threads_into_existing_conversation(tenant_ctx):
    receive_inbound(
        from_email="p@x.com", to_email="info@coach.com", subject="Hi",
        text="one", message_id="<a@x.com>",
    )
    receive_inbound(
        from_email="p@x.com", to_email="info@coach.com", subject="Re: Hi",
        text="two", message_id="<b@x.com>",
    )
    conv = Conversation.objects.get(counterparty_email="p@x.com")
    assert conv.messages.count() == 2
    assert conv.unread_count == 2
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/mailbox/tests/test_inbound.py -v`
Expected: FAIL — `ModuleNotFoundError: apps.mailbox.inbound`.

- [ ] **Step 5: Make `get_or_create_conversation` race-safe**

In `backend/apps/mailbox/services.py`, replace the body of `get_or_create_conversation` with a version that handles the unique-constraint race:

```python
from django.db import IntegrityError, connection, transaction


def get_or_create_conversation(*, counterparty_email: str, subject: str = "") -> Conversation:
    email = counterparty_email.strip().lower()
    conv = Conversation.objects.filter(counterparty_email=email, is_archived=False).first()
    if conv:
        return conv
    student = User.objects.filter(email__iexact=email).first()
    try:
        with transaction.atomic():
            return Conversation.objects.create(
                counterparty_email=email,
                counterparty_name=(student.name if student else ""),
                subject=subject,
                student=student,
            )
    except IntegrityError:
        # A concurrent caller created the open conversation first.
        return Conversation.objects.get(counterparty_email=email, is_archived=False)
```

(Keep the existing `import uuid`, `from django.utils import timezone`, `from apps.accounts.models import User`, `from apps.core.email import send_email`, `from .identity import sending_identity`, `from .models import Conversation, Message`, and the `new_message_id` / `send_message` functions unchanged. Add `IntegrityError`, `transaction` to the django.db import — `connection` is already imported.)

- [ ] **Step 6: Write the `receive_inbound` service**

`backend/apps/mailbox/inbound.py` (use this exactly — the `F("unread_count") + 1` makes the increment atomic at the DB level):

```python
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from .models import Conversation, Message
from .services import get_or_create_conversation


def receive_inbound(
    *,
    from_email: str,
    to_email: str,
    subject: str,
    text: str = "",
    html: str = "",
    message_id: str = "",
    in_reply_to: str = "",
    references: str = "",
) -> Message | None:
    if message_id and Message.objects.filter(message_id=message_id).exists():
        return None

    conversation = get_or_create_conversation(
        counterparty_email=from_email, subject=subject
    )
    with transaction.atomic():
        msg = Message.objects.create(
            conversation=conversation,
            direction="inbound",
            from_email=from_email.strip().lower(),
            to_email=to_email.strip().lower(),
            text=text,
            html=html,
            message_id=message_id,
            in_reply_to=in_reply_to,
            references=references,
            is_read=False,
        )
        Conversation.objects.filter(pk=conversation.pk).update(
            unread_count=F("unread_count") + 1,
            last_message_at=timezone.now(),
        )
    return msg
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/mailbox/tests/test_inbound.py apps/mailbox/tests/test_services.py -v`
Expected: PASS (3 new inbound tests + the existing services tests still green, proving the race-safe refactor didn't regress).

- [ ] **Step 8: Lint changed files + commit**

Run: `docker compose exec django ruff check apps/mailbox/inbound.py apps/mailbox/services.py apps/mailbox/models.py`
Expected: no issues on these files.

```bash
git add backend/apps/mailbox/inbound.py backend/apps/mailbox/services.py backend/apps/mailbox/models.py backend/apps/mailbox/migrations/0002_conversation_unique_open.py backend/apps/mailbox/tests/test_inbound.py
git commit -m "feat(mailbox): inbound receive service + race-safe conversation get-or-create"
```

---

## Task 2: HMAC signature helpers

**Files:**
- Create: `backend/apps/mailbox/signing.py`, `backend/apps/mailbox/tests/test_signing.py`
- Modify: `backend/config/settings/base.py` (add `MAILBOX_INBOUND_SECRET`)

**Interfaces:**
- Produces: `sign_payload(body: bytes, secret: str) -> str` (lowercase hex HMAC-SHA256) and `verify_inbound_signature(body: bytes, signature: str) -> bool` (compares against `settings.MAILBOX_INBOUND_SECRET` with `hmac.compare_digest`; returns False if the secret is unset or signature is empty).

- [ ] **Step 1: Add the setting**

In `backend/config/settings/base.py`, near the other secret/integration settings, add:

```python
# --- Coach mailbox inbound webhook ---
MAILBOX_INBOUND_SECRET = os.environ.get("MAILBOX_INBOUND_SECRET", "")
CLOUDFLARE_EMAIL_WORKER_NAME = os.environ.get("CLOUDFLARE_EMAIL_WORKER_NAME", "")
```

- [ ] **Step 2: Write the failing tests**

`backend/apps/mailbox/tests/test_signing.py`:

```python
from django.test import override_settings

from apps.mailbox import signing


@override_settings(MAILBOX_INBOUND_SECRET="topsecret")
def test_sign_and_verify_roundtrip():
    body = b'{"to":"info@coach.com"}'
    sig = signing.sign_payload(body, "topsecret")
    assert signing.verify_inbound_signature(body, sig) is True


@override_settings(MAILBOX_INBOUND_SECRET="topsecret")
def test_verify_rejects_tampered_body():
    sig = signing.sign_payload(b"original", "topsecret")
    assert signing.verify_inbound_signature(b"tampered", sig) is False


@override_settings(MAILBOX_INBOUND_SECRET="topsecret")
def test_verify_rejects_empty_signature():
    assert signing.verify_inbound_signature(b"x", "") is False


@override_settings(MAILBOX_INBOUND_SECRET="")
def test_verify_false_when_secret_unset():
    sig = signing.sign_payload(b"x", "whatever")
    assert signing.verify_inbound_signature(b"x", sig) is False
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/mailbox/tests/test_signing.py -v`
Expected: FAIL — `ModuleNotFoundError: apps.mailbox.signing`.

- [ ] **Step 4: Write the implementation**

`backend/apps/mailbox/signing.py`:

```python
import hashlib
import hmac

from django.conf import settings


def sign_payload(body: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def verify_inbound_signature(body: bytes, signature: str) -> bool:
    secret = settings.MAILBOX_INBOUND_SECRET
    if not secret or not signature:
        return False
    expected = sign_payload(body, secret)
    return hmac.compare_digest(expected, signature)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/mailbox/tests/test_signing.py -v`
Expected: PASS (4 tests).

- [ ] **Step 6: Lint + commit**

Run: `docker compose exec django ruff check apps/mailbox/signing.py`

```bash
git add backend/apps/mailbox/signing.py backend/apps/mailbox/tests/test_signing.py backend/config/settings/base.py
git commit -m "feat(mailbox): HMAC signing helpers for inbound webhook"
```

---

## Task 3: Inbound webhook view + tenant resolution

**Files:**
- Modify: `backend/apps/mailbox/views.py` (add `inbound`), `backend/apps/mailbox/urls.py` (add route)
- Create: `backend/apps/mailbox/tests/test_inbound_api.py`

**Interfaces:**
- Consumes: `verify_inbound_signature` (Task 2), `receive_inbound` (Task 1), `apps.domains.models.CustomDomain`, `django_tenants.utils.tenant_context`.
- Produces: `POST /api/v1/mailbox/inbound/`. Request body JSON: `{from, to, subject, text?, html?, message_id?, in_reply_to?, references?}`. Header `X-Mailbox-Signature`. Behavior: bad/missing signature → 401; unknown/disabled/not-live recipient domain → 200 (drop); duplicate message_id → 200; success → 200.

- [ ] **Step 1: Write the failing API tests**

`backend/apps/mailbox/tests/test_inbound_api.py`:

```python
import json

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.domains.models import CustomDomain
from apps.mailbox import signing
from apps.mailbox.models import Conversation, Message

pytestmark = pytest.mark.django_db(transaction=True)

SECRET = "topsecret"
HOST = "shared-test.localhost"


@pytest.fixture(autouse=True)
def _clean_custom_domains():
    # CustomDomain is a SHARED (public-schema) model and is NOT cleaned by the
    # tenant_ctx teardown, so committed rows would leak across tests (domain is
    # unique). Clean before and after each test in this module.
    CustomDomain.objects.all().delete()
    yield
    CustomDomain.objects.all().delete()


def _post(body: dict, *, sign=True):
    raw = json.dumps(body).encode()
    headers = {}
    if sign:
        headers["HTTP_X_MAILBOX_SIGNATURE"] = signing.sign_payload(raw, SECRET)
    return APIClient().post(
        "/api/v1/mailbox/inbound/", data=raw,
        content_type="application/json", **headers,
    )


@override_settings(MAILBOX_INBOUND_SECRET=SECRET)
def test_inbound_rejects_bad_signature(tenant_ctx):
    resp = APIClient().post(
        "/api/v1/mailbox/inbound/", data=b"{}", content_type="application/json",
        HTTP_X_MAILBOX_SIGNATURE="deadbeef",
    )
    assert resp.status_code == 401


@override_settings(MAILBOX_INBOUND_SECRET=SECRET)
def test_inbound_unknown_domain_drops_with_200(tenant_ctx):
    resp = _post({"from": "p@x.com", "to": "info@nope.com", "subject": "Hi", "text": "yo",
                  "message_id": "<u@x.com>"})
    assert resp.status_code == 200
    assert Message.objects.count() == 0


@override_settings(MAILBOX_INBOUND_SECRET=SECRET)
def test_inbound_stores_for_live_enabled_domain(tenant_ctx):
    CustomDomain.objects.create(
        tenant=tenant_ctx, domain="coach.com",
        cost_minor=1, price_minor=1, currency="usd",
        provisioning_status="live", mailbox_enabled=True,
    )
    resp = _post({"from": "p@x.com", "to": "info@coach.com", "subject": "Hi",
                  "text": "hello", "message_id": "<m@x.com>"})
    assert resp.status_code == 200
    conv = Conversation.objects.get(counterparty_email="p@x.com")
    assert conv.messages.filter(direction="inbound").count() == 1
    assert conv.unread_count == 1


@override_settings(MAILBOX_INBOUND_SECRET=SECRET)
def test_inbound_duplicate_message_id_is_200_no_store(tenant_ctx):
    CustomDomain.objects.create(
        tenant=tenant_ctx, domain="coach.com",
        cost_minor=1, price_minor=1, currency="usd",
        provisioning_status="live", mailbox_enabled=True,
    )
    body = {"from": "p@x.com", "to": "info@coach.com", "subject": "Hi",
            "text": "hello", "message_id": "<dup@x.com>"}
    assert _post(body).status_code == 200
    assert _post(body).status_code == 200
    assert Message.objects.filter(message_id="<dup@x.com>").count() == 1
```

Note: the webhook resolves the tenant itself, so these tests create the `CustomDomain` inside `tenant_ctx` (the shared test tenant) and the view's `tenant_context(cd.tenant)` re-enters that same schema. The `CustomDomain` (public) row created under `tenant_ctx` persists in the public schema for the request to find.

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/mailbox/tests/test_inbound_api.py -v`
Expected: FAIL — 404 (route not wired) / errors.

- [ ] **Step 3: Add the webhook view**

In `backend/apps/mailbox/views.py`, add imports at the top:

```python
import json

from django.views.decorators.csrf import csrf_exempt
from django_tenants.utils import tenant_context
from rest_framework.decorators import authentication_classes
from rest_framework.permissions import AllowAny

from apps.domains.models import CustomDomain

from .inbound import receive_inbound
from .signing import verify_inbound_signature
```

and append this view:

```python
@csrf_exempt
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def inbound(request):
    if not verify_inbound_signature(request.body, request.META.get("HTTP_X_MAILBOX_SIGNATURE", "")):
        return Response(status=status.HTTP_401_UNAUTHORIZED)

    try:
        payload = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return Response(status=status.HTTP_400_BAD_REQUEST)

    to_email = (payload.get("to") or "").strip().lower()
    domain = to_email.rsplit("@", 1)[-1] if "@" in to_email else ""
    cd = CustomDomain.objects.filter(
        domain=domain, mailbox_enabled=True, provisioning_status="live"
    ).first()
    if not cd:
        # Unknown / disabled / not-live recipient — drop without leaking.
        return Response(status=status.HTTP_200_OK)

    with tenant_context(cd.tenant):
        receive_inbound(
            from_email=(payload.get("from") or "").strip(),
            to_email=to_email,
            subject=payload.get("subject") or "",
            text=payload.get("text") or "",
            html=payload.get("html") or "",
            message_id=payload.get("message_id") or "",
            in_reply_to=payload.get("in_reply_to") or "",
            references=payload.get("references") or "",
        )
    return Response(status=status.HTTP_200_OK)
```

- [ ] **Step 4: Wire the route**

In `backend/apps/mailbox/urls.py`, add to `urlpatterns`:

```python
    path("inbound/", views.inbound, name="mailbox-inbound"),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/mailbox/tests/test_inbound_api.py -v`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the whole mailbox suite + lint + commit**

Run: `docker compose exec django pytest apps/mailbox -v` (all green), then
`docker compose exec django ruff check apps/mailbox/views.py apps/mailbox/urls.py`

```bash
git add backend/apps/mailbox/views.py backend/apps/mailbox/urls.py backend/apps/mailbox/tests/test_inbound_api.py
git commit -m "feat(mailbox): signed inbound webhook with domain->tenant resolution"
```

---

## Task 4: Cloudflare client Worker routing + provisioning swap

**Files:**
- Modify: `backend/apps/domains/cloudflare/base.py`, `cloudflare/client.py`, `cloudflare/fake.py`, `backend/apps/domains/provisioning.py`
- Test: `backend/apps/domains/tests/test_cloudflare.py`, `backend/apps/domains/tests/test_provisioning.py`

**Interfaces:**
- Produces: `Cloudflare.enable_email_routing(*, zone_id, forward_to="", worker_name="")`. When `worker_name` is set, the catch-all rule action becomes `{"type": "worker", "value": [worker_name]}`; else when `forward_to` is set, it stays `{"type": "forward", "value": [forward_to]}`. Provisioning routes to the Worker when `cd.mailbox_enabled` and `settings.CLOUDFLARE_EMAIL_WORKER_NAME` is set, otherwise falls back to forwarding (existing behavior).

- [ ] **Step 1: Write the failing tests**

Add to `backend/apps/domains/tests/test_cloudflare.py` (using `FakeCloudflare`):

```python
def test_enable_email_routing_binds_worker_when_named():
    from apps.domains.cloudflare.fake import FakeCloudflare

    cf = FakeCloudflare()
    z = cf.create_zone("coach.com")["zone_id"]
    cf.enable_email_routing(zone_id=z, worker_name="mailbox-inbound")
    assert cf.zones[z]["email_worker"] == "mailbox-inbound"


def test_enable_email_routing_forward_still_works():
    from apps.domains.cloudflare.fake import FakeCloudflare

    cf = FakeCloudflare()
    z = cf.create_zone("coach.com")["zone_id"]
    cf.enable_email_routing(zone_id=z, forward_to="coach@gmail.com")
    assert cf.zones[z]["email_forward"] == "coach@gmail.com"
```

And add to `backend/apps/domains/tests/test_provisioning.py` a test that a mailbox-enabled domain routes to the worker. Inspect the existing provisioning test setup in that file for the established fixture/monkeypatch pattern, then add:

```python
@override_settings(CLOUDFLARE_EMAIL_WORKER_NAME="mailbox-inbound", DOMAINS_BYPASS_ENABLED=True)
def test_provision_routes_mailbox_domain_to_worker(db):
    # Build a CustomDomain with mailbox_enabled=True and run _step_email_auth;
    # assert the fake Cloudflare recorded an email_worker binding (not a forward).
    ...
```

(Write this test concretely against the file's existing helpers — match how other `_step_*` tests construct a `CustomDomain` and obtain the fake Cloudflare. If the existing tests call `provisioning._step_email_auth(cd)` directly, do the same.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/domains/tests/test_cloudflare.py -k worker -v`
Expected: FAIL — `enable_email_routing() got an unexpected keyword argument 'worker_name'`.

- [ ] **Step 3: Update the Cloudflare interface + fake + client**

`base.py` — change the abstract signature:

```python
    @abstractmethod
    def enable_email_routing(self, *, zone_id: str, forward_to: str = "", worker_name: str = "") -> None: ...
```

`fake.py` — replace `enable_email_routing`:

```python
    def enable_email_routing(self, *, zone_id: str, forward_to: str = "", worker_name: str = "") -> None:
        zone = self.zones.setdefault(zone_id, {})
        if worker_name:
            zone["email_worker"] = worker_name
        elif forward_to:
            zone["email_forward"] = forward_to
```

`client.py` — replace `enable_email_routing`:

```python
    def enable_email_routing(self, *, zone_id: str, forward_to: str = "", worker_name: str = "") -> None:
        # Enable Email Routing (installs Cloudflare's inbound MX records).
        self._request("POST", f"/zones/{zone_id}/email/routing/dns", {})
        if worker_name:
            action = {"type": "worker", "value": [worker_name]}
        else:
            action = {"type": "forward", "value": [forward_to]}
        self._request(
            "PUT",
            f"/zones/{zone_id}/email/routing/rules/catch_all",
            {"enabled": True, "actions": [action], "matchers": [{"type": "all"}]},
        )
```

- [ ] **Step 4: Update provisioning to prefer the Worker**

In `backend/apps/domains/provisioning.py`, replace the tail of `_step_email_auth` (the `if cd.forward_to_email:` block) with:

```python
    from django.conf import settings

    if cd.mailbox_enabled and settings.CLOUDFLARE_EMAIL_WORKER_NAME:
        cf.enable_email_routing(
            zone_id=cd.cloudflare_zone_id,
            worker_name=settings.CLOUDFLARE_EMAIL_WORKER_NAME,
        )
    elif cd.forward_to_email:
        cf.enable_email_routing(zone_id=cd.cloudflare_zone_id, forward_to=cd.forward_to_email)
```

(There is already a `from django.conf import settings` near the top of `_step_dns_records`; if importing again inside `_step_email_auth` duplicates it, hoist a single module-level `from django.conf import settings` import instead and remove the local ones — match the file's existing style.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose exec django pytest apps/domains/tests/test_cloudflare.py apps/domains/tests/test_provisioning.py -v`
Expected: PASS (new worker tests + all existing domain provisioning tests still green — the forward path is preserved for non-mailbox domains).

- [ ] **Step 6: Lint + commit**

Run: `docker compose exec django ruff check apps/domains/cloudflare/base.py apps/domains/cloudflare/client.py apps/domains/cloudflare/fake.py apps/domains/provisioning.py`

```bash
git add backend/apps/domains/cloudflare/base.py backend/apps/domains/cloudflare/client.py backend/apps/domains/cloudflare/fake.py backend/apps/domains/provisioning.py backend/apps/domains/tests/test_cloudflare.py backend/apps/domains/tests/test_provisioning.py
git commit -m "feat(domains): route mailbox-enabled domains' catch-all to the inbound Worker"
```

---

## Task 5: Cloudflare Email Worker script + deploy docs

**Files:**
- Create: `infra/cloudflare/mailbox-worker/src/index.js`, `wrangler.toml`, `package.json`, `README.md`

**Interfaces:**
- Produces: a deployable Cloudflare Email Worker that, on each inbound message, parses sender/recipient/subject/body and POSTs `{from,to,subject,text,html,message_id,in_reply_to,references}` to `${WEBHOOK_URL}` with header `X-Mailbox-Signature: hex(HMAC_SHA256(MAILBOX_INBOUND_SECRET, rawJsonBody))`. This is infra code — it is deployed manually via wrangler (cannot run in the Django test suite). The task deliverable is the reviewed script + config + deploy instructions.

- [ ] **Step 1: Write the Worker**

`infra/cloudflare/mailbox-worker/src/index.js`:

```javascript
import PostalMime from "postal-mime";

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sign(secret, body) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return toHex(sig);
}

export default {
  async email(message, env) {
    const parsed = await PostalMime.parse(message.raw);
    const payload = JSON.stringify({
      from: message.from,
      to: message.to,
      subject: parsed.subject || "",
      text: parsed.text || "",
      html: parsed.html || "",
      message_id: parsed.messageId || "",
      in_reply_to: parsed.inReplyTo || "",
      references: Array.isArray(parsed.references)
        ? parsed.references.join(" ")
        : parsed.references || "",
    });
    const signature = await sign(env.MAILBOX_INBOUND_SECRET, payload);
    const resp = await fetch(env.WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Mailbox-Signature": signature },
      body: payload,
    });
    // On webhook failure, reject so Cloudflare retries / the sender is notified.
    if (!resp.ok && resp.status >= 500) {
      message.setReject("Temporary failure delivering to mailbox");
    }
  },
};
```

- [ ] **Step 2: Write the wrangler config**

`infra/cloudflare/mailbox-worker/wrangler.toml`:

```toml
name = "mailbox-inbound"
main = "src/index.js"
compatibility_date = "2024-11-01"

# Set via `wrangler secret put MAILBOX_INBOUND_SECRET` (do NOT commit secrets).
# WEBHOOK_URL is the public inbound endpoint.
[vars]
WEBHOOK_URL = "https://contentor.app/api/v1/mailbox/inbound/"
```

`infra/cloudflare/mailbox-worker/package.json`:

```json
{
  "name": "mailbox-inbound-worker",
  "private": true,
  "type": "module",
  "dependencies": {
    "postal-mime": "^2.2.0"
  },
  "devDependencies": {
    "wrangler": "^3.80.0"
  },
  "scripts": {
    "deploy": "wrangler deploy",
    "secret": "wrangler secret put MAILBOX_INBOUND_SECRET"
  }
}
```

- [ ] **Step 3: Write the deploy README**

`infra/cloudflare/mailbox-worker/README.md` — document, in prose:
1. `npm install` then `npx wrangler deploy` (deploys the account-level Worker named `mailbox-inbound`).
2. `npx wrangler secret put MAILBOX_INBOUND_SECRET` — must equal Django's `MAILBOX_INBOUND_SECRET` env var. Generate once with `openssl rand -hex 32`.
3. Set Django env: `MAILBOX_INBOUND_SECRET=<same value>` and `CLOUDFLARE_EMAIL_WORKER_NAME=mailbox-inbound` in `.env.prod`.
4. The provisioning code (Task 4) binds each mailbox-enabled zone's Email Routing catch-all rule to this Worker automatically — no per-zone Worker config needed. Existing already-provisioned domains can be re-bound by re-running `_step_email_auth` (or a one-off management action) after `mailbox_enabled` is set.
5. Note: the Worker is account-level and shared across all tenant zones; the webhook resolves the tenant from the recipient domain, so one Worker + one secret serves every coach.

- [ ] **Step 4: Commit (no automated test — infra artifact)**

There is no Django test for this task. Verify the JS is syntactically valid if Node is available (`node --check infra/cloudflare/mailbox-worker/src/index.js`); otherwise rely on review.

```bash
git add infra/cloudflare/mailbox-worker
git commit -m "feat(mailbox): Cloudflare Email Worker that posts inbound mail to the webhook"
```

---

## Self-Review notes

- **Spec coverage (Phase 2):** signed inbound webhook (Task 3) ✓; domain→tenant resolution + drop-on-unknown (Task 3) ✓; threaded inbound store + student link + idempotency (Task 1) ✓; catch-all `forward`→`worker` swap (Task 4) ✓; the Cloudflare Email Worker artifact (Task 5) ✓; the Phase-1-review concurrency/dedup guard (Task 1 partial unique + race-safe get-or-create) ✓.
- **Type consistency:** `receive_inbound(...) -> Message | None` consumed by the webhook (Task 3); `enable_email_routing(..., worker_name="")` consumed by provisioning (Task 4); `verify_inbound_signature(body, signature)` consumed by the webhook (Task 3). `get_or_create_conversation` keeps its Phase 1 signature; only its body changes (race-safe).
- **Deferred to Phase 3 / later:** rendering inbound `html` safely in the coach UI (Phase 3 must sanitize on display — the stored inbound `html` is attacker-controlled); attachments (stripped — Worker forwards text/html only); spam folder. The webhook reads `MAILBOX_INBOUND_SECRET`; if unset, ALL inbound is rejected (fail-closed) — acceptable.
- **Out of scope:** automated deploy of the Worker (manual wrangler, documented); re-binding already-live domains is noted as a follow-up ops action.
```
