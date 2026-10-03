# P2-2: Admin "Site AI" Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give coaches an ongoing, metered way to edit their site in natural language from the admin — "make the hero warmer", "shorten the about copy" — enforcing the monthly per-plan allowance (free 0 / starter 3 / pro 5) while keeping free manual editing one click away.

**Architecture:** The engine and metering already exist from Phase 1 (`apps/core/onboarding/site_ai.py`: `preview_edit`, `apply_edit`, `availability`, `record_update`, plus the `SiteAiUpdateUsage` model and `PlatformPlan.max_site_ai_updates`) — Plan 5 built them explicitly for this page. This plan adds only the **coach-JWT surface**: a status/preview/apply endpoint trio under `/api/v1/admin/site-ai/`, a `site_ai` entitlement key, and an `/admin/site-ai` page that reuses the customer app's existing `streamAi` + `AiProgress` + `useAsyncAction` conventions.

**Tech Stack:** Django 5.1, DRF (SSE via `EventStreamRenderer`), django-tenants, Next.js 14 App Router, next-intl, sonner, pytest, Playwright.

## Why this plan exists

Phase 1's reveal chat proved the interaction but metered it with a one-off counter in `wizard_state` under wizard-token auth. The admin needs the same interaction under coach-JWT auth, metered **monthly** against the plan — which is what `site_ai.availability()` was written for (its docstring literally reads "The Phase-2 admin Site AI's monthly-quota gate"). Per the Phase 2 spec, this is also the surface where free coaches meet the upgrade prompt, so it must never feel like a wall: preview stays free, and manual editing is offered inline.

**Verified facts** (file:line):
- Engine: `site_ai.preview_edit(tenant, instruction) -> (pages, extras, cost)` (does not save) and `site_ai.apply_edit(tenant, pages, extras=None)` (persists `cfg.pages`) — `backend/apps/core/onboarding/site_ai.py:67,100`. Both open their own `tenant_context`.
- Metering: `record_attempt_cost` on every attempt, `record_update` only on a persisted apply — `site_ai.py:27,33`. `availability(tenant)` returns `{enabled, remaining, limit, reason}` where `reason` is `None` or `"quota_exhausted"` — `site_ai.py:49-57`.
- `PlatformPlan.max_site_ai_updates` — `backend/apps/core/models.py:202`; seeded free 0 / starter 3 / pro 5.
- Entitlements are computed in `_compute_entitlements(tenant)` — `backend/apps/billing/views/platform.py:236-252`; the client union is `EntitlementKey` — `frontend-customer/src/lib/entitlements.ts:12-21`. **There is no `site_ai` key today.**
- Admin routes mount as a separate `admin_urls.py` under `/api/v1/admin/<prefix>/` — `backend/config/urls.py:49-55`; `apps/tenant_config/urls.py` is already mounted bare at `/api/v1/admin/`.
- Admin views use `@permission_classes([IsCoachOrOwner])` and must **not** set `@authentication_classes` (`TenantJWTAuthentication` is the DRF default); a streaming view additionally needs `@renderer_classes([JSONRenderer, EventStreamRenderer])` — `backend/apps/blog/views.py:207-210`.
- Client streaming: `streamAi<TDone, TPreview>(path, body, handlers, signal)` — `frontend-customer/src/lib/ai-stream.ts:51`; it content-type-sniffs and returns a plain-JSON pre-stream guard response unchanged. `AiProgress` (phases/currentPhase/onCancel/children) — `frontend-customer/src/components/ui/ai-progress.tsx`.
- The quota-status + upsell precedent to copy: `BlogAiStatus`/`fetchAiStatus` in `frontend-customer/src/lib/blog-api.ts:35-41,89` and the upsell banner in `frontend-customer/src/app/admin/blog/page.tsx:63-99` (`showUpsell = status?.reason === "upgrade_required"`, links to `/admin/billing/subscription`).
- `frontend-customer/src/app/admin/loading.tsx` exists, so a new `/admin/site-ai` segment inherits a skeleton — **no new `loading.tsx` is required** (the `make lint` loading check needs one *at or above* the segment).

## Global Constraints

- **Reuse the engine; add no new AI logic.** All edits go through `site_ai.preview_edit`/`apply_edit`, which route through `ai_compose`'s whitelisted-field trust boundary (no arbitrary fields, no fabricated testimonials).
- **Only Apply consumes quota.** Preview is free and streams; `record_update` fires only after a successful persist. `record_attempt_cost` fires on **every** attempt including failures (kill-switch integrity) — mirror the reveal's `finally` block exactly.
- **Never a wall.** A coach with no remaining allowance can still type and preview; only Apply is blocked, with an upgrade prompt and an inline "edit manually instead" link. Manual editing is free on every plan.
- **Free tier reads as "upgrade", not "exhausted".** `limit == 0` means the plan never included the feature → `reason: "upgrade_required"`. Only `limit > 0 and remaining == 0` is `"quota_exhausted"`.
- **Admin auth only.** Every new endpoint is `IsCoachOrOwner` with the default JWT authentication. Do not copy the wizard endpoints' `@authentication_classes([])`.
- Tests: `docker compose exec django pytest <path> -n auto` (dev stack up); frontend `cd frontend-customer && npx vitest run`; `make typecheck`; `make lint`.

## Known limitation (document, do not fix here)

`site_ai.apply_edit()` writes `cfg.save(update_fields=["pages"])` directly, bypassing `TenantConfigView.perform_update` — so an AI apply does **not** populate `setup_progress["pages_edited"]` the way a manual page edit does. The reveal chat already behaves this way; making AI applies feed the setup checklist is a separate concern and is out of scope. Note it in the endpoint docstring so the next reader is not surprised.

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `backend/apps/core/onboarding/site_ai.py` | modify | `availability()` reason precedence (`upgrade_required` vs `quota_exhausted`). |
| `backend/apps/billing/views/platform.py` | modify | `site_ai` entitlement key. |
| `backend/apps/core/site_ai_admin.py` | create | The three coach-JWT views (status, preview SSE, apply). |
| `backend/apps/core/site_ai_admin_urls.py` | create | Routes for the trio. |
| `backend/config/urls.py` | modify | Mount at `/api/v1/admin/site-ai/`. |
| `backend/apps/core/tests/test_site_ai_admin.py` | create | Endpoint + enforcement tests. |
| `frontend-customer/src/lib/entitlements.ts` | modify | Add `"site_ai"` to `EntitlementKey`. |
| `frontend-customer/src/lib/site-ai-api.ts` | create | `fetchSiteAiStatus`, `previewSiteEdit` (stream), `applySiteEdit`. |
| `frontend-customer/src/app/admin/site-ai/page.tsx` | create | The panel. |
| `frontend-customer/src/lib/admin-nav.ts` | modify | Site AI item in My Site. |
| `frontend-customer/messages/{en,tr}/admin.json` | modify | Panel + nav copy. |
| `e2e/specs/28-admin-site-ai.spec.ts`, `e2e/impact-map.json` | create/modify | Paid apply decrements; free sees upgrade. |

---

### Task 1: Reason precedence + the `site_ai` entitlement

**Files:**
- Modify: `backend/apps/core/onboarding/site_ai.py:49-57`
- Modify: `backend/apps/billing/views/platform.py:236-252`
- Modify: `backend/apps/core/tests/test_site_ai.py`
- Modify: `frontend-customer/src/lib/entitlements.ts:12-21`

**Interfaces:**
- Produces: `availability(tenant, month=None) -> {enabled, remaining, limit, reason}` where `reason` is `None` | `"upgrade_required"` (limit 0) | `"quota_exhausted"` (limit > 0, none left). The entitlements payload gains `"site_ai": bool`. The client `EntitlementKey` union gains `"site_ai"`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/core/tests/test_site_ai.py` (it already has a `_tenant(limit, paid=True)` helper and `SCHEMA`):

```python
def test_availability_reason_is_upgrade_required_when_plan_has_no_quota():
    """limit == 0 means the plan never included Site AI — the coach should be
    asked to upgrade, not told they ran out."""
    a = site_ai.availability(_tenant(0, paid=False))
    assert a["limit"] == 0
    assert a["remaining"] == 0
    assert a["enabled"] is False
    assert a["reason"] == "upgrade_required"


def test_availability_reason_is_quota_exhausted_only_after_spending_a_real_quota():
    SiteAiUpdateUsage.objects.create(
        tenant_schema=SCHEMA, month=site_ai.current_month(), updates_used=3
    )
    a = site_ai.availability(_tenant(3))
    assert a["remaining"] == 0
    assert a["reason"] == "quota_exhausted"
```

And add an entitlements test to `backend/apps/billing/tests/test_platform_entitlements_endpoint.py` (mirror how the existing tests in that file build a tenant/plan — read it first and copy the fixture style):

```python
def test_entitlements_include_site_ai_when_the_plan_has_updates():
    """site_ai follows the ai_blog pattern: paid plan AND a non-zero quota."""
    # Build a paid tenant whose plan has max_site_ai_updates=3 using this
    # file's existing helper/fixture, then:
    payload = _compute_entitlements(tenant)
    assert payload["site_ai"] is True
```

- [ ] **Step 2: Run to verify failure**

Run: `docker compose exec django pytest apps/core/tests/test_site_ai.py -k "upgrade_required or quota_exhausted" -v`

Expected: FAIL — `reason` is `"quota_exhausted"` for the limit-0 case.

- [ ] **Step 3: Fix the reason precedence**

In `backend/apps/core/onboarding/site_ai.py`, replace the `availability` body's reason logic:

```python
def availability(tenant, month=None):
    """The admin Site AI's monthly-quota gate. The reveal's free applies are a
    separate counter (wizard_state["reveal_applies_used"]) and do not consult
    this function.

    Reason precedence mirrors apps/blog/ai.py: a plan with no allowance at all
    reads as `upgrade_required` (ask them to upgrade), while a plan whose
    allowance is spent reads as `quota_exhausted` (ask them to wait or upgrade).
    """
    limit = plan_limit(tenant)
    used = tenant_usage(tenant.schema_name, month=month).updates_used
    remaining = max(0, limit - used)
    if limit <= 0:
        reason = "upgrade_required"
    elif remaining <= 0:
        reason = "quota_exhausted"
    else:
        reason = None
    return {"enabled": remaining > 0, "remaining": remaining, "limit": limit, "reason": reason}
```

- [ ] **Step 4: Add the entitlement key**

In `backend/apps/billing/views/platform.py`, inside the dict returned by `_compute_entitlements`, next to `ai_blog`:

```python
        "site_ai": bool(paid and plan and plan.max_site_ai_updates > 0),
```

Also extend that function's docstring bullet list (it documents each key) with:
`` - ``site_ai`` — a paid plan AND a non-zero monthly site-edit quota. ``

In `frontend-customer/src/lib/entitlements.ts`, add to the union:

```typescript
export type EntitlementKey =
  | "live"
  | "ai_blog"
  | "site_ai"
  | "student_bot"
  | "logo_studio"
  | "payouts"
  | "platform_mailbox"
  | "selling";
```

- [ ] **Step 5: Run to verify pass**

Run: `docker compose exec django pytest apps/core/tests/test_site_ai.py apps/billing/tests/test_platform_entitlements_endpoint.py -v`

Expected: PASS. If an existing entitlements test asserts an exact key set, add `site_ai` to its expectation — that is a correct consequence of this change.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/core/onboarding/site_ai.py backend/apps/billing/views/platform.py backend/apps/core/tests/test_site_ai.py backend/apps/billing/tests/test_platform_entitlements_endpoint.py frontend-customer/src/lib/entitlements.ts
git commit -m "feat(site-ai): upgrade_required reason + site_ai entitlement key"
```

---

### Task 2: Coach-JWT status / preview / apply endpoints

**Files:**
- Create: `backend/apps/core/site_ai_admin.py`
- Create: `backend/apps/core/site_ai_admin_urls.py`
- Modify: `backend/config/urls.py`
- Create: `backend/apps/core/tests/test_site_ai_admin.py`

**Interfaces:**
- Consumes: `site_ai.availability/preview_edit/apply_edit/record_update/record_attempt_cost` (Phase 1), `IsCoachOrOwner`, `sse_frame`/`stream_response`/`EventStreamRenderer`.
- Produces:
  - `GET /api/v1/admin/site-ai/status/` → `{enabled, remaining, limit, reason}`
  - `POST /api/v1/admin/site-ai/preview/` (SSE) → `phase` then `done {pages}` frames; free
  - `POST /api/v1/admin/site-ai/apply/` `{pages}` → `{remaining}`; `402 {detail, remaining}` when unavailable

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/core/tests/test_site_ai_admin.py`. Use the real-schema harness the other core tests use, and authenticate a coach with `force_authenticate` (mirror `apps/tenant_config/tests/test_setup_status.py`, which builds an owner `User` inside `tenant_ctx` and uses `APIClient(HTTP_HOST=...)` + `force_authenticate`):

```python
"""The admin Site AI trio: coach-JWT auth, monthly quota enforcement, and a
soft 402 that never blocks manual editing."""

from unittest import mock

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import SiteAiUpdateUsage

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="siteai-coach@x.com",
        name="Coach",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture()
def client(coach):
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=coach)
    return c


def test_status_reports_availability(client):
    with mock.patch(
        "apps.core.site_ai_admin.site_ai.availability",
        return_value={"enabled": True, "remaining": 2, "limit": 3, "reason": None},
    ):
        resp = client.get("/api/v1/admin/site-ai/status/")
    assert resp.status_code == 200
    assert resp.json()["remaining"] == 2


def test_apply_consumes_one_unit_and_reports_remaining(client):
    with (
        mock.patch(
            "apps.core.site_ai_admin.site_ai.availability",
            return_value={"enabled": True, "remaining": 3, "limit": 3, "reason": None},
        ),
        mock.patch("apps.core.site_ai_admin.site_ai.apply_edit") as apply_edit,
        mock.patch("apps.core.site_ai_admin.site_ai.record_update") as record_update,
    ):
        resp = client.post(
            "/api/v1/admin/site-ai/apply/",
            {"pages": {"home": {"blocks": []}}},
            format="json",
        )
    assert resp.status_code == 200
    assert resp.json()["remaining"] == 2  # 3 - 1
    apply_edit.assert_called_once()
    record_update.assert_called_once()


def test_apply_is_refused_when_no_allowance_remains(client):
    with (
        mock.patch(
            "apps.core.site_ai_admin.site_ai.availability",
            return_value={"enabled": False, "remaining": 0, "limit": 0, "reason": "upgrade_required"},
        ),
        mock.patch("apps.core.site_ai_admin.site_ai.apply_edit") as apply_edit,
    ):
        resp = client.post(
            "/api/v1/admin/site-ai/apply/",
            {"pages": {"home": {"blocks": []}}},
            format="json",
        )
    assert resp.status_code == 402
    assert resp.json()["reason"] == "upgrade_required"
    apply_edit.assert_not_called()  # nothing is persisted when refused


def test_endpoints_reject_anonymous_callers():
    anon = APIClient(HTTP_HOST=HOST)
    assert anon.get("/api/v1/admin/site-ai/status/").status_code in (401, 403)
    assert anon.post("/api/v1/admin/site-ai/apply/", {}, format="json").status_code in (401, 403)
```

- [ ] **Step 2: Run to verify failure**

Run: `docker compose exec django pytest apps/core/tests/test_site_ai_admin.py -v`

Expected: FAIL — routes 404.

- [ ] **Step 3: Implement the views**

Create `backend/apps/core/site_ai_admin.py`:

```python
"""Coach-facing Site AI: the reveal chat's engine, metered monthly.

Auth is the DRF default (TenantJWTAuthentication) + IsCoachOrOwner — do NOT
clear authentication_classes here; that is only for the pre-provision wizard
endpoints, which have no session.

Note: site_ai.apply_edit() writes TenantConfig.pages directly rather than
through TenantConfigView's serializer, so an AI apply does not populate
setup_progress["pages_edited"] the way a manual page edit does. The reveal
chat behaves the same way; feeding the setup checklist from AI applies is a
separate concern.
"""

import logging
from decimal import Decimal

from django.db import connection
from rest_framework.decorators import api_view, permission_classes, renderer_classes
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response

from apps.core.ai_sse import EventStreamRenderer, sse_frame, stream_response
from apps.core.onboarding import site_ai
from apps.core.permissions import IsCoachOrOwner

logger = logging.getLogger(__name__)

INSTRUCTION_MAX_LEN = 400


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def site_ai_status(request):
    """Remaining monthly site-edit allowance for this tenant."""
    return Response(site_ai.availability(connection.tenant))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
@renderer_classes([JSONRenderer, EventStreamRenderer])
def site_ai_preview(request):
    """Stream a proposed edit. FREE — previewing never consumes an allowance;
    only Apply does. USD still accrues on every attempt (kill-switch)."""
    tenant = connection.tenant
    data = request.data if isinstance(request.data, dict) else {}
    instruction = str(data.get("instruction") or "").strip()[:INSTRUCTION_MAX_LEN]

    def frames():
        yield sse_frame({"type": "phase", "phase": "thinking"})
        cost = Decimal("0")
        try:
            pages, _extras, cost = site_ai.preview_edit(tenant, instruction)
            yield sse_frame({"type": "done", "pages": pages})
        except Exception:
            logger.exception("admin site-edit preview failed schema=%s", tenant.schema_name)
            yield sse_frame({"type": "error", "source": "error"})
        finally:
            site_ai.record_attempt_cost(tenant.schema_name, cost)

    return stream_response(frames())


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def site_ai_apply(request):
    """Persist a previewed edit, spending one monthly allowance unit.

    402 when there is nothing left — a soft refusal, not a wall: the coach can
    still edit manually for free on every plan.
    """
    tenant = connection.tenant
    status = site_ai.availability(tenant)
    if not status["enabled"]:
        return Response(
            {
                "detail": "site_ai_unavailable",
                "reason": status["reason"],
                "remaining": status["remaining"],
            },
            status=402,
        )

    data = request.data if isinstance(request.data, dict) else {}
    site_ai.apply_edit(tenant, data.get("pages") or {})
    site_ai.record_update(tenant.schema_name)
    remaining = max(0, status["remaining"] - 1)
    logger.info("admin site-edit applied schema=%s remaining=%d", tenant.schema_name, remaining)
    return Response({"remaining": remaining})
```

- [ ] **Step 4: Route them**

Create `backend/apps/core/site_ai_admin_urls.py`:

```python
from django.urls import path

from .site_ai_admin import site_ai_apply, site_ai_preview, site_ai_status

urlpatterns = [
    path("status/", site_ai_status, name="site-ai-status"),
    path("preview/", site_ai_preview, name="site-ai-preview"),
    path("apply/", site_ai_apply, name="site-ai-apply"),
]
```

In `backend/config/urls.py`, alongside the other `api/v1/admin/` includes (around lines 49-55):

```python
    path("api/v1/admin/site-ai/", include("apps.core.site_ai_admin_urls")),
```

- [ ] **Step 5: Run to verify pass**

Run: `docker compose exec django pytest apps/core/tests/test_site_ai_admin.py -v`

Expected: PASS, 4 tests.

- [ ] **Step 6: Regenerate the OpenAPI types**

The project requires this after any serializer/endpoint change (root `CLAUDE.md`):

```bash
cd frontend-customer && npm run gen:api
```

Review the diff of `src/types/api-generated.ts` — it should add the three `admin/site-ai/*` operations and nothing surprising.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/core/site_ai_admin.py backend/apps/core/site_ai_admin_urls.py backend/config/urls.py backend/apps/core/tests/test_site_ai_admin.py frontend-customer/src/types/api-generated.ts
git commit -m "feat(site-ai): coach-JWT status/preview/apply endpoints with monthly enforcement"
```

---

### Task 3: The `/admin/site-ai` panel

**Files:**
- Create: `frontend-customer/src/lib/site-ai-api.ts`
- Create: `frontend-customer/src/app/admin/site-ai/page.tsx`
- Modify: `frontend-customer/src/lib/admin-nav.ts`
- Modify: `frontend-customer/messages/en/admin.json`, `frontend-customer/messages/tr/admin.json`

**Interfaces:**
- Consumes: the Task 2 endpoints; `streamAi`, `AiProgress`, `useAsyncAction`, `clientFetch`, `PageState`.
- Produces: `SiteAiStatus { enabled, remaining, limit, reason }`, `fetchSiteAiStatus()`, `previewSiteEdit(instruction, handlers, signal)`, `applySiteEdit(pages)`. A `site_ai` nav item in My Site.

- [ ] **Step 1: Write the API client**

Create `frontend-customer/src/lib/site-ai-api.ts` (mirrors `lib/blog-api.ts`'s split of plain `clientFetch` + a `streamAi` wrapper):

```typescript
import { clientFetch } from "@/lib/api-client";
import { streamAi, type AiStreamHandlers } from "@/lib/ai-stream";

const BASE = "/api/v1/admin/site-ai";

export interface SiteAiStatus {
  enabled: boolean;
  remaining: number;
  limit: number;
  /** null when edits are available. */
  reason: "upgrade_required" | "quota_exhausted" | null;
}

/** The proposed page tree the preview stream resolves with. */
export interface SiteEditPreview {
  pages: Record<string, unknown>;
}

export const fetchSiteAiStatus = () =>
  clientFetch<SiteAiStatus>(`${BASE}/status/`);

export const previewSiteEdit = (
  instruction: string,
  handlers: AiStreamHandlers<never>,
  signal?: AbortSignal,
) =>
  streamAi<SiteEditPreview, never>(
    `${BASE}/preview/`,
    { instruction },
    handlers,
    signal,
  );

export const applySiteEdit = (pages: Record<string, unknown>) =>
  clientFetch<{ remaining: number }>(`${BASE}/apply/`, {
    method: "POST",
    body: JSON.stringify({ pages }),
  });
```

- [ ] **Step 2: Add the copy in both locales**

In `frontend-customer/messages/en/admin.json`, add a top-level `siteAi` object (sibling of `nav`), and a `nav.items.siteAi` label:

```json
    "siteAi": {
      "title": "Site AI",
      "subtitle": "Describe a change and I'll redesign your site.",
      "placeholder": "e.g. make the homepage warmer and shorten the intro",
      "preview": "Preview change",
      "thinking": "Thinking…",
      "ready": "Here's the proposed change.",
      "apply": "Apply",
      "applying": "Applying…",
      "discard": "Discard",
      "applied": "Your site has been updated",
      "remaining": "{count} of {limit} AI edits left this month",
      "upgradeTitle": "AI editing is a paid feature",
      "upgradeBody": "Upgrade to let AI redesign your site from a sentence. You can always edit your site manually for free.",
      "exhaustedTitle": "You've used this month's AI edits",
      "exhaustedBody": "Your allowance resets next month. You can keep editing manually for free.",
      "upgradeCta": "See plans",
      "manualCta": "Edit manually instead",
      "error": "Something went wrong. Please try again."
    }
```

and inside `nav.items`: `"siteAi": "Site AI",`.

In `frontend-customer/messages/tr/admin.json`, the same keys:

```json
    "siteAi": {
      "title": "Site Yapay Zekâsı",
      "subtitle": "Bir değişiklik anlatın, sitenizi yeniden tasarlayayım.",
      "placeholder": "örn. ana sayfayı daha sıcak yap ve girişi kısalt",
      "preview": "Değişikliği önizle",
      "thinking": "Düşünüyor…",
      "ready": "Önerilen değişiklik hazır.",
      "apply": "Uygula",
      "applying": "Uygulanıyor…",
      "discard": "Vazgeç",
      "applied": "Siteniz güncellendi",
      "remaining": "Bu ay kalan yapay zekâ düzenlemesi: {count}/{limit}",
      "upgradeTitle": "Yapay zekâ ile düzenleme ücretli bir özellik",
      "upgradeBody": "Tek bir cümleyle sitenizi yeniden tasarlatmak için yükseltin. Sitenizi her zaman ücretsiz olarak elle düzenleyebilirsiniz.",
      "exhaustedTitle": "Bu ayki yapay zekâ düzenlemelerinizi kullandınız",
      "exhaustedBody": "Hakkınız gelecek ay yenilenir. Elle düzenlemeye ücretsiz devam edebilirsiniz.",
      "upgradeCta": "Planları gör",
      "manualCta": "Bunun yerine elle düzenle",
      "error": "Bir şeyler ters gitti. Lütfen tekrar deneyin."
    }
```

and `nav.items.siteAi`: `"Site Yapay Zekâsı"`.

- [ ] **Step 3: Add the nav entry**

In `frontend-customer/src/lib/admin-nav.ts`, add `Sparkles` to the lucide import and put Site AI **first** in the `mySite` section's items (it becomes the primary way to change the site):

```typescript
        {
          label: t("nav.items.siteAi"),
          href: "/admin/site-ai",
          icon: Sparkles,
          ai: true,
          requiresEntitlement: "site_ai",
          partialPaid: true,
        },
```

Then update the Phase-1 nav test that asserts My Site's contents if it pins an exact item list — `frontend-customer/src/lib/__tests__/admin-nav.test.ts` asserts `"keeps every existing route reachable"` and an external-link check; add `/admin/site-ai` to any exact-list expectation it makes for `mySite`.

- [ ] **Step 4: Build the page**

Create `frontend-customer/src/app/admin/site-ai/page.tsx`. It follows the admin conventions: `"use client"`, `force-dynamic`, `PageState` for the initial status load, `useAsyncAction` for both actions, `AiProgress` while streaming, sonner on outcomes, and no raw spinners.

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PageState } from "@/components/ui/page-state";
import { AiProgress } from "@/components/ui/ai-progress";
import { NavLink } from "@/components/ui/nav-link";
import { SkeletonForm } from "@/components/ui/skeletons";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { isAbortError } from "@/lib/ai-stream";
import {
  applySiteEdit,
  fetchSiteAiStatus,
  previewSiteEdit,
  type SiteAiStatus,
} from "@/lib/site-ai-api";

export const dynamic = "force-dynamic";

export default function AdminSiteAiPage() {
  const t = useTranslations("admin");
  const [status, setStatus] = useState<SiteAiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [instruction, setInstruction] = useState("");
  const [phase, setPhase] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await fetchSiteAiStatus());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Previewing is always allowed — even with no allowance left, so the coach
  // can see what AI would do before deciding to upgrade.
  const { run: handlePreview, loading: previewing } = useAsyncAction(
    async () => {
      if (!instruction.trim()) return;
      const controller = new AbortController();
      abortRef.current = controller;
      setPhase(null);
      setPreview(null);
      try {
        const res = await previewSiteEdit(
          instruction.trim(),
          { onPhase: setPhase },
          controller.signal,
        );
        setPreview(res.pages);
      } catch (err) {
        if (isAbortError(err)) return; // the coach cancelled; nothing to report
        throw err;
      } finally {
        abortRef.current = null;
      }
    },
    { errorToast: t("siteAi.error") },
  );

  const { run: handleApply, loading: applying } = useAsyncAction(
    async () => {
      if (!preview) return;
      const res = await applySiteEdit(preview);
      setPreview(null);
      setInstruction("");
      setStatus((prev) => (prev ? { ...prev, remaining: res.remaining } : prev));
      toast.success(t("siteAi.applied"));
      void load();
    },
    { errorToast: t("siteAi.error") },
  );

  const upsell = status?.reason === "upgrade_required";
  const exhausted = status?.reason === "quota_exhausted";

  return (
    <PageState loading={loading} error={error} skeleton={<SkeletonForm />} onRetry={load}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("siteAi.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("siteAi.subtitle")}</p>
        </div>

        {(upsell || exhausted) && (
          <div className="rounded-lg border border-dashed p-4">
            <p className="text-sm font-medium">
              {upsell ? t("siteAi.upgradeTitle") : t("siteAi.exhaustedTitle")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {upsell ? t("siteAi.upgradeBody") : t("siteAi.exhaustedBody")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {upsell && (
                <Button asChild size="sm" variant="brand">
                  <NavLink href="/admin/billing/subscription">
                    {t("siteAi.upgradeCta")}
                  </NavLink>
                </Button>
              )}
              {/* Manual editing is free on every plan — never a dead end. */}
              <Button asChild size="sm" variant="outline">
                <a href="/?edit=1" target="_blank" rel="noopener noreferrer">
                  {t("siteAi.manualCta")}
                </a>
              </Button>
            </div>
          </div>
        )}

        {status && status.limit > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("siteAi.remaining", {
              count: status.remaining,
              limit: status.limit,
            })}
          </p>
        )}

        {previewing ? (
          <AiProgress
            phases={[{ key: "thinking", label: t("siteAi.thinking") }]}
            currentPhase={phase}
            onCancel={() => abortRef.current?.abort()}
          />
        ) : (
          <div className="space-y-3">
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={t("siteAi.placeholder")}
              rows={3}
              maxLength={400}
              className="w-full rounded-lg border bg-background p-3 text-sm"
            />
            <Button onClick={handlePreview} disabled={!instruction.trim()}>
              {t("siteAi.preview")}
            </Button>
          </div>
        )}

        {preview && !previewing && (
          <div className="rounded-lg border p-4">
            <p className="text-sm">{t("siteAi.ready")}</p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="brand"
                onClick={handleApply}
                loading={applying}
                loadingText={t("siteAi.applying")}
                disabled={!status?.enabled}
              >
                {t("siteAi.apply")}
              </Button>
              <Button variant="ghost" onClick={() => setPreview(null)}>
                {t("siteAi.discard")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </PageState>
  );
}
```

Note: `/admin/site-ai` inherits `frontend-customer/src/app/admin/loading.tsx`, so no new `loading.tsx` is needed. Confirm the exact export names of `PageState`, `AiProgress` and `SkeletonForm` in their modules before wiring (they are re-exported through `@/components/ui/*` shims).

- [ ] **Step 5: Verify**

Run: `make typecheck` → PASS.
Run: `cd frontend-customer && npx vitest run` → PASS (including the updated `admin-nav.test.ts`).
Run: `make lint` → exit 0 (i18n parity + the loading-pattern check).

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src/lib/site-ai-api.ts frontend-customer/src/app/admin/site-ai/page.tsx frontend-customer/src/lib/admin-nav.ts frontend-customer/src/lib/__tests__/admin-nav.test.ts frontend-customer/messages/en/admin.json frontend-customer/messages/tr/admin.json
git commit -m "feat(site-ai): admin Site AI panel with monthly allowance and upgrade surface"
```

---

### Task 4: End-to-end paid apply and free upgrade surface

**Files:**
- Create: `e2e/specs/28-admin-site-ai.spec.ts`
- Modify: `e2e/impact-map.json`

- [ ] **Step 1: Write the spec**

Create `e2e/specs/28-admin-site-ai.spec.ts`, modelled on an existing coach-admin spec's login (e.g. `e2e/specs/25-navigation-feedback.spec.ts`). Because a real AI call is slow and non-deterministic, **stub the preview stream at the network layer** with `page.route`, exactly as the suite does elsewhere for AI endpoints (grep the e2e specs for `**/generate/` or `text/event-stream` to copy the existing stubbing idiom):

```ts
await page.route("**/api/v1/admin/site-ai/preview/", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "text/event-stream",
    body:
      'data: {"type":"phase","phase":"thinking"}\n\n' +
      'data: {"type":"done","pages":{"home":{"blocks":[]}}}\n\n',
  });
});
```

Assert two paths:
1. **Paid coach** (a seeded dev tenant on a paid plan): open `/admin/site-ai`, type an instruction, click Preview, see the "proposed change" copy, click Apply, and assert the success toast plus a decremented "N of M AI edits left" line.
2. **Free coach**: open `/admin/site-ai` and assert the upgrade block is visible (`getByText(/ai editing is a paid feature/i)`) and that the "Edit manually instead" link is present — proving it is never a dead end.

If the seeded dev tenants are all on one plan, drive the second case by stubbing `**/api/v1/admin/site-ai/status/` to return `{"enabled":false,"remaining":0,"limit":0,"reason":"upgrade_required"}` — the panel's behaviour is what is under test, not the billing plumbing (which Task 1 covers with unit tests).

- [ ] **Step 2: Map the spec**

Add a `28-admin-site-ai.spec.ts` entry to `e2e/impact-map.json` covering `backend/apps/core/site_ai_admin*`, `backend/apps/core/onboarding/site_ai.py`, and `frontend-customer/src/app/admin/site-ai/**` + `frontend-customer/src/lib/site-ai-api.ts`.

- [ ] **Step 3: Run**

Run: `make e2e-spec SPEC=28-admin-site-ai`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/28-admin-site-ai.spec.ts e2e/impact-map.json
git commit -m "test(site-ai): e2e admin apply flow and free-tier upgrade surface"
```

---

## Verification before calling this plan done

- [ ] `docker compose exec django pytest apps/core apps/billing -n auto` passes.
- [ ] `cd frontend-customer && npx vitest run`, `make typecheck`, `make lint` all pass.
- [ ] `make e2e-spec SPEC=28-admin-site-ai` passes.
- [ ] Manual on a dev tenant: a paid coach previews and applies an edit, the remaining count drops, and the change is visible on the public site. A free coach sees the upgrade block and the "Edit manually instead" link, and Apply is refused with 402 — while `/?edit=1` still works.
- [ ] `SiteAiUpdateUsage` accrues `usd_spent` on previews and `updates_used` only on applies.

## Where this sits in Phase 2

| Plan | Scope | Depends on |
|------|-------|------------|
| P2-0 — Reveal free-applies 3→1 | constant + copy + test | Phase 1 |
| P2-1 — Nav stage-gating | Marketing lock, Content "+ More" | Phase 1 Plan 2 |
| **P2-2 — Admin Site AI panel** (this one) | endpoints + panel + `site_ai` entitlement | Phase 1 Plan 5 |
| P2-3 — Conditional editor de-emphasis | My Site "Advanced editing" for paid coaches | P2-1 **and P2-2** (needs the `site_ai` entitlement + nav item) |
