# Reorganize `core` feature endpoints into sub-packages — design

**Date:** 2026-06-19
**Status:** Approved, pending implementation plan

## Problem

`apps.core` has grown into a catch-all: ~4071 lines with a flat sprawl of
`views_*.py` (8) and `urls_*.py` (7) modules covering unrelated concerns
(platform admin, uploads, contact, demo, onboarding, me, preview) mixed in with
the genuine tenancy infrastructure (Tenant/Domain models, routers, middleware,
access service). The flat layout makes the app hard to navigate and obscures
which files belong together.

## Goals

1. Group `core`'s feature *endpoint* clusters (views + urls + serializers) into
   named sub-packages, one per concern.
2. Leave the app importable and behaviourally identical — this is a pure code
   reorganization.

## Non-goals / constraints

- **No new Django apps.** Stays one app: `apps.core`.
- **No model moves, no migrations, no settings changes.** In particular:
  - `core.Tenant` is `TENANT_MODEL` and `core.Domain` is `TENANT_DOMAIN_MODEL`
    (django-tenants) — anchored in `core`, untouchable here.
  - The platform-billing models (`PlatformPlan`, `PlatformSubscription`,
    `TenantUsage`, `WebhookEvent`) stay in `core/models.py`.
- **`admin_panels.py` must stay at the app root.** adminkit discovers it via
  `autodiscover_modules("admin_panels")` (`apps/adminkit/apps.py`), which only
  looks for `<app>.admin_panels` — not a sub-package.
- **Shared services stay at root** to keep cross-app imports stable:
  `storage.py` (8 external refs), `monetization.py` (2, imported by billing),
  `stripe_pricing.py` (1), plus `access.py`, `pagination.py`, `permissions.py`,
  `validators.py`, `constants.py`, `region_utils.py`, `currency.py`,
  `i18n_helpers.py`, `logging.py`, `email.py`, `quotas.py`, `tasks.py`.
- No behaviour change: same URLs, same view logic, same responses.

## Decision (from brainstorming)

Scope = **sub-packages, no model moves** (the lowest-risk of the three options
considered: sub-packages / extract model-less apps / full split incl. a platform
app). Only the feature endpoint clusters move; everything Django-critical or
shared stays at the app root.

## Design

### Stays at `core/` root (unchanged location)

- Django-critical: `models.py`, `admin.py`, `admin_panels.py`, `apps.py`,
  `signals.py`, `routers.py`, `middleware/`, `management/`, `migrations/`,
  `tests/`.
- Shared services/utilities (list above).
- `views.py` keeps **only** `health_check` (imported by `config/urls.py` as
  `from apps.core.views import health_check`).

### Moves into feature sub-packages

Each sub-package is `__init__.py` + `views.py` + `urls.py` (+ `serializers.py`
where one exists). Every moved module has **0 external references** (verified by
grep), so the only edits outside the moved files are `config/urls.py` includes
and core-internal imports.

| Sub-package | Source modules |
| --- | --- |
| `core/platform/` | `views_platform.py` → `views.py`; `urls_platform.py` → `urls.py`; `serializers_platform.py` → `serializers.py` |
| `core/uploads/` | `views_upload.py` + `views_multipart.py` → `views.py` (+ `multipart.py`); `serializers_upload.py` → `serializers.py`; `urls_upload.py` → `urls.py` |
| `core/contact/` | `views_contact.py` → `views.py`; `urls_contact.py` → `urls.py` |
| `core/demo/` | `views_demo.py` → `views.py`; `urls_demo.py` → `urls.py`; `seed_template.py` → `seed_template.py` |
| `core/me/` | `views_me.py` → `views.py`; `urls_me.py` → `urls.py` |
| `core/preview/` | `views_preview.py` → `views.py`; `urls_preview.py` → `urls.py` |
| `core/onboarding/` | `urls_onboarding.py` → `urls.py`; onboarding views pulled out of `views.py` → `views.py` (`creator_signup`, `creator_signup_verify`, `_resolve_tenant_from_signup_token`, `seed_from_template`, `skip_template`, `provisioning_status`) |

Note: `uploads/` may keep `views_upload` and `views_multipart` as two modules
(`views.py` + `multipart.py`) rather than merging — they are sizable (176 + 163
lines) and cohesive on their own. Implementer's choice; default to two modules.

### Wiring updates

1. **`config/urls.py`** — 7 include paths:
   - `apps.core.urls_demo` → `apps.core.demo.urls`
   - `apps.core.urls_onboarding` → `apps.core.onboarding.urls`
   - `apps.core.urls_contact` → `apps.core.contact.urls`
   - `apps.core.urls_preview` → `apps.core.preview.urls`
   - `apps.core.urls_platform` → `apps.core.platform.urls`
   - `apps.core.urls_me` → `apps.core.me.urls`
   - `apps.core.urls_upload` → `apps.core.uploads.urls`
   - `from apps.core.views import health_check` stays (health_check stays in
     `core/views.py`).
2. **Core-internal imports:**
   - each sub-package `urls.py` imports from its sibling `views` (and
     `serializers`).
   - `admin_panels.py` (root) updates any imports of `views_platform` /
     `serializers_platform` to `core.platform.*`.
   - `management/commands/seed_*` update `seed_template` import to
     `apps.core.demo.seed_template`.
   - `tests/` update imports of any moved module.

### Verification (safety net)

The reorg changes no behaviour, so the existing pytest suite is the safety net:

1. `python manage.py check` — no app/import errors.
2. `make test` (pytest) — full suite green; in particular the URL-routed view
   tests prove every include resolves.
3. A URL-resolution smoke check: `python manage.py shell -c "from django.urls
   import reverse; ..."` (or `show_urls`) confirms each moved route still
   resolves.
4. `make lint` (ruff) — no unused-import / import-order regressions.

## Risk

Low. Every change is a file relocation plus an import-path update; no DB,
migration, settings, or behaviour change. The 0-external-reference finding means
the blast radius is `config/urls.py` + core-internal imports. Any missed import
fails loudly at `manage.py check` or in the test suite.

## Out of scope (future, separate efforts)

- Extracting feature clusters into their own Django apps.
- Moving the platform-billing models into a dedicated `platform` app.
- Splitting `core/tests/` to mirror the new sub-package layout (can follow once
  the structure lands).
