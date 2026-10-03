# Onboarding Wizard — Phase 4 (funnel hardening) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover wizard drop-offs and harden the funnel: a one-time recovery email (re-minted 7-day wizard token) for coaches who verified but abandoned mid-wizard, an expired-token "resume" screen that re-sends the link on demand, a read-only Wizard Funnel view in the superadmin (per-step timestamps already stored by phase 1), and the AI IP-blocklist + per-IP throttles applied to the public wizard AI endpoints.

**Spec:** `docs/superpowers/specs/2026-07-13-onboarding-wizard-design.md` §6 phase 4 + §4 error-handling row "Wizard token expired". Phases 1–3 are implemented and on local main (verify endpoints exist before starting: `backend/apps/core/onboarding/{wizard.py, wizard_logo.py, recovery module is NEW}`).

**Architecture:** New `backend/apps/core/onboarding/recovery.py` owns everything recovery: candidate selection (pending tenants idle ≥24 h, ≤7 days old, never nudged), the bilingual email (fresh `create_wizard_token`, link to `/signup/verify?token=…`), and the public `wizard/recover/` endpoint that accepts **expired-but-signature-valid** wizard/signup tokens and re-sends the link — always and only to `tenant.owner_email`. A `Tenant.recovery_email_sent_at` column (not JSON) makes "never nudged" a cheap SQL filter and dodges wizard_state write races. An hourly Celery-beat task sends the automated nudge. `creator_signup_verify` + `onboarding_handoff` switch to the wizard-token verifier (accepts both purposes) so recovery links flow through the existing verify page unchanged. Superadmin gets a second, read-only adminkit registration of `Tenant` (`key="wizard-funnel"`) with computed columns from `wizard_state`. Wizard AI endpoints get `ipblock.blocked_response` + a `ClientIpAnonThrottle` scope, closing the loop with the existing auto-block machinery.

**Tech Stack:** Django 5.1 + DRF + Celery beat (backend), adminkit (superadmin SPA — backend registration only, no frontend work), Next.js 14 App Router + next-intl (frontend-main), Playwright (e2e), pytest in docker.

## Global Constraints

- All commands from repo root `~/ws/projects-active/home-server/contentor`; backend tests run **inside** the container: `docker compose exec django pytest <path> -v` (suite: `make test`; after ANY new migration: run the touched test file with `--create-db` once, then `make test-fresh` before claiming the suite green).
- Public/anon endpoints MUST set `@authentication_classes([])` — `AllowAny` alone is not enough (project rule).
- Recovery emails go ONLY to `tenant.owner_email` — never to any caller-supplied address; the recover endpoint takes a token, not an email.
- The recover endpoint accepts **expired** tokens but NEVER unsigned/tampered ones: decode always verifies the HS256 signature; only `exp` is skipped.
- `make lint` must pass with zero errors/warnings. Pre-commit does NOT lint the frontends — run `cd frontend-main && npm run lint && npm run build` explicitly where a task touches it.
- EN and TR message catalogs must stay key-identical (`node scripts/check-i18n-parity.mjs`). TR strings need native review (note in commit).
- Existing endpoints and their behavior stay working: `seed-from-template/`, `skip-template/`, signup-token acceptance everywhere it works today.
- Commit after each task (this SDD flow is the explicitly-approved exception to the repo's "never commit unless asked" rule). Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure (phase 4)

Backend — create:
- `backend/apps/core/onboarding/recovery.py` — recovery candidates, email builder/sender, `wizard_recover` view.
- `backend/apps/core/tests/test_wizard_recovery.py` — field default, candidates, send, beat task, recover endpoint, throttle.
- `backend/apps/core/tests/test_wizard_funnel_admin.py` — funnel registration through the adminkit HTTP contract.

Backend — modify:
- `backend/apps/core/models.py` (+migration: `Tenant.recovery_email_sent_at`).
- `backend/config/settings/base.py` (`WIZARD_RECOVERY_*` knobs + 2 throttle rates).
- `backend/apps/accounts/tokens.py` (`decode_wizard_token_allow_expired`) + `backend/apps/accounts/tests/test_wizard_token.py`.
- `backend/apps/core/throttling.py` (`WizardLogoThrottle`, `WizardRecoverThrottle`).
- `backend/apps/core/onboarding/views.py` (verify + handoff accept wizard tokens).
- `backend/apps/core/onboarding/urls.py` (`wizard/recover/` route).
- `backend/apps/core/onboarding/wizard_logo.py` (ipblock + throttle on all 5 views).
- `backend/apps/core/tasks.py` (`send_wizard_recovery_emails`) + `backend/config/celery.py` (beat entry).
- `backend/apps/core/admin_panels.py` (`WizardFunnelAdmin`).
- `backend/apps/core/tests/test_ai_ip_block.py` (wizard AI endpoints covered).
- `backend/apps/core/tests/test_onboarding_handoff.py` (wizard-token acceptance).

Frontend-main — modify:
- `frontend-main/src/lib/wizard/api.ts` (`recoverWizard`).
- `frontend-main/src/app/signup/verify/page.tsx` (expired → resume screen).
- `frontend-main/src/app/signup/verify/wizard/WizardFlow.tsx` (`onTokenExpired` prop).
- `frontend-main/messages/en/wizard.json` + `frontend-main/messages/tr/wizard.json` (`resume` namespace).

E2E — create: `e2e/specs/19-wizard-recovery.spec.ts`.

---

### Task 1: `Tenant.recovery_email_sent_at` field + migration

**Files:**
- Modify: `backend/apps/core/models.py` (Tenant, directly after the `wizard_state` field, ~line 98)
- Create: migration via makemigrations (do not hand-write)
- Test: `backend/apps/core/tests/test_wizard_recovery.py` (create)

**Interfaces:**
- Produces: `Tenant.recovery_email_sent_at: DateTimeField(null=True, blank=True)` — timestamp of the LAST wizard-recovery email. `NULL` = never nudged (the beat task's cheap SQL filter); the manual recover endpoint re-stamps it on every send (1-hour cooldown key). Tasks 2, 3, 5, 7 consume it.

- [ ] **Step 1: Write the failing test**

Create `backend/apps/core/tests/test_wizard_recovery.py`:

```python
"""Wizard drop-off recovery: candidates, email send, beat task, recover endpoint."""

import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.tokens import create_wizard_token
from apps.core.models import DevOutboundEmail, Tenant

pytestmark = pytest.mark.django_db(transaction=True)

SHARED_DOMAIN = "shared-test.localhost"


@pytest.fixture(autouse=True)
def _clean_throttle_cache():
    """The recover endpoint is throttled 5/hour per IP and the throttle
    bucket lives in the shared cache — without this, the module's earlier
    endpoint tests exhaust the default 127.0.0.1 bucket and later ones 429."""
    from django.core.cache import cache

    cache.clear()
    yield


def _client(**extra):
    return APIClient(HTTP_HOST=SHARED_DOMAIN, **extra)


def _token(email="coach@x.com", brand="Rec Studio", region="global"):
    return create_wizard_token(email, "Coach", brand, region=region)


def _make_tenant(schema, name, slug, **overrides):
    """Row-only tenant (no schema): recovery never enters the tenant schema.
    Mirrors apps/core/tests/test_onboarding_handoff.py."""
    connection.set_schema_to_public()
    original = Tenant.auto_create_schema
    Tenant.auto_create_schema = False
    try:
        t, _ = Tenant.objects.get_or_create(
            schema_name=schema,
            defaults={"name": name, "slug": slug, "subdomain": slug, "owner_email": "coach@x.com"},
        )
        t.provisioning_status = overrides.pop("provisioning_status", "pending")
        t.template_seed_status = overrides.pop("template_seed_status", "pending")
        t.wizard_state = overrides.pop("wizard_state", {})
        t.recovery_email_sent_at = overrides.pop("recovery_email_sent_at", None)
        for field, value in overrides.items():
            setattr(t, field, value)
        t.save()
    finally:
        Tenant.auto_create_schema = original
    return t


@pytest.fixture()
def tenant(restore_public):
    t = _make_tenant("rec_studio", "Rec Studio", "rec-studio")
    yield t
    connection.set_schema_to_public()
    DevOutboundEmail.objects.filter(to="coach@x.com").delete()
    Tenant.objects.filter(schema_name="rec_studio").delete()


def test_recovery_email_sent_at_defaults_to_null(tenant):
    tenant.refresh_from_db()
    assert tenant.recovery_email_sent_at is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_recovery.py -v`
Expected: FAIL — `AttributeError`/`FieldError`: Tenant has no field `recovery_email_sent_at`.

- [ ] **Step 3: Add the field + generate the migration**

In `backend/apps/core/models.py`, inside `Tenant`, directly after the `wizard_state` field, add:

```python
    recovery_email_sent_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=(
            "Last wizard drop-off recovery email. NULL = never nudged; the "
            "hourly beat task sends at most one per tenant (filters on NULL), "
            "the manual recover endpoint re-stamps on every re-send."
        ),
    )
```

Then generate + apply the migration:

```bash
docker compose exec django python manage.py makemigrations core
make migrate-shared
```

Expected: one new file `backend/apps/core/migrations/00XX_tenant_recovery_email_sent_at.py` (AddField only).

- [ ] **Step 4: Run test to verify it passes (fresh test DB — new migration)**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_recovery.py -v --create-db`
Expected: 1 PASS. (Subsequent tasks can drop `--create-db`; the rebuilt test DB is reused.)

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/models.py backend/apps/core/migrations/ backend/apps/core/tests/test_wizard_recovery.py
git commit -m "feat(onboarding): Tenant.recovery_email_sent_at for wizard drop-off nudges

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `recovery.py` — candidate selection + recovery email

**Files:**
- Create: `backend/apps/core/onboarding/recovery.py`
- Modify: `backend/config/settings/base.py` (directly under `WIZARD_TOKEN_EXPIRY_DAYS = 7`)
- Test: `backend/apps/core/tests/test_wizard_recovery.py` (extend)

**Interfaces:**
- Consumes: `Tenant.recovery_email_sent_at` (Task 1), `Tenant.wizard_state["step_timestamps"]` (phase 1 — ISO strings from `timezone.now().isoformat()`), `create_wizard_token` (phase 1), `apps.core.email.send_email`, settings `CONTENTOR_DOMAIN` / `SITE_SCHEME`.
- Produces (Tasks 3 and 5 call these):
  - `recovery_candidates(now=None) -> list[Tenant]` — pending, never-nudged, idle ≥ `WIZARD_RECOVERY_IDLE_HOURS`, created within `WIZARD_RECOVERY_MAX_AGE_DAYS`.
  - `send_recovery_email(tenant) -> bool` — mints a fresh wizard token, emails the resume link to `tenant.owner_email`, stamps `recovery_email_sent_at` on success.
  - Settings: `WIZARD_RECOVERY_IDLE_HOURS = 24`, `WIZARD_RECOVERY_MAX_AGE_DAYS = 7`.
- Email copy lives here (tenant-facing content, EN/TR by region — same convention as the signup email in `views.py`; TR needs native review).

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/core/tests/test_wizard_recovery.py`:

```python
from datetime import timedelta

from django.utils import timezone

from apps.accounts.tokens import verify_wizard_token
from apps.core.onboarding import recovery


def _age(tenant, *, hours=0, days=0):
    """Backdate created_at (auto_now_add ignores assignment on create)."""
    Tenant.objects.filter(pk=tenant.pk).update(created_at=timezone.now() - timedelta(hours=hours, days=days))
    tenant.refresh_from_db()


def test_candidates_pick_only_idle_pending_tenants(tenant):
    _age(tenant, hours=30)
    assert tenant in recovery.recovery_candidates()

    fresh = _make_tenant("rec_fresh", "Rec Fresh", "rec-fresh")
    assert fresh not in recovery.recovery_candidates()  # < 24h old
    Tenant.objects.filter(schema_name="rec_fresh").delete()


def test_recent_step_activity_excludes_despite_old_signup(tenant):
    _age(tenant, days=3)
    tenant.wizard_state = {"step_timestamps": {"theme": timezone.now().isoformat()}}
    tenant.save(update_fields=["wizard_state"])
    assert tenant not in recovery.recovery_candidates()


@pytest.mark.parametrize(
    "overrides",
    [
        {"recovery_email_sent_at": "SENTINEL_NOW"},           # already nudged
        {"template_seed_status": "seeding"},                   # finalized
        {"template_seed_status": "ready"},
        {"template_seed_status": "skipped"},
        {"provisioning_status": "ready"},
        {"is_demo": True},
    ],
)
def test_candidates_exclusions(tenant, overrides):
    _age(tenant, hours=30)
    for field, value in overrides.items():
        setattr(tenant, field, timezone.now() if value == "SENTINEL_NOW" else value)
    tenant.save()
    assert tenant not in recovery.recovery_candidates()


def test_too_old_signups_never_nudged(tenant):
    _age(tenant, days=8)
    assert tenant not in recovery.recovery_candidates()


def test_send_recovery_email_links_a_fresh_wizard_token(tenant, settings):
    settings.EMAIL_SINK_ENABLED = True
    settings.SITE_SCHEME = "https"
    assert recovery.send_recovery_email(tenant) is True

    mail = DevOutboundEmail.objects.filter(to="coach@x.com").latest("id")
    assert f"https://{settings.CONTENTOR_DOMAIN}/signup/verify?token=" in mail.html
    token = mail.html.split("/signup/verify?token=")[1].split('"')[0]
    assert verify_wizard_token(token)["purpose"] == "wizard"
    assert verify_wizard_token(token)["email"] == "coach@x.com"

    tenant.refresh_from_db()
    assert tenant.recovery_email_sent_at is not None


def test_send_recovery_email_tr_region_uses_tr_host_and_copy(restore_public, settings):
    settings.EMAIL_SINK_ENABLED = True
    settings.SITE_SCHEME = "https"
    t = _make_tenant("tr_rec_studio", "Rec Studio TR", "rec-studio-tr", region="tr")
    try:
        assert recovery.send_recovery_email(t) is True
        mail = DevOutboundEmail.objects.filter(to="coach@x.com").latest("id")
        assert f"https://tr.{settings.CONTENTOR_DOMAIN}/signup/verify?token=" in mail.html
        assert "Kald" in mail.subject  # "Kaldığınız yerden devam edin"
    finally:
        connection.set_schema_to_public()
        DevOutboundEmail.objects.filter(to="coach@x.com").delete()
        Tenant.objects.filter(schema_name="tr_rec_studio").delete()


def test_send_recovery_email_refuses_renamed_tenant(tenant, settings):
    settings.EMAIL_SINK_ENABLED = True
    # Superadmin can rename a tenant; the token's brand_name must still
    # slugify back to the tenant slug or the resume link dead-ends.
    tenant.name = "Totally Different Name"
    tenant.save(update_fields=["name"])
    assert recovery.send_recovery_email(tenant) is False
    tenant.refresh_from_db()
    assert tenant.recovery_email_sent_at is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_recovery.py -v`
Expected: new tests FAIL — `ModuleNotFoundError: No module named 'apps.core.onboarding.recovery'`; the Task-1 default test still passes.

- [ ] **Step 3: Implement recovery.py + settings**

In `backend/config/settings/base.py`, directly under `WIZARD_TOKEN_EXPIRY_DAYS = 7`, add:

```python
WIZARD_RECOVERY_IDLE_HOURS = 24  # drop-off nudge: wizard idle at least this long
WIZARD_RECOVERY_MAX_AGE_DAYS = 7  # never nudge signups older than this
```

Create `backend/apps/core/onboarding/recovery.py`:

```python
"""Drop-off recovery for the pre-provision onboarding wizard.

A coach who verified email but abandoned the wizard gets ONE automated
nudge (hourly beat task, Task 3) with a freshly-minted 7-day wizard token —
their answers are already server-side, so the link resumes exactly where
they left off. The same email can be re-requested from the expired-token
resume screen via the wizard_recover view (Task 5).

Every email goes to tenant.owner_email and nowhere else. The email strings
are tenant-facing content, not UI chrome — same convention as the signup
verification email in views.py. TR needs native review.
"""

import logging
from datetime import datetime, timedelta

from django.conf import settings
from django.utils import timezone
from django.utils.text import slugify

logger = logging.getLogger(__name__)

# Manual re-sends (resume screen) are allowed at most once per hour per
# tenant — the per-IP throttle alone would let a third party replay an old
# token to spam the OWNER's inbox from many IPs.
RESEND_COOLDOWN = timedelta(hours=1)

# TR: needs native review.
_COPY = {
    "en": {
        "subject": "Pick up where you left off — {brand}",
        "heading": "Your platform is waiting",
        "intro": (
            "You started setting up <strong>{brand}</strong> — every choice you made is saved. "
            "Click below to continue right where you left off."
        ),
        "button": "Continue my setup",
        "expires": "This link is valid for {days} days.",
        "copy_label": "Or copy:",
    },
    "tr": {
        "subject": "Kaldığınız yerden devam edin — {brand}",
        "heading": "Platformunuz sizi bekliyor",
        "intro": (
            "<strong>{brand}</strong> platformunu kurmaya başlamıştınız — yaptığınız her seçim kayıtlı. "
            "Kaldığınız yerden devam etmek için aşağıdaki düğmeye tıklayın."
        ),
        "button": "Kuruluma devam et",
        "expires": "Bu bağlantı {days} gün geçerlidir.",
        "copy_label": "Veya kopyalayın:",
    },
}


def _last_activity(tenant):
    """Most recent wizard step save, falling back to signup time."""
    stamps = (tenant.wizard_state or {}).get("step_timestamps") or {}
    latest = tenant.created_at
    for value in stamps.values():
        try:
            parsed = datetime.fromisoformat(value)
        except (TypeError, ValueError):
            continue
        if parsed > latest:
            latest = parsed
    return latest


def recovery_candidates(now=None):
    """Tenants worth one automated nudge: mid-wizard, idle, never nudged.

    SQL prefilters on the cheap columns; the idle check refines in Python
    against step_timestamps (a handful of rows/day — never a hot path).
    """
    from apps.core.models import Tenant

    now = now or timezone.now()
    idle_cutoff = now - timedelta(hours=settings.WIZARD_RECOVERY_IDLE_HOURS)
    oldest = now - timedelta(days=settings.WIZARD_RECOVERY_MAX_AGE_DAYS)

    prefiltered = (
        Tenant.objects.filter(
            provisioning_status="pending",
            template_seed_status="pending",
            recovery_email_sent_at__isnull=True,
            is_demo=False,
            created_at__gte=oldest,
            created_at__lt=idle_cutoff,
        )
        .exclude(schema_name="public")
        .order_by("created_at")
    )
    return [t for t in prefiltered if _last_activity(t) < idle_cutoff]


def send_recovery_email(tenant) -> bool:
    """Mint a fresh wizard token and email the resume link to the owner.

    Stamps recovery_email_sent_at only when the send succeeded, so a failed
    provider call is retried by the next beat run.
    """
    from apps.accounts.models import User
    from apps.accounts.tokens import create_wizard_token
    from apps.core.email import send_email

    # The wizard resolver looks tenants up by slugified token brand_name —
    # a superadmin rename would mint a link that resolves to nothing (or,
    # worse, to a different tenant). Refuse instead of sending a dead link.
    if slugify(tenant.name)[:63] != tenant.slug:
        logger.warning("wizard recovery: name/slug drift for %s, skipping", tenant.slug)
        return False

    region = tenant.region or "global"
    user = User.objects.filter(email=tenant.owner_email, region=region).first()
    token = create_wizard_token(tenant.owner_email, user.name if user else "", tenant.name, region=region)

    base = settings.CONTENTOR_DOMAIN
    host = f"tr.{base}" if region == "tr" else base
    link = f"{settings.SITE_SCHEME}://{host}/signup/verify?token={token}"

    strings = _COPY["tr" if region == "tr" else "en"]
    brand = tenant.name
    days = settings.WIZARD_TOKEN_EXPIRY_DAYS
    sent = send_email(
        to=tenant.owner_email,
        subject=strings["subject"].format(brand=brand),
        html=f"""
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
            <h2 style="color: #1a1a2e;">{strings["heading"]}</h2>
            <p style="color: #444;">{strings["intro"].format(brand=brand)}</p>
            <a href="{link}"
               style="display: inline-block; background: #171717; color: white; padding: 12px 32px;
                      border-radius: 6px; text-decoration: none; font-weight: 600; margin: 24px 0;">
                {strings["button"]}
            </a>
            <p style="color: #888; font-size: 13px;">{strings["expires"].format(days=days)}</p>
            <p style="color: #aaa; font-size: 12px; margin-top: 32px;">
                {strings["copy_label"]} <span style="word-break: break-all;">{link}</span>
            </p>
        </div>
        """,
    )
    if sent:
        tenant.recovery_email_sent_at = timezone.now()
        tenant.save(update_fields=["recovery_email_sent_at"])
        logger.info("wizard recovery email sent slug=%s", tenant.slug)
    else:
        logger.error("wizard recovery email FAILED slug=%s (link withheld from logs)", tenant.slug)
    return sent
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_recovery.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/onboarding/recovery.py backend/config/settings/base.py backend/apps/core/tests/test_wizard_recovery.py
git commit -m "feat(onboarding): wizard drop-off recovery email module

TR copy needs native review.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Hourly beat task `send_wizard_recovery_emails`

**Files:**
- Modify: `backend/apps/core/tasks.py` (append at module end, after `purge_ai_transcripts`)
- Modify: `backend/config/celery.py` (beat_schedule)
- Test: `backend/apps/core/tests/test_wizard_recovery.py` (extend)

**Interfaces:**
- Consumes: `recovery.recovery_candidates()` + `recovery.send_recovery_email()` (Task 2).
- Produces: `apps.core.tasks.send_wizard_recovery_emails` (shared_task, returns int sent count), scheduled hourly at minute 25.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/core/tests/test_wizard_recovery.py`:

```python
def test_beat_task_sends_once_and_only_once(tenant, settings):
    settings.EMAIL_SINK_ENABLED = True
    _age(tenant, hours=30)

    from apps.core.tasks import send_wizard_recovery_emails

    assert send_wizard_recovery_emails() == 1
    assert send_wizard_recovery_emails() == 0  # stamped -> not a candidate anymore
    assert DevOutboundEmail.objects.filter(to="coach@x.com").count() == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_recovery.py::test_beat_task_sends_once_and_only_once -v`
Expected: FAIL — `ImportError: cannot import name 'send_wizard_recovery_emails'`.

- [ ] **Step 3: Implement the task + beat entry**

Append to `backend/apps/core/tasks.py`:

```python
@shared_task
def send_wizard_recovery_emails():
    """Hourly beat: one nudge to coaches who abandoned the signup wizard."""
    from apps.core.onboarding import recovery

    sent = 0
    for tenant in recovery.recovery_candidates():
        if recovery.send_recovery_email(tenant):
            sent += 1
    if sent:
        logger.info("wizard recovery: sent %d email(s)", sent)
    return sent
```

In `backend/config/celery.py`, add to `app.conf.beat_schedule` (after `purge-ai-transcripts`):

```python
    "send-wizard-recovery-emails": {
        "task": "apps.core.tasks.send_wizard_recovery_emails",
        "schedule": crontab(minute="25"),
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_recovery.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/tasks.py backend/config/celery.py backend/apps/core/tests/test_wizard_recovery.py
git commit -m "feat(onboarding): hourly beat task nudges abandoned wizards once

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Verify + handoff accept wizard tokens

The spec (§3.2) requires `creator_signup_verify` and `onboarding_handoff` to accept both token purposes; phases 1–3 left them signup-only. This is also what makes recovery links work: the emailed link hits `/signup/verify?token=<wizard token>` and must flow through the normal verify → wizard resume path, and the one-click login handoff at the end of a recovered session holds a wizard token.

**Files:**
- Modify: `backend/apps/core/onboarding/views.py` (`creator_signup_verify` ~line 159-164, `onboarding_handoff` ~line 330)
- Test: `backend/apps/core/tests/test_onboarding_handoff.py` (extend)

**Interfaces:**
- Consumes: `verify_wizard_token` (accepts purposes `wizard` AND `signup` — phase 1), `_resolve_tenant_from_wizard_token` (phase 1, in `wizard.py`).
- Produces: `POST /onboarding/signup/verify/` and `POST /onboarding/handoff/` accept wizard tokens; behavior for signup tokens is byte-identical. Recovery links (Task 5/6) and post-recovery one-click login depend on this.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/core/tests/test_onboarding_handoff.py`:

```python
def test_handoff_accepts_wizard_token(tenant, settings):
    from apps.accounts.tokens import create_wizard_token

    settings.SITE_SCHEME = "https"
    wizard = create_wizard_token("coach@x.com", "Coach", "Glow Studio")
    resp = _client().post("/api/v1/onboarding/handoff/", {"token": wizard}, format="json")
    assert resp.status_code == 200, resp.content
    assert "/callback?token=" in resp.json()["login_url"]


def test_verify_accepts_wizard_token_for_existing_tenant(tenant):
    from apps.accounts.tokens import create_wizard_token, verify_wizard_token

    wizard = create_wizard_token("coach@x.com", "Coach", "Glow Studio")
    resp = _client().post("/api/v1/onboarding/signup/verify/", {"token": wizard}, format="json")
    assert resp.status_code == 200, resp.content
    data = resp.json()
    assert data["slug"] == "glow-studio"
    # Every verify re-mints a fresh 7-day wizard token — resume never starves.
    assert verify_wizard_token(data["wizard_token"])["purpose"] == "wizard"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_onboarding_handoff.py -v`
Expected: the 2 new tests FAIL with 400 (`Invalid token purpose`); existing tests pass.

- [ ] **Step 3: Switch both endpoints to the wizard-token verifier**

In `backend/apps/core/onboarding/views.py` → `creator_signup_verify`, replace:

```python
    from apps.accounts.tokens import verify_signup_token

    try:
        payload = verify_signup_token(token)
```

with:

```python
    # verify_wizard_token accepts BOTH purposes (signup + wizard), so the
    # 15-minute email link and the 7-day resume/recovery links all land here.
    from apps.accounts.tokens import verify_wizard_token

    try:
        payload = verify_wizard_token(token)
```

In the same file → `onboarding_handoff`, replace:

```python
    payload, tenant, err = _resolve_tenant_from_signup_token(request)
```

with:

```python
    from .wizard import _resolve_tenant_from_wizard_token

    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
```

(`seed_from_template` / `skip_template` deliberately stay on the signup resolver — legacy endpoints, unchanged behavior.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_onboarding_handoff.py apps/core/tests/test_wizard_state_endpoints.py -v`
Expected: all PASS (state-endpoint suite proves the shared wizard flow is untouched).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/onboarding/views.py backend/apps/core/tests/test_onboarding_handoff.py
git commit -m "feat(onboarding): verify + handoff accept 7-day wizard tokens

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: `wizard/recover/` endpoint (expired-token tolerant)

**Files:**
- Modify: `backend/apps/accounts/tokens.py` (after `verify_wizard_token`)
- Modify: `backend/apps/accounts/tests/test_wizard_token.py`
- Modify: `backend/apps/core/throttling.py`
- Modify: `backend/config/settings/base.py` (throttle rate)
- Modify: `backend/apps/core/onboarding/recovery.py` (append the view)
- Modify: `backend/apps/core/onboarding/urls.py`
- Test: `backend/apps/core/tests/test_wizard_recovery.py` (extend)

**Interfaces:**
- Consumes: `send_recovery_email` + `RESEND_COOLDOWN` (Task 2), `ipblock.blocked_response`, `ClientIpAnonThrottle`.
- Produces:
  - `decode_wizard_token_allow_expired(token: str) -> dict` in `apps/accounts/tokens.py` — signature-verified decode, `exp` skipped, purpose must be `wizard`/`signup`; raises `jwt.InvalidTokenError` otherwise.
  - `WizardRecoverThrottle` (scope `wizard_recover`, rate `5/hour`) in `apps/core/throttling.py`.
  - `POST /api/v1/onboarding/wizard/recover/` `{token}` → 200 `{"detail": "sent"}` (also when suppressed by the 1-hour cooldown); 400 bad/missing token; 404 tenant gone; 403 owner mismatch / blocked IP; 409 `{"detail": "wizard_closed"}` once finalized/provisioned; 429 throttled. Task 6's frontend consumes these exact statuses.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/accounts/tests/test_wizard_token.py`:

```python
def test_decode_allow_expired_reads_expired_wizard_token(settings):
    from apps.accounts.tokens import decode_wizard_token_allow_expired

    settings.WIZARD_TOKEN_EXPIRY_DAYS = -1
    token = create_wizard_token("a@b.com", "Coach", "Glow Studio")
    with pytest.raises(pyjwt.ExpiredSignatureError):
        verify_wizard_token(token)
    payload = decode_wizard_token_allow_expired(token)
    assert payload["email"] == "a@b.com"
    assert payload["brand_name"] == "Glow Studio"


def test_decode_allow_expired_still_verifies_signature_and_purpose():
    from apps.accounts.tokens import decode_wizard_token_allow_expired

    with pytest.raises(pyjwt.InvalidTokenError):
        decode_wizard_token_allow_expired("garbage")
    forged = pyjwt.encode({"email": "a@b.com", "purpose": "magic_link"}, "wrong-key", algorithm="HS256")
    with pytest.raises(pyjwt.InvalidTokenError):
        decode_wizard_token_allow_expired(forged)
    bad_purpose = pyjwt.encode(
        {"email": "a@b.com", "purpose": "magic_link"}, dj_settings.SECRET_KEY, algorithm="HS256"
    )
    with pytest.raises(pyjwt.InvalidTokenError):
        decode_wizard_token_allow_expired(bad_purpose)
```

Append to `backend/apps/core/tests/test_wizard_recovery.py`:

```python
RECOVER_URL = "/api/v1/onboarding/wizard/recover/"


def _recover(token, **client_kwargs):
    return _client(**client_kwargs).post(RECOVER_URL, {"token": token}, format="json")


def test_recover_sends_with_valid_token(tenant, settings):
    settings.EMAIL_SINK_ENABLED = True
    resp = _recover(_token())
    assert resp.status_code == 200, resp.content
    assert resp.json()["detail"] == "sent"
    assert DevOutboundEmail.objects.filter(to="coach@x.com").count() == 1
    tenant.refresh_from_db()
    assert tenant.recovery_email_sent_at is not None


def test_recover_accepts_expired_token(tenant, settings):
    settings.EMAIL_SINK_ENABLED = True
    settings.WIZARD_TOKEN_EXPIRY_DAYS = -1
    expired = _token()
    settings.WIZARD_TOKEN_EXPIRY_DAYS = 7  # fresh token in the email must be valid
    resp = _recover(expired)
    assert resp.status_code == 200, resp.content
    mail = DevOutboundEmail.objects.filter(to="coach@x.com").latest("id")
    new_token = mail.html.split("/signup/verify?token=")[1].split('"')[0]
    assert verify_wizard_token(new_token)["purpose"] == "wizard"


def test_recover_cooldown_suppresses_second_send(tenant, settings):
    settings.EMAIL_SINK_ENABLED = True
    assert _recover(_token()).status_code == 200
    assert _recover(_token()).status_code == 200  # still "sent" — idempotent UX
    assert DevOutboundEmail.objects.filter(to="coach@x.com").count() == 1


def test_recover_rejects_garbage_and_wrong_owner(tenant):
    assert _recover("garbage").status_code == 400
    assert _recover(_token(email="mallory@x.com")).status_code == 403


def test_recover_404_when_tenant_gone(restore_public):
    connection.set_schema_to_public()
    assert _recover(_token(brand="Never Existed")).status_code == 404


def test_recover_409_once_wizard_closed(tenant):
    tenant.template_seed_status = "seeding"
    tenant.save(update_fields=["template_seed_status"])
    resp = _recover(_token())
    assert resp.status_code == 409
    assert resp.json()["detail"] == "wizard_closed"


def test_recover_is_throttled_per_ip(tenant, settings):
    # Sink off: we only care about the 429, not the email rows.
    settings.EMAIL_SINK_ENABLED = False
    settings.RESEND_API_KEY = ""
    statuses = [
        _recover("garbage", REMOTE_ADDR="9.9.9.1").status_code for _ in range(6)
    ]
    assert 429 in statuses, statuses
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/accounts/tests/test_wizard_token.py apps/core/tests/test_wizard_recovery.py -v`
Expected: new token tests FAIL (`ImportError: decode_wizard_token_allow_expired`), recover tests FAIL with 404 (unrouted); earlier tests pass.

- [ ] **Step 3: Implement decode helper, throttle, view, route**

In `backend/apps/accounts/tokens.py`, directly after `verify_wizard_token`, add:

```python
def decode_wizard_token_allow_expired(token: str) -> dict:
    """Signature-verified decode that tolerates expiry — recovery only.

    An expired wizard/signup token still proves the bearer once held a
    legitimate email link. Recovery uses the claims to re-send a FRESH link
    to the tenant owner's email (never to the caller), so skipping only the
    exp check is safe. The HS256 signature is always enforced.
    """
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"], options={"verify_exp": False})
    if payload.get("purpose") not in ("wizard", "signup"):
        raise jwt.InvalidTokenError("Invalid token purpose")
    return payload
```

In `backend/apps/core/throttling.py`, append:

```python
class WizardRecoverThrottle(ClientIpAnonThrottle):
    """Recovery re-send — one outbound email per call, keep it tight. Uses
    the denial-recording base so a hammering IP trips the AI auto-block."""

    scope = "wizard_recover"
```

In `backend/config/settings/base.py` → `DEFAULT_THROTTLE_RATES`, after `"signup": "5/min",` add:

```python
        # Wizard recovery re-send — one outbound email per call.
        "wizard_recover": "5/hour",
```

In `backend/apps/core/onboarding/recovery.py`, extend the imports at the TOP of the module (mid-file imports fail ruff E402). The import block becomes:

```python
import logging
from datetime import datetime, timedelta

from django.conf import settings
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core import ipblock
from apps.core.throttling import WizardRecoverThrottle
```

Then append the view at the end of the module:

```python
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([WizardRecoverThrottle])
def wizard_recover(request):
    """Resume screen: re-send a fresh wizard link to the tenant owner.

    Accepts EXPIRED (but signature-valid) wizard/signup tokens — that's the
    whole point: the 7-day link died, the answers didn't. The email always
    goes to tenant.owner_email; the caller never chooses the address.
    """
    if (denied := ipblock.blocked_response(request)) is not None:
        return denied

    from apps.accounts.tokens import decode_wizard_token_allow_expired
    from apps.core.i18n_helpers import msg
    from apps.core.models import Tenant

    token = request.data.get("token")
    if not token:
        return Response({"detail": msg(request, "token_required")}, status=400)
    try:
        payload = decode_wizard_token_allow_expired(token)
    except Exception:
        return Response({"detail": msg(request, "token_invalid_or_expired")}, status=400)

    region = payload.get("region", "global")
    slug = slugify(payload.get("brand_name") or "")[:63]
    if not slug:
        return Response({"detail": msg(request, "token_invalid_or_expired")}, status=400)
    try:
        tenant = Tenant.objects.get(slug=slug, region=region)
    except Tenant.DoesNotExist:
        return Response({"detail": msg(request, "tenant_not_found")}, status=404)
    if tenant.owner_email != payload.get("email"):
        return Response({"detail": "Token does not match tenant owner."}, status=403)
    if tenant.provisioning_status != "pending" or tenant.template_seed_status != "pending":
        return Response({"detail": "wizard_closed"}, status=409)

    if tenant.recovery_email_sent_at and timezone.now() - tenant.recovery_email_sent_at < RESEND_COOLDOWN:
        return Response({"detail": "sent"})  # cooldown: idempotent from the UI's view

    send_recovery_email(tenant)
    # Deliberately "sent" even when the provider errored — no send-failure
    # oracle for probers; failures are logged server-side.
    return Response({"detail": "sent"})
```

In `backend/apps/core/onboarding/urls.py`, add the import and route:

```python
from .recovery import wizard_recover
```

```python
    path("wizard/recover/", wizard_recover, name="wizard-recover"),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/accounts/tests/test_wizard_token.py apps/core/tests/test_wizard_recovery.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/accounts/tokens.py backend/apps/accounts/tests/test_wizard_token.py backend/apps/core/throttling.py backend/config/settings/base.py backend/apps/core/onboarding/recovery.py backend/apps/core/onboarding/urls.py backend/apps/core/tests/test_wizard_recovery.py
git commit -m "feat(onboarding): wizard/recover/ re-sends the resume link from expired tokens

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Frontend resume screen (expired token → email me a new link)

Today an expired/invalid token with no stashed localStorage token dead-ends: the error screen's "try again" goes to `/signup`, where the brand name is already taken. This task turns that into a resume screen wired to `wizard/recover/`.

**Files:**
- Modify: `frontend-main/src/lib/wizard/api.ts`
- Modify: `frontend-main/src/app/signup/verify/wizard/WizardFlow.tsx` (load catch + new prop)
- Modify: `frontend-main/src/app/signup/verify/page.tsx`
- Modify: `frontend-main/messages/en/wizard.json`, `frontend-main/messages/tr/wizard.json`

**Interfaces:**
- Consumes: `POST /api/v1/onboarding/wizard/recover/` statuses (Task 5): 200 sent, 409 wizard_closed, 400/404 dead.
- Produces: `recoverWizard(token: string): Promise<{ detail: string }>` in `api.ts`; `WizardFlow` prop `onTokenExpired: () => void`; `wizard.resume.*` message keys (EN+TR).

- [ ] **Step 1: Add the API helper**

Append to `frontend-main/src/lib/wizard/api.ts`:

```typescript
export function recoverWizard(token: string): Promise<{ detail: string }> {
  return request("/api/v1/onboarding/wizard/recover/", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}
```

- [ ] **Step 2: Route WizardFlow token failures to the resume screen**

In `frontend-main/src/app/signup/verify/wizard/WizardFlow.tsx`:

Change the component signature (line ~29):

```typescript
export function WizardFlow({
  token,
  onProvisioning,
  onTokenExpired,
}: {
  token: string;
  onProvisioning: (slug?: string) => void;
  onTokenExpired: () => void;
}) {
```

Replace the load-effect catch (line ~58):

```typescript
      .catch((err) => {
        // readWizardState's only 400 is a bad/expired token — the stashed
        // localStorage token can outlive its 7 days.
        if (err instanceof ApiError && err.status === 400) {
          onTokenExpired();
          return;
        }
        setError(t("common.errors.generic"));
      });
```

And add `onTokenExpired` to the effect's dependency array: `}, [token, onProvisioning, onTokenExpired, t]);`

- [ ] **Step 3: Add the resume screen to page.tsx**

In `frontend-main/src/app/signup/verify/page.tsx`:

1. Extend imports (line ~6 and ~10-12):

```typescript
import { CheckCircle2, Loader2, AlertCircle, Rocket, MailPlus } from "lucide-react";
```

```typescript
import { recoverWizard } from "@/lib/wizard/api";
import { ApiError } from "@/types/api";
```

2. Extend the state union and add resume state (lines ~13-18 and ~48):

```typescript
type VerifyState =
  | "verifying"
  | "wizard"
  | "provisioning"
  | "ready"
  | "expired"
  | "error";

type ResumeState = "idle" | "sending" | "sent" | "closed" | "failed";
```

```typescript
  const [resumeState, setResumeState] = useState<ResumeState>("idle");
```

3. In the verify effect's `!res.ok` branch, replace the final error fallthrough (lines ~132-134):

```typescript
          setState("expired");
          return;
```

(The `data.detail` error message is no longer shown — the resume screen supersedes it. Keep the earlier no-token branch untouched: no token at all still means the plain error screen.)

4. Leave the effect's network `.catch` untouched — a network failure is not a dead token and keeps the plain error screen.

5. Add the resend handler after `startPolling` (line ~93):

```typescript
  const resumeToken = token ?? wizardToken;
  const handleResend = useCallback(async () => {
    if (!resumeToken) return;
    setResumeState("sending");
    try {
      await recoverWizard(resumeToken);
      try {
        localStorage.removeItem("contentor_wizard_token");
      } catch {
        // storage unavailable — nothing to clear
      }
      setResumeState("sent");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setResumeState("closed");
        return;
      }
      setResumeState("failed");
    }
  }, [resumeToken]);
```

6. Pass the new prop where WizardFlow mounts (line ~200):

```typescript
      <WizardFlow
        token={wizardToken}
        onTokenExpired={() => setState("expired")}
        onProvisioning={(flowSlug) => {
```

7. Add the expired screen before the final error return (line ~254):

```tsx
  if (state === "expired") {
    if (resumeState === "sent") {
      return (
        <AuthShell
          eyebrow={tw("resume.eyebrow")}
          title={tw("resume.sentTitle")}
          subtitle={tw("resume.sentSubtitle")}
        >
          <StateIcon variant="success">
            <CheckCircle2 className="h-6 w-6" />
          </StateIcon>
        </AuthShell>
      );
    }
    if (resumeState === "closed") {
      return (
        <AuthShell
          eyebrow={tw("resume.eyebrow")}
          title={tw("resume.closedTitle")}
          subtitle={tw("resume.closedSubtitle")}
        >
          <StateIcon variant="success">
            <CheckCircle2 className="h-6 w-6" />
          </StateIcon>
          <Button asChild variant="brand" size="lg" className="mt-7 w-full">
            <a href="/login">{tw("resume.closedCta")}</a>
          </Button>
        </AuthShell>
      );
    }
    if (resumeState === "failed") {
      return (
        <AuthShell
          eyebrow={tw("resume.eyebrow")}
          title={tw("resume.title")}
          subtitle={tw("resume.failed")}
        >
          <StateIcon variant="destructive">
            <AlertCircle className="h-6 w-6" />
          </StateIcon>
          <Button asChild variant="outline" size="lg" className="mt-7 w-full">
            <a href="/signup">{tw("resume.startOver")}</a>
          </Button>
        </AuthShell>
      );
    }
    return (
      <AuthShell
        eyebrow={tw("resume.eyebrow")}
        title={tw("resume.title")}
        subtitle={tw("resume.subtitle")}
      >
        <StateIcon variant="primary">
          <MailPlus className="h-6 w-6" />
        </StateIcon>
        <Button
          type="button"
          variant="brand"
          size="lg"
          className="mt-7 w-full"
          onClick={handleResend}
          disabled={resumeState === "sending"}
        >
          {resumeState === "sending" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{tw("resume.sending")}</span>
            </>
          ) : (
            tw("resume.resend")
          )}
        </Button>
      </AuthShell>
    );
  }
```

- [ ] **Step 4: Add the message keys (EN + TR, key-identical)**

In `frontend-main/messages/en/wizard.json`, inside the top-level `"wizard"` object (after `"provisioning"`), add:

```json
    "resume": {
      "eyebrow": "Welcome back",
      "title": "Your setup link expired",
      "subtitle": "No worries — everything you picked is saved. Get a fresh link by email and continue right where you left off.",
      "resend": "Email me a new link",
      "sending": "Sending…",
      "sentTitle": "Link sent",
      "sentSubtitle": "Check your inbox — the new link takes you straight back to your setup.",
      "closedTitle": "Your platform is already set up",
      "closedSubtitle": "This signup was already completed. Log in to continue.",
      "closedCta": "Go to login",
      "failed": "We couldn't send a link for this signup. Please start again.",
      "startOver": "Start over"
    }
```

In `frontend-main/messages/tr/wizard.json`, same position (TR: needs native review):

```json
    "resume": {
      "eyebrow": "Tekrar hoş geldiniz",
      "title": "Kurulum bağlantınızın süresi doldu",
      "subtitle": "Endişelenmeyin — yaptığınız tüm seçimler kayıtlı. E-postayla yeni bir bağlantı alın ve kaldığınız yerden devam edin.",
      "resend": "Bana yeni bir bağlantı gönder",
      "sending": "Gönderiliyor…",
      "sentTitle": "Bağlantı gönderildi",
      "sentSubtitle": "Gelen kutunuzu kontrol edin — yeni bağlantı sizi doğrudan kuruluma geri götürür.",
      "closedTitle": "Platformunuz zaten kurulmuş",
      "closedSubtitle": "Bu kayıt zaten tamamlanmış. Devam etmek için giriş yapın.",
      "closedCta": "Girişe git",
      "failed": "Bu kayıt için bağlantı gönderemedik. Lütfen yeniden başlayın.",
      "startOver": "Baştan başla"
    }
```

- [ ] **Step 5: Verify parity, lint, build**

```bash
node scripts/check-i18n-parity.mjs
cd frontend-main && npm run lint && npm run build && cd ..
```

Expected: parity OK, zero lint errors, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend-main/src/lib/wizard/api.ts frontend-main/src/app/signup/verify/page.tsx frontend-main/src/app/signup/verify/wizard/WizardFlow.tsx frontend-main/messages/en/wizard.json frontend-main/messages/tr/wizard.json
git commit -m "feat(wizard): expired-token resume screen re-sends the link by email

TR copy needs native review.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Superadmin "Wizard Funnel" view

A second, read-only adminkit registration of `Tenant` (registry keys on `admin.key`, so two registrations of one model coexist). Computed columns surface the funnel data phase 1 already stores in `wizard_state`. Backend registration only — the superadmin SPA renders it from the meta endpoint.

**Files:**
- Modify: `backend/apps/core/admin_panels.py` (after the `_ReadOnlyAdmin` base class, ~line 400)
- Modify: `backend/apps/adminkit/tests/test_adminkit.py` (meta key-set assertion, ~line 261)
- Test: `backend/apps/core/tests/test_wizard_funnel_admin.py` (create)

**Interfaces:**
- Consumes: `_ReadOnlyAdmin`, `platform_site`, `Tenant.wizard_state` / `recovery_email_sent_at`; adminkit's `get_computed_columns()` (any `list_display` entry that isn't a concrete field is resolved by calling `self.<name>(obj)`).
- Produces: `GET /api/v1/platform-admin/wizard-funnel/` list + `/meta/` entry with key `wizard-funnel`. No write paths.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/core/tests/test_wizard_funnel_admin.py`:

```python
"""Wizard Funnel superadmin registration, through the adminkit HTTP contract."""

import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import Tenant

pytestmark = pytest.mark.django_db(transaction=True)

SHARED_DOMAIN = "shared-test.localhost"
LIST_URL = "/api/v1/platform-admin/wizard-funnel/"

STATE = {
    "version": 1,
    "current_step": "look.theme",
    "answers": {"niche": "yoga", "theme": "forest"},
    "step_timestamps": {
        "niche": "2026-07-14T09:00:00+00:00",
        "theme": "2026-07-14T09:05:00+00:00",
    },
}


def _client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


@pytest.fixture()
def superuser(restore_public):
    return User.objects.create_user(
        email="root@funnel.test", region="global", role="owner", is_staff=True, is_superuser=True
    )


@pytest.fixture()
def tenants(restore_public):
    connection.set_schema_to_public()
    original = Tenant.auto_create_schema
    Tenant.auto_create_schema = False
    made = []
    try:
        for schema, slug, state in [
            ("funnel_a", "funnel-a", STATE),
            ("funnel_b", "funnel-b", {}),  # pre-wizard tenant: excluded
        ]:
            t, _ = Tenant.objects.get_or_create(
                schema_name=schema,
                defaults={"name": slug, "slug": slug, "subdomain": slug, "owner_email": "f@x.com"},
            )
            t.wizard_state = state
            t.save(update_fields=["wizard_state"])
            made.append(t)
    finally:
        Tenant.auto_create_schema = original
    yield made
    connection.set_schema_to_public()
    Tenant.objects.filter(schema_name__in=["funnel_a", "funnel_b"]).delete()


def test_funnel_lists_wizard_tenants_with_computed_columns(superuser, tenants):
    resp = _client(superuser).get(LIST_URL, {"q": "funnel-"})
    assert resp.status_code == 200, resp.content
    rows = {r["slug"]: r for r in resp.json()["results"]}
    assert "funnel-a" in rows
    assert "funnel-b" not in rows  # empty wizard_state -> not in the funnel
    row = rows["funnel-a"]
    assert row["current_step"] == "look.theme"
    assert row["answered"] == 2
    assert row["last_activity"] == "2026-07-14T09:05:00+00:00"


def test_funnel_is_read_only(superuser, tenants):
    client = _client(superuser)
    pk = tenants[0].pk
    assert client.post(LIST_URL, {"name": "X"}, format="json").status_code == 405
    assert client.patch(f"{LIST_URL}{pk}/", {"name": "X"}, format="json").status_code == 405
    assert client.delete(f"{LIST_URL}{pk}/").status_code == 405


def test_funnel_requires_superuser(tenants, restore_public):
    coach = User.objects.create_user(email="coach@funnel.test", region="global", role="coach")
    assert _client(coach).get(LIST_URL).status_code == 403
    assert _client().get(LIST_URL).status_code in (401, 403)


def test_funnel_registered_in_meta(superuser):
    body = _client(superuser).get("/api/v1/platform-admin/meta/").json()
    assert any(m["key"] == "wizard-funnel" for m in body["models"])
```

Also update the EXISTING exact-set assertion in `backend/apps/adminkit/tests/test_adminkit.py` → `test_platform_site_requires_superuser` (~line 261): the `{m["key"] for m in body["models"]} == {...}` set must gain `"wizard-funnel",` (alphabetically it fits after `"webhook-events"`; position doesn't matter in a set literal). Without this, that test fails the moment the funnel registers.

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_funnel_admin.py -v`
Expected: FAIL — 404 on `/wizard-funnel/` (unregistered key).

- [ ] **Step 3: Register the funnel admin**

In `backend/apps/core/admin_panels.py`, after the `AiTranscriptAdmin` class (before `_usage_admin`), add:

```python
@platform_site.register(Tenant)
class WizardFunnelAdmin(_ReadOnlyAdmin):
    """Second registration of Tenant (adminkit keys on `key`, not model):
    the signup-wizard funnel — where each coach is, stalls, and drop-offs.
    Data source: wizard_state written by the wizard endpoints (phase 1)."""

    key = "wizard-funnel"
    label = "Wizard Funnel"
    label_plural = "Wizard Funnel"
    icon = "route"
    description = "Signup-wizard progress per tenant: current step, per-step timestamps, recovery nudges."
    list_display = (
        "name",
        "owner_email",
        "region",
        "current_step",
        "answered",
        "last_activity",
        "template_seed_status",
        "provisioning_status",
        "recovery_email_sent_at",
        "created_at",
        "slug",
    )
    search_fields = ("name", "slug", "owner_email")
    list_filters = ("region", "provisioning_status", "template_seed_status")
    ordering = ("-created_at",)
    readonly_fields = (
        "name",
        "slug",
        "owner_email",
        "region",
        "provisioning_status",
        "template_seed_status",
        "recovery_email_sent_at",
        "created_at",
        "wizard_state",
    )

    def get_queryset(self, request):
        return super().get_queryset(request).exclude(schema_name="public").exclude(wizard_state={})

    def current_step(self, obj):
        return (obj.wizard_state or {}).get("current_step")

    current_step.short_description = "Current Step"

    def answered(self, obj):
        return len((obj.wizard_state or {}).get("answers") or {})

    answered.short_description = "Answers"

    def last_activity(self, obj):
        stamps = (obj.wizard_state or {}).get("step_timestamps") or {}
        # ISO-8601 strings from timezone.now().isoformat() — lexicographic max
        # is chronological max.
        return max(stamps.values(), default=None)

    last_activity.short_description = "Last Step At"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_wizard_funnel_admin.py apps/adminkit/tests/test_adminkit.py -v`
Expected: all PASS (adminkit suite proves the second Tenant registration breaks nothing).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/admin_panels.py backend/apps/core/tests/test_wizard_funnel_admin.py backend/apps/adminkit/tests/test_adminkit.py
git commit -m "feat(superadmin): read-only Wizard Funnel view over wizard_state

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: IP-block + per-IP throttle on the wizard AI endpoints

The five wizard logo endpoints are public (wizard token in the body) and reach the AI engine / S3, but skip both the `AiIpBlock` guard and the denial-recording throttle every other public AI endpoint has (`apps/core/help/views.py`, `assistant_views.py`). Close the gap.

**Files:**
- Modify: `backend/apps/core/throttling.py`
- Modify: `backend/config/settings/base.py` (throttle rate)
- Modify: `backend/apps/core/onboarding/wizard_logo.py` (all 5 views)
- Test: `backend/apps/core/tests/test_ai_ip_block.py` (extend)

**Interfaces:**
- Consumes: `ipblock.blocked_response`, `ClientIpAnonThrottle` (denial recording → auto-block), existing wizard views.
- Produces: `WizardLogoThrottle` (scope `wizard_logo`, `20/min` — mirrors `ai_rate`); every wizard logo view returns 403 for blocked IPs before any token/engine work, and repeated 429s feed the auto-block.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/core/tests/test_ai_ip_block.py`:

```python
WIZARD_AI_URLS = [
    "/api/v1/onboarding/wizard/logo-status/",
    "/api/v1/onboarding/wizard/logo-converse/",
    "/api/v1/onboarding/wizard/logo-converse/finish/",
    "/api/v1/onboarding/wizard/logo-refine/",
    "/api/v1/onboarding/wizard/logo-upload/",
    "/api/v1/onboarding/wizard/recover/",
]


def test_blocked_ip_gets_403_on_wizard_ai_endpoints(tenant_ctx):
    # The guard runs BEFORE token resolution, so no valid token is needed.
    AiIpBlock.objects.create(ip="6.6.6.8", source="manual")
    client = APIClient(HTTP_HOST=HOST, REMOTE_ADDR="6.6.6.8")
    for url in WIZARD_AI_URLS:
        assert client.post(url, {}, format="json").status_code == 403, url


def test_wizard_logo_endpoints_throttle_per_ip(tenant_ctx):
    client = APIClient(HTTP_HOST=HOST, REMOTE_ADDR="8.8.8.1")
    statuses = [
        client.post("/api/v1/onboarding/wizard/logo-status/", {}, format="json").status_code
        for _ in range(21)  # rate is 20/min
    ]
    assert 429 in statuses, statuses
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/core/tests/test_ai_ip_block.py -v`
Expected: new tests FAIL — 400 instead of 403 (no guard), no 429 (no throttle); existing tests pass. (The `/wizard/recover/` line already passes — Task 5 added its guard — it's in the list as a regression pin.)

- [ ] **Step 3: Add the throttle + guards**

In `backend/apps/core/throttling.py`, append:

```python
class WizardLogoThrottle(ClientIpAnonThrottle):
    scope = "wizard_logo"
```

In `backend/config/settings/base.py` → `DEFAULT_THROTTLE_RATES`, after `"wizard_recover": "5/hour",` add:

```python
        # Public (wizard-token) logo AI endpoints — mirrors ai_rate.
        "wizard_logo": "20/min",
```

In `backend/apps/core/onboarding/wizard_logo.py`:

1. Extend imports:

```python
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes

from apps.core import ipblock
from apps.core.throttling import WizardLogoThrottle
```

2. On EACH of the five views (`wizard_logo_status`, `wizard_logo_converse`, `wizard_logo_converse_finish`, `wizard_logo_refine`, `wizard_logo_upload`), add the throttle decorator under the existing ones and the guard as the FIRST statement of the body. Pattern (repeat five times):

```python
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([WizardLogoThrottle])
def wizard_logo_status(request):
    if (denied := ipblock.blocked_response(request)) is not None:
        return denied
    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    ...
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django pytest apps/core/tests/test_ai_ip_block.py apps/core/tests/test_wizard_logo_endpoints.py -v`
(If `test_wizard_logo_endpoints.py` doesn't exist under that name, run `docker compose exec django pytest apps/core/tests/ -k "wizard_logo" -v` to pick up the phase-3 wizard-logo suite.)
Expected: all PASS — the phase-3 suite proves the guards don't break authed flows. If any phase-3 test now trips the 20/min throttle (many sequential calls from the same test IP), add distinct `REMOTE_ADDR`s per test or clear `django.core.cache` in that suite's fixture — do NOT raise the rate.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/throttling.py backend/config/settings/base.py backend/apps/core/onboarding/wizard_logo.py backend/apps/core/tests/test_ai_ip_block.py
git commit -m "feat(onboarding): IP blocklist + per-IP throttle on wizard AI endpoints

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: E2E recovery spec + verification sweep

**Files:**
- Create: `e2e/specs/19-wizard-recovery.spec.ts`
- Test: full backend suite, lint, i18n parity, frontend build, e2e

**Interfaces:**
- Consumes: `latestEmail`/`firstLink` (`e2e/helpers/email.ts`), `manage` (`e2e/helpers/compose.ts`), wizard message catalogs, the recover endpoint (valid tokens are also accepted — expired ones can't be minted from outside), the resume screen (bad token + empty localStorage).

- [ ] **Step 1: Write the spec**

Create `e2e/specs/19-wizard-recovery.spec.ts`:

```typescript
import { test, expect, type Page } from "@playwright/test";
import { latestEmail, firstLink } from "../helpers/email";
import { manage } from "../helpers/compose";
import en from "../../frontend-main/messages/en/auth.json";
import wizardMessages from "../../frontend-main/messages/en/wizard.json";

const W = wizardMessages.wizard;
const stamp = Date.now();

async function signupThroughVerify(page: Page, brand: string, email: string) {
  await page.goto("http://localhost/signup");
  await page.getByPlaceholder(en.signup.brandNamePlaceholder).fill(brand);
  await page.getByPlaceholder(en.signup.namePlaceholder).fill("E2E Coach");
  await page.getByPlaceholder(en.signup.emailPlaceholder).fill(email);
  await page.getByRole("button", { name: en.signup.submit }).click();
  await expect(page.getByRole("heading", { name: en.signup.verifyTitle })).toBeVisible({ timeout: 10_000 });

  const mail = await latestEmail(email);
  const verifyLink = firstLink(mail.html);
  expect(verifyLink, `no link found in email: ${mail.subject}`).toMatch(/signup\/verify\?token=/);
  await page.goto(verifyLink);
}

test.beforeAll(() => {
  // Same self-healing sweep as 01-signup-onboarding (raw SQL for
  // PlatformSubscription — cross-schema FK breaks the ORM cascade).
  manage([
    "shell",
    "-c",
    "from django.db import connection\n" +
      "from apps.core.models import Tenant\n" +
      "tenants = list(Tenant.objects.filter(slug__startswith='e2e-recovery-'))\n" +
      "ids = [t.id for t in tenants]\n" +
      "with connection.cursor() as c:\n" +
      "    c.execute('DELETE FROM core_platformsubscription WHERE tenant_id = ANY(%s)', [ids])\n" +
      "[t.delete(force_drop=True) for t in tenants]",
  ]);
});

test("recovery email resumes the wizard where the coach left off", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-recovery-${stamp}@example.com`;
  await signupThroughVerify(page, `E2E Recovery ${stamp}`, email);

  // Advance one step so there's real progress to resume to.
  await page
    .getByRole("button", { name: `${W.niches.yoga.label} ${W.niches.yoga.tagline}`, exact: true })
    .click({ timeout: 20_000 });
  await page.getByRole("button", { name: W.common.continue, exact: true }).click();
  await expect(page.getByText(W.describe.heading)).toBeVisible();

  // Simulate "came back later on another device": take the token, wipe local
  // state, and ask for a recovery email (endpoint accepts valid AND expired).
  const token = await page.evaluate(() => localStorage.getItem("contentor_wizard_token"));
  expect(token).toBeTruthy();
  await page.evaluate(() => localStorage.removeItem("contentor_wizard_token"));

  const resp = await page.request.post("http://localhost/api/v1/onboarding/wizard/recover/", {
    data: { token },
  });
  expect(resp.status()).toBe(200);

  const mail = await latestEmail(email);
  expect(mail.subject).toContain("left off");
  const resumeLink = firstLink(mail.html);
  expect(resumeLink).toMatch(/signup\/verify\?token=/);

  await page.goto(resumeLink);
  // Resumes at the saved step (business.describe), not the start.
  await expect(page.getByText(W.describe.heading)).toBeVisible({ timeout: 20_000 });
});

test("a dead link with no local state shows the resume screen", async ({ page }) => {
  // Fresh Playwright context -> empty localStorage.
  await page.goto("http://localhost/signup/verify?token=garbage");
  await expect(page.getByRole("heading", { name: W.resume.title })).toBeVisible({ timeout: 20_000 });
  // Garbage token -> recover 400s -> failed state with a start-over path.
  await page.getByRole("button", { name: W.resume.resend }).click();
  await expect(page.getByText(W.resume.failed)).toBeVisible();
});
```

Note: if `W.describe.title` isn't the describe step's heading key, open `frontend-main/messages/en/wizard.json` → `describe` and use the actual heading key (phase-1 spec `01-signup-onboarding.spec.ts` shows which strings render as headings) — mirror it exactly.

- [ ] **Step 2: Run the new spec against the dev stack**

```bash
make dev  # if not already up
cd e2e && npx playwright test specs/19-wizard-recovery.spec.ts && cd ..
```

Expected: 2 passed.

- [ ] **Step 3: Full verification sweep**

```bash
make test                                  # full backend suite (fresh-DB if migrations changed since last run: make test-fresh)
make lint                                  # pre-commit, zero errors/warnings
node scripts/check-i18n-parity.mjs         # EN/TR key parity
cd frontend-main && npm run lint && npm run build && cd ..
cd e2e && npx playwright test specs/01-signup-onboarding.spec.ts specs/19-wizard-recovery.spec.ts && cd ..
```

Expected: everything green. Any failure: fix before committing (see repo rule — verify before claiming done).

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/19-wizard-recovery.spec.ts
git commit -m "test(e2e): wizard recovery email + resume screen specs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Manual browser click-through (project norm, EN + TR)**

With `make dev` running: sign up, abandon mid-wizard, hit `/signup/verify?token=garbage` in a private window → resume screen → resend → open the sunk email via `GET /api/v1/dev/emails/latest/?to=<email>` → follow the link → confirm resume. Repeat once on `tr.localhost`. Check the superadmin Wizard Funnel page renders (`/admin` → Wizard Funnel).

---

## Self-review notes (spec coverage)

- Spec §6 phase 4 "drop-off recovery email (re-minted wizard token)" → Tasks 1–3 (automated) + 5 (manual re-send).
- Spec §4 "Wizard token expired (>7 d) → resume screen → re-sends the signup email (re-mints token)" → Tasks 4–6. Deviation from the spec's letter: re-send goes through the NEW `wizard/recover/` endpoint, not `creator_signup` — the existing resend mechanic 400s ("brand_taken") once the tenant row exists, so it cannot serve as the resume path.
- Spec §6 "funnel timestamp surfacing in superadmin" → Task 7 (timestamps stored by phase 1; this surfaces them read-only).
- Spec §6 "optional IP-block reuse on wizard AI endpoints" → Task 8 (+ recover endpoint guarded in Task 5).
- Non-goals respected: no funnel dashboard beyond adminkit list, no A/B framework, no drip sequence (exactly one automated nudge per tenant).
