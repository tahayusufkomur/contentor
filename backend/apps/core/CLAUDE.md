# apps/core — local guide

Platform layer (public schema). Contains several distinct subsystems — load only the one you need:

- `models.py` — Tenant/Domain + platform billing (PlatformPlan, PlatformSubscription, WebhookEvent) + AI conversation models + platform CMS.
- `middleware/`, `routers.py` — tenant resolution (Host header / `X-Tenant-Domain`), rate limiting. Edit with care: every request passes through here.
- `access.py` — `ContentAccessService`, the paywall decision point used by courses/live/downloads/billing/notifications.
- `onboarding/` — signup wizard (compose, AI compose, recovery).
- `platform/` — superadmin platform-admin API.
- `demo/` — runtime "start from template" seeding used by the wizard (content lives in `apps/demo_seed`).
- `ai.py`, `assistant.py` — shared AI provider infra (no cross-app imports; safe leaf).

Tests: `make test-app APP=core`. Many function-local `from apps.…` imports here exist to dodge import cycles — do not "clean them up" into top-level imports without checking the cycle.
