# Lazy Tenant Provisioning Foundation Implementation Plan

> **STATUS: COMPLETE** — implemented on branch `feat/lazy-provisioning-foundation`
> 2026-07-26 (commits `84b1bc7`, `a6d81c8`, `208c3ee`). `pytest apps/core -n auto`
> 545 passed on a fresh DB, `make lint` clean, both manual verification checks
> confirmed against the dev database. Deviations from the plan as written are
> recorded at the bottom under "Execution notes".
> **Not yet deployed** — carries migration `core.0034_lazy_provisioning`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make it possible to provision a tenant's Postgres schema *early* — when a coach reaches the wizard's content step — instead of only at wizard-end, and add the orphan-cleanup cron that early provisioning makes necessary. This is the backend foundation the content-first wizard (Plan 3b/3c) builds on; it ships no user-visible change on its own.

**Architecture:** Today one Celery task, `provision_tenant`, does everything at wizard-end: create schema → create owner → default config → niche seed → AI-compose → mark `ready`. This plan **extracts** the schema+owner+config portion into a reusable, idempotent `provision_tenant_schema()` that stops at a new `provisioning_status="provisioned"` state, leaving `provision_tenant` behavior-identical for the existing flow. A new public-schema onboarding endpoint enqueues that extracted step on demand. Finally, because early provisioning means abandoned signups now leave real schemas behind, a two-stage cleanup cron (warn → drop) reclaims them with django-tenants' `delete(force_drop=True)`.

**Tech Stack:** Django 5.1, DRF, django-tenants (schema-per-tenant), Celery + celery-beat, pytest, Docker Compose.

## Why this plan exists (context for a fresh engineer)

The onboarding spec ([docs/superpowers/specs/2026-07-26-ai-first-onboarding-design.md](../specs/2026-07-26-ai-first-onboarding-design.md), "Structural change: lazy tenant provisioning") wants coaches to create real content (a course, an event, a blog post) *during* signup. Real content needs a real tenant schema to write into. Provisioning at email-verify would give every tire-kicker who bounces at step 1 a full Postgres schema and make every future `migrate_schemas` slower forever; provisioning at wizard-end (today) is too late for content steps. The answer is **lazy**: provision when the coach first reaches the content step. That in turn means abandoned half-finished signups now own real schemas, so a cleanup job is not optional — it ships in the same plan.

**How provisioning works today** (verified — file:line):
- The `Tenant` row is created at email-verify with `provisioning_status="pending"` and **no schema** (`auto_create_schema = False`, `backend/apps/core/models.py:109`). Wizard answers live on `Tenant.wizard_state` (JSON, public schema) — there is no separate lead record.
- The schema is created later inside the `provision_tenant` Celery task at `backend/apps/core/tasks.py:307` (`tenant.create_schema(...)`), enqueued by the "Create my platform" action `wizard_finalize` (`backend/apps/core/onboarding/wizard.py:159-161`).
- Abandoned signups are only ever *emailed* a nudge (`backend/apps/core/onboarding/recovery.py`); **nothing is ever deleted** — there is no purge cron. Pending Tenant rows accumulate.

## Global Constraints

- **Behavior-preserving refactor.** After Task 1, the existing wizard-end flow (`wizard_finalize` → `provision_tenant`) must produce byte-for-byte the same tenant it does today: schema, owner in public + tenant schema, default config, niche seed, AI-composed pages, `provisioning_status="ready"`. The existing `apps/core` provisioning tests must stay green untouched.
- **Idempotency is mandatory.** Every provisioning function may run twice (Celery retries, double clicks). Creating a schema, owner, or config twice must be a no-op, never a duplicate or a crash — the current task already documents this contract (`tasks.py:289-297`); preserve it.
- **The cleanup cron is destructive — guard it hard.** It may only ever delete a tenant that is (a) not `schema_name="public"`, (b) `is_published=False`, (c) `provisioning_status` in `{pending, provisioned, failed}` (never `ready` or in-flight `provisioning`), and (d) past the full warn+grace window with no recent activity. Every one of these is an independent test.
- **Schema drop uses the sanctioned API.** Drop schemas only via `tenant.delete(force_drop=True)` (django-tenants `TenantMixin.delete` → `_drop_schema`, which itself guards on `schema_exists`). Never hand-write `DROP SCHEMA`.
- Tests run in Docker: `docker compose exec django pytest <path> -n auto` with the dev stack up (`make dev`). A block of `test_seed_dev_tenants` failures = dirty reused test DB; rerun with `--create-db`.

## Scope boundaries (do NOT build these here)

1. **No frontend.** No wizard step changes, no content-step UI, no polling changes. This plan is backend-only. The endpoint from Task 2 has no caller in production until Plan 3b/3c; that is expected and fine.
2. **No content-create endpoints.** Writing the course/event/blog rows during the wizard is Plan 3c.
3. **No holdout / experiment framework.** There is none in the codebase (verified: zero hits for any flag/bucketing primitive). The 50/50 wizard split is its own later plan; nothing here assigns a bucket.
4. **No AI-compose-at-reveal.** The extracted `provision_tenant_schema` deliberately does NOT compose or seed. Composing from real content at the reveal is Plan 3d/5.

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `backend/apps/core/models.py` | modify | Add `"provisioned"` to `provisioning_status` choices; add `abandon_warned_at` datetime field. |
| `backend/apps/core/migrations/00XX_lazy_provisioning.py` | generate | Migration for the status choice + new field (public schema). |
| `backend/apps/core/tasks.py` | modify | Extract `provision_tenant_schema(tenant, owner_email, owner_name, preferred_locale)`; refactor `provision_tenant` to call it; add `provision_wizard_schema` task and `cleanup_abandoned_signups` task. |
| `backend/apps/core/onboarding/wizard.py` | modify | Add `wizard_provision` view (POST, enqueues the schema step). |
| `backend/apps/core/onboarding/urls.py` | modify | Route `wizard/provision/`. |
| `backend/apps/core/onboarding/recovery.py` | modify | Add `find_abandoned_tenants(now)` selector + `send_abandon_warning(tenant)`. |
| `backend/config/settings/base.py` | modify | `WIZARD_ABANDON_WARN_DAYS = 14`, `WIZARD_ABANDON_DELETE_GRACE_DAYS = 7`. |
| `backend/config/celery.py` | modify | Beat entry for `cleanup_abandoned_signups`. |
| `backend/apps/core/tests/test_lazy_provisioning.py` | create | Extraction/idempotency + trigger-endpoint tests. |
| `backend/apps/core/tests/test_abandoned_cleanup.py` | create | Selector + destructive-cleanup safety tests. |

---

### Task 1: Extract `provision_tenant_schema` and add the `provisioned` state

**Files:**
- Modify: `backend/apps/core/models.py:44-53` (status choices)
- Generate: `backend/apps/core/migrations/00XX_lazy_provisioning.py`
- Modify: `backend/apps/core/tasks.py:287-382` (`provision_tenant`)
- Test: `backend/apps/core/tests/test_lazy_provisioning.py` (create)

**Interfaces:**
- Produces: `provision_tenant_schema(tenant, owner_email, owner_name, preferred_locale) -> None` — idempotent; creates schema + public/tenant owner user + default `TenantConfig`; leaves `provisioning_status="provisioned"`. Does NOT seed or compose. Reused by `provision_tenant` (Task 1) and `provision_wizard_schema` (Task 2).
- `Tenant.provisioning_status` gains the value `"provisioned"` (schema+owner+config exist; site not yet composed).

- [x] **Step 1: Add the `provisioned` status and the abandon-warning field**

In `backend/apps/core/models.py`, extend the `provisioning_status` choices (add one line) so the block reads:

```python
    provisioning_status = models.CharField(
        max_length=20,
        choices=[
            ("pending", "Pending"),
            ("provisioning", "Provisioning"),
            ("provisioned", "Schema ready (site not yet composed)"),
            ("ready", "Ready"),
            ("failed", "Failed"),
        ],
        default="pending",
    )
```

Then, next to `recovery_email_sent_at`, add:

```python
    abandon_warned_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=(
            "When the final 'your signup will be deleted' warning was sent. "
            "NULL = not yet warned. Stage 2 of cleanup deletes the tenant "
            "WIZARD_ABANDON_DELETE_GRACE_DAYS after this timestamp."
        ),
    )
```

- [x] **Step 2: Generate and apply the migration**

```bash
docker compose exec django python manage.py makemigrations core --name lazy_provisioning
docker compose exec django python manage.py migrate_schemas --shared
```

Expected: an `AlterField` (status choices) + `AddField` (`abandon_warned_at`) on `core.tenant`; migrate reports OK. (Choice changes still generate a migration in Django; apply it.)

- [x] **Step 3: Write the failing extraction test**

Create `backend/apps/core/tests/test_lazy_provisioning.py`. Mirror the **real-schema** pattern of the existing `test_provision_tenant.py` (create a real Tenant, run the function against an actual schema, assert inside `tenant_context`, drop the schema in `finally`) — do NOT mock `create_schema`/`tenant_context`, because the function queries tenant-only models (`TenantConfig`, `User`) that don't exist in the public schema, so a mocked context would error on a missing relation:

```python
"""provision_tenant_schema is the reusable schema+owner+config step, split out
of provision_tenant so it can run early (at the wizard content step) without
seeding or AI-composing."""

import pytest
from django.db import connection
from django_tenants.utils import tenant_context

from apps.accounts.models import User
from apps.core.models import Tenant
from apps.core.tasks import provision_tenant_schema
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)


def _make_tenant(schema):
    connection.set_schema_to_public()
    return Tenant.objects.create(
        schema_name=schema,
        name="Prov Step",
        slug=schema.replace("_", "-"),
        subdomain=schema.replace("_", "-"),
        owner_email="owner@provstep.test",
        region="global",
    )


def _drop(schema):
    connection.set_schema_to_public()
    with connection.cursor() as cur:
        cur.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
    Tenant.objects.filter(schema_name=schema).delete()
    connection.set_schema_to_public()


def test_schema_step_creates_schema_owner_config_and_stops_at_provisioned(restore_public):
    schema = "prov_step_test"
    tenant = _make_tenant(schema)
    try:
        provision_tenant_schema(tenant, "owner@provstep.test", "Prov Owner", "en")

        tenant.refresh_from_db()
        assert tenant.provisioning_status == "provisioned"  # NOT 'ready'
        with tenant_context(tenant):
            assert TenantConfig.objects.count() == 1
            assert User.objects.filter(role="owner").count() == 1
            # Never seeded / composed: the schema step leaves content empty.
            from apps.blog.models import BlogPost

            assert BlogPost.objects.count() == 0
    finally:
        _drop(schema)


def test_schema_step_is_idempotent(restore_public):
    schema = "prov_step_idem"
    tenant = _make_tenant(schema)
    try:
        # Two runs (as a Celery retry would): no duplicate config/owner, no crash.
        provision_tenant_schema(tenant, "owner@provstep.test", "Prov Owner", "en")
        provision_tenant_schema(tenant, "owner@provstep.test", "Prov Owner", "en")

        tenant.refresh_from_db()
        assert tenant.provisioning_status == "provisioned"
        with tenant_context(tenant):
            assert TenantConfig.objects.count() == 1
            assert User.objects.filter(role="owner").count() == 1
    finally:
        _drop(schema)
```

- [x] **Step 4: Run the test to verify it fails**

Run: `docker compose exec django pytest apps/core/tests/test_lazy_provisioning.py -k schema_step -v`

Expected: FAIL — `provision_tenant_schema` does not exist yet (`AttributeError`).

- [x] **Step 5: Extract the function**

In `backend/apps/core/tasks.py`, add `provision_tenant_schema` above `provision_tenant`. Move the schema+owner+config body (current lines 303-354) into it, ending at the new `provisioned` status:

```python
def provision_tenant_schema(tenant, owner_email, owner_name, preferred_locale):
    """Create the tenant schema, the owner user (public + tenant schema), and a
    default TenantConfig — and stop. Idempotent: every step reuses existing rows.

    Does NOT seed niche content or AI-compose pages: those are deferred so this
    can run early (when the coach reaches the wizard content step) to give them
    a real schema to write content into. On success leaves
    provisioning_status='provisioned'. Callers that want the full site
    (provision_tenant) continue from there to seed + compose + 'ready'."""
    from apps.accounts.models import User

    tenant.provisioning_status = "provisioning"
    tenant.save(update_fields=["provisioning_status"])
    _set_provisioning_stage(tenant, "schema")

    tenant.create_schema(check_if_exists=True, verbosity=0)

    region = tenant.region or "global"
    User.objects.get_or_create(
        email=owner_email,
        region=region,
        defaults={
            "name": owner_name,
            "role": "coach",
            "preferred_locale": preferred_locale,
            "accessible_regions": [],
        },
    )

    _set_provisioning_stage(tenant, "config")
    with tenant_context(tenant):
        from apps.tenant_config.models import TenantConfig

        if not TenantConfig.objects.exists():
            _create_default_config(tenant, preferred_locale)

        User.objects.get_or_create(
            email=owner_email,
            region=region,
            defaults={
                "name": owner_name,
                "role": "owner",
                "is_staff": True,
                "preferred_locale": preferred_locale,
                "accessible_regions": [],
            },
        )

    tenant.provisioning_status = "provisioned"
    tenant.save(update_fields=["provisioning_status"])
```

- [x] **Step 6: Refactor `provision_tenant` to call the extracted step**

Replace the body of `provision_tenant` (the `try:` block, lines 302-376) so it delegates the schema step and keeps the seed+compose+ready tail unchanged:

```python
    tenant = Tenant.objects.get(id=tenant_id)
    try:
        from apps.core.constants import REGION_DEFAULT_LOCALE

        region = tenant.region or "global"
        preferred_locale = REGION_DEFAULT_LOCALE.get(region, "en")

        provision_tenant_schema(tenant, owner_email, owner_name, preferred_locale)

        _set_provisioning_stage(tenant, "seed")
        if niche and tenant.template_seed_status != "ready":
            from apps.core.demo.seed_template import TemplateSeedError, seed_template_into_tenant

            try:
                seed_template_into_tenant(tenant, niche, writer=logger.info)
                tenant.template_seed_status = "ready"
            except TemplateSeedError:
                logger.exception("Template seed failed for tenant %s (niche=%s)", tenant.slug, niche)
                tenant.template_seed_status = "failed"
            tenant.save(update_fields=["template_seed_status"])

        wizard_answers = (tenant.wizard_state or {}).get("answers") or {}
        if wizard_answers:
            _apply_wizard_answers(tenant, wizard_answers, preferred_locale)
            _seed_starter_post(tenant, preferred_locale)

        _set_provisioning_stage(tenant, "finalizing")
        tenant.provisioning_status = "ready"
        tenant.save(update_fields=["provisioning_status"])
        logger.info("Tenant %s provisioned successfully", tenant.slug)

    except Exception as exc:
        tenant.provisioning_status = "failed"
        tenant.save(update_fields=["provisioning_status"])
        logger.exception("Tenant provisioning failed for %s", tenant.slug)
        raise self.retry(exc=exc) from exc
```

Note: `seed_template_into_tenant` is imported locally inside the branch, matching the existing style (the test patches `tasks.seed_template_into_tenant`; add a module-level `from apps.core.demo.seed_template import seed_template_into_tenant` is NOT wanted — keep the local import, and in the test the patch target `tasks.seed_template_into_tenant` resolves the name the branch binds. If the local import makes the patch miss, patch `apps.core.demo.seed_template.seed_template_into_tenant` instead; the test file notes this).

- [x] **Step 7: Run the extraction tests**

Run: `docker compose exec django pytest apps/core/tests/test_lazy_provisioning.py -k schema_step -v`

Expected: PASS, 2 tests.

- [x] **Step 8: Verify the existing provisioning flow is unchanged**

Run: `docker compose exec django pytest apps/core -n auto -k "provision or onboard or wizard"`

Expected: PASS. The refactor is behavior-preserving; any failure here means the extraction changed the wizard-end path. If `seed_template_into_tenant`/`_apply_wizard_answers` patch targets in existing tests break, it is because the import moved — restore the exact import location, don't weaken the test.

- [x] **Step 9: Commit**

```bash
git add backend/apps/core/models.py backend/apps/core/migrations backend/apps/core/tasks.py backend/apps/core/tests/test_lazy_provisioning.py
git commit -m "refactor(onboarding): extract idempotent provision_tenant_schema step"
```

---

### Task 2: On-demand schema provisioning endpoint

**Files:**
- Modify: `backend/apps/core/tasks.py` (add `provision_wizard_schema`)
- Modify: `backend/apps/core/onboarding/wizard.py` (add `wizard_provision` view)
- Modify: `backend/apps/core/onboarding/urls.py` (route it)
- Test: `backend/apps/core/tests/test_lazy_provisioning.py` (extend)

**Interfaces:**
- Consumes: `provision_tenant_schema` (Task 1); the wizard-token auth pattern already used by `wizard_state`/`wizard_finalize`.
- Produces: `POST /api/v1/onboarding/wizard/provision/` → `{status: "<provisioning_status>"}`. Idempotent: enqueues `provision_wizard_schema` only when `provisioning_status == "pending"`; otherwise returns the current status. `provision_wizard_schema(tenant_id, owner_email, owner_name)` Celery task calls `provision_tenant_schema` and leaves status `provisioned`.

- [x] **Step 1: Write the failing endpoint tests**

These tests mock the Celery task, so the tenant needs only a public-schema **row** (no schema) — add a lightweight row factory and an APIClient. First hoist two imports to the **top** of `test_lazy_provisioning.py` with the existing imports (ruff's E402 fails `make lint` on mid-file imports):

```python
from unittest import mock

from rest_framework.test import APIClient
```

Then append the fixtures and helpers below the Task 1 tests:

```python
@pytest.fixture()
def client():
    return APIClient()


def _row_tenant(schema, **kw):
    """A public-schema Tenant row only — no PG schema (the enqueue task is
    mocked). region='global' so the wizard token's slugify(brand_name) + region
    resolve back to this row."""
    connection.set_schema_to_public()
    defaults = dict(
        schema_name=schema,
        name=schema.replace("_", "-"),
        slug=schema.replace("_", "-"),
        subdomain=schema.replace("_", "-"),
        owner_email=f"{schema}@example.com",
        region="global",
        provisioning_status="pending",
    )
    defaults.update(kw)
    return Tenant.objects.create(**defaults)


def _wizard_token(tenant):
    # Mirror how _resolve_tenant_from_wizard_token resolves: it does
    # slug = slugify(brand_name) and matches owner_email + region. Passing the
    # already-slug tenant.slug as brand_name slugifies to itself, so it resolves.
    from apps.accounts.tokens import create_wizard_token

    return create_wizard_token(
        tenant.owner_email, tenant.name, tenant.slug, region=tenant.region or "global"
    )


def test_provision_endpoint_enqueues_only_when_pending(client):
    tenant = _row_tenant("prov_ep", provisioning_status="pending")
    try:
        with mock.patch("apps.core.onboarding.wizard.provision_wizard_schema") as task:
            resp = client.post(
                "/api/v1/onboarding/wizard/provision/",
                {"token": _wizard_token(tenant)},
                format="json",
            )
        assert resp.status_code == 200
        task.delay.assert_called_once_with(tenant.id, tenant.owner_email, tenant.name)
    finally:
        Tenant.objects.filter(pk=tenant.pk).delete()


def test_provision_endpoint_is_idempotent_when_already_provisioned(client):
    tenant = _row_tenant("prov_ep2", provisioning_status="provisioned")
    try:
        with mock.patch("apps.core.onboarding.wizard.provision_wizard_schema") as task:
            resp = client.post(
                "/api/v1/onboarding/wizard/provision/",
                {"token": _wizard_token(tenant)},
                format="json",
            )
        assert resp.status_code == 200
        assert resp.json()["status"] == "provisioned"
        task.delay.assert_not_called()
    finally:
        Tenant.objects.filter(pk=tenant.pk).delete()
```

- [x] **Step 2: Run to verify failure**

Run: `docker compose exec django pytest apps/core/tests/test_lazy_provisioning.py -k provision_endpoint -v`

Expected: FAIL — route 404 / `provision_wizard_schema` missing.

- [x] **Step 3: Add the Celery task**

In `backend/apps/core/tasks.py`, below `provision_tenant`:

```python
@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def provision_wizard_schema(self, tenant_id, owner_email, owner_name):
    """Early, content-step provisioning: schema + owner + config only, no seed
    or compose. Enqueued when the coach reaches the wizard's content step so
    they have a real schema to write their first course/event/post into."""
    from apps.core.constants import REGION_DEFAULT_LOCALE
    from apps.core.models import Tenant

    tenant = Tenant.objects.get(id=tenant_id)
    if tenant.provisioning_status not in ("pending", "failed"):
        return  # already provisioning/provisioned/ready — nothing to do
    try:
        region = tenant.region or "global"
        preferred_locale = REGION_DEFAULT_LOCALE.get(region, "en")
        provision_tenant_schema(tenant, owner_email, owner_name, preferred_locale)
    except Exception as exc:
        tenant.provisioning_status = "failed"
        tenant.save(update_fields=["provisioning_status"])
        logger.exception("Wizard schema provisioning failed for %s", tenant.slug)
        raise self.retry(exc=exc) from exc
```

- [x] **Step 4: Add the view**

In `backend/apps/core/onboarding/wizard.py`, mirror `wizard_state`'s decode/lookup. Add near the other views:

Use the existing shared helper `_resolve_tenant_from_wizard_token(request)` (`wizard.py:29-57`) — it already returns `(payload, tenant, err)` with token decode, slug/region lookup, and owner-match, exactly as `wizard_state` and `wizard_finalize` do. Do not write new JWT logic.

```python
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_provision(request):
    """Enqueue early schema provisioning for the token's tenant. Idempotent:
    only 'pending' tenants enqueue; any other state just reports its status.
    The frontend polls the existing provisioning-status view until 'provisioned'
    before showing the content step."""
    from ..tasks import provision_wizard_schema

    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err:
        return err
    if tenant.provisioning_status == "pending":
        provision_wizard_schema.delay(tenant.id, tenant.owner_email, tenant.name)
    return Response({"status": tenant.provisioning_status})
```

- [x] **Step 5: Route it**

In `backend/apps/core/onboarding/urls.py`, add alongside the other `wizard/` routes:

```python
    path("wizard/provision/", wizard.wizard_provision, name="wizard-provision"),
```

- [x] **Step 6: Run the endpoint tests**

Run: `docker compose exec django pytest apps/core/tests/test_lazy_provisioning.py -v`

Expected: PASS (all extraction + endpoint tests).

- [x] **Step 7: Commit**

```bash
git add backend/apps/core/tasks.py backend/apps/core/onboarding/wizard.py backend/apps/core/onboarding/urls.py backend/apps/core/tests/test_lazy_provisioning.py
git commit -m "feat(onboarding): on-demand wizard schema provisioning endpoint"
```

---

### Task 3: Two-stage orphan cleanup cron

**Files:**
- Modify: `backend/config/settings/base.py:214-217` (settings)
- Modify: `backend/apps/core/onboarding/recovery.py` (`find_abandoned_tenants`, `send_abandon_warning`)
- Modify: `backend/apps/core/tasks.py` (`cleanup_abandoned_signups` task)
- Modify: `backend/config/celery.py:12-49` (beat entry)
- Test: `backend/apps/core/tests/test_abandoned_cleanup.py` (create)

**Interfaces:**
- Consumes: `Tenant.abandon_warned_at` (Task 1); the recovery-email send pattern in `recovery.py:101-154`; `_last_activity(tenant)` (`recovery.py:61-72`).
- Produces: `find_abandoned_tenants(now) -> (to_warn: QuerySet, to_delete: list[Tenant])`; `cleanup_abandoned_signups()` Celery task running both stages.

- [x] **Step 1: Add the settings**

In `backend/config/settings/base.py`, after the existing wizard settings (line 217):

```python
WIZARD_ABANDON_WARN_DAYS = 14  # signup idle this long → final "about to delete" warning
WIZARD_ABANDON_DELETE_GRACE_DAYS = 7  # after the warning, wait this long, then drop schema + row
```

- [x] **Step 2: Write the failing selector + safety tests**

Create `backend/apps/core/tests/test_abandoned_cleanup.py`. These do NOT create real schemas — `tenant.delete(force_drop=True)` is guarded by `schema_exists`, so a schemaless row deletes cleanly, which is exactly the abandoned-at-pending case:

```python
"""The cleanup cron reclaims abandoned signups that early provisioning would
otherwise leave as orphaned schemas. It is destructive, so every guard is a
test: never touch public, published, ready, or in-flight tenants."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.core.models import Tenant
from apps.core.onboarding.recovery import find_abandoned_tenants

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def _isolate_ab_tenants():
    """These tests commit real rows (transaction=True) and must not see each
    other's (or a prior --reuse-db run's) leftovers. Scope hard to this file's
    'ab_' schema prefix so the shared-test tenant is never touched; force_drop
    reclaims any schema a mid-test failure leaked."""
    def _purge():
        for t in Tenant.objects.filter(schema_name__startswith="ab_"):
            t.delete(force_drop=True)

    _purge()
    yield
    _purge()


def _tenant(**kw):
    n = kw.pop("n", "ab")
    defaults = dict(
        schema_name=f"ab_{n}",
        name="Ab Co",
        slug=f"ab-{n}",
        owner_email=f"{n}@example.com",
        subdomain=f"ab-{n}",
        provisioning_status="pending",
        is_published=False,
    )
    defaults.update(kw)
    t = Tenant.objects.create(**defaults)
    return t


def _age(tenant, days):
    """Force created_at and clear activity so _last_activity == created_at."""
    Tenant.objects.filter(pk=tenant.pk).update(
        created_at=timezone.now() - timedelta(days=days),
        wizard_state={},
    )
    tenant.refresh_from_db()
    return tenant


def test_idle_pending_tenant_past_warn_window_is_selected_to_warn():
    t = _age(_tenant(n="warn"), 15)
    to_warn, to_delete = find_abandoned_tenants(timezone.now())
    assert t in list(to_warn)
    assert t not in to_delete


def test_warned_tenant_past_grace_is_selected_to_delete():
    t = _tenant(n="del")
    _age(t, 30)
    Tenant.objects.filter(pk=t.pk).update(
        abandon_warned_at=timezone.now() - timedelta(days=8)
    )
    t.refresh_from_db()
    to_warn, to_delete = find_abandoned_tenants(timezone.now())
    assert t in to_delete


def test_published_tenant_is_never_touched():
    t = _age(_tenant(n="pub", is_published=True), 90)
    Tenant.objects.filter(pk=t.pk).update(
        abandon_warned_at=timezone.now() - timedelta(days=90)
    )
    to_warn, to_delete = find_abandoned_tenants(timezone.now())
    assert t not in list(to_warn)
    assert t not in to_delete


def test_ready_tenant_is_never_touched():
    t = _age(_tenant(n="ready", provisioning_status="ready"), 90)
    to_warn, to_delete = find_abandoned_tenants(timezone.now())
    assert t not in list(to_warn) and t not in to_delete


def test_in_flight_provisioning_tenant_is_never_touched():
    t = _age(_tenant(n="inflight", provisioning_status="provisioning"), 90)
    to_warn, to_delete = find_abandoned_tenants(timezone.now())
    assert t not in list(to_warn) and t not in to_delete


def test_public_tenant_is_never_touched():
    # The shared public row must be invisible to cleanup regardless of age.
    pub = Tenant.objects.filter(schema_name="public").first()
    if pub is None:
        pytest.skip("no public row in this test DB")
    to_warn, to_delete = find_abandoned_tenants(timezone.now())
    assert pub not in list(to_warn) and pub not in to_delete


def test_recent_pending_tenant_is_left_alone():
    t = _age(_tenant(n="fresh"), 2)
    to_warn, _ = find_abandoned_tenants(timezone.now())
    assert t not in list(to_warn)  # 2 days idle is well inside the 14-day window


def test_provisioned_but_abandoned_tenant_with_schema_is_deletable():
    """The new risk: early provisioning leaves a real schema. Cleanup must
    delete it via force_drop without error even though the schema exists."""
    t = _tenant(n="hasschema", provisioning_status="provisioned")
    t.create_schema(check_if_exists=True, verbosity=0)
    _age(t, 30)
    Tenant.objects.filter(pk=t.pk).update(
        abandon_warned_at=timezone.now() - timedelta(days=8)
    )
    t.refresh_from_db()
    _, to_delete = find_abandoned_tenants(timezone.now())
    assert t in to_delete
    # The task's delete call must not raise with a live schema:
    t.delete(force_drop=True)
    assert not Tenant.objects.filter(pk=t.pk).exists()
```

- [x] **Step 3: Run to verify failure**

Run: `docker compose exec django pytest apps/core/tests/test_abandoned_cleanup.py -v`

Expected: FAIL — `find_abandoned_tenants` does not exist.

- [x] **Step 4: Implement the selector**

In `backend/apps/core/onboarding/recovery.py`, add (reusing `_last_activity`):

```python
from django.conf import settings


def find_abandoned_tenants(now=None):
    """Two-stage abandoned-signup selection.

    Returns (to_warn, to_delete):
      * to_warn   — idle >= WIZARD_ABANDON_WARN_DAYS, not yet warned.
      * to_delete — warned >= WIZARD_ABANDON_DELETE_GRACE_DAYS ago.

    Only ever considers reclaimable tenants: not the public row, not published,
    and provisioning_status in {pending, provisioned, failed} (never 'ready' or
    in-flight 'provisioning'). Idleness uses _last_activity (max wizard step
    timestamp, else created_at)."""
    from django.utils import timezone

    from apps.core.models import Tenant

    now = now or timezone.now()
    warn_cutoff = now - timedelta(days=settings.WIZARD_ABANDON_WARN_DAYS)
    grace_cutoff = now - timedelta(days=settings.WIZARD_ABANDON_DELETE_GRACE_DAYS)

    reclaimable = Tenant.objects.exclude(schema_name="public").filter(
        is_published=False,
        provisioning_status__in=("pending", "provisioned", "failed"),
    )

    to_warn = [
        t
        for t in reclaimable.filter(abandon_warned_at__isnull=True)
        if _last_activity(t) < warn_cutoff
    ]
    to_delete = [
        t
        for t in reclaimable.filter(abandon_warned_at__isnull=False)
        if t.abandon_warned_at < grace_cutoff
    ]
    return to_warn, to_delete
```

`timedelta` is already imported in `recovery.py` (it uses it for the recovery window); if not, add `from datetime import timedelta`.

- [x] **Step 5: Run selector tests**

Run: `docker compose exec django pytest apps/core/tests/test_abandoned_cleanup.py -v`

Expected: PASS. (`find_abandoned_tenants` returns lists; the `in list(to_warn)` assertions work whether it returns a list or queryset.)

- [x] **Step 6: Add the warning helper**

In `recovery.py`, add a thin final-warning sender modeled on `send_recovery_email` (`recovery.py:101-154`) — read that function and reuse its token minting and EN/TR body pattern, changing the copy to "your unfinished signup will be removed in N days; click to resume." Stamp `abandon_warned_at` only on successful send:

```python
def send_abandon_warning(tenant, now=None):
    """Final 'about to be deleted' nudge with a resume link. Stamps
    abandon_warned_at only on success so a send failure retries next beat."""
    from django.utils import timezone
    # ... build the same /signup/verify?token=… resume link as send_recovery_email,
    #     send the EN/TR "signup expiring" email, then:
    tenant.abandon_warned_at = now or timezone.now()
    tenant.save(update_fields=["abandon_warned_at"])
```

Fill the body by copying `send_recovery_email`'s link-building and send call verbatim; only the email subject/body strings differ. Do not invent a new mail transport.

- [x] **Step 7: Add the Celery task and beat entry**

In `backend/apps/core/tasks.py`:

```python
@shared_task
def cleanup_abandoned_signups():
    """Reclaim abandoned signups. Stage 1 warns idle tenants; stage 2 drops the
    schema + row of tenants whose warning grace has elapsed. Destructive — the
    selection guards live in recovery.find_abandoned_tenants."""
    from apps.core.onboarding.recovery import find_abandoned_tenants, send_abandon_warning

    to_warn, to_delete = find_abandoned_tenants()
    for tenant in to_warn:
        try:
            send_abandon_warning(tenant)
        except Exception:  # noqa: BLE001 — one bad send must not stop the batch
            logger.exception("abandon warning failed for %s", tenant.slug)
    deleted = 0
    for tenant in to_delete:
        slug = tenant.slug
        try:
            tenant.delete(force_drop=True)  # drops schema iff it exists, then row
            deleted += 1
        except Exception:  # noqa: BLE001
            logger.exception("abandoned-tenant delete failed for %s", slug)
    logger.info("cleanup_abandoned_signups: warned=%d deleted=%d", len(to_warn), deleted)
```

In `backend/config/celery.py`, add a beat entry (daily, off-peak, away from the other jobs' minutes):

```python
    "cleanup-abandoned-signups": {
        "task": "apps.core.tasks.cleanup_abandoned_signups",
        "schedule": crontab(hour="4", minute="40"),
    },
```

- [x] **Step 8: Test the task end-to-end**

Add to `test_abandoned_cleanup.py`:

Mock the selector at its **source module** (`cleanup_abandoned_signups` imports it locally from `recovery`, so patch there, not on `tasks`). This keeps the destructive task from scanning the whole test DB and only lets it act on the two controlled rows. Add `from unittest import mock` and `from apps.core import tasks` at the **top** of `test_abandoned_cleanup.py` (not here — E402):

```python
def test_cleanup_task_warns_then_deletes():
    warn = _age(_tenant(n="taskwarn"), 20)
    doomed = _tenant(n="taskdel", provisioning_status="provisioned")

    with (
        mock.patch(
            "apps.core.onboarding.recovery.find_abandoned_tenants",
            return_value=([warn], [doomed]),
        ),
        mock.patch("apps.core.onboarding.recovery.send_abandon_warning") as warn_send,
    ):
        tasks.cleanup_abandoned_signups()

    warn_send.assert_called_once()
    assert warn_send.call_args.args[0].pk == warn.pk
    assert not Tenant.objects.filter(pk=doomed.pk).exists()  # deleted (force_drop)
    assert Tenant.objects.filter(pk=warn.pk).exists()        # only warned
```

Run: `docker compose exec django pytest apps/core/tests/test_abandoned_cleanup.py -v`

Expected: PASS (all selector + safety + task tests).

- [x] **Step 9: Commit**

```bash
git add backend/config/settings/base.py backend/apps/core/onboarding/recovery.py backend/apps/core/tasks.py backend/config/celery.py backend/apps/core/tests/test_abandoned_cleanup.py
git commit -m "feat(onboarding): two-stage cleanup cron for abandoned lazily-provisioned signups"
```

---

## Verification before calling this plan done

- [x] `docker compose exec django pytest apps/core -n auto` passes (extraction, endpoint, cleanup, and every pre-existing provisioning test).
- [x] `make lint` passes with zero warnings.
- [x] Manual check in `make shell`: on a fresh `pending` tenant, `provision_tenant_schema(t, t.owner_email, t.name, "en")` leaves `provisioning_status == "provisioned"`, a schema exists (`from django_tenants.utils import schema_exists; schema_exists(t.schema_name) is True`), and `TenantConfig` exists inside `tenant_context(t)` — with no niche seed and no composed pages.
- [x] Manual check: `find_abandoned_tenants()` on the dev DB returns `([], [])` (no real signups are abandoned), and never includes the `public` row.
- [x] The existing wizard-end flow still yields a fully composed, `ready` tenant (run one real signup through `make dev` if practical, or trust the green `provision_tenant` tests).

## Execution notes (2026-07-26)

Where reality differed from the plan as written. Plan 3b/3c build on this — read before starting them.

1. **Task 2's view and its test contradicted each other.** The plan's `wizard_provision`
   imports the task function-locally (`from ..tasks import provision_wizard_schema`),
   so the task is *not* an attribute of `wizard.py` — but the plan's test patched
   `apps.core.onboarding.wizard.provision_wizard_schema`, which raises
   `AttributeError`. Kept the view exactly as planned (function-local imports are the
   house style here to dodge cycles; `apps/core/CLAUDE.md` warns against "cleaning
   them up") and moved the patch to the source module —
   `apps.core.tasks.provision_wizard_schema.delay`, mirroring how
   `test_wizard_finalize.py:53` patches `provision_tenant`. Later sub-plans should
   patch onboarding tasks at `apps.core.tasks.*`, never on the view module.
2. **`test_public_tenant_is_never_touched` was a permanent no-op as written.** It
   did `pytest.skip` when no `public` Tenant row exists — and the test DB never has
   one (`conftest.py` only creates the shared tenant). That left the single most
   dangerous guard untested, contradicting the plan's own "every one of these is an
   independent test". The test now creates a `public` row wearing the exact
   abandoned profile (idle, unpublished, pending, past grace) and tears it down in
   `finally`. Verified it has teeth by removing `exclude(schema_name="public")` and
   watching it fail — the row landed in `to_delete`.
3. **`find_abandoned_tenants` reuses the module-level `timezone`/`settings`/
   `timedelta`** already imported in `recovery.py`, instead of the plan's
   function-local re-imports — matching `recovery_candidates` right above it, which
   imports only `Tenant` locally.
4. **`send_abandon_warning` carries the name/slug drift guard** copied from
   `send_recovery_email`. This is fail-safe by design: on drift it returns False
   without stamping `abandon_warned_at`, so the tenant is never warned and therefore
   never deleted. Added `_ABANDON_COPY` (EN/TR); **TR needs native review**.
5. **Ruff C408** rejected the plan's `defaults = dict(...)` in both new test files;
   rewritten as dict literals.
6. **Test-DB hygiene, worth knowing:** iterating on these `transaction=True` tests
   with the default `--reuse-db` reliably dirties the DB and produces a block of
   ~22 `test_seed_dev_tenants` failures. Confirmed *not* caused by these files — the
   full suite passes 545/545 with `--create-db`, and the seed tests pass alongside
   both new files. Use `--create-db` when running the core suite after touching this
   area.
7. **Process:** executed on a normal feature branch rather than a git worktree,
   because the dev stack's containers bind-mount the primary working directory —
   tests in a worktree would not be visible to `docker compose exec django pytest`.

## What comes next (the rest of Plan 3)

Plan 3 (content-first wizard) is decomposed into sub-plans because the spec's "wizard + lazy provisioning" is really several independent subsystems. This is 3a — the backend foundation, shippable and testable alone, with no user-visible change.

| Sub-plan | Scope | Depends on |
|----------|-------|------------|
| **3a — Lazy provisioning foundation** (this one) | Extract schema step, on-demand endpoint, orphan cleanup cron | Plan 1 (merged) |
| 3b — Content-first step machine | Delete Look/Pages chapters, add Content chapter (frontend machine + backend catalog); call `wizard/provision/` on entering content | 3a |
| 3c — Content-creation APIs | Onboarding endpoints writing real course/event/blog rows in `tenant_context`; AI course outlines | 3a, 3b |
| 3d — Reveal + compose fallback | Compose from real content at reveal; deterministic template fallback on AI failure | 3c |
| 3e — Holdout (50/50) | Build the missing bucketing primitive; split old vs new wizard; funnel metrics | 3b–3d |

Full-Phase-1 map (all five plans) is in the design spec's "Phasing" section.
