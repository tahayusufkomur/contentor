# PWA Usage Tracking — Phase B: Coach Adoption Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each coach a tenant-scoped view of how their students reach the app — installed-PWA vs browser split, install count, and a 30-day trend — via a read API and a widget on the coach `/admin` dashboard.

**Architecture:** A new tenant-scoped read endpoint `GET /api/v1/admin/usage/summary/?days=30` aggregates the tenant's own `UsageEvent` rows (Phase A) with conditional `Count` aggregation. Because the request runs in the tenant's schema and `UsageEvent` is a tenant-app model, scoping is automatic — no tenant filter, exactly like the existing `admin_stats`. A client widget (`UsageAdoptionCard`) on the coach dashboard fetches the summary and renders the split + install count + a dependency-free CSS bar trend.

**Tech Stack:** Django 5.1 + DRF, django-tenants, Next.js 14 (`frontend-customer`), pytest.

**Spec:** `docs/superpowers/specs/2026-06-20-pwa-usage-tracking-design.md` (Phase B of the A/B/C rollout). Phase A (capture + per-student) is merged. This consumes Phase A's `UsageEvent(user, mode, platform, day)` and `User.first_pwa_at`.

## Global Constraints

- **Tenant-scoped, coach-only:** the endpoint uses the default `TenantJWTAuthentication` (do NOT override `authentication_classes`) and `permission_classes([IsCoachOrOwner])` (`from apps.core.permissions import IsCoachOrOwner`). It runs in the tenant schema, so it queries `UsageEvent`/`User` with **no tenant filter** — identical to `apps/tenant_config/views.py::admin_stats`. Cross-tenant isolation is structural (separate Postgres schema tables), the same guarantee `admin_stats` relies on.
- **Endpoint contract:** `GET /api/v1/admin/usage/summary/?days=30` → `200` with `{ "pwa_sessions": int, "browser_sessions": int, "pwa_pct": int, "installed_students": int, "daily": [{"day": "YYYY-MM-DD", "pwa": int, "browser": int}, ...] }`. `days` defaults to 30, is parsed defensively, and is clamped to `[1, 365]`. `pwa_pct` is integer-rounded and is `0` when there is no usage (never divides by zero). `installed_students` counts students with `first_pwa_at` set (all-time install proxy), not windowed.
- **Tenant-test convention** (same as `apps/usage/tests/test_capture.py`): `@pytest.mark.django_db(transaction=True)`, depend on the `tenant_ctx` fixture (from `backend/conftest.py`), create users via `User.objects.create_user(email=, name=, password=, role=)`; API tests use `APIClient(HTTP_HOST="shared-test.localhost")` + `force_authenticate`.
- **Routing:** mirror `apps/notifications/admin_urls.py` — a new `apps/usage/admin_urls.py` included in `backend/config/urls.py` at the `api/v1/admin/` prefix.
- **No chart library:** `frontend-customer` has no charting dep and MUST NOT gain one. The trend renders as plain CSS/`div` bars.
- **Hardcoded English UI strings:** the coach dashboard (`src/app/admin/page.tsx`) and 26/29 admin pages use hardcoded English, not `next-intl`. The widget matches its host page with hardcoded English (this supersedes the spec's generic "en + tr" note for this surface — see Self-Review).
- **No frontend test runner** — frontend verification is `cd frontend-customer && npm run build` (do NOT add Jest/Vitest).
- **Commits:** commit per task (confirm commit go-ahead at execution).

---

### Task 1: Coach summary endpoint `GET /api/v1/admin/usage/summary/`

**Files:**
- Modify: `backend/apps/usage/views.py` (add `usage_summary`)
- Create: `backend/apps/usage/admin_urls.py`, `backend/apps/usage/tests/test_summary.py`
- Modify: `backend/config/urls.py` (include `apps.usage.admin_urls`)

**Interfaces:**
- Consumes: `UsageEvent(user, mode, platform, day)` and `User.first_pwa_at` (Phase A). Reads run in the request's tenant schema automatically.
- Produces: `GET /api/v1/admin/usage/summary/?days=30` → the payload defined in Global Constraints. Consumed by Task 2.

- [ ] **Step 1: Write the failing test**

Create `backend/apps/usage/tests/test_summary.py`:

```python
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.usage.models import UsageEvent

pytestmark = pytest.mark.django_db(transaction=True)
SHARED_DOMAIN = "shared-test.localhost"
URL = "/api/v1/admin/usage/summary/"


def _client(user):
    c = APIClient(HTTP_HOST=SHARED_DOMAIN)
    c.force_authenticate(user=user)
    return c


def _coach():
    return User.objects.create_user(email="coach@u.com", name="Coach", password="x", role="owner")


def test_summary_aggregates_split_and_installs(tenant_ctx):
    coach = _coach()
    today = timezone.now().date()
    s1 = User.objects.create_user(email="s1@u.com", name="S1", password="x", role="student")
    s2 = User.objects.create_user(email="s2@u.com", name="S2", password="x", role="student")
    s1.first_pwa_at = timezone.now()
    s1.save(update_fields=["first_pwa_at"])
    UsageEvent.objects.create(user=s1, mode="pwa", platform="ios", day=today)
    UsageEvent.objects.create(user=s2, mode="pwa", platform="desktop", day=today)
    UsageEvent.objects.create(user=s2, mode="browser", platform="android", day=today)

    res = _client(coach).get(URL)
    assert res.status_code == 200
    data = res.json()
    assert data["pwa_sessions"] == 2
    assert data["browser_sessions"] == 1
    assert data["pwa_pct"] == 67  # round(2 / 3 * 100)
    assert data["installed_students"] == 1
    assert {"day": today.isoformat(), "pwa": 2, "browser": 1} in data["daily"]


def test_summary_windowing_excludes_old(tenant_ctx):
    coach = _coach()
    s = User.objects.create_user(email="s@u.com", name="S", password="x", role="student")
    old = timezone.now().date() - timedelta(days=40)
    UsageEvent.objects.create(user=s, mode="pwa", platform="ios", day=old)
    res = _client(coach).get(URL + "?days=30")
    assert res.status_code == 200
    data = res.json()
    assert data["pwa_sessions"] == 0
    assert data["daily"] == []


def test_summary_empty_is_zeroed(tenant_ctx):
    res = _client(_coach()).get(URL)
    assert res.status_code == 200
    assert res.json() == {
        "pwa_sessions": 0,
        "browser_sessions": 0,
        "pwa_pct": 0,
        "installed_students": 0,
        "daily": [],
    }


def test_summary_forbidden_for_student(tenant_ctx):
    student = User.objects.create_user(email="st@u.com", name="St", password="x", role="student")
    res = _client(student).get(URL)
    assert res.status_code == 403
```

- [ ] **Step 2: Run it to confirm failure**

Run: `docker compose exec django pytest apps/usage/tests/test_summary.py -v`
Expected: FAIL (404 — route not wired).

- [ ] **Step 3: Implement the view**

In `backend/apps/usage/views.py`, add these imports at the top (keep the existing `record_usage` imports) and append the view. The full added imports:

```python
from datetime import timedelta

from django.db.models import Count, Q

from apps.accounts.models import User
from apps.core.permissions import IsCoachOrOwner
```

Append the view (after `record_usage`):

```python
@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def usage_summary(request):
    try:
        days = int(request.query_params.get("days", 30))
    except (TypeError, ValueError):
        days = 30
    days = max(1, min(days, 365))
    cutoff = timezone.now().date() - timedelta(days=days - 1)

    qs = UsageEvent.objects.filter(day__gte=cutoff)
    totals = qs.aggregate(
        pwa=Count("id", filter=Q(mode="pwa")),
        browser=Count("id", filter=Q(mode="browser")),
    )
    pwa_sessions = totals["pwa"] or 0
    browser_sessions = totals["browser"] or 0
    total = pwa_sessions + browser_sessions
    pwa_pct = round(pwa_sessions / total * 100) if total else 0

    installed_students = User.objects.filter(
        role="student", first_pwa_at__isnull=False
    ).count()

    daily = [
        {"day": row["day"].isoformat(), "pwa": row["pwa"], "browser": row["browser"]}
        for row in qs.values("day")
        .annotate(
            pwa=Count("id", filter=Q(mode="pwa")),
            browser=Count("id", filter=Q(mode="browser")),
        )
        .order_by("day")
    ]

    return Response(
        {
            "pwa_sessions": pwa_sessions,
            "browser_sessions": browser_sessions,
            "pwa_pct": pwa_pct,
            "installed_students": installed_students,
            "daily": daily,
        }
    )
```

- [ ] **Step 4: Create the admin URL module**

Create `backend/apps/usage/admin_urls.py` (mirrors `apps/notifications/admin_urls.py`):

```python
from django.urls import path

from . import views

urlpatterns = [path("usage/summary/", views.usage_summary, name="usage-summary")]
```

- [ ] **Step 5: Wire it into the root URLconf**

In `backend/config/urls.py`, add the include alongside the other `api/v1/admin/` includes (right after the `apps.notifications.admin_urls` line):

```python
    path("api/v1/admin/", include("apps.usage.admin_urls")),
```

- [ ] **Step 6: Run the tests, pass**

Run: `docker compose exec django pytest apps/usage/tests/test_summary.py -v`
Expected: 4 PASS.

- [ ] **Step 7: Confirm the whole usage suite still passes**

Run: `docker compose exec django pytest apps/usage -v`
Expected: all green (Phase A's 9 + these 4 = 13).

- [ ] **Step 8: Commit**

```bash
git add backend/apps/usage/views.py backend/apps/usage/admin_urls.py backend/apps/usage/tests/test_summary.py backend/config/urls.py
git commit -m "feat(usage): coach adoption summary endpoint GET /admin/usage/summary/"
```

---

### Task 2: Coach dashboard widget (`UsageAdoptionCard`)

**Files:**
- Create: `frontend-customer/src/components/admin/usage-adoption-card.tsx`
- Modify: `frontend-customer/src/app/admin/page.tsx` (import + render)

**Interfaces:**
- Consumes: `GET /api/v1/admin/usage/summary/?days=30` (Task 1), `clientFetch` (`@/lib/api-client`), `Card`/`CardContent`/`CardHeader`/`CardTitle` (`@/components/ui/card`), `Skeleton` (`@/components/ui/skeleton`), `Smartphone`/`Globe` (`lucide-react`).
- Produces: `<UsageAdoptionCard />` — a self-fetching dashboard card.

- [ ] **Step 1: Create the widget**

Create `frontend-customer/src/components/admin/usage-adoption-card.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { Globe, Smartphone } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { clientFetch } from "@/lib/api-client"

interface DailyPoint {
  day: string
  pwa: number
  browser: number
}

interface UsageSummary {
  pwa_sessions: number
  browser_sessions: number
  pwa_pct: number
  installed_students: number
  daily: DailyPoint[]
}

export function UsageAdoptionCard() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<UsageSummary | null>(null)

  useEffect(() => {
    clientFetch<UsageSummary>("/api/v1/admin/usage/summary/?days=30")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  const webPct = data.pwa_sessions + data.browser_sessions ? 100 - data.pwa_pct : 0
  const maxDay = data.daily.reduce((m, d) => Math.max(m, d.pwa + d.browser), 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          App adoption (30 days)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-2xl font-bold">{data.installed_students}</p>
          <p className="text-xs text-muted-foreground">students installed the app</p>
        </div>

        {/* PWA vs Web split */}
        <div className="space-y-1.5">
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            <div className="bg-primary" style={{ width: `${data.pwa_pct}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Smartphone className="h-3 w-3" /> PWA {data.pwa_pct}%
            </span>
            <span className="inline-flex items-center gap-1">
              <Globe className="h-3 w-3" /> Web {webPct}%
            </span>
          </div>
        </div>

        {/* 30-day trend (dependency-free CSS bars) */}
        {maxDay > 0 ? (
          <div className="flex h-16 items-end gap-px">
            {data.daily.map((d) => {
              const dayTotal = d.pwa + d.browser
              return (
                <div
                  key={d.day}
                  className="flex flex-1 flex-col-reverse rounded-sm bg-muted-foreground/20"
                  style={{ height: `${(dayTotal / maxDay) * 100}%` }}
                  title={`${d.day}: ${d.pwa} PWA / ${d.browser} Web`}
                >
                  <div
                    className="bg-primary"
                    style={{ height: dayTotal ? `${(d.pwa / dayTotal) * 100}%` : "0%" }}
                  />
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No app activity yet.</p>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Render it on the dashboard**

In `frontend-customer/src/app/admin/page.tsx`, add the import near the other component imports:

```tsx
import { UsageAdoptionCard } from "@/components/admin/usage-adoption-card"
```

Then render it between the stat-cards grid (the closing `</div>` of the `grid ... lg:grid-cols-4` block) and the `{/* Quick actions */}` block, constrained to a sensible width:

```tsx
      {/* App adoption */}
      <div className="grid gap-4 lg:grid-cols-2">
        <UsageAdoptionCard />
      </div>
```

- [ ] **Step 3: Verify the build**

Run: `cd frontend-customer && npm run build`
Expected: build succeeds (no type errors; no new dependency).
Behavior (stack up, logged in as a coach at `http://demo-faceyoga.localhost/admin`): the dashboard shows an "App adoption (30 days)" card with the install count, a PWA/Web split bar, and a 30-day bar trend (or "No app activity yet." when there are no events).

- [ ] **Step 4: Commit**

```bash
git add frontend-customer/src/components/admin/usage-adoption-card.tsx frontend-customer/src/app/admin/page.tsx
git commit -m "feat(usage): coach dashboard app-adoption widget (PWA vs web split + trend)"
```

---

## Self-Review

**Spec coverage (Phase B scope):**
- `GET /api/v1/admin/usage/summary/?days=30`, owner/coach only, tenant-scoped → Task 1.
- Payload `{pwa_sessions, browser_sessions, pwa_pct, installed_students, daily:[{day,pwa,browser}]}` → Task 1 (matches the spec field-for-field).
- Coach `/admin` widget rendering the split + install count + trend → Task 2.
- Tenant scoping (no leakage) → structural via the tenant schema (Global Constraints), same as `admin_stats`; asserted indirectly by the windowing/aggregation tests in the active tenant.

**Placeholder scan:** No TBD/TODO. The one integration-placement instruction (Task 2 Step 2 — where to insert the widget in `page.tsx`) names the exact anchors (after the `lg:grid-cols-4` grid, before `{/* Quick actions */}`) and ships the exact JSX, so it is a placement instruction, not a missing-logic placeholder.

**Type consistency:** The TS `UsageSummary`/`DailyPoint` shape mirrors the endpoint payload exactly (`pwa_sessions`, `browser_sessions`, `pwa_pct`, `installed_students`, `daily[].{day,pwa,browser}`); `mode` values (`pwa`/`browser`) match Phase A; the endpoint name `usage_summary` is consistent across `views.py`, `admin_urls.py`, and the test.

**Deliberate deviation from the spec:** the spec's cross-cutting note says admin labels go to `en` + `tr`. The coach dashboard and 26/29 admin pages are hardcoded English (no `next-intl`); introducing i18n for one widget inside a hardcoded-English host page would be inconsistent. Per "follow established patterns," the widget uses hardcoded English. (If the user wants the admin surface internationalized, that's a separate, broader change.)

**Out of scope (Phase C):** the superadmin platform-wide endpoint (iterating tenant schemas / rollup) and the superadmin-panel widget.
