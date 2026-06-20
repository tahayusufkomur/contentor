# Student PWA — Phase 3: Web Push — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let students opt in (post-install) to push notifications and receive them for three events — live-class reminder, new content published, and coach broadcast — with each notification branded as the coach's app.

**Architecture:** A new `apps.notifications` tenant app stores per-tenant `PushSubscription` rows (FK to the shared user, exactly like billing) and sends via `pywebpush` using one platform-wide VAPID keypair (branding rides in the payload). Three Celery triggers fan out to a tenant's opted-in subscribers: a beat task for live reminders (deduped by a `LiveReminderLog`), a `post_save` signal for course publish, and a coach-only broadcast endpoint. The frontend fetches the VAPID key, subscribes via the existing Phase 2 service worker, and the SW shows notifications.

**Tech Stack:** Django 5.1 + DRF, django-tenants, Celery (+ beat), `pywebpush`/`py-vapid`, Next.js 14 + Serwist SW, `clientFetch` (`src/lib/api-client.ts`).

**Spec:** `docs/superpowers/specs/2026-06-20-student-pwa-design.md` (Phase 3 section). **Depends on:** Phase 2 (the `src/app/sw.ts` service worker).

## Global Constraints

- **Single platform VAPID keypair** in env: `VAPID_PUBLIC_KEY` (base64url, browser), `VAPID_PRIVATE_KEY` (PEM contents), `VAPID_SUBJECT` (e.g. `mailto:admin@contentor.app`). Never commit real keys; only `.env*.example` placeholders.
- **`apps.notifications` is a TENANT_APP** (per-tenant `PushSubscription`). FK the user via `settings.AUTH_USER_MODEL` (same pattern as `apps/billing/models/core.py`).
- **Audience (v1):** all of a tenant's opted-in `PushSubscription` rows. Finer access-scoped targeting (only enrolled/paying) is a documented future refinement — do NOT build it here.
- **No duplication of Stream.io:** chat/call notifications stay with Stream. These triggers are app-level only.
- **Public endpoint rule:** `vapid-key` MUST set `@authentication_classes([])` + `AllowAny` (per CLAUDE.md — `AllowAny` alone is insufficient). `subscribe`/`unsubscribe` use the default `TenantJWTAuthentication`.
- **iOS:** push only works in an installed (standalone) PWA on iOS ≥ 16.4 — the opt-in must be gated to standalone + feature-detected support.
- **Tenant tasks** run via `tenant_context(tenant)` iterating `get_tenant_model().objects.exclude(schema_name="public")` (mirror `apps/email_campaigns/tasks.py`).
- **Tests:** backend uses pytest (`make test`); follow existing tenant test fixtures (see `apps/billing/tests/`). Frontend push is verified manually on real devices.
- **i18n:** new strings in BOTH `messages/en.json` and `messages/tr.json`.
- **Pre-commit** clean (`make lint`); **commit per task** (user-approved).

---

### Task 1: Scaffold `apps.notifications` with models

**Files:**
- Create: `backend/apps/notifications/__init__.py`, `apps.py`, `models.py`
- Create: `backend/apps/notifications/tests/__init__.py`, `tests/test_models.py`
- Modify: `backend/config/settings/base.py` (add to TENANT_APPS)

**Interfaces:**
- Produces: `PushSubscription(user, endpoint[unique], p256dh, auth, user_agent, created_at)` and `LiveReminderLog(key[unique], sent_at)`. Consumed by Tasks 3–7.

- [ ] **Step 1: Register the app**

In `backend/config/settings/base.py`, add `"apps.notifications"` to the `TENANT_APPS` list (NOT `SHARED_APPS`).

- [ ] **Step 2: App config**

Create `backend/apps/notifications/__init__.py` (empty) and `backend/apps/notifications/apps.py`:

```python
from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.notifications"

    def ready(self) -> None:
        from . import signals  # noqa: F401  (registers course-publish signal)
```

- [ ] **Step 3: Write the failing model test**

Create `backend/apps/notifications/tests/__init__.py` (empty) and `backend/apps/notifications/tests/test_models.py`:

```python
import pytest

from apps.notifications.models import LiveReminderLog, PushSubscription

pytestmark = pytest.mark.django_db


def test_push_subscription_endpoint_unique(django_user_model):
    user = django_user_model.objects.create(email="s@example.com", role="student")
    PushSubscription.objects.create(
        user=user, endpoint="https://push/1", p256dh="p", auth="a"
    )
    with pytest.raises(Exception):
        PushSubscription.objects.create(
            user=user, endpoint="https://push/1", p256dh="q", auth="b"
        )


def test_live_reminder_log_dedupes_by_key():
    _, created_first = LiveReminderLog.objects.get_or_create(key="liveclass:1")
    _, created_second = LiveReminderLog.objects.get_or_create(key="liveclass:1")
    assert created_first is True
    assert created_second is False
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `make test` (or `docker compose exec django pytest apps/notifications/tests/test_models.py -v`)
Expected: FAIL — `ModuleNotFoundError: apps.notifications.models`.

- [ ] **Step 5: Create the models**

Create `backend/apps/notifications/models.py`:

```python
from django.conf import settings
from django.db import models


class PushSubscription(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="push_subscriptions",
    )
    endpoint = models.URLField(max_length=500, unique=True)
    p256dh = models.CharField(max_length=255)
    auth = models.CharField(max_length=255)
    user_agent = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "notifications"

    def __str__(self) -> str:
        return f"PushSubscription<{self.user_id}:{self.endpoint[:32]}>"


class LiveReminderLog(models.Model):
    """One row per live event we've already sent a reminder for (dedupe)."""

    key = models.CharField(max_length=120, unique=True)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "notifications"
```

- [ ] **Step 6: Make + run migrations, pass the test**

Run:
```bash
make makemigrations
make migrate
make test
```
Expected: a migration `apps/notifications/migrations/0001_initial.py` is created; tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/notifications backend/config/settings/base.py
git commit -m "feat(notifications): tenant app with PushSubscription + LiveReminderLog models"
```

---

### Task 2: VAPID settings + key generation

**Files:**
- Modify: `backend/config/settings/base.py`
- Modify: `.env.example`, `.env.prod.example`

**Interfaces:**
- Produces: `settings.VAPID_PUBLIC_KEY`, `settings.VAPID_PRIVATE_KEY`, `settings.VAPID_SUBJECT`. Consumed by Tasks 3 & 4.

- [ ] **Step 1: Generate a keypair (local, one-time)**

Run inside the Django container (pywebpush ships the `vapid` CLI via `py-vapid`):
```bash
docker compose exec django sh -lc 'cd /tmp && vapid --gen >/dev/null 2>&1 && echo "--- PRIVATE PEM ---" && cat private_key.pem && echo "--- APPLICATION SERVER KEY (public, browser) ---" && vapid --applicationServerKey'
```
Copy the PEM block into `VAPID_PRIVATE_KEY` and the printed `Application Server Key` base64url string into `VAPID_PUBLIC_KEY` in your local `.env`. Set `VAPID_SUBJECT=mailto:admin@contentor.app`. (Generate a SEPARATE keypair for prod into `.env.prod`.)

- [ ] **Step 2: Read settings from env**

In `backend/config/settings/base.py`, add (near other `os.environ`/`env` reads):

```python
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:admin@contentor.app")
```
(Match the file's existing env-reading style if it uses a helper instead of `os.environ`.)

- [ ] **Step 3: Document in env examples**

Add to `.env.example` and `.env.prod.example`:

```
# Web Push (VAPID) — generate with: vapid --gen ; vapid --applicationServerKey
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@contentor.app
```

- [ ] **Step 4: Verify settings load**

Run: `docker compose exec django python -c "from django.conf import settings; print(bool(settings.VAPID_PUBLIC_KEY), settings.VAPID_SUBJECT)"`
Expected: prints `True mailto:admin@contentor.app` (after you set the local `.env`).

- [ ] **Step 5: Commit** (examples + settings only — never the real `.env`)

```bash
git add backend/config/settings/base.py .env.example .env.prod.example
git commit -m "feat(notifications): VAPID settings + env templates for web push"
```

---

### Task 3: Push send service (with dead-subscription cleanup)

**Files:**
- Create: `backend/apps/notifications/services.py`
- Create: `backend/apps/notifications/tests/test_services.py`

**Interfaces:**
- Consumes: `PushSubscription`, VAPID settings.
- Produces:
  - `send_to_subscription(sub: PushSubscription, payload: dict) -> bool` — returns False and deletes the row on 404/410.
  - `send_to_subscriptions(queryset, payload: dict) -> int` — returns count delivered.
  - `broadcast_to_tenant(payload: dict) -> int` — sends to all `PushSubscription` in the current schema.

- [ ] **Step 1: Write the failing test (410 cleanup + payload)**

Create `backend/apps/notifications/tests/test_services.py`:

```python
import json
from unittest.mock import patch

import pytest
from pywebpush import WebPushException

from apps.notifications import services
from apps.notifications.models import PushSubscription

pytestmark = pytest.mark.django_db


def _make_sub(django_user_model, endpoint="https://push/1"):
    user = django_user_model.objects.create(email="s@example.com", role="student")
    return PushSubscription.objects.create(
        user=user, endpoint=endpoint, p256dh="p", auth="a"
    )


def test_send_success_passes_payload(django_user_model):
    sub = _make_sub(django_user_model)
    with patch.object(services, "webpush") as mock:
        ok = services.send_to_subscription(sub, {"title": "Hi", "body": "There"})
    assert ok is True
    sent = json.loads(mock.call_args.kwargs["data"])
    assert sent["title"] == "Hi"


def test_send_410_deletes_subscription(django_user_model):
    sub = _make_sub(django_user_model)

    class _Resp:
        status_code = 410

    with patch.object(services, "webpush", side_effect=WebPushException("gone", response=_Resp())):
        ok = services.send_to_subscription(sub, {"title": "x"})
    assert ok is False
    assert not PushSubscription.objects.filter(pk=sub.pk).exists()
```

- [ ] **Step 2: Run to confirm it fails**

Run: `docker compose exec django pytest apps/notifications/tests/test_services.py -v`
Expected: FAIL — `apps.notifications.services` has no `webpush`/`send_to_subscription`.

- [ ] **Step 3: Implement the service**

Create `backend/apps/notifications/services.py`:

```python
import json
import logging

from django.conf import settings
from pywebpush import WebPushException, webpush

from .models import PushSubscription

logger = logging.getLogger(__name__)

_DEAD_STATUS = {404, 410}


def send_to_subscription(sub: PushSubscription, payload: dict) -> bool:
    try:
        webpush(
            subscription_info={
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            },
            data=json.dumps(payload),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_SUBJECT},
            ttl=3600,
        )
        return True
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        if status in _DEAD_STATUS:
            sub.delete()
        else:
            logger.warning("web push failed (%s): %s", status, exc)
        return False


def send_to_subscriptions(queryset, payload: dict) -> int:
    return sum(1 for sub in list(queryset) if send_to_subscription(sub, payload))


def broadcast_to_tenant(payload: dict) -> int:
    return send_to_subscriptions(PushSubscription.objects.all(), payload)
```

> Note: `vapid_private_key` accepts the PEM contents directly when they include the `-----BEGIN` header; if your environment strips newlines, store the PEM with literal `\n` and `.replace("\\n", "\n")` it in the settings read (Task 2). Keep `VAPID_PRIVATE_KEY` multi-line in `.env`.

- [ ] **Step 4: Run the tests, pass**

Run: `docker compose exec django pytest apps/notifications/tests/test_services.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/notifications/services.py backend/apps/notifications/tests/test_services.py
git commit -m "feat(notifications): pywebpush send service with 404/410 cleanup"
```

---

### Task 4: Subscription API (vapid-key, subscribe, unsubscribe)

**Files:**
- Create: `backend/apps/notifications/serializers.py`, `views.py`, `urls.py`
- Modify: `backend/config/urls.py` (include under `/api/v1/notifications/`)
- Create: `backend/apps/notifications/tests/test_api.py`

**Interfaces:**
- Produces:
  - `GET /api/v1/notifications/vapid-key/` → `{"public_key": "<base64url>"}` (AllowAny).
  - `POST /api/v1/notifications/subscribe/` body `{endpoint, keys:{p256dh, auth}}` → upserts for `request.user`.
  - `POST /api/v1/notifications/unsubscribe/` body `{endpoint}` → deletes.

- [ ] **Step 1: Write the failing API test**

Create `backend/apps/notifications/tests/test_api.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.notifications.models import PushSubscription

pytestmark = pytest.mark.django_db


def test_vapid_key_is_public(settings):
    settings.VAPID_PUBLIC_KEY = "TEST_KEY"
    res = APIClient().get("/api/v1/notifications/vapid-key/")
    assert res.status_code == 200
    assert res.json()["public_key"] == "TEST_KEY"


def test_subscribe_upserts_for_user(django_user_model):
    user = django_user_model.objects.create(email="s@example.com", role="student")
    client = APIClient()
    client.force_authenticate(user=user)
    body = {"endpoint": "https://push/9", "keys": {"p256dh": "p", "auth": "a"}}
    assert client.post("/api/v1/notifications/subscribe/", body, format="json").status_code == 201
    # idempotent
    client.post("/api/v1/notifications/subscribe/", body, format="json")
    assert PushSubscription.objects.filter(endpoint="https://push/9").count() == 1
```

- [ ] **Step 2: Run to confirm it fails**

Run: `docker compose exec django pytest apps/notifications/tests/test_api.py -v`
Expected: FAIL (404 — routes not wired).

- [ ] **Step 3: Serializer**

Create `backend/apps/notifications/serializers.py`:

```python
from rest_framework import serializers


class SubscribeSerializer(serializers.Serializer):
    endpoint = serializers.URLField(max_length=500)
    keys = serializers.DictField(child=serializers.CharField())

    def validate_keys(self, value):
        if "p256dh" not in value or "auth" not in value:
            raise serializers.ValidationError("keys must include p256dh and auth")
        return value
```

- [ ] **Step 4: Views**

Create `backend/apps/notifications/views.py`:

```python
from django.conf import settings
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import PushSubscription
from .serializers import SubscribeSerializer


@api_view(["GET"])
@authentication_classes([])  # CLAUDE.md: AllowAny alone is not enough
@permission_classes([AllowAny])
def vapid_key(request):
    return Response({"public_key": settings.VAPID_PUBLIC_KEY})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def subscribe(request):
    serializer = SubscribeSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    PushSubscription.objects.update_or_create(
        endpoint=data["endpoint"],
        defaults={
            "user": request.user,
            "p256dh": data["keys"]["p256dh"],
            "auth": data["keys"]["auth"],
            "user_agent": request.META.get("HTTP_USER_AGENT", "")[:255],
        },
    )
    return Response(status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def unsubscribe(request):
    PushSubscription.objects.filter(
        endpoint=request.data.get("endpoint", ""), user=request.user
    ).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 5: URLs**

Create `backend/apps/notifications/urls.py`:

```python
from django.urls import path

from . import views

urlpatterns = [
    path("vapid-key/", views.vapid_key, name="push-vapid-key"),
    path("subscribe/", views.subscribe, name="push-subscribe"),
    path("unsubscribe/", views.unsubscribe, name="push-unsubscribe"),
]
```

In `backend/config/urls.py`, add to the `/api/v1/` includes (match the existing include style):

```python
    path("api/v1/notifications/", include("apps.notifications.urls")),
```

- [ ] **Step 6: Run the tests, pass**

Run: `docker compose exec django pytest apps/notifications/tests/test_api.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/notifications/serializers.py backend/apps/notifications/views.py backend/apps/notifications/urls.py backend/config/urls.py backend/apps/notifications/tests/test_api.py
git commit -m "feat(notifications): vapid-key/subscribe/unsubscribe API"
```

---

### Task 5: Live-class reminder (Celery beat, deduped)

**Files:**
- Create: `backend/apps/notifications/tasks.py`
- Create: `backend/apps/notifications/payloads.py`
- Modify: `backend/config/celery.py` (beat schedule)
- Create: `backend/apps/notifications/tests/test_reminders.py`

**Interfaces:**
- Consumes: `LiveReminderLog`, `broadcast_to_tenant`, the live models.
- Produces: `send_live_reminders()` Celery task — for each tenant, each live event starting in the next 15 min not yet logged → broadcast a reminder + log it.

- [ ] **Step 1: Payload builder**

Create `backend/apps/notifications/payloads.py`:

```python
from apps.tenant_config.models import TenantConfig


def _brand() -> dict:
    cfg = TenantConfig.objects.first()
    return {
        "icon": (cfg.logo_url if cfg and cfg.logo_url else "/pwa-icon?size=192"),
        "brand": (cfg.brand_name if cfg else "Contentor"),
    }


def live_reminder_payload(title: str, url: str = "/live-classes") -> dict:
    b = _brand()
    return {"title": b["brand"], "body": f"Starting soon: {title}", "icon": b["icon"], "url": url, "tag": "live-reminder"}


def new_content_payload(title: str, url: str) -> dict:
    b = _brand()
    return {"title": b["brand"], "body": f"New: {title}", "icon": b["icon"], "url": url, "tag": "new-content"}


def broadcast_payload(message: str) -> dict:
    b = _brand()
    return {"title": b["brand"], "body": message, "icon": b["icon"], "url": "/", "tag": "broadcast"}
```

> Verify `TenantConfig` import path + the `logo_url`/`brand_name` field names against `apps/tenant_config/models.py` during implementation; adjust if the model name differs.

- [ ] **Step 2: Write the failing reminder test**

Create `backend/apps/notifications/tests/test_reminders.py`:

```python
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone

from apps.live.models import LiveClass
from apps.notifications import tasks
from apps.notifications.models import LiveReminderLog

pytestmark = pytest.mark.django_db


def test_reminder_sent_once_for_upcoming_class(django_user_model):
    coach = django_user_model.objects.create(email="c@example.com", role="owner")
    LiveClass.objects.create(
        title="Morning Flow",
        instructor=coach,
        scheduled_at=timezone.now() + timedelta(minutes=10),
        duration_minutes=60,
    )
    with patch.object(tasks, "broadcast_to_tenant", return_value=1) as send:
        tasks._send_reminders_for_current_tenant()
        tasks._send_reminders_for_current_tenant()  # second pass must dedupe
    assert send.call_count == 1
    assert LiveReminderLog.objects.count() == 1
```

- [ ] **Step 3: Run to confirm it fails**

Run: `docker compose exec django pytest apps/notifications/tests/test_reminders.py -v`
Expected: FAIL — `apps.notifications.tasks` missing.

- [ ] **Step 4: Implement the tasks**

Create `backend/apps/notifications/tasks.py`:

```python
import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone
from django_tenants.utils import get_tenant_model, tenant_context

from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass

from .models import LiveReminderLog
from .payloads import live_reminder_payload
from .services import broadcast_to_tenant

logger = logging.getLogger(__name__)

_LIVE_MODELS = (LiveClass, LiveStream, ZoomClass, OnsiteEvent)
_WINDOW_MINUTES = 15


def _send_reminders_for_current_tenant() -> None:
    now = timezone.now()
    horizon = now + timedelta(minutes=_WINDOW_MINUTES)
    for model in _LIVE_MODELS:
        upcoming = model.objects.filter(scheduled_at__gt=now, scheduled_at__lte=horizon)
        for event in upcoming:
            key = f"{model.__name__.lower()}:{event.pk}"
            _, created = LiveReminderLog.objects.get_or_create(key=key)
            if not created:
                continue
            broadcast_to_tenant(live_reminder_payload(event.title))


@shared_task
def send_live_reminders() -> None:
    for tenant in get_tenant_model().objects.exclude(schema_name="public"):
        with tenant_context(tenant):
            try:
                _send_reminders_for_current_tenant()
            except Exception:  # noqa: BLE001  one tenant must not break the rest
                logger.exception("live reminder fan-out failed for %s", tenant.schema_name)
```

- [ ] **Step 5: Schedule it (every 5 minutes)**

In `backend/config/celery.py`, add after the app is configured:

```python
from celery.schedules import crontab

app.conf.beat_schedule = {
    "send-live-reminders": {
        "task": "apps.notifications.tasks.send_live_reminders",
        "schedule": crontab(minute="*/5"),
    },
}
```
(If `beat_schedule` already exists, add this entry to the existing dict.)

- [ ] **Step 6: Run the test, pass**

Run: `docker compose exec django pytest apps/notifications/tests/test_reminders.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/notifications/tasks.py backend/apps/notifications/payloads.py backend/config/celery.py backend/apps/notifications/tests/test_reminders.py
git commit -m "feat(notifications): deduped live-class reminder beat task"
```

---

### Task 6: New-content-published trigger

**Files:**
- Create: `backend/apps/notifications/signals.py`
- Modify: `backend/apps/notifications/tasks.py` (add `fanout_new_content`)
- Create: `backend/apps/notifications/tests/test_publish_signal.py`

**Interfaces:**
- Consumes: `Course` `post_save`, `new_content_payload`, `broadcast_to_tenant`.
- Produces: a `Course` transition unpublished→published enqueues `fanout_new_content.delay(course_id)`.

- [ ] **Step 1: Write the failing test**

Create `backend/apps/notifications/tests/test_publish_signal.py`:

```python
from unittest.mock import patch

import pytest

from apps.courses.models import Course

pytestmark = pytest.mark.django_db


def test_publishing_a_course_enqueues_fanout(django_user_model):
    coach = django_user_model.objects.create(email="c@example.com", role="owner")
    course = Course.objects.create(title="Yoga 101", slug="yoga-101", instructor=coach, is_published=False)
    with patch("apps.notifications.signals.fanout_new_content") as task:
        course.is_published = True
        course.save()
    task.delay.assert_called_once_with(course.pk)


def test_resaving_published_course_does_not_reenqueue(django_user_model):
    coach = django_user_model.objects.create(email="c2@example.com", role="owner")
    course = Course.objects.create(title="P", slug="p", instructor=coach, is_published=True)
    with patch("apps.notifications.signals.fanout_new_content") as task:
        course.title = "P2"
        course.save()
    task.delay.assert_not_called()
```

- [ ] **Step 2: Run to confirm it fails**

Run: `docker compose exec django pytest apps/notifications/tests/test_publish_signal.py -v`
Expected: FAIL — `apps.notifications.signals` missing.

- [ ] **Step 3: Add the fan-out task**

Append to `backend/apps/notifications/tasks.py`:

```python
@shared_task
def fanout_new_content(course_id: int) -> None:
    from apps.courses.models import Course

    from .payloads import new_content_payload

    course = Course.objects.filter(pk=course_id).first()
    if not course:
        return
    broadcast_to_tenant(new_content_payload(course.title, f"/courses/{course.slug}"))
```

- [ ] **Step 4: Add the signal (transition detection)**

Create `backend/apps/notifications/signals.py`:

```python
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from apps.courses.models import Course

from .tasks import fanout_new_content


@receiver(pre_save, sender=Course)
def _track_publish_transition(sender, instance, **kwargs):
    if not instance.pk:
        instance._was_published = False
        return
    prev = sender.objects.filter(pk=instance.pk).values_list("is_published", flat=True).first()
    instance._was_published = bool(prev)


@receiver(post_save, sender=Course)
def _notify_on_publish(sender, instance, created, **kwargs):
    became_published = instance.is_published and not getattr(instance, "_was_published", False)
    if became_published:
        fanout_new_content.delay(instance.pk)
```

(`signals` is imported by `NotificationsConfig.ready()` from Task 1.)

- [ ] **Step 5: Run the tests, pass**

Run: `docker compose exec django pytest apps/notifications/tests/test_publish_signal.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/notifications/signals.py backend/apps/notifications/tasks.py backend/apps/notifications/tests/test_publish_signal.py
git commit -m "feat(notifications): push on course publish transition"
```

---

### Task 7: Coach broadcast endpoint

**Files:**
- Modify: `backend/apps/notifications/views.py`, `urls.py`, `tasks.py`
- Create: `backend/apps/notifications/tests/test_broadcast.py`

**Interfaces:**
- Produces: `POST /api/v1/admin/notifications/broadcast/` body `{message}` (owner/coach only) → enqueues `fanout_broadcast.delay(message)`.

- [ ] **Step 1: Write the failing test**

Create `backend/apps/notifications/tests/test_broadcast.py`:

```python
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


def test_student_cannot_broadcast(django_user_model):
    student = django_user_model.objects.create(email="s@example.com", role="student")
    client = APIClient()
    client.force_authenticate(user=student)
    res = client.post("/api/v1/admin/notifications/broadcast/", {"message": "hi"}, format="json")
    assert res.status_code == 403


def test_coach_broadcast_enqueues(django_user_model):
    coach = django_user_model.objects.create(email="c@example.com", role="owner")
    client = APIClient()
    client.force_authenticate(user=coach)
    with patch("apps.notifications.views.fanout_broadcast") as task:
        res = client.post("/api/v1/admin/notifications/broadcast/", {"message": "Live Q&A Friday!"}, format="json")
    assert res.status_code == 202
    task.delay.assert_called_once_with("Live Q&A Friday!")
```

- [ ] **Step 2: Run to confirm it fails**

Run: `docker compose exec django pytest apps/notifications/tests/test_broadcast.py -v`
Expected: FAIL (404).

- [ ] **Step 3: Add the broadcast task**

Append to `backend/apps/notifications/tasks.py`:

```python
@shared_task
def fanout_broadcast(message: str) -> None:
    from .payloads import broadcast_payload

    broadcast_to_tenant(broadcast_payload(message))
```

- [ ] **Step 4: Add the view**

Append to `backend/apps/notifications/views.py` (add the import at top):

```python
from .tasks import fanout_broadcast
```
```python
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def broadcast(request):
    if getattr(request.user, "role", None) not in ("owner", "coach"):
        return Response(status=status.HTTP_403_FORBIDDEN)
    message = (request.data.get("message") or "").strip()
    if not message:
        return Response({"detail": "message required"}, status=status.HTTP_400_BAD_REQUEST)
    fanout_broadcast.delay(message)
    return Response(status=status.HTTP_202_ACCEPTED)
```

- [ ] **Step 5: Route it under the admin prefix**

Create `backend/apps/notifications/admin_urls.py`:

```python
from django.urls import path

from . import views

urlpatterns = [path("notifications/broadcast/", views.broadcast, name="push-broadcast")]
```

In `backend/config/urls.py`, add (alongside other `/api/v1/admin/` includes):

```python
    path("api/v1/admin/", include("apps.notifications.admin_urls")),
```
(If an admin include already exists with a different module, add the `notifications/broadcast/` path there instead — keep one admin namespace.)

- [ ] **Step 6: Run the tests, pass**

Run: `docker compose exec django pytest apps/notifications/tests/test_broadcast.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/notifications/views.py backend/apps/notifications/admin_urls.py backend/apps/notifications/tasks.py backend/config/urls.py backend/apps/notifications/tests/test_broadcast.py
git commit -m "feat(notifications): coach broadcast endpoint (owner/coach only)"
```

---

### Task 8: Service worker push + notificationclick handlers

**Files:**
- Modify: `frontend-customer/src/app/sw.ts` (from Phase 2)

**Interfaces:**
- Consumes: payloads `{title, body, icon, url, tag}` from the backend.
- Produces: a notification on `push`; focuses/opens `data.url` on `notificationclick`.

- [ ] **Step 1: Add the listeners**

In `frontend-customer/src/app/sw.ts`, after `serwist.addEventListeners();`, append:

```ts
self.addEventListener("push", (event) => {
  const data = (() => {
    try {
      return JSON.parse(event.data?.text() ?? "{}");
    } catch {
      return {};
    }
  })();
  const title = data.title ?? "Notification";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body ?? "",
      icon: data.icon ?? "/pwa-icon?size=192",
      badge: "/pwa-icon?size=192",
      tag: data.tag,
      data: { url: data.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await (client as WindowClient).navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
```

- [ ] **Step 2: Verify build**

Run: `cd frontend-customer && npm run build`
Expected: success; `public/sw.js` regenerated.

- [ ] **Step 3: Verify a test push displays (manual)**

With the SW active (Phase 2 prerequisites) and a subscription created (Task 9), trigger a notification (e.g. publish a course, or `docker compose exec django python manage.py shell` → call `broadcast_to_tenant` within a `tenant_context`). Expected: a system notification appears; clicking it focuses/opens the app at the payload URL.

- [ ] **Step 4: Commit**

```bash
git add frontend-customer/src/app/sw.ts
git commit -m "feat(pwa): service worker push + notificationclick handlers"
```

---

### Task 9: Push opt-in (post-install, iOS-gated)

**Files:**
- Create: `frontend-customer/src/lib/push.ts`
- Create: `frontend-customer/src/components/shared/push-optin.tsx`
- Modify: `frontend-customer/src/app/layout.tsx` (mount)
- Modify: `frontend-customer/messages/en.json`, `tr.json`

**Interfaces:**
- Consumes: `clientFetch` (`@/lib/api-client`), `GET /vapid-key/`, `POST /subscribe/`.
- Produces: `<PushOptIn />` — shown only in standalone with push support, not on `/admin`, dismissal persisted.

- [ ] **Step 1: Subscribe helper**

Create `frontend-customer/src/lib/push.ts`:

```ts
import { clientFetch } from "@/lib/api-client";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export async function subscribeToPush(): Promise<boolean> {
  if (Notification.permission === "denied") return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const { public_key } = await clientFetch<{ public_key: string }>("/api/v1/notifications/vapid-key/");
  if (!public_key) return false;

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(public_key),
  });

  await clientFetch<void>("/api/v1/notifications/subscribe/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  return true;
}
```

> Confirm the `clientFetch` signature/headers convention in `src/lib/api-client.ts` and match it (some helpers set JSON headers automatically).

- [ ] **Step 2: i18n strings**

In `messages/en.json` under `"pwa"`, add: `"enablePush": "Get notified about live classes and new lessons"`, `"enable": "Turn on"`, `"notNow": "Not now"`. In `messages/tr.json` under `"pwa"`: `"enablePush": "Canlı dersler ve yeni içeriklerden haberdar olun"`, `"enable": "Aç"`, `"notNow": "Şimdi değil"`.

- [ ] **Step 3: Component**

Create `frontend-customer/src/components/shared/push-optin.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { isStandalone, pushSupported, subscribeToPush } from "@/lib/push";

const DISMISS_KEY = "pwa-push-dismissed";

export function PushOptIn() {
  const t = useTranslations("pwa");
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;
    if (!pushSupported() || !isStandalone()) return; // iOS: only installed PWAs
    if (Notification.permission === "granted") return;
    setShow(true);
  }, []);

  if (!show || pathname?.startsWith("/admin")) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  const enable = async () => {
    const ok = await subscribeToPush();
    if (!ok) toast.error(t("enablePush"));
    dismiss();
  };

  return (
    <div
      className="fixed inset-x-3 bottom-3 z-50 flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm text-foreground shadow-lg"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      role="dialog"
    >
      <span className="flex-1">{t("enablePush")}</span>
      <button onClick={enable} className="rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground">
        {t("enable")}
      </button>
      <button onClick={dismiss} className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground">
        {t("notNow")}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Mount it**

In `frontend-customer/src/app/layout.tsx`, import and render `<PushOptIn />` after `<SwUpdateToast />`:

```ts
import { PushOptIn } from "@/components/shared/push-optin";
```
```tsx
                  <SwUpdateToast />
                  <PushOptIn />
```

- [ ] **Step 5: Verify (build + behavior)**

Run: `cd frontend-customer && npm run build && npm run lint` → both pass.
Behavior (installed PWA, Android or desktop standalone): the opt-in appears; **Turn on** → permission prompt → on grant, a `PushSubscription` row is created (check `docker compose exec django ...` or DevTools → Application → Push). On `/admin` or in a normal browser tab it does not appear.

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src/lib/push.ts frontend-customer/src/components/shared/push-optin.tsx frontend-customer/src/app/layout.tsx frontend-customer/messages/en.json frontend-customer/messages/tr.json
git commit -m "feat(pwa): post-install push opt-in + subscribe flow"
```

---

### Task 10: Coach broadcast admin UI

**Files:**
- Create: `frontend-customer/src/app/admin/notifications/page.tsx`
- Modify: `frontend-customer/messages/en.json`, `tr.json`

**Interfaces:**
- Consumes: `clientFetch` → `POST /api/v1/admin/notifications/broadcast/`.
- Produces: an admin page where a coach types a message and sends it to all students.

- [ ] **Step 1: i18n strings**

In `messages/en.json` add a `"pushAdmin"` namespace: `{"title": "Send announcement", "placeholder": "Message to all your students…", "send": "Send", "sent": "Announcement sent"}`. Mirror in `tr.json`: `{"title": "Duyuru gönder", "placeholder": "Tüm öğrencilerinize mesaj…", "send": "Gönder", "sent": "Duyuru gönderildi"}`.

- [ ] **Step 2: Page**

Create `frontend-customer/src/app/admin/notifications/page.tsx`:

```tsx
"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { clientFetch } from "@/lib/api-client";

export default function BroadcastPage() {
  const t = useTranslations("pushAdmin");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      await clientFetch<void>("/api/v1/admin/notifications/broadcast/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
      });
      toast.success(t("sent"));
      setMessage("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t("placeholder")}
        rows={4}
        className="w-full rounded-lg border border-border bg-background p-3 text-sm"
      />
      <button
        onClick={send}
        disabled={sending || !message.trim()}
        className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
      >
        {t("send")}
      </button>
    </div>
  );
}
```

> Add a nav entry to this page in the admin sidebar if the app centralizes admin nav (search `app-sidebar` / the admin nav config); match the existing pattern. If unsure, the page is reachable at `/admin/notifications`.

- [ ] **Step 3: Verify**

Run: `cd frontend-customer && npm run build && npm run lint` → both pass.
Behavior: as a coach, open `/admin/notifications`, type a message, **Send** → success toast; subscribed students receive the notification (end-to-end with Task 8/9).

- [ ] **Step 4: Commit**

```bash
git add frontend-customer/src/app/admin/notifications frontend-customer/messages/en.json frontend-customer/messages/tr.json
git commit -m "feat(pwa): coach broadcast admin page"
```

---

## Self-Review

**Spec coverage (Phase 3 section):**
- `apps.notifications` tenant app + `PushSubscription` (FK shared user) → Task 1.
- Single platform VAPID (env) + key gen → Task 2.
- `pywebpush` send service + 404/410 cleanup → Task 3.
- API: vapid-key (public), subscribe, unsubscribe → Task 4.
- Trigger 1 live reminder (beat, deduped, tenant-iterating) → Task 5.
- Trigger 2 new content published (signal → fan-out) → Task 6.
- Trigger 3 coach broadcast (owner/coach endpoint + UI) → Tasks 7 & 10.
- SW push + notificationclick → Task 8.
- Post-install, iOS-gated opt-in + subscribe → Task 9.
- i18n en+tr → Tasks 9 & 10 (and reused `pwa` namespace).

**Placeholder scan:** Code is complete. Three explicit "verify against the codebase" notes (TenantConfig field names in `payloads.py`; `clientFetch` header convention; admin-nav wiring) are integration confirmations, not missing logic — each has a concrete default that works as written.

**Type consistency:** payload shape `{title, body, icon, url, tag}` is identical in `payloads.py` (producer) and `sw.ts` (consumer); `broadcast_to_tenant`/`send_to_subscriptions`/`send_to_subscription` names match across Tasks 3/5/6/7; the subscribe body (`sub.toJSON()` → `{endpoint, keys:{p256dh, auth}}`) matches `SubscribeSerializer`; `fanout_new_content`/`fanout_broadcast` task names match their `.delay()` callers.

**v1 simplifications (documented, intentional):** audience = all opted-in tenant subscribers (not access-scoped); order/payment trigger intentionally dropped (per spec decision). Both are noted for a future pass.

**Cross-phase:** push/notificationclick extend Phase 2's `sw.ts`; the opt-in/install banners coexist (install → offline → push, gated so only one shows at a time by state).
