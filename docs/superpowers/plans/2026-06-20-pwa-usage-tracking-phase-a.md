# PWA Usage Tracking — Phase A: Capture + Per-Student — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture how students reach a coach's app (installed PWA vs browser, + coarse platform) once per session, and surface each student's last-seen mode/device in the coach admin.

**Architecture:** A new **shared** Django app `apps.usage` holds a public-schema `UsageEvent(user, tenant, mode, platform, day)` (self-deduped daily). Three denormalized fields on the shared `User` give fast per-student display. A client reporter posts `{mode, platform}` once per session to `POST /api/v1/me/usage/`, which upserts the event and updates the user's last-seen.

**Tech Stack:** Django 5.1 + DRF, django-tenants, Next.js 14 (`frontend-customer`), pytest.

**Spec:** `docs/superpowers/specs/2026-06-20-pwa-usage-tracking-design.md` (this is Phase A of the A/B/C rollout). Builds on the Student PWA feature's `isStandalone()` (`frontend-customer/src/lib/push.ts`).

## Global Constraints

- **`apps.usage` is a TENANT app** (add to `TENANT_APPS` in `backend/config/settings/base.py`, NOT `SHARED_APPS`). `UsageEvent` lives in **each tenant's schema** with a real `user` FK to that tenant's users (students live in the tenant schema). **No `tenant` column** — the schema identifies the tenant. (Revised from the original public/shared design: students aren't in the public schema, so a public FK to them is impossible.)
- **Students only:** the capture endpoint records only when `request.user.role == "student"` (coaches/owners are out of scope). The client reporter does not fire on `/admin/*`.
- **Tenant-test convention** (the same as `apps/notifications/tests/`): backend tests use `@pytest.mark.django_db(transaction=True)`, depend on the `tenant_ctx` fixture (from `backend/conftest.py`), and create users via `User.objects.create_user(email=, name=, password=, role=)` from `apps.accounts.models` — NOT bare `django_db`/`django_user_model`. The current tenant in a request is `connection.tenant` (`from django.db import connection`); API tests use `APIClient(HTTP_HOST="shared-test.localhost")`. Mirror `backend/apps/notifications/tests/test_api.py`.
- **Privacy:** store only coarse `platform` (ios/android/desktop/other) derived from the UA — never the raw User-Agent.
- **Failure isolation:** the client reporter swallows all errors; the endpoint never 500s on bad input (400 instead).
- **No frontend test runner** — frontend verification is `npm run build` (do NOT add Jest/Vitest).
- **Commits:** commit per task (confirm commit go-ahead at execution).

---

### Task 1: Data layer — `apps.usage` + `UsageEvent` + `User` fields

**Files:**
- Create: `backend/apps/usage/__init__.py`, `apps.py`, `models.py`, `tests/__init__.py`, `tests/test_models.py`
- Modify: `backend/config/settings/base.py` (TENANT_APPS), `backend/apps/accounts/models.py` (User fields)

**Interfaces:**
- Produces: `UsageEvent(user, mode, platform, day, created_at)` (tenant-schema model, no tenant column) unique on `(user, mode, platform, day)`; `User.last_display_mode`, `User.last_platform`, `User.first_pwa_at`. Consumed by Tasks 2 & 4.

- [ ] **Step 1: Register the app**

In `backend/config/settings/base.py`, add `"apps.usage"` to the `TENANT_APPS` list (NOT `SHARED_APPS`).

- [ ] **Step 2: App config + package**

Create `backend/apps/usage/__init__.py` (empty) and `backend/apps/usage/apps.py`:

```python
from django.apps import AppConfig


class UsageConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.usage"
```

- [ ] **Step 3: Write the failing model test**

Create `backend/apps/usage/tests/__init__.py` (empty) and `backend/apps/usage/tests/test_models.py`:

```python
from datetime import date

import pytest
from django.db import transaction
from django.db.utils import IntegrityError

from apps.accounts.models import User
from apps.usage.models import UsageEvent

pytestmark = pytest.mark.django_db(transaction=True)


def test_usage_event_dedupes_per_day(tenant_ctx):
    # tenant_ctx runs in the tenant schema, where both the student User and the
    # tenant-app UsageEvent live — so the real user FK resolves cleanly.
    user = User.objects.create_user(email="s@u.com", name="S", password="x", role="student")
    kwargs = dict(user=user, mode="pwa", platform="ios", day=date(2026, 6, 20))
    UsageEvent.objects.create(**kwargs)
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            UsageEvent.objects.create(**kwargs)


def test_user_usage_fields_default_empty(tenant_ctx):
    user = User.objects.create_user(email="s2@u.com", name="S2", password="x", role="student")
    assert user.last_display_mode == ""
    assert user.last_platform == ""
    assert user.first_pwa_at is None
```

- [ ] **Step 4: Run it to confirm failure**

Run: `docker compose exec django pytest apps/usage/tests/test_models.py -v`
Expected: collection error / fail — `apps.usage.models` and the `User` fields don't exist yet.

- [ ] **Step 5: Create the model**

Create `backend/apps/usage/models.py`:

```python
from django.conf import settings
from django.db import models


class UsageEvent(models.Model):
    MODE_CHOICES = [("pwa", "PWA"), ("browser", "Browser")]
    PLATFORM_CHOICES = [
        ("ios", "iOS"),
        ("android", "Android"),
        ("desktop", "Desktop"),
        ("other", "Other"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="usage_events"
    )
    mode = models.CharField(max_length=10, choices=MODE_CHOICES)
    platform = models.CharField(max_length=10, choices=PLATFORM_CHOICES)
    day = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "usage"
        unique_together = ("user", "mode", "platform", "day")

    def __str__(self) -> str:
        return f"UsageEvent<{self.user_id}:{self.mode}/{self.platform}:{self.day}>"
```

- [ ] **Step 6: Add the denormalized User fields**

In `backend/apps/accounts/models.py`, add to the `User` model (near `last_login`):

```python
    last_display_mode = models.CharField(max_length=10, blank=True, default="")
    last_platform = models.CharField(max_length=10, blank=True, default="")
    first_pwa_at = models.DateTimeField(null=True, blank=True)
```

- [ ] **Step 7: Migrate + pass**

Run:
```bash
make makemigrations
make migrate
docker compose exec django pytest apps/usage/tests/test_models.py -v
```
Expected: migrations created for `usage` (0001_initial) and `accounts`; both tests PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/usage backend/config/settings/base.py backend/apps/accounts/models.py backend/apps/accounts/migrations
git commit -m "feat(usage): shared UsageEvent model + denormalized PWA fields on User"
```

---

### Task 2: Capture endpoint `POST /api/v1/me/usage/`

**Files:**
- Create: `backend/apps/usage/views.py`, `backend/apps/usage/tests/test_capture.py`
- Modify: `backend/apps/core/me/urls.py`

**Interfaces:**
- Consumes: `UsageEvent`, `User` fields (Task 1). Writes happen in the request's tenant schema automatically (customer subdomain).
- Produces: `POST /api/v1/me/usage/` body `{mode, platform}` → 204; records only for `role=="student"`; idempotent per day; updates `User` last-seen + `first_pwa_at`.

- [ ] **Step 1: Write the failing test**

Create `backend/apps/usage/tests/test_capture.py`:

```python
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.usage.models import UsageEvent

pytestmark = pytest.mark.django_db(transaction=True)
SHARED_DOMAIN = "shared-test.localhost"


def _client(user):
    c = APIClient(HTTP_HOST=SHARED_DOMAIN)
    c.force_authenticate(user=user)
    return c


def test_student_usage_recorded_and_denormalized(tenant_ctx):
    student = User.objects.create_user(email="s@u.com", name="S", password="x", role="student")
    res = _client(student).post(
        "/api/v1/me/usage/", {"mode": "pwa", "platform": "ios"}, format="json"
    )
    assert res.status_code == 204
    assert UsageEvent.objects.filter(user=student, mode="pwa", platform="ios").count() == 1
    student.refresh_from_db()
    assert student.last_display_mode == "pwa"
    assert student.last_platform == "ios"
    assert student.first_pwa_at is not None


def test_usage_idempotent_per_day(tenant_ctx):
    student = User.objects.create_user(email="s2@u.com", name="S2", password="x", role="student")
    client = _client(student)
    body = {"mode": "browser", "platform": "android"}
    client.post("/api/v1/me/usage/", body, format="json")
    client.post("/api/v1/me/usage/", body, format="json")
    assert UsageEvent.objects.filter(user=student).count() == 1


def test_invalid_mode_returns_400(tenant_ctx):
    student = User.objects.create_user(email="s3@u.com", name="S3", password="x", role="student")
    res = _client(student).post(
        "/api/v1/me/usage/", {"mode": "nope", "platform": "ios"}, format="json"
    )
    assert res.status_code == 400


def test_non_student_records_nothing(tenant_ctx):
    coach = User.objects.create_user(email="c@u.com", name="C", password="x", role="owner")
    res = _client(coach).post(
        "/api/v1/me/usage/", {"mode": "pwa", "platform": "desktop"}, format="json"
    )
    assert res.status_code == 204
    assert UsageEvent.objects.filter(user=coach).count() == 0
```

- [ ] **Step 2: Run it to confirm failure**

Run: `docker compose exec django pytest apps/usage/tests/test_capture.py -v`
Expected: FAIL (404 — route not wired).

- [ ] **Step 3: Implement the view**

Create `backend/apps/usage/views.py`:

```python
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import UsageEvent

_MODES = {"pwa", "browser"}
_PLATFORMS = {"ios", "android", "desktop", "other"}


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def record_usage(request):
    mode = request.data.get("mode")
    platform = request.data.get("platform")
    if mode not in _MODES or platform not in _PLATFORMS:
        return Response({"detail": "invalid mode/platform"}, status=status.HTTP_400_BAD_REQUEST)

    user = request.user
    # Students only — coaches/owners use the admin app and are out of scope.
    if getattr(user, "role", None) != "student":
        return Response(status=status.HTTP_204_NO_CONTENT)

    # The request runs in the tenant's schema (customer subdomain), so this row
    # lands in that tenant — no tenant column needed.
    UsageEvent.objects.get_or_create(
        user=user,
        mode=mode,
        platform=platform,
        day=timezone.now().date(),
    )

    fields = []
    if user.last_display_mode != mode:
        user.last_display_mode = mode
        fields.append("last_display_mode")
    if user.last_platform != platform:
        user.last_platform = platform
        fields.append("last_platform")
    if mode == "pwa" and user.first_pwa_at is None:
        user.first_pwa_at = timezone.now()
        fields.append("first_pwa_at")
    if fields:
        user.save(update_fields=fields)

    return Response(status=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 4: Wire the route**

In `backend/apps/core/me/urls.py`, add the import and path:

```python
from apps.usage import views as usage_views
```
```python
    path("usage/", usage_views.record_usage, name="me-usage"),
```
(Add the `path(...)` inside the existing `urlpatterns` list.)

- [ ] **Step 5: Run the tests, pass**

Run: `docker compose exec django pytest apps/usage/tests/test_capture.py -v`
Expected: 4 PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/usage/views.py backend/apps/usage/tests/test_capture.py backend/apps/core/me/urls.py
git commit -m "feat(usage): POST /me/usage/ capture endpoint (students only, daily upsert)"
```

---

### Task 3: Client reporter (once per session)

**Files:**
- Create: `frontend-customer/src/lib/usage.ts`, `frontend-customer/src/components/shared/usage-reporter.tsx`
- Modify: `frontend-customer/src/app/layout.tsx` (mount)

**Interfaces:**
- Consumes: `isStandalone` (`@/lib/push`), `clientFetch` (`@/lib/api-client`), the `/me/usage/` endpoint.
- Produces: `<UsageReporter />` — fires `reportUsageOncePerSession()` once per browser session, not on `/admin`.

- [ ] **Step 1: Reporter lib**

Create `frontend-customer/src/lib/usage.ts`:

```ts
import { clientFetch } from "@/lib/api-client";
import { isStandalone } from "@/lib/push";

const REPORTED_KEY = "usage-reported";

function detectPlatform(): "ios" | "android" | "desktop" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return ua ? "desktop" : "other";
}

export async function reportUsageOncePerSession(): Promise<void> {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem(REPORTED_KEY)) return;
  // Set the flag FIRST so a failure (e.g. anonymous → 401) never re-fires.
  sessionStorage.setItem(REPORTED_KEY, "1");
  try {
    await clientFetch<void>("/api/v1/me/usage/", {
      method: "POST",
      body: JSON.stringify({ mode: isStandalone() ? "pwa" : "browser", platform: detectPlatform() }),
    });
  } catch {
    // Telemetry must never affect the page.
  }
}
```

- [ ] **Step 2: Reporter component**

Create `frontend-customer/src/components/shared/usage-reporter.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { reportUsageOncePerSession } from "@/lib/usage";

export function UsageReporter() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname?.startsWith("/admin")) return; // students/public only
    void reportUsageOncePerSession();
  }, [pathname]);
  return null;
}
```

- [ ] **Step 3: Mount in the layout**

In `frontend-customer/src/app/layout.tsx`, import and render `<UsageReporter />` next to the existing `<PushOptIn />` (inside the non-gated branch, after `{children}`):

```ts
import { UsageReporter } from "@/components/shared/usage-reporter";
```
```tsx
                  <PushOptIn />
                  <UsageReporter />
```

- [ ] **Step 4: Verify**

Run: `cd frontend-customer && npm run build`
Expected: build succeeds.
Behavior (with the stack up): load `http://demo-faceyoga.localhost/` as a logged-in student → exactly one `POST /api/v1/me/usage/` (204) in the Network panel; reload → no second POST (sessionStorage); on `/admin` → no POST.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/lib/usage.ts frontend-customer/src/components/shared/usage-reporter.tsx frontend-customer/src/app/layout.tsx
git commit -m "feat(usage): client reporter posts display-mode once per session"
```

---

### Task 4: Per-student badge in the coach admin

**Files:**
- Modify: `backend/apps/accounts/serializers.py` (`StudentListSerializer`), `backend/apps/usage/tests/test_capture.py` (add a serializer assertion) OR a new `test_serializer.py`
- Modify: the coach student list/detail UI under `frontend-customer/src/app/admin/students/`

**Interfaces:**
- Consumes: `User.last_display_mode`, `User.last_platform` (Task 1).
- Produces: those two fields in the student API payload + a badge in the admin student row.

- [ ] **Step 1: Write the failing serializer test**

Create `backend/apps/usage/tests/test_serializer.py`:

```python
import pytest

from apps.accounts.models import User
from apps.accounts.serializers import StudentListSerializer

pytestmark = pytest.mark.django_db(transaction=True)


def test_student_serializer_exposes_usage_fields(tenant_ctx):
    user = User.objects.create_user(email="s@u.com", name="S", password="x", role="student")
    user.last_display_mode = "pwa"
    user.last_platform = "ios"
    user.save(update_fields=["last_display_mode", "last_platform"])
    data = StudentListSerializer(user).data
    assert data["last_display_mode"] == "pwa"
    assert data["last_platform"] == "ios"
```

- [ ] **Step 2: Run it to confirm failure**

Run: `docker compose exec django pytest apps/usage/tests/test_serializer.py -v`
Expected: FAIL — `KeyError: 'last_display_mode'` (not in the serializer fields).

- [ ] **Step 3: Add the fields to the serializer**

In `backend/apps/accounts/serializers.py`, add `"last_display_mode"` and `"last_platform"` to `StudentListSerializer.Meta.fields` (alongside `last_login`, `enrolled_count`). Both are read-only model fields, so no extra method is needed.

- [ ] **Step 4: Run the test, pass**

Run: `docker compose exec django pytest apps/usage/tests/test_serializer.py -v`
Expected: PASS.

- [ ] **Step 5: Frontend badge**

Read the student list (and detail, if separate) under `frontend-customer/src/app/admin/students/`. The student objects now include `last_display_mode` (`"pwa"|"browser"|""`) and `last_platform` (`"ios"|"android"|"desktop"|"other"|""`). Add a small, in-pattern badge to each student row (and the detail header) that renders, when `last_display_mode` is non-empty:

```tsx
{student.last_display_mode && (
  <span className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
    {student.last_display_mode === "pwa" ? "📱 PWA" : "🌐 Web"}
    {student.last_platform ? ` · ${student.last_platform}` : ""}
  </span>
)}
```

Add `last_display_mode?: string` and `last_platform?: string` to the student TypeScript type used by that page (find it near the existing student type — it has `enrolled_count`). Keep styling consistent with the existing row; this is a display-only addition, not a layout change.

- [ ] **Step 6: Verify**

Run: `cd frontend-customer && npm run build`
Expected: build succeeds.
Behavior: in the coach admin students list, a student who has loaded the app shows a `📱 PWA · ios` / `🌐 Web` badge; a student with no recorded usage shows none.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/accounts/serializers.py backend/apps/usage/tests/test_serializer.py frontend-customer/src/app/admin/students
git commit -m "feat(usage): expose + show last PWA/browser mode per student in coach admin"
```

---

## Self-Review

**Spec coverage (Phase A scope):**
- Shared `apps.usage` + `UsageEvent(user, tenant, mode, platform, day)` daily-deduped → Task 1.
- Denormalized `last_display_mode`/`last_platform`/`first_pwa_at` on `User` → Task 1.
- Capture `POST /api/v1/me/usage/`, students-only, upsert + update User → Task 2.
- Client reporter once/session, authed/non-admin, coarse platform, failure-swallowed → Task 3.
- Per-student last-seen badge in coach admin → Task 4.
- Privacy (coarse platform only), failure isolation, students-only → enforced in Tasks 2 & 3.
- (Coach dashboard = Phase B; superadmin dashboard = Phase C — not in this plan.)

**Placeholder scan:** Code is complete. The one open-ended step is Task 4 Step 5's frontend placement (depends on the real student-list markup) — it ships a concrete badge snippet + type addition and a clear "display-only, match existing row" instruction, which is an integration placement, not a missing-logic placeholder.

**Type consistency:** `mode` ∈ {pwa, browser} and `platform` ∈ {ios, android, desktop, other} are identical across the model (Task 1), endpoint validation (Task 2), reporter (Task 3), and badge (Task 4); `UsageEvent` field names and the three `User` fields match across all tasks; `UsageEvent` is a tenant-schema model (no tenant column) written in the request's tenant context, per the Global Constraints.

**Out of scope (Phase B/C):** `/api/v1/admin/usage/summary/`, coach dashboard widget, superadmin platform-wide endpoint + widget.
