# PWA Usage Tracking — Phase C: Superadmin Platform-Wide Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the superadmin a platform-wide view of PWA adoption — total installs, PWA-vs-browser split, and a per-tenant breakdown — via a superadmin API and a widget on the platform dashboard.

**Architecture:** A new superadmin endpoint `GET /api/v1/platform/usage/` aggregates each active tenant's Phase A `UsageEvent`/`User` data by **iterating tenant schemas** with `tenant_context` — the exact pattern of the existing `_marketplace_totals` in `apps/core/platform/views.py` (importing the tenant model inside the context, skipping any broken schema so one bad tenant never 500s the dashboard). This is iterate-live, which the spec's open question leaves to Phase C: the established marketplace rollup already chose iterate-live "at the current fleet size," so we match it (a nightly rollup table is the documented future option if tenant count grows). A self-fetching `PlatformUsageCard` on the superadmin dashboard renders platform totals + a per-tenant table.

**Tech Stack:** Django 5.1 + DRF, django-tenants, Next.js 14 (`frontend-main` — the superadmin/marketing app), pytest.

**Spec:** `docs/superpowers/specs/2026-06-20-pwa-usage-tracking-design.md` (Phase C of the A/B/C rollout). Phases A + B are merged. This consumes Phase A's tenant-schema `UsageEvent(user, mode, platform, day)` and `User.first_pwa_at`.

## Global Constraints

- **Superadmin-only, public-schema entry:** the endpoint uses the default DRF auth and `permission_classes([IsSuperUser])` (`from ..permissions import IsSuperUser`, already imported in `platform/views.py`). It lives alongside the other `platform_*` views in `apps/core/platform/views.py` and is routed in `apps/core/platform/urls.py` (prefix `api/v1/platform/`).
- **Iterate-live across tenants (mirror `_marketplace_totals`):** loop `Tenant.objects.exclude(schema_name="public").filter(is_active=True)`; for each, `with tenant_context(tenant):` import the tenant model INSIDE the block and count. Wrap each tenant body in `try/except Exception` with `# noqa: BLE001, S112 — a broken schema must not take down the dashboard` + `logger.warning("platform usage: skipping tenant %s", tenant.slug, exc_info=True)` and `continue`. Never let one tenant's failure 500 the response.
- **Endpoint contract:** `GET /api/v1/platform/usage/?days=30` → `200` with
  `{ "installed_students": int, "pwa_sessions": int, "browser_sessions": int, "pwa_pct": int, "by_tenant": [ {"tenant": str, "slug": str, "installed": int, "pwa_sessions": int, "browser_sessions": int, "pwa_pct": int}, ... ] }`.
  `installed_students`/`pwa_sessions`/`browser_sessions`/`pwa_pct` are platform-wide sums (sessions are the last `days` days; installs are all-time). `days` defaults to 30, parsed defensively, clamped `[1,365]`. Every `pwa_pct` is integer-rounded and `0` when its denominator is 0 (no ZeroDivisionError). `by_tenant` includes only tenants with any activity (`pwa or browser or installed`), sorted by `(installed, pwa_sessions)` descending.
- **Test harness for platform iteration** (mirror `apps/core/tests/test_platform_admin_endpoints.py`): `@pytest.mark.django_db(transaction=True)`; a `superuser` fixture `User.objects.create(email=..., region="global", role="owner", is_staff=True, is_superuser=True)` depending on `restore_public` (public schema); seed tenant data inside an explicit `with tenant_context(tenant):` block; call via `APIClient(HTTP_HOST="shared-test.localhost")` + `force_authenticate`. Clean up seeded tenant rows in a `finally`.
- **Frontend = `frontend-main` superadmin app:** the dashboard (`frontend-main/src/app/admin/page.tsx`) is hardcoded English (no next-intl), fetches with raw `fetch("/api/v1/platform/...", { credentials: "same-origin" })`, and uses `@/components/ui/{card,table,skeleton}` + `lucide-react`. The widget matches that file's style: **double quotes + semicolons**, hardcoded English.
- **No chart library** in `frontend-main` may be added — the split is a CSS bar; the breakdown is a `Table`.
- **No frontend test runner** — frontend verification is `cd frontend-main && npm run build`.
- **Commits:** commit per task (confirm commit go-ahead at execution).

---

### Task 1: Superadmin endpoint `GET /api/v1/platform/usage/`

**Files:**
- Modify: `backend/apps/core/platform/views.py` (add imports + `platform_usage`)
- Modify: `backend/apps/core/platform/urls.py` (route)
- Create: `backend/apps/core/tests/test_platform_usage.py`

**Interfaces:**
- Consumes: Phase A `UsageEvent(user, mode, platform, day)` + `User.first_pwa_at` (per tenant schema); `Tenant` + `tenant_context` + `IsSuperUser` (already imported in `platform/views.py`).
- Produces: `GET /api/v1/platform/usage/?days=30` → the payload in Global Constraints. Consumed by Task 2.

- [ ] **Step 1: Write the failing test**

Create `backend/apps/core/tests/test_platform_usage.py`:

```python
"""Superadmin platform-wide PWA usage rollup across tenant schemas."""

from __future__ import annotations

import pytest
from django.utils import timezone
from django_tenants.utils import tenant_context
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.usage.models import UsageEvent

SHARED_DOMAIN = "shared-test.localhost"
pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def superuser(restore_public):
    return User.objects.create(
        email="root-usage@contentor.app",
        region="global",
        role="owner",
        is_staff=True,
        is_superuser=True,
    )


@pytest.fixture()
def coach_user(restore_public):
    return User.objects.create(email="coach-usage@contentor.app", region="global", role="owner")


def _client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


def test_platform_usage_aggregates_and_breaks_down_by_tenant(superuser, restore_public):
    tenant = restore_public
    today = timezone.now().date()
    with tenant_context(tenant):
        s1 = User.objects.create_user(email="s1@u.com", name="S1", password="x", role="student")
        s2 = User.objects.create_user(email="s2@u.com", name="S2", password="x", role="student")
        s1.first_pwa_at = timezone.now()
        s1.save(update_fields=["first_pwa_at"])
        UsageEvent.objects.create(user=s1, mode="pwa", platform="ios", day=today)
        UsageEvent.objects.create(user=s2, mode="pwa", platform="desktop", day=today)
        UsageEvent.objects.create(user=s2, mode="browser", platform="android", day=today)
    try:
        resp = _client(superuser).get("/api/v1/platform/usage/")
        assert resp.status_code == 200, resp.content
        body = resp.json()
        assert body["installed_students"] == 1
        assert body["pwa_sessions"] == 2
        assert body["browser_sessions"] == 1
        assert body["pwa_pct"] == 67  # round(2 / 3 * 100)
        row = next(r for r in body["by_tenant"] if r["slug"] == tenant.slug)
        assert row["installed"] == 1
        assert row["pwa_sessions"] == 2
        assert row["browser_sessions"] == 1
        assert row["pwa_pct"] == 67
    finally:
        with tenant_context(tenant):
            UsageEvent.objects.all().delete()
            User.objects.filter(role="student").delete()


def test_platform_usage_requires_superuser(coach_user):
    resp = _client(coach_user).get("/api/v1/platform/usage/")
    assert resp.status_code == 403
```

- [ ] **Step 2: Run it to confirm failure**

Run: `docker compose exec django pytest apps/core/tests/test_platform_usage.py -v`
Expected: FAIL (404 — route not wired).

- [ ] **Step 3: Add the two missing imports**

At the top of `backend/apps/core/platform/views.py`, add (the file already imports `Count, Q, Sum`, `tenant_context`, `Tenant`, `IsSuperUser`, and defines `logger`):

```python
from datetime import timedelta

from django.utils import timezone
```

(Place `from datetime import timedelta` with the stdlib imports and `from django.utils import timezone` with the other `django.*` imports, matching the file's existing import grouping.)

- [ ] **Step 4: Implement the view**

Append to `backend/apps/core/platform/views.py`:

```python
@api_view(["GET"])
@permission_classes([IsSuperUser])
def platform_usage(request):
    """Platform-wide PWA-adoption rollup across all active tenants.

    Iterates tenant schemas — fine at the current fleet size, same approach as
    `_marketplace_totals`; revisit with a nightly rollup table if tenant count
    grows. Per tenant: count last-`days` UsageEvent rows by mode + students with
    a recorded first PWA load. A broken schema is skipped, never 500s the page.
    """
    try:
        days = int(request.query_params.get("days", 30))
    except (TypeError, ValueError):
        days = 30
    days = max(1, min(days, 365))
    cutoff = timezone.now().date() - timedelta(days=days - 1)

    tenants = Tenant.objects.exclude(schema_name="public").filter(is_active=True)
    total_pwa = 0
    total_browser = 0
    total_installed = 0
    by_tenant = []
    for tenant in tenants:
        try:
            with tenant_context(tenant):
                from apps.accounts.models import User
                from apps.usage.models import UsageEvent

                totals = UsageEvent.objects.filter(day__gte=cutoff).aggregate(
                    pwa=Count("id", filter=Q(mode="pwa")),
                    browser=Count("id", filter=Q(mode="browser")),
                )
                pwa = totals["pwa"] or 0
                browser = totals["browser"] or 0
                installed = User.objects.filter(
                    role="student", first_pwa_at__isnull=False
                ).count()
        except Exception:  # noqa: BLE001, S112 — a broken schema must not take down the dashboard
            logger.warning("platform usage: skipping tenant %s", tenant.slug, exc_info=True)
            continue

        total_pwa += pwa
        total_browser += browser
        total_installed += installed
        if pwa or browser or installed:
            sessions = pwa + browser
            by_tenant.append(
                {
                    "tenant": tenant.name,
                    "slug": tenant.slug,
                    "installed": installed,
                    "pwa_sessions": pwa,
                    "browser_sessions": browser,
                    "pwa_pct": round(pwa / sessions * 100) if sessions else 0,
                }
            )

    by_tenant.sort(key=lambda r: (r["installed"], r["pwa_sessions"]), reverse=True)
    grand_total = total_pwa + total_browser
    return Response(
        {
            "installed_students": total_installed,
            "pwa_sessions": total_pwa,
            "browser_sessions": total_browser,
            "pwa_pct": round(total_pwa / grand_total * 100) if grand_total else 0,
            "by_tenant": by_tenant,
        }
    )
```

- [ ] **Step 5: Wire the route**

In `backend/apps/core/platform/urls.py`, add inside `urlpatterns` (e.g. right after the `dashboard/` path):

```python
    path("usage/", views.platform_usage, name="platform-usage"),
```

- [ ] **Step 6: Run the tests, pass**

Run: `docker compose exec django pytest apps/core/tests/test_platform_usage.py -v`
Expected: 2 PASS.

- [ ] **Step 7: Guard against regressions in the platform suite**

Run: `docker compose exec django pytest apps/core/tests/test_platform_admin_endpoints.py apps/core/tests/test_platform_usage.py -q`
Expected: all green (existing platform tests unaffected).

- [ ] **Step 8: Lint + commit**

Run: `docker compose exec django ruff check apps/core/platform apps/core/tests/test_platform_usage.py && docker compose exec django ruff format --check apps/core/platform apps/core/tests/test_platform_usage.py` (fix + re-run if needed).

```bash
git add backend/apps/core/platform/views.py backend/apps/core/platform/urls.py backend/apps/core/tests/test_platform_usage.py
git commit -m "feat(usage): superadmin platform-wide PWA adoption endpoint GET /platform/usage/"
```

---

### Task 2: Superadmin dashboard widget (`PlatformUsageCard`)

**Files:**
- Create: `frontend-main/src/components/admin/platform-usage-card.tsx`
- Modify: `frontend-main/src/app/admin/page.tsx` (import + render)

**Interfaces:**
- Consumes: `GET /api/v1/platform/usage/` (Task 1); `@/components/ui/{card,table,skeleton}`; `Smartphone`/`Globe` from `lucide-react`.
- Produces: `<PlatformUsageCard />` — a self-fetching superadmin dashboard card.

- [ ] **Step 1: Create the widget**

Create `frontend-main/src/components/admin/platform-usage-card.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Globe, Smartphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TenantUsageRow {
  tenant: string;
  slug: string;
  installed: number;
  pwa_sessions: number;
  browser_sessions: number;
  pwa_pct: number;
}

interface PlatformUsage {
  installed_students: number;
  pwa_sessions: number;
  browser_sessions: number;
  pwa_pct: number;
  by_tenant: TenantUsageRow[];
}

export function PlatformUsageCard() {
  const [data, setData] = useState<PlatformUsage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/v1/platform/usage/", { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return null;

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const webPct =
    data.pwa_sessions + data.browser_sessions ? 100 - data.pwa_pct : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">App Adoption (PWA)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-end gap-8">
          <div>
            <p className="text-3xl font-bold text-foreground">
              {data.installed_students}
            </p>
            <p className="text-xs text-muted-foreground">
              students installed the app
            </p>
          </div>
          <div className="min-w-[180px] flex-1 space-y-1.5">
            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="bg-primary"
                style={{ width: `${data.pwa_pct}%` }}
              />
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
        </div>

        {data.by_tenant.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead className="text-right">Installed</TableHead>
                <TableHead className="text-right">PWA %</TableHead>
                <TableHead className="text-right">30d sessions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.by_tenant.map((row) => (
                <TableRow key={row.slug}>
                  <TableCell>
                    <span className="font-medium text-foreground">
                      {row.tenant}
                    </span>
                    <p className="text-xs text-muted-foreground">{row.slug}</p>
                  </TableCell>
                  <TableCell className="text-right">{row.installed}</TableCell>
                  <TableCell className="text-right">{row.pwa_pct}%</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {row.pwa_sessions + row.browser_sessions}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">
            No app activity recorded yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Render it on the superadmin dashboard**

In `frontend-main/src/app/admin/page.tsx`, add the import near the other imports:

```tsx
import { PlatformUsageCard } from "@/components/admin/platform-usage-card";
```

Then, in the returned JSX of the loaded view, insert the widget between the closing `</div>` of the stats grid (the `grid gap-4 md:grid-cols-2 lg:grid-cols-4` block) and the `{/* Recent Tenants */}` block:

```tsx
      {/* App adoption */}
      <PlatformUsageCard />
```

- [ ] **Step 3: Verify the build**

Run: `cd frontend-main && npm run build`
Expected: build succeeds (no type errors; no new dependency).
Behavior (stack up, logged into the superadmin panel at the apex `/admin`): the dashboard shows an "App Adoption (PWA)" card with the platform install count, a PWA/Web split bar, and a per-tenant table (or "No app activity recorded yet." when empty). If the endpoint errors, the card renders nothing (never breaks the dashboard).

- [ ] **Step 4: Commit**

```bash
git add frontend-main/src/components/admin/platform-usage-card.tsx frontend-main/src/app/admin/page.tsx
git commit -m "feat(usage): superadmin dashboard platform-wide PWA adoption widget"
```

---

## Self-Review

**Spec coverage (Phase C scope):**
- Superadmin platform-wide endpoint aggregating across tenants by iterating tenant schemas → Task 1 (mirrors `_marketplace_totals`).
- Platform-wide totals + `by_tenant` breakdown → Task 1 payload (`by_tenant: [{tenant, slug, installed, pwa_sessions, browser_sessions, pwa_pct}]`, a superset of the spec's `{tenant, pwa_pct, installed}`).
- Superadmin-panel widget → Task 2 (`PlatformUsageCard` on the `frontend-main` dashboard).
- Iterate-live vs nightly rollup (spec's open question): **resolved to iterate-live**, matching the established `_marketplace_totals` decision at current fleet size; rollup remains the documented future option.

**Placeholder scan:** No TBD/TODO. The only placement instructions (Task 1 Step 3 import grouping; Task 2 Step 2 widget insertion) name exact anchors and ship exact code.

**Type consistency:** the TS `PlatformUsage`/`TenantUsageRow` interfaces mirror the endpoint payload field-for-field; `pwa`/`browser` modes match Phases A/B; `pwa_pct` is integer both server-side (`round`) and as consumed; the endpoint name `platform_usage` is consistent across `views.py`, `urls.py`, and the test.

**Failure isolation:** the endpoint skips broken tenant schemas (logged, never 500); the widget swallows fetch failures and renders nothing — neither can break the superadmin dashboard.

**Deliberate consistency with Phases A/B:** hardcoded-English UI (the superadmin dashboard and its peers are hardcoded English), no chart library, integer `pwa_pct` with divide-by-zero guards — same conventions as the merged coach dashboard.
