# Coach Announcements Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the fire-and-forget coach broadcast into a targeted, scheduled, rich-text announcement tool with a per-recipient receipt view and a student in-app feed.

**Architecture:** Extend the existing `apps.notifications` tenant app with `Announcement` + `AnnouncementRecipient` models. A single `resolve_audience(filters)` helper drives both the live "reach" preview and the send-time recipient snapshot. A Celery fan-out task materializes recipients and pushes to subscribers; a per-minute beat task dispatches due scheduled announcements. The coach UI (rebuilt `/admin/notifications`) composes/schedules and views receipts; the student customer app gains a bell + feed that supplies real read receipts.

**Tech Stack:** Django 5.1 + DRF, django-tenants, Celery + celery-beat, pywebpush, nh3 (HTML sanitize), Next.js 14 (App Router, two frontends), Tailwind + Radix.

## Global Constraints

- Backend app: `apps.notifications` (TENANT app; no tenant column on models — students live in the tenant schema).
- Coach endpoints under `/api/v1/admin/notifications/`, permission `apps.core.permissions.IsCoachOrOwner`.
- Student endpoints under `/api/v1/notifications/`, permission `IsAuthenticated`; a student sees only their own recipient rows.
- Push only reaches `PushSubscription` holders; everyone in the audience also gets a feed row.
- Audience is a snapshot materialized at **fire time**.
- Announcement `body` is sanitized HTML via `apps.tenant_config.defaults.sanitize_rich_text`; push body is tag-stripped plaintext.
- Tenant-triggered Celery tasks take `schema_name` and run inside `tenant_context` (mirror existing `apps/notifications/tasks.py`).
- Admin UI is hardcoded-English (consistent with the other ~26 admin pages + usage dashboards). No chart library.
- Tests: pytest, `pytestmark = pytest.mark.django_db(transaction=True)`, `tenant_ctx` fixture, `User.objects.create_user(..., role="student")`, `APIClient(HTTP_HOST="shared-test.localhost")`. Run inside the django container: `make test` or `docker compose exec django pytest <path> -v`.
- Never commit secrets. Pre-commit must pass. Commit after each task (the user has approved commits for this work).

---

## File structure

**Backend (`backend/apps/notifications/`)**
- `models.py` — add `Announcement`, `AnnouncementRecipient` (modify).
- `audience.py` — NEW: `resolve_audience(filters) -> QuerySet[User]`, `audience_counts(filters) -> dict`.
- `payloads.py` — add `announcement_payload(...)`, `strip_to_text(html)` (modify); remove `broadcast_payload`.
- `tasks.py` — add `fanout_announcement`, `dispatch_due_announcements`; remove `fanout_broadcast` (modify).
- `services.py` — add `send_announcement_to_recipients(announcement)` (modify).
- `serializers.py` — add announcement serializers (modify).
- `views.py` — student feed views; remove old `broadcast` view (modify).
- `admin_views.py` — NEW: coach announcement views.
- `urls.py` — student feed routes (modify).
- `admin_urls.py` — coach announcement routes; remove broadcast route (modify).
- `migrations/0002_announcements.py` — NEW.
- `tests/test_audience.py`, `tests/test_announcement_tasks.py`, `tests/test_admin_announcements.py`, `tests/test_feed.py` — NEW.

**Config**
- `backend/config/celery.py` — add `dispatch-due-announcements` beat entry (modify).

**Frontend (`frontend-customer/src/`)**
- `lib/announcements.ts` — NEW: types + API helpers.
- `app/admin/notifications/page.tsx` — rebuild compose + history (modify).
- `app/admin/notifications/[id]/page.tsx` — NEW: receipt view.
- `components/admin/announcement-compose.tsx` — NEW.
- `components/admin/announcement-history.tsx` — NEW.
- `components/shared/announcement-bell.tsx` — NEW: student bell + feed panel.
- `components/shared/mobile-header.tsx` — mount the bell (modify).

---

## Task 1: Announcement + AnnouncementRecipient models

**Files:**
- Modify: `backend/apps/notifications/models.py`
- Create: `backend/apps/notifications/migrations/0002_announcements.py` (via makemigrations)
- Test: `backend/apps/notifications/tests/test_models.py` (append)

**Interfaces:**
- Produces:
  - `Announcement(title, body, link, filters_json, status, scheduled_at, sent_at, created_by, created_at, recipient_count, push_sent_count)` with `status` ∈ `{"scheduled","sent"}`, `related_name="recipients"`.
  - `AnnouncementRecipient(announcement, user, push_status, read_at)` with `push_status` ∈ `{"none","sent","failed","expired"}`, `unique_together=(announcement, user)`.

- [ ] **Step 1: Write the failing test** — append to `backend/apps/notifications/tests/test_models.py`:

```python
from django.utils import timezone

from apps.notifications.models import Announcement, AnnouncementRecipient


def test_announcement_defaults(tenant_ctx):
    from apps.accounts.models import User

    coach = User.objects.create_user(email="c@m.com", name="C", password="x", role="owner")
    a = Announcement.objects.create(title="Hi", body="<p>Hi</p>", created_by=coach)
    assert a.status == "sent"
    assert a.scheduled_at is None
    assert a.recipient_count == 0 and a.push_sent_count == 0


def test_recipient_unique_per_announcement(tenant_ctx):
    from apps.accounts.models import User

    coach = User.objects.create_user(email="c2@m.com", name="C", password="x", role="owner")
    stu = User.objects.create_user(email="s2@m.com", name="S", password="x", role="student")
    a = Announcement.objects.create(title="Hi", body="x", created_by=coach)
    AnnouncementRecipient.objects.create(announcement=a, user=stu)
    with pytest.raises(Exception):
        AnnouncementRecipient.objects.create(announcement=a, user=stu)
```

(Ensure `import pytest` and `pytestmark = pytest.mark.django_db(transaction=True)` exist at the top of the file; they already do in the sibling test files — add if missing.)

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/notifications/tests/test_models.py -v`
Expected: FAIL with `ImportError: cannot import name 'Announcement'`.

- [ ] **Step 3: Add the models** — append to `backend/apps/notifications/models.py`:

```python
class Announcement(models.Model):
    STATUS_CHOICES = [("scheduled", "Scheduled"), ("sent", "Sent")]

    title = models.CharField(max_length=200)
    body = models.TextField(blank=True, default="")  # sanitized HTML
    link = models.CharField(max_length=500, blank=True, default="")
    filters_json = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="sent")
    scheduled_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    recipient_count = models.PositiveIntegerField(default=0)
    push_sent_count = models.PositiveIntegerField(default=0)

    class Meta:
        app_label = "notifications"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Announcement<{self.pk}:{self.title[:32]}>"


class AnnouncementRecipient(models.Model):
    PUSH_CHOICES = [
        ("none", "None"),
        ("sent", "Sent"),
        ("failed", "Failed"),
        ("expired", "Expired"),
    ]

    announcement = models.ForeignKey(
        Announcement, on_delete=models.CASCADE, related_name="recipients"
    )
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    push_status = models.CharField(max_length=10, choices=PUSH_CHOICES, default="none")
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "notifications"
        unique_together = ("announcement", "user")
```

- [ ] **Step 4: Generate the migration**

Run: `docker compose exec django python manage.py makemigrations notifications`
Expected: creates `migrations/0002_announcements.py`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/notifications/tests/test_models.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/notifications/models.py backend/apps/notifications/migrations/0002_announcements.py backend/apps/notifications/tests/test_models.py
git commit -m "feat(notifications): Announcement + AnnouncementRecipient models"
```

---

## Task 2: Payload + plaintext helpers

**Files:**
- Modify: `backend/apps/notifications/payloads.py`
- Test: `backend/apps/notifications/tests/test_payloads.py` (Create)

**Interfaces:**
- Produces:
  - `strip_to_text(html: str) -> str` — sanitized plaintext (no tags).
  - `announcement_payload(title: str, body_html: str, url: str = "/announcements") -> dict` — push payload `{title, body, icon, url, tag}` where `body` is plaintext, `tag="announcement"`.

- [ ] **Step 1: Write the failing test** — create `backend/apps/notifications/tests/test_payloads.py`:

```python
import pytest

from apps.notifications.payloads import announcement_payload, strip_to_text

pytestmark = pytest.mark.django_db(transaction=True)


def test_strip_to_text_removes_tags():
    assert strip_to_text("<p>Hello <b>world</b></p>") == "Hello world"


def test_strip_to_text_drops_scripts():
    assert "alert" not in strip_to_text("<script>alert(1)</script>hi")


def test_announcement_payload_uses_plaintext(tenant_ctx):
    p = announcement_payload("Title", "<p>Bold <b>news</b></p>", url="/x")
    assert p["body"] == "Bold news"
    assert p["url"] == "/x"
    assert p["tag"] == "announcement"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/notifications/tests/test_payloads.py -v`
Expected: FAIL with `ImportError`.

- [ ] **Step 3: Implement** — in `backend/apps/notifications/payloads.py`, remove `broadcast_payload` and add:

```python
def strip_to_text(html: str) -> str:
    """HTML → plaintext for push bodies (nh3 with no allowed tags)."""
    if not html:
        return ""
    import nh3

    return nh3.clean(html, tags=set(), attributes={}).strip()


def announcement_payload(title: str, body_html: str, url: str = "/announcements") -> dict:
    b = _brand()
    return {
        "title": title or b["brand"],
        "body": strip_to_text(body_html),
        "icon": b["icon"],
        "url": url or "/announcements",
        "tag": "announcement",
    }
```

Note: `nh3.clean` escapes/strips tags but leaves text; for `"<p>Hello <b>world</b></p>"` it yields `"Hello world"`. Verify in Step 4.

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/notifications/tests/test_payloads.py -v`
Expected: PASS. (If `nh3.clean(tags=set())` keeps entities, normalize via `html.unescape` — adjust `strip_to_text` to `return html_module.unescape(nh3.clean(...)).strip()` and re-run.)

- [ ] **Step 5: Commit**

```bash
git add backend/apps/notifications/payloads.py backend/apps/notifications/tests/test_payloads.py
git commit -m "feat(notifications): announcement push payload + html->text helper"
```

---

## Task 3: resolve_audience + counts

**Files:**
- Create: `backend/apps/notifications/audience.py`
- Test: `backend/apps/notifications/tests/test_audience.py`

**Interfaces:**
- Consumes: `apps.accounts.models.User`, `apps.core.access.ContentAccessService`.
- Produces:
  - `resolve_audience(filters: dict) -> QuerySet[User]` — students narrowed by `app_type`, `platform` (list), `push_enabled` (bool); `content_type`+`content_id` applied as post-filter (returns a `User` queryset re-filtered by id).
  - `audience_counts(filters: dict) -> dict` — `{"audience": int, "push_reachable": int}`.

- [ ] **Step 1: Write the failing test** — create `backend/apps/notifications/tests/test_audience.py`:

```python
import pytest

from apps.accounts.models import User
from apps.notifications.audience import audience_counts, resolve_audience
from apps.notifications.models import PushSubscription

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def students(tenant_ctx):
    pwa_ios = User.objects.create_user(
        email="a@m.com", name="A", password="x", role="student",
        last_display_mode="pwa", last_platform="ios",
    )
    web_android = User.objects.create_user(
        email="b@m.com", name="B", password="x", role="student",
        last_display_mode="browser", last_platform="android",
    )
    PushSubscription.objects.create(user=pwa_ios, endpoint="https://p/1", p256dh="p", auth="a")
    return pwa_ios, web_android


def test_empty_filters_returns_all_students(students):
    assert resolve_audience({}).count() == 2


def test_app_type_filter(students):
    pwa_ios, _ = students
    qs = resolve_audience({"app_type": "pwa"})
    assert list(qs.values_list("id", flat=True)) == [pwa_ios.id]


def test_platform_filter_multi(students):
    qs = resolve_audience({"platform": ["ios", "desktop"]})
    assert qs.count() == 1


def test_push_enabled_filter(students):
    pwa_ios, _ = students
    qs = resolve_audience({"push_enabled": True})
    assert list(qs.values_list("id", flat=True)) == [pwa_ios.id]


def test_counts(students):
    counts = audience_counts({})
    assert counts == {"audience": 2, "push_reachable": 1}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/notifications/tests/test_audience.py -v`
Expected: FAIL with `ImportError`.

- [ ] **Step 3: Implement** — create `backend/apps/notifications/audience.py`:

```python
from apps.accounts.models import User


def _load_content(content_type: str, content_id):
    """Resolve a (type, id) pair to a content instance, or None."""
    if not content_type or not content_id:
        return None
    if content_type == "course":
        from apps.courses.models import Course

        return Course.objects.filter(pk=content_id).first()
    if content_type == "bundle":
        from apps.billing.models import Bundle

        return Bundle.objects.filter(pk=content_id).first()
    return None


def resolve_audience(filters: dict):
    """Students matching the filter dict. See plan/spec for filter keys."""
    filters = filters or {}
    qs = User.objects.filter(role="student")

    app_type = filters.get("app_type")
    if app_type in ("pwa", "browser"):
        qs = qs.filter(last_display_mode=app_type)

    platform = filters.get("platform")
    if platform:
        if isinstance(platform, str):
            platform = [platform]
        qs = qs.filter(last_platform__in=platform)

    if filters.get("push_enabled"):
        qs = qs.filter(push_subscriptions__isnull=False).distinct()

    content = _load_content(filters.get("content_type"), filters.get("content_id"))
    if content is not None:
        from apps.core.access import ContentAccessService

        service = ContentAccessService()
        eligible = [u.pk for u in qs if service.check_access(u, content)]
        qs = User.objects.filter(pk__in=eligible)

    return qs


def audience_counts(filters: dict) -> dict:
    qs = resolve_audience(filters)
    audience = qs.count()
    push_reachable = qs.filter(push_subscriptions__isnull=False).distinct().count()
    return {"audience": audience, "push_reachable": push_reachable}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/notifications/tests/test_audience.py -v`
Expected: PASS. (If `Bundle` import path differs, fix `_load_content` to match `apps/billing/models.py`; verify with `grep -n "class Bundle" backend/apps/billing/models.py`.)

- [ ] **Step 5: Commit**

```bash
git add backend/apps/notifications/audience.py backend/apps/notifications/tests/test_audience.py
git commit -m "feat(notifications): resolve_audience filter helper + counts"
```

---

## Task 4: Send service — materialize recipients + push

**Files:**
- Modify: `backend/apps/notifications/services.py`
- Test: `backend/apps/notifications/tests/test_announcement_send.py` (Create)

**Interfaces:**
- Consumes: `resolve_audience`, `announcement_payload`, `send_to_subscription`, models from Task 1.
- Produces: `send_announcement_to_recipients(announcement) -> None` — materializes `AnnouncementRecipient` rows for `resolve_audience(announcement.filters_json)`, pushes to each recipient's subscriptions, writes `push_status`, sets `status="sent"`, `sent_at`, `recipient_count`, `push_sent_count`.

- [ ] **Step 1: Write the failing test** — create `backend/apps/notifications/tests/test_announcement_send.py`:

```python
from unittest.mock import patch

import pytest

from apps.accounts.models import User
from apps.notifications import services
from apps.notifications.models import Announcement, AnnouncementRecipient, PushSubscription

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(email="c@m.com", name="C", password="x", role="owner")


def _student(email, with_sub=True):
    u = User.objects.create_user(email=email, name="S", password="x", role="student")
    if with_sub:
        PushSubscription.objects.create(user=u, endpoint=f"https://p/{email}", p256dh="p", auth="a")
    return u


def test_send_materializes_and_pushes(coach):
    s_push = _student("p@m.com", with_sub=True)
    s_nopush = _student("n@m.com", with_sub=False)
    a = Announcement.objects.create(title="Hi", body="<p>Hi</p>", created_by=coach, filters_json={})

    with patch.object(services, "send_to_subscription", return_value=True) as mock:
        services.send_announcement_to_recipients(a)

    a.refresh_from_db()
    assert a.status == "sent" and a.sent_at is not None
    assert a.recipient_count == 2
    assert a.push_sent_count == 1
    assert mock.call_count == 1
    assert AnnouncementRecipient.objects.get(announcement=a, user=s_push).push_status == "sent"
    assert AnnouncementRecipient.objects.get(announcement=a, user=s_nopush).push_status == "none"


def test_send_marks_failed(coach):
    _student("p@m.com", with_sub=True)
    a = Announcement.objects.create(title="Hi", body="x", created_by=coach, filters_json={})
    with patch.object(services, "send_to_subscription", return_value=False):
        services.send_announcement_to_recipients(a)
    assert AnnouncementRecipient.objects.filter(announcement=a, push_status="failed").count() == 1
    a.refresh_from_db()
    assert a.push_sent_count == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/notifications/tests/test_announcement_send.py -v`
Expected: FAIL with `AttributeError: ... send_announcement_to_recipients`.

- [ ] **Step 3: Implement** — append to `backend/apps/notifications/services.py`:

```python
def send_announcement_to_recipients(announcement) -> None:
    """Materialize recipients for the announcement's audience snapshot, push to
    those with subscriptions, and finalize denormalized counts + status."""
    from django.utils import timezone

    from .audience import resolve_audience
    from .models import AnnouncementRecipient
    from .payloads import announcement_payload

    audience = list(resolve_audience(announcement.filters_json))
    AnnouncementRecipient.objects.bulk_create(
        [AnnouncementRecipient(announcement=announcement, user=u) for u in audience],
        ignore_conflicts=True,
    )

    payload = announcement_payload(
        announcement.title, announcement.body, url=announcement.link or "/announcements"
    )
    push_sent = 0
    for recipient in announcement.recipients.select_related("user"):
        subs = list(PushSubscription.objects.filter(user=recipient.user))
        if not subs:
            continue
        ok = any(send_to_subscription(sub, payload) for sub in subs)
        if ok:
            recipient.push_status = "sent"
            push_sent += 1
        else:
            # dead-subscription cleanup already happened inside send_to_subscription;
            # if the row is gone the push was to an expired endpoint.
            recipient.push_status = "failed" if PushSubscription.objects.filter(user=recipient.user).exists() else "expired"
        recipient.save(update_fields=["push_status"])

    announcement.recipient_count = len(audience)
    announcement.push_sent_count = push_sent
    announcement.status = "sent"
    announcement.sent_at = timezone.now()
    announcement.save(update_fields=["recipient_count", "push_sent_count", "status", "sent_at"])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/notifications/tests/test_announcement_send.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/notifications/services.py backend/apps/notifications/tests/test_announcement_send.py
git commit -m "feat(notifications): send_announcement_to_recipients (materialize + push)"
```

---

## Task 5: Fan-out + scheduled dispatch tasks

**Files:**
- Modify: `backend/apps/notifications/tasks.py`
- Modify: `backend/config/celery.py`
- Test: `backend/apps/notifications/tests/test_announcement_tasks.py` (Create)

**Interfaces:**
- Consumes: `send_announcement_to_recipients`, `Announcement`.
- Produces:
  - `fanout_announcement(announcement_id: int, schema_name: str)` — loads the announcement in tenant context and calls the send service.
  - `dispatch_due_announcements()` — across all tenants, enqueues `fanout_announcement` for each `status="scheduled", scheduled_at<=now`.

- [ ] **Step 1: Write the failing test** — create `backend/apps/notifications/tests/test_announcement_tasks.py`:

```python
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.db import connection
from django.utils import timezone

from apps.accounts.models import User
from apps.notifications.models import Announcement
from apps.notifications.tasks import dispatch_due_announcements, fanout_announcement

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(email="c@m.com", name="C", password="x", role="owner")


def test_fanout_calls_send(coach):
    a = Announcement.objects.create(title="Hi", body="x", created_by=coach, filters_json={})
    with patch("apps.notifications.tasks.send_announcement_to_recipients") as mock:
        fanout_announcement(a.id, connection.schema_name)
    assert mock.call_count == 1
    assert mock.call_args.args[0].id == a.id


def test_dispatch_enqueues_due_only(coach):
    due = Announcement.objects.create(
        title="Due", body="x", created_by=coach, status="scheduled",
        scheduled_at=timezone.now() - timedelta(minutes=1),
    )
    Announcement.objects.create(
        title="Future", body="x", created_by=coach, status="scheduled",
        scheduled_at=timezone.now() + timedelta(hours=1),
    )
    with patch("apps.notifications.tasks.fanout_announcement.delay") as mock:
        dispatch_due_announcements()
    called_ids = [c.args[0] for c in mock.call_args_list]
    assert due.id in called_ids and len(called_ids) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/notifications/tests/test_announcement_tasks.py -v`
Expected: FAIL with `ImportError: cannot import name 'fanout_announcement'`.

- [ ] **Step 3: Implement** — in `backend/apps/notifications/tasks.py` remove `fanout_broadcast` and add:

```python
@shared_task
def fanout_announcement(announcement_id: int, schema_name: str) -> None:
    from .models import Announcement
    from .services import send_announcement_to_recipients

    tenant_model = get_tenant_model()
    try:
        tenant = tenant_model.objects.get(schema_name=schema_name)
    except tenant_model.DoesNotExist:
        return
    with tenant_context(tenant):
        announcement = Announcement.objects.filter(pk=announcement_id).first()
        if announcement is None or announcement.status == "sent":
            return
        send_announcement_to_recipients(announcement)


@shared_task
def dispatch_due_announcements() -> None:
    from .models import Announcement

    now = timezone.now()
    for tenant in get_tenant_model().objects.exclude(schema_name="public"):
        with tenant_context(tenant):
            try:
                due = Announcement.objects.filter(status="scheduled", scheduled_at__lte=now)
                for announcement in due:
                    fanout_announcement.delay(announcement.id, tenant.schema_name)
            except Exception:  # noqa: BLE001  one tenant must not break the rest
                logger.exception("announcement dispatch failed for %s", tenant.schema_name)
```

Keep the existing `send_live_reminders`, `fanout_new_content`, and the `import` block (the `broadcast_payload` import, if any, is removed with `fanout_broadcast`).

- [ ] **Step 4: Wire the beat schedule** — in `backend/config/celery.py`, add to `beat_schedule`:

```python
    "dispatch-due-announcements": {
        "task": "apps.notifications.tasks.dispatch_due_announcements",
        "schedule": crontab(minute="*"),
    },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/notifications/tests/test_announcement_tasks.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/notifications/tasks.py backend/config/celery.py backend/apps/notifications/tests/test_announcement_tasks.py
git commit -m "feat(notifications): announcement fan-out + per-minute scheduled dispatch"
```

---

## Task 6: Serializers

**Files:**
- Modify: `backend/apps/notifications/serializers.py`
- Test: covered via the API tasks (8/9); no standalone test.

**Interfaces:**
- Produces:
  - `AnnouncementCreateSerializer` — fields `title` (required), `body`, `link`, `filters` (dict→stored as `filters_json`), `scheduled_at` (optional, must be future). Sanitizes `body` in `validate_body`.
  - `AnnouncementListSerializer` — `id, title, status, scheduled_at, created_at, recipient_count, push_sent_count, read_count`.
  - `AnnouncementDetailSerializer` — list fields + `body, link, filters, recipients[]` (`user_id, name, push_status, read_at`).
  - `FeedItemSerializer` — `id, title, body, link, created_at, read_at`.

- [ ] **Step 1: Implement** — append to `backend/apps/notifications/serializers.py`:

```python
from django.utils import timezone

from apps.tenant_config.defaults import sanitize_rich_text

from .models import Announcement, AnnouncementRecipient


class AnnouncementCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200)
    body = serializers.CharField(allow_blank=True, required=False, default="")
    link = serializers.CharField(max_length=500, allow_blank=True, required=False, default="")
    filters = serializers.DictField(required=False, default=dict)
    scheduled_at = serializers.DateTimeField(required=False, allow_null=True)

    def validate_body(self, value):
        return sanitize_rich_text(value)

    def validate_scheduled_at(self, value):
        if value and value <= timezone.now():
            return None  # past/now ⇒ treat as send-now
        return value


class _RecipientSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="user.name", read_only=True)
    user_id = serializers.IntegerField(source="user.id", read_only=True)

    class Meta:
        model = AnnouncementRecipient
        fields = ["user_id", "name", "push_status", "read_at"]


class AnnouncementListSerializer(serializers.ModelSerializer):
    read_count = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = [
            "id", "title", "status", "scheduled_at", "created_at",
            "recipient_count", "push_sent_count", "read_count",
        ]

    def get_read_count(self, obj):
        return obj.recipients.filter(read_at__isnull=False).count()


class AnnouncementDetailSerializer(AnnouncementListSerializer):
    recipients = _RecipientSerializer(many=True, read_only=True)
    filters = serializers.JSONField(source="filters_json", read_only=True)

    class Meta(AnnouncementListSerializer.Meta):
        fields = AnnouncementListSerializer.Meta.fields + ["body", "link", "filters", "recipients"]


class FeedItemSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="announcement.id", read_only=True)
    title = serializers.CharField(source="announcement.title", read_only=True)
    body = serializers.CharField(source="announcement.body", read_only=True)
    link = serializers.CharField(source="announcement.link", read_only=True)
    created_at = serializers.DateTimeField(source="announcement.created_at", read_only=True)

    class Meta:
        model = AnnouncementRecipient
        fields = ["id", "title", "body", "link", "created_at", "read_at"]
```

- [ ] **Step 2: Sanity import check**

Run: `docker compose exec django python -c "from apps.notifications import serializers"`
Expected: no error.

- [ ] **Step 3: Commit**

```bash
git add backend/apps/notifications/serializers.py
git commit -m "feat(notifications): announcement + feed serializers"
```

---

## Task 7: Coach announcement API

**Files:**
- Create: `backend/apps/notifications/admin_views.py`
- Modify: `backend/apps/notifications/admin_urls.py`
- Test: `backend/apps/notifications/tests/test_admin_announcements.py`

**Interfaces:**
- Consumes: serializers (Task 6), `audience_counts`, `fanout_announcement`, `Announcement`.
- Produces routes under `/api/v1/admin/notifications/`:
  - `POST announcements/preview/` → `{audience, push_reachable}`
  - `POST announcements/` → create + (enqueue now | schedule)
  - `GET announcements/` → list
  - `GET/PATCH/DELETE announcements/<int:pk>/`

- [ ] **Step 1: Write the failing test** — create `backend/apps/notifications/tests/test_admin_announcements.py`:

```python
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.notifications.models import Announcement

pytestmark = pytest.mark.django_db(transaction=True)
HOST = "shared-test.localhost"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(email="c@m.com", name="C", password="x", role="owner")


def client(user=None):
    c = APIClient(HTTP_HOST=HOST)
    if user:
        c.force_authenticate(user=user)
    return c


def test_preview_counts(coach):
    User.objects.create_user(email="s@m.com", name="S", password="x", role="student")
    res = client(coach).post("/api/v1/admin/notifications/announcements/preview/", {"filters": {}}, format="json")
    assert res.status_code == 200
    assert res.data["audience"] == 1


def test_create_send_now_enqueues(coach):
    with patch("apps.notifications.admin_views.fanout_announcement.delay") as mock:
        res = client(coach).post(
            "/api/v1/admin/notifications/announcements/",
            {"title": "Hi", "body": "<p>x</p>", "filters": {}},
            format="json",
        )
    assert res.status_code == 201
    assert mock.call_count == 1


def test_create_scheduled_does_not_enqueue(coach):
    future = (timezone.now() + timedelta(hours=2)).isoformat()
    with patch("apps.notifications.admin_views.fanout_announcement.delay") as mock:
        res = client(coach).post(
            "/api/v1/admin/notifications/announcements/",
            {"title": "Later", "body": "x", "filters": {}, "scheduled_at": future},
            format="json",
        )
    assert res.status_code == 201
    assert mock.call_count == 0
    assert Announcement.objects.get().status == "scheduled"


def test_patch_blocked_once_sent(coach):
    a = Announcement.objects.create(title="Hi", body="x", created_by=coach, status="sent")
    res = client(coach).patch(f"/api/v1/admin/notifications/announcements/{a.id}/", {"title": "New"}, format="json")
    assert res.status_code == 409


def test_non_coach_forbidden(tenant_ctx):
    stu = User.objects.create_user(email="s@m.com", name="S", password="x", role="student")
    res = client(stu).get("/api/v1/admin/notifications/announcements/")
    assert res.status_code == 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/notifications/tests/test_admin_announcements.py -v`
Expected: FAIL (404/import errors — routes not defined).

- [ ] **Step 3: Implement views** — create `backend/apps/notifications/admin_views.py`:

```python
from django.db import connection
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner

from .audience import audience_counts
from .models import Announcement
from .serializers import (
    AnnouncementCreateSerializer,
    AnnouncementDetailSerializer,
    AnnouncementListSerializer,
)
from .tasks import fanout_announcement


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def announcement_preview(request):
    return Response(audience_counts(request.data.get("filters") or {}))


@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def announcement_collection(request):
    if request.method == "GET":
        qs = Announcement.objects.all()
        return Response(AnnouncementListSerializer(qs, many=True).data)

    serializer = AnnouncementCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    scheduled_at = data.get("scheduled_at")
    announcement = Announcement.objects.create(
        title=data["title"],
        body=data.get("body", ""),
        link=data.get("link", ""),
        filters_json=data.get("filters", {}),
        scheduled_at=scheduled_at,
        status="scheduled",  # pending until fanout delivers, then -> "sent"
        created_by=request.user,
    )
    # Send-now (no future scheduled_at) is enqueued immediately; the fan-out
    # flips status to "sent". Future-scheduled rows stay "scheduled" and the
    # per-minute beat dispatcher picks them up when due. NOTE: status must NOT
    # be "sent" at creation — fanout_announcement guards `if status=="sent"`.
    if not scheduled_at:
        fanout_announcement.delay(announcement.id, connection.schema_name)
    return Response(AnnouncementDetailSerializer(announcement).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsCoachOrOwner])
def announcement_detail(request, pk):
    announcement = Announcement.objects.filter(pk=pk).first()
    if announcement is None:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(AnnouncementDetailSerializer(announcement).data)

    if request.method == "DELETE":
        announcement.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # PATCH — only while scheduled
    if announcement.status == "sent":
        return Response({"detail": "already sent"}, status=status.HTTP_409_CONFLICT)
    serializer = AnnouncementCreateSerializer(data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    for field, model_field in (("title", "title"), ("body", "body"), ("link", "link")):
        if field in serializer.validated_data:
            setattr(announcement, model_field, serializer.validated_data[field])
    if "filters" in serializer.validated_data:
        announcement.filters_json = serializer.validated_data["filters"]
    send_now = False
    if "scheduled_at" in serializer.validated_data:
        sched = serializer.validated_data["scheduled_at"]
        announcement.scheduled_at = sched
        # status stays "scheduled" (pending). If the schedule was cleared, this
        # is now a send-now: enqueue fanout, which flips status to "sent".
        # NEVER set status="sent" here directly (it would lock + never deliver).
        send_now = not sched
    announcement.save()
    if send_now:
        fanout_announcement.delay(announcement.id, connection.schema_name)
    return Response(AnnouncementDetailSerializer(announcement).data)
```

- [ ] **Step 4: Wire urls** — replace `backend/apps/notifications/admin_urls.py` contents:

```python
from django.urls import path

from . import admin_views

urlpatterns = [
    path("notifications/announcements/preview/", admin_views.announcement_preview, name="announcement-preview"),
    path("notifications/announcements/", admin_views.announcement_collection, name="announcement-collection"),
    path("notifications/announcements/<int:pk>/", admin_views.announcement_detail, name="announcement-detail"),
]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/notifications/tests/test_admin_announcements.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/notifications/admin_views.py backend/apps/notifications/admin_urls.py backend/apps/notifications/tests/test_admin_announcements.py
git commit -m "feat(notifications): coach announcement API (preview/create/list/detail/patch/delete)"
```

---

## Task 8: Student feed API + remove old broadcast

**Files:**
- Modify: `backend/apps/notifications/views.py` (add feed views, remove `broadcast`)
- Modify: `backend/apps/notifications/urls.py`
- Test: `backend/apps/notifications/tests/test_feed.py`

**Interfaces:**
- Produces routes under `/api/v1/notifications/`:
  - `GET feed/` → `{items: [...], unread_count: int}`
  - `POST feed/<int:pk>/read/` → `{unread_count: int}` (pk = announcement id)

- [ ] **Step 1: Write the failing test** — create `backend/apps/notifications/tests/test_feed.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.notifications.models import Announcement, AnnouncementRecipient

pytestmark = pytest.mark.django_db(transaction=True)
HOST = "shared-test.localhost"


@pytest.fixture()
def setup(tenant_ctx):
    coach = User.objects.create_user(email="c@m.com", name="C", password="x", role="owner")
    s1 = User.objects.create_user(email="s1@m.com", name="S1", password="x", role="student")
    s2 = User.objects.create_user(email="s2@m.com", name="S2", password="x", role="student")
    a = Announcement.objects.create(title="Hi", body="<p>x</p>", created_by=coach, status="sent")
    AnnouncementRecipient.objects.create(announcement=a, user=s1)
    return a, s1, s2


def client(user):
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=user)
    return c


def test_feed_scoped_to_user(setup):
    a, s1, s2 = setup
    res1 = client(s1).get("/api/v1/notifications/feed/")
    assert res1.data["unread_count"] == 1 and len(res1.data["items"]) == 1
    res2 = client(s2).get("/api/v1/notifications/feed/")
    assert res2.data["unread_count"] == 0 and res2.data["items"] == []


def test_mark_read_idempotent(setup):
    a, s1, _ = setup
    first = client(s1).post(f"/api/v1/notifications/feed/{a.id}/read/")
    assert first.data["unread_count"] == 0
    rec = AnnouncementRecipient.objects.get(announcement=a, user=s1)
    read_at = rec.read_at
    second = client(s1).post(f"/api/v1/notifications/feed/{a.id}/read/")
    assert second.data["unread_count"] == 0
    rec.refresh_from_db()
    assert rec.read_at == read_at  # unchanged
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/notifications/tests/test_feed.py -v`
Expected: FAIL (404).

- [ ] **Step 3: Implement** — in `backend/apps/notifications/views.py` remove the `broadcast` view (and its `fanout_broadcast`/`connection` imports if now unused) and add:

```python
from django.utils import timezone

from .models import AnnouncementRecipient
from .serializers import FeedItemSerializer


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def feed(request):
    rows = (
        AnnouncementRecipient.objects.filter(user=request.user)
        .select_related("announcement")
        .order_by("-announcement__created_at")
    )
    unread = rows.filter(read_at__isnull=True).count()
    return Response({"items": FeedItemSerializer(rows, many=True).data, "unread_count": unread})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def feed_read(request, pk):
    AnnouncementRecipient.objects.filter(
        announcement_id=pk, user=request.user, read_at__isnull=True
    ).update(read_at=timezone.now())
    unread = AnnouncementRecipient.objects.filter(user=request.user, read_at__isnull=True).count()
    return Response({"unread_count": unread})
```

- [ ] **Step 4: Wire urls** — in `backend/apps/notifications/urls.py` add (and remove nothing else; vapid/subscribe/unsubscribe stay):

```python
    path("feed/", views.feed, name="announcement-feed"),
    path("feed/<int:pk>/read/", views.feed_read, name="announcement-feed-read"),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/notifications/tests/test_feed.py -v`
Expected: PASS.

- [ ] **Step 6: Full backend suite + commit**

Run: `docker compose exec django pytest apps/notifications -v`
Expected: PASS (all notifications tests, incl. existing ones still green).

```bash
git add backend/apps/notifications/views.py backend/apps/notifications/urls.py backend/apps/notifications/tests/test_feed.py
git commit -m "feat(notifications): student announcement feed + read receipt; drop old broadcast"
```

---

## Task 9: Frontend API client + types (customer app)

**Files:**
- Create: `frontend-customer/src/lib/announcements.ts`

**Interfaces:**
- Consumes: `clientFetch<T>(path, options?)` from `@/lib/api-client`.
- Produces: types `AnnouncementFilters`, `AnnouncementListItem`, `AnnouncementDetail`, `FeedItem`; helpers `previewAudience`, `createAnnouncement`, `listAnnouncements`, `getAnnouncement`, `patchAnnouncement`, `deleteAnnouncement`, `getFeed`, `markRead`.

- [ ] **Step 1: Implement** — create `frontend-customer/src/lib/announcements.ts`:

```typescript
import { clientFetch } from "@/lib/api-client";

export interface AnnouncementFilters {
  app_type?: "pwa" | "browser";
  platform?: ("ios" | "android" | "desktop")[];
  push_enabled?: boolean;
  content_type?: "course" | "bundle";
  content_id?: number;
}

export interface AnnouncementListItem {
  id: number;
  title: string;
  status: "scheduled" | "sent";
  scheduled_at: string | null;
  created_at: string;
  recipient_count: number;
  push_sent_count: number;
  read_count: number;
}

export interface Recipient {
  user_id: number;
  name: string;
  push_status: "none" | "sent" | "failed" | "expired";
  read_at: string | null;
}

export interface AnnouncementDetail extends AnnouncementListItem {
  body: string;
  link: string;
  filters: AnnouncementFilters;
  recipients: Recipient[];
}

export interface FeedItem {
  id: number;
  title: string;
  body: string;
  link: string;
  created_at: string;
  read_at: string | null;
}

const BASE = "/api/v1/admin/notifications/announcements";

export const previewAudience = (filters: AnnouncementFilters) =>
  clientFetch<{ audience: number; push_reachable: number }>(`${BASE}/preview/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters }),
  });

export const createAnnouncement = (payload: {
  title: string;
  body: string;
  link?: string;
  filters: AnnouncementFilters;
  scheduled_at?: string | null;
}) =>
  clientFetch<AnnouncementDetail>(`${BASE}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const listAnnouncements = () => clientFetch<AnnouncementListItem[]>(`${BASE}/`);
export const getAnnouncement = (id: number) => clientFetch<AnnouncementDetail>(`${BASE}/${id}/`);
export const patchAnnouncement = (id: number, payload: Partial<{ title: string; body: string; link: string; filters: AnnouncementFilters; scheduled_at: string | null }>) =>
  clientFetch<AnnouncementDetail>(`${BASE}/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
export const deleteAnnouncement = (id: number) =>
  clientFetch<void>(`${BASE}/${id}/`, { method: "DELETE" });

export const getFeed = () =>
  clientFetch<{ items: FeedItem[]; unread_count: number }>("/api/v1/notifications/feed/");
export const markRead = (id: number) =>
  clientFetch<{ unread_count: number }>(`/api/v1/notifications/feed/${id}/read/`, { method: "POST" });
```

- [ ] **Step 2: Typecheck**

Run: `docker compose exec nextjs-customer npx tsc --noEmit` (or `cd frontend-customer && npx tsc --noEmit` on host)
Expected: no errors in `announcements.ts`.

- [ ] **Step 3: Commit**

```bash
git add frontend-customer/src/lib/announcements.ts
git commit -m "feat(customer): announcements API client + types"
```

---

## Task 10: Coach compose component

**Files:**
- Create: `frontend-customer/src/components/admin/announcement-compose.tsx`

**Interfaces:**
- Consumes: `previewAudience`, `createAnnouncement`, `AnnouncementFilters` (Task 9); `useRichEditor`/`RichEditorProvider` from `@/components/owner/rich-editor`; `toast` from `sonner`.
- Produces: default-exported `<AnnouncementCompose onSent={() => void} />`.

- [ ] **Step 1: Implement** — create `frontend-customer/src/components/admin/announcement-compose.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

import { toast } from "sonner";

import { useRichEditor } from "@/components/owner/rich-editor";
import { AnnouncementFilters, createAnnouncement, previewAudience } from "@/lib/announcements";

const PLATFORMS: ("ios" | "android" | "desktop")[] = ["ios", "android", "desktop"];

export default function AnnouncementCompose({ onSent }: { onSent: () => void }) {
  const editor = useRichEditor();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [filters, setFilters] = useState<AnnouncementFilters>({});
  const [scheduledAt, setScheduledAt] = useState("");
  const [reach, setReach] = useState<{ audience: number; push_reachable: number } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    previewAudience(filters)
      .then((r) => !cancelled && setReach(r))
      .catch(() => !cancelled && setReach(null));
    return () => {
      cancelled = true;
    };
  }, [filters]);

  const togglePlatform = (p: "ios" | "android" | "desktop") =>
    setFilters((f) => {
      const set = new Set(f.platform ?? []);
      set.has(p) ? set.delete(p) : set.add(p);
      return { ...f, platform: set.size ? Array.from(set) : undefined };
    });

  const send = async () => {
    if (!title.trim()) return;
    setSending(true);
    try {
      await createAnnouncement({
        title: title.trim(),
        body,
        link: link.trim() || undefined,
        filters,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      });
      toast.success(scheduledAt ? "Announcement scheduled" : "Announcement sent");
      setTitle("");
      setBody("");
      setLink("");
      setFilters({});
      setScheduledAt("");
      onSent();
    } catch {
      toast.error("Failed to send announcement");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="w-full rounded-lg border border-border bg-background p-2 text-sm"
      />

      <button
        type="button"
        onClick={() => editor?.openRichEditor({ value: body, title: "Announcement body", onSave: setBody })}
        className="w-full rounded-lg border border-dashed border-border bg-background p-3 text-left text-sm text-muted-foreground"
      >
        {body ? <span dangerouslySetInnerHTML={{ __html: body }} /> : "Write announcement body…"}
      </button>

      <input
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="Link (optional, e.g. /courses/foo)"
        className="w-full rounded-lg border border-border bg-background p-2 text-sm"
      />

      <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
        <div className="font-medium">Audience filters</div>
        <div className="flex flex-wrap gap-2">
          {(["pwa", "browser"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilters((f) => ({ ...f, app_type: f.app_type === t ? undefined : t }))}
              className={`rounded-full border px-3 py-1 ${filters.app_type === t ? "bg-primary text-primary-foreground" : "border-border"}`}
            >
              {t === "pwa" ? "📱 PWA" : "🌐 Browser"}
            </button>
          ))}
          {PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePlatform(p)}
              className={`rounded-full border px-3 py-1 ${filters.platform?.includes(p) ? "bg-primary text-primary-foreground" : "border-border"}`}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFilters((f) => ({ ...f, push_enabled: f.push_enabled ? undefined : true }))}
            className={`rounded-full border px-3 py-1 ${filters.push_enabled ? "bg-primary text-primary-foreground" : "border-border"}`}
          >
            Push-enabled only
          </button>
        </div>
        {reach && (
          <div className="text-muted-foreground">
            Reaches <strong>{reach.push_reachable}</strong> via push · <strong>{reach.audience}</strong> in feed
          </div>
        )}
      </div>

      <label className="block text-sm">
        Schedule (optional)
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="ml-2 rounded-lg border border-border bg-background p-1"
        />
      </label>

      <button
        onClick={send}
        disabled={sending || !title.trim()}
        className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
      >
        {scheduledAt ? "Schedule" : "Send now"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend-customer && npx tsc --noEmit`
Expected: no new errors. (If `useRichEditor`'s `openRichEditor` signature differs, align the call to `components/owner/rich-editor.tsx` — `openRichEditor({ value, title?, onSave })`.)

- [ ] **Step 3: Commit**

```bash
git add frontend-customer/src/components/admin/announcement-compose.tsx
git commit -m "feat(customer): announcement compose (rich text + filters + reach preview + schedule)"
```

---

## Task 11: Coach history list + page wiring

**Files:**
- Create: `frontend-customer/src/components/admin/announcement-history.tsx`
- Modify: `frontend-customer/src/app/admin/notifications/page.tsx`

**Interfaces:**
- Consumes: `listAnnouncements`, `deleteAnnouncement`, `AnnouncementListItem`; `AnnouncementCompose`; the `RichEditorProvider` (must wrap the page so `useRichEditor` resolves); `Link` from `next/link`.
- Produces: `<AnnouncementHistory refreshKey={number} />`; the page renders the provider + compose + history.

- [ ] **Step 1: Implement history** — create `frontend-customer/src/components/admin/announcement-history.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { toast } from "sonner";

import { AnnouncementListItem, deleteAnnouncement, listAnnouncements } from "@/lib/announcements";

export default function AnnouncementHistory({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<AnnouncementListItem[]>([]);

  const load = () => listAnnouncements().then(setItems).catch(() => setItems([]));
  useEffect(() => {
    load();
  }, [refreshKey]);

  const remove = async (id: number) => {
    if (!confirm("Delete this announcement?")) return;
    try {
      await deleteAnnouncement(id);
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  if (items.length === 0) return <p className="p-4 text-sm text-muted-foreground">No announcements yet.</p>;

  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      {items.map((a) => (
        <div key={a.id} className="flex items-center gap-3 p-3 text-sm">
          <div className="flex-1">
            <Link href={`/admin/notifications/${a.id}`} className="font-medium hover:underline">
              {a.title}
            </Link>
            <div className="text-xs text-muted-foreground">
              {a.status === "scheduled" ? (
                <span>⏰ Scheduled · {a.scheduled_at ? new Date(a.scheduled_at).toLocaleString() : ""}</span>
              ) : (
                <span>
                  {a.recipient_count} recipients · {a.push_sent_count} push · {a.read_count} read
                </span>
              )}
            </div>
          </div>
          <button onClick={() => remove(a.id)} className="rounded-md px-2 py-1 text-muted-foreground hover:text-destructive">
            {a.status === "scheduled" ? "Cancel" : "Delete"}
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Rebuild the page** — replace `frontend-customer/src/app/admin/notifications/page.tsx`:

```tsx
"use client";

import { useState } from "react";

import AnnouncementCompose from "@/components/admin/announcement-compose";
import AnnouncementHistory from "@/components/admin/announcement-history";
import { RichEditorProvider } from "@/components/owner/rich-editor";

export default function NotificationsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <RichEditorProvider>
      <div className="mx-auto max-w-2xl space-y-6 p-4">
        <h1 className="text-lg font-semibold">Announcements</h1>
        <AnnouncementCompose onSent={() => setRefreshKey((k) => k + 1)} />
        <AnnouncementHistory refreshKey={refreshKey} />
      </div>
    </RichEditorProvider>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend-customer && npx tsc --noEmit`
Expected: no new errors. (Confirm `RichEditorProvider` is exported from `components/owner/rich-editor.tsx`.)

- [ ] **Step 4: Commit**

```bash
git add frontend-customer/src/components/admin/announcement-history.tsx frontend-customer/src/app/admin/notifications/page.tsx
git commit -m "feat(customer): announcement history list + rebuilt /admin/notifications"
```

---

## Task 12: Coach receipt view

**Files:**
- Create: `frontend-customer/src/app/admin/notifications/[id]/page.tsx`

**Interfaces:**
- Consumes: `getAnnouncement`, `AnnouncementDetail`, `Recipient`; `useParams` from `next/navigation`.

- [ ] **Step 1: Implement** — create `frontend-customer/src/app/admin/notifications/[id]/page.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";

import { useParams } from "next/navigation";

import { AnnouncementDetail, getAnnouncement } from "@/lib/announcements";

const STATUS_FILTERS = ["all", "sent", "failed", "expired", "none"] as const;

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AnnouncementDetail | null>(null);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");

  useEffect(() => {
    getAnnouncement(Number(id)).then(setData).catch(() => setData(null));
  }, [id]);

  const rows = useMemo(
    () => (data?.recipients ?? []).filter((r) => statusFilter === "all" || r.push_status === statusFilter),
    [data, statusFilter],
  );

  if (!data) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;

  const readCount = data.recipients.filter((r) => r.read_at).length;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-lg font-semibold">{data.title}</h1>
      <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: data.body }} />

      <div className="grid grid-cols-4 gap-2 text-center text-sm">
        <Stat label="Recipients" value={data.recipient_count} />
        <Stat label="Push sent" value={data.push_sent_count} />
        <Stat label="Read" value={readCount} />
        <Stat label="Failed" value={data.recipients.filter((r) => r.push_status === "failed").length} />
      </div>

      <div className="flex gap-2 text-xs">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full border px-2 py-1 ${statusFilter === s ? "bg-primary text-primary-foreground" : "border-border"}`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="divide-y divide-border rounded-xl border border-border text-sm">
        {rows.map((r) => (
          <div key={r.user_id} className="flex items-center justify-between p-2">
            <span>{r.name}</span>
            <span className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{r.push_status}</span>
              <span>{r.read_at ? "✓ read" : "— unread"}</span>
            </span>
          </div>
        ))}
        {rows.length === 0 && <div className="p-3 text-muted-foreground">No recipients.</div>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-2">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend-customer && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend-customer/src/app/admin/notifications/[id]/page.tsx
git commit -m "feat(customer): announcement receipt view (per-recipient push + read status)"
```

---

## Task 13: Student bell + feed panel

**Files:**
- Create: `frontend-customer/src/components/shared/announcement-bell.tsx`
- Modify: `frontend-customer/src/components/shared/public-header.tsx` (the student/public header used by the `(student)` + `(public)` layouts — NOT `mobile-header.tsx`)

**Interfaces:**
- Consumes: `getFeed`, `markRead`, `FeedItem`; `Bell` from `lucide-react`.
- Produces: default-exported `<AnnouncementBell />`, mounted in `PublicHeader`'s authenticated-user cluster (only rendered when `user` is present, since the feed requires auth).

- [ ] **Step 1: Implement the bell** — create `frontend-customer/src/components/shared/announcement-bell.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

import { Bell } from "lucide-react";

import { FeedItem, getFeed, markRead } from "@/lib/announcements";

export default function AnnouncementBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [unread, setUnread] = useState(0);

  const load = () =>
    getFeed()
      .then((r) => {
        setItems(r.items);
        setUnread(r.unread_count);
      })
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const openItem = async (item: FeedItem) => {
    if (!item.read_at) {
      try {
        const { unread_count } = await markRead(item.id);
        setUnread(unread_count);
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read_at: new Date().toISOString() } : i)));
      } catch {
        /* ignore */
      }
    }
    if (item.link) window.location.href = item.link;
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-md p-2" aria-label="Announcements">
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-auto rounded-xl border border-border bg-card p-2 shadow-lg">
          {items.length === 0 && <p className="p-3 text-sm text-muted-foreground">No announcements.</p>}
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => openItem(item)}
              className={`block w-full rounded-lg p-2 text-left text-sm ${item.read_at ? "" : "bg-muted/50"}`}
            >
              <div className="font-medium">{item.title}</div>
              <div className="prose prose-xs line-clamp-2 max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: item.body }} />
              <div className="text-[10px] text-muted-foreground">{new Date(item.created_at).toLocaleString()}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mount in the header** — in `frontend-customer/src/components/shared/mobile-header.tsx`, import and render `<AnnouncementBell />` in the header's action area (next to existing icons). Add:

```tsx
import AnnouncementBell from "@/components/shared/announcement-bell";
```

and place `<AnnouncementBell />` within the right-hand controls cluster (match the existing JSX structure — find the element holding the menu/avatar buttons and add the bell as a sibling).

- [ ] **Step 3: Typecheck**

Run: `cd frontend-customer && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend-customer/src/components/shared/announcement-bell.tsx frontend-customer/src/components/shared/mobile-header.tsx
git commit -m "feat(customer): student announcement bell + feed (read receipts)"
```

---

## Task 14: Integration verification

**Files:** none (verification only).

- [ ] **Step 1: Full backend suite**

Run: `make test` (or `docker compose exec django pytest -q`)
Expected: all tests pass, including the existing notifications suite.

- [ ] **Step 2: Lint**

Run: `make lint`
Expected: pre-commit passes with zero errors/warnings.

- [ ] **Step 3: Migrate + build**

Run: `make migrate` then `docker compose exec nextjs-customer npm run build` (or `make dev` and confirm both frontends build).
Expected: migration applies; customer build succeeds.

- [ ] **Step 4: Manual smoke (dev)**

With `make dev` running and a tenant + student:
1. As coach, open `/admin/notifications`, write a rich-text body, set filters, confirm the "Reaches X via push · Y in feed" count updates.
2. Send now → confirm it appears in history with recipient/push/read counts; open the receipt view.
3. Schedule one ~2 min out → confirm it shows as ⏰ Scheduled and can be canceled; if left, confirm `dispatch_due_announcements` fires it (watch `make logs` celery-beat/worker) and status flips to sent.
4. As student (installed PWA for real push; any browser for the feed), confirm the bell shows the unread badge, opening an item clears it, and the receipt view's read count increments.

- [ ] **Step 5: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "chore(notifications): announcements lab verification fixups"
```

---

## Self-review notes (addressed)

- **Spec coverage:** filters (T3), snapshot send (T4), scheduling + dispatch (T5), rich text sanitize on write (T6) + push plaintext (T2), preview (T7), receipts (T7/T12), feed + read (T8/T13), old-broadcast removal (T8), beat wiring (T5). All spec sections map to a task.
- **Type consistency:** `push_status` values `none/sent/failed/expired` and `status` values `scheduled/sent` are identical across models, serializers, API, and TS types. `filters` (API/TS) ↔ `filters_json` (model) bridged in serializers.
- **Known verification points flagged inline:** `nh3` plaintext entity handling (T2 S4), `Bundle` import path (T3 S4), `useRichEditor`/`RichEditorProvider` export + signature (T10/T11), header JSX insertion point (T13 S2).
