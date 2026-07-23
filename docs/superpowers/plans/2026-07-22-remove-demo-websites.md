# Remove Demo Websites & View-As; Comprehensive 3-Tenant Dev Seed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the demo-website + "view as coach/student" + read-only + `is_demo` subsystem, and replace it (local dev only) with a `seed_dev_tenants` command that seeds 3 tenants (free/starter/pro) richly enough to test every product feature.

**Architecture:** Remove the demo subsystem in dependency-safe order (schema field + middleware + branches first, then dead endpoints/commands/frontend). Repurpose the content-generation helpers from the old `seed_demo_tenant.py` into a new `seed_dev_tenants` command that scales seed depth to plan tier and fills the feature-coverage gaps the old seeder never touched. Keep the start-from-template onboarding and superadmin impersonation untouched. Decommission the legacy prod demo tenants explicitly.

**Tech Stack:** Django 5.1 + DRF + django-tenants (schema-per-tenant), Postgres 17, pytest, two Next.js 14 apps, Playwright e2e, Make targets.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-22-remove-demo-websites-design.md` — authoritative.
- **KEEP untouched:** start-from-template onboarding (`apps/core/demo/seed_template.py`, `apps/demo_seed/registry.py`, `apps/demo_seed/data/*.json`, SeededObject erase flow), superadmin impersonation (`apps/accounts/impersonation.py`, `impersonate/*`).
- **KEEP the dev media supply chain:** `scripts/mirror_demo_assets.py`, the `seed-demo-assets` Makefile target, and the mirror invocations inside `make dev` / `make dev-reset` all STAY. The niche JSONs reference `demo/photos/*` / `demo/videos/*` object keys that exist in dev MinIO only because the mirror copies them from the prod bucket. The prod bucket's `demo/*` objects are the read-only source — **never delete them**, even after Stage H decommissions the prod demo tenants.
- `apps/demo_seed` app stays registered — it is now the shared niche-content library + seeding helpers.
- Tenant slugs retained with `demo-` prefix: `demo-fitness` (free), `demo-pilates` (starter), `demo-yoga` (pro). Do **not** repoint the 9 `demo-yoga` e2e specs' data model.
- **Publish gate + niche:** the old demo tenants passed the customer-app publish gate via `is_demo` and derived `niche` from their slug. Both crutches are removed, so `seed_dev_tenants` MUST create tenants with `is_published=True` and `template_niche=<niche>` (e2e spec `13-events-page` browses `demo-yoga` anonymously; the builder reads `niche` for block defaults).
- Login is passwordless. Owner rows mirror real provisioning (`apps/core/tasks.py:344`): `role="owner"`, `is_staff=True`, `region` set, `set_unusable_password()`. Students are `role="student"`.
- Seed favors **breadth over bulk** — a handful of each entity, every screen has data. No 400-photo / 100-event marketing volumes.
- **WIP collision:** the working tree has uncommitted changes to `backend/apps/adminkit/*` and `backend/apps/core/admin_panels.py`. Land or stash that work before starting Task A1, then re-verify the line refs in this plan.
- Never commit unless the operator explicitly asks (project rule overrides the plan's commit steps — treat "Commit" steps as "stage a reviewable checkpoint"; only run `git commit` when the operator has said to).
- Pre-commit / `make lint` must pass with zero errors/warnings. Run `make test` (backend) and `make test-frontend` for touched areas; `make e2e` before final done.
- After serializer edits run `npm run gen:api` in `frontend-customer` and review the `src/types/api-generated.ts` diff.

---

## Stage A — Remove `is_demo` and the read-only middleware (backend schema + branches)

Do this first: it is the foundational schema change everything else assumes. After this stage the app runs with no `is_demo` anywhere, demo tenants simply behaving as normal tenants (the demo seeders still exist but are deleted in Stage B).

### Task A1: Remove the `Tenant.is_demo` field + migration + queryset consumers

**Files:**
- Modify: `backend/apps/core/models.py` (remove `is_demo` field, lines 54-58)
- Create: `backend/apps/core/migrations/00NN_remove_tenant_is_demo.py`
- Modify: `backend/apps/core/admin_panels.py` (remove `is_demo` from list_filter/fields, lines 114, 128)
- Modify: `backend/apps/core/onboarding/recovery.py:92` (remove the `is_demo=False` queryset filter — **this is the wizard-recovery beat job; leaving it raises `FieldError` at runtime and breaks onboarding recovery emails**)
- Modify: `backend/apps/core/tests/test_wizard_recovery.py:109` (remove the `{"is_demo": True}` factory override so core tests stay green from this stage on)
- Modify: `backend/apps/core/demo/seed_template.py:4` (docstring contrasts against the old demo seeder — reword so it no longer mentions `is_demo=True`; the file is otherwise KEPT)

**Interfaces:**
- Produces: `Tenant` model with no `is_demo` attribute. Every later task assumes `tenant.is_demo` no longer exists.

- [ ] **Step 1: Read the field and its references.** Read `backend/apps/core/models.py:40-90`, `backend/apps/core/admin_panels.py:100-140`, and `backend/apps/core/onboarding/recovery.py:80-100` to confirm exact lines.

- [ ] **Step 2: Remove the field.** Delete the `is_demo = models.BooleanField(...)` declaration from `Tenant` in `models.py`.

- [ ] **Step 3: Remove admin references.** In `admin_panels.py`, remove `is_demo` from the tenant admin `list_filter` and field lists (leave `provisioning_status`, `plan`, etc.).

- [ ] **Step 4: Fix the wizard-recovery queryset.** In `recovery.py`, delete the `is_demo=False,` line from the `Tenant.objects.filter(...)` call. The remaining filters (`provisioning_status="pending"`, `template_seed_status="pending"`, …) are unchanged.

- [ ] **Step 5: Fix the recovery test + seed_template docstring.** In `test_wizard_recovery.py:109` remove the `{"is_demo": True}` override (and any assertion that demo tenants are excluded from recovery — that exclusion no longer exists). In `seed_template.py:4` reword the docstring line so it describes the template seeder without referencing the deleted marketing-demo seeder.

- [ ] **Step 6: Generate the migration.**

Run: `make makemigrations`
Expected: a new `apps/core/migrations/00NN_remove_tenant_is_demo.py` containing `migrations.RemoveField(model_name="tenant", name="is_demo")`.

- [ ] **Step 7: Apply migrations.**

Run: `make migrate`
Expected: applies cleanly (drops the column). No `FieldDoesNotExist` / `ProgrammingError`.

- [ ] **Step 8: Grep sweep for remaining model-level consumers.**

Run: `grep -rn "is_demo" backend/apps backend/config`
Expected: only the sites edited in later tasks remain — `contact/views.py`, `preview/views.py`, `tenant_config/serializers.py`, `seed_wizard_mockup_tenant.py` (Task A3), plus `seed_demo_tenant.py` / `seed_all_demos.py` / `backfill_demo_calendar.py` (deleted in Stage B) and the `base.py` comment removed in A2. **Anything else is a missed consumer — fix it in this task, don't defer.**

- [ ] **Step 9: Checkpoint.** Stage `models.py`, the migration, `admin_panels.py`, `recovery.py`, `test_wizard_recovery.py`, `seed_template.py`.

### Task A2: Remove `DemoReadOnlyMiddleware` and DEMO_READONLY flags

**Files:**
- Delete: `backend/apps/core/middleware/demo_readonly.py`
- Modify: `backend/config/settings/base.py` (remove middleware entry ~line 75, `DEMO_READONLY_ENABLED` + its comment ~lines 381-384)
- Modify: `backend/config/settings/dev.py` (remove `DEMO_READONLY_ENABLED` ~lines 13-15)

**Interfaces:**
- Produces: no read-only enforcement middleware; all tenants are writable.

- [ ] **Step 1: Remove the middleware from settings.** In `base.py` `MIDDLEWARE`, delete the `apps.core.middleware.demo_readonly.DemoReadOnlyMiddleware` line. Remove the `DEMO_READONLY_ENABLED` setting block. In `dev.py` remove its override.

- [ ] **Step 2: Delete the middleware file.** `rm backend/apps/core/middleware/demo_readonly.py`.

- [ ] **Step 3: Grep for stragglers.**

Run: `grep -rn "DemoReadOnly\|DEMO_READONLY\|demo_readonly" backend`
Expected: only `apps/tenant_config/serializers.py` (Task A3) and frontend references (Stage E). No backend middleware/settings references.

- [ ] **Step 4: Boot check.**

Run: `make health-check` (with stack up)
Expected: Django boots; no `ImportError` for the deleted middleware.

- [ ] **Step 5: Checkpoint.** Stage settings + deletion.

### Task A3: Remove `is_demo` branches from views/serializers; publish the mockup tenant

**Files:**
- Modify: `backend/apps/core/contact/views.py` (~lines 72-73 — remove demo no-op email branch)
- Modify: `backend/apps/core/preview/views.py:26` (remove the `or getattr(tenant, "is_demo", False)` disjunct — published check only)
- Modify: `backend/apps/tenant_config/serializers.py` (~lines 242-252 — drop `is_demo`, `demo_readonly`, `demo_niche`; keep `niche` WITHOUT the demo fallback)
- Modify: `backend/apps/core/management/commands/seed_wizard_mockup_tenant.py` (~lines 63-65 — replace `is_demo=True` with `is_published=True`)

**Interfaces:**
- Produces: tenant_config serializer output with no `is_demo`/`demo_readonly`/`demo_niche` keys (frontend + api-generated types updated in Stage E/F). Wizard mockup tenant still renders as published.

- [ ] **Step 1: contact/views.py.** Remove the `if tenant.is_demo: return (no-op)` branch so contact email sends normally for all tenants. Read the file first to preserve surrounding logic.

- [ ] **Step 2: preview/views.py.** Change line 26 to `if getattr(tenant, "is_published", False):` — preview unlock reflects real publish state only.

- [ ] **Step 3: serializers.py.** Remove the `data["is_demo"]`, `data["demo_readonly"]`, and `data["demo_niche"]` assignments. Change the niche line from `data["niche"] = getattr(tenant, "template_niche", "") or data["demo_niche"]` to `data["niche"] = getattr(tenant, "template_niche", "")`. Keep `tenant_name`, `tenant_slug`, `is_published`, `has_preview_password` as-is. (The dev tenants keep a working `niche` because Task C2 sets `template_niche` on them.)

- [ ] **Step 4: seed_wizard_mockup_tenant.py.** In the `Tenant.objects.create(...)` call replace `is_demo=True,` with `is_published=True,` and fix the stdout line. **Rationale: `Tenant.is_published` defaults `False` and the mockup tenant previously passed the customer-app publish gate (`layout.tsx`, `preview_unlock`) only via `is_demo` — without this, `make capture-wizard-mockups` screenshots the preview-gate page and the onboarding wizard's mockup assets break.**

- [ ] **Step 5: Grep confirms zero live `is_demo` in backend.**

Run: `grep -rn "is_demo\|demo_readonly\|demo_niche" backend`
Expected: matches only inside `seed_demo_tenant.py`, `seed_all_demos.py`, `backfill_demo_calendar.py` (all deleted in Stage B). Record any survivors and remove.

- [ ] **Step 6: Run core + tenant_config tests.**

Run: `make test-app APP=core && make test-app APP=tenant_config`
Expected: PASS (the recovery test was already fixed in A1; demo-seeder tests don't exist in these apps).

- [ ] **Step 7: Checkpoint.** Stage the four files.

---

## Stage B — Delete the demo-website + view-as endpoints, commands, scripts

### Task B1: Rewire `issue_login_token`, then delete the `demo_enter` "view as" endpoint

> **Critical ordering inside this task:** `backend/apps/accounts/management/commands/issue_login_token.py` imports `DEMO_COACH_EMAIL` / `DEMO_STUDENT_EMAIL` from `apps.core.demo.views`. Deleting the views first leaves the command crashing with `ImportError` — and **every e2e spec** (`e2e/helpers/auth.ts`) and the flowmap crawler (`tools/flowmap/crawler/auth.js`) mint their login cookies through this command. Rewire it FIRST.

**Files:**
- Modify: `backend/apps/accounts/management/commands/issue_login_token.py` (drop the `apps.core.demo.views` import; resolve users by role instead of synthetic email)
- Delete: `backend/apps/core/demo/views.py`
- Delete: `backend/apps/core/demo/urls.py`
- Modify: the core urlconf that `include`s `apps.core.demo.urls` under `/api/v1/demo/` (find it)

**Interfaces:**
- Produces: no `/api/v1/demo/enter/` route. `issue_login_token --role coach|student --tenant <slug>` resolves the tenant's real owner / any seeded student. e2e auth and flowmap crawler keep working unchanged.

- [ ] **Step 1: Rewire `issue_login_token`.** Remove the `from apps.core.demo.views import DEMO_COACH_EMAIL, DEMO_STUDENT_EMAIL` import and replace the email lookup with a role lookup:

```python
ROLE_FILTERS = {
    "coach": {"role": "owner", "is_staff": True},
    "student": {"role": "student"},
}
...
tenant = Tenant.objects.get(slug=slug)
with tenant_context(tenant):
    user = User.objects.filter(**ROLE_FILTERS[role]).order_by("id").first()
    if user is None:
        raise CommandError(f"No {role} user in tenant '{slug}'. Run `make seed`.")
    self.stdout.write(create_jwt(user, tenant))
```

Deterministic (`order_by("id").first()`) so e2e's token cache stays stable within a run. Keep the `DEBUG`-only guard and the superadmin branch untouched.

- [ ] **Step 2: Verify the rewired command against the still-seeded old demo tenant.**

Run (stack up + seeded): `docker compose exec -T django python manage.py issue_login_token --role coach --tenant demo-yoga` and `--role student`.
Expected: a JWT on stdout for both (old seed's owner has `role="owner", is_staff=True`; students have `role="student"` — same shapes the new seeder produces).

- [ ] **Step 3: Find the URL include.**

Run: `grep -rn "core.demo.urls\|core\.demo\|api/v1/demo\|demo/" backend/config backend/apps/core/urls.py backend/apps/core`
Identify the `path("demo/", include("apps.core.demo.urls"))` (or similar) line and remove it.

- [ ] **Step 4: Confirm no other importer of the demo views constants.**

Run: `grep -rn "DEMO_COACH_EMAIL\|DEMO_STUDENT_EMAIL\|ROLE_REDIRECTS\|demo_enter\|core.demo.views\|core\.demo import" backend`
Expected: only `seed_demo_tenant.py` (deleted in C4). `issue_login_token.py` no longer matches after Step 1. If anything else, resolve it in this task.

- [ ] **Step 5: Delete the files.** `rm backend/apps/core/demo/views.py backend/apps/core/demo/urls.py`. Keep `apps/core/demo/__init__.py` and `seed_template.py` (KEPT).

- [ ] **Step 6: Boot check + accounts tests.**

Run: `make test-app APP=core && make test-app APP=accounts`
Expected: URL conf imports without error; accounts tests pass.

- [ ] **Step 7: Checkpoint.**

### Task B2: Delete demo seeding commands (keep the asset mirror)

**Files:**
- Delete: `backend/apps/demo_seed/management/commands/seed_all_demos.py`
- Delete: `backend/apps/demo_seed/management/commands/backfill_demo_calendar.py`
- Keep: `backend/apps/demo_seed/management/commands/seed_demo_tenant.py` **until Task C1 extracts its helpers** (deleted in C4)
- Keep: `backend/scripts/mirror_demo_assets.py` — **NOT deleted** (dev media supply chain; see Global Constraints)
- Keep: `backend/apps/demo_seed/registry.py`, `backend/apps/demo_seed/data/*.json`, `backend/apps/demo_seed/calendar_content.py` (reused by Stage C)

- [ ] **Step 1: Delete the two dead commands.** `rm backend/apps/demo_seed/management/commands/seed_all_demos.py backend/apps/demo_seed/management/commands/backfill_demo_calendar.py`.

- [ ] **Step 2: Grep for references to the deleted commands.**

Run: `grep -rn "seed_all_demos\|backfill_demo_calendar" backend Makefile e2e scripts tools`
Expected: matches in `seed_plans.py` (Stage F1), `Makefile` (Stage F2), `e2e/global-setup.ts` (Stage F3). Note them; those stages handle them.

- [ ] **Step 3: Checkpoint.**

---

## Stage C — New `seed_dev_tenants` command (repurpose the seeder)

Reuse the proven content generation; strip `is_demo`, the synthetic view-as users, and marketing-scale volume; parametrize by plan/niche/depth.

### Task C1: Extract reusable seed helpers into a module

**Files:**
- Create: `backend/apps/demo_seed/seeding_helpers.py` (moved content-generation functions from `seed_demo_tenant.py`, minus demo-only pieces)
- Reference: `backend/apps/demo_seed/management/commands/seed_demo_tenant.py` (source), `backend/apps/demo_seed/calendar_content.py` (already reusable)

**Interfaces:**
- Produces: importable functions — `seed_photos(tenant, niche)`, `seed_config(tenant, niche)`, `seed_courses(tenant, niche, *, count)`, `seed_downloads`, `seed_subscription_plans`, `seed_bundles`, `seed_live_bundle(tenant, niche, *, include_live: bool)`, `seed_students(tenant, niche, *, count)`, `seed_purchases_and_progress(...)`. Exact signatures finalized when reading the source; keep names stable — Task C2/C3/D consume them.

- [ ] **Step 1: Read the full source.** Read `backend/apps/demo_seed/management/commands/seed_demo_tenant.py` (all ~1017 lines) and note each `_seed_*` method's inputs/outputs and the niche-module attributes it reads (`load_niche`, `STUDENTS`, `DOWNLOADS`, `SUBSCRIPTION_PLANS`, `BUNDLES`, `CONFIG`, etc.).

- [ ] **Step 2: Create `seeding_helpers.py`** with the content-generation functions as module-level functions (not Command methods). Drop: `_seed_demo_synthetic_users`, the `is_demo=True` assignment, the demo-student billing helper, and the 2-year / 400-photo / 100-event volume constants. Parametrize volume via `count`/`include_live` args (defaults: photos ~20, courses ~8, live events ~6 each type). Keep the niche-driven content wiring intact — including the `demo/photos/*` / `demo/videos/*` s3 keys from the niche JSONs (those objects live in dev MinIO via the kept `mirror_demo_assets.py`).

- [ ] **Step 3: Add a smoke import test.**

```python
# backend/apps/demo_seed/tests/test_seeding_helpers.py
def test_helpers_import():
    from apps.demo_seed import seeding_helpers
    for fn in ("seed_photos", "seed_config", "seed_courses", "seed_students"):
        assert hasattr(seeding_helpers, fn)
```

- [ ] **Step 4: Run it.**

Run: `make test-app APP=demo_seed`
Expected: PASS.

- [ ] **Step 5: Checkpoint.**

### Task C2: `seed_dev_tenants` command — 3 tenants, plan-scaled, TDD

**Files:**
- Create: `backend/apps/core/management/commands/seed_dev_tenants.py`
- Create/extend: `backend/apps/core/tests/test_seed_dev_tenants.py`

**Interfaces:**
- Consumes: `apps.demo_seed.seeding_helpers.*`, `apps.demo_seed.registry.load_niche`, `apps.demo_seed.calendar_content.seed_blog_posts/seed_email_campaigns`.
- Produces: `python manage.py seed_dev_tenants` creating tenants `demo-fitness`(free), `demo-pilates`(starter), `demo-yoga`(pro), each with a real owner, `is_published=True`, and `template_niche` set. Depth map: `{"free": no live, ≤10 students, small; "starter": live on, mid; "pro": full}`.

- [ ] **Step 1: Write the failing test.** Note: `Tenant.slug` uses dashes (`demo-yoga`) while `schema_name` uses underscores (`demo_yoga`) — look up by `slug`. `Tenant.plan` is an FK to `PlatformPlan` — compare `plan.name`.

```python
# backend/apps/core/tests/test_seed_dev_tenants.py
import pytest
from django.core.management import call_command
from django_tenants.utils import tenant_context
from apps.core.models import Tenant

DEV_TENANTS = {
    "demo-fitness": ("free", "fitness"),
    "demo-pilates": ("starter", "pilates"),
    "demo-yoga": ("pro", "yoga"),
}

@pytest.mark.django_db
def test_seed_dev_tenants_creates_three_published_tenants_on_correct_plans():
    call_command("seed_dev_tenants")
    for slug, (plan_name, niche) in DEV_TENANTS.items():
        t = Tenant.objects.get(slug=slug)
        assert t.plan.name == plan_name
        assert t.is_published is True          # publish gate: no is_demo crutch anymore
        assert t.template_niche == niche       # serializer "niche" derives from this now
        assert not hasattr(t, "is_demo")       # field is gone

@pytest.mark.django_db
def test_free_tenant_has_no_live_classes():
    call_command("seed_dev_tenants")
    from apps.live.models import LiveClass
    t = Tenant.objects.get(slug="demo-fitness")
    with tenant_context(t):
        assert LiveClass.objects.count() == 0

@pytest.mark.django_db
def test_each_tenant_has_owner_and_student_logins():
    call_command("seed_dev_tenants")
    from apps.accounts.models import User
    for slug in DEV_TENANTS:
        t = Tenant.objects.get(slug=slug)
        with tenant_context(t):
            # issue_login_token resolves these two filters — keep them seedable.
            assert User.objects.filter(role="owner", is_staff=True).exists()
            assert User.objects.filter(role="student").exists()
```

- [ ] **Step 2: Run to verify failure.**

Run: `make test-app APP=core` (or targeted `pytest ... test_seed_dev_tenants.py -v` inside the django container)
Expected: FAIL — unknown command `seed_dev_tenants`.

- [ ] **Step 3: Implement the command.** Create tenant + primary domain (mirror `seed_demo_tenant.py` tenant/domain creation), with `plan=PlatformPlan.objects.get(name=<plan>)`, `is_published=True`, `template_niche=<niche>`, `provisioning_status="ready"` — no `is_demo` (gone). Then `create_schema`, and inside `tenant_context`: create the real owner (`role="owner", is_staff=True, region=<default>, set_unusable_password()`), and call the `seeding_helpers.*` with a per-plan `DEPTH` config:

```python
DEV_TENANTS = [
    ("demo-fitness", "free",    "fitness", dict(include_live=False, students=8,  courses=5)),
    ("demo-pilates", "starter", "pilates", dict(include_live=True,  students=40, courses=8)),
    ("demo-yoga",    "pro",     "yoga",    dict(include_live=True,  students=80, courses=10)),
]
```

Support `--force` (delete + reseed) mirroring the old `seed_all_demos --force` semantics, and idempotency (skip if slug exists and not `--force`).

- [ ] **Step 4: Run tests to green.**

Run: `make test-app APP=core`
Expected: the three tests PASS.

- [ ] **Step 5: Manual smoke.**

Run (stack up): in django container `python manage.py seed_dev_tenants --force`
Expected: 3 tenants created; no errors; `demo-fitness` has no live classes. Anonymous browse of `http://demo-yoga.localhost/events` renders (no preview gate) and images load (mirror assets present).

- [ ] **Step 6: Checkpoint.**

### Task C3: DEBUG-gate the magic-link instant login (security fix, not a repoint)

**Files:**
- Modify: `backend/apps/accounts/views.py:49-53` (the `magic_link_request` demo-slug branch)
- Modify: `backend/apps/accounts/tests/test_views.py:93-123` (`test_demo_tenant_returns_demo_redirect`)
- Keep: `frontend-customer/src/components/auth/magic-link-form.tsx:36-37` — the `demo_redirect` handling STAYS (it's how the dev instant login lands in the browser).

> **Premise correction (vs the design's "DEBUG-only" wording):** today this branch is **not** DEBUG-gated — in prod, any `demo-`-slugged tenant returns a login token for *whatever email is posted*, tolerable only because demo tenants were read-only. The middleware is gone after A2, so gating this on `settings.DEBUG` is a **security requirement**. Nothing needs "repointing": the branch is email-agnostic — in dev you post the owner's (or any) email and get an instant login link.

**Interfaces:**
- Produces: instant login on `demo-*` tenants only when `settings.DEBUG` is true; normal magic-link email flow everywhere else.

- [ ] **Step 1: Add the gate.** Change the condition to:

```python
if settings.DEBUG and tenant.slug.startswith("demo-"):
```

Update the inline comment: "Dev tenants (DEBUG only): bypass email, return token directly for instant login."

- [ ] **Step 2: Update the tests.** Rework `test_demo_tenant_returns_demo_redirect` into two cases:

```python
def test_demo_tenant_returns_demo_redirect_in_debug(self, _mock_throttle, django_db_blocker, settings):
    settings.DEBUG = True
    # ...existing body: POST magic-link on a demo-slugged tenant...
    assert "demo_redirect" in data
    assert "callback?token=" in data["demo_redirect"]

def test_demo_tenant_uses_email_flow_when_not_debug(self, _mock_throttle, django_db_blocker, settings):
    settings.DEBUG = False
    # same POST; response must NOT contain demo_redirect (normal email path)
    assert "demo_redirect" not in data
```

- [ ] **Step 3: Run.** `make test-app APP=accounts` → PASS.

- [ ] **Step 4: Checkpoint.**

### Task C4: Delete `seed_demo_tenant.py`

- [ ] **Step 1: Confirm no importers remain.**

Run: `grep -rn "seed_demo_tenant\|SeedDemoTenant\|from apps.demo_seed.management" backend Makefile e2e tools`
Expected: only `seed_plans.py` (Stage F1) and possibly doc comments. No Python importers.

- [ ] **Step 2: Delete.** `rm backend/apps/demo_seed/management/commands/seed_demo_tenant.py`. Remove the stale `management/commands/demo_data/` `.pyc` cache dir if present.

- [ ] **Step 3: Run demo_seed + core tests.** `make test-app APP=demo_seed && make test-app APP=core` → PASS.

- [ ] **Step 4: Checkpoint.**

---

## Stage D — Fill feature-coverage gaps in the seed

Add breadth so every feature screen has data. On **pro** (`demo-yoga`) seed all of the below; on **starter** seed a lighter subset (mailbox + community + a couple announcements); on **free** skip live-dependent and heavy features. Each task is one feature area with its own verification.

For every task: add a `seed_<area>(tenant, ...)` helper (in `seeding_helpers.py` or a new `seeding_extras.py`), call it from `seed_dev_tenants` under the depth gate, and add a test asserting rows exist on `demo-yoga`.

### Task D1: Mailbox
- [ ] Add `seed_mailbox(tenant, students)` → a few `Conversation` + `Message` (+ 1 `MessageAttachment`). Call for starter+pro.
- [ ] Test: `demo-yoga` has ≥2 `Conversation` rows. Run `make test-app APP=mailbox`/`core`. Checkpoint.

### Task D2: Community
- [ ] Add `seed_community(tenant, members)` → `CommunitySettings(enabled=True)`, a few `CommunityMember`, `Post`, `Comment`, `Reaction`, one `Report`. Call for starter+pro.
- [ ] Test: `demo-yoga` community enabled with ≥3 posts. Checkpoint.

### Task D3: Notifications / announcements
- [ ] Add `seed_notifications(tenant, students)` → `Announcement`, `RecurringAnnouncement`, `AnnouncementRecipient` (with read/unread), `AnnouncementTemplate`, one `EmailOptOut`, one `PushSubscription`. Call for pro (light for starter).
- [ ] Test: `demo-yoga` has ≥1 `Announcement` + ≥1 `AnnouncementTemplate`. Checkpoint.

### Task D4: Usage analytics
- [ ] Add `seed_usage(tenant)` → spread of `UsageEvent` rows over recent dates so dashboards render. Call for all three.
- [ ] Test: `demo-yoga` has `UsageEvent` rows across ≥5 distinct days. Checkpoint.

### Task D5: Filters + tags
- [ ] Add `seed_filters(tenant, courses)` → `FilterGroup`/`FilterOption` and assign `Course.filter_options`. Add `seed_tags(tenant, ...)` → `Tag` + assign to courses/videos/photos/downloads. Call for all three.
- [ ] Test: `demo-yoga` has ≥1 `FilterGroup` with options assigned to ≥1 course, and ≥1 `Tag` assigned. Checkpoint.

### Task D6: Site assistant
- [ ] Add `seed_assistant(tenant)` → `AssistantConfig` (enabled), a few `AssistantKnowledgeEntry`, `AssistantLink`. Call for starter+pro.
- [ ] Test: `demo-yoga` has an enabled `AssistantConfig` + ≥2 knowledge entries. Checkpoint.

### Task D7: Blog autopilot + topic ideas
- [ ] Add `seed_blog_extras(tenant)` → `BlogTopicIdea` queue + `BlogAutopilot` schedule (the 8 `BlogPost`s already come from `calendar_content.seed_blog_posts`). Call for pro.
- [ ] Test: `demo-yoga` has ≥3 `BlogTopicIdea` + a `BlogAutopilot`. Checkpoint.

### Task D8: Edge billing states
- [ ] In the purchases helper, add one refunded `Payment` and one `past_due` (or `cancel_at_period_end`) `Subscription` on pro.
- [ ] Test: `demo-yoga` has ≥1 refunded payment and ≥1 non-active subscription. Run `make test-app APP=billing`/`core`. Checkpoint.

---

## Stage E — Frontend removals

### Task E1: frontend-main — remove `/demo` gallery + CTA
**Files:**
- Delete: `frontend-main/src/app/demo/page.tsx`, `frontend-main/src/lib/demos.ts`
- Modify: `frontend-main/src/components/landing/hero-section.tsx:68` (remove the `<Link href="/demo">` CTA), `frontend-main/src/components/shared/help-bubble.tsx:137` (remove `demo` from the `LINK_RE` whitelist regex)

- [ ] **Step 1: Delete the two files.**
- [ ] **Step 2: Remove the hero CTA** and adjust surrounding layout so the hero still renders (read the component; remove only the demo CTA button/link).
- [ ] **Step 3: Remove `demo` from the help-bubble `LINK_RE` alternation** (`signup|pricing|demo|login` → `signup|pricing|login`).
- [ ] **Step 4: Grep.** `grep -rn "/demo\b\|lib/demos\|DEMO_NICHES\|demoEntryUrl" frontend-main/src` → no matches.
- [ ] **Step 5: Build.** `cd frontend-main && npm run build` (or `make typecheck`) → passes.
- [ ] **Step 6: Checkpoint.**

### Task E2: frontend-customer — remove demo banner + proxy + is_demo handling
**Files:**
- Delete: `frontend-customer/src/components/shared/demo-banner.tsx`, `frontend-customer/src/app/api/demo/enter/route.ts`
- Modify: `frontend-customer/src/app/layout.tsx` (remove `<DemoBanner/>` import+render ~lines 9,179; simplify line 35 to `const published = config.is_published ?? true;`)
- Modify: `frontend-customer/src/lib/api-client.ts` (remove the whole `demo_readonly` block: `DemoReadonlyPayload`, `isDemoReadonly`, `showDemoReadonlyToast` incl. its `demo-*.` BASE_DOMAIN stripping, and the 403 branch that calls them)
- Modify: `frontend-customer/src/components/owner/edit-sidebar.tsx:449` (change `(!config.is_published || config.is_demo)` to `!config.is_published`)
- Modify: `frontend-customer/src/types/tenant.ts` (~lines 186-193 — drop `is_demo`, `demo_readonly`, `demo_niche`; keep `niche`)
- **Keep:** `frontend-customer/src/components/auth/magic-link-form.tsx` `demo_redirect` handling (dev instant login, see Task C3) and everything under `components/setup/*` / `DemoBadge` (kept template-onboarding UI).

- [ ] **Step 1: Delete the two files.**
- [ ] **Step 2: layout.tsx** — remove the import and JSX for `<DemoBanner/>`; simplify the `published` expression to drop the `is_demo` disjunct (published = real publish state only).
- [ ] **Step 3: api-client.ts** — remove the demo_readonly types/helpers/toast and the 403 branch. Keep normal error handling.
- [ ] **Step 4: edit-sidebar.tsx** — drop the `|| config.is_demo` disjunct at line 449.
- [ ] **Step 5: types/tenant.ts** — drop the three demo keys.
- [ ] **Step 6: Grep.** `grep -rn "is_demo\|demo_readonly\|demo_niche\|DemoBanner\|api/demo/enter" frontend-customer/src` → no matches (note: `api-generated.ts` still matches until Task F4 regenerates it; `DemoBadge`/`demo_redirect` are intentionally kept and don't match these patterns).
- [ ] **Step 7: Build/typecheck.** `make typecheck` → passes for customer app.
- [ ] **Step 8: Checkpoint.**

---

## Stage F — Wiring: seed_plans, Makefile, e2e, api regen

### Task F1: Decouple `seed_plans` from demo seeding
**Files:**
- Modify: `backend/apps/core/management/commands/seed_plans.py` (~lines 205-218 — remove the demo auto-seed block; also drop the now-unused `registry` import if only used there)

- [ ] **Step 1: Remove the block** that loops niches and calls `seed_demo_tenant`. `seed_plans` now seeds only plans + public tenant + superusers.
- [ ] **Step 2: Grep.** `grep -rn "seed_demo_tenant\|seed_all_demos" backend/apps/core/management/commands/seed_plans.py` → none.
- [ ] **Step 3: Test.** `make test-app APP=core` and run `python manage.py seed_plans` in-container → creates plans, no tenant seeding, no error.
- [ ] **Step 4: Checkpoint.**

### Task F2: Makefile targets (surgical — the asset mirror stays)
**Files:**
- Modify: `Makefile`

**Keep untouched:** the `python3 scripts/mirror_demo_assets.py` lines inside `dev:` (line 38) and `dev-reset:` (line 59), the `seed-demo-assets:` target (line 82), and `capture-wizard-mockups: seed-demo-assets` (line 88) — all part of the kept dev media supply chain.

- [ ] **Step 1: Update `seed:`** (lines 78-80) to run `seed_plans` → `seed_dev_tenants --force` → `seed_curated_logos`, and update its `##` help text ("Seed plans, public tenant, superusers, 3 dev tenants, and the curated logo catalog").
- [ ] **Step 2: Delete only `seed-demos:` and `seed-demos-force:`** (lines 85-86, 91-92). Remove both names from `.PHONY` (line 1) and from the help filter grep (line 17). Leave `seed-demo-assets` in both.
- [ ] **Step 3: Grep.** `grep -n "seed_all_demos\|seed-demos" Makefile` → no matches. `grep -n "mirror_demo_assets\|seed-demo-assets" Makefile` → still 4 matches (dev, dev-reset, seed-demo-assets target, capture-wizard-mockups prereq).
- [ ] **Step 4: Run.** `make seed` (stack up) → seeds plans + 3 dev tenants + logos, no error. `make -n capture-wizard-mockups` → resolves (no missing-target error).
- [ ] **Step 5: Checkpoint.**

### Task F3: e2e global-setup + impact map + spec verification
**Files:**
- Modify: `e2e/global-setup.ts` (~lines 19-33 — call plain `seed_dev_tenants` instead of `seed_all_demos`; no `--force`, matching the old idempotent skip-if-seeded behavior; keep the `seed_plans` call and the `demo-yoga.localhost` readiness probe)
- Modify: `e2e/impact-map.json` (the `"demo_seed": "none"` mapping is now wrong — `seeding_helpers.py` feeds every spec's fixture data)
- No changes needed: `e2e/helpers/auth.ts` (works as-is once Task B1 rewires `issue_login_token`).

- [ ] **Step 1: Update global-setup** to `docker compose exec -T django python manage.py seed_dev_tenants` (same exec mechanism as the old `seed_all_demos` call; keep `seed_plans` before it and the `X-Tenant-Domain: demo-yoga.localhost` probe unchanged).
- [ ] **Step 2: Fix the impact map.** `demo_seed` is no longer inert: change `"demo_seed": "none"` so seeder changes re-run the data-dependent suite. Check `scripts/select_tests.py` semantics first — if removing the key makes the selector fail-closed (run everything), prefer that; otherwise map it to the full list of data-dependent specs. Verify with the selector self-test in `make lint`.
- [ ] **Step 3: Grep specs.** `grep -rln "demo-yoga\|demo_yoga" e2e/specs` → confirms the 9 specs (`02-courses,03-calendar,07-mailbox,15-community,16-site-assistant,20-stripe-platform,21-stripe-marketplace,22-assistant-takeover,24-admin-logs`; unchanged slug, no repointing). `grep -rn "demo-banner\|demo/enter" e2e` → expect no matches (no spec asserts the banner). **Caution:** do NOT grep-replace on `View as` — `13-events-page.spec.ts:45` asserts the legitimate "View as calendar" link; leave it alone.
- [ ] **Step 4: Run affected specs.** For each of the 9 specs above plus `13-events-page` (anonymous browse — exercises the new `is_published=True` path): `make e2e-spec SPEC=<name>`. Fix any spec that broke because the trimmed seed changed specific counts it asserted on (adjust the seed depth or the assertion — prefer keeping the seed rich enough).
- [ ] **Step 5: Checkpoint.**

### Task F4: Regenerate the API types
- [ ] **Step 1:** `cd frontend-customer && npm run gen:api`.
- [ ] **Step 2: Review the diff** of `src/types/api-generated.ts` — expect `is_demo`, `demo_readonly`, `demo_niche` removed from the tenant_config schema and nothing unexpected.
- [ ] **Step 3: typecheck.** `make typecheck` → passes.
- [ ] **Step 4: Checkpoint.**

---

## Stage G — Test cleanup, docs, full verification

### Task G1: Verify the demo-referencing backend tests (corrected inventory)

The original inventory overstated this. Fresh grep shows:
- `backend/apps/core/tests/test_wizard_recovery.py` — already fixed in Task A1.
- `backend/apps/accounts/tests/test_views.py` — already fixed in Task C3.
- `backend/apps/core/tests/test_demo_data.py` — tests the KEPT niche registry/data contract (`load_niche` attrs) → **retain unchanged**.
- `backend/apps/core/tests/test_demo_templates_navbar.py` — tests KEPT template navbar invariants → **retain unchanged**.
- `backend/apps/demo_seed/tests/test_calendar_content.py` — `calendar_content` is reused → **retain**; update its docstring's `seed_demo_tenant` mention to `seed_dev_tenants`.

- [ ] **Step 1: Sweep to confirm nothing was missed.** `grep -rln "is_demo\|seed_demo_tenant\|seed_all_demos\|demo_enter\|DEMO_COACH\|demo-coach@\|demo-student@\|demo_redirect" backend/apps/*/tests` → only the files above, in their expected (already-fixed / retained) state.
- [ ] **Step 2: Run the full backend suite.** `make test` → PASS.
- [ ] **Step 3: Checkpoint.**

### Task G2: Docs + final verification sweep

- [ ] **Step 1: Update CLAUDE.md** (edit-in-place; no new .md files):
  - Commands section: `make seed` now also seeds the 3 dev tenants.
  - `apps.demo_seed` description: "no models; shared niche-content library (registry + data JSONs + calendar_content) + seeding helpers for `seed_dev_tenants`".
  - Any mention of demo websites / `seed-demos` targets removed.

- [ ] **Step 2: Zero-stragglers grep across the repo.**

Run:
```bash
grep -rn "is_demo\|demo_readonly\|demo_niche\|demo_enter\|DemoReadOnly\|DemoBanner\|seed_all_demos\|seed_demo_tenant\|DEMO_COACH_EMAIL\|DEMO_STUDENT_EMAIL\|lib/demos" backend frontend-main/src frontend-customer/src e2e Makefile
```
Expected: no matches except intentional `demo-` tenant slugs, the KEPT template-onboarding/SeededObject "Demo content" wording, and `mirror_demo_assets` / `seed-demo-assets` (kept asset mirror).

- [ ] **Step 3: Fresh full-stack bring-up.** `make dev-reset` then `make dev`, then `make seed`.
Expected: healthy stack, mirror populates MinIO, 3 tenants seeded, `make health-check` OK.

- [ ] **Step 4: Manual smoke each tenant.** Log into `demo-yoga.localhost` (pro) and confirm mailbox, community, announcements, usage analytics, filters/tags, site-assistant, blog all have data and images render. `demo-fitness.localhost` (free) shows no live and small catalog. `demo-pilates.localhost` (starter) shows live + mid data. Anonymous visit to `demo-yoga.localhost` renders (published, no preview gate).

- [ ] **Step 5: Wizard mockup capture still works.** `make capture-wizard-mockups ARGS="--niche yoga"` → captures render the site, not the preview gate.

- [ ] **Step 6: Lint + typecheck + tests + e2e.** `make lint && make typecheck && make test && make test-frontend && make e2e` → all green.

- [ ] **Step 7: Checkpoint.** Summarize deletions vs additions and net LOC change.

---

## Stage H — Decommission the legacy prod demo tenants

Prod has a live marketing demo tenant per niche (7 at last count), seeded via the old `seed_plans` auto-block. After this release they'd linger: publicly routable at `demo-*.contentor.app`, no longer read-only, no longer instant-login (C3 gate), falling behind the preview gate (`is_published=False`) — dead weight with residual abuse surface (the magic-link API still auto-registers students regardless of the UI gate). Delete them explicitly.

### Task H1: `decommission_demo_tenants` command

**Files:**
- Create: `backend/apps/core/management/commands/decommission_demo_tenants.py`
- Create: `backend/apps/core/tests/test_decommission_demo_tenants.py`

**Interfaces:**
- Consumes: `apps.demo_seed.registry.list_niches` / `load_niche` (each niche's `TENANT["schema_name"]` identifies a legacy demo tenant).
- Produces: dry-run by default; `--yes` drops each matching tenant's schema, domains, and row.

- [ ] **Step 1: Write the failing test.**

```python
# backend/apps/core/tests/test_decommission_demo_tenants.py
import pytest
from django.core.management import call_command
from apps.core.models import Tenant

@pytest.mark.django_db
def test_decommission_is_dry_run_by_default(tenant_factory_or_equivalent):
    # create a tenant whose schema_name matches a registry niche, e.g. demo_yoga
    t = Tenant.objects.create(
        name="Demo Yoga", slug="demo-yoga", subdomain="demo-yoga",
        schema_name="demo_yoga", owner_email="demo@x.com",
    )
    call_command("decommission_demo_tenants")
    assert Tenant.objects.filter(pk=t.pk).exists()

@pytest.mark.django_db
def test_decommission_deletes_with_yes():
    t = Tenant.objects.create(
        name="Demo Yoga", slug="demo-yoga", subdomain="demo-yoga",
        schema_name="demo_yoga", owner_email="demo@x.com",
    )
    call_command("decommission_demo_tenants", "--yes")
    assert not Tenant.objects.filter(pk=t.pk).exists()
```

(Adapt tenant creation to the project's existing tenant test fixtures; if `delete(force_drop=True)` complains about a missing schema in tests, call `t.create_schema(check_if_exists=True)` in the fixture.)

- [ ] **Step 2: Run to verify failure.** `make test-app APP=core` → FAIL, unknown command.

- [ ] **Step 3: Implement.**

```python
"""One-off ops command: delete the legacy marketing demo tenants.

Prod runbook (after deploying this release):
    docker compose -f docker-compose.prod.yml exec django \
        python manage.py decommission_demo_tenants --yes

Dev note: the 3 dev tenants share these schema names — running this locally
deletes them too; reseed with `make seed`. The prod bucket's demo/* media
objects are NOT touched (they remain the mirror source for dev).
"""
from django.core.management.base import BaseCommand

from apps.core.models import Domain, Tenant
from apps.demo_seed.registry import list_niches, load_niche


class Command(BaseCommand):
    help = "Delete legacy marketing demo tenants (schema + domains + row). Dry-run without --yes."

    def add_arguments(self, parser):
        parser.add_argument("--yes", action="store_true", help="Actually delete.")

    def handle(self, *args, **options):
        targets = []
        for niche in sorted(list_niches()):
            schema = load_niche(niche).TENANT["schema_name"]
            tenant = Tenant.objects.filter(schema_name=schema).first()
            if tenant is not None:
                targets.append(tenant)
        if not targets:
            self.stdout.write("No demo tenants found — nothing to do.")
            return
        for t in targets:
            self.stdout.write(f"  {t.slug} ({t.schema_name})")
        if not options["yes"]:
            self.stdout.write(self.style.WARNING("Dry run — pass --yes to delete the above."))
            return
        for t in targets:
            Domain.objects.filter(tenant=t).delete()
            t.delete(force_drop=True)
            self.stdout.write(self.style.SUCCESS(f"Deleted {t.slug}"))
```

- [ ] **Step 4: Run tests to green.** `make test-app APP=core` → PASS.

- [ ] **Step 5: Record the prod runbook step.** The release notes / deploy checklist for this branch must include: after `make deploy`, run the command with `--yes` on prod, then spot-check `demo-yoga.contentor.app` returns the tenant-not-found path. Do NOT delete the prod bucket's `demo/*` objects.

- [ ] **Step 6: Checkpoint.**

---

## Self-Review notes

- **Spec coverage:** Deletions (Stage A/B/E) cover spec Part 1; kept items (Global Constraints) cover Part 2; new seeder (Stage C) covers Part 3; gap-filling (Stage D) covers Part 4; wiring (Stage F) covers Part 5; testing (Stage G) covers the Testing section; Stage H covers prod decommissioning.
- **Ordering hazards:** `seed_demo_tenant.py` is both source (C1) and deletion (C4) — C4 gates on C1. `issue_login_token` must be rewired (B1 Step 1) BEFORE `core/demo/views.py` is deleted (B1 Step 5) or every e2e login breaks on ImportError. `recovery.py` + `test_wizard_recovery.py` are fixed inside A1 so `make test-app APP=core` stays green at every checkpoint.
- **Publish gate:** three places relied on `is_demo` to render as published — customer `layout.tsx`, `preview_unlock`, and (implicitly) anonymous e2e/flowmap browsing of demo tenants. Replacements: `seed_dev_tenants` sets `is_published=True` (C2) and `seed_wizard_mockup_tenant` sets `is_published=True` (A3 Step 4).
- **Asset supply chain:** `mirror_demo_assets.py` + `seed-demo-assets` + the `make dev`/`dev-reset` hooks are KEPT — the niche JSONs' `demo/photos|videos/*` keys have no other source in dev MinIO. Prod bucket `demo/*` objects are kept as the mirror source even after Stage H.
- **Security:** C3's DEBUG gate on the magic-link bypass is required, not cosmetic — post-A2 there is no read-only middleware, and the bypass mints login tokens for arbitrary emails on `demo-*` tenants.
- **e2e risk:** trimming seed volume may break specs asserting specific counts — Task F3 Step 4 handles per-spec (prefer keeping seed rich over weakening assertions). `13-events-page` is in the verification set because it browses anonymously.
