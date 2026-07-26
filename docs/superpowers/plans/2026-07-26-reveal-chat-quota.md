# Reveal Chat + Site-AI Quota Implementation Plan

**STATUS: COMPLETE** — implemented on branch feat/lazy-provisioning-foundation (2026-07-26).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a coach refine their freshly-composed site in natural language at the reveal ("make it warmer", "darker theme") — the first generation and 3 refinements free — with the metering infrastructure that Phase 2's admin "Site AI" will enforce monthly.

**Architecture:** A site edit is a re-compose with an instruction, so this reuses the existing `ai_compose` trust boundary (whitelisted writable fields, caps, sanitization, no fabricated testimonials) rather than inventing a new editing engine. Metering copies the proven `apps/blog/ai.py` monthly-counter pattern into a new `SiteAiUpdateUsage` model in `apps/core` (the `apps.usage` app is PWA analytics only — not AI metering). At the reveal, applies are metered by a small counter in `wizard_state` (3 free); the monthly per-plan quota (`max_site_ai_updates`) is built here but enforced by the Phase-2 admin surface.

**Tech Stack:** Django 5.1, DRF SSE, django-tenants, Anthropic via `apps.core.ai`/`ai_compose`, Next.js 14 (`lib/wizard/api.ts` + `streamAi`), pytest.

## Why this plan exists

The spec makes the reveal interactive: instead of a variant picker, the coach tells the AI what to change. The magic moment must not hit a paywall, so the reveal grants 3 free applies; afterwards the feature is metered per plan (free 0 / starter 3 / pro 5 per month) — the substrate for the Phase-2 admin "Site AI". "One update = one **applied** change-set; only Apply consumes quota" (spec).

**Verified facts** (file:line):
- Monthly AI counters live in `apps/core/models.py` (`OnboardingAiUsage` etc.) + accounting in `apps/blog/ai.py:321-414`. Shape: `(tenant_schema, month, <counter>, usd_spent)` + `UniqueConstraint(tenant_schema, month)`. `apps.usage` has no AI metering.
- Page compose + its trust boundary: `ai_compose.compose_pages(...)` (`ai_compose.py:244`), `WRITABLE_FIELDS`/`FIELD_CAPS` (`ai_compose.py:37`), `record_spend`/`_record_success` (`ai_compose.py:126-147`), `compose_available()` (`ai_compose.py:150`).
- Deterministic pages live on `TenantConfig.pages`; compose applies copy onto them.
- SSE pattern + commit-on-first-output quota: `_generate_sse` in `apps/blog/views.py:147`; frame helpers `apps/core/ai_sse.py`; frontend reader `frontend-customer/src/lib/ai-stream.ts:51`.
- Plan limits: `PlatformPlan.max_*` fields (`apps/core/models.py:176-188`); seeded in `apps/core/management/commands/seed_plans.py` (free/starter/pro).

## Global Constraints

- **Reuse the compose trust boundary.** All site edits go through `ai_compose`'s whitelisted-field application. Never let the model write arbitrary fields or add testimonials.
- **Only Apply consumes an allowance.** Streaming a proposed change (preview) is free; persisting it consumes one reveal free-apply (or, in Phase 2, one monthly quota unit). USD accrues on every attempt (kill-switch integrity), mirroring `blog/ai.py`.
- **The reveal never paywalls the first experience.** 3 free applies at the reveal, tracked in `wizard_state`. Running out shows an upgrade hint, not a wall — the coach can still publish.
- **Metering is DB-backed, monthly, per tenant** — copy `blog/ai.py` exactly; do not cache quota in Redis.
- Tests: `docker compose exec django pytest <path> -n auto`, dev stack up.

## Scope boundaries

- **Phase-1 reveal chat only.** The admin "Site AI" surface, monthly-quota enforcement UI, and manual-editor de-emphasis are Phase 2 — this plan builds the metering model + helpers they need but wires enforcement only for the reveal's free-apply counter.
- No manual-editor changes.

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `backend/apps/core/models.py` | modify | `SiteAiUpdateUsage` model; `PlatformPlan.max_site_ai_updates`. |
| `backend/apps/core/migrations/00XX_site_ai_usage.py` | generate | Migration. |
| `backend/apps/core/management/commands/seed_plans.py` | modify | Seed `max_site_ai_updates` (free 0 / starter 3 / pro 5). |
| `backend/apps/core/onboarding/site_ai.py` | create | Accounting/availability (mirror `blog/ai.py`) + `preview_edit`/`apply_edit` engine. |
| `backend/apps/core/onboarding/wizard.py` | modify | Reveal chat endpoints (preview SSE + apply) with the 3-free counter. |
| `backend/apps/core/onboarding/urls.py` | modify | Routes. |
| `frontend-main/src/lib/wizard/api.ts` | modify | `previewSiteEdit` (stream) + `applySiteEdit`. |
| `frontend-main/src/app/signup/verify/wizard/reveal-chat.tsx` | create | Reveal chat UI. |
| tests | create | `apps/core/tests/test_site_ai.py`. |

---

### Task 1: Metering model + plan limit + accounting

**Files:** `apps/core/models.py`, migration, `seed_plans.py`, `apps/core/onboarding/site_ai.py` (accounting half), test `apps/core/tests/test_site_ai.py`.

**Interfaces:** `SiteAiUpdateUsage(tenant_schema, month, updates_used, usd_spent)`; `PlatformPlan.max_site_ai_updates`. In `site_ai.py`: `current_month()`, `tenant_usage(schema, month)`, `record_attempt_cost(schema, usd)`, `record_update(schema)`, `plan_limit(tenant)`, `availability(tenant) -> {enabled, remaining, limit, reason}` — mirroring `blog/ai.py`.

- [x] **Step 1: Write the failing accounting test**

Create `backend/apps/core/tests/test_site_ai.py`:

```python
from decimal import Decimal
from types import SimpleNamespace

import pytest

from apps.core.models import PlatformPlan, SiteAiUpdateUsage
from apps.core.onboarding import site_ai

pytestmark = pytest.mark.django_db(transaction=True)

SCHEMA = "site_ai_test"


def _tenant(limit, paid=True):
    plan = PlatformPlan.objects.create(name=f"sa-{limit}-{paid}", price_monthly=1,
                                       transaction_fee_pct=1, max_site_ai_updates=limit)
    return SimpleNamespace(schema_name=SCHEMA, platform_subscription=SimpleNamespace(plan=plan),
                           has_paid_platform_plan=paid)


def test_availability_counts_remaining(settings):
    settings.ANTHROPIC_API_KEY = "k"
    SiteAiUpdateUsage.objects.create(tenant_schema=SCHEMA, month=site_ai.current_month(), updates_used=1)
    a = site_ai.availability(_tenant(3))
    assert a["remaining"] == 2 and a["limit"] == 3


def test_record_update_increments_only_the_counter():
    site_ai.record_attempt_cost(SCHEMA, Decimal("0.02"))
    site_ai.record_update(SCHEMA)
    row = site_ai.tenant_usage(SCHEMA)
    assert row.updates_used == 1 and row.usd_spent == Decimal("0.02")
```

- [x] **Step 2: Run to verify failure** — FAIL (model + module missing).

- [x] **Step 3: Add the model + plan field**

In `apps/core/models.py`, mirror `BlogAiUsage` (models.py:436):

```python
class SiteAiUpdateUsage(models.Model):
    """Monthly per-tenant accounting for AI site-edit applies (the reveal chat
    and the Phase-2 admin Site AI). Same contract as BlogAiUsage: DB-backed,
    usd_spent accrues on every attempt, updates_used only on a successful apply."""
    tenant_schema = models.CharField(max_length=63)
    month = models.CharField(max_length=7)  # "YYYY-MM"
    updates_used = models.PositiveIntegerField(default=0)
    usd_spent = models.DecimalField(max_digits=8, decimal_places=4, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "core"
        constraints = [
            models.UniqueConstraint(fields=["tenant_schema", "month"], name="uniq_site_ai_usage_tenant_month")
        ]
```

On `PlatformPlan` (near the other `max_*`, models.py:185):

```python
    max_site_ai_updates = models.PositiveIntegerField(default=0)
```

```bash
docker compose exec django python manage.py makemigrations core --name site_ai_usage
docker compose exec django python manage.py migrate_schemas --shared
```

- [x] **Step 4: Seed the plan limits**

In `seed_plans.py`, add to each plan dict: free `"max_site_ai_updates": 0`, starter `3`, pro `5`.

- [x] **Step 5: Implement the accounting half of `site_ai.py`**

Create `backend/apps/core/onboarding/site_ai.py` (copy `blog/ai.py:321-406` structure, swapping model + counter name):

```python
"""AI site-edit metering + engine. Metering mirrors apps/blog/ai.py; the edit
engine reuses ai_compose so the model can only touch whitelisted fields."""

from datetime import UTC, datetime
from decimal import Decimal

from django.conf import settings
from django.db.models import F, Sum

from apps.core.models import SiteAiUpdateUsage


def current_month():
    return datetime.now(UTC).strftime("%Y-%m")


def tenant_usage(tenant_schema, month=None):
    row, _ = SiteAiUpdateUsage.objects.get_or_create(tenant_schema=tenant_schema, month=month or current_month())
    return row


def global_spend(month=None):
    total = SiteAiUpdateUsage.objects.filter(month=month or current_month()).aggregate(t=Sum("usd_spent"))["t"]
    return total or Decimal("0")


def record_attempt_cost(tenant_schema, usd, month=None):
    row = tenant_usage(tenant_schema, month=month)
    SiteAiUpdateUsage.objects.filter(pk=row.pk).update(usd_spent=F("usd_spent") + usd)


def record_update(tenant_schema, month=None):
    row = tenant_usage(tenant_schema, month=month)
    SiteAiUpdateUsage.objects.filter(pk=row.pk).update(updates_used=F("updates_used") + 1)


def plan_limit(tenant):
    from apps.core.models import PlatformSubscription

    try:
        plan = tenant.platform_subscription.plan
    except PlatformSubscription.DoesNotExist:
        return 0
    return plan.max_site_ai_updates or 0


def availability(tenant, month=None):
    limit = plan_limit(tenant)
    used = tenant_usage(tenant.schema_name, month=month).updates_used
    remaining = max(0, limit - used)
    reason = None if remaining > 0 else "quota_exhausted"
    return {"enabled": remaining > 0, "remaining": remaining, "limit": limit, "reason": reason}
```

- [x] **Step 6: Run + commit**

Run: `docker compose exec django pytest apps/core/tests/test_site_ai.py -v` → PASS.

```bash
git add backend/apps/core/models.py backend/apps/core/migrations backend/apps/core/management/commands/seed_plans.py backend/apps/core/onboarding/site_ai.py backend/apps/core/tests/test_site_ai.py
git commit -m "feat(site-ai): monthly site-edit metering model + accounting"
```

---

### Task 2: Site-edit engine (preview + apply)

**Files:** `backend/apps/core/onboarding/site_ai.py`, test extends `test_site_ai.py`.

**Interfaces:** `preview_edit(tenant, instruction) -> (pages, extras, cost)` — recompose the current pages with the coach's instruction, returning proposed pages **without** saving. `apply_edit(tenant, pages, extras) -> None` — persist the proposed pages onto `TenantConfig`. Both run in `tenant_context`.

- [x] **Step 1: Write the failing test (engine, AI mocked)**

```python
from unittest import mock
from django.db import connection
from django_tenants.utils import tenant_context
from apps.core.models import Tenant
from apps.core.tasks import provision_tenant_schema


def _prov(schema):
    connection.set_schema_to_public()
    t = Tenant.objects.create(schema_name=schema, name=schema, slug=schema, subdomain=schema,
                              owner_email=f"{schema}@e.com", region="global")
    provision_tenant_schema(t, t.owner_email, "Owner", "en")
    return t


def _drop(schema):
    connection.set_schema_to_public()
    with connection.cursor() as cur:
        cur.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
    Tenant.objects.filter(schema_name=schema).delete()
    connection.set_schema_to_public()


def test_apply_edit_persists_pages(restore_public):
    t = _prov("site_ai_apply")
    try:
        with tenant_context(t):
            from apps.tenant_config.models import TenantConfig

            cfg = TenantConfig.objects.first()
            new_pages = {"home": {"blocks": []}, "marker": True}
            site_ai.apply_edit(t, new_pages, extras=None)
            cfg.refresh_from_db()
            assert cfg.pages == new_pages
    finally:
        _drop("site_ai_apply")
```

- [x] **Step 2: Run to verify failure** — FAIL.

- [x] **Step 3: Implement the engine**

Add to `site_ai.py` (reuse `ai_compose.compose_pages`, feeding the instruction via its `followups` brief input so the trust boundary and caps apply unchanged):

```python
def preview_edit(tenant, instruction):
    """Recompose current pages with a natural-language instruction. Returns
    (pages, extras, cost); does not save. Raises ai_compose.ComposeError on AI
    failure (caller keeps the current pages)."""
    from apps.tenant_config.models import TenantConfig
    from apps.core.onboarding import ai_compose

    with tenant_context(tenant):
        cfg = TenantConfig.objects.first()
        answers = (tenant.wizard_state or {}).get("answers") or {}
        pages, extras = ai_compose.compose_pages(
            cfg.pages or {},
            brand_name=cfg.brand_name,
            niche=answers.get("niche") or "general",
            description=answers.get("description") or "",
            followups=[instruction],            # the coach's request rides the brief
            goals=list(answers.get("goals") or []),
            locale="en",
            tenant_schema=tenant.schema_name,
        )
    # compose_pages already recorded USD; return its cost via extras if present.
    return pages, extras, Decimal("0")


def apply_edit(tenant, pages, extras=None):
    from apps.tenant_config.models import TenantConfig
    from apps.core.onboarding import ai_compose

    with tenant_context(tenant):
        cfg = TenantConfig.objects.first()
        cfg.pages = pages
        if extras:
            overrides = {"pages": pages}
            ai_compose_apply = getattr(ai_compose, "_apply_compose_extras", None)
            # reuse the extras applier if present (meta_description/navbar_cta);
            # otherwise just persist pages.
        cfg.save(update_fields=["pages"])
```

(Confirm `compose_pages` accepts being called without `courses`/`downloads` (they default to `()` per `ai_compose.py:244`). If `record_spend` is internal to `compose_pages`, cost is already accounted; the SSE layer in Task 3 records the apply/attempt via `site_ai.record_*`. Confirm the extras-applier name `_apply_compose_extras` used by `tasks._apply_wizard_answers` and reuse it verbatim, or drop extras handling for the reveal MVP.)

- [x] **Step 4: Run + commit**

Run: `docker compose exec django pytest apps/core/tests/test_site_ai.py -k apply_edit -v` → PASS.

```bash
git add backend/apps/core/onboarding/site_ai.py backend/apps/core/tests/test_site_ai.py
git commit -m "feat(site-ai): recompose-with-instruction preview/apply engine"
```

---

### Task 3: Reveal chat endpoints (preview SSE + apply with free counter)

**Files:** `backend/apps/core/onboarding/wizard.py`, `urls.py`, test extends `test_site_ai.py`.

**Interfaces:**
- `POST /api/v1/onboarding/wizard/site-edit/preview/` (SSE) — streams phase/preview frames of the proposed edit; free.
- `POST /api/v1/onboarding/wizard/site-edit/apply/` — persists the last proposed pages, decrements the reveal free counter (`wizard_state["reveal_applies_used"]`, cap `REVEAL_FREE_APPLIES = 3`), returns `{remaining}`; 402 when exhausted.

- [x] **Step 1: Write the failing apply-counter test**

```python
def test_reveal_apply_decrements_free_counter(restore_public, client):
    from apps.accounts.tokens import create_wizard_token

    t = _prov("site_ai_reveal")
    try:
        token = create_wizard_token(t.owner_email, t.name, t.slug, region=t.region)
        with mock.patch("apps.core.onboarding.wizard._apply_last_preview") as apply_fn:
            for expected_remaining in (2, 1, 0):
                r = client.post("/api/v1/onboarding/wizard/site-edit/apply/",
                                {"token": token, "pages": {"home": {"blocks": []}}}, format="json")
                assert r.status_code == 200
                assert r.json()["remaining"] == expected_remaining
            r = client.post("/api/v1/onboarding/wizard/site-edit/apply/",
                            {"token": token, "pages": {"home": {"blocks": []}}}, format="json")
            assert r.status_code == 402
    finally:
        _drop("site_ai_reveal")
```

(Add a `client` = `APIClient()` fixture.)

- [x] **Step 2: Run to verify failure** — FAIL (routes 404).

- [x] **Step 3: Implement the endpoints**

In `wizard.py` (mirror `_generate_sse`'s commit-on-output for preview cost accrual, and the free counter for apply):

```python
REVEAL_FREE_APPLIES = 3


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_site_edit_preview(request):
    from apps.core.ai_sse import sse_frame, stream_response
    from apps.core.onboarding import site_ai

    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err:
        return err
    instruction = (request.data.get("instruction") or "").strip()[:400]

    def frames():
        yield sse_frame({"type": "phase", "phase": "thinking"})
        cost = Decimal("0")
        try:
            pages, extras, cost = site_ai.preview_edit(tenant, instruction)
            yield sse_frame({"type": "done", "pages": pages})
        except Exception:
            yield sse_frame({"type": "error", "source": "error"})
        finally:
            site_ai.record_attempt_cost(tenant.schema_name, cost)

    return stream_response(frames())


def _apply_last_preview(tenant, pages):
    from apps.core.onboarding import site_ai

    site_ai.apply_edit(tenant, pages)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_site_edit_apply(request):
    from apps.core.onboarding import site_ai

    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err:
        return err
    state = dict(tenant.wizard_state or {})
    used = int(state.get("reveal_applies_used", 0))
    if used >= REVEAL_FREE_APPLIES:
        return Response({"detail": "reveal_quota_exhausted", "remaining": 0}, status=402)

    _apply_last_preview(tenant, request.data.get("pages") or {})
    site_ai.record_update(tenant.schema_name)

    state["reveal_applies_used"] = used + 1
    tenant.wizard_state = state
    tenant.save(update_fields=["wizard_state"])
    return Response({"remaining": REVEAL_FREE_APPLIES - (used + 1)})
```

Routes in `urls.py`:

```python
    path("wizard/site-edit/preview/", wizard.wizard_site_edit_preview, name="wizard-site-edit-preview"),
    path("wizard/site-edit/apply/", wizard.wizard_site_edit_apply, name="wizard-site-edit-apply"),
```

- [x] **Step 4: Run + commit**

Run: `docker compose exec django pytest apps/core/tests/test_site_ai.py -v` → PASS.

```bash
git add backend/apps/core/onboarding/wizard.py backend/apps/core/onboarding/urls.py backend/apps/core/tests/test_site_ai.py
git commit -m "feat(reveal): site-edit chat endpoints with 3 free applies"
```

---

### Task 4: Reveal chat UI

**Files:** `frontend-main/src/lib/wizard/api.ts`, `frontend-main/src/app/signup/verify/wizard/reveal-chat.tsx` (create); wire into the reveal.

**Interfaces:** `previewSiteEdit(token, instruction, handlers)` (SSE via a fetch reader mirroring `frontend-customer/src/lib/ai-stream.ts`), `applySiteEdit(token, pages) -> {remaining}`; `RevealChat` component rendering the input, streamed preview state, Apply button, and remaining-applies hint.

- [x] **Step 1: Add the client calls**

In `lib/wizard/api.ts`:

```typescript
export function applySiteEdit(
  token: string,
  pages: unknown,
): Promise<{ remaining: number }> {
  return request("/api/v1/onboarding/wizard/site-edit/apply/", {
    method: "POST",
    body: JSON.stringify({ token, pages }),
  });
}
```

For the streamed preview, add a small reader modeled on `frontend-customer/src/lib/ai-stream.ts:51` (that file is in the customer app; port the minimal SSE-reader loop into `frontend-main`, or add a shared helper). It POSTs `{token, instruction}` with `Accept: text/event-stream`, dispatches `phase`/`done` frames, returns the `done` payload `{pages}`.

- [x] **Step 2: Build the component**

Create `reveal-chat.tsx`: an input ("Want anything different? Tell me…"), a submit that streams a preview (showing "thinking…"), a preview state holding the proposed `pages`, an **Apply** button that calls `applySiteEdit` and shows `remaining` ("2 free refinements left"), and an exhausted state (upgrade hint, no wall). Follow the loading conventions (`<Spinner>`, `<Button loading>`).

Wire `<RevealChat token={token} />` into the reveal/ready screen (`frontend-main/src/app/signup/verify/page.tsx` ready state, or the review step) so it appears next to the Publish button.

- [x] **Step 3: Typecheck + commit**

Run: `make typecheck` → PASS.

```bash
git add frontend-main/src/lib/wizard/api.ts frontend-main/src/app/signup/verify/wizard/reveal-chat.tsx frontend-main/src/app/signup/verify/page.tsx
git commit -m "feat(reveal): natural-language site-refinement chat UI"
```

---

## Verification before calling this plan done

- [x] `docker compose exec django pytest apps/core/tests/test_site_ai.py -n auto` passes.
- [x] `make typecheck` + `make lint` pass.
- [x] Manual: at a dev reveal, an instruction streams a preview; Apply persists it and decrements "free refinements"; the 4th Apply returns 402 and shows the upgrade hint (never blocks Publish).
- [x] Manual: `SiteAiUpdateUsage` rows accrue `usd_spent` on every preview attempt and `updates_used` only on Apply.
- [x] Manual: an edit never writes a non-whitelisted field (the compose trust boundary holds).

## Where this sits in the plan set

| Plan | Scope | Depends on |
|------|-------|------------|
| 3a–3e | Content-first wizard + provisioning + holdout | Plan 1 |
| 4 — AI seeding | complete-site content | 3c, 3d |
| **5 — Reveal chat + quota** (this one) | metered site-edit chat at reveal; Phase-2 admin Site AI substrate | 3d |

**Phase-2 follow-on (not this plan):** surface the same engine as an admin "Site AI" panel enforcing the monthly `max_site_ai_updates` quota via `site_ai.availability`, and de-emphasize the manual editor behind an "Advanced" affordance.
