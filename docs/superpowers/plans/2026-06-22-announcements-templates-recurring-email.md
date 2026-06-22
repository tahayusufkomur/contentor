# Announcements: Templates, Recurring & Email — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Coach Announcements Lab with built-in + custom templates, simple recurring schedules (daily/weekly/monthly in tenant timezone), and an opt-in theme-branded email channel with unsubscribe compliance.

**Architecture:** Separate single-purpose tenant-schema models (`AnnouncementTemplate`, `RecurringAnnouncement`, `EmailOptOut`) plus additive fields on `Announcement`/`AnnouncementRecipient`. Recurrence is driven by a new per-minute beat `dispatch_due_recurrences` that spawns ordinary `Announcement`s (mirroring the existing `dispatch_due_announcements`). Email is rendered server-side as inline-styled HTML and sent via the existing Resend wrapper.

**Tech Stack:** Django 5.1 + DRF + django-tenants, Celery beat, Resend (`apps.core.email`), Next.js 14 customer app.

## Global Constraints

- All new models are **tenant-schema** (`app_label = "notifications"`, in `TENANT_APPS`). Migrations auto-apply on deploy via the entrypoint `migrate_schemas --tenant` step.
- Coach endpoints use `@permission_classes([IsCoachOrOwner])`. Public endpoints use `@authentication_classes([])` + `AllowAny`.
- Rich-text bodies are sanitized with `apps.tenant_config.defaults.sanitize_rich_text`; push bodies use `apps.notifications.payloads.strip_to_text`.
- Empty-success APIs return `204` (clientFetch + Cloudflare gotcha).
- Tenant absolute URL pattern: primary `Domain` else `f"https://{tenant.subdomain}.{settings.CONTENTOR_DOMAIN}"`.
- Tests: `pytestmark = pytest.mark.django_db(transaction=True)`, use the `tenant_ctx` fixture (backend/conftest.py); run inside the django container: `docker compose exec -T django python -m pytest <path> -q`.
- Frontend coach UI must avoid raw paths/slugs — favor pickers/plain language (`contentor-coach-non-technical-ux`). Token-only colors.
- Run `makemigrations --check` clean before finishing.

---

## File Structure

**Backend (create):**
- `apps/notifications/templates_builtin.py` — built-in template constants + `builtin_templates(brand)`.
- `apps/notifications/recurrence.py` — pure `next_occurrence` schedule math.
- `apps/notifications/email_render.py` — `THEME_EMAIL_COLORS`, `announcement_email_html`, `tenant_base_url`, `unsubscribe_url`.

**Backend (modify):**
- `apps/core/email.py` — `send_email` gains optional `headers`.
- `apps/notifications/models.py` — new models + fields.
- `apps/notifications/services.py` — `send_announcement_emails`, hook into `send_announcement_to_recipients`.
- `apps/notifications/serializers.py` — template, recurring, `also_email`.
- `apps/notifications/admin_views.py` + `admin_urls.py` — template + recurring CRUD; `also_email` on create.
- `apps/notifications/views.py` + `urls.py` — public email unsubscribe.
- `apps/notifications/tasks.py` — `dispatch_due_recurrences`.
- `backend/config/celery.py` — beat entry.

**Frontend (modify):**
- `frontend-customer/src/lib/announcements.ts` — types + methods.
- `frontend-customer/src/components/admin/announcement-compose.tsx` — template picker, save-as-template, also-email toggle, Once/Repeating presets.
- `frontend-customer/src/app/admin/notifications/` — Templates + Recurring management views (follow existing admin page patterns).

---

# Phase 1 — Email channel

### Task 1: `send_email` accepts custom headers

**Files:**
- Modify: `backend/apps/core/email.py:9-33`
- Test: `backend/apps/core/tests/test_email.py` (create)

**Interfaces:**
- Produces: `send_email(to: str, subject: str, html: str, from_name: str = "", headers: dict | None = None) -> bool`

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/core/tests/test_email.py
from unittest.mock import patch

from django.test import override_settings

from apps.core import email


@override_settings(RESEND_API_KEY="re_test", RESEND_FROM_EMAIL="x@y.com")
def test_send_email_passes_headers():
    with patch.object(email.resend.Emails, "send") as mock:
        ok = email.send_email("a@b.com", "Hi", "<p>x</p>", headers={"List-Unsubscribe": "<https://u>"})
    assert ok is True
    assert mock.call_args.args[0]["headers"] == {"List-Unsubscribe": "<https://u>"}
```

- [ ] **Step 2: Run test, verify it fails**

Run: `docker compose exec -T django python -m pytest apps/core/tests/test_email.py -q`
Expected: FAIL (`headers` not in payload / KeyError).

- [ ] **Step 3: Implement**

In `send_email`, add `headers: dict | None = None` param. Build payload dict, then `if headers: payload["headers"] = headers` before `resend.Emails.send(payload)`.

```python
def send_email(to: str, subject: str, html: str, from_name: str = "", headers: dict | None = None) -> bool:
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set, logging email instead")
        logger.info("Email to=%s subject=%s", to, subject)
        return False
    resend.api_key = settings.RESEND_API_KEY
    from_email = settings.RESEND_FROM_EMAIL
    if from_name:
        from_email = f"{from_name} <{settings.RESEND_FROM_EMAIL}>"
    payload = {"from": from_email, "to": [to], "subject": subject, "html": html}
    if headers:
        payload["headers"] = headers
    try:
        resend.Emails.send(payload)
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to)
        return False
```

- [ ] **Step 4: Run test, verify pass**

Run: `docker compose exec -T django python -m pytest apps/core/tests/test_email.py -q` → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/email.py backend/apps/core/tests/test_email.py
git commit -m "feat(core): send_email accepts custom headers (for List-Unsubscribe)"
```

---

### Task 2: Email model fields + EmailOptOut

**Files:**
- Modify: `backend/apps/notifications/models.py`
- Create migration: `apps/notifications/migrations/0004_email_fields.py` (via makemigrations)
- Test: `backend/apps/notifications/tests/test_models.py` (append)

**Interfaces:**
- Produces: `Announcement.also_email: bool`; `Announcement.recurrence` (added in Task 11, leave out here); `AnnouncementRecipient.email_status` in {none,sent,failed}; `EmailOptOut(user, email, created_at)` with unique `email`.

- [ ] **Step 1: Write the failing test**

```python
# append to backend/apps/notifications/tests/test_models.py
from apps.notifications.models import Announcement, AnnouncementRecipient, EmailOptOut

def test_email_fields_and_optout(tenant_ctx):
    a = Announcement.objects.create(title="T", body="b", filters_json={})
    assert a.also_email is False
    o = EmailOptOut.objects.create(email="x@y.com")
    assert EmailOptOut.objects.filter(email="x@y.com").exists()
    assert "email_status" in [f.name for f in AnnouncementRecipient._meta.fields]
```

- [ ] **Step 2: Run, verify fail** — `... test_models.py::test_email_fields_and_optout -q` → FAIL (no `also_email`/`EmailOptOut`).

- [ ] **Step 3: Implement** — in `models.py`:

```python
class Announcement(models.Model):
    ...
    also_email = models.BooleanField(default=False)
    # (recurrence FK added in Task 11)

class AnnouncementRecipient(models.Model):
    EMAIL_CHOICES = [("none", "None"), ("sent", "Sent"), ("failed", "Failed")]
    ...
    email_status = models.CharField(max_length=10, choices=EMAIL_CHOICES, default="none")

class EmailOptOut(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True, related_name="+")
    email = models.CharField(max_length=254, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "notifications"
```

- [ ] **Step 4: Make + run migration**

```bash
docker compose exec -T django python manage.py makemigrations notifications
docker compose exec -T django python manage.py migrate_schemas --tenant
```

- [ ] **Step 5: Run, verify pass** → PASS

- [ ] **Step 6: Commit**

```bash
git add backend/apps/notifications/models.py backend/apps/notifications/migrations backend/apps/notifications/tests/test_models.py
git commit -m "feat(notifications): also_email, email_status, EmailOptOut model"
```

---

### Task 3: Themed email render

**Files:**
- Create: `backend/apps/notifications/email_render.py`
- Test: `backend/apps/notifications/tests/test_email_render.py` (create)

**Interfaces:**
- Produces:
  - `tenant_base_url(tenant) -> str`
  - `unsubscribe_url(tenant, *, user_id=None, email=None) -> str` (signed token)
  - `decode_unsubscribe(token: str) -> dict | None`
  - `announcement_email_html(announcement, cfg, base_url) -> tuple[str, str]` returning `(subject, html)`
  - `THEME_EMAIL_COLORS: dict[str, str]`

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/notifications/tests/test_email_render.py
import pytest
from apps.notifications import email_render
from apps.notifications.models import Announcement
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)


def test_render_has_title_cta_and_unsub(tenant_ctx):
    cfg = TenantConfig.objects.create(brand_name="Zen", theme="ocean")
    a = Announcement.objects.create(title="Hello", body="<p>Body</p>", link="/courses/x", filters_json={})
    subject, html = email_render.announcement_email_html(a, cfg, "https://t.example.com")
    assert subject == "Hello"
    assert "Body" in html
    assert "https://t.example.com/courses/x" in html      # CTA absolute
    assert "unsubscribe" in html.lower()
    assert email_render.THEME_EMAIL_COLORS["ocean"] in html


def test_unsubscribe_token_roundtrip(tenant_ctx):
    token = email_render.unsubscribe_url(tenant_ctx, email="a@b.com").split("t=")[1]
    data = email_render.decode_unsubscribe(token)
    assert data["email"] == "a@b.com"
```

- [ ] **Step 2: Run, verify fail** → module missing.

- [ ] **Step 3: Implement**

```python
# backend/apps/notifications/email_render.py
from django.conf import settings
from django.core import signing

from apps.core.models import Domain
from apps.tenant_config.defaults import sanitize_rich_text

_SALT = "notifications.email.unsubscribe"

# Keys MUST match TenantTheme choice values (tenant_config/models.py):
# ocean, ember, forest, sunset, violet, slate
THEME_EMAIL_COLORS = {
    "ocean": "#0391F9", "ember": "#ea580c", "forest": "#16a34a",
    "sunset": "#f97316", "violet": "#7c3aed", "slate": "#334155",
}
_DEFAULT_COLOR = "#0391F9"


def tenant_base_url(tenant) -> str:
    domain = Domain.objects.filter(tenant=tenant, is_primary=True).first()
    if domain:
        return f"https://{domain.domain}"
    return f"https://{tenant.subdomain}.{settings.CONTENTOR_DOMAIN}"


def unsubscribe_url(tenant, *, user_id=None, email=None) -> str:
    token = signing.dumps({"schema": tenant.schema_name, "user_id": user_id, "email": email}, salt=_SALT)
    return f"{tenant_base_url(tenant)}/api/v1/notifications/email/unsubscribe/?t={token}"


def decode_unsubscribe(token: str):
    try:
        return signing.loads(token, salt=_SALT, max_age=60 * 60 * 24 * 90)
    except signing.BadSignature:
        return None


def _abs(base_url: str, link: str) -> str:
    if not link:
        return base_url
    return link if link.startswith("http") else f"{base_url}{link}"


def announcement_email_html(announcement, cfg, base_url: str):
    color = THEME_EMAIL_COLORS.get(getattr(cfg, "theme", ""), _DEFAULT_COLOR)
    brand = (cfg.brand_name if cfg else "") or "Contentor"
    subject = announcement.title or brand
    body = sanitize_rich_text(announcement.body or "")
    logo = (cfg.logo_url if cfg and cfg.logo_url else "")
    header = (
        f'<img src="{logo}" alt="{brand}" style="height:40px;margin-bottom:16px"/>'
        if logo else f'<h2 style="color:{color};margin:0 0 16px">{brand}</h2>'
    )
    cta = ""
    if announcement.link:
        cta = (
            f'<a href="{_abs(base_url, announcement.link)}" '
            f'style="display:inline-block;background:{color};color:#fff;padding:12px 28px;'
            f'border-radius:999px;text-decoration:none;font-weight:600;margin:20px 0">Open</a>'
        )
    unsub = announcement.email_unsub_url  # set by caller; see Task 4
    html = f"""
    <div style="font-family:-apple-system,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 20px">
      {header}
      <h1 style="font-size:20px;color:#1a1a2e;margin:0 0 12px">{announcement.title}</h1>
      <div style="color:#444;font-size:15px;line-height:1.5">{body}</div>
      {cta}
      <hr style="border:none;border-top:1px solid #eee;margin:28px 0"/>
      <p style="color:#aaa;font-size:12px">{brand} · <a href="{unsub}" style="color:#aaa">Unsubscribe</a></p>
    </div>"""
    return subject, html
```

Note: `announcement.email_unsub_url` is a transient attribute the caller sets per render (not a DB field).

- [ ] **Step 4: Adjust test** to set `a.email_unsub_url = "https://u"` before calling render (transient attr). Run → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/notifications/email_render.py backend/apps/notifications/tests/test_email_render.py
git commit -m "feat(notifications): themed announcement email render + unsubscribe token"
```

---

### Task 4: `send_announcement_emails` + hook into fanout

**Files:**
- Modify: `backend/apps/notifications/services.py:72-109`
- Test: `backend/apps/notifications/tests/test_announcement_email.py` (create)

**Interfaces:**
- Consumes: `email_render.announcement_email_html`, `email_render.unsubscribe_url`, `email_render.tenant_base_url`, `core.email.send_email`.
- Produces: `send_announcement_emails(announcement) -> int` (count emailed). Called from `send_announcement_to_recipients` when `announcement.also_email`.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/notifications/tests/test_announcement_email.py
from unittest.mock import patch
import pytest
from apps.accounts.models import User
from apps.notifications import services
from apps.notifications.models import Announcement, AnnouncementRecipient, EmailOptOut
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)


def _student(email):
    return User.objects.create_user(email=email, name="S", password="x", role="student")  # noqa: S106


def test_emails_recipients_except_optout(tenant_ctx):
    TenantConfig.objects.create(brand_name="Z", theme="ocean")
    u1, u2 = _student("a@b.com"), _student("c@d.com")
    EmailOptOut.objects.create(email="c@d.com")
    a = Announcement.objects.create(title="T", body="b", filters_json={}, also_email=True)
    AnnouncementRecipient.objects.create(announcement=a, user=u1)
    AnnouncementRecipient.objects.create(announcement=a, user=u2)
    with patch.object(services, "send_email", return_value=True) as mock:
        sent = services.send_announcement_emails(a)
    assert sent == 1
    assert mock.call_count == 1
    assert AnnouncementRecipient.objects.get(announcement=a, user=u1).email_status == "sent"
    assert AnnouncementRecipient.objects.get(announcement=a, user=u2).email_status == "none"
```

- [ ] **Step 2: Run, verify fail** → `send_announcement_emails` undefined.

- [ ] **Step 3: Implement** — add to `services.py` (import at top: `from django.db import connection`, `from apps.core.email import send_email`, `from . import email_render`, `from .models import EmailOptOut`, `from apps.tenant_config.models import TenantConfig`):

```python
def send_announcement_emails(announcement) -> int:
    cfg = TenantConfig.objects.first()
    tenant = connection.tenant
    base_url = email_render.tenant_base_url(tenant)
    opted_out = set(
        EmailOptOut.objects.values_list("email", flat=True)
    )
    sent = 0
    for recipient in announcement.recipients.select_related("user"):
        email = (recipient.user.email or "").strip()
        if not email or email.lower() in {e.lower() for e in opted_out}:
            continue
        announcement.email_unsub_url = email_render.unsubscribe_url(
            tenant, user_id=recipient.user_id, email=email
        )
        subject, html = email_render.announcement_email_html(announcement, cfg, base_url)
        ok = send_email(
            email, subject, html,
            from_name=(cfg.brand_name if cfg else ""),
            headers={"List-Unsubscribe": f"<{announcement.email_unsub_url}>"},
        )
        recipient.email_status = "sent" if ok else "failed"
        recipient.save(update_fields=["email_status"])
        if ok:
            sent += 1
    return sent
```

Then in `send_announcement_to_recipients`, after the push loop and before/after the final save, add:

```python
    if announcement.also_email:
        send_announcement_emails(announcement)
```

- [ ] **Step 4: Run, verify pass** → PASS

- [ ] **Step 5: Add hook test** — extend test to assert that `send_announcement_to_recipients` triggers emails when `also_email=True` and skips when False (patch `send_announcement_emails`, assert call_count). Run → PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/notifications/services.py backend/apps/notifications/tests/test_announcement_email.py
git commit -m "feat(notifications): send themed announcement emails, suppress opt-outs"
```

---

### Task 5: Public unsubscribe endpoint + `also_email` on create

**Files:**
- Modify: `backend/apps/notifications/views.py`, `backend/apps/notifications/urls.py`
- Modify: `backend/apps/notifications/serializers.py` (`AnnouncementCreateSerializer` add `also_email`), `admin_views.py` (pass `also_email`)
- Test: `backend/apps/notifications/tests/test_email_unsub.py` (create)

**Interfaces:**
- Produces: `GET /api/v1/notifications/email/unsubscribe/?t=<token>` (public) → creates `EmailOptOut`, returns `200` html confirmation. `AnnouncementCreateSerializer.also_email: bool default False`.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/notifications/tests/test_email_unsub.py
import pytest
from django.test import Client
from apps.notifications import email_render
from apps.notifications.models import EmailOptOut

pytestmark = pytest.mark.django_db(transaction=True)


def test_unsubscribe_creates_optout(tenant_ctx, settings):
    token = email_render.unsubscribe_url(tenant_ctx, email="a@b.com").split("t=")[1]
    # call view function directly to stay in tenant schema
    from apps.notifications.views import email_unsubscribe
    from rest_framework.test import APIRequestFactory
    req = APIRequestFactory().get(f"/api/v1/notifications/email/unsubscribe/?t={token}")
    resp = email_unsubscribe(req)
    assert resp.status_code == 200
    assert EmailOptOut.objects.filter(email="a@b.com").exists()
```

- [ ] **Step 2: Run, verify fail** → `email_unsubscribe` undefined.

- [ ] **Step 3: Implement** — in `views.py`:

```python
from django.http import HttpResponse
from . import email_render
from .models import EmailOptOut

@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def email_unsubscribe(request):
    data = email_render.decode_unsubscribe(request.GET.get("t", ""))
    if not data:
        return HttpResponse("Invalid or expired link.", status=400)
    email = (data.get("email") or "").strip().lower()
    if email:
        EmailOptOut.objects.get_or_create(email=email, defaults={"user_id": data.get("user_id")})
    return HttpResponse("You've been unsubscribed from these emails.", status=200)
```

Add to `urls.py`: `path("email/unsubscribe/", views.email_unsubscribe, name="email-unsubscribe")`.

In `serializers.py` `AnnouncementCreateSerializer`, add `also_email = serializers.BooleanField(required=False, default=False)`. In `admin_views.py` `announcement_collection` create, add `also_email=data.get("also_email", False)` to `Announcement.objects.create(...)`.

- [ ] **Step 4: Run, verify pass** → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/notifications/views.py backend/apps/notifications/urls.py backend/apps/notifications/serializers.py backend/apps/notifications/admin_views.py backend/apps/notifications/tests/test_email_unsub.py
git commit -m "feat(notifications): public email unsubscribe + also_email on create"
```

---

# Phase 2 — Templates

### Task 6: Built-in templates module

**Files:**
- Create: `backend/apps/notifications/templates_builtin.py`
- Test: `backend/apps/notifications/tests/test_templates.py` (create)

**Interfaces:**
- Produces: `builtin_templates(brand: str) -> list[dict]` each `{id: "builtin:<key>", builtin: True, name, title, body, link, link_label}`.

- [ ] **Step 1: Write failing test**

```python
# backend/apps/notifications/tests/test_templates.py
import pytest
from apps.notifications.templates_builtin import builtin_templates

pytestmark = pytest.mark.django_db(transaction=True)


def test_builtins_fill_brand():
    items = builtin_templates("Zen Studio")
    assert len(items) >= 5
    assert all(t["id"].startswith("builtin:") and t["builtin"] for t in items)
    assert any("Zen Studio" in t["body"] or "Zen Studio" in t["title"] for t in items)
```

- [ ] **Step 2: Run, verify fail** → module missing.

- [ ] **Step 3: Implement**

```python
# backend/apps/notifications/templates_builtin.py
_BUILTINS = [
    {"key": "welcome", "name": "Welcome", "title": "Welcome to {brand}! 🎉",
     "body": "<p>We're so glad you're here. Take a look around and start exploring.</p>", "link": "", "link_label": ""},
    {"key": "new_course", "name": "New course live", "title": "A new course just dropped",
     "body": "<p>Fresh content is ready for you at {brand}. Jump in!</p>", "link": "", "link_label": ""},
    {"key": "live_reminder", "name": "Live session reminder", "title": "Live session coming up",
     "body": "<p>Don't forget — we go live soon. See you there!</p>", "link": "", "link_label": ""},
    {"key": "promo", "name": "Promo / sale", "title": "A little something for you",
     "body": "<p>For a limited time, enjoy a special offer at {brand}.</p>", "link": "", "link_label": ""},
    {"key": "we_miss_you", "name": "We miss you", "title": "We miss you 💛",
     "body": "<p>It's been a while — come back and pick up where you left off.</p>", "link": "", "link_label": ""},
    {"key": "schedule_change", "name": "Schedule change", "title": "A quick schedule update",
     "body": "<p>Here's an update to our upcoming schedule. Thanks for your flexibility!</p>", "link": "", "link_label": ""},
]


def builtin_templates(brand: str) -> list[dict]:
    b = brand or "us"
    out = []
    for t in _BUILTINS:
        out.append({
            "id": f"builtin:{t['key']}", "builtin": True, "name": t["name"],
            "title": t["title"].format(brand=b), "body": t["body"].format(brand=b),
            "link": t["link"], "link_label": t["link_label"],
        })
    return out
```

- [ ] **Step 4: Run, verify pass** → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/notifications/templates_builtin.py backend/apps/notifications/tests/test_templates.py
git commit -m "feat(notifications): built-in announcement templates"
```

---

### Task 7: `AnnouncementTemplate` model + CRUD API

**Files:**
- Modify: `backend/apps/notifications/models.py`, `serializers.py`, `admin_views.py`, `admin_urls.py`
- Migration via makemigrations
- Test: append `backend/apps/notifications/tests/test_templates.py`

**Interfaces:**
- Produces: `AnnouncementTemplate(name, title, body, link, link_label, created_by, created_at)`.
- API: `GET /api/v1/admin/notifications/templates/` (builtins+custom), `POST` (create custom), `DELETE templates/<int:pk>/`.

- [ ] **Step 1: Write failing test**

```python
# append to test_templates.py
from apps.accounts.models import User
from apps.notifications.models import AnnouncementTemplate
from apps.notifications.serializers import AnnouncementTemplateSerializer

def test_custom_template_create_and_list(tenant_ctx):
    u = User.objects.create_user(email="c@m.com", name="C", password="x", role="owner")  # noqa: S106
    t = AnnouncementTemplate.objects.create(name="Mine", title="Hi", body="<p>b</p>", created_by=u)
    data = AnnouncementTemplateSerializer(t).data
    assert data["name"] == "Mine" and data["builtin"] is False
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement**

`models.py`:
```python
class AnnouncementTemplate(models.Model):
    name = models.CharField(max_length=120)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True, default="")
    link = models.CharField(max_length=500, blank=True, default="")
    link_label = models.CharField(max_length=200, blank=True, default="")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "notifications"
        ordering = ["-created_at"]
```

`serializers.py`:
```python
class AnnouncementTemplateSerializer(serializers.ModelSerializer):
    builtin = serializers.SerializerMethodField()

    class Meta:
        model = AnnouncementTemplate
        fields = ["id", "name", "title", "body", "link", "link_label", "builtin"]
        read_only_fields = ["id"]

    def get_builtin(self, obj):
        return False

    def validate_body(self, value):
        return sanitize_rich_text(value)
```

`admin_views.py` (new views):
```python
from .models import AnnouncementTemplate
from .serializers import AnnouncementTemplateSerializer
from .templates_builtin import builtin_templates
from apps.tenant_config.models import TenantConfig

@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def template_collection(request):
    if request.method == "GET":
        cfg = TenantConfig.objects.first()
        brand = cfg.brand_name if cfg else ""
        custom = AnnouncementTemplateSerializer(AnnouncementTemplate.objects.all(), many=True).data
        return Response(builtin_templates(brand) + list(custom))
    serializer = AnnouncementTemplateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    obj = AnnouncementTemplate.objects.create(created_by=request.user, **serializer.validated_data)
    return Response(AnnouncementTemplateSerializer(obj).data, status=status.HTTP_201_CREATED)

@api_view(["DELETE"])
@permission_classes([IsCoachOrOwner])
def template_detail(request, pk):
    AnnouncementTemplate.objects.filter(pk=pk).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
```

`admin_urls.py` add:
```python
path("notifications/templates/", admin_views.template_collection, name="announcement-templates"),
path("notifications/templates/<int:pk>/", admin_views.template_detail, name="announcement-template-detail"),
```

- [ ] **Step 4: makemigrations + migrate + run tests** → PASS

```bash
docker compose exec -T django python manage.py makemigrations notifications && docker compose exec -T django python manage.py migrate_schemas --tenant
docker compose exec -T django python -m pytest apps/notifications/tests/test_templates.py -q
```

- [ ] **Step 5: Commit**

```bash
git add backend/apps/notifications/models.py backend/apps/notifications/serializers.py backend/apps/notifications/admin_views.py backend/apps/notifications/admin_urls.py backend/apps/notifications/migrations backend/apps/notifications/tests/test_templates.py
git commit -m "feat(notifications): AnnouncementTemplate model + templates API"
```

---

# Phase 3 — Recurring

### Task 8: Recurrence math (pure helper)

**Files:**
- Create: `backend/apps/notifications/recurrence.py`
- Test: `backend/apps/notifications/tests/test_recurrence.py` (create)

**Interfaces:**
- Produces: `next_occurrence(*, frequency, send_time, weekday, day_of_month, after_utc, tz_name, start_date) -> datetime` (UTC, aware). Returns the first valid slot strictly after `max(after_utc, start_date@send_time)`.

- [ ] **Step 1: Write failing tests**

```python
# backend/apps/notifications/tests/test_recurrence.py
from datetime import date, datetime, time, timezone
from apps.notifications.recurrence import next_occurrence


def _utc(y, m, d, h, mi=0):
    return datetime(y, m, d, h, mi, tzinfo=timezone.utc)


def test_daily_rolls_to_next_day():
    nxt = next_occurrence(frequency="daily", send_time=time(9, 0), weekday=None,
                          day_of_month=None, after_utc=_utc(2026, 6, 22, 12, 0),
                          tz_name="UTC", start_date=date(2026, 6, 1))
    assert nxt == _utc(2026, 6, 23, 9, 0)


def test_weekly_picks_weekday():
    # Monday=0; after a Monday should land next Monday
    nxt = next_occurrence(frequency="weekly", send_time=time(8, 0), weekday=0,
                          day_of_month=None, after_utc=_utc(2026, 6, 22, 9, 0),  # 2026-06-22 is Monday
                          tz_name="UTC", start_date=date(2026, 6, 1))
    assert nxt == _utc(2026, 6, 29, 8, 0)


def test_monthly_clamps_to_month_length():
    nxt = next_occurrence(frequency="monthly", send_time=time(7, 0), weekday=None,
                          day_of_month=31, after_utc=_utc(2026, 3, 31, 8, 0),
                          tz_name="UTC", start_date=date(2026, 1, 1))
    assert nxt == _utc(2026, 4, 30, 7, 0)  # April has 30 days


def test_timezone_applied():
    # 9am Europe/Istanbul (UTC+3) == 06:00 UTC
    nxt = next_occurrence(frequency="daily", send_time=time(9, 0), weekday=None,
                          day_of_month=None, after_utc=_utc(2026, 6, 22, 12, 0),
                          tz_name="Europe/Istanbul", start_date=date(2026, 6, 1))
    assert nxt == _utc(2026, 6, 23, 6, 0)
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement**

```python
# backend/apps/notifications/recurrence.py
import calendar
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo


def _at(d: date, t: time, tz: ZoneInfo) -> datetime:
    return datetime(d.year, d.month, d.day, t.hour, t.minute, tzinfo=tz)


def _monthly(d: date, dom: int, tz, t):
    last = calendar.monthrange(d.year, d.month)[1]
    return _at(date(d.year, d.month, min(dom, last)), t, tz)


def next_occurrence(*, frequency, send_time, weekday, day_of_month, after_utc, tz_name, start_date):
    tz = ZoneInfo(tz_name or "UTC")
    after_local = after_utc.astimezone(tz)
    floor = max(after_local, _at(start_date, send_time, tz) - timedelta(seconds=1))
    cur = floor.date()
    if frequency == "daily":
        slot = _at(cur, send_time, tz)
        if slot <= floor:
            slot = _at(cur + timedelta(days=1), send_time, tz)
        return slot.astimezone(ZoneInfo("UTC"))
    if frequency == "weekly":
        for i in range(0, 15):
            d = cur + timedelta(days=i)
            if d.weekday() == weekday:
                slot = _at(d, send_time, tz)
                if slot > floor:
                    return slot.astimezone(ZoneInfo("UTC"))
        raise ValueError("no weekly slot")
    if frequency == "monthly":
        slot = _monthly(cur, day_of_month, tz, send_time)
        if slot <= floor:
            nxt_month = (cur.replace(day=1) + timedelta(days=32)).replace(day=1)
            slot = _monthly(nxt_month, day_of_month, tz, send_time)
        return slot.astimezone(ZoneInfo("UTC"))
    raise ValueError(f"bad frequency {frequency}")
```

- [ ] **Step 4: Run, verify pass** → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/notifications/recurrence.py backend/apps/notifications/tests/test_recurrence.py
git commit -m "feat(notifications): recurrence next-occurrence math"
```

---

### Task 9: `RecurringAnnouncement` model + `Announcement.recurrence` FK

**Files:**
- Modify: `backend/apps/notifications/models.py`
- Migration via makemigrations
- Test: append `test_models.py`

**Interfaces:**
- Produces: `RecurringAnnouncement(title, body, link, link_label, filters_json, also_email, frequency, send_time, weekday, day_of_month, start_date, end_date, next_run_at, is_active, created_by, created_at)`; `Announcement.recurrence` FK.

- [ ] **Step 1: Write failing test**

```python
# append test_models.py
from apps.notifications.models import RecurringAnnouncement

def test_recurring_defaults(tenant_ctx):
    from datetime import time, date
    r = RecurringAnnouncement.objects.create(
        title="Daily", body="b", filters_json={}, frequency="daily",
        send_time=time(9, 0), start_date=date(2026, 6, 1),
        next_run_at=__import__("django.utils.timezone", fromlist=["now"]).now())
    assert r.is_active is True and r.also_email is False
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement**

```python
class RecurringAnnouncement(models.Model):
    FREQ = [("daily", "Daily"), ("weekly", "Weekly"), ("monthly", "Monthly")]
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True, default="")
    link = models.CharField(max_length=500, blank=True, default="")
    link_label = models.CharField(max_length=200, blank=True, default="")
    filters_json = models.JSONField(default=dict, blank=True)
    also_email = models.BooleanField(default=False)
    frequency = models.CharField(max_length=10, choices=FREQ)
    send_time = models.TimeField()
    weekday = models.SmallIntegerField(null=True, blank=True)
    day_of_month = models.SmallIntegerField(null=True, blank=True)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    next_run_at = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "notifications"
        ordering = ["-created_at"]
```

And on `Announcement`: `recurrence = models.ForeignKey("RecurringAnnouncement", on_delete=models.SET_NULL, null=True, blank=True, related_name="instances")`.

- [ ] **Step 4: makemigrations + migrate + run** → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/notifications/models.py backend/apps/notifications/migrations backend/apps/notifications/tests/test_models.py
git commit -m "feat(notifications): RecurringAnnouncement model + Announcement.recurrence"
```

---

### Task 10: Recurring CRUD API + next_run init

**Files:**
- Modify: `backend/apps/notifications/serializers.py`, `admin_views.py`, `admin_urls.py`
- Test: `backend/apps/notifications/tests/test_recurring_api.py` (create)

**Interfaces:**
- Produces: `RecurringAnnouncementSerializer` (validates freq/field combos, end>=start, computes `next_run_at` on create/update via `recurrence.next_occurrence` + `TenantConfig.timezone`). API: `GET/POST notifications/recurring/`, `GET/PATCH/DELETE notifications/recurring/<int:pk>/`.

- [ ] **Step 1: Write failing test**

```python
# backend/apps/notifications/tests/test_recurring_api.py
import pytest
from datetime import date
from apps.accounts.models import User
from apps.notifications.serializers import RecurringAnnouncementSerializer
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)


def test_weekly_requires_weekday(tenant_ctx):
    s = RecurringAnnouncementSerializer(data={
        "title": "T", "body": "b", "filters": {}, "frequency": "weekly",
        "send_time": "09:00", "start_date": "2026-06-01"})
    assert not s.is_valid()
    assert "weekday" in str(s.errors)


def test_create_sets_next_run(tenant_ctx):
    TenantConfig.objects.create(brand_name="Z", theme="ocean", timezone="UTC")
    s = RecurringAnnouncementSerializer(data={
        "title": "T", "body": "b", "filters": {}, "frequency": "daily",
        "send_time": "09:00", "start_date": "2026-06-01"})
    assert s.is_valid(), s.errors
    obj = s.save(created_by=None)
    assert obj.next_run_at is not None
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — `serializers.py`:

```python
from django.utils import timezone as djtz
from . import recurrence as rec
from .models import RecurringAnnouncement
from apps.tenant_config.models import TenantConfig

class RecurringAnnouncementSerializer(serializers.ModelSerializer):
    filters = serializers.JSONField(source="filters_json", required=False, default=dict)

    class Meta:
        model = RecurringAnnouncement
        fields = ["id", "title", "body", "link", "link_label", "filters", "also_email",
                  "frequency", "send_time", "weekday", "day_of_month",
                  "start_date", "end_date", "next_run_at", "is_active"]
        read_only_fields = ["id", "next_run_at"]

    def validate_body(self, value):
        return sanitize_rich_text(value)

    def validate(self, data):
        freq = data.get("frequency", getattr(self.instance, "frequency", None))
        if freq == "weekly" and data.get("weekday", getattr(self.instance, "weekday", None)) is None:
            raise serializers.ValidationError({"weekday": "Required for weekly."})
        if freq == "monthly" and data.get("day_of_month", getattr(self.instance, "day_of_month", None)) is None:
            raise serializers.ValidationError({"day_of_month": "Required for monthly."})
        sd = data.get("start_date", getattr(self.instance, "start_date", None))
        ed = data.get("end_date", getattr(self.instance, "end_date", None))
        if ed and sd and ed < sd:
            raise serializers.ValidationError({"end_date": "Must be on/after start date."})
        return data

    def _compute_next(self, instance):
        cfg = TenantConfig.objects.first()
        tz_name = cfg.timezone if cfg else "UTC"
        instance.next_run_at = rec.next_occurrence(
            frequency=instance.frequency, send_time=instance.send_time,
            weekday=instance.weekday, day_of_month=instance.day_of_month,
            after_utc=djtz.now(), tz_name=tz_name, start_date=instance.start_date)

    def create(self, validated):
        obj = RecurringAnnouncement(**validated)
        self._compute_next(obj)
        obj.save()
        return obj

    def update(self, instance, validated):
        for k, v in validated.items():
            setattr(instance, k, v)
        self._compute_next(instance)
        instance.save()
        return instance
```

`admin_views.py`: standard collection + detail views (GET list, POST create with `created_by=request.user`, GET/PATCH/DELETE detail), mirroring `announcement_collection`/`announcement_detail`. `admin_urls.py`:
```python
path("notifications/recurring/", admin_views.recurring_collection, name="recurring-collection"),
path("notifications/recurring/<int:pk>/", admin_views.recurring_detail, name="recurring-detail"),
```

- [ ] **Step 4: Run, verify pass** → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/notifications/serializers.py backend/apps/notifications/admin_views.py backend/apps/notifications/admin_urls.py backend/apps/notifications/tests/test_recurring_api.py
git commit -m "feat(notifications): recurring announcement CRUD API"
```

---

### Task 11: `dispatch_due_recurrences` beat + exactly-once spawn

**Files:**
- Modify: `backend/apps/notifications/tasks.py`, `backend/config/celery.py`
- Test: `backend/apps/notifications/tests/test_recurring_dispatch.py` (create)

**Interfaces:**
- Consumes: `recurrence.next_occurrence`, `fanout_announcement`/`send_announcement_to_recipients`.
- Produces: `dispatch_due_recurrences()` task; beat schedule `dispatch-due-recurrences` every minute.

- [ ] **Step 1: Write failing test**

```python
# backend/apps/notifications/tests/test_recurring_dispatch.py
import pytest
from datetime import date, time, timedelta
from django.utils import timezone as djtz
from apps.notifications import tasks
from apps.notifications.models import Announcement, RecurringAnnouncement
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)


def test_due_recurrence_spawns_announcement(tenant_ctx, monkeypatch):
    TenantConfig.objects.create(brand_name="Z", theme="ocean", timezone="UTC")
    r = RecurringAnnouncement.objects.create(
        title="Daily", body="b", filters_json={}, frequency="daily",
        send_time=time(9, 0), start_date=date(2026, 1, 1),
        next_run_at=djtz.now() - timedelta(minutes=1))
    sent = {}
    monkeypatch.setattr(tasks, "send_announcement_to_recipients", lambda a: sent.setdefault("id", a.id))
    tasks._dispatch_recurrences_for_current_tenant()
    assert Announcement.objects.filter(recurrence=r).count() == 1
    r.refresh_from_db()
    assert r.next_run_at > djtz.now()  # advanced
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — `tasks.py`:

```python
@shared_task
def dispatch_due_recurrences() -> None:
    for tenant in get_tenant_model().objects.exclude(schema_name="public"):
        with tenant_context(tenant):
            try:
                _dispatch_recurrences_for_current_tenant()
            except Exception:  # noqa: BLE001
                logger.exception("recurrence dispatch failed for %s", tenant.schema_name)


def _dispatch_recurrences_for_current_tenant() -> None:
    from django.utils import timezone as djtz
    from apps.tenant_config.models import TenantConfig
    from . import recurrence as rec
    from .models import Announcement, RecurringAnnouncement
    from .services import send_announcement_to_recipients

    now = djtz.now()
    cfg = TenantConfig.objects.first()
    tz_name = cfg.timezone if cfg else "UTC"
    due = RecurringAnnouncement.objects.filter(is_active=True, next_run_at__lte=now)
    for rule in due:
        old_next = rule.next_run_at
        new_next = rec.next_occurrence(
            frequency=rule.frequency, send_time=rule.send_time, weekday=rule.weekday,
            day_of_month=rule.day_of_month, after_utc=now, tz_name=tz_name, start_date=rule.start_date)
        still_active = not (rule.end_date and new_next.date() > rule.end_date)
        claimed = RecurringAnnouncement.objects.filter(pk=rule.pk, next_run_at=old_next).update(
            next_run_at=new_next, is_active=still_active)
        if not claimed:
            continue  # another worker won the claim
        ann = Announcement.objects.create(
            title=rule.title, body=rule.body, link=rule.link, filters_json=rule.filters_json,
            also_email=rule.also_email, status="scheduled", recurrence=rule)
        send_announcement_to_recipients(ann)
```

`config/celery.py` add to `beat_schedule`:
```python
    "dispatch-due-recurrences": {
        "task": "apps.notifications.tasks.dispatch_due_recurrences",
        "schedule": crontab(minute="*"),
    },
```

- [ ] **Step 4: Run, verify pass** → PASS

- [ ] **Step 5: Add exactly-once test** — call `_dispatch_recurrences_for_current_tenant()` twice in a row; assert only ONE `Announcement` per rule (second pass finds `next_run_at` already advanced). Run → PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/notifications/tasks.py backend/config/celery.py backend/apps/notifications/tests/test_recurring_dispatch.py
git commit -m "feat(notifications): recurring dispatch beat with exactly-once spawn"
```

---

# Phase 4 — Frontend

### Task 12: API client types + methods

**Files:**
- Modify: `frontend-customer/src/lib/announcements.ts`

- [ ] **Step 1: Add types + methods** (no test harness; verified by `tsc` in Task 16):

```typescript
export interface AnnouncementTemplate {
  id: number | string;
  name: string;
  title: string;
  body: string;
  link: string;
  link_label: string;
  builtin: boolean;
}

export type Frequency = "daily" | "weekly" | "monthly";

export interface RecurringAnnouncement {
  id: number;
  title: string;
  body: string;
  link: string;
  link_label: string;
  filters: AnnouncementFilters;
  also_email: boolean;
  frequency: Frequency;
  send_time: string;        // "HH:MM"
  weekday: number | null;
  day_of_month: number | null;
  start_date: string;       // YYYY-MM-DD
  end_date: string | null;
  next_run_at: string;
  is_active: boolean;
}

export const listTemplates = () => clientFetch<AnnouncementTemplate[]>(`${BASE}/templates/`);
export const saveTemplate = (payload: { name: string; title: string; body: string; link?: string; link_label?: string }) =>
  clientFetch<AnnouncementTemplate>(`${BASE}/templates/`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
export const deleteTemplate = (id: number) =>
  clientFetch<void>(`${BASE}/templates/${id}/`, { method: "DELETE" });

export const listRecurring = () => clientFetch<RecurringAnnouncement[]>(`${BASE}/recurring/`);
export const createRecurring = (payload: Partial<RecurringAnnouncement> & { filters: AnnouncementFilters }) =>
  clientFetch<RecurringAnnouncement>(`${BASE}/recurring/`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
export const patchRecurring = (id: number, payload: Partial<RecurringAnnouncement>) =>
  clientFetch<RecurringAnnouncement>(`${BASE}/recurring/${id}/`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
export const deleteRecurring = (id: number) =>
  clientFetch<void>(`${BASE}/recurring/${id}/`, { method: "DELETE" });
```

Also add `also_email?: boolean` to the `createAnnouncement` payload type.

- [ ] **Step 2: Commit**

```bash
git add frontend-customer/src/lib/announcements.ts
git commit -m "feat(announcements): API client for templates, recurring, also_email"
```

---

### Task 13: Compose — template picker + save-as-template

**Files:**
- Modify: `frontend-customer/src/components/admin/announcement-compose.tsx`

- [ ] **Step 1: Implement** — add a `TemplatePicker` modal (reuse modal pattern from `link-picker.tsx`: `ModalPortal`, tabbed-free simple list with search). Add a **"Start from template"** button above Title that opens it; on pick, set `title`, `body`, `link`, `linkLabel`. Add a **"Save as template"** text button near Send that prompts (use a small inline name input or `window.prompt`) and calls `saveTemplate({ name, title, body, link, link_label: linkLabel })` then `toast.success`. Load templates via `listTemplates()` on first open.

Key snippet (button + state):
```tsx
const [templateOpen, setTemplateOpen] = useState(false);
// ...
<button type="button" onClick={() => setTemplateOpen(true)}
  className="text-sm text-primary hover:underline">Start from a template</button>
// applyTemplate:
const applyTemplate = (t: AnnouncementTemplate) => {
  setTitle(t.title); setBody(t.body); setLink(t.link || ""); setLinkLabel(t.link_label || "");
  setTemplateOpen(false);
};
```

- [ ] **Step 2: Verify** — `docker compose exec -T nextjs-customer sh -lc 'npx tsc --noEmit -p tsconfig.json'` → exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend-customer/src/components/admin/announcement-compose.tsx
git commit -m "feat(announcements): start-from-template + save-as-template in compose"
```

---

### Task 14: Compose — also-email toggle + Once/Repeating presets

**Files:**
- Modify: `frontend-customer/src/components/admin/announcement-compose.tsx`

- [ ] **Step 1: Implement**
  - Add `alsoEmail` boolean state + a checkbox row "Also send as an email (uses your brand)". Include `also_email: alsoEmail` in `createAnnouncement` payload (and reset on send).
  - Add a **Once / Repeating** segmented control. *Once* = existing datetime-local. *Repeating* reveals: frequency (Daily/Weekly/Monthly buttons), conditional weekday picker (Mon–Sun) for weekly, day-of-month (1–31) for monthly, a time input, start date, and "Ends: Never / On date". Show a "Times shown in your timezone" hint.
  - When Repeating, **`send` calls `createRecurring(...)`** instead of `createAnnouncement(...)`; toast "Recurring announcement created"; the button label becomes "Create recurring".

State + branch:
```tsx
const [mode, setMode] = useState<"once" | "repeating">("once");
const [freq, setFreq] = useState<Frequency>("daily");
const [weekday, setWeekday] = useState<number | null>(null);
const [dayOfMonth, setDayOfMonth] = useState<number | null>(null);
const [sendTime, setSendTime] = useState("09:00");
const [startDate, setStartDate] = useState("");
const [endDate, setEndDate] = useState<string>("");
// in send():
if (mode === "repeating") {
  await createRecurring({
    title: title.trim(), body, link: link.trim() || "", link_label: linkLabel,
    filters, also_email: alsoEmail, frequency: freq, send_time: sendTime,
    weekday: freq === "weekly" ? weekday : null,
    day_of_month: freq === "monthly" ? dayOfMonth : null,
    start_date: startDate, end_date: endDate || null,
  });
  toast.success("Recurring announcement created");
} else { /* existing createAnnouncement, now with also_email */ }
```

- [ ] **Step 2: Verify** `tsc --noEmit` → exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend-customer/src/components/admin/announcement-compose.tsx
git commit -m "feat(announcements): also-email toggle + once/repeating schedule presets"
```

---

### Task 15: Manage views — Templates + Recurring lists

**Files:**
- Modify: `frontend-customer/src/app/admin/notifications/` (add tabs/sections following existing page structure; inspect the current page first)

- [ ] **Step 1: Implement** — add two sections (or tabs) on `/admin/notifications`:
  - **Templates**: `listTemplates()` filtered to `!builtin`, render cards with name + delete (`deleteTemplate`), confirm before delete.
  - **Recurring**: `listRecurring()`, render each with title, human schedule summary ("Every Monday at 09:00", "Daily at 09:00", "Monthly on the 1st"), next run (localized), an Active/Paused toggle (`patchRecurring(id, { is_active })`), and delete (`deleteRecurring`). Empty states in plain language.

- [ ] **Step 2: Verify** `tsc --noEmit` → exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend-customer/src/app/admin/notifications
git commit -m "feat(announcements): manage templates + recurring schedules"
```

---

# Phase 5 — Verify

### Task 16: Full verification

- [ ] **Step 1: Backend suite**

Run: `docker compose exec -T django python -m pytest apps/notifications apps/core/tests/test_email.py -q`
Expected: all PASS.

- [ ] **Step 2: Migration check**

Run: `docker compose exec -T django python manage.py makemigrations --check --dry-run`
Expected: "No changes detected".

- [ ] **Step 3: Frontend typecheck + format**

Run: `docker compose exec -T nextjs-customer sh -lc 'npx tsc --noEmit -p tsconfig.json && npx prettier --check src/components/admin/announcement-compose.tsx src/lib/announcements.ts'`
Expected: exit 0 (run `prettier --write` if needed, then re-commit).

- [ ] **Step 4: Commit any formatting fixes**

```bash
git add -A && git commit -m "chore(announcements): formatting + final verification" || echo "nothing to commit"
```

---

## Self-Review notes (author)

- **Spec coverage:** templates (Tasks 6–7, 13, 15), email channel + render + compliance (Tasks 1–5, 14), recurrence (Tasks 8–11, 14–15), `also_email` plumbing (Tasks 2, 5, 14). All spec sections mapped.
- **Type consistency:** `next_occurrence` keyword signature identical in recurrence.py, serializer, and task. `send_announcement_emails`, `announcement_email_html(announcement, cfg, base_url)`, `email_unsub_url` transient attr consistent across Tasks 3–5. Template id is `number | string` (built-ins use `builtin:<key>`); delete only targets numeric custom ids.
- **Theme colors:** `THEME_EMAIL_COLORS` keys verified against `TenantTheme` choices = ocean, ember, forest, sunset, violet, slate.
