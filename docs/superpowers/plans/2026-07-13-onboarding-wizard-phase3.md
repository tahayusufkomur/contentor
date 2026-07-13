# Onboarding Wizard — Phase 3 (in-wizard checkout + AI logo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unlock the wizard's third logo door: clicking "Create with AI" shows plan cards + Stripe checkout inline; after payment the Design-with-AI chat runs inside the wizard (pre-tenant, wizard-token auth), and the chosen design is applied at provisioning (recipe + exported logo/icon PNGs).

**Spec:** `docs/superpowers/specs/2026-07-13-onboarding-wizard-design.md` §3.3 (checkout row) + §3.6 (AI path).

**⚠️ Prerequisite:** Phases 1 AND 2 fully landed (`2026-07-13-onboarding-wizard-phase1.md`, `-phase2.md`). Written against their planned interfaces — before executing, diff `wizard.py`, `wizard_catalog.py`, `compose.apply_wizard_logo`, `LogoStep`, and `WizardFlow` against the landed code and adjust references if execution drifted.

**Architecture — what discovery established (verified in code):**
- The AI engine is ALREADY tenant-decoupled: `logo_converse.converse_turn(stage, brief, transcript, pinned, message)`, `critique_turn`, `critique_refine`, and `logo_ai.refine_design(recipe, elements, instruction)` take explicit inputs. Only the coach views (`apps/tenant_config/views.py:206-463`) touch `TenantConfig` — and only to build the brief (`brand_name`, theme → `_THEME_PRIMARY_HEX`) and key quotas by `connection.tenant.schema_name`. The refactor is therefore an **extraction**: move the view bodies into a service module (`logo_api.py`) that takes `(tenant, brief, data)`; coach views and wizard views both delegate.
- "Finish" never persists a recipe — the CLIENT saves it after the coach picks a design. Pre-tenant, the wizard client PATCHes it into `wizard_state.answers.logo` instead.
- The studio renders recipes client-side and exports PNGs (`lib/logo/export.ts: svgToPngBlob`). The public site displays `config.logo`/`config.icon` (Photos), NOT live recipes — so the wizard must export PNGs client-side too and stage them via a new wizard-token upload endpoint (`wizard/<schema>/logo|icon.png` S3 keys); provisioning turns them into Photos.
- Checkout: `apps/billing/views/platform.py: start_checkout` is the template (currency lock via `select_for_update`, `plan.prices[currency].stripe_price_id` guard, `get_provider(tenant).create_checkout_session(tenant=, user=, plan=, success_url=, cancel_url=, locale=)`). The webhook (`_handle_checkout_session_completed`) keys `PlatformSubscription.update_or_create` by tenant metadata — the tenant row exists pre-provision, so it works unchanged. `BILLING_BYPASS` provider activates the subscription instantly → offline paid-path e2e.
- Plan cards: `GET /api/v1/billing/platform/plans/` is already public (`AllowAny`, `billing/urls.py:49`) — the wizard reuses it.
- Client chat logic is already extracted React-free: `lib/logo/chat-state.ts` + `lib/logo/wizard-view.ts` (the studio's staged icon→name→tagline flow). Mirror them + the pure render/export modules into `frontend-main`; only the chat VIEW component is new (leaner than `studio-chat.tsx`).

**Tech Stack:** DRF + wizard-token auth (phase 1), Stripe via `apps.billing.providers` (bypass for dev/e2e), existing `logo_ai`/`logo_converse` engine + `LogoAiUsage` quotas, Next.js mirror of the pure logo modules.

**Spec deviations (deliberate):** (1) §3.6's "provisioning … runs the standard logo/icon export" is impossible server-side — there is no server SVG renderer (the studio exports client-side); instead the wizard client renders + exports the PNGs and stages them via a new `wizard/logo-upload/` endpoint, and provisioning turns the staged keys into Photos. (2) Plan cards come from the existing public `GET /api/v1/billing/platform/plans/` (the pricing page's source) instead of being bundled into the wizard catalog. (3) The spec's separate refine endpoint set collapses into the same four wizard endpoints the studio parity requires (status/converse/finish/refine — refine was listed, finish wasn't; both are needed for studio-equal quality).

## Global Constraints

- Phase-1 plan's Global Constraints apply (container pytest, `@authentication_classes([])` on public endpoints, zero-warning lint, EN/TR parity, frontends linted manually, `make test-fresh` after migrations — phase 3 adds NO migrations).
- The `logo_api.py` extraction must be behavior-preserving: every existing logo test (`apps/tenant_config` logo suites, e2e `15-logo-studio` / `17-logo-curated-library`) stays green untouched.
- Wizard AI logo shares the coach quotas: same `LogoAiUsage` rows (keyed by `tenant.schema_name` — public schema, works pre-provision), same `LOGO_AI_MONTHLY_TURN_LIMIT`/`REFINE_LIMIT`/`LOGO_AI_MONTHLY_BUDGET_USD`. No new budget knobs.
- Paid gate everywhere server-side: `tenant.has_paid_platform_plan` (live subscription) — never trust the client's unlock state.
- Uploaded wizard logo PNGs: magic-byte checked, ≤ 1 MB, only ever written under `wizard/<schema_name>/`; `apply_wizard_logo` refuses any `export_keys` outside that prefix (mirror of the curated `platform/` prefix guard).
- Mirrored frontend modules get a `// MIRRORED FROM frontend-customer/... — keep in sync` header (repo precedent: `logo_recipe.py` ↔ `migrate.ts`).
- Checkout success/cancel URLs stay on the marketing origin of the current request host (works for `tr.` too); the client PATCHes `current_step: "logo"` BEFORE redirecting so the localStorage-token resume (phase 1) lands back on the logo step.

## File Structure (phase 3)

Backend — create:
- `backend/apps/tenant_config/logo_api.py` — extracted service: `ai_status(tenant)`, `converse(tenant, brief, data)`, `converse_finish(tenant, data)`, `refine(tenant, data)` + `THEME_PRIMARY_HEX` (hoisted).
- `backend/apps/core/onboarding/wizard_logo.py` — wizard-token views: logo-status, logo-converse, logo-converse/finish, logo-refine, logo-upload.
- `backend/apps/core/tests/test_wizard_logo_ai.py`, `backend/apps/core/tests/test_wizard_checkout.py`.

Backend — modify:
- `backend/apps/tenant_config/views.py` (logo views delegate to `logo_api`), `backend/apps/core/onboarding/wizard.py` (+`wizard_checkout`), `backend/apps/core/onboarding/urls.py` (5 routes), `backend/apps/core/onboarding/wizard_catalog.py` (logo answer schema: mode `ai`, `recipe`, `export_keys`), `backend/apps/core/onboarding/compose.py` (`apply_wizard_logo` ai branch), `backend/apps/core/storage.py` (only if no put helper exists — reuse the client/put pattern in `apps/core/platform/uploads.py`), `backend/apps/core/tests/test_wizard_provision.py` (extend).

Frontend-main — create (mirrors, `// MIRRORED FROM …` headers):
- `frontend-main/src/types/logo.ts`, `frontend-main/src/lib/logo/{catalog.ts, composer.ts, migrate.ts, export.ts, chat-state.ts, wizard-view.ts}`, `frontend-main/src/components/logo/{logo-renderer.tsx, abstract-mark.tsx}`.
- `frontend-main/src/lib/wizard/logo-api.ts` (tokenized fetchers for the wizard logo endpoints), `frontend-main/src/app/signup/verify/wizard/ai-logo.tsx` (upgrade cards + chat view).

Frontend-main — modify:
- `frontend-main/src/app/signup/verify/wizard/logo-review-steps.tsx` (AI door: locked → plan cards → chat), `WizardFlow.tsx` (upgraded=1 handling, paid poll), `frontend-main/src/lib/wizard/{types.ts, api.ts}` (logo answer fields, plans fetch), `frontend-main/messages/{en,tr}/wizard.json` (upgrade/chat strings).

E2E — modify: `e2e/specs/01-signup-onboarding.spec.ts` (locked-door assertion) + create `e2e/specs/23-wizard-ai-logo.spec.ts` (bypass paid path).

---

### Task 1: Extract `logo_api.py` (behavior-preserving)

**Files:**
- Create: `backend/apps/tenant_config/logo_api.py`
- Modify: `backend/apps/tenant_config/views.py` (logo section, lines ~206–463)

**Interfaces:**
- Produces (consumed by Task 2 and by the rewritten coach views):
  - `THEME_PRIMARY_HEX: dict[str, str]` — moved verbatim from `views.py:206` (keep its "keep in sync with themes.ts" comment).
  - `ai_status(tenant) -> dict` — body of `_logo_ai_status`.
  - `converse(tenant, brief: dict, data: dict) -> dict` — body of the `logo_converse` view AFTER brief construction: stage/transcript/pinned/message parsing, quota + budget gates, `converse_turn`, usage recording, draft caching. The `brief` arrives fully built by the caller.
  - `converse_finish(tenant, data: dict) -> dict` — body of `logo_converse_finish` (draft-cache lookup keyed by `tenant.schema_name`, `_decode_images`, critique calls, usage).
  - `refine(tenant, data: dict) -> dict` — body of `logo_refine` (all gates + `refine_design` + usage + draft cache).
  - All four return plain dicts (the exact response bodies the views return today); views wrap them in `Response(...)`.
- Move together with the bodies: `_DRAFT_CACHE_PREFIX`, `_DRAFT_TTL_SECONDS`, `_MAX_CRITIQUE_IMAGES`, `_MAX_IMAGE_B64_CHARS`, `_PNG_MAGIC`, `_cache_draft` (parameterize `connection.tenant.schema_name` → `tenant.schema_name`), `_decode_images`.
- The paid/eligibility gate STAYS in the functions (`tenant.has_paid_platform_plan` checks move with the bodies — both callers need them server-side).

- [ ] **Step 1: Baseline — run the existing logo suites**

Run: `docker compose exec django pytest apps/tenant_config/ -k "logo" -v`
Record the pass count — this is the contract. (No new tests in this task; the refactor is pinned by the existing ones.)

- [ ] **Step 2: Create logo_api.py and slim the views**

Mechanical extraction — for each of the four view bodies in `apps/tenant_config/views.py`:
1. Copy the body into the matching `logo_api.py` function, replacing every `connection.tenant` with the `tenant` parameter and every `return Response(X)` / `return Response(X, status=...)` with `return X` (none of the logo views use non-200 statuses — verify while moving).
2. In `logo_converse` only, the brief-building block (`config = TenantConfig.objects.first()` … the `brief = {...}` dict, views.py:285-293) STAYS in the view; the view then calls `logo_api.converse(tenant, brief, data)`.
3. Rewrite the four views to:

```python
@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def logo_ai_status(request):
    return Response(logo_api.ai_status(connection.tenant))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def logo_converse(request):
    tenant = connection.tenant
    data = request.data if isinstance(request.data, dict) else {}
    config = TenantConfig.objects.first()
    raw_brief = data.get("brief") if isinstance(data.get("brief"), dict) else {}
    brief = {
        "brand_name": (config.brand_name if config else "") or "My Brand",
        "primary_hex": logo_api.THEME_PRIMARY_HEX.get(config.theme if config else "ocean", "#1a56db"),
        "niche": str(raw_brief.get("niche") or "")[:120],
        "style_chips": ", ".join(str(c)[:20] for c in (raw_brief.get("style_chips") or [])[:3]),
        "vibe": str(raw_brief.get("vibe") or "")[:200],
    }
    return Response(logo_api.converse(tenant, brief, data))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def logo_converse_finish(request):
    data = request.data if isinstance(request.data, dict) else {}
    return Response(logo_api.converse_finish(connection.tenant, data))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def logo_refine(request):
    data = request.data if isinstance(request.data, dict) else {}
    return Response(logo_api.refine(connection.tenant, data))
```

4. `logo_api.py` module header:

```python
"""Logo Design-with-AI service layer.

Extracted from tenant_config.views so TWO auth contexts share one
implementation: the coach studio (JWT, connection.tenant) and the signup
wizard (wizard token, tenant resolved from the token — the tenant schema
does not exist yet there). Functions take the tenant EXPLICITLY and return
plain dicts; callers own Response() and brief construction.

Quota/budget accounting is unchanged: public-schema LogoAiUsage keyed by
tenant.schema_name — valid before the schema itself exists.
"""
```

5. Keep a `_THEME_PRIMARY_HEX = logo_api.THEME_PRIMARY_HEX` alias in `views.py` ONLY if other code in the module references it (grep first); otherwise update references.

- [ ] **Step 3: Verify the contract**

Run: `docker compose exec django pytest apps/tenant_config/ -k "logo" -v && docker compose exec django pytest apps/core/tests/test_curated_logos.py -v`
Expected: identical pass count to Step 1, zero failures.

- [ ] **Step 4: Commit**

```bash
git add backend/apps/tenant_config/logo_api.py backend/apps/tenant_config/views.py
git commit -m "refactor(logo): extract tenant-explicit logo_api service from views

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Wizard logo AI endpoints (status/converse/finish/refine)

**Files:**
- Create: `backend/apps/core/onboarding/wizard_logo.py`
- Modify: `backend/apps/core/onboarding/urls.py`
- Test: `backend/apps/core/tests/test_wizard_logo_ai.py` (create)

**Interfaces:**
- Consumes: `logo_api` (Task 1), `_resolve_tenant_from_wizard_token` (phase 1, `wizard.py`), `wizard_catalog.THEME_RANKING` (phase 1) for the default theme, `LogoAiUsage` quotas.
- Produces (all POST except status; wizard token in body; `@authentication_classes([])`):
  - `POST /api/v1/onboarding/wizard/logo-status/` → `logo_api.ai_status(tenant)` + `{"paid": tenant.has_paid_platform_plan}`.
  - `POST /api/v1/onboarding/wizard/logo-converse/` → brief from Tenant + wizard answers: `brand_name=tenant.name`, `primary_hex=THEME_PRIMARY_HEX[answers.theme or niche-ranked default]`, `niche=answers.niche`, `vibe=answers.description[:200]`, `style_chips` from client body (same clamp) → `logo_api.converse(...)`.
  - `POST /api/v1/onboarding/wizard/logo-converse/finish/` → `logo_api.converse_finish(...)`.
  - `POST /api/v1/onboarding/wizard/logo-refine/` → `logo_api.refine(...)`.
- The engine's `upgrade_required` path already handles unpaid tenants (returns a safe body, no exception) — the wizard views add NO extra paid gate beyond what moved into `logo_api`.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/core/tests/test_wizard_logo_ai.py`:

```python
import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.tokens import create_wizard_token
from apps.core.models import PlatformPlan, PlatformSubscription, Tenant

pytestmark = pytest.mark.django_db(transaction=True)

SHARED_DOMAIN = "shared-test.localhost"


def _client():
    return APIClient(HTTP_HOST=SHARED_DOMAIN)


def _token():
    return create_wizard_token("coach@x.com", "Coach", "Ai Logo Studio")


@pytest.fixture()
def tenant(restore_public):
    connection.set_schema_to_public()
    t, _ = Tenant.objects.get_or_create(
        schema_name="ai_logo_studio",
        defaults={
            "name": "Ai Logo Studio",
            "slug": "ai-logo-studio",
            "subdomain": "ai-logo-studio",
            "owner_email": "coach@x.com",
        },
    )
    t.provisioning_status = "pending"
    t.wizard_state = {"answers": {"niche": "yoga", "theme": "forest", "description": "Calm vinyasa."}}
    t.save(update_fields=["provisioning_status", "wizard_state"])
    yield t
    connection.set_schema_to_public()
    PlatformSubscription.objects.filter(tenant=t).delete()
    Tenant.objects.filter(schema_name="ai_logo_studio").delete()


@pytest.fixture()
def paid(tenant):
    plan, _ = PlatformPlan.objects.get_or_create(
        name="starter-wiz-test", defaults={"price_monthly": 19, "transaction_fee_pct": 8}
    )
    PlatformSubscription.objects.update_or_create(
        tenant=tenant, defaults={"plan": plan, "status": "active"}
    )
    return tenant


def test_logo_status_unpaid(tenant):
    resp = _client().post("/api/v1/onboarding/wizard/logo-status/", {"token": _token()}, format="json")
    assert resp.status_code == 200
    body = resp.json()
    assert body["paid"] is False
    assert body["reason"] == "upgrade_required"


def test_converse_unpaid_returns_upgrade_required(tenant, monkeypatch):
    from apps.tenant_config import logo_api

    monkeypatch.setattr(logo_api.core_ai, "available", lambda: (True, None))
    resp = _client().post(
        "/api/v1/onboarding/wizard/logo-converse/",
        {"token": _token(), "stage": "icon", "message": "a lotus"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.json()["source"] == "upgrade_required"


def test_converse_paid_builds_brief_from_wizard_answers(paid, monkeypatch):
    from apps.core.onboarding import wizard_logo
    from apps.tenant_config import logo_api

    seen = {}

    def fake_converse(tenant, brief, data):
        seen.update(brief)
        return {"phase": "final", "message": "ok", "designs": [], "source": "ai", "turns_remaining": 39}

    monkeypatch.setattr(wizard_logo.logo_api, "converse", fake_converse)
    assert logo_api  # imported for parity with the view module
    resp = _client().post(
        "/api/v1/onboarding/wizard/logo-converse/",
        {"token": _token(), "stage": "icon", "message": "a lotus", "brief": {"style_chips": ["minimal"]}},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.json()["source"] == "ai"
    assert seen["brand_name"] == "Ai Logo Studio"
    assert seen["primary_hex"] == "#15803d"  # forest
    assert seen["niche"] == "yoga"
    assert seen["vibe"] == "Calm vinyasa."
    assert seen["style_chips"] == "minimal"


def test_finish_and_refine_delegate(paid, monkeypatch):
    from apps.core.onboarding import wizard_logo

    monkeypatch.setattr(
        wizard_logo.logo_api, "converse_finish",
        lambda tenant, data: {"phase": "final", "message": "", "designs": [], "source": "draft", "turns_remaining": 1},
    )
    monkeypatch.setattr(
        wizard_logo.logo_api, "refine",
        lambda tenant, data: {"design": None, "source": "error", "refine_remaining": 5},
    )
    assert _client().post(
        "/api/v1/onboarding/wizard/logo-converse/finish/", {"token": _token(), "token_draft": "x"}, format="json"
    ).json()["source"] == "draft"
    assert _client().post(
        "/api/v1/onboarding/wizard/logo-refine/", {"token": _token(), "instruction": "bolder"}, format="json"
    ).json()["refine_remaining"] == 5


def test_bad_token_rejected(tenant):
    resp = _client().post("/api/v1/onboarding/wizard/logo-status/", {"token": "junk"}, format="json")
    assert resp.status_code == 400
```

Note on the finish payload: the coach endpoint reads the draft-cache token from `data["token"]`, which collides with the wizard AUTH token field. The wizard views must therefore pass the engine a copy of the body where `token` is replaced by the draft token sent as `draft_token` (see Step 3). The `token_draft` key in the test above is deliberately ignored garbage — delegation is what's asserted.

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_logo_ai.py -v`
Expected: 404s — routes missing.

- [ ] **Step 3: Implement wizard_logo.py**

```python
"""Wizard-token variants of the Logo Design-with-AI endpoints.

Same engine, quotas, and budget as the coach studio (logo_api) — only the
auth context and brief source differ: the tenant comes from the wizard
token and the brief from Tenant + wizard_state.answers (no TenantConfig —
the tenant schema doesn't exist yet).

Field collision note: these endpoints receive the wizard AUTH token in
data["token"], but logo_api.converse_finish reads the DRAFT-cache token
from the same key. Wizard clients send the draft token as "draft_token";
we rewrite it before delegating.
"""

import logging

from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.tenant_config import logo_api

from . import wizard_catalog
from .wizard import _resolve_tenant_from_wizard_token

logger = logging.getLogger(__name__)


def _wizard_brief(tenant, data):
    answers = (tenant.wizard_state or {}).get("answers") or {}
    niche = answers.get("niche") or "general"
    theme = answers.get("theme") or wizard_catalog.THEME_RANKING.get(niche, ("ocean",))[0]
    raw_brief = data.get("brief") if isinstance(data.get("brief"), dict) else {}
    return {
        "brand_name": tenant.name or "My Brand",
        "primary_hex": logo_api.THEME_PRIMARY_HEX.get(theme, "#1a56db"),
        "niche": str(niche)[:120],
        "style_chips": ", ".join(str(c)[:20] for c in (raw_brief.get("style_chips") or [])[:3]),
        "vibe": str(answers.get("description") or "")[:200],
    }


def _engine_data(data):
    """Body copy with the auth token stripped and the draft token restored
    under the key the engine expects."""
    out = {k: v for k, v in data.items() if k != "token"}
    if "draft_token" in out:
        out["token"] = out.pop("draft_token")
    return out


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_logo_status(request):
    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err is not None:
        return err
    return Response({**logo_api.ai_status(tenant), "paid": tenant.has_paid_platform_plan})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_logo_converse(request):
    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err is not None:
        return err
    data = request.data if isinstance(request.data, dict) else {}
    return Response(logo_api.converse(tenant, _wizard_brief(tenant, data), _engine_data(data)))


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_logo_converse_finish(request):
    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err is not None:
        return err
    data = request.data if isinstance(request.data, dict) else {}
    return Response(logo_api.converse_finish(tenant, _engine_data(data)))


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_logo_refine(request):
    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err is not None:
        return err
    data = request.data if isinstance(request.data, dict) else {}
    return Response(logo_api.refine(tenant, _engine_data(data)))
```

In `backend/apps/core/onboarding/urls.py` add:

```python
from .wizard_logo import (
    wizard_logo_converse,
    wizard_logo_converse_finish,
    wizard_logo_refine,
    wizard_logo_status,
)
```

```python
    path("wizard/logo-status/", wizard_logo_status, name="wizard-logo-status"),
    path("wizard/logo-converse/", wizard_logo_converse, name="wizard-logo-converse"),
    path("wizard/logo-converse/finish/", wizard_logo_converse_finish, name="wizard-logo-converse-finish"),
    path("wizard/logo-refine/", wizard_logo_refine, name="wizard-logo-refine"),
]
```

If `logo_api.ai_status` unpacks `core_ai.available()` as a tuple (it does — `enabled, _ = core_ai.available()`), the unpaid-status test's monkeypatch matches; keep the tuple contract.

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_logo_ai.py apps/tenant_config/ -k "logo" -v`
Expected: new tests PASS; coach logo suites untouched.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/onboarding/wizard_logo.py backend/apps/core/onboarding/urls.py backend/apps/core/tests/test_wizard_logo_ai.py
git commit -m "feat(onboarding): wizard-token Design-with-AI logo endpoints

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Logo answer schema v2 (mode `ai`, recipe, export_keys)

**Files:**
- Modify: `backend/apps/core/onboarding/wizard_catalog.py`
- Test: `backend/apps/core/tests/test_wizard_catalog.py` (extend)

**Interfaces:**
- Consumes: `validate_logo_recipe` (`apps/tenant_config/serializers.py` — delegates to `logo_recipe.py`).
- Produces: `LOGO_MODES = ("wordmark", "curated", "ai")`; the `logo` answer may now carry `recipe` (full studio recipe dict, server-validated) and `export_keys` (`{"logo": str, "icon": str}`, both REQUIRED to start with `wizard/` — actual `<schema>` ownership is enforced at upload time by Task 4 and re-checked at apply time by Task 6).

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/core/tests/test_wizard_catalog.py`:

```python
def test_logo_answer_accepts_ai_mode_with_recipe():
    recipe = {"version": 2, "layout": "name_only", "name": {"text": "Glow"}}
    ok = wc.validate_answers({"logo": {
        "mode": "ai", "curated_id": None, "recipe": recipe,
        "export_keys": {"logo": "wizard/glow/logo.png", "icon": "wizard/glow/icon.png"},
    }})
    assert ok == []


@pytest.mark.parametrize(
    "logo",
    [
        {"mode": "ai", "curated_id": None, "recipe": None},                      # ai requires recipe
        {"mode": "ai", "recipe": {"version": 99, "layout": "bogus"}},            # invalid recipe
        {"mode": "ai", "recipe": {"version": 2, "layout": "name_only", "name": {"text": "G"}},
         "export_keys": {"logo": "platform/evil.png", "icon": "wizard/g/icon.png"}},  # bad prefix
        {"mode": "wordmark", "recipe": {"version": 2, "layout": "name_only", "name": {"text": "G"}}},  # recipe only for ai
    ],
)
def test_logo_answer_rejects_bad_ai_shapes(logo):
    assert wc.validate_answers({"logo": logo}) != []
```

If `validate_logo_recipe` normalizes rather than rejects the "invalid recipe" case, adjust that parametrized entry to whatever it genuinely 400s on (unknown enum values are hard 400s per `logo_recipe.py`'s philosophy — `"layout": "bogus"` qualifies).

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_catalog.py -v`
Expected: new tests FAIL (`ai` not in `LOGO_MODES`).

- [ ] **Step 3: Implement**

In `wizard_catalog.py`, change:

```python
LOGO_MODES = ("wordmark", "curated", "ai")
```

and replace the `elif key == "logo":` branch of `validate_answers` with:

```python
        elif key == "logo":
            if not isinstance(value, dict) or value.get("mode") not in LOGO_MODES:
                errors.append("logo.mode must be one of: " + ", ".join(LOGO_MODES))
                continue
            mode = value["mode"]
            if mode == "curated" and not isinstance(value.get("curated_id"), int):
                errors.append("logo.curated_id must be an integer for curated mode")
            if value.get("curated_id") is not None and not isinstance(value.get("curated_id"), int):
                errors.append("logo.curated_id must be an integer or null")
            recipe = value.get("recipe")
            if mode == "ai":
                if not isinstance(recipe, dict):
                    errors.append("logo.recipe is required for ai mode")
                else:
                    from apps.tenant_config.serializers import validate_logo_recipe

                    try:
                        validate_logo_recipe(recipe)
                    except Exception:
                        errors.append("logo.recipe failed validation")
                export_keys = value.get("export_keys")
                if export_keys is not None:
                    if not isinstance(export_keys, dict) or set(export_keys) - {"logo", "icon"}:
                        errors.append("logo.export_keys must be {logo, icon}")
                    elif not all(
                        isinstance(k, str) and k.startswith("wizard/") for k in export_keys.values()
                    ):
                        errors.append("logo.export_keys must live under wizard/")
            elif recipe is not None:
                errors.append("logo.recipe is only allowed for ai mode")
```

If `validate_logo_recipe` in `serializers.py` is a serializer method rather than a module function, call the module-level validator in `apps/tenant_config/logo_recipe.py` directly (same behavior — `serializers.validate_logo_recipe` "delegates to it" per that module's header).

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_catalog.py apps/core/tests/test_wizard_state_endpoints.py -v`
Expected: all PASS (state-endpoint suite proves PATCH still accepts phase-1 logo answers).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/onboarding/wizard_catalog.py backend/apps/core/tests/test_wizard_catalog.py
git commit -m "feat(onboarding): ai logo answer schema with recipe + export key validation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Wizard logo-upload endpoint (staged PNG exports)

**Files:**
- Modify: `backend/apps/core/onboarding/wizard_logo.py`
- Modify: `backend/apps/core/onboarding/urls.py`
- Test: `backend/apps/core/tests/test_wizard_logo_ai.py` (extend)

**Interfaces:**
- Consumes: the S3 client/put pattern from `backend/apps/core/platform/uploads.py` (superadmin curated-logo upload: multipart, PNG magic check, 5 MB cap, non-tenant prefix) — open that file first and reuse its client-construction + put call verbatim; the code below marks the one adaptation point.
- Produces: `POST /api/v1/onboarding/wizard/logo-upload/` — multipart `file` + form fields `token`, `kind` (`logo`|`icon`); writes `wizard/<schema_name>/<kind>.png` (deterministic key — re-picks overwrite, no orphan buildup) and returns `{"key": ...}`. The client stores returned keys into the `logo.export_keys` answer (Task 3 validates the prefix).
- Gate: paid tenants only (`has_paid_platform_plan`) — the only callers are post-upgrade AI users; keeps the anonymous surface closed.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/core/tests/test_wizard_logo_ai.py`:

```python
PNG_1PX = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


def _upload(kind="logo", content=PNG_1PX, token=None):
    from django.core.files.uploadedfile import SimpleUploadedFile

    return _client().post(
        "/api/v1/onboarding/wizard/logo-upload/",
        {"token": token or _token(), "kind": kind, "file": SimpleUploadedFile("x.png", content, "image/png")},
        format="multipart",
    )


def test_upload_requires_paid(tenant):
    assert _upload().status_code == 403


def test_upload_stores_under_wizard_prefix(paid, monkeypatch):
    from apps.core.onboarding import wizard_logo

    puts = {}
    monkeypatch.setattr(wizard_logo, "_put_wizard_png", lambda key, blob: puts.setdefault(key, blob))
    resp = _upload()
    assert resp.status_code == 200, resp.content
    assert resp.json()["key"] == "wizard/ai_logo_studio/logo.png"
    assert list(puts) == ["wizard/ai_logo_studio/logo.png"]

    resp2 = _upload(kind="icon")
    assert resp2.json()["key"] == "wizard/ai_logo_studio/icon.png"


def test_upload_rejects_bad_kind_magic_and_size(paid, monkeypatch):
    from apps.core.onboarding import wizard_logo

    monkeypatch.setattr(wizard_logo, "_put_wizard_png", lambda key, blob: None)
    assert _upload(kind="banner").status_code == 400
    assert _upload(content=b"GIF89a not a png").status_code == 400
    assert _upload(content=PNG_1PX + b"\x00" * (1_048_577)).status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_logo_ai.py -v`
Expected: 404 on the upload route.

- [ ] **Step 3: Implement**

Append to `backend/apps/core/onboarding/wizard_logo.py`:

```python
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
_MAX_LOGO_UPLOAD_BYTES = 1_048_576  # 1 MB — studio exports are ~20-200 KB
_UPLOAD_KINDS = ("logo", "icon")


def _put_wizard_png(key: str, blob: bytes) -> None:
    """S3 put for staged wizard logo exports. ADAPT: reuse the exact client
    construction + put call from apps/core/platform/uploads.py (same bucket,
    ContentType image/png) — do not invent new client wiring."""
    from apps.core.platform import uploads as platform_uploads  # noqa: F401  (source of the pattern)

    raise NotImplementedError  # replaced by the uploads.py pattern at implementation time


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_logo_upload(request):
    """Stage the client-rendered logo/icon PNG for provisioning. Deterministic
    key per tenant+kind so re-picks overwrite instead of accumulating."""
    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err is not None:
        return err
    if not tenant.has_paid_platform_plan:
        return Response({"detail": "upgrade_required"}, status=403)

    kind = str(request.data.get("kind") or "")
    if kind not in _UPLOAD_KINDS:
        return Response({"detail": "kind must be logo or icon."}, status=400)
    upload = request.FILES.get("file")
    if upload is None or upload.size > _MAX_LOGO_UPLOAD_BYTES:
        return Response({"detail": "file required, max 1MB."}, status=400)
    blob = upload.read()
    if not blob.startswith(_PNG_MAGIC):
        return Response({"detail": "file must be a PNG."}, status=400)

    key = f"wizard/{tenant.schema_name}/{kind}.png"
    _put_wizard_png(key, blob)
    logger.info("wizard logo upload slug=%s kind=%s bytes=%d", tenant.slug, kind, len(blob))
    return Response({"key": key})
```

Replace the `_put_wizard_png` body with the real put using the helper/client found in `apps/core/platform/uploads.py` (keep the function seam — the tests monkeypatch it). Add the route:

```python
    path("wizard/logo-upload/", wizard_logo_upload, name="wizard-logo-upload"),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_logo_ai.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/onboarding/wizard_logo.py backend/apps/core/onboarding/urls.py backend/apps/core/tests/test_wizard_logo_ai.py
git commit -m "feat(onboarding): staged wizard logo/icon PNG upload endpoint

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Pre-provision checkout endpoint

**Files:**
- Modify: `backend/apps/core/onboarding/wizard.py`
- Modify: `backend/apps/core/onboarding/urls.py`
- Test: `backend/apps/core/tests/test_wizard_checkout.py` (create)

**Interfaces:**
- Consumes: `get_provider` + `ProviderError` (`apps.billing.providers`), `PlatformPlan.prices[currency].stripe_price_id`, `REGION_DEFAULT_CURRENCY` (`apps.core.constants`), the currency-lock pattern from `apps/billing/views/platform.py:start_checkout` (`select_for_update`).
- Produces: `POST /api/v1/onboarding/wizard/checkout/` `{token, plan_id}` → `{"checkout_url", "provider"}`. Success URL `.../signup/verify?upgraded=1`, cancel `.../signup/verify?upgraded=0` on the CURRENT marketing host (locale-correct for `tr.`). 409 if already subscribed; 400 unknown plan / free plan / missing price. The provider's `user` argument gets a `SimpleNamespace` built from the token payload (`email`, `name`) — before finalizing, grep `user\.` inside `create_checkout_session` in BOTH `apps/billing/providers/stripe_provider.py` and `bypass_provider.py` and make sure every attribute read is satisfied (discovery showed the signature is `user: Any`, duck-typed).
- The EXISTING webhook completes the flow (`_handle_checkout_session_completed` → `PlatformSubscription.update_or_create(tenant=...)`); a regression test pins that it works for a `provisioning_status="pending"` tenant.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/core/tests/test_wizard_checkout.py`:

```python
from types import SimpleNamespace

import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.tokens import create_wizard_token
from apps.core.models import PlatformPlan, PlatformSubscription, Tenant

pytestmark = pytest.mark.django_db(transaction=True)

SHARED_DOMAIN = "shared-test.localhost"


def _client():
    return APIClient(HTTP_HOST=SHARED_DOMAIN)


def _token():
    return create_wizard_token("coach@x.com", "Coach", "Pay Studio")


@pytest.fixture()
def tenant(restore_public):
    connection.set_schema_to_public()
    t, _ = Tenant.objects.get_or_create(
        schema_name="pay_studio",
        defaults={
            "name": "Pay Studio", "slug": "pay-studio", "subdomain": "pay-studio",
            "owner_email": "coach@x.com", "region": "global",
        },
    )
    t.provisioning_status = "pending"
    t.billing_currency = ""
    t.save(update_fields=["provisioning_status", "billing_currency"])
    yield t
    connection.set_schema_to_public()
    PlatformSubscription.objects.filter(tenant=t).delete()
    Tenant.objects.filter(schema_name="pay_studio").delete()


@pytest.fixture()
def plan():
    plan, _ = PlatformPlan.objects.get_or_create(
        name="starter-checkout-test",
        defaults={
            "price_monthly": 19, "transaction_fee_pct": 8,
            "prices": {"USD": {"stripe_price_id": "price_test_usd"}},
        },
    )
    if not (plan.prices or {}).get("USD", {}).get("stripe_price_id"):
        plan.prices = {"USD": {"stripe_price_id": "price_test_usd"}}
        plan.save(update_fields=["prices"])
    return plan


@pytest.fixture()
def fake_provider(monkeypatch):
    calls = {}

    class FakeSession:
        url = "https://checkout.example/sess_123"
        from datetime import UTC, datetime

        expires_at = datetime.now(UTC)

    class FakeProvider:
        name = "fake"

        def create_checkout_session(self, **kwargs):
            calls.update(kwargs)
            return FakeSession()

    from apps.core.onboarding import wizard as wizard_mod

    monkeypatch.setattr(wizard_mod, "get_provider", lambda tenant: FakeProvider())
    return calls


def _checkout(plan_id):
    return _client().post(
        "/api/v1/onboarding/wizard/checkout/", {"token": _token(), "plan_id": plan_id}, format="json"
    )


def test_checkout_creates_session_and_locks_currency(tenant, plan, fake_provider):
    resp = _checkout(plan.pk)
    assert resp.status_code == 200, resp.content
    assert resp.json()["checkout_url"].startswith("https://checkout.example/")
    tenant.refresh_from_db()
    assert tenant.billing_currency == "USD"
    assert fake_provider["plan"].pk == plan.pk
    assert fake_provider["success_url"].endswith("/signup/verify?upgraded=1")
    assert fake_provider["cancel_url"].endswith("/signup/verify?upgraded=0")
    assert fake_provider["user"].email == "coach@x.com"


def test_checkout_rejects_unknown_plan_and_subscribed(tenant, plan, fake_provider):
    assert _checkout(999999).status_code == 404
    PlatformSubscription.objects.update_or_create(tenant=tenant, defaults={"plan": plan, "status": "active"})
    assert _checkout(plan.pk).status_code == 409


def test_webhook_attaches_subscription_to_pending_tenant(tenant, plan):
    # Regression pin for the spec's core assumption: the platform webhook
    # handler works before provisioning. Call the handler function directly
    # with a minimal checkout.session.completed event shaped like the ones
    # apps/billing/tests build (copy the event fixture shape from
    # apps/billing/tests/test_subscriptions_connect.py's platform test or
    # apps/core/tests/test_platform_subscription.py — reuse, don't invent).
    from apps.core.tests.test_platform_subscription import build_platform_checkout_event  # adjust to real name

    event = build_platform_checkout_event(tenant=tenant, plan=plan)
    from apps.billing.views.webhooks import _handle_checkout_session_completed

    _handle_checkout_session_completed(event, webhook_event=None)
    sub = PlatformSubscription.objects.get(tenant=tenant)
    assert sub.status in ("active", "trialing")
    assert tenant.provisioning_status == "pending"  # untouched
```

The webhook test's event builder MUST be borrowed from the existing platform-subscription tests (`apps/core/tests/test_platform_subscription.py`) — open that file, reuse its event-construction helper (import it, or lift the dict literal if it's inline), and fix the import line accordingly. If `_handle_checkout_session_completed` requires a `WebhookEvent` row, create one the same way that suite does.

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_checkout.py -v`
Expected: 404 (route missing) on the first two; the webhook test may already PASS (that's the point of a regression pin — keep it either way).

- [ ] **Step 3: Implement the endpoint**

Append to `backend/apps/core/onboarding/wizard.py`:

```python
from apps.billing.providers import ProviderError, get_provider


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_checkout(request):
    """Contextual upgrade inside the wizard: Stripe Checkout for a platform
    plan BEFORE provisioning. The tenant row already exists, so the standard
    webhook attaches the PlatformSubscription; no wizard-specific completion
    handling is needed."""
    from types import SimpleNamespace

    from django.conf import settings
    from django.db import transaction

    from apps.core.constants import REGION_DEFAULT_CURRENCY
    from apps.core.models import PlatformPlan, PlatformSubscription

    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err is not None:
        return err

    if tenant.has_paid_platform_plan:
        return Response({"detail": "already_subscribed"}, status=409)

    try:
        plan = PlatformPlan.objects.get(pk=request.data.get("plan_id"))
    except (PlatformPlan.DoesNotExist, ValueError, TypeError):
        return Response({"detail": "plan_not_found"}, status=404)
    if getattr(plan, "is_free", False):
        return Response({"detail": "plan_not_purchasable"}, status=400)

    with transaction.atomic():
        locked = type(tenant).objects.select_for_update().get(pk=tenant.pk)
        if not locked.billing_currency:
            locked.billing_currency = REGION_DEFAULT_CURRENCY.get(locked.region, "USD")
            locked.save(update_fields=["billing_currency"])
        tenant.billing_currency = locked.billing_currency

    price_entry = (plan.prices or {}).get(tenant.billing_currency, {}) if isinstance(plan.prices, dict) else {}
    if not price_entry.get("stripe_price_id"):
        return Response({"detail": "price_not_available", "currency": tenant.billing_currency}, status=400)

    scheme = "https" if request.is_secure() else "http"
    origin = f"{scheme}://{request.get_host()}"
    user = SimpleNamespace(email=payload["email"], name=payload.get("name", ""), pk=None, id=None)
    locale = "tr" if tenant.region == "tr" else "en"
    try:
        session = get_provider(tenant).create_checkout_session(
            tenant=tenant,
            user=user,
            plan=plan,
            success_url=f"{origin}/signup/verify?upgraded=1",
            cancel_url=f"{origin}/signup/verify?upgraded=0",
            locale=locale,
        )
    except ProviderError as exc:
        logger.warning("wizard checkout failed slug=%s plan=%s: %s", tenant.slug, plan.pk, exc)
        return Response({"detail": exc.code}, status=400)

    logger.info("wizard checkout started slug=%s plan=%s currency=%s", tenant.slug, plan.pk, tenant.billing_currency)
    return Response({"checkout_url": session.url, "provider": get_provider(tenant).name})
```

Adjust the `get_provider`/`ProviderError` import path to the real module (grep `from apps.billing.providers import` in `apps/billing/views/platform.py` and copy it). Add the route:

```python
    path("wizard/checkout/", wizard_checkout, name="wizard-checkout"),
```

Verify the `SimpleNamespace` satisfies every `user.` read in both providers' `create_checkout_session` (Step interfaces note) — extend it if e.g. a locale or id attribute is read.

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_checkout.py apps/core/tests/test_platform_subscription.py -v`
Expected: all PASS (existing platform-subscription suite proves no webhook regressions).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/onboarding/wizard.py backend/apps/core/onboarding/urls.py backend/apps/core/tests/test_wizard_checkout.py
git commit -m "feat(onboarding): pre-provision platform checkout from the wizard

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Apply the AI logo at provisioning

**Files:**
- Modify: `backend/apps/core/onboarding/compose.py` (`apply_wizard_logo` — signature gains `tenant`)
- Modify: `backend/apps/core/tasks.py` (call site)
- Test: `backend/apps/core/tests/test_wizard_provision.py` (extend)

**Interfaces:**
- Consumes: `logo.recipe` + `logo.export_keys` from `wizard_state.answers` (Task 3), `validate_logo_recipe`, `Photo` (tenant schema).
- Produces: `apply_wizard_logo(config, answers, tenant) -> None` (was `(config, answers)` in phase 1 — update the single call site in `tasks.py`). AI branch: `config.logo_recipe = recipe` (re-validated defensively), Photos from `export_keys` (ONLY keys exactly `wizard/<tenant.schema_name>/logo.png` / `.../icon.png` — ownership re-check), `config.logo`/`config.icon` set, `navbar_config.show_brand_name = False` (studio lockups contain the wordmark — same reasoning as the model's help text).

- [ ] **Step 1: Write the failing test**

Append to `backend/apps/core/tests/test_wizard_provision.py` (reuse `WIZARD_ANSWERS`, `_make_tenant`, `_provision`, `cleanup` from phase 1):

```python
AI_RECIPE = {"version": 2, "layout": "name_only", "name": {"text": "Prov Studio"}}
# If validate_logo_recipe rejects this minimal shape, open
# apps/tenant_config/logo_recipe.py and extend the fixture to the smallest
# recipe its validator accepts (unknown enums are hard 400s; free text is
# clamped) — do NOT loosen the validator.


def test_ai_logo_applied_at_provision(cleanup):
    cleanup.append("prov-ai-logo")
    answers = {
        **WIZARD_ANSWERS,
        "logo": {
            "mode": "ai",
            "curated_id": None,
            "recipe": AI_RECIPE,
            "export_keys": {
                "logo": "wizard/prov_ai_logo/logo.png",
                "icon": "wizard/prov_ai_logo/icon.png",
            },
        },
    }
    tenant = _provision(_make_tenant("prov-ai-logo", answers))
    with tenant_context(tenant):
        from apps.tenant_config.models import TenantConfig

        config = TenantConfig.objects.first()
        assert config.logo_recipe.get("layout") == "name_only"
        assert config.logo is not None and config.logo.s3_key == "wizard/prov_ai_logo/logo.png"
        assert config.icon is not None and config.icon.s3_key == "wizard/prov_ai_logo/icon.png"
        assert config.navbar_config.get("show_brand_name") is False


def test_ai_logo_foreign_export_keys_ignored(cleanup):
    cleanup.append("prov-ai-evil")
    answers = {
        **WIZARD_ANSWERS,
        "logo": {
            "mode": "ai",
            "curated_id": None,
            "recipe": AI_RECIPE,
            "export_keys": {"logo": "wizard/someone_else/logo.png", "icon": "platform/x.png"},
        },
    }
    tenant = _provision(_make_tenant("prov-ai-evil", answers))
    with tenant_context(tenant):
        from apps.tenant_config.models import TenantConfig

        config = TenantConfig.objects.first()
        assert config.logo_recipe.get("layout") == "name_only"  # recipe still applies
        assert config.logo is None  # foreign keys refused
        assert config.icon is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_provision.py -v`
Expected: the two new tests FAIL (`logo_recipe` empty); everything else PASSES.

- [ ] **Step 3: Implement**

In `compose.py`, change the signature to `def apply_wizard_logo(config, answers, tenant) -> None:` and add the AI branch at the top of the mode dispatch (before the curated branch's early return structure — restructure to an `if/elif` on `mode`):

```python
    logo = answers.get("logo") or {}
    mode = logo.get("mode")

    if mode == "ai" and isinstance(logo.get("recipe"), dict):
        from apps.tenant_config.serializers import validate_logo_recipe

        try:
            config.logo_recipe = validate_logo_recipe(logo["recipe"])
        except Exception:
            return  # invalid recipe -> behave like wordmark (text fallback)

        from apps.media.models import Photo

        expected = {kind: f"wizard/{tenant.schema_name}/{kind}.png" for kind in ("logo", "icon")}
        export_keys = logo.get("export_keys") or {}
        for kind, expected_key in expected.items():
            if export_keys.get(kind) != expected_key:
                continue  # ownership re-check: only this tenant's staged keys
            photo = Photo.objects.filter(s3_key=expected_key).first()
            if photo is None:
                photo = Photo.objects.create(s3_key=expected_key, title=kind.capitalize())
            setattr(config, kind, photo)
        config.logo_url = ""
        navbar = dict(config.navbar_config or {})
        navbar["show_brand_name"] = False  # studio lockups already contain the wordmark
        config.navbar_config = navbar
        return
```

(If `validate_logo_recipe` returns `None` instead of the cleaned dict, assign `logo["recipe"]` after a successful validation call — match its real contract.) Update the call in `tasks.py` `_apply_wizard_answers` to `apply_wizard_logo(config, answers, tenant)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_provision.py -v && make test`
Expected: all PASS, full suite green.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/onboarding/compose.py backend/apps/core/tasks.py backend/apps/core/tests/test_wizard_provision.py
git commit -m "feat(onboarding): apply AI logo recipe + staged exports at provisioning

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Mirror the pure logo modules into frontend-main

**Files:**
- Create (each with a `// MIRRORED FROM frontend-customer/src/... — keep in sync (phase-3 wizard)` header): `frontend-main/src/types/logo.ts`, `frontend-main/src/lib/logo/catalog.ts`, `composer.ts`, `migrate.ts`, `export.ts`, `frontend-main/src/components/logo/logo-renderer.tsx`, `abstract-mark.tsx`, and `render-draft` IF the studio uses a dedicated component to render `ConverseDesign`s (check `frontend-customer/src/components/logo/render-draft.tsx` — mirror whatever `studio-chat.tsx` uses to draw design cards).
- Create: `frontend-main/src/lib/wizard/logo-api.ts` (NOT a mirror — wizard-token fetchers)

**Interfaces:**
- Consumes: source files in `frontend-customer` (copy, then fix `@/` imports that point at customer-only modules — the mirrored set must be self-contained; if a mirrored file imports something outside the set, mirror that module too or inline the few needed exports).
- Produces for Task 8: `LogoRenderer` (recipe → SVG), `svgToPngBlob` (`export.ts`), the `ConverseDesign` type and whatever accessor turns a design into a renderable recipe (learn it from `studio-chat.tsx`/`render-draft` while mirroring — record it as `designRecipe(design)` in `logo-api.ts` so Task 8 has ONE import), and:

```ts
// frontend-main/src/lib/wizard/logo-api.ts
export interface WizardLogoStatus {
  enabled: boolean; eligible: boolean; paid: boolean;
  turns_remaining: number; refine_remaining: number; reason: string | null;
}
export function fetchWizardLogoStatus(token: string): Promise<WizardLogoStatus>;
export function wizardConverse(token: string, body: {
  stage: "icon" | "name" | "tagline";
  message: string;
  transcript: { role: string; text: string }[];
  pinned: object;
  brief?: { style_chips?: string[] };
}): Promise<ConverseTurnResponse>;                       // same response type as the studio's converse-api
export function wizardConverseFinish(token: string, draftToken: string, images: string[]): Promise<ConverseTurnResponse>;
export function wizardRefine(token: string, body: { recipe: object; instruction: string }): Promise<RefineResponse>;
export function wizardLogoUpload(token: string, kind: "logo" | "icon", blob: Blob): Promise<{ key: string }>;
export function wizardCheckout(token: string, planId: number): Promise<{ checkout_url: string }>;
export function designRecipe(design: ConverseDesign): LogoRecipe;  // accessor copied from the studio's design cards
```

All fetchers POST with the wizard `token` in the body; `wizardConverseFinish` sends the draft-cache token as `draft_token` (backend rewrites it — Task 2); `wizardLogoUpload` uses `FormData` (`token`, `kind`, `file`). Response/`ConverseTurnResponse`/`RefineResponse` types: copy from `frontend-customer/src/lib/logo/converse-api.ts` / `refine-api.ts`.

- [ ] **Step 1: Copy the modules + fix imports**

For each file in the mirror list: copy verbatim, add the MIRRORED header, run the build, and chase missing imports by mirroring the missing module (expected closure: `types/logo.ts` ← renderer/catalog/composer/migrate; `abstract-mark` ← renderer; nothing from the studio EDITOR should be needed). Do NOT mirror `converse-api.ts`, `refine-api.ts`, `library-catalog.ts`, `brand-kit.ts`, `studio-session.ts`, `history.ts`, `curated-preview.ts` — the wizard doesn't use them. In the mirrored `export.ts`, delete `uploadPng` (tenant-API coupled) — keep `svgToPngBlob` + `imageToDataUrl`.

- [ ] **Step 2: Write logo-api.ts**

Implement the interface above with the same `request()` idiom as `lib/wizard/api.ts`, endpoints:
`/api/v1/onboarding/wizard/logo-status/`, `.../wizard/logo-converse/`, `.../wizard/logo-converse/finish/`, `.../wizard/logo-refine/`, `.../wizard/logo-upload/`, `.../wizard/checkout/`. Implement `designRecipe` with the exact accessor the studio design cards use (found in Step 1).

- [ ] **Step 3: Verify build + lint**

Run: `cd frontend-main && npm run lint && npm run build`
Expected: clean; bundle compiles with the mirrored set self-contained.

- [ ] **Step 4: Commit**

```bash
git add frontend-main/src/types/logo.ts frontend-main/src/lib/logo/ frontend-main/src/components/logo/ frontend-main/src/lib/wizard/logo-api.ts
git commit -m "feat(wizard): mirror pure logo render/export modules + wizard logo API client

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: AI door UI — plan cards, checkout round-trip, lean chat

**Files:**
- Create: `frontend-main/src/app/signup/verify/wizard/ai-logo.tsx`
- Modify: `frontend-main/src/app/signup/verify/wizard/logo-review-steps.tsx` (replace the locked-teaser div with `<AiLogoDoor …/>`), `WizardFlow.tsx` (pass `upgraded` from the URL), `frontend-main/src/lib/wizard/types.ts` (`WizardLogoAnswer`: `mode: "wordmark" | "curated" | "ai"`, `recipe?: object | null`, `export_keys?: { logo: string; icon: string }`), `frontend-main/messages/{en,tr}/wizard.json`.

**Interfaces:**
- Consumes: everything from Task 7; `GET /api/v1/billing/platform/plans/` (public — same endpoint the pricing page uses); phase-1 `readWizardState` (paid poll), `patchWizardState`.
- Produces: `<AiLogoDoor token brand niche theme value onPicked(logo: WizardLogoAnswer) initialUpgraded />` with four states — `locked` (plan cards; a card click PATCHes `current_step: "logo"` then redirects to `wizardCheckout().checkout_url`), `syncing` (after `?upgraded=1`: poll `readWizardState` every 2 s for ≤ 15 s until `has_paid_platform_plan`; then chat; on timeout show "payment received — still syncing" + retry), `chat`, `picked` (design chosen; summary card + change link).
- Chat contract (lean, no studio editor): staged `icon → name → tagline` with a visible 3-dot stepper; per turn: POST converse with `{stage, message, transcript(≤12), pinned}`; if response `phase === "draft"`, render each design via `LogoRenderer` → `svgToPngBlob` → data-URLs → `wizardConverseFinish(token, draft_token, images)` and use ITS designs (self-critique pass, same as the studio); "Pick" on a design pins it for the stage and advances; after `tagline`, "Use this logo": final recipe = `designRecipe(pinnedLockup)` → render lockup PNG (`svgToPngBlob`, 1024 px wide) + square icon PNG (512 px, mark-only render) → `wizardLogoUpload` both → `onPicked({mode: "ai", curated_id: null, recipe, export_keys})`.
- i18n additions (EN values; TR mirrors, native review caveat): `wizard.upgrade.title` "Unlock AI logo design", `wizard.upgrade.subtitle` "Pick a plan — you keep it after launch.", `wizard.upgrade.cta` "Continue to payment", `wizard.upgrade.syncing` "Payment received — unlocking…", `wizard.upgrade.syncSlow` "Still syncing your payment. Give it a few seconds and retry.", `wizard.upgrade.retry` "Retry", `wizard.aiChat.placeholder` "Describe your logo idea…", `wizard.aiChat.send` "Generate", `wizard.aiChat.pick` "Pick this", `wizard.aiChat.useThis` "Use this logo", `wizard.aiChat.change` "Design a different one", `wizard.aiChat.stages.icon` "Mark", `wizard.aiChat.stages.name` "Lockup", `wizard.aiChat.stages.tagline` "Tagline", `wizard.aiChat.thinking` "Designing…", `wizard.aiChat.quota` "Monthly design limit reached — you can continue in the Logo Studio after launch.".

- [ ] **Step 1: Implement ai-logo.tsx**

Structure (implement fully; rendering idioms from `steps.tsx`, chat bubbles minimal):

```tsx
"use client";
// States: "loading" -> ("locked" | "syncing" | "chat") -> "picked".
// locked: fetch /api/v1/billing/platform/plans/, render non-free plans as
//   OptionCards with monthly price; click => patchWizardState(token,
//   {current_step: "logo"}) then window.location.assign(
//   (await wizardCheckout(token, plan.id)).checkout_url).
// syncing (initialUpgraded): poll readWizardState every 2s up to 15s;
//   has_paid_platform_plan -> "chat"; timeout -> syncSlow + retry button.
// chat: staged icon/name/tagline; transcript in local state; converse ->
//   (optional finish with rendered PNGs when phase === "draft") -> design
//   cards via <LogoRenderer recipe={designRecipe(d)} />; Pick pins + advances;
//   quota/disabled/upgrade_required sources -> inline notices (aiChat.quota / common.errors.generic).
// picked: preview card + "change" resets to chat. Calls onPicked(...) once
//   uploads succeed; upload failure keeps state "chat" with generic error.
```

Write the full component (~250 lines) following that structure — every state renders, no dead props; reuse `OptionCard`/`SlideHeader`. Wire `logo-review-steps.tsx`: replace the dashed locked box with

```tsx
<AiLogoDoor
  token={token}
  brand={brand}
  niche={niche}
  theme={theme}
  value={value}
  onPicked={onChange}
  initialUpgraded={initialUpgraded}
/>
```

(`LogoStep` gains `token` + `initialUpgraded` props; `WizardFlow` reads `useSearchParams().get("upgraded") === "1"` and passes it down; the `upgraded=0` cancel return needs no special handling — the resume lands on the logo step with the free doors intact.)

- [ ] **Step 2: Verify build + lint + parity**

Run: `node scripts/check-i18n-parity.mjs && cd frontend-main && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 3: Manual smoke (bypass provider)**

Set `BILLING_BYPASS_ENABLED=true` in `.env`, `make dev`. Walk the wizard to the logo step → AI door shows plan cards → pick one → instantly returns via `?upgraded=1` → chat unlocks (with `AI_PROVIDER=cli` a real design turn takes ~30–60 s — acceptable for the smoke) → pick through the stages → "Use this logo" → review shows AI logo → create → tenant header shows the uploaded lockup, `/admin/design` studio loads the recipe.

- [ ] **Step 4: Commit**

```bash
git add frontend-main/src/app/signup/verify/wizard/ frontend-main/src/lib/wizard/types.ts frontend-main/messages/en/wizard.json frontend-main/messages/tr/wizard.json
git commit -m "feat(wizard): AI logo door — plan cards, checkout round-trip, staged chat

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: E2E + verification sweep

**Files:**
- Modify: `e2e/specs/01-signup-onboarding.spec.ts` (locked-door assertion)
- Create: `e2e/specs/23-wizard-ai-logo.spec.ts`

- [ ] **Step 1: Locked-door assertion in the default suite**

In the full-walk test of `01-signup-onboarding.spec.ts`, at the logo step (before its `clickContinue`), add:

```ts
  // AI door present but gated for free signups.
  await expect(page.getByText(W.upgrade.title)).toBeVisible();
```

(adjust to the rendered locked-state title — with checkout live, the locked teaser becomes the upgrade card list header).

- [ ] **Step 2: Bypass paid-path spec**

Create `e2e/specs/23-wizard-ai-logo.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { latestEmail, firstLink } from "../helpers/email";
import en from "../../frontend-main/messages/en/auth.json";
import wizardMessages from "../../frontend-main/messages/en/wizard.json";

const W = wizardMessages.wizard;
const stamp = Date.now();

// Needs BILLING_BYPASS_ENABLED=true in the stack (offline instant
// subscriptions). Skipped otherwise — mirrors how Stripe specs gate.
test.skip(
  process.env.E2E_BILLING_BYPASS !== "1",
  "set E2E_BILLING_BYPASS=1 (and BILLING_BYPASS_ENABLED=true in .env) to run",
);

test("AI logo door unlocks through bypass checkout", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("http://localhost/signup");
  await page.getByPlaceholder(en.signup.brandNamePlaceholder).fill(`E2E Studio ${stamp}ai`);
  await page.getByPlaceholder(en.signup.namePlaceholder).fill("E2E Coach");
  await page.getByPlaceholder(en.signup.emailPlaceholder).fill(`e2e-coach-${stamp}ai@example.com`);
  await page.getByRole("button", { name: en.signup.submit }).click();
  const mail = await latestEmail(`e2e-coach-${stamp}ai@example.com`);
  await page.goto(firstLink(mail.html));

  await page.getByRole("button", { name: W.niches.general.label }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: W.common.continue, exact: true }).click(); // niche
  await page.getByRole("button", { name: W.common.continue, exact: true }).click(); // describe
  await page.getByRole("button", { name: W.common.continue, exact: true }).click(); // goals
  await page.getByRole("button", { name: W.common.finishRest }).click();            // -> logo

  await expect(page.getByText(W.upgrade.title)).toBeVisible({ timeout: 10_000 });
  // Bypass provider: the "checkout" click activates the subscription and
  // bounces straight back to /signup/verify?upgraded=1.
  await page.getByRole("button", { name: W.upgrade.cta }).first().click();
  await expect(page.getByPlaceholder(W.aiChat.placeholder)).toBeVisible({ timeout: 30_000 });
});
```

- [ ] **Step 3: Full sweep**

1. `make test-fresh` → 0 failures (no new migrations, but the suite grew).
2. `make lint && cd frontend-main && npm run lint && npm run build && cd ..` → green, parity 0 drift.
3. Default e2e (bypass OFF, `ONBOARDING_AI_ENABLED=false` per phase 2): `make e2e` → all green incl. the locked-door assertion; spec 23 self-skips.
4. Paid-path e2e: `BILLING_BYPASS_ENABLED=true` in `.env`, restart, `E2E_BILLING_BYPASS=1 npx playwright test specs/23-wizard-ai-logo.spec.ts` (from `e2e/`) → passes.
5. Manual: the Task-8 Step-3 bypass click-through EN + TR; then one REAL Stripe test-mode wizard checkout (`BILLING_BYPASS_ENABLED=false`, `make stripe-listen` running): card `4242…` → webhook attaches the subscription pre-provision → chat unlocks; finish the wizard and confirm the provisioned tenant shows the AI logo (header + PWA icon) and the Logo Studio opens the recipe for further editing.
6. Report with evidence. No push/deploy — owner handles that. This completes the spec's phased scope; phase 4 (drop-off recovery email, funnel surfacing, IP hardening) remains optional follow-up, unplanned by design.
