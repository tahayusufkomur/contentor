# Publish Gate + Free Blog Grant Implementation Plan

> **STATUS: COMPLETE** — implemented and merged to `main` 2026-07-26 (merge `3d7ef80`;
> feature commits `97088f2`, `9d27211`, `d3852e4`). Full backend suite 1683 passed,
> `make lint` clean, both manual verification checks confirmed against the dev database.
> Deviations from the plan as written are recorded at the bottom under "Execution notes".
> **Not yet deployed** — carries migration `core.0033_free_blog_grant`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the publish gate goal- and entitlement-conditional so free-plan coaches can actually publish, and give the free plan a one-off lifetime AI blog generation.

**Architecture:** Two backend-only changes in existing modules. `apps/tenant_config/setup_items.py` gains conditional blockers driven by the coach's wizard goals and their plan's `live` entitlement. `apps/blog/ai.py` gains a lifetime grant, stored as a single boolean on the public-schema `Tenant` model, that `availability()` honors when the plan quota is zero.

**Tech Stack:** Django 5.1, DRF, pytest, django-tenants (schema-per-tenant), Docker Compose.

## Why this plan exists (context for a fresh engineer)

The spec ([docs/superpowers/specs/2026-07-26-ai-first-onboarding-design.md](../specs/2026-07-26-ai-first-onboarding-design.md)) reworks onboarding so a coach's site is publish-ready at the end of signup. An adversarial review found the gate as first drafted was **unsatisfiable on the free plan**: `seed_plans.py` gives the free plan `max_ai_blog_posts: 0` and `is_live_enabled: False`, and entitlements derive `ai_blog` from *paid AND quota > 0* and `live` from `is_live_enabled`. A gate demanding "1 course + 1 event + 1 blog" would therefore have blocked every free coach from publishing forever. This plan fixes that, and is a prerequisite for the wizard rework.

## Global Constraints

- Publish blockers read **real tenant state only** — a manual "mark done" tick in `setup_progress["manual"]` must never satisfy a blocker. (`compute_setup_state` honors manual ticks for the *checklist*; `publish_blockers` must not.)
- A blocker is applied only when the coach's declared goals ask for it **and** their plan entitles them to it. Never gate a coach on a content type they did not choose.
- API response dictionaries are **additive only** — do not repurpose the existing `reason` values in `availability()`; existing frontend code branches on `reason is None`.
- Tests run in Docker: `docker compose exec django pytest <path> -n auto`. The dev stack must be up (`make dev`).
- If a block of `test_seed_dev_tenants` tests fails, that is a dirty reused test DB, not your change — rerun with `--create-db`.

## Deliberate deviations from the spec (do not "fix" these)

1. **The spec calls the product blocker `first_product`; we keep the existing key `first_course`.** `publish_blockers` already treats it as "own course **or** download", so the semantics already match. Renaming would touch `frontend-customer/src/components/setup/catalog.ts`, both `messages/{en,tr}/admin.json` files, and e2e selectors for zero user-visible gain.
2. **`demo_cleanup` stays a publish blocker in this plan.** The spec removes it, but that removal is only safe once AI seeding produces niche-appropriate content (a later plan). Removing it now would let existing tenants publish generic static demo content. It is removed in the AI-seeding plan.
3. **The free grant is exposed as an additive `free_grant` boolean, not a new `reason` value.** The spec says "a distinct reason"; a new `reason` string would break existing `reason is None` checks in the blog admin UI.

## File Structure

| File | Responsibility |
|------|----------------|
| `backend/apps/tenant_config/setup_items.py` (modify) | Publish blockers + checklist state. Gains `_wizard_goals`, `_live_entitled`, conditional event/blog blockers, and a `queryset` kwarg on `_has_own`. |
| `backend/apps/tenant_config/tests/test_publish_gate.py` (create) | Unit tests for `publish_blockers` across goal × entitlement combinations. |
| `backend/apps/core/models.py` (modify) | `Tenant.free_blog_grant_used` — the lifetime grant flag (public schema). |
| `backend/apps/core/migrations/00XX_free_blog_grant.py` (generated) | Migration for the new field. |
| `backend/apps/blog/ai.py` (modify) | `availability()` honors the grant; new `consume_free_grant()`. |
| `backend/apps/blog/views.py` (modify) | Spends the grant at the existing success-commit points. |
| `backend/apps/blog/tests/test_ai.py` (modify) | Grant availability + consumption tests; updates one existing test whose assertion this change intentionally inverts. |

---

### Task 1: Goal- and entitlement-conditional publish blockers

**Files:**
- Modify: `backend/apps/tenant_config/setup_items.py`
- Test: `backend/apps/tenant_config/tests/test_publish_gate.py` (create)

**Interfaces:**
- Consumes: existing `_has_own(model, rows)`, `_seeded_by_label()`, `can_monetize(tenant)`, `_has_paid_content(seeded)`.
- Produces: `publish_blockers(config, tenant) -> list[str]` — may now return `"first_event"` and `"first_blog_post"` in addition to the existing `"look"`, `"demo_cleanup"`, `"first_course"`, `"payouts"`. Helpers `_wizard_goals(tenant) -> list[str]` and `_live_entitled(tenant) -> bool` become available to later tasks.

- [x] **Step 1: Write the failing tests**

Create `backend/apps/tenant_config/tests/test_publish_gate.py`:

```python
"""publish_blockers must never gate a coach on content their goals didn't ask
for or their plan doesn't entitle them to (the free plan has is_live_enabled
False and max_ai_blog_posts 0)."""

from types import SimpleNamespace
from unittest.mock import patch

import pytest

from apps.blog.models import BlogPost
from apps.courses.models import Course
from apps.tenant_config.models import TenantConfig
from apps.tenant_config.setup_items import publish_blockers

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def config(tenant_ctx):
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    cfg.setup_progress = {"look_edited": True}
    cfg.save()
    return cfg


def _tenant(goals=(), live_enabled=False):
    """A stand-in for the public-schema Tenant row. publish_blockers only does
    attribute access, so a namespace is enough and keeps the test fast."""
    return SimpleNamespace(
        wizard_state={"answers": {"goals": list(goals)}},
        platform_subscription=SimpleNamespace(plan=SimpleNamespace(is_live_enabled=live_enabled)),
        template_seed_status="",
        is_published=False,
    )


def _published_course():
    return Course.objects.create(title="C", description="d", price=0, is_published=True)


def test_no_event_or_blog_blocker_when_goals_do_not_ask(config):
    _published_course()
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=True):
        blockers = publish_blockers(config, _tenant(goals=["sell_downloads"]))
    assert "first_event" not in blockers
    assert "first_blog_post" not in blockers
    assert blockers == []


def test_free_plan_is_never_gated_on_an_event_it_cannot_create(config):
    """Goal asks for live classes but the plan's live entitlement is off —
    the coach could never satisfy this blocker, so it must not be applied."""
    _published_course()
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=True):
        blockers = publish_blockers(config, _tenant(goals=["run_live_classes"], live_enabled=False))
    assert "first_event" not in blockers


def test_event_blocker_when_goal_and_entitlement_both_present(config):
    _published_course()
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=True):
        blockers = publish_blockers(config, _tenant(goals=["run_live_classes"], live_enabled=True))
    assert "first_event" in blockers


def test_blog_blocker_applies_on_goal_and_clears_when_published(config):
    _published_course()
    tenant = _tenant(goals=["write_blog"])
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=True):
        assert "first_blog_post" in publish_blockers(config, tenant)

    BlogPost.objects.create(title="P", slug="p", status="published")
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=True):
        assert "first_blog_post" not in publish_blockers(config, tenant)


def test_draft_blog_post_does_not_satisfy_the_blocker(config):
    _published_course()
    BlogPost.objects.create(title="D", slug="d", status="draft")
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=True):
        assert "first_blog_post" in publish_blockers(config, _tenant(goals=["write_blog"]))


def test_unpublished_course_does_not_satisfy_the_product_blocker(config):
    Course.objects.create(title="Draft", description="d", price=0, is_published=False)
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=True):
        assert "first_course" in publish_blockers(config, _tenant())


def test_manual_tick_never_satisfies_a_blocker(config):
    config.setup_progress = {"look_edited": True, "manual": {"first_course": True}}
    config.save()
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=True):
        assert "first_course" in publish_blockers(config, _tenant())
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_publish_gate.py -v`

Expected: FAIL. `test_no_event_or_blog_blocker_when_goals_do_not_ask` and the two "does not satisfy" tests fail because published filtering and the new blockers don't exist yet (the unpublished-course test fails with `first_course` absent from the list).

- [x] **Step 3: Add the goal and entitlement helpers**

In `backend/apps/tenant_config/setup_items.py`, add below the `CORE_PAGE_KEYS` constant:

```python
EVENT_GOALS = frozenset({"run_live_classes", "in_person_events"})
BLOG_GOAL = "write_blog"


def _wizard_goals(tenant) -> list[str]:
    """Goals the coach declared in the signup wizard. `wizard_state` survives
    provisioning untouched, so this is readable for the tenant's whole life."""
    state = getattr(tenant, "wizard_state", None) or {}
    return ((state.get("answers") or {}).get("goals")) or []


def _live_entitled(tenant) -> bool:
    """The plan's `is_live_enabled` flag — the same source
    apps/billing/views/platform.py uses for the `live` entitlement. Django's
    reverse-one-to-one raises a DoesNotExist that also subclasses
    AttributeError, so getattr with a default covers 'no subscription'."""
    plan = getattr(getattr(tenant, "platform_subscription", None), "plan", None)
    return bool(plan and plan.is_live_enabled)
```

Also add `"first_event"` and `"first_blog_post"` to `ALL_ITEM_KEYS` (the list already contains `"first_blog_post"`; add only `"first_event"`).

- [x] **Step 4: Let `_has_own` narrow by queryset**

Replace the existing `_has_own` in the same file with:

```python
def _has_own(model, rows, *, queryset=None) -> bool:
    """A non-demo object exists: anything outside the registry, or a
    registered object whose content no longer matches its seed fingerprint.

    ``queryset`` narrows what counts — the publish gate passes a published-only
    queryset so a draft never unlocks going live."""
    qs = model.objects.all() if queryset is None else queryset
    seeded_ids = [row.object_id for row in rows]
    if qs.exclude(pk__in=seeded_ids).exists():
        return True
    for row in rows:  # bounded by seed volume (small)
        obj = qs.filter(pk=row.object_id).first()
        if obj is not None and fingerprint_for(obj) != row.fingerprint:
            return True
    return False
```

- [x] **Step 5: Apply the conditional blockers**

In `publish_blockers`, replace the `has_own_product` block and everything after it with:

```python
    has_own_product = _has_own(
        Course, seeded.get("courses.course", []), queryset=Course.objects.filter(is_published=True)
    ) or _has_own(DownloadFile, seeded.get("downloads.downloadfile", []))
    if not has_own_product:
        blockers.append("first_course")

    goals = _wizard_goals(tenant)
    if EVENT_GOALS.intersection(goals) and _live_entitled(tenant):
        from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass

        live_pairs = (
            (LiveClass, "live.liveclass"),
            (LiveStream, "live.livestream"),
            (ZoomClass, "live.zoomclass"),
            (OnsiteEvent, "live.onsiteevent"),
        )
        if not any(_has_own(model, seeded.get(label, [])) for model, label in live_pairs):
            blockers.append("first_event")

    if BLOG_GOAL in goals:
        from apps.blog.models import BlogPost

        if not _has_own(
            BlogPost, seeded.get("blog.blogpost", []), queryset=BlogPost.objects.filter(status="published")
        ):
            blockers.append("first_blog_post")

    if _has_paid_content(seeded) and not can_monetize(tenant):
        blockers.append("payouts")
    return blockers
```

- [x] **Step 6: Run the tests to verify they pass**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_publish_gate.py -v`

Expected: PASS, 7 tests.

- [x] **Step 7: Run the surrounding suite for regressions**

Run: `docker compose exec django pytest apps/tenant_config -n auto`

Expected: PASS. `test_setup_status.py` exercises the same module; if a failure mentions `first_course` and an unpublished course, a fixture there creates a draft course and must be updated to `is_published=True` — that is a correct consequence of Step 5, not a bug.

- [x] **Step 8: Commit**

```bash
git add backend/apps/tenant_config/setup_items.py backend/apps/tenant_config/tests/test_publish_gate.py
git commit -m "feat(onboarding): make publish blockers goal- and entitlement-conditional"
```

---

### Task 2: Free-plan lifetime AI blog grant

**Files:**
- Modify: `backend/apps/core/models.py` (the `Tenant` model)
- Create (generated): `backend/apps/core/migrations/00XX_free_blog_grant.py`
- Modify: `backend/apps/blog/ai.py:370-390` (`availability`)
- Test: `backend/apps/blog/tests/test_ai.py`

**Interfaces:**
- Consumes: `plan_limit(tenant) -> int`, `tenant_usage(schema, month)`, `global_spend(month)`.
- Produces: `Tenant.free_blog_grant_used: bool` (default `False`), and `availability(tenant, month=None)` now returns the additional key `free_grant: bool`. When `free_grant` is `True`, `eligible` is `True` and `remaining` is `1` regardless of plan quota.

- [x] **Step 1: Add the model field**

In `backend/apps/core/models.py`, on the `Tenant` model, next to the other per-tenant flags:

```python
    free_blog_grant_used = models.BooleanField(
        default=False,
        help_text="The free plan's one-off AI blog generation has been spent. Lifetime, never reset.",
    )
```

- [x] **Step 2: Generate and apply the migration**

```bash
docker compose exec django python manage.py makemigrations core --name free_blog_grant
docker compose exec django python manage.py migrate_schemas --shared
```

Expected: one `AddField` migration on `core.tenant`; migrate reports OK.

- [x] **Step 3: Write the failing tests**

In `backend/apps/blog/tests/test_ai.py`, replace the existing `_tenant` helper with the version below (it gains a `grant_used` parameter) and **replace** `test_availability_upgrade_required_for_free` with the two tests that follow it. That existing test asserts the behavior this task intentionally changes, so leaving it in place would be asserting the bug.

```python
def _tenant(plan_limit, paid=True, grant_used=False):
    plan = PlatformPlan.objects.create(
        name=f"p{plan_limit}-{paid}-{grant_used}",
        price_monthly=1,
        transaction_fee_pct=1,
        max_ai_blog_posts=plan_limit,
    )
    subscription = SimpleNamespace(plan=plan)
    return SimpleNamespace(
        schema_name=SCHEMA,
        platform_subscription=subscription,
        has_paid_platform_plan=paid,
        free_blog_grant_used=grant_used,
    )


def test_availability_free_grant_makes_free_plan_eligible(settings):
    settings.ANTHROPIC_API_KEY = "k"
    status = ai.availability(_tenant(0, paid=False))
    assert status["eligible"] is True
    assert status["free_grant"] is True
    assert status["remaining"] == 1
    assert status["reason"] is None


def test_availability_upgrade_required_once_grant_is_spent(settings):
    settings.ANTHROPIC_API_KEY = "k"
    status = ai.availability(_tenant(0, paid=False, grant_used=True))
    assert status["eligible"] is False
    assert status["free_grant"] is False
    assert status["reason"] == "upgrade_required"


def test_free_grant_ignores_the_monthly_window(settings):
    """The grant is a lifetime allowance — a new month must not restore it."""
    settings.ANTHROPIC_API_KEY = "k"
    BlogAiUsage.objects.create(tenant_schema=SCHEMA, month="2020-01", generations_used=1)
    status = ai.availability(_tenant(0, paid=False, grant_used=True), month="2020-02")
    assert status["remaining"] == 0
    assert status["reason"] == "upgrade_required"


def test_paid_plan_is_unaffected_by_the_grant(settings):
    settings.ANTHROPIC_API_KEY = "k"
    status = ai.availability(_tenant(5))
    assert status["free_grant"] is False
    assert status["remaining"] == 5
    assert status["reason"] is None
```

- [x] **Step 4: Run the tests to verify they fail**

Run: `docker compose exec django pytest apps/blog/tests/test_ai.py -k "grant or availability" -v`

Expected: FAIL with `KeyError: 'free_grant'`.

- [x] **Step 5: Honor the grant in `availability()`**

Replace the body of `availability` in `backend/apps/blog/ai.py` with:

```python
def availability(tenant, month=None):
    """The single gate every generation path checks. Shape mirrors the Brand
    Pack status endpoint so the frontend upsell pattern transfers.

    Free-plan tenants carry a one-off lifetime grant: the plan quota is monthly
    (BlogAiUsage is keyed by month), so "one time, ever" cannot be expressed as
    a limit and lives on Tenant.free_blog_grant_used instead."""
    month = month or current_month()
    limit = plan_limit(tenant)
    free_grant = limit <= 0 and not getattr(tenant, "free_blog_grant_used", False)
    eligible = (tenant.has_paid_platform_plan and limit > 0) or free_grant
    used = tenant_usage(tenant.schema_name, month=month).generations_used
    remaining = 1 if free_grant else max(0, limit - used)
    budget_ok = global_spend(month=month) < Decimal(str(settings.BLOG_AI_MONTHLY_BUDGET_USD))
    enabled = _provider_configured() and budget_ok
    if not eligible:
        reason = "upgrade_required"
    elif not _provider_configured():
        reason = "disabled"
    elif not budget_ok:
        reason = "budget"
    elif remaining <= 0:
        reason = "quota_exhausted"
    else:
        reason = None
    return {
        "enabled": enabled,
        "eligible": eligible,
        "remaining": remaining,
        "limit": limit,
        "reason": reason,
        "free_grant": free_grant,
    }
```

- [x] **Step 6: Run the tests to verify they pass**

Run: `docker compose exec django pytest apps/blog/tests/test_ai.py -v`

Expected: PASS. If `test_availability_quota_exhausted` or `test_availability_budget_kill_switch` fail, check that `_tenant` still defaults `grant_used=False` and those tests still pass `plan_limit=5` (a paid limit, so `free_grant` is False and their behavior is unchanged).

- [x] **Step 7: Commit**

```bash
git add backend/apps/core/models.py backend/apps/core/migrations backend/apps/blog/ai.py backend/apps/blog/tests/test_ai.py
git commit -m "feat(blog): give the free plan a one-off lifetime AI generation grant"
```

---

### Task 3: Spend the grant on a successful generation

**Files:**
- Modify: `backend/apps/blog/ai.py` (new `consume_free_grant`)
- Modify: `backend/apps/blog/views.py` (call it at the existing commit points)
- Test: `backend/apps/blog/tests/test_ai.py`

**Interfaces:**
- Consumes: `plan_limit(tenant)`, `Tenant.free_blog_grant_used` from Task 2.
- Produces: `consume_free_grant(tenant) -> None` — idempotent; a no-op for paid plans and for an already-spent grant.

- [x] **Step 1: Write the failing tests**

Append to `backend/apps/blog/tests/test_ai.py`. These need a real `Tenant` row because the function writes to the database. `Tenant` sets `auto_create_schema = False`, so creating one does **not** provision a Postgres schema — it is just a row. Use dummy schema names, not `SCHEMA`, whose row already exists; `schema_name`, `slug` and `subdomain` are all unique.

```python
def _tenant_row(schema):
    """A public-schema Tenant row. name/slug/owner_email/subdomain are all
    required; plan is left null because plan_limit is mocked in these tests."""
    return Tenant.objects.create(
        schema_name=schema,
        name="Grant Test",
        slug=schema.replace("_", "-"),
        owner_email="grant@example.com",
        subdomain=schema.replace("_", "-"),
    )


def test_consume_free_grant_marks_the_tenant_and_is_idempotent(db):
    tenant = _tenant_row("grant_free_tenant")

    with mock.patch.object(ai, "plan_limit", return_value=0):
        ai.consume_free_grant(tenant)
        ai.consume_free_grant(tenant)

    tenant.refresh_from_db()
    assert tenant.free_blog_grant_used is True


def test_consume_free_grant_is_a_noop_for_paid_plans(db):
    tenant = _tenant_row("grant_paid_tenant")

    with mock.patch.object(ai, "plan_limit", return_value=5):
        ai.consume_free_grant(tenant)

    tenant.refresh_from_db()
    assert tenant.free_blog_grant_used is False


def test_spent_grant_survives_upgrade_then_downgrade(db):
    """The flag is lifetime state, not plan state — going paid and back to free
    must not hand out a second free generation."""
    tenant = _tenant_row("grant_cycle_tenant")

    with mock.patch.object(ai, "plan_limit", return_value=0):
        ai.consume_free_grant(tenant)
    with mock.patch.object(ai, "plan_limit", return_value=5):
        ai.consume_free_grant(tenant)  # upgraded: no-op
    tenant.refresh_from_db()

    with mock.patch.object(ai, "plan_limit", return_value=0):
        status = ai.availability(
            SimpleNamespace(
                schema_name=SCHEMA,
                has_paid_platform_plan=False,
                free_blog_grant_used=tenant.free_blog_grant_used,
            )
        )
    assert status["free_grant"] is False
    assert status["reason"] == "upgrade_required"
```

Add `from apps.core.models import Tenant` to the test file's imports if it is not already there.

- [x] **Step 2: Run the tests to verify they fail**

Run: `docker compose exec django pytest apps/blog/tests/test_ai.py -k "consume_free_grant or upgrade_then_downgrade" -v`

Expected: FAIL with `AttributeError: module 'apps.blog.ai' has no attribute 'consume_free_grant'`.

- [x] **Step 3: Implement `consume_free_grant`**

In `backend/apps/blog/ai.py`, directly below `record_success`:

```python
def consume_free_grant(tenant):
    """Spend the free plan's one-off generation. Idempotent, and a no-op on any
    plan that has a real quota. The conditional UPDATE makes concurrent
    generations race-safe: only the first one flips the flag."""
    from apps.core.models import Tenant

    if plan_limit(tenant) > 0 or getattr(tenant, "free_blog_grant_used", False):
        return
    Tenant.objects.filter(pk=tenant.pk, free_blog_grant_used=False).update(free_blog_grant_used=True)
    tenant.free_blog_grant_used = True
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `docker compose exec django pytest apps/blog/tests/test_ai.py -k "consume_free_grant or upgrade_then_downgrade" -v`

Expected: PASS, 3 tests.

- [x] **Step 5: Wire it into every success path**

Find the call sites:

```bash
grep -rn "record_success" backend/apps/blog/
```

At each site the tenant object is already in scope (the SSE generator uses `tenant = connection.tenant`). Add the grant call immediately after the quota call. In `_generate_sse`, the `commit()` closure becomes:

```python
    def commit():
        nonlocal committed
        if not committed:
            committed = True
            ai.record_success(tenant.schema_name)
            ai.consume_free_grant(tenant)
```

Apply the same two-line pairing at every other `record_success` call site the grep reports, including the autopilot Celery task if it appears. Charging follows the existing rule — committed at first model output, never on completion.

- [x] **Step 6: Verify the whole blog suite**

Run: `docker compose exec django pytest apps/blog -n auto`

Expected: PASS.

- [x] **Step 7: Verify nothing else regressed**

Run: `docker compose exec django pytest apps/blog apps/tenant_config apps/core -n auto`

Expected: PASS. A block of `test_seed_dev_tenants` failures means a dirty reused test DB — rerun that command with `--create-db`.

- [x] **Step 8: Commit**

```bash
git add backend/apps/blog/ai.py backend/apps/blog/views.py backend/apps/blog/tests/test_ai.py
git commit -m "feat(blog): spend the free grant when a generation succeeds"
```

---

## Verification before calling this plan done

- [x] `docker compose exec django pytest apps/blog apps/tenant_config apps/core -n auto` passes.
- [x] `make lint` passes with zero warnings.
- [x] Manual check in `make shell`: a free tenant with `free_blog_grant_used=False` returns `free_grant: True, remaining: 1` from `apps.blog.ai.availability(tenant)`; after `consume_free_grant(tenant)` it returns `eligible: False, reason: "upgrade_required"`.
- [x] A free-plan tenant whose goals are `["sell_courses"]` and who has one published course returns `[]` from `publish_blockers` — i.e. **a free coach can publish**.

## What comes next (the rest of Phase 1)

Phase 1 of the spec is five independent subsystems. This is plan 1 of 5; each later plan gets its own document.

| Plan | Scope | Depends on |
|------|-------|------------|
| **1. Publish gate + blog grant** (this one) | Conditional blockers, free grant | — |
| **2. Admin nav consolidation** | 18 → 7 destinations, media demotion, Money hub, plus help_kb.md / catalog.ts / e2e / flowmap updates | — (fully independent; ships value to existing coaches) |
| **3. Content-first wizard + lazy provisioning** | New step machine, AI course outlines, content steps, compose fallback, holdout split | Plan 1 |
| **4. AI seeding** | Starter posts, curated photos, draft products, noindex-until-reviewed, `demo_cleanup` removal | Plan 3 |
| **5. Reveal chat + `site_ai_updates` quota** | Chat surface, preview/apply, metering | Plan 3 |

Plans 1 and 2 can run in parallel — they share no files.

---

## Execution notes (2026-07-26)

Where reality differed from the plan as written. Plan 3 builds on this — read before starting it.

1. **`_published_course()` in the Task 1 test file was incomplete.** `Course.instructor` is a
   required FK and `slug` is needed, so the test file gained a `coach` fixture mirroring
   `test_setup_status.py`. Any later test creating a `Course` needs the same.
2. **Two admin-API tests needed updating that the plan didn't list.**
   `test_admin_api.py::test_generate_upgrade_required_for_free_tenant` (renamed to
   `..._once_free_grant_is_spent`) and `test_stream_gating_stays_plain_json` both asserted the
   old free-tenant gating. They now spend the grant first — the only state where the free plan
   is genuinely gated. Added `test_generate_spends_the_free_grant_on_a_free_tenant` as
   end-to-end coverage that the first free generation succeeds and the second is refused.
3. **Task 1 Step 7's predicted regression was real**, exactly as described: two fixtures in
   `test_setup_status.py` created draft courses and now need `is_published=True`.
4. **`consume_free_grant` is wired at three sites**, not two: the SSE `commit()` closure and the
   JSON path in `views.py`, plus the autopilot Celery task in `tasks.py`. A free coach who
   enables autopilot burns the grant on its first run — consistent with "one, ever".
5. **Known follow-up, not fixed here (frontend, owned by plans 2-5):** the blog admin page
   renders `blog.creditsLeft` with `remaining: 1, limit: 0` for a free coach ("1 of 0 credits
   left"), because `eligible` is now true while `limit` stays 0. The additive `free_grant`
   boolean exists precisely so the UI can special-case this; doing so means i18n copy in both
   locales. `BlogAiStatus` in `frontend-customer/src/lib/blog-api.ts` does not yet declare
   `free_grant`.
6. **No git worktree was used.** The Docker dev stack bind-mounts the primary working directory
   and every verification runs `docker compose exec django`, so a worktree would be invisible to
   the container. Later plans in this series should assume the same.
7. **Test-DB flakiness confirmed twice.** A block of `test_seed_dev_tenants` failures under
   `-n auto` is dirty-reused-DB or cross-worker interference, not a real break — it cleared on
   `--create-db`, and `main` produced its own unrelated teardown errors in the same area.
