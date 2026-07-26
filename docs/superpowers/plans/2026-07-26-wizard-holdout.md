# Wizard A/B Holdout Implementation Plan

**STATUS: COMPLETE** — implemented on branch `feat/lazy-provisioning-foundation` (2026-07-26).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Give every new signup a stable, deterministic `control` / `treatment` bucket so the content-first wizard (Plan 3b–3d) can ship to half of new coaches while the other half stays on today's wizard, and provide a report command that compares verify→publish conversion between the two.

**Architecture:** No feature-flag library exists in this codebase (verified: zero hits for posthog/launchdarkly/growthbook/unleash/flagsmith/waffle or any custom bucketing primitive). This plan adds the smallest possible primitive: a pure deterministic hash-to-bucket function, a `Tenant.wizard_bucket` field assigned once at email-verify, exposure of that bucket in the wizard-state response so the frontend can pick a flow, and a management command that tallies the funnel per bucket. It builds nothing UI-facing — the flow-selection branch lives in Plan 3b, which owns the new wizard.

**Tech Stack:** Django 5.1, DRF, pytest, Docker Compose.

## Why this plan exists (context for a fresh engineer)

The onboarding spec's "Rollout and measurement" section requires the content-first wizard to ship behind a **50/50 holdout** with verify→publish as the primary metric and a rollback trigger. This plan is the bucketing substrate for that. It is independent of the wizard rework: the bucket can be assigned, stored, exposed, and reported on before any new wizard exists — treatment simply renders the same old wizard until Plan 3b wires the branch. That means this plan is safe to land early and de-risks the experiment infrastructure separately from the experiment content.

**Where signups begin** (verified — file:line): `creator_signup_verify` (`backend/apps/core/onboarding/views.py:220-234`) creates the `Tenant` row (public schema, `provisioning_status="pending"`). Wizard state is read via `_state_body` (`backend/apps/core/onboarding/wizard.py:60-67`), which returns `{slug, status, template_status, has_paid_platform_plan, state}` to the frontend.

## Global Constraints

- **A bucket is assigned exactly once, at first Tenant creation, and never changes.** Re-bucketing a returning coach would corrupt the experiment. Assignment happens only in the fresh-create branch of `creator_signup_verify`; the resume branch (which reuses an existing tenant) must leave the existing bucket untouched.
- **Deterministic and independent of wall-clock/randomness.** The assignment must be reproducible from a stable seed (the tenant's own key) so tests are exact and re-runs are stable. Do not use `random`/`Math.random`.
- **Additive API only.** `_state_body` gains a `wizard_bucket` key; no existing key changes shape.
- **This plan ships no behavioral change.** Assigning and exposing a bucket that nothing branches on is intentional — the branch is Plan 3b. Do not add flow-selection here.
- Tests run in Docker: `docker compose exec django pytest <path> -n auto` with the dev stack up. `test_seed_dev_tenants` block failures = dirty reused test DB; rerun with `--create-db`.

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `backend/apps/core/onboarding/experiments.py` | create | Pure `assign_wizard_bucket(seed) -> str` + bucket constants. |
| `backend/apps/core/models.py` | modify | `Tenant.wizard_bucket` field. |
| `backend/apps/core/migrations/00XX_wizard_bucket.py` | generate | Migration (public schema). |
| `backend/apps/core/onboarding/views.py` | modify | Assign the bucket at fresh Tenant create. |
| `backend/apps/core/onboarding/wizard.py` | modify | Expose `wizard_bucket` in `_state_body`. |
| `backend/apps/core/management/commands/wizard_holdout_report.py` | create | Per-bucket verify→publish funnel tally. |
| `backend/apps/core/tests/test_wizard_holdout.py` | create | Primitive, assignment, exposure, report tests. |

---

### Task 1: Deterministic bucketing primitive

**Files:**
- Create: `backend/apps/core/onboarding/experiments.py`
- Test: `backend/apps/core/tests/test_wizard_holdout.py` (create)

**Interfaces:**
- Produces: `assign_wizard_bucket(seed: str) -> str` returning `WIZARD_BUCKET_CONTROL` (`"control"`) or `WIZARD_BUCKET_TREATMENT` (`"treatment"`), plus module constants `WIZARD_BUCKETS = ("control", "treatment")`.

- [x] **Step 1: Write the failing tests**

Create `backend/apps/core/tests/test_wizard_holdout.py`:

```python
"""The wizard holdout bucket must be deterministic (same seed → same bucket),
roughly even across many seeds, and drawn only from the known set."""

from apps.core.onboarding.experiments import (
    WIZARD_BUCKETS,
    assign_wizard_bucket,
)


def test_bucket_is_deterministic_for_a_seed():
    assert assign_wizard_bucket("coach@example.com") == assign_wizard_bucket(
        "coach@example.com"
    )


def test_bucket_is_always_a_known_value():
    for i in range(200):
        assert assign_wizard_bucket(f"seed-{i}") in WIZARD_BUCKETS


def test_distribution_is_roughly_even_over_many_seeds():
    treatment = sum(
        1 for i in range(2000) if assign_wizard_bucket(f"user-{i}") == "treatment"
    )
    # 50/50 with generous slack for hash noise over 2000 draws.
    assert 850 <= treatment <= 1150


def test_distinct_seeds_can_differ():
    buckets = {assign_wizard_bucket(f"x{i}") for i in range(20)}
    assert buckets == set(WIZARD_BUCKETS)  # both buckets appear
```

- [x] **Step 2: Run to verify failure**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_holdout.py -v`

Expected: FAIL — module `experiments` does not exist.

- [x] **Step 3: Implement the primitive**

Create `backend/apps/core/onboarding/experiments.py`:

```python
"""Deterministic A/B bucketing for the onboarding wizard holdout.

No feature-flag library is used platform-wide; this is the minimal primitive.
The bucket is a stable function of a per-tenant seed, so it never changes and
needs no persistence to be reproducible (we persist it anyway, on Tenant, for
cheap funnel queries)."""

import hashlib

WIZARD_BUCKET_CONTROL = "control"
WIZARD_BUCKET_TREATMENT = "treatment"
WIZARD_BUCKETS = (WIZARD_BUCKET_CONTROL, WIZARD_BUCKET_TREATMENT)


def assign_wizard_bucket(seed: str) -> str:
    """Stable 50/50 split. Uses the low bit of a SHA-256 of the seed, so it is
    independent of Python's hash randomization and reproducible across runs."""
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    return WIZARD_BUCKET_TREATMENT if digest[-1] & 1 else WIZARD_BUCKET_CONTROL
```

- [x] **Step 4: Run to verify pass**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_holdout.py -v`

Expected: PASS, 4 tests.

- [x] **Step 5: Commit**

```bash
git add backend/apps/core/onboarding/experiments.py backend/apps/core/tests/test_wizard_holdout.py
git commit -m "feat(onboarding): deterministic wizard holdout bucketing primitive"
```

---

### Task 2: Persist and expose the bucket

**Files:**
- Modify: `backend/apps/core/models.py`
- Generate: `backend/apps/core/migrations/00XX_wizard_bucket.py`
- Modify: `backend/apps/core/onboarding/views.py:220-234`
- Modify: `backend/apps/core/onboarding/wizard.py:60-67`
- Test: `backend/apps/core/tests/test_wizard_holdout.py` (extend)

**Interfaces:**
- Consumes: `assign_wizard_bucket` (Task 1).
- Produces: `Tenant.wizard_bucket` (`""` until assigned, else a value in `WIZARD_BUCKETS`); `_state_body(tenant)` now includes `"wizard_bucket": tenant.wizard_bucket`.

- [x] **Step 1: Add the field**

In `backend/apps/core/models.py`, on `Tenant`, near `wizard_state`:

```python
    wizard_bucket = models.CharField(
        max_length=16,
        blank=True,
        default="",
        help_text=(
            "A/B holdout bucket ('control' | 'treatment'), assigned once at "
            "email-verify and never changed. Empty on tenants created before "
            "the holdout. See apps.core.onboarding.experiments."
        ),
    )
```

- [x] **Step 2: Generate and apply the migration**

```bash
docker compose exec django python manage.py makemigrations core --name wizard_bucket
docker compose exec django python manage.py migrate_schemas --shared
```

Expected: one `AddField` on `core.tenant`; migrate OK.

- [x] **Step 3: Write the failing assignment + exposure tests**

Append to `test_wizard_holdout.py`:

```python
import pytest
from django.db import connection

from apps.core.models import Tenant
from apps.core.onboarding.experiments import assign_wizard_bucket
from apps.core.onboarding.wizard import _state_body

pytestmark = pytest.mark.django_db(transaction=True)


def _row(schema="bucket_expose"):
    connection.set_schema_to_public()
    return Tenant.objects.create(
        schema_name=schema,
        name=schema.replace("_", "-"),
        slug=schema.replace("_", "-"),
        subdomain=schema.replace("_", "-"),
        owner_email=f"{schema}@example.com",
        region="global",
        wizard_bucket=assign_wizard_bucket(f"{schema}@example.com"),
    )


def test_state_body_exposes_the_bucket():
    tenant = _row()
    try:
        body = _state_body(tenant)
        assert body["wizard_bucket"] == tenant.wizard_bucket
        assert body["wizard_bucket"] in ("control", "treatment")
    finally:
        Tenant.objects.filter(pk=tenant.pk).delete()
```

Then a signup-verify assignment test that drives the real endpoint. Read `creator_signup_verify` (`views.py:173-256`) and the signup-token minting in `apps/accounts/tokens.py` (`create_signup_token`) to build a valid token; assert the created tenant has a non-empty bucket:

```python
def test_verify_assigns_a_bucket_on_fresh_create(client):
    from apps.accounts.tokens import create_signup_token

    token = create_signup_token(
        "bucknew@example.com", "Buck New", "Buck Brand", "global"
    )
    slug = "buck-brand"
    Tenant.objects.filter(slug=slug, region="global").delete()  # ensure fresh
    try:
        resp = client.post(
            "/api/v1/onboarding/signup/verify/", {"token": token}, format="json"
        )
        assert resp.status_code == 201, resp.content
        tenant = Tenant.objects.get(slug=slug, region="global")
        assert tenant.wizard_bucket in ("control", "treatment")
    finally:
        Tenant.objects.filter(slug=slug, region="global").delete()
```

Add a `client` fixture (`APIClient`) at the top if not already present. Confirm the exact `create_signup_token` signature first (`apps/accounts/tokens.py`) — it is `create_signup_token(email, name, brand_name, region)`; `slugify(brand_name)` must equal the tenant slug the verify view creates.

- [x] **Step 4: Run to verify failure**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_holdout.py -k "state_body or verify_assigns" -v`

Expected: FAIL — `_state_body` has no `wizard_bucket` key; the fresh tenant's bucket is `""`.

- [x] **Step 5: Assign at fresh create**

In `backend/apps/core/onboarding/views.py`, in the fresh-create branch (line 220), add the import at the top of the module and set the field on create:

```python
from apps.core.onboarding.experiments import assign_wizard_bucket
```

```python
    tenant = Tenant.objects.create(
        schema_name=schema_name,
        name=brand_name,
        slug=slug,
        subdomain=slug,
        owner_email=email,
        provisioning_status="pending",
        region=region,
        billing_currency=REGION_DEFAULT_CURRENCY.get(region, "USD"),
        wizard_bucket=assign_wizard_bucket(f"{email}:{region}"),
    )
```

Seed with `email:region` (email is unique per region, so this is the stable per-tenant key). Do NOT touch the resume branch above (line 210-216) — a returning coach keeps their original bucket.

- [x] **Step 6: Expose in `_state_body`**

In `backend/apps/core/onboarding/wizard.py`:

```python
def _state_body(tenant) -> dict:
    return {
        "slug": tenant.slug,
        "status": tenant.provisioning_status,
        "template_status": tenant.template_seed_status,
        "has_paid_platform_plan": tenant.has_paid_platform_plan,
        "wizard_bucket": tenant.wizard_bucket,
        "state": tenant.wizard_state or {},
    }
```

- [x] **Step 7: Run to verify pass**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_holdout.py -v`

Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add backend/apps/core/models.py backend/apps/core/migrations backend/apps/core/onboarding/views.py backend/apps/core/onboarding/wizard.py backend/apps/core/tests/test_wizard_holdout.py
git commit -m "feat(onboarding): assign and expose the wizard holdout bucket"
```

---

### Task 3: Holdout funnel report command

**Files:**
- Create: `backend/apps/core/management/commands/wizard_holdout_report.py`
- Test: `backend/apps/core/tests/test_wizard_holdout.py` (extend)

**Interfaces:**
- Produces: `python manage.py wizard_holdout_report [--since-days N]` printing, per bucket, the count of signups and how many reached `is_published=True`, with the publish rate. A `--json` flag emits the same as machine-readable JSON for dashboards.

- [x] **Step 1: Write the failing test**

Append to `test_wizard_holdout.py`:

```python
from io import StringIO

from django.core.management import call_command


def test_report_counts_publish_rate_per_bucket():
    made = []
    try:
        for i in range(4):
            t = Tenant.objects.create(
                schema_name=f"rep_{i}",
                name=f"rep-{i}",
                slug=f"rep-{i}",
                subdomain=f"rep-{i}",
                owner_email=f"rep{i}@example.com",
                region="global",
                wizard_bucket="treatment" if i < 2 else "control",
                is_published=(i == 0),  # one treatment tenant published
            )
            made.append(t)
        out = StringIO()
        call_command("wizard_holdout_report", "--json", stdout=out)
        import json

        data = json.loads(out.getvalue())
        assert data["treatment"]["signups"] >= 2
        assert data["treatment"]["published"] >= 1
        assert data["control"]["published"] >= 0
    finally:
        for t in made:
            Tenant.objects.filter(pk=t.pk).delete()
```

- [x] **Step 2: Run to verify failure**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_holdout.py -k report -v`

Expected: FAIL — unknown command `wizard_holdout_report`.

- [x] **Step 3: Implement the command**

Model on an existing command's structure (e.g. `backend/apps/core/management/commands/decommission_demo_tenants.py`). Create `backend/apps/core/management/commands/wizard_holdout_report.py`:

```python
"""Per-bucket onboarding funnel: signups vs. published, for the wizard holdout.

Verify→publish is the experiment's primary metric; this is the manual readout
the rollout decision uses. Kept a command (not a dashboard) deliberately —
it is a periodic check, not a live surface."""

import json as jsonlib

from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta

from apps.core.models import Tenant
from apps.core.onboarding.experiments import WIZARD_BUCKETS


class Command(BaseCommand):
    help = "Report signups and publish rate per wizard holdout bucket."

    def add_arguments(self, parser):
        parser.add_argument("--since-days", type=int, default=30)
        parser.add_argument("--json", action="store_true", dest="as_json")

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(days=options["since_days"])
        report = {}
        for bucket in WIZARD_BUCKETS:
            qs = Tenant.objects.filter(
                wizard_bucket=bucket, created_at__gte=cutoff
            ).exclude(schema_name="public")
            signups = qs.count()
            published = qs.filter(is_published=True).count()
            report[bucket] = {
                "signups": signups,
                "published": published,
                "publish_rate": round(published / signups, 4) if signups else 0.0,
            }
        if options["as_json"]:
            self.stdout.write(jsonlib.dumps(report))
            return
        for bucket, r in report.items():
            self.stdout.write(
                f"{bucket:>10}: {r['signups']:>5} signups  "
                f"{r['published']:>5} published  "
                f"{r['publish_rate'] * 100:5.1f}% publish rate"
            )
```

- [x] **Step 4: Run to verify pass**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_holdout.py -v`

Expected: PASS (all holdout tests).

- [x] **Step 5: Commit**

```bash
git add backend/apps/core/management/commands/wizard_holdout_report.py backend/apps/core/tests/test_wizard_holdout.py
git commit -m "feat(onboarding): wizard holdout funnel report command"
```

---

## Verification before calling this plan done

- [x] `docker compose exec django pytest apps/core/tests/test_wizard_holdout.py -n auto` passes.
- [x] `make lint` passes with zero warnings.
- [x] Manual: `docker compose exec django python manage.py wizard_holdout_report` prints both buckets without error against the dev DB.
- [x] Manual: two `creator_signup_verify` calls with different emails both produce a tenant whose `wizard_bucket` is non-empty, and re-verifying the same email does not change the bucket.

## Execution notes (2026-07-26)

Deviations from the plan as written, and why:

1. **Added `test_reverify_does_not_rebucket_a_returning_coach`.** The plan's
   headline constraint ("assigned exactly once, never changes") had no test —
   only the fresh-create path was covered. The new test verifies, forces the
   *opposite* bucket, re-verifies, and asserts the resume branch (200, not 201)
   left it alone. Without this the constraint was an assertion in prose only.
2. **The report test measures a delta, not an absolute.** The plan's version
   asserted `signups >= 2`, which passes even if the command counted every
   tenant in the DB. It now snapshots the report before and after creating the
   four rows and asserts the difference is exactly 2/1/2/0, so a broken filter
   fails the test.
3. **Added `test_report_never_counts_the_public_row_and_survives_an_empty_bucket`**
   — the zero-signup branch (`publish_rate` divide) was otherwise unexercised.
4. **`--since-days 0` is the empty-window handle** used by that test; the
   command needed no change to support it.
5. **Separate style commit for the migration.** `makemigrations` emits single
   quotes and an unwrapped `CharField(...)`; pre-commit's ruff-format rewrites
   both, so `make lint` failed on first run. Committed the reformat on its own
   so the migration's content is visibly unchanged.

**Verification results:** `test_wizard_holdout.py` 9 passed (serial and
`-n auto`); full `apps/core` 567 passed on a clean DB; `make lint` exit 0.
Manual: `manage.py wizard_holdout_report` prints both buckets against the dev DB
without error (0/0 — every existing dev tenant predates the field, bucket `""`).
Manual: two real `/signup/verify/` calls returned 201 with buckets `control` and
`treatment` respectively; re-verifying the first returned 200 (resume branch)
with the bucket unchanged.

## How Plan 3b consumes this

Plan 3b (content-first wizard) reads `wizard_bucket` from the wizard-state response and renders the new content-first flow only for `treatment`, leaving `control` on today's wizard. That one branch is the entire behavioral effect of the holdout, and it lives in 3b because 3b owns both flows. Until 3b lands, every coach — both buckets — sees today's wizard, and this plan simply records which bucket they would have been in, so pre-launch bucket balance can be sanity-checked with the report command.

## Where this sits in Plan 3

| Sub-plan | Scope | Depends on |
|----------|-------|------------|
| 3a — Lazy provisioning foundation | schema step, on-demand endpoint, cleanup cron | Plan 1 |
| 3b — Content-first step machine | new flow selected by bucket; delete-old deferred to post-holdout cleanup | 3a, 3c, **3e** |
| 3c — Content-creation APIs | onboarding endpoints writing real rows; AI outlines | 3a |
| 3d — Reveal + compose fallback | compose from real content; template fallback | 3c |
| **3e — Wizard holdout** (this one) | bucketing primitive, assignment, exposure, report | Plan 1 (independent of the rest) |
