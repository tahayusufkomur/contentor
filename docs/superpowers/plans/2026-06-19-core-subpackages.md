# Core Sub-Packages Reorg — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `apps.core`'s flat `views_*.py` / `urls_*.py` sprawl into one sub-package per feature concern, with zero behaviour, model, migration, or settings change.

**Architecture:** Pure code relocation inside the single `apps.core` Django app. Each feature endpoint cluster (views + urls + serializers) becomes a sub-package (`core/<feature>/`). Django-critical files (`models.py`, `admin_panels.py`, `admin.py`, `apps.py`, `signals.py`, `routers.py`, `middleware/`, `management/`, `migrations/`) and shared services stay at the app root. `config/urls.py` includes and core-internal imports are repointed. The existing pytest suite + `manage.py check` verify nothing broke.

**Tech Stack:** Django 5.1, django-tenants, DRF, pytest, Docker Compose.

## Global Constraints

- **No new apps, no model moves, no migrations, no settings changes.** One app: `apps.core`.
- **`admin_panels.py` stays at `core/` root** — adminkit discovers it via `autodiscover_modules("admin_panels")` (looks for `<app>.admin_panels` only).
- **`models.py` stays at root** — `core.Tenant`/`core.Domain` are django-tenants' `TENANT_MODEL`/`TENANT_DOMAIN_MODEL`.
- **Shared services stay at root:** `access.py`, `pagination.py`, `permissions.py`, `validators.py`, `constants.py`, `region_utils.py`, `currency.py`, `i18n_helpers.py`, `logging.py`, `email.py`, `storage.py`, `quotas.py`, `monetization.py`, `stripe_pricing.py`, `tasks.py`.
- **`core/views.py` keeps only `health_check`** (`config/urls.py` imports `from apps.core.views import health_check`).
- **No behaviour change** — same URLs, same view logic, same responses.
- **Never commit unless the user has authorized it** (repo CLAUDE.md). Each task ends with a *suggested* commit; get the user's go-ahead before running it.
- Use `git mv` for every relocation so history is preserved.

## Setup (once, before Task 1)

Bring the dev stack up so `manage.py check` and pytest can run in-container:

```bash
cd ~/ws/projects-in-progress/contentor
docker compose up -d
docker compose exec django python manage.py check    # baseline: should pass clean
docker compose exec django pytest -q                  # baseline: record current pass count
```

Record the baseline pass count — every task must keep it green.

## Per-task recipe (applies to Tasks 1–7)

Each task moves ONE feature cluster and leaves the app fully importable:

1. `mkdir core/<feature>` and create `core/<feature>/__init__.py` (empty).
2. `git mv` each source module into the package with its new name.
3. Fix imports **inside** the package (`urls.py` → `from .views import ...`; `views.py` → `from .serializers import ...`).
4. Repoint the cluster's `config/urls.py` include.
5. `grep -rn "<old_module_name>" backend/ --include='*.py'` and fix every remaining reference.
6. `docker compose exec django python manage.py check` → no errors (this imports the whole URLConf, so a missed import fails here).
7. Run the cluster's tests (or the full suite) → green.
8. Suggested commit (await user OK).

---

### Task 1: `core/platform/`

**Files:**
- Create: `backend/apps/core/platform/__init__.py`
- Move: `views_platform.py` → `platform/views.py`; `urls_platform.py` → `platform/urls.py`; `serializers_platform.py` → `platform/serializers.py`
- Modify: `backend/config/urls.py`; `backend/apps/core/admin_panels.py` (if it imports the platform modules)

- [ ] **Step 1: Create the package and move files**

```bash
cd ~/ws/projects-in-progress/contentor/backend/apps/core
mkdir -p platform && : > platform/__init__.py
git add platform/__init__.py
git mv views_platform.py platform/views.py
git mv urls_platform.py platform/urls.py
git mv serializers_platform.py platform/serializers.py
```

- [ ] **Step 2: Fix intra-package imports**

In `platform/urls.py`, repoint the views import to the sibling module, e.g. change `from apps.core.views_platform import X, Y` → `from apps.core.platform.views import X, Y` (or `from .views import X, Y`).
In `platform/views.py`, repoint any `from apps.core.serializers_platform import ...` → `from apps.core.platform.serializers import ...` (or `from .serializers import ...`).

- [ ] **Step 3: Repoint the config/urls.py include**

In `backend/config/urls.py` change:
```python
    path("api/v1/platform/", include("apps.core.urls_platform")),
```
to:
```python
    path("api/v1/platform/", include("apps.core.platform.urls")),
```

- [ ] **Step 4: Fix every remaining reference**

```bash
cd ~/ws/projects-in-progress/contentor/backend
grep -rn "views_platform\|urls_platform\|serializers_platform" . --include='*.py'
```
Update each hit (notably `apps/core/admin_panels.py` if it imports platform views/serializers) to the new `apps.core.platform.*` paths. Expected end state: no matches except inside `platform/` itself if a file references its own siblings via the full path.

- [ ] **Step 5: Verify imports + routes resolve**

```bash
docker compose exec django python manage.py check
```
Expected: `System check identified no issues`.

- [ ] **Step 6: Run platform tests**

```bash
docker compose exec django pytest apps/core/tests/test_platform_admin_endpoints.py apps/core/tests/test_platform_plan_admin.py -q
```
Expected: all pass (same as baseline).

- [ ] **Step 7: Suggested commit (await user OK)**

```bash
git add -A
git commit -m "refactor(core): move platform endpoints into core/platform/ subpackage"
```

---

### Task 2: `core/uploads/`

**Files:**
- Create: `backend/apps/core/uploads/__init__.py`
- Move: `views_upload.py` → `uploads/views.py`; `views_multipart.py` → `uploads/multipart.py`; `serializers_upload.py` → `uploads/serializers.py`; `urls_upload.py` → `uploads/urls.py`
- Modify: `backend/config/urls.py`

- [ ] **Step 1: Create the package and move files**

```bash
cd ~/ws/projects-in-progress/contentor/backend/apps/core
mkdir -p uploads && : > uploads/__init__.py
git add uploads/__init__.py
git mv views_upload.py uploads/views.py
git mv views_multipart.py uploads/multipart.py
git mv serializers_upload.py uploads/serializers.py
git mv urls_upload.py uploads/urls.py
```

(Keeping `views.py` + `multipart.py` as two modules per the spec default — they are 176 + 163 lines and cohesive on their own.)

- [ ] **Step 2: Fix intra-package imports**

In `uploads/urls.py`, repoint imports from `apps.core.views_upload` / `apps.core.views_multipart` → `apps.core.uploads.views` / `apps.core.uploads.multipart` (or `from .views import ...` / `from .multipart import ...`).
In `uploads/views.py` and `uploads/multipart.py`, repoint `apps.core.serializers_upload` → `apps.core.uploads.serializers`.

- [ ] **Step 3: Repoint the config/urls.py include**

In `backend/config/urls.py` change `include("apps.core.urls_upload")` → `include("apps.core.uploads.urls")`.

- [ ] **Step 4: Fix every remaining reference**

```bash
grep -rn "views_upload\|views_multipart\|serializers_upload\|urls_upload" backend --include='*.py'
```
Update each hit to the new `apps.core.uploads.*` paths.

- [ ] **Step 5: Verify**

```bash
docker compose exec django python manage.py check
```
Expected: no issues.

- [ ] **Step 6: Run upload-related tests**

```bash
docker compose exec django pytest apps/core/tests -k "upload or multipart" -q
```
Expected: pass (or "no tests ran" if none target uploads — then rely on `manage.py check`).

- [ ] **Step 7: Suggested commit (await user OK)**

```bash
git add -A
git commit -m "refactor(core): move upload endpoints into core/uploads/ subpackage"
```

---

### Task 3: `core/contact/`

**Files:**
- Create: `backend/apps/core/contact/__init__.py`
- Move: `views_contact.py` → `contact/views.py`; `urls_contact.py` → `contact/urls.py`
- Modify: `backend/config/urls.py`

- [ ] **Step 1: Create the package and move files**

```bash
cd ~/ws/projects-in-progress/contentor/backend/apps/core
mkdir -p contact && : > contact/__init__.py
git add contact/__init__.py
git mv views_contact.py contact/views.py
git mv urls_contact.py contact/urls.py
```

- [ ] **Step 2: Fix intra-package imports**

In `contact/urls.py`, repoint `apps.core.views_contact` → `apps.core.contact.views` (or `from .views import ...`). `contact/views.py` keeps importing shared helpers from root (e.g. `apps.core.email`) unchanged.

- [ ] **Step 3: Repoint the config/urls.py include**

`include("apps.core.urls_contact")` → `include("apps.core.contact.urls")`.

- [ ] **Step 4: Fix every remaining reference**

```bash
grep -rn "views_contact\|urls_contact" backend --include='*.py'
```
Fix each hit.

- [ ] **Step 5: Verify**

```bash
docker compose exec django python manage.py check
```
Expected: no issues.

- [ ] **Step 6: Run contact tests (if any)**

```bash
docker compose exec django pytest apps/core/tests -k contact -q
```
Expected: pass (or no tests → rely on check).

- [ ] **Step 7: Suggested commit (await user OK)**

```bash
git add -A
git commit -m "refactor(core): move contact endpoints into core/contact/ subpackage"
```

---

### Task 4: `core/demo/`

**Files:**
- Create: `backend/apps/core/demo/__init__.py`
- Move: `views_demo.py` → `demo/views.py`; `urls_demo.py` → `demo/urls.py`; `seed_template.py` → `demo/seed_template.py`
- Modify: `backend/config/urls.py`; `backend/apps/core/management/commands/*` that import `seed_template`

- [ ] **Step 1: Create the package and move files**

```bash
cd ~/ws/projects-in-progress/contentor/backend/apps/core
mkdir -p demo && : > demo/__init__.py
git add demo/__init__.py
git mv views_demo.py demo/views.py
git mv urls_demo.py demo/urls.py
git mv seed_template.py demo/seed_template.py
```

- [ ] **Step 2: Fix intra-package imports**

In `demo/urls.py`, repoint `apps.core.views_demo` → `apps.core.demo.views`. In `demo/views.py`, if it imports `apps.core.seed_template`, repoint → `apps.core.demo.seed_template`.

- [ ] **Step 3: Repoint the config/urls.py include**

`include("apps.core.urls_demo")` → `include("apps.core.demo.urls")`.

- [ ] **Step 4: Fix every remaining reference (incl. management commands)**

```bash
grep -rn "views_demo\|urls_demo\|seed_template" backend --include='*.py'
```
Update each hit — in particular `apps/core/management/commands/seed_all_demos.py` and `seed_demo_tenant.py` likely import `from apps.core.seed_template import ...` → change to `from apps.core.demo.seed_template import ...`.

- [ ] **Step 5: Verify**

```bash
docker compose exec django python manage.py check
```
Expected: no issues.

- [ ] **Step 6: Smoke the seed command import + demo tests**

```bash
docker compose exec django python manage.py seed_all_demos --help
docker compose exec django pytest apps/core/tests -k demo -q
```
Expected: help prints (no ImportError); demo tests pass (or none → rely on check).

- [ ] **Step 7: Suggested commit (await user OK)**

```bash
git add -A
git commit -m "refactor(core): move demo endpoints + seed_template into core/demo/ subpackage"
```

---

### Task 5: `core/me/`

**Files:**
- Create: `backend/apps/core/me/__init__.py`
- Move: `views_me.py` → `me/views.py`; `urls_me.py` → `me/urls.py`
- Modify: `backend/config/urls.py`

- [ ] **Step 1: Create the package and move files**

```bash
cd ~/ws/projects-in-progress/contentor/backend/apps/core
mkdir -p me && : > me/__init__.py
git add me/__init__.py
git mv views_me.py me/views.py
git mv urls_me.py me/urls.py
```

- [ ] **Step 2: Fix intra-package imports**

In `me/urls.py`, repoint `apps.core.views_me` → `apps.core.me.views`.

- [ ] **Step 3: Repoint the config/urls.py include**

`include("apps.core.urls_me")` → `include("apps.core.me.urls")`.

- [ ] **Step 4: Fix every remaining reference**

```bash
grep -rn "views_me\|urls_me" backend --include='*.py'
```
Fix each hit.

- [ ] **Step 5: Verify**

```bash
docker compose exec django python manage.py check
```
Expected: no issues.

- [ ] **Step 6: Run me tests (if any)**

```bash
docker compose exec django pytest apps/core/tests -k "me or profile" -q
```
Expected: pass (or none → rely on check).

- [ ] **Step 7: Suggested commit (await user OK)**

```bash
git add -A
git commit -m "refactor(core): move me endpoints into core/me/ subpackage"
```

---

### Task 6: `core/preview/`

**Files:**
- Create: `backend/apps/core/preview/__init__.py`
- Move: `views_preview.py` → `preview/views.py`; `urls_preview.py` → `preview/urls.py`
- Modify: `backend/config/urls.py`

- [ ] **Step 1: Create the package and move files**

```bash
cd ~/ws/projects-in-progress/contentor/backend/apps/core
mkdir -p preview && : > preview/__init__.py
git add preview/__init__.py
git mv views_preview.py preview/views.py
git mv urls_preview.py preview/urls.py
```

- [ ] **Step 2: Fix intra-package imports**

In `preview/urls.py`, repoint `apps.core.views_preview` → `apps.core.preview.views`.

- [ ] **Step 3: Repoint the config/urls.py include**

`include("apps.core.urls_preview")` → `include("apps.core.preview.urls")`.

- [ ] **Step 4: Fix every remaining reference**

```bash
grep -rn "views_preview\|urls_preview" backend --include='*.py'
```
Fix each hit.

- [ ] **Step 5: Verify**

```bash
docker compose exec django python manage.py check
```
Expected: no issues.

- [ ] **Step 6: Run preview tests (if any)**

```bash
docker compose exec django pytest apps/core/tests -k preview -q
```
Expected: pass (or none → rely on check).

- [ ] **Step 7: Suggested commit (await user OK)**

```bash
git add -A
git commit -m "refactor(core): move preview endpoints into core/preview/ subpackage"
```

---

### Task 7: `core/onboarding/` (extract from `views.py`)

This is the only task that splits a file: `core/views.py` holds the onboarding views plus `health_check`. Move the onboarding views out; `health_check` stays.

**Files:**
- Create: `backend/apps/core/onboarding/__init__.py`, `backend/apps/core/onboarding/views.py`
- Move: `urls_onboarding.py` → `onboarding/urls.py`
- Modify: `backend/apps/core/views.py` (remove the onboarding views, keep `health_check`); `backend/config/urls.py`

- [ ] **Step 1: Create the package and move the urls module**

```bash
cd ~/ws/projects-in-progress/contentor/backend/apps/core
mkdir -p onboarding && : > onboarding/__init__.py
git add onboarding/__init__.py
git mv urls_onboarding.py onboarding/urls.py
```

- [ ] **Step 2: Move the onboarding views out of `views.py`**

Open `apps/core/views.py`. Cut these functions (with their decorators) into the new `apps/core/onboarding/views.py`: `creator_signup`, `creator_signup_verify`, `_resolve_tenant_from_signup_token`, `seed_from_template`, `skip_template`, `provisioning_status`. Copy across every import at the top of `views.py` that those functions use (models, serializers, DRF decorators, etc.). Leave `health_check` (and only its imports) behind in `views.py`.

Verify nothing dangling:
```bash
grep -nE "^def |^class " apps/core/views.py        # expect only health_check
```

- [ ] **Step 3: Fix imports in onboarding/urls.py and onboarding/views.py**

In `onboarding/urls.py`, repoint the views import from `apps.core.views` → `apps.core.onboarding.views` (or `from .views import ...`). In `onboarding/views.py`, keep shared imports pointing at root (`apps.core.access`, `apps.core.models`, etc.).

- [ ] **Step 4: Repoint the config/urls.py include**

`include("apps.core.urls_onboarding")` → `include("apps.core.onboarding.urls")`. Leave `from apps.core.views import health_check` unchanged.

- [ ] **Step 5: Fix every remaining reference**

```bash
grep -rn "urls_onboarding" backend --include='*.py'
grep -rn "from apps.core.views import\|apps.core.views\." backend --include='*.py'
```
The second grep must show only `health_check` being imported from `apps.core.views`; any onboarding-view import from `apps.core.views` must be repointed to `apps.core.onboarding.views`.

- [ ] **Step 6: Verify**

```bash
docker compose exec django python manage.py check
```
Expected: no issues.

- [ ] **Step 7: Run onboarding + health tests**

```bash
docker compose exec django pytest apps/core/tests -k "onboarding or signup or provision or health" -q
```
Expected: pass (or none → rely on check). Also confirm health: `docker compose exec django curl -fsS http://localhost:8000/api/health/`.

- [ ] **Step 8: Suggested commit (await user OK)**

```bash
git add -A
git commit -m "refactor(core): extract onboarding views into core/onboarding/ subpackage"
```

---

### Task 8: Full-suite verification + lint

**Files:** none (verification only).

- [ ] **Step 1: Whole-suite green**

```bash
cd ~/ws/projects-in-progress/contentor
docker compose exec django pytest -q
```
Expected: same pass count as the Setup baseline (no fewer passing, no new failures/errors).

- [ ] **Step 2: No stale references remain**

```bash
grep -rn -E "apps\.core\.(views_|urls_|serializers_)" backend --include='*.py' || echo "no flat module refs — clean"
grep -rn -E "apps\.core\.seed_template" backend --include='*.py' || echo "seed_template fully relocated"
```
Expected: `no flat module refs — clean` and `seed_template fully relocated`.

- [ ] **Step 3: Lint**

```bash
docker compose exec django ruff check apps/core
```
Expected: no errors (no unused imports / bad import order introduced by the moves). Fix any flagged.

- [ ] **Step 4: URL smoke check**

```bash
docker compose exec django python manage.py show_urls 2>/dev/null | grep -E "/api/v1/(platform|upload|contact|demo|me|preview|onboarding)" || \
docker compose exec django python -c "import django,os; os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings.dev'); django.setup(); from django.urls import get_resolver; print('URLConf loaded OK')"
```
Expected: the seven route prefixes resolve (or `URLConf loaded OK` if `show_urls` isn't installed).

- [ ] **Step 5: Final report**

Confirm: suite green at baseline count, `manage.py check` clean, no flat-module refs, lint clean. Report any deviation with exact output before claiming done.

---

## Self-Review

**Spec coverage:**
- Sub-packages platform/uploads/contact/demo/me/preview/onboarding → Tasks 1–7. ✓
- `admin_panels.py` stays at root; its imports updated → Task 1 Step 4. ✓
- `seed_template` → demo/, management-command imports updated → Task 4. ✓
- `health_check` stays in `views.py`; onboarding views extracted → Task 7. ✓
- `config/urls.py` 7 include repoints → one per Task 1–7. ✓
- Shared services stay at root (untouched) → enforced by Global Constraints; Task 8 Step 2 confirms no `seed_template`/flat refs leak. ✓
- Verification (manage.py check + pytest + lint + URL smoke) → per-task Steps + Task 8. ✓

**Placeholder scan:** No TBD/TODO; every step has exact commands. The "fix each hit" steps are bounded by a concrete grep whose expected end state is stated.

**Consistency:** Module/sub-package names (`platform`, `uploads`, `contact`, `demo`, `me`, `preview`, `onboarding`), the `views.py`/`urls.py`/`serializers.py` filenames, and the `config/urls.py` include paths are consistent across tasks and match the spec's moves table.
