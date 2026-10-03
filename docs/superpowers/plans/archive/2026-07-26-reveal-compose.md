# Reveal + Compose Fallback Implementation Plan

**STATUS: COMPLETE** — the deferred Task 3 Step 2 landed with Plan 3b — branch `feat/lazy-provisioning-foundation` (2026-07-26).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** At the end of the content-first wizard, compose the coach's site from their real content and answers, reaching a `ready` reveal — and never strand a coach if the AI step fails (deterministic pages always stand).

**Architecture:** Provisioning already splits into schema (Plan 3a) and the seed+compose tail. This plan adds a **compose-at-reveal** path for the content-first flow: a Celery task that runs the existing `_apply_wizard_answers` (which already overlays AI copy on a deterministic page skeleton and falls back to the skeleton on any AI failure) against the already-provisioned tenant, then marks it `ready`. It also fixes the content-gathering filter so the coach's real **published** course/event feed the compose brief, and gives the frontend content flow a reveal that triggers compose and polls to `ready`.

**Tech Stack:** Django 5.1, Celery, django-tenants, Next.js 14, pytest, Playwright.

## Why this plan exists

In the classic flow, "Create my platform" runs one big `provision_tenant` (schema → seed → AI compose → ready). In the content-first flow the schema and the coach's real content already exist by reveal time, so the reveal only needs the **compose** step — fed with the coach's actual course/event/blog. Two gaps must close:

1. `_compose_pages_with_ai` gathers courses with `Course.objects.filter(is_published=False)` (`backend/apps/core/tasks.py:188`) — draft demo courses. Plan 3c creates the coach's first course **published**, so today it would be **excluded** from the compose brief. The coach's real content must be what the site is built around.
2. There is no reveal trigger for an already-provisioned tenant — `wizard_finalize` enqueues the full `provision_tenant`, which would re-run schema/seed steps.

**Verified facts** (file:line):
- `_apply_wizard_answers(tenant, answers, preferred_locale)` (`tasks.py:77`) is fail-soft: `build_config_overrides` (deterministic) then `_compose_pages_with_ai` (AI overlay) which "falls back to the static pages … on skip/failure" (`tasks.py:173-212`). No AI failure can strand the coach.
- `_compose_pages_with_ai` gathers `course_items`/`download_items` in the caller's `tenant_context` (`tasks.py:186-192`).
- The frontend already polls `/api/v1/onboarding/status/?slug=` and renders a provisioning→ready reveal (`frontend-main/src/app/signup/verify/page.tsx:78-296`).

## Global Constraints

- **The classic flow is unchanged.** `provision_tenant` keeps running the full pipeline for `control`. The compose-at-reveal task is additive.
- **Compose is idempotent and always terminal.** `compose_wizard_site` may retry; on success it sets `provisioning_status="ready"`; AI failure is not an error (deterministic pages stand); only an unexpected exception sets `failed` and retries.
- **Feed real content, don't fabricate.** The compose brief includes the coach's actual course/event/blog. No testimonials/social proof (the AI trust boundary in `ai_compose.WRITABLE_FIELDS` already excludes them).
- Tests run in Docker: `docker compose exec django pytest <path> -n auto`, dev stack up.

## Scope boundaries

- No seeding of extra starter content (Plan 4).
- No reveal *chat* (Plan 5) — this reveal is the composed site + a Publish button; the refine-by-chat box is Plan 5.
- No changes to classic provisioning.

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `backend/apps/core/tasks.py` | modify | Extract `_gather_content_items(tenant)` incl. published content; add `compose_wizard_site` task. |
| `backend/apps/core/onboarding/wizard.py` | modify | `wizard_compose` view (enqueue compose for a provisioned tenant). |
| `backend/apps/core/onboarding/urls.py` | modify | Route `wizard/compose/`. |
| `frontend-main/src/lib/wizard/api.ts` | modify | `composeWizard(token)`. |
| `frontend-main/src/app/signup/verify/wizard/WizardFlow.tsx` | modify | Content-flow review triggers compose (not finalize). |
| `backend/apps/core/tests/test_reveal_compose.py` | create | Gather + compose-task tests. |

---

### Task 1: Compose from the coach's real (published) content

**Files:**
- Modify: `backend/apps/core/tasks.py:186-192` (`_compose_pages_with_ai`)
- Test: `backend/apps/core/tests/test_reveal_compose.py` (create)

**Interfaces:**
- Produces: `_gather_content_items(tenant) -> (course_items, download_items)` — tuples of `{id, title, description}`, including **published** courses. `_compose_pages_with_ai` calls it instead of the inline draft-only query.

- [x] **Step 1: Write the failing test**

Create `backend/apps/core/tests/test_reveal_compose.py` (real-schema harness as in Plan 3a):

```python
"""The compose brief must include the coach's real, published course — the
content-first flow creates the first course published, so a draft-only gather
would build the site around nothing."""

import pytest
from django.db import connection
from django_tenants.utils import tenant_context

from apps.core.models import Tenant
from apps.core.tasks import _gather_content_items, provision_tenant_schema

pytestmark = pytest.mark.django_db(transaction=True)


def _tenant(schema="reveal_gather"):
    connection.set_schema_to_public()
    t = Tenant.objects.create(
        schema_name=schema, name=schema, slug=schema, subdomain=schema,
        owner_email=f"{schema}@example.com", region="global",
    )
    provision_tenant_schema(t, t.owner_email, "Owner", "en")
    return t


def _drop(schema):
    connection.set_schema_to_public()
    with connection.cursor() as cur:
        cur.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
    Tenant.objects.filter(schema_name=schema).delete()
    connection.set_schema_to_public()


def test_gather_includes_published_courses(restore_public):
    t = _tenant("reveal_pub")
    try:
        with tenant_context(t):
            from apps.accounts.models import User
            from apps.courses.models import Course

            owner = User.objects.filter(role="owner").first()
            Course.objects.create(title="Real Course", instructor=owner, is_published=True)
            course_items, _ = _gather_content_items(t)
        titles = [c["title"] for c in course_items]
        assert "Real Course" in titles
    finally:
        _drop("reveal_pub")
```

- [x] **Step 2: Run to verify failure**

Run: `docker compose exec django pytest apps/core/tests/test_reveal_compose.py -k gather -v`
Expected: FAIL — `_gather_content_items` does not exist.

- [x] **Step 3: Extract and widen the gather**

In `backend/apps/core/tasks.py`, replace the inline `course_items`/`download_items` queries inside `_compose_pages_with_ai` (lines 183-192) with a call to a new module function:

```python
def _gather_content_items(tenant):
    """Course/download items for the compose brief, read in the caller's
    tenant_context. Includes PUBLISHED courses — the content-first wizard makes
    the coach's first course published, and it must feed the composed site.
    (Classic tenants have only draft demo courses here, so widening the filter
    is a no-op for them.)"""
    from apps.courses.models import Course
    from apps.downloads.models import DownloadFile

    course_items = tuple(
        {"id": c.pk, "title": c.title, "description": (c.description or "")[:300]}
        for c in Course.objects.order_by("id")[:8]
    )
    download_items = tuple(
        {"id": d.pk, "title": d.title, "description": ""}
        for d in DownloadFile.objects.order_by("id")[:8]
    )
    return course_items, download_items
```

And in `_compose_pages_with_ai`, replace the two inline comprehensions with:

```python
    course_items, download_items = _gather_content_items(tenant)
```

(Leave the rest of `_compose_pages_with_ai` — the `compose_available()` guard, the `run()` closure, `_run_ai_step` — unchanged.)

- [x] **Step 4: Run to verify pass**

Run: `docker compose exec django pytest apps/core/tests/test_reveal_compose.py -k gather -v` → PASS.

- [x] **Step 5: Confirm classic compose still works**

Run: `docker compose exec django pytest apps/core -n auto -k "compose or provision"` → PASS.

- [x] **Step 6: Commit**

```bash
git add backend/apps/core/tasks.py backend/apps/core/tests/test_reveal_compose.py
git commit -m "fix(onboarding): include the coach's published content in the compose brief"
```

---

### Task 2: Compose-at-reveal task + trigger endpoint

**Files:**
- Modify: `backend/apps/core/tasks.py` (`compose_wizard_site`)
- Modify: `backend/apps/core/onboarding/wizard.py`, `urls.py`
- Test: `backend/apps/core/tests/test_reveal_compose.py`

**Interfaces:**
- Produces: `compose_wizard_site(tenant_id)` Celery task — composes an already-`provisioned` tenant and sets `ready`; `POST /api/v1/onboarding/wizard/compose/` → `{status}`, enqueues it.

- [x] **Step 1: Write the failing test**

```python
from unittest import mock

from apps.core import tasks


def test_compose_wizard_site_reaches_ready_even_if_ai_unavailable(restore_public):
    t = _tenant("reveal_ready")
    try:
        # AI off → deterministic pages; must still reach ready, never 'failed'.
        with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=False):
            tasks.compose_wizard_site.apply(args=(t.id,))
        t.refresh_from_db()
        assert t.provisioning_status == "ready"
    finally:
        _drop("reveal_ready")
```

- [x] **Step 2: Run to verify failure** — FAIL (no `compose_wizard_site`).

Run: `docker compose exec django pytest apps/core/tests/test_reveal_compose.py -k reaches_ready -v`

- [x] **Step 3: Implement the task**

In `backend/apps/core/tasks.py`:

```python
@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def compose_wizard_site(self, tenant_id):
    """Compose the site for an already-provisioned content-first tenant from
    its real content + wizard answers, then mark ready. Fail-soft: an AI
    failure inside _apply_wizard_answers falls back to deterministic pages and
    still reaches 'ready'. Only an unexpected error retries."""
    from apps.core.constants import REGION_DEFAULT_LOCALE
    from apps.core.models import Tenant

    tenant = Tenant.objects.get(id=tenant_id)
    if tenant.provisioning_status == "ready":
        return
    if tenant.provisioning_status != "provisioned":
        return  # schema not ready yet; the frontend gates compose on 'provisioned'
    try:
        region = tenant.region or "global"
        preferred_locale = REGION_DEFAULT_LOCALE.get(region, "en")
        answers = (tenant.wizard_state or {}).get("answers") or {}
        _apply_wizard_answers(tenant, answers, preferred_locale)

        _set_provisioning_stage(tenant, "finalizing")
        tenant.provisioning_status = "ready"
        tenant.save(update_fields=["provisioning_status"])
    except Exception as exc:
        tenant.provisioning_status = "failed"
        tenant.save(update_fields=["provisioning_status"])
        logger.exception("compose_wizard_site failed for %s", tenant.slug)
        raise self.retry(exc=exc) from exc
```

- [x] **Step 4: Add the trigger view + route**

In `backend/apps/core/onboarding/wizard.py`:

```python
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_compose(request):
    """Trigger compose-at-reveal for the content-first flow. Only a provisioned
    tenant composes; the frontend polls onboarding/status until 'ready'."""
    from ..tasks import compose_wizard_site

    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err:
        return err
    if tenant.provisioning_status == "provisioned":
        compose_wizard_site.delay(tenant.id)
    return Response({"status": tenant.provisioning_status})
```

In `urls.py`:

```python
    path("wizard/compose/", wizard.wizard_compose, name="wizard-compose"),
```

- [x] **Step 5: Run to verify pass**

Run: `docker compose exec django pytest apps/core/tests/test_reveal_compose.py -v` → PASS.

- [x] **Step 6: Commit**

```bash
git add backend/apps/core/tasks.py backend/apps/core/onboarding/wizard.py backend/apps/core/onboarding/urls.py backend/apps/core/tests/test_reveal_compose.py
git commit -m "feat(onboarding): compose-at-reveal task + trigger for the content-first flow"
```

---

### Task 3: Content-flow reveal (frontend)

**Files:**
- Modify: `frontend-main/src/lib/wizard/api.ts`
- Modify: `frontend-main/src/app/signup/verify/wizard/WizardFlow.tsx`

**Interfaces:**
- Consumes: `wizard/compose/` (Task 2); the existing status-poll reveal (`verify/page.tsx`).
- Produces: `composeWizard(token) -> {status}`; the content flow's review step calls compose instead of `finalizeWizard`.

- [x] **Step 1: Add the client call**

In `frontend-main/src/lib/wizard/api.ts`:

```typescript
export function composeWizard(token: string): Promise<{ status: string }> {
  return request("/api/v1/onboarding/wizard/compose/", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}
```

- [x] **Step 2: Route the content-flow reveal through compose**

In `WizardFlow.tsx`, where the review step's Continue currently calls `finalizeWizard(token)` then `onProvisioning(slug)` (WizardFlow.tsx:197-207), branch on the flow:

```tsx
    if (step.id === "review") {
      const res = isContentFlow
        ? await composeWizard(token)
        : await finalizeWizard(token);
      onProvisioning(("slug" in res ? res.slug : undefined) ?? slugFromState);
      return;
    }
```

For the content flow the tenant is already provisioned, so `composeWizard` returns immediately and the existing `onProvisioning` → status-poll reveal screen (`verify/page.tsx`) handles the wait to `ready` exactly as it does for classic. (`slugFromState` is the slug already known from `readWizardState`; the content-flow compose response doesn't echo a slug.)

- [x] **Step 3: Typecheck + commit**

Run: `make typecheck` → PASS.

```bash
git add frontend-main/src/lib/wizard/api.ts frontend-main/src/app/signup/verify/wizard/WizardFlow.tsx
git commit -m "feat(wizard): content-flow reveal composes the real-content site"
```

---

## Verification before calling this plan done

- [x] `docker compose exec django pytest apps/core/tests/test_reveal_compose.py -n auto` passes.
- [x] `docker compose exec django pytest apps/core -n auto -k "compose or provision"` passes (classic unaffected).
- [x] `make typecheck` + `make lint` pass.
- [ ] Manual: a provisioned dev tenant with one published course, hit `wizard/compose/`, polls to `ready`, and its composed home page references the real course title. *(Partially: reached `ready` and the gather returned the real course title. The AI-composed page text is not observable in dev — no onboarding AI provider/budget configured.)*
- [x] Manual: with AI disabled (`ONBOARDING_AI_ENABLED=false`), compose still reaches `ready` with deterministic pages — no coach is ever stranded.

## Execution notes (2026-07-26)

**Update (later the same day): Task 3 Step 2 is now DONE** — it landed with
Plan 3b, which introduced `isContentFlow`. The review step calls
`composeWizard` for the content flow and `finalizeWizard` for classic.
Original note follows.

**What was NOT done at the time, and why.** Task 3 Step 2 wires `WizardFlow.tsx` to call
`composeWizard` when `isContentFlow` is true. `isContentFlow` does not exist —
grep for it across `frontend-main/src` returns nothing. It is introduced by
Plan 3b, which owns both flows and the bucket-driven selection between them.
Writing it here would mean inventing 3b's flow predicate in 3b's file, so the
branch is deferred to 3b. Everything it depends on is in place: the endpoint,
the task, and the `composeWizard` client function (Step 1) are all landed and
tested. **Plan 3b must not forget to make its review step call `composeWizard`
instead of `finalizeWizard`.**

Deviations in the parts that were implemented:

1. **Three tests added beyond the plan's one.** The plan tested only "reaches
   ready with AI off". Added: the task no-ops on a `pending` tenant (which has
   no schema — composing it would raise and mark it `failed`), the task is
   idempotent once `ready` (asserted by patching `_apply_wizard_answers` and
   proving it is not called again), and the endpoint enqueues only for a
   `provisioned` tenant.
2. **`test_gather_still_includes_draft_courses`** pins the plan's own claim that
   widening the filter is a no-op for classic tenants — otherwise the change
   could silently have dropped drafts.
3. **Mutation-verified.** The implementation was written before the tests could
   be run (a full-suite run was holding the test DBs), so `_gather_content_items`
   was reverted to `filter(is_published=False)` to confirm
   `test_gather_includes_published_courses` actually fails (`assert 'Real Course'
   in []`), then restored.
4. **Fixed a real ordering bug in Plan 3a's `test_abandoned_cleanup.py`.** Its
   helpers assumed the connection was already on the public schema; scheduled
   after a test that left it on `shared_test`, they died with
   "Can't create tenant outside the public schema". Both the autouse purge and
   `_tenant()` now force public. This surfaced only under
   `-n auto -k "compose or provision"`.
5. **Stale docstring corrected** — `_compose_pages_with_ai` said "Draft content
   is gathered HERE"; it is no longer draft-only.

**Verification results:** `test_reveal_compose.py` 6 passed (serial and
`-n auto`); `apps/core -n auto -k "compose or provision"` 68 passed;
`make typecheck` exit 0; `make lint` exit 0. Manual against the dev stack: schema
step -> `provisioned`; the Plan 3c course endpoint created a real published
course; `_gather_content_items` returned `['Marathon Base Building']` (the real
course now feeds the brief); `POST wizard/compose/` -> 200; with
`compose_available()` forced False the task reached `ready` with all six
deterministic pages present and a non-empty home. **Not verified:** that an
*AI-composed* home page quotes the course title — dev has no onboarding AI
budget/provider configured (`compose_available()` is False there), so only the
fallback path is observable locally. The gather feeding the title is verified,
which is the part this plan changed.

## Where this sits in Plan 3

| Sub-plan | Scope | Depends on |
|----------|-------|------------|
| 3a — Lazy provisioning foundation | schema step, endpoint, cleanup | Plan 1 |
| 3b — Content-first wizard (frontend) | content flow behind the bucket | 3a, 3c, 3e |
| 3c — Content-creation APIs | course-outline AI + create endpoints | 3a |
| **3d — Reveal + compose fallback** (this one) | compose real content at reveal; always reach ready | 3c |
| 3e — Wizard holdout | bucket assignment + report | Plan 1 |
