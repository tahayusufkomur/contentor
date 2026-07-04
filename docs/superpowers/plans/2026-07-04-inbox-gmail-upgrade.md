# Inbox Gmail Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the coach inbox as a Gmail-pattern client (folder rail, list view, in-place thread) with TipTap rich-text compose/reply and attachments in both directions.

**Architecture:** Backend adds a `MessageAttachment` tenant model + upload endpoint, threads `html`/`attachment_ids` through compose/reply → `send_message` → Resend, and extends the inbound webhook + Cloudflare worker with base64 attachments stored in object storage. Frontend splits the monolithic `inbox-client.tsx` into focused components (rail, list, thread, editor, compose card) around a thin orchestrator.

**Tech Stack:** Django 5.1 + DRF + django-tenants, boto3 (existing `apps/core/storage.py` helpers), Resend, nh3 (existing `sanitize_rich_text`), Next.js 14 + TipTap v2 + `@tailwindcss/typography`.

**Spec:** `docs/superpowers/specs/2026-07-04-inbox-gmail-upgrade-design.md`

## Global Constraints

- Work on branch `feat/inbox-gmail` (create from current local `main`). **Shared working tree:** verify `git branch --show-current` prints `feat/inbox-gmail` before EVERY commit (other agents move HEAD).
- Attachment limits: **10 MB per file**, **max 4 files per message**. MIME allowlist: prefixes `image/`, `video/`, `audio/` + exact `application/pdf`, `application/zip`, `text/plain`, `text/csv`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/vnd.ms-powerpoint`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`.
- Worker: ≤10 MB per file included as base64, ~20 MB total cap; beyond either → placeholder `{filename, content_type, size, omitted: true}`.
- `DATA_UPLOAD_MAX_MEMORY_SIZE = 30 * 1024 * 1024` (base settings).
- All outbound HTML sanitized server-side with `sanitize_rich_text` (never trust editor output).
- Backend tests: `docker compose exec django pytest apps/mailbox -v` (dev stack must be up: `make dev`).
- Frontend: after adding npm deps run `npm install` in `frontend-customer/` AND rebuild the container (`docker compose build nextjs-customer`) before browser testing. Pre-commit does NOT lint frontends — run `make format` before committing frontend work.
- New tenant-app migration ⇒ prod deploy must run `migrate_schemas --tenant` (entrypoint already does since the tenant-migrations fix).
- Existing UI conventions: shadcn-style components in `src/components/ui/`, lucide icons, sonner toasts, design tokens (no raw colors).

---

### Task 1: `MessageAttachment` model + migration

**Files:**
- Modify: `backend/apps/mailbox/models.py`
- Create: `backend/apps/mailbox/migrations/0004_messageattachment.py` (generated)
- Create: `backend/apps/mailbox/tests/test_attachments.py`

**Interfaces:**
- Produces: `MessageAttachment(message: FK Message|None related_name="attachments", filename: str, content_type: str, size: int, storage_key: str, omitted: bool, created_at)`.

- [ ] **Step 1: Write the failing test**

Create `backend/apps/mailbox/tests/test_attachments.py`:

```python
import pytest

from apps.mailbox.models import Conversation, Message, MessageAttachment

pytestmark = pytest.mark.django_db(transaction=True)


def test_attachment_links_to_message(tenant_ctx):
    conv = Conversation.objects.create(counterparty_email="p@x.com")
    msg = Message.objects.create(
        conversation=conv, direction="outbound",
        from_email="c@x.com", to_email="p@x.com", text="hi",
    )
    att = MessageAttachment.objects.create(
        message=msg, filename="a.png", content_type="image/png",
        size=123, storage_key="tenants/t/mailbox/x/a.png",
    )
    assert list(msg.attachments.all()) == [att]
    assert att.omitted is False


def test_attachment_allows_null_message(tenant_ctx):
    att = MessageAttachment.objects.create(
        filename="b.pdf", content_type="application/pdf", size=1, storage_key="k",
    )
    assert att.message is None
```

- [ ] **Step 2: Run to verify it fails**

Run: `docker compose exec django pytest apps/mailbox/tests/test_attachments.py -v`
Expected: FAIL — `ImportError: cannot import name 'MessageAttachment'`

- [ ] **Step 3: Add the model**

Append to `backend/apps/mailbox/models.py`:

```python
class MessageAttachment(models.Model):
    # message stays NULL between composer upload and send; the send links it.
    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="attachments",
    )
    filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size = models.BigIntegerField(default=0)
    storage_key = models.CharField(max_length=500, blank=True, default="")
    omitted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "mailbox"
        ordering = ["id"]

    def __str__(self) -> str:
        return f"MessageAttachment<{self.id}:{self.filename}>"
```

- [ ] **Step 4: Generate + apply migration**

Run: `docker compose exec django python manage.py makemigrations mailbox`
Expected: creates `0004_messageattachment.py`
Run: `docker compose exec django python manage.py migrate_schemas --tenant`
Expected: applies cleanly.

- [ ] **Step 5: Run tests, verify pass**

Run: `docker compose exec django pytest apps/mailbox/tests/test_attachments.py -v`
Expected: 2 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/apps/mailbox/models.py backend/apps/mailbox/migrations/0004_messageattachment.py backend/apps/mailbox/tests/test_attachments.py
git commit -m "feat(mailbox): MessageAttachment model"
```

---

### Task 2: Attachment validation/storage helpers + upload endpoint

**Files:**
- Create: `backend/apps/mailbox/attachments.py`
- Modify: `backend/apps/mailbox/views.py` (add `upload_attachment`)
- Modify: `backend/apps/mailbox/serializers.py` (add `MessageAttachmentSerializer`)
- Modify: `backend/apps/mailbox/urls.py`
- Test: `backend/apps/mailbox/tests/test_attachments.py` (extend)

**Interfaces:**
- Consumes: `MessageAttachment` (Task 1), `apps.core.storage.get_s3_client/build_s3_path/generate_presigned_download_url`.
- Produces:
  - `attachments.validate_attachment(filename: str, content_type: str, size: int) -> str | None` (error message or None)
  - `attachments.store_attachment(content: bytes, filename: str, content_type: str) -> str` (returns storage_key)
  - `attachments.read_attachment(storage_key: str) -> bytes`
  - `attachments.MAX_FILE_BYTES`, `attachments.MAX_FILES_PER_MESSAGE`
  - `POST /api/v1/mailbox/attachments/` (multipart field `file`) → 201 `{id, filename, content_type, size, omitted, download_url}` | 400 `{detail}`
  - `MessageAttachmentSerializer` (fields: id, filename, content_type, size, omitted, download_url)

- [ ] **Step 1: Write failing tests**

Append to `test_attachments.py`:

```python
from unittest.mock import patch

from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.mailbox.attachments import validate_attachment

HOST = "shared-test.localhost"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="coach@x.com", name="Coach", password="x",  # noqa: S106
        role="owner", is_staff=True,
    )


@pytest.fixture()
def client(coach):
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=coach)
    return c


def test_validate_attachment_rules():
    assert validate_attachment("a.png", "image/png", 1000) is None
    assert validate_attachment("a.pdf", "application/pdf", 1000) is None
    assert validate_attachment("a.exe", "application/x-msdownload", 10) is not None
    assert validate_attachment("a.png", "image/png", 11 * 1024 * 1024) is not None


def test_upload_attachment_endpoint(client, tenant_ctx):
    from django.core.files.uploadedfile import SimpleUploadedFile

    f = SimpleUploadedFile("pic.png", b"\x89PNG fake", content_type="image/png")
    with patch("apps.mailbox.attachments.store_attachment", return_value="k/pic.png") as store, \
         patch("apps.mailbox.serializers.generate_presigned_download_url", return_value="https://s3/x"):
        resp = client.post("/api/v1/mailbox/attachments/", {"file": f}, format="multipart")
    assert resp.status_code == 201, resp.content
    body = resp.json()
    assert body["filename"] == "pic.png"
    assert body["download_url"] == "https://s3/x"
    store.assert_called_once()


def test_upload_attachment_rejects_bad_type(client, tenant_ctx):
    from django.core.files.uploadedfile import SimpleUploadedFile

    f = SimpleUploadedFile("run.exe", b"MZ", content_type="application/x-msdownload")
    resp = client.post("/api/v1/mailbox/attachments/", {"file": f}, format="multipart")
    assert resp.status_code == 400
```

- [ ] **Step 2: Run to verify failure**

Run: `docker compose exec django pytest apps/mailbox/tests/test_attachments.py -v`
Expected: new tests FAIL (`ModuleNotFoundError: apps.mailbox.attachments`)

- [ ] **Step 3: Implement**

Create `backend/apps/mailbox/attachments.py`:

```python
import uuid

from django.conf import settings

from apps.core.storage import build_s3_path, get_s3_client

MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_FILES_PER_MESSAGE = 4

_ALLOWED_PREFIXES = ("image/", "video/", "audio/")
_ALLOWED_EXACT = {
    "application/pdf",
    "application/zip",
    "text/plain",
    "text/csv",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


def validate_attachment(filename: str, content_type: str, size: int) -> str | None:
    if not filename:
        return "Missing file name."
    if size > MAX_FILE_BYTES:
        return "File is larger than 10 MB."
    ct = (content_type or "").lower()
    if ct in _ALLOWED_EXACT or ct.startswith(_ALLOWED_PREFIXES):
        return None
    return "This file type isn't allowed."


def store_attachment(content: bytes, filename: str, content_type: str) -> str:
    key = build_s3_path("mailbox", uuid.uuid4().hex, filename)
    get_s3_client().put_object(
        Bucket=settings.AWS_BUCKET_NAME,
        Key=key,
        Body=content,
        ContentType=content_type or "application/octet-stream",
    )
    return key


def read_attachment(storage_key: str) -> bytes:
    obj = get_s3_client().get_object(Bucket=settings.AWS_BUCKET_NAME, Key=storage_key)
    return obj["Body"].read()
```

Add to `backend/apps/mailbox/serializers.py` (import at top: `from apps.core.storage import generate_presigned_download_url`; import `MessageAttachment` from `.models`):

```python
class MessageAttachmentSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = MessageAttachment
        fields = ["id", "filename", "content_type", "size", "omitted", "download_url"]

    def get_download_url(self, obj) -> str:
        if obj.omitted or not obj.storage_key:
            return ""
        return generate_presigned_download_url(obj.storage_key)
```

Add to `backend/apps/mailbox/views.py` (imports: `from rest_framework.parsers import MultiPartParser`, `from rest_framework.decorators import parser_classes`, `from . import attachments as attachments_mod`, `MessageAttachment` in the models import, `MessageAttachmentSerializer` in the serializers import):

```python
@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
@parser_classes([MultiPartParser])
def upload_attachment(request):
    f = request.FILES.get("file")
    if f is None:
        return Response({"detail": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)
    err = attachments_mod.validate_attachment(f.name, f.content_type or "", f.size)
    if err:
        return Response({"detail": err}, status=status.HTTP_400_BAD_REQUEST)
    key = attachments_mod.store_attachment(f.read(), f.name, f.content_type or "")
    att = MessageAttachment.objects.create(
        filename=f.name, content_type=f.content_type or "", size=f.size, storage_key=key
    )
    return Response(MessageAttachmentSerializer(att).data, status=status.HTTP_201_CREATED)
```

Add route in `backend/apps/mailbox/urls.py`:

```python
    path("attachments/", views.upload_attachment, name="mailbox-attachment-upload"),
```

- [ ] **Step 4: Run tests, verify pass**

Run: `docker compose exec django pytest apps/mailbox/tests/test_attachments.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/mailbox/attachments.py backend/apps/mailbox/views.py backend/apps/mailbox/serializers.py backend/apps/mailbox/urls.py backend/apps/mailbox/tests/test_attachments.py
git commit -m "feat(mailbox): attachment upload endpoint + storage helpers"
```

---

### Task 3: Outbound HTML + attachments (compose/reply → Resend)

**Files:**
- Modify: `backend/apps/mailbox/serializers.py` (ComposeSerializer/ReplySerializer)
- Modify: `backend/apps/mailbox/views.py` (compose/reply pass-through)
- Modify: `backend/apps/mailbox/services.py` (`send_message`)
- Modify: `backend/apps/core/email.py` (`send_email` attachments param)
- Test: `backend/apps/mailbox/tests/test_attachments.py` (extend) + existing `test_services.py` stays green

**Interfaces:**
- Consumes: `attachments.read_attachment`, `MessageAttachment`, `sanitize_rich_text` (from `apps.tenant_config.defaults`).
- Produces:
  - `ComposeSerializer` fields: `to, subject, text, html (optional str), attachment_ids (optional list[int])`
  - `ReplySerializer` fields: `text, html (optional), attachment_ids (optional)`
  - `services.send_message(*, conversation, text, html="", subject="", attachment_ids=None) -> Message` — raises `ValueError` on unknown/already-used attachment ids or count > `MAX_FILES_PER_MESSAGE`.
  - `send_email(..., attachments: list[dict] | None = None)` where each dict is `{"filename": str, "content": str}` (base64) appended to the Resend payload.

- [ ] **Step 1: Write failing tests**

Append to `test_attachments.py`:

```python
import base64

from apps.mailbox import services
from apps.mailbox.models import Conversation, MessageAttachment


def test_send_message_sanitizes_html_and_links_attachments(tenant_ctx, settings):
    settings.EMAIL_SINK_ENABLED = True
    conv = Conversation.objects.create(counterparty_email="p@x.com", subject="Hi")
    att = MessageAttachment.objects.create(
        filename="a.txt", content_type="text/plain", size=2, storage_key="k/a.txt"
    )
    with patch("apps.mailbox.services.read_attachment", return_value=b"hi"):
        msg = services.send_message(
            conversation=conv,
            text="hello",
            html='<p onclick="x()">hello <script>bad()</script><strong>world</strong></p>',
            attachment_ids=[att.id],
        )
    att.refresh_from_db()
    assert att.message_id == msg.id
    assert "<script>" not in msg.html
    assert "onclick" not in msg.html
    assert "<strong>world</strong>" in msg.html


def test_send_message_rejects_unknown_attachment(tenant_ctx, settings):
    settings.EMAIL_SINK_ENABLED = True
    conv = Conversation.objects.create(counterparty_email="p@x.com")
    with pytest.raises(ValueError):
        services.send_message(conversation=conv, text="x", attachment_ids=[999])


def test_compose_api_accepts_html_and_attachments(client, tenant_ctx, settings):
    settings.EMAIL_SINK_ENABLED = True
    att = MessageAttachment.objects.create(
        filename="a.txt", content_type="text/plain", size=2, storage_key="k"
    )
    with patch("apps.mailbox.services.read_attachment", return_value=b"hi"):
        resp = client.post(
            "/api/v1/mailbox/compose/",
            {"to": "s@x.com", "subject": "Yo", "text": "hi",
             "html": "<p><em>hi</em></p>", "attachment_ids": [att.id]},
            format="json",
        )
    assert resp.status_code == 201, resp.content
```

- [ ] **Step 2: Run to verify failure**

Run: `docker compose exec django pytest apps/mailbox/tests/test_attachments.py -v`
Expected: new tests FAIL (`send_message() got an unexpected keyword argument 'attachment_ids'`)

- [ ] **Step 3: Implement**

`backend/apps/mailbox/serializers.py` — replace Compose/Reply serializers:

```python
class ComposeSerializer(serializers.Serializer):
    to = serializers.EmailField()
    subject = serializers.CharField(max_length=255, allow_blank=True, default="")
    text = serializers.CharField()
    html = serializers.CharField(required=False, allow_blank=True, default="")
    attachment_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list
    )


class ReplySerializer(serializers.Serializer):
    text = serializers.CharField()
    html = serializers.CharField(required=False, allow_blank=True, default="")
    attachment_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list
    )
```

`backend/apps/mailbox/views.py` — in `compose` change the send call:

```python
    msg = services.send_message(
        conversation=conv,
        text=data["text"],
        html=data.get("html", ""),
        subject=data["subject"],
        attachment_ids=data.get("attachment_ids") or [],
    )
```

In `reply` (wrap `ValueError` from bad attachment ids as 400 in both views):

```python
    data = serializer.validated_data
    try:
        msg = services.send_message(
            conversation=conv,
            text=data["text"],
            html=data.get("html", ""),
            attachment_ids=data.get("attachment_ids") or [],
        )
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
```

(Apply the same try/except around the `compose` send call.)

`backend/apps/mailbox/services.py` — new imports and `send_message` update:

```python
import base64

from apps.tenant_config.defaults import sanitize_rich_text

from .attachments import MAX_FILES_PER_MESSAGE, read_attachment
from .models import Conversation, Message, MessageAttachment
```

Inside `send_message`, change the signature and body:

```python
def send_message(
    *, conversation: Conversation, text: str, html: str = "", subject: str = "",
    attachment_ids: list[int] | None = None,
) -> Message:
```

After computing headers/subject, replace the `body_html` + `send_email` block:

```python
    subject = subject or conversation.subject or "(no subject)"
    clean_html = sanitize_rich_text(html) if html else ""
    body_html = clean_html or f"<p>{escape(text)}</p>"

    ids = list(attachment_ids or [])
    if len(ids) > MAX_FILES_PER_MESSAGE:
        raise ValueError(f"At most {MAX_FILES_PER_MESSAGE} attachments per message.")
    atts = list(MessageAttachment.objects.filter(id__in=ids, message__isnull=True))
    if len(atts) != len(ids):
        raise ValueError("Unknown or already-sent attachment.")
    resend_attachments = [
        {"filename": a.filename, "content": base64.b64encode(read_attachment(a.storage_key)).decode()}
        for a in atts
    ]

    ok = send_email(
        conversation.counterparty_email,
        subject,
        body_html,
        from_email=from_email,
        headers=headers,
        attachments=resend_attachments or None,
    )
    if not ok:
        raise RuntimeError("mailbox send failed")
```

After `msg = Message.objects.create(... html=body_html ...)` add:

```python
    if atts:
        MessageAttachment.objects.filter(id__in=[a.id for a in atts]).update(message=msg)
```

`backend/apps/core/email.py` — extend `send_email` signature and payload:

```python
def send_email(
    to: str,
    subject: str,
    html: str,
    from_name: str = "",
    headers: dict | None = None,
    from_email: str = "",
    attachments: list[dict] | None = None,
) -> bool:
```

In the sink branch, before `return True`:

```python
        if attachments:
            logger.info("[email-sink] %d attachment(s) omitted from sink", len(attachments))
```

After the `headers` payload block:

```python
    if attachments:
        payload["attachments"] = attachments
```

- [ ] **Step 4: Run mailbox suite, verify pass**

Run: `docker compose exec django pytest apps/mailbox -v`
Expected: all PASS (including pre-existing 38+).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/mailbox backend/apps/core/email.py
git commit -m "feat(mailbox): rich-html + attachments on compose/reply via Resend"
```

---

### Task 4: List/detail serialization — snippet preview + attachments

**Files:**
- Modify: `backend/apps/mailbox/serializers.py`
- Modify: `backend/apps/mailbox/views.py` (list prefetch)
- Test: `backend/apps/mailbox/tests/test_attachments.py` (extend)

**Interfaces:**
- Produces:
  - `ConversationSerializer` extra fields: `last_message_preview: str` (≤120 chars), `last_message_has_attachments: bool`
  - `MessageSerializer` extra field: `attachments: MessageAttachmentSerializer[]`

- [ ] **Step 1: Write failing tests**

Append to `test_attachments.py`:

```python
def test_list_includes_preview_and_attachment_flag(client, tenant_ctx):
    conv = Conversation.objects.create(counterparty_email="p@x.com", subject="Hi")
    msg = Message.objects.create(
        conversation=conv, direction="inbound",
        from_email="p@x.com", to_email="c@x.com",
        text="first line of the body\nsecond line",
    )
    MessageAttachment.objects.create(
        message=msg, filename="a.png", content_type="image/png", size=1, storage_key="k"
    )
    resp = client.get("/api/v1/mailbox/conversations/")
    row = resp.json()[0]
    assert row["last_message_preview"].startswith("first line")
    assert row["last_message_has_attachments"] is True


def test_thread_messages_include_attachments(client, tenant_ctx):
    conv = Conversation.objects.create(counterparty_email="p@x.com")
    msg = Message.objects.create(
        conversation=conv, direction="inbound",
        from_email="p@x.com", to_email="c@x.com", text="hi",
    )
    MessageAttachment.objects.create(
        message=msg, filename="a.pdf", content_type="application/pdf",
        size=9, storage_key="k/a.pdf",
    )
    with patch("apps.mailbox.serializers.generate_presigned_download_url", return_value="https://s3/a"):
        resp = client.get(f"/api/v1/mailbox/conversations/{conv.id}/")
    atts = resp.json()["messages"][0]["attachments"]
    assert atts[0]["filename"] == "a.pdf"
    assert atts[0]["download_url"] == "https://s3/a"
```

- [ ] **Step 2: Run to verify failure**

Run: `docker compose exec django pytest apps/mailbox/tests/test_attachments.py -v`
Expected: KeyError / missing fields FAIL.

- [ ] **Step 3: Implement**

`backend/apps/mailbox/serializers.py` — extend `ConversationSerializer`:

```python
from django.utils.html import strip_tags


class ConversationSerializer(serializers.ModelSerializer):
    last_message_preview = serializers.SerializerMethodField()
    last_message_has_attachments = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id",
            "subject",
            "counterparty_email",
            "counterparty_name",
            "student",
            "last_message_at",
            "unread_count",
            "is_archived",
            "is_spam",
            "last_message_preview",
            "last_message_has_attachments",
        ]

    def _last_message(self, obj):
        # messages ordering is ["created_at"]; use the prefetched cache when present.
        msgs = list(obj.messages.all())
        return msgs[-1] if msgs else None

    def get_last_message_preview(self, obj) -> str:
        m = self._last_message(obj)
        if not m:
            return ""
        raw = m.text or strip_tags(m.html)
        return " ".join(raw.split())[:120]

    def get_last_message_has_attachments(self, obj) -> bool:
        m = self._last_message(obj)
        return bool(m and len(m.attachments.all()) > 0)
```

`MessageSerializer` — add nested attachments:

```python
class MessageSerializer(serializers.ModelSerializer):
    html = serializers.SerializerMethodField()
    attachments = MessageAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Message
        fields = [
            "id",
            "direction",
            "from_email",
            "to_email",
            "text",
            "html",
            "is_read",
            "created_at",
            "attachments",
        ]
```

(Keep `get_html` unchanged. `MessageAttachmentSerializer` must be defined above `MessageSerializer` in the file.)

`backend/apps/mailbox/views.py` — avoid N+1 in the list:

```python
def conversation_list(request):
    qs = Conversation.objects.prefetch_related("messages__attachments")
    return Response(ConversationSerializer(qs, many=True).data)
```

- [ ] **Step 4: Run suite, verify pass**

Run: `docker compose exec django pytest apps/mailbox -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/mailbox/serializers.py backend/apps/mailbox/views.py backend/apps/mailbox/tests/test_attachments.py
git commit -m "feat(mailbox): list snippet preview + message attachments serialization"
```

---

### Task 5: Inbound webhook attachments + upload-size setting

**Files:**
- Modify: `backend/apps/mailbox/inbound.py`
- Modify: `backend/apps/mailbox/views.py` (`inbound`)
- Modify: `backend/config/settings/base.py`
- Test: `backend/apps/mailbox/tests/test_attachments.py` (extend)

**Interfaces:**
- Consumes: `attachments.store_attachment`, `attachments.validate_attachment`.
- Produces: `receive_inbound(..., attachments: list[dict] | None = None)` — each dict `{filename, content_type, size, content_b64?, omitted?}`; stores valid files, records invalid/oversized/failed ones with `omitted=True`.

- [ ] **Step 1: Write failing tests**

Append to `test_attachments.py`:

```python
from apps.mailbox.inbound import receive_inbound


def test_receive_inbound_stores_attachments(tenant_ctx):
    payload_atts = [
        {"filename": "a.png", "content_type": "image/png", "size": 4,
         "content_b64": base64.b64encode(b"data").decode()},
        {"filename": "huge.mov", "content_type": "video/quicktime",
         "size": 99 * 1024 * 1024, "omitted": True},
    ]
    with patch("apps.mailbox.inbound.store_attachment", return_value="k/a.png"):
        msg = receive_inbound(
            from_email="s@x.com", to_email="info@c.com", subject="Hi",
            text="hello", attachments=payload_atts,
        )
    atts = list(msg.attachments.order_by("id"))
    assert len(atts) == 2
    assert atts[0].storage_key == "k/a.png" and atts[0].omitted is False
    assert atts[1].omitted is True and atts[1].storage_key == ""


def test_receive_inbound_storage_failure_becomes_omitted(tenant_ctx):
    payload_atts = [{"filename": "a.png", "content_type": "image/png", "size": 4,
                     "content_b64": base64.b64encode(b"data").decode()}]
    with patch("apps.mailbox.inbound.store_attachment", side_effect=RuntimeError("s3 down")):
        msg = receive_inbound(
            from_email="s2@x.com", to_email="info@c.com", subject="Hi",
            text="hello", attachments=payload_atts,
        )
    att = msg.attachments.get()
    assert att.omitted is True
```

- [ ] **Step 2: Run to verify failure**

Run: `docker compose exec django pytest apps/mailbox/tests/test_attachments.py -v`
Expected: FAIL (`unexpected keyword argument 'attachments'`).

- [ ] **Step 3: Implement**

`backend/apps/mailbox/inbound.py` — imports + signature + storage:

```python
import base64
import logging

from .attachments import store_attachment, validate_attachment
from .models import Conversation, Message, MessageAttachment

logger = logging.getLogger(__name__)
```

Signature gains `attachments: list[dict] | None = None`. After the `Message.objects.create(...)` inside the `transaction.atomic()` block succeeds (keep attachment writes INSIDE the atomic block, after the unread-count update):

```python
            for att in attachments or []:
                filename = (att.get("filename") or "attachment")[:255]
                content_type = (att.get("content_type") or "")[:100]
                size = int(att.get("size") or 0)
                content_b64 = att.get("content_b64") or ""
                omitted = bool(att.get("omitted"))
                storage_key = ""
                if not omitted and content_b64 and validate_attachment(filename, content_type, size) is None:
                    try:
                        storage_key = store_attachment(
                            base64.b64decode(content_b64), filename, content_type
                        )
                    except Exception:
                        logger.exception("mailbox inbound attachment store failed: %s", filename)
                        omitted = True
                else:
                    omitted = True
                MessageAttachment.objects.create(
                    message=msg,
                    filename=filename,
                    content_type=content_type,
                    size=size,
                    storage_key=storage_key,
                    omitted=omitted,
                )
```

`backend/apps/mailbox/views.py` — in `inbound`, pass the field:

```python
        receive_inbound(
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
```

`backend/config/settings/base.py` — add near the other upload/AWS settings:

```python
# Inbound mailbox webhook carries base64 attachments (≤ ~25 MB email + overhead).
DATA_UPLOAD_MAX_MEMORY_SIZE = 30 * 1024 * 1024
```

- [ ] **Step 4: Run suite, verify pass**

Run: `docker compose exec django pytest apps/mailbox -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/mailbox/inbound.py backend/apps/mailbox/views.py backend/config/settings/base.py backend/apps/mailbox/tests/test_attachments.py
git commit -m "feat(mailbox): inbound webhook attachment storage"
```

---

### Task 6: Cloudflare worker — attachments in webhook payload

**Files:**
- Modify: `infra/cloudflare/mailbox-worker/src/index.js`

**Interfaces:**
- Produces: webhook JSON gains `attachments: [{filename, content_type, size, content_b64?, omitted?}]` matching Task 5's consumer. Per-file cap 10 MB, running total cap 20 MB.

- [ ] **Step 1: Implement**

In `src/index.js`, add above `export default`:

```javascript
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

function toBase64(u8) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    s += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(s);
}

function packAttachments(parsedAttachments) {
  const out = [];
  let total = 0;
  for (const a of parsedAttachments || []) {
    const content = a.content instanceof ArrayBuffer ? new Uint8Array(a.content) : null;
    const size = content ? content.length : 0;
    const base = {
      filename: a.filename || "attachment",
      content_type: a.mimeType || "",
      size,
    };
    if (!content || size > MAX_FILE_BYTES || total + size > MAX_TOTAL_BYTES) {
      out.push({ ...base, omitted: true });
      continue;
    }
    total += size;
    out.push({ ...base, content_b64: toBase64(content) });
  }
  return out;
}
```

And add to the payload object:

```javascript
      attachments: packAttachments(parsed.attachments),
```

- [ ] **Step 2: Sanity-check locally**

Run: `cd infra/cloudflare/mailbox-worker && node --input-type=module -e "
globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
const src = await import('./src/index.js');
console.log('worker module loads OK');
"`
Expected: `worker module loads OK`

- [ ] **Step 3: Commit** (deploy happens in Task 12)

```bash
git add infra/cloudflare/mailbox-worker/src/index.js
git commit -m "feat(mailbox-worker): forward parsed attachments to webhook"
```

---

### Task 7: Frontend foundation — deps, typography, API layer

**Files:**
- Modify: `frontend-customer/package.json` (via npm install)
- Modify: `frontend-customer/tailwind.config.ts`
- Modify: `frontend-customer/src/lib/api-client.ts`
- Modify: `frontend-customer/src/lib/mailbox.ts`

**Interfaces:**
- Produces (consumed by Tasks 8–11):
  - `clientFetch` sends `FormData` bodies without forcing JSON content-type.
  - `mailbox.ts`: `MessageAttachment {id, filename, content_type, size, omitted, download_url}`; `MailboxMessage.attachments: MessageAttachment[]`; `ConversationListItem.last_message_preview: string` + `last_message_has_attachments: boolean`; `compose(body: {to, subject, text, html?, attachment_ids?})`; `reply(id, body: {text, html?, attachment_ids?})`; `uploadAttachment(file: File): Promise<MessageAttachment>`.
  - Tailwind `prose` classes actually styled (`@tailwindcss/typography`).

- [ ] **Step 1: Install deps**

Run in `frontend-customer/`:

```bash
npm install @tiptap/react@^2 @tiptap/starter-kit@^2 @tiptap/extension-underline@^2 @tiptap/extension-link@^2 @tiptap/extension-placeholder@^2
npm install -D @tailwindcss/typography
```

Expected: package.json updated, install clean.

- [ ] **Step 2: Register typography plugin**

In `frontend-customer/tailwind.config.ts`, add to the `plugins` array:

```ts
    require("@tailwindcss/typography"),
```

- [ ] **Step 3: FormData-aware clientFetch**

In `src/lib/api-client.ts`, replace the fetch headers block:

```ts
export async function clientFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const isFormData = options?.body instanceof FormData
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...options?.headers,
    },
    credentials: 'same-origin',
  })
```

- [ ] **Step 4: Extend mailbox.ts**

Apply to `src/lib/mailbox.ts`:

```ts
export interface MessageAttachment {
  id: number;
  filename: string;
  content_type: string;
  size: number;
  omitted: boolean;
  download_url: string;
}
```

Add to `ConversationListItem`: `last_message_preview: string; last_message_has_attachments: boolean;`
Add to `MailboxMessage`: `attachments: MessageAttachment[];`
Replace `compose`/`reply` and add `uploadAttachment`:

```ts
export interface OutgoingMessage {
  text: string;
  html?: string;
  attachment_ids?: number[];
}

export function compose(body: OutgoingMessage & { to: string; subject: string }) {
  return clientFetch<{ conversation_id: number; message_id: number }>(`${BASE}/compose/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function reply(id: number, body: OutgoingMessage) {
  return clientFetch<{ message_id: number }>(`${BASE}/conversations/${id}/reply/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function uploadAttachment(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  return clientFetch<MessageAttachment>(`${BASE}/attachments/`, {
    method: "POST",
    body: fd,
  });
}
```

- [ ] **Step 5: Typecheck + commit**

Run: `cd frontend-customer && npx tsc --noEmit`
Expected: only errors in `inbox-client.tsx` about the changed `reply(...)` call signature — fix the existing call inline (`reply(thread.id, { text: replyText.trim() })`) so typecheck is clean.

```bash
make format
git add frontend-customer
git commit -m "feat(inbox): frontend foundation — tiptap deps, typography, attachment api"
```

---

### Task 8: `MessageEditor` component (TipTap + toolbar + attachments strip)

**Files:**
- Create: `frontend-customer/src/components/admin/mailbox/message-editor.tsx`

**Interfaces:**
- Consumes: `uploadAttachment`, `MessageAttachment` (Task 7).
- Produces:

```ts
export interface OutgoingDraft { text: string; html: string; attachmentIds: number[] }
interface MessageEditorProps {
  placeholder?: string;
  autoFocus?: boolean;
  sending: boolean;
  onSend: (draft: OutgoingDraft) => void;   // parent clears via editorRef
  compact?: boolean;                         // reply mode = shorter min-height
}
export interface MessageEditorHandle { clear: () => void; isEmpty: () => boolean }
```

(Exposed via `forwardRef`.)

- [ ] **Step 1: Implement the component**

Create `message-editor.tsx`:

```tsx
"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Paperclip,
  Quote,
  Send,
  Underline as UnderlineIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { uploadAttachment } from "@/lib/mailbox";
import type { MessageAttachment } from "@/lib/mailbox";

export interface OutgoingDraft {
  text: string;
  html: string;
  attachmentIds: number[];
}

export interface MessageEditorHandle {
  clear: () => void;
  isEmpty: () => boolean;
}

interface MessageEditorProps {
  placeholder?: string;
  autoFocus?: boolean;
  sending: boolean;
  onSend: (draft: OutgoingDraft) => void;
  compact?: boolean;
}

const MAX_FILES = 4;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ToolbarButton({
  active,
  disabled,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded-md p-1.5 transition-colors ${
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      } disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function setLink(editor: Editor) {
  const prev = editor.getAttributes("link").href as string | undefined;
  const url = window.prompt("Link URL", prev || "https://");
  if (url === null) return;
  if (url === "") {
    editor.chain().focus().unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
}

const MessageEditor = forwardRef<MessageEditorHandle, MessageEditorProps>(
  function MessageEditor(
    { placeholder = "Write your message…", autoFocus, sending, onSend, compact },
    ref,
  ) {
    const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const editor = useEditor({
      extensions: [
        StarterKit.configure({ heading: false, codeBlock: false, horizontalRule: false }),
        Underline,
        Link.configure({ openOnClick: false, autolink: true }),
        Placeholder.configure({ placeholder }),
      ],
      autofocus: autoFocus ? "end" : false,
      editorProps: {
        attributes: {
          class: `prose prose-sm dark:prose-invert max-w-none focus:outline-none px-3 py-2 ${
            compact ? "min-h-[72px]" : "min-h-[140px]"
          }`,
        },
      },
      immediatelyRender: false,
    });

    useImperativeHandle(ref, () => ({
      clear: () => {
        editor?.commands.clearContent(true);
        setAttachments([]);
      },
      isEmpty: () => !editor || (editor.getText().trim() === "" && attachments.length === 0),
    }));

    const pickFiles = async (files: FileList | null) => {
      if (!files) return;
      for (const file of Array.from(files)) {
        if (attachments.length >= MAX_FILES) {
          toast.error(`At most ${MAX_FILES} attachments per message.`);
          break;
        }
        if (file.size > MAX_FILE_BYTES) {
          toast.error(`${file.name} is larger than 10 MB.`);
          continue;
        }
        setUploading(true);
        try {
          const att = await uploadAttachment(file);
          setAttachments((prev) => [...prev, att]);
        } catch {
          toast.error(`Could not upload ${file.name}.`);
        } finally {
          setUploading(false);
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const send = () => {
      if (!editor) return;
      const text = editor.getText().trim();
      if (!text && attachments.length === 0) return;
      onSend({
        text: text || "(attachment)",
        html: editor.getHTML(),
        attachmentIds: attachments.map((a) => a.id),
      });
    };

    if (!editor) return null;

    return (
      <div className="rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring">
        {/* Toolbar */}
        <div className="flex items-center gap-0.5 border-b px-2 py-1">
          <ToolbarButton label="Bold" active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Italic" active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Underline" active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <UnderlineIcon className="h-4 w-4" />
          </ToolbarButton>
          <div className="mx-1 h-4 w-px bg-border" />
          <ToolbarButton label="Bullet list" active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Numbered list" active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Quote" active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <Quote className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Link" active={editor.isActive("link")}
            onClick={() => setLink(editor)}>
            <Link2 className="h-4 w-4" />
          </ToolbarButton>
          <div className="mx-1 h-4 w-px bg-border" />
          <ToolbarButton label="Attach files" disabled={uploading || attachments.length >= MAX_FILES}
            onClick={() => fileInputRef.current?.click()}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </ToolbarButton>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => pickFiles(e.target.files)}
          />
        </div>

        {/* Editable area — Ctrl/Cmd+Enter sends */}
        <div
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              send();
            }
          }}
        >
          <EditorContent editor={editor} />
        </div>

        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t px-3 py-2">
            {attachments.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-xs"
              >
                <Paperclip className="h-3 w-3 text-muted-foreground" />
                <span className="max-w-[160px] truncate">{a.filename}</span>
                <span className="text-muted-foreground">{humanSize(a.size)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${a.filename}`}
                  onClick={() =>
                    setAttachments((prev) => prev.filter((x) => x.id !== a.id))
                  }
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Send row */}
        <div className="flex items-center justify-end gap-2 border-t px-3 py-2">
          <span className="mr-auto text-[11px] text-muted-foreground">
            Ctrl+Enter to send
          </span>
          <Button size="sm" loading={sending} disabled={uploading} onClick={send}>
            <Send className="h-4 w-4" />
            Send
          </Button>
        </div>
      </div>
    );
  },
);

export default MessageEditor;
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend-customer && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
make format
git add frontend-customer/src/components/admin/mailbox/message-editor.tsx
git commit -m "feat(inbox): shared TipTap message editor with attachments"
```

---

### Task 9: Attachment display + conversation list + folder rail

**Files:**
- Create: `frontend-customer/src/components/admin/mailbox/attachment-list.tsx`
- Create: `frontend-customer/src/components/admin/mailbox/conversation-list.tsx`
- Create: `frontend-customer/src/components/admin/mailbox/folder-rail.tsx`

**Interfaces:**
- Consumes: `ConversationListItem`, `MessageAttachment` types (Task 7).
- Produces:

```ts
// attachment-list.tsx
export default function AttachmentList({ attachments }: { attachments: MessageAttachment[] })

// folder-rail.tsx
export type Folder = "inbox" | "archived" | "spam";
export default function FolderRail(props: {
  folder: Folder; onSelect: (f: Folder) => void; onCompose: () => void;
})

// conversation-list.tsx
export default function ConversationList(props: {
  items: ConversationListItem[];       // pre-filtered by folder + search
  folder: Folder;
  loading: boolean;
  onOpen: (id: number) => void;
  onArchive: (id: number, archived: boolean) => void;
  onSpam: (id: number, spam: boolean) => void;
  onDelete: (id: number) => void;
})
```

- [ ] **Step 1: `attachment-list.tsx`**

```tsx
"use client";

import { FileText, ImageOff, Paperclip } from "lucide-react";

import type { MessageAttachment } from "@/lib/mailbox";

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentList({ attachments }: { attachments: MessageAttachment[] }) {
  if (attachments.length === 0) return null;
  const images = attachments.filter((a) => !a.omitted && a.content_type.startsWith("image/"));
  const files = attachments.filter((a) => a.omitted || !a.content_type.startsWith("image/"));

  return (
    <div className="mt-2 space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((a) => (
            <a key={a.id} href={a.download_url} target="_blank" rel="noreferrer"
               className="block overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element -- presigned URL host varies */}
              <img src={a.download_url} alt={a.filename} className="h-28 w-auto object-cover" />
            </a>
          ))}
        </div>
      )}
      {files.map((a) =>
        a.omitted ? (
          <div key={a.id}
               className="inline-flex items-center gap-2 rounded-md border border-dashed px-2.5 py-1.5 text-xs text-muted-foreground">
            <ImageOff className="h-3.5 w-3.5" />
            <span className="max-w-[220px] truncate">{a.filename}</span>
            <span>— too large, ask the sender to share another way</span>
          </div>
        ) : (
          <a key={a.id} href={a.download_url} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs hover:bg-accent">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="max-w-[220px] truncate font-medium">{a.filename}</span>
            <span className="text-muted-foreground">{humanSize(a.size)}</span>
          </a>
        ),
      )}
    </div>
  );
}

export const AttachmentIndicator = Paperclip;
```

- [ ] **Step 2: `folder-rail.tsx`**

```tsx
"use client";

import { Archive, Flag, Inbox, PenSquare } from "lucide-react";

import { Button } from "@/components/ui/button";

export type Folder = "inbox" | "archived" | "spam";

const FOLDERS: { key: Folder; label: string; icon: typeof Inbox }[] = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "archived", label: "Archived", icon: Archive },
  { key: "spam", label: "Spam", icon: Flag },
];

export default function FolderRail({
  folder,
  onSelect,
  onCompose,
}: {
  folder: Folder;
  onSelect: (f: Folder) => void;
  onCompose: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-row gap-1 border-b px-2 py-2 md:w-44 md:flex-col md:border-b-0 md:border-r md:py-3">
      <Button size="sm" className="md:mb-2 md:w-full" onClick={onCompose}>
        <PenSquare className="h-4 w-4" />
        <span className="hidden sm:inline">Compose</span>
      </Button>
      {FOLDERS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors md:w-full ${
            folder === key
              ? "bg-accent font-medium text-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          }`}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: `conversation-list.tsx`**

```tsx
"use client";

import { Archive, ArchiveRestore, Flag, Inbox, Loader2, Paperclip, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import type { ConversationListItem } from "@/lib/mailbox";

import type { Folder } from "./folder-rail";

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function QuickAction({
  label,
  onClick,
  destructive,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={`rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent ${
        destructive ? "hover:text-destructive" : "hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export default function ConversationList({
  items,
  folder,
  loading,
  onOpen,
  onArchive,
  onSpam,
  onDelete,
}: {
  items: ConversationListItem[];
  folder: Folder;
  loading: boolean;
  onOpen: (id: number) => void;
  onArchive: (id: number, archived: boolean) => void;
  onSpam: (id: number, spam: boolean) => void;
  onDelete: (id: number) => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (items.length === 0) {
    return <EmptyState icon={Inbox} title="Nothing here." className="flex-1" />;
  }

  return (
    <ul className="flex-1 divide-y divide-border overflow-y-auto">
      {items.map((c) => {
        const unread = c.unread_count > 0;
        return (
          <li key={c.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onOpen(c.id)}
              onKeyDown={(e) => e.key === "Enter" && onOpen(c.id)}
              className="group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/40"
            >
              {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className={`truncate text-sm ${unread ? "font-semibold" : "font-medium"}`}>
                    {c.counterparty_name || c.counterparty_email}
                  </span>
                  <span className={`truncate text-sm ${unread ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                    {c.subject || "(no subject)"}
                  </span>
                  {c.last_message_has_attachments && (
                    <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">{c.last_message_preview}</p>
              </div>

              {/* date ↔ hover actions swap */}
              <span className="shrink-0 text-xs text-muted-foreground group-hover:hidden">
                {relativeTime(c.last_message_at)}
              </span>
              <div className="hidden shrink-0 items-center group-hover:flex">
                {folder === "inbox" ? (
                  <>
                    <QuickAction label="Archive" onClick={() => onArchive(c.id, true)}>
                      <Archive className="h-4 w-4" />
                    </QuickAction>
                    <QuickAction label="Mark as spam" onClick={() => onSpam(c.id, true)}>
                      <Flag className="h-4 w-4" />
                    </QuickAction>
                  </>
                ) : (
                  <QuickAction
                    label="Move to inbox"
                    onClick={() =>
                      folder === "archived" ? onArchive(c.id, false) : onSpam(c.id, false)
                    }
                  >
                    <ArchiveRestore className="h-4 w-4" />
                  </QuickAction>
                )}
                <QuickAction label="Delete" destructive onClick={() => onDelete(c.id)}>
                  <Trash2 className="h-4 w-4" />
                </QuickAction>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

Run: `cd frontend-customer && npx tsc --noEmit` — Expected: clean.

```bash
make format
git add frontend-customer/src/components/admin/mailbox
git commit -m "feat(inbox): folder rail, gmail-style conversation list, attachment display"
```

---

### Task 10: Thread view (email-style, collapsible messages)

**Files:**
- Create: `frontend-customer/src/components/admin/mailbox/thread-view.tsx`

**Interfaces:**
- Consumes: `ConversationDetail`, `MailboxMessage` (Task 7), `AttachmentList` (Task 9), `MessageEditor` + `OutgoingDraft` + `MessageEditorHandle` (Task 8), `Folder` (Task 9).
- Produces:

```ts
export default function ThreadView(props: {
  thread: ConversationDetail;
  folder: Folder;
  replySending: boolean;
  onBack: () => void;
  onReply: (draft: OutgoingDraft) => void;   // parent sends + refreshes thread
  onArchive: (archived: boolean) => void;
  onSpam: (spam: boolean) => void;
  onDelete: () => void;
  editorRef: React.Ref<MessageEditorHandle>;
})
```

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

import { Archive, ArchiveRestore, ArrowLeft, Flag, Trash2 } from "lucide-react";

import type { ConversationDetail, MailboxMessage } from "@/lib/mailbox";

import AttachmentList from "./attachment-list";
import type { Folder } from "./folder-rail";
import MessageEditor, {
  type MessageEditorHandle,
  type OutgoingDraft,
} from "./message-editor";

function HeaderAction({
  label,
  onClick,
  destructive,
  children,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent ${
        destructive ? "hover:text-destructive" : "hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function MessageCard({ msg, expandedDefault }: { msg: MailboxMessage; expandedDefault: boolean }) {
  const [expanded, setExpanded] = useState(expandedDefault);
  const sender = msg.direction === "outbound" ? "You" : msg.from_email;
  const when = new Date(msg.created_at).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  if (!expanded) {
    const snippet = (msg.text || "").replace(/\s+/g, " ").slice(0, 90);
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full rounded-lg border bg-muted/30 px-4 py-2 text-left transition-colors hover:bg-accent/40"
      >
        <div className="flex items-baseline gap-2 text-xs">
          <span className="font-medium text-foreground">{sender}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{snippet}</span>
          <span className="shrink-0 text-muted-foreground">{when}</span>
        </div>
      </button>
    );
  }

  return (
    <div className="rounded-lg border px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">
          {sender}
          {msg.direction === "inbound" && (
            <span className="ml-1 font-normal text-muted-foreground">&lt;{msg.from_email}&gt;</span>
          )}
        </span>
        <span className="text-muted-foreground">{when}</span>
      </div>
      {msg.html ? (
        /* Safe: backend sanitizes HTML server-side (nh3) before serving. */
        <div className="prose prose-sm max-w-none dark:prose-invert"
             dangerouslySetInnerHTML={{ __html: msg.html }} />
      ) : (
        <p className="whitespace-pre-wrap text-sm">{msg.text}</p>
      )}
      <AttachmentList attachments={msg.attachments} />
    </div>
  );
}

export default function ThreadView({
  thread,
  folder,
  replySending,
  onBack,
  onReply,
  onArchive,
  onSpam,
  onDelete,
  editorRef,
}: {
  thread: ConversationDetail;
  folder: Folder;
  replySending: boolean;
  onBack: () => void;
  onReply: (draft: OutgoingDraft) => void;
  onArchive: (archived: boolean) => void;
  onSpam: (spam: boolean) => void;
  onDelete: () => void;
  editorRef: React.Ref<MessageEditorHandle>;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.messages.length]);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <HeaderAction label="Back" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </HeaderAction>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{thread.subject || "(no subject)"}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {thread.counterparty_name
              ? `${thread.counterparty_name} · ${thread.counterparty_email}`
              : thread.counterparty_email}
          </p>
        </div>
        {folder === "inbox" ? (
          <>
            <HeaderAction label="Archive" onClick={() => onArchive(true)}>
              <Archive className="h-4 w-4" />
            </HeaderAction>
            <HeaderAction label="Mark as spam" onClick={() => onSpam(true)}>
              <Flag className="h-4 w-4" />
            </HeaderAction>
          </>
        ) : (
          <HeaderAction
            label="Move to inbox"
            onClick={() => (folder === "archived" ? onArchive(false) : onSpam(false))}
          >
            <ArchiveRestore className="h-4 w-4" />
          </HeaderAction>
        )}
        <HeaderAction label="Delete" destructive onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </HeaderAction>
      </div>

      {/* Messages — older collapsed, latest expanded */}
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {thread.messages.map((msg, i) => (
          <MessageCard key={msg.id} msg={msg} expandedDefault={i === thread.messages.length - 1} />
        ))}
        <div ref={endRef} />
      </div>

      {/* Reply */}
      <div className="border-t px-4 py-3">
        <MessageEditor
          ref={editorRef}
          compact
          placeholder="Write a reply…"
          sending={replySending}
          onSend={onReply}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd frontend-customer && npx tsc --noEmit` — Expected: clean.

```bash
make format
git add frontend-customer/src/components/admin/mailbox/thread-view.tsx
git commit -m "feat(inbox): email-style thread view with collapsible messages"
```

---

### Task 11: Compose card + orchestrator rewrite (`inbox-client.tsx`)

**Files:**
- Create: `frontend-customer/src/components/admin/mailbox/compose-card.tsx`
- Rewrite: `frontend-customer/src/components/admin/mailbox/inbox-client.tsx`

**Interfaces:**
- Consumes: everything produced by Tasks 7–10 plus existing `lib/mailbox.ts` calls and the existing send-only banner logic (preserved verbatim).
- Produces: `ComposeCard({ onClose, onSent }: { onClose: () => void; onSent: (conversationId: number) => void })` — floating bottom-right card.

- [ ] **Step 1: `compose-card.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";

import { X } from "lucide-react";
import { toast } from "sonner";

import { compose } from "@/lib/mailbox";

import MessageEditor, {
  type MessageEditorHandle,
  type OutgoingDraft,
} from "./message-editor";

export default function ComposeCard({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: (conversationId: number) => void;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [sending, setSending] = useState(false);
  const editorRef = useRef<MessageEditorHandle>(null);

  const send = async (draft: OutgoingDraft) => {
    if (!to.trim()) {
      toast.error("Add a recipient first.");
      return;
    }
    setSending(true);
    try {
      const res = await compose({
        to: to.trim(),
        subject: subject.trim(),
        text: draft.text,
        html: draft.html,
        attachment_ids: draft.attachmentIds,
      });
      toast.success("Message sent.");
      onSent(res.conversation_id);
    } catch {
      toast.error("Could not send the message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[120] flex w-[min(480px,calc(100vw-2rem))] flex-col rounded-xl border bg-background shadow-2xl">
      <div className="flex items-center justify-between rounded-t-xl bg-muted/60 px-4 py-2.5">
        <h2 className="text-sm font-semibold">New message</h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-2 px-4 pt-3">
        <input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="To"
          className="w-full border-b border-input bg-transparent px-1 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none"
        />
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="w-full border-b border-input bg-transparent px-1 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none"
        />
      </div>
      <div className="p-3">
        <MessageEditor ref={editorRef} autoFocus sending={sending} onSend={send} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `inbox-client.tsx`**

Replace the whole file. Keep: data loading, `selectConversation` mark-read refresh, the send-only banner block (copy it verbatim from the current file — the `settings && !canReceive && !bannerDismissed` JSX), and the delete-confirm dialog component. New structure:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";

import { Mail, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";
import {
  deleteConversation,
  getConversation,
  getSettings,
  listConversations,
  reply,
  updateConversation,
} from "@/lib/mailbox";
import type {
  ConversationDetail,
  ConversationListItem,
  MailboxSettings,
} from "@/lib/mailbox";

import ComposeCard from "./compose-card";
import ConversationList from "./conversation-list";
import FolderRail, { type Folder } from "./folder-rail";
import type { MessageEditorHandle, OutgoingDraft } from "./message-editor";
import ThreadView from "./thread-view";

// DeleteConfirmDialog: copy the existing component from the current file unchanged.

export default function InboxClient() {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [settings, setSettings] = useState<MailboxSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [folder, setFolder] = useState<Folder>("inbox");
  const [query, setQuery] = useState("");
  const [thread, setThread] = useState<ConversationDetail | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replySending, setReplySending] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const replyEditorRef = useRef<MessageEditorHandle>(null);

  const loadList = async () => {
    try {
      setConversations(await listConversations());
    } catch {
      toast.error("Could not load conversations.");
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([listConversations(), getSettings()])
      .then(([list, s]) => {
        setConversations(list);
        setSettings(s);
      })
      .catch(() => toast.error("Could not load inbox."))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const byFolder = conversations.filter((c) =>
      folder === "inbox" ? !c.is_archived && !c.is_spam
      : folder === "archived" ? c.is_archived
      : c.is_spam,
    );
    const q = query.trim().toLowerCase();
    if (!q) return byFolder;
    return byFolder.filter((c) =>
      [c.counterparty_name, c.counterparty_email, c.subject, c.last_message_preview]
        .join(" ").toLowerCase().includes(q),
    );
  }, [conversations, folder, query]);

  const openConversation = async (id: number) => {
    setThreadLoading(true);
    try {
      setThread(await getConversation(id));
      await loadList();
    } catch {
      toast.error("Could not load this conversation.");
    } finally {
      setThreadLoading(false);
    }
  };

  const sendReply = async (draft: OutgoingDraft) => {
    if (!thread) return;
    setReplySending(true);
    try {
      await reply(thread.id, {
        text: draft.text,
        html: draft.html,
        attachment_ids: draft.attachmentIds,
      });
      replyEditorRef.current?.clear();
      setThread(await getConversation(thread.id));
      toast.success("Reply sent.");
    } catch {
      toast.error("Could not send reply. Please try again.");
    } finally {
      setReplySending(false);
    }
  };

  const patchConversation = async (
    id: number,
    patch: { is_archived?: boolean; is_spam?: boolean },
    doneMsg: string,
  ) => {
    try {
      await updateConversation(id, patch);
      toast.success(doneMsg);
      if (thread?.id === id) setThread(null);
      await loadList();
    } catch {
      toast.error("Could not update. Please try again.");
    }
  };

  const doDelete = async () => {
    if (deletingId === null) return;
    setDeleteLoading(true);
    try {
      await deleteConversation(deletingId);
      toast.success("Conversation deleted.");
      if (thread?.id === deletingId) setThread(null);
      setDeletingId(null);
      await loadList();
    } catch {
      toast.error("Could not delete. Please try again.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const canReceive = settings?.can_receive ?? true;

  return (
    <div className="flex h-full flex-col">
      {/* send-only banner: copied verbatim from the previous implementation */}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <FolderRail folder={folder} onSelect={(f) => { setFolder(f); setThread(null); }}
                    onCompose={() => setComposeOpen(true)} />

        {thread || threadLoading ? (
          threadLoading || !thread ? (
            <div className="flex flex-1 items-center justify-center">
              <span className="text-sm text-muted-foreground">Loading…</span>
            </div>
          ) : (
            <ThreadView
              thread={thread}
              folder={folder}
              replySending={replySending}
              editorRef={replyEditorRef}
              onBack={() => setThread(null)}
              onReply={sendReply}
              onArchive={(v) => patchConversation(thread.id, { is_archived: v },
                v ? "Conversation archived." : "Moved to inbox.")}
              onSpam={(v) => patchConversation(thread.id, { is_spam: v },
                v ? "Marked as spam." : "Moved to inbox.")}
              onDelete={() => setDeletingId(thread.id)}
            />
          )
        ) : (
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b px-4 py-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search mail"
                className="w-full bg-transparent py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none"
              />
              {query && (
                <button type="button" aria-label="Clear search" onClick={() => setQuery("")}
                        className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <ConversationList
              items={visible}
              folder={folder}
              loading={loading}
              onOpen={openConversation}
              onArchive={(id, v) => patchConversation(id, { is_archived: v },
                v ? "Conversation archived." : "Moved to inbox.")}
              onSpam={(id, v) => patchConversation(id, { is_spam: v },
                v ? "Marked as spam." : "Moved to inbox.")}
              onDelete={(id) => setDeletingId(id)}
            />
          </div>
        )}
      </div>

      {composeOpen && (
        <ComposeCard
          onClose={() => setComposeOpen(false)}
          onSent={async (conversationId) => {
            setComposeOpen(false);
            setFolder("inbox");
            await loadList();
            await openConversation(conversationId);
          }}
        />
      )}

      {deletingId !== null && (
        <DeleteConfirmDialog onCancel={() => setDeletingId(null)} onConfirm={doDelete}
                             loading={deleteLoading} />
      )}
    </div>
  );
}
```

(The banner JSX and `DeleteConfirmDialog` come from the pre-rewrite file — copy them in unchanged; the banner needs the `Mail`, `Link`, `Button`, `X` imports already present above.)

- [ ] **Step 3: Typecheck + build**

Run: `cd frontend-customer && npx tsc --noEmit && npm run build`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
make format
git add frontend-customer/src
git commit -m "feat(inbox): gmail-pattern inbox — folders, search, thread view, floating compose"
```

---

### Task 12: End-to-end verification + rollout

**Files:** none (verification only)

- [ ] **Step 1: Full backend suite**

Run: `docker compose exec django pytest -v`
Expected: everything passes (pre-existing adminkit failure excepted, if still present).

- [ ] **Step 2: Rebuild + browser smoke (dev stack)**

Run: `docker compose build nextjs-customer && make dev` (or restart the service), then in a browser on the seeded demo tenant `/admin/inbox`:
1. Folders switch, search filters, hover actions archive/restore.
2. Compose (floating card): bold/list/link formatting + attach a small PNG → send (email sink captures it; check `GET /api/v1/dev/emails/latest/?to=...`).
3. Reply from thread with formatting → thread refreshes, HTML renders styled (typography plugin working).
4. Attachment chip + image thumbnail render; download link works (MinIO).
5. Inbound with attachment: POST a signed payload to `/api/v1/mailbox/inbound/` (reuse the signing helper from `apps/mailbox/tests/test_inbound_api.py`) including an `attachments` entry → thread shows the file.

- [ ] **Step 3: Deploy checklist (when user says deploy)**

1. `cd infra/cloudflare/mailbox-worker && npx wrangler deploy` (attachment-enabled worker).
2. Normal contentor deploy (`~/ws/home-server/deploy.sh contentor`) — entrypoint runs `--tenant` migrations (0004).
3. Live smoke: email `y@contentor.app` with an image + PDF from Gmail → thread shows thumbnail + chip; reply with formatting + attachment → arrives intact in Gmail.

- [ ] **Step 4: Final commit / hand back**

Report results; leave merge/push decision to the user (shared tree, `main` is ahead of origin).

---

## Self-Review Notes

- Spec coverage: layout/folders/search/hover (T9–T11), rich editor + HTML send (T3, T7, T8), attachments outbound (T2, T3, T8), inbound (T5, T6), display (T9, T10), previews (T4), settings bump (T5), worker (T6), tests/rollout (T12). Compose floating card (T11). ✔
- Types consistent: `OutgoingDraft {text, html, attachmentIds}` produced by T8, consumed in T10/T11; API `attachment_ids` snake_case at the wire, camelCase in drafts. `Folder` from `folder-rail.tsx`. ✔
- No placeholders; all code inline. ✔
