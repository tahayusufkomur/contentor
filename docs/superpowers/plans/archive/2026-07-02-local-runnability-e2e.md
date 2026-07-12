# Fully-Local Runnability + Playwright E2E Suite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Contentor feature runs locally with zero external accounts except Stripe test mode, and a top-level Playwright suite (`e2e/`) proves it end-to-end.

**Architecture:** Part A adds local substitutes at existing seams — MinIO behind `apps/core/storage.py`, a fake twin of `apps/live/stream_service.py`, a DB email sink inside `apps/core/email.py::send_email` — plus test-mode Stripe wiring (seed_plans already auto-provisions Prices; only Connect needs a new seeder). Part B builds `e2e/` on the proven flowmap auth pattern (JWT minted via `manage.py issue_login_token`, cookie `contentor_access_token`) against the seeded `demo-yoga.localhost` tenant.

**Tech Stack:** Django 5.1 / DRF / django-tenants, docker compose, MinIO, Stripe test mode + Stripe CLI, Playwright (`@playwright/test`, TypeScript).

## Global Constraints

- Work on branch `feat/local-e2e` off current `main`. Shared working tree: before EVERY commit run `git branch --show-current` and confirm `feat/local-e2e`; never `git add -A` (other agents' edits are in the tree — stage only files you touched).
- Do not touch these currently-modified files (another agent's work in flight): `backend/apps/core/onboarding/views.py`, `backend/apps/core/onboarding/urls.py`, `frontend-main/src/app/signup/*`, `backend/apps/core/i18n_helpers.py`, `backend/apps/core/middleware/rate_limit.py`, `backend/apps/live/serializers.py`, `frontend-customer/src/lib/tenant.ts`, `tools/flowmap/*`. If a task needs one of them, read it fresh and add code without reformatting existing lines.
- Backend tests: `docker compose exec -T django pytest <path> -v`. Full suite must stay green: `make test`.
- Fakes must be impossible in prod: `config/settings/prod.py` must raise `ImproperlyConfigured` if `LIVE_FAKE_ENABLED` or `EMAIL_SINK_ENABLED` is true.
- Public/dev endpoints must set `@authentication_classes([])` — `AllowAny` alone is NOT enough (`TenantJWTAuthentication` is the DRF default).
- E2E selectors: prefer `getByRole`/visible text; every spec task ends with a headed run to verify selectors against the real UI — adjust text there, never invent `data-testid`s that don't exist.
- Never commit unless the task's commit step says so; never push.
- API prefixes (verified): auth `/api/v1/auth/`, billing `/api/v1/billing/`, live `/api/v1/live/`, calendar `/api/v1/calendar/`, photos `/api/v1/photos/`, mailbox `/api/v1/mailbox/`, onboarding `/api/v1/onboarding/`, webhook `/api/webhooks/stripe/`, health `/api/health/`.
- Seeded fixture tenant: `demo-yoga` / `demo-yoga.localhost` (from `make seed-demos`). Roles minted via `python manage.py issue_login_token --role {coach|student|superadmin} [--tenant demo-yoga]`.

---

### Task 0: Branch setup

**Files:** none (git only)

- [ ] **Step 1:** `cd /Users/tahayusufkomur/ws/projects-in-progress/contentor && git branch --show-current` — expect `main`. `git status -sb` — note the pre-existing modified files (do NOT stage them, ever).
- [ ] **Step 2:** `git checkout -b feat/local-e2e`
- [ ] **Step 3:** Verify: `git branch --show-current` → `feat/local-e2e`.

---

### Task 1: MinIO + dual-endpoint presigning

**Files:**
- Modify: `docker-compose.yml` (add `minio`, `minio-init` services + volume)
- Modify: `backend/config/settings/base.py` (~line 188, after `AWS_ENDPOINT`)
- Modify: `backend/apps/core/storage.py`
- Modify: `.env`, `.env.example`
- Test: `backend/apps/core/tests/test_storage.py` (create)

**Interfaces:**
- Produces: `get_s3_client(external: bool = False)`; presign functions now sign against `settings.AWS_ENDPOINT_EXTERNAL` so browsers on the host can use the URLs. Existing callers (`apps/media`, `sign_if_s3_key`) unchanged.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/core/tests/test_storage.py
from django.test import SimpleTestCase, override_settings

from apps.core import storage


@override_settings(
    AWS_ACCESS_KEY_ID="minioadmin",
    AWS_SECRET_ACCESS_KEY="minioadmin",
    AWS_BUCKET_NAME="contentor-dev-private",
    AWS_ENDPOINT="http://minio:9000",
    AWS_ENDPOINT_EXTERNAL="http://localhost:9000",
    AWS_PRESIGNED_EXPIRY=3600,
)
class PresignExternalEndpointTests(SimpleTestCase):
    def test_download_url_uses_external_endpoint(self):
        url = storage.generate_presigned_download_url("tenants/demo/x.png")
        assert url.startswith("http://localhost:9000/"), url

    def test_upload_url_uses_external_endpoint(self):
        url = storage.generate_presigned_upload_url("tenants/demo/x.png", "image/png")
        assert url.startswith("http://localhost:9000/"), url

    @override_settings(AWS_ENDPOINT_EXTERNAL="")
    def test_falls_back_to_internal_endpoint(self):
        url = storage.generate_presigned_download_url("tenants/demo/x.png")
        assert url.startswith("http://minio:9000/"), url
```

- [ ] **Step 2:** Run: `docker compose exec -T django pytest apps/core/tests/test_storage.py -v` — Expected: ERROR (`AWS_ENDPOINT_EXTERNAL` setting unknown / URLs use internal host).
- [ ] **Step 3: Settings + storage implementation**

In `backend/config/settings/base.py`, directly under the `AWS_ENDPOINT` line:

```python
# Browser-facing endpoint for presigned URLs. Inside compose Django reaches
# MinIO at http://minio:9000 but the browser must use http://localhost:9000;
# presigned signatures include the host, so signing must use this endpoint.
AWS_ENDPOINT_EXTERNAL = os.environ.get("AWS_ENDPOINT_EXTERNAL", "")
```

Replace `get_s3_client` in `backend/apps/core/storage.py` and point both presign functions at the external client:

```python
import boto3
from botocore.config import Config
from django.conf import settings
from django.db import connection


def get_s3_client(external=False):
    kwargs = {
        "aws_access_key_id": settings.AWS_ACCESS_KEY_ID,
        "aws_secret_access_key": settings.AWS_SECRET_ACCESS_KEY,
        # Path-style + v4 keep MinIO happy and are harmless for Hetzner.
        "config": Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    }
    endpoint = settings.AWS_ENDPOINT
    if external and settings.AWS_ENDPOINT_EXTERNAL:
        endpoint = settings.AWS_ENDPOINT_EXTERNAL
    if endpoint:
        kwargs["endpoint_url"] = endpoint
    return boto3.client("s3", **kwargs)
```

In `generate_presigned_upload_url` and `generate_presigned_download_url` change `client = get_s3_client()` → `client = get_s3_client(external=True)`.

- [ ] **Step 4:** Run: `docker compose exec -T django pytest apps/core/tests/test_storage.py -v` — Expected: 3 PASS. Also run `docker compose exec -T django pytest apps/media/ -v` — Expected: PASS (no regression).
- [ ] **Step 5: Compose services**

Add to `docker-compose.yml` (sibling of `redis`), and `minio_data:` under top-level `volumes:`:

```yaml
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${AWS_ACCESS_KEY_ID:-minioadmin}
      MINIO_ROOT_PASSWORD: ${AWS_SECRET_ACCESS_KEY:-minioadmin}
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 3s
      retries: 10

  minio-init:
    image: minio/mc
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 $${MINIO_ROOT_USER:-minioadmin} $${MINIO_ROOT_PASSWORD:-minioadmin} &&
      mc mb -p local/$${AWS_BUCKET_NAME:-contentor-dev-private} || true"
    environment:
      MINIO_ROOT_USER: ${AWS_ACCESS_KEY_ID:-minioadmin}
      MINIO_ROOT_PASSWORD: ${AWS_SECRET_ACCESS_KEY:-minioadmin}
      AWS_BUCKET_NAME: ${AWS_BUCKET_NAME:-contentor-dev-private}
```

Note: if `mc ready` is unavailable in the pinned image, use `["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]` (curl exists in minio/minio).

- [ ] **Step 6: Env files**

`.env.example` — replace the Storage block values:

```
# Storage (S3-compatible). Dev default = bundled MinIO (make dev). For real
# Hetzner storage, set the four values to the real bucket + endpoint and
# leave AWS_ENDPOINT_EXTERNAL empty.
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_BUCKET_NAME=contentor-dev-private
AWS_ENDPOINT=http://minio:9000
AWS_ENDPOINT_EXTERNAL=http://localhost:9000
AWS_PRESIGNED_EXPIRY=3600
```

`.env` — same swap (the Hetzner keys currently there are on the rotate list anyway; do not keep them as comments).

- [ ] **Step 7: Boot + manual verify**

Run: `docker compose up -d --build minio minio-init django` then
`docker compose exec -T django python -c "from apps.core.storage import get_s3_client; get_s3_client().list_objects_v2(Bucket='contentor-dev-private'); print('minio OK')"`
Expected: `minio OK`.

- [ ] **Step 8: Commit**

```bash
git branch --show-current   # MUST print feat/local-e2e
git add docker-compose.yml backend/config/settings/base.py backend/apps/core/storage.py backend/apps/core/tests/test_storage.py .env.example
git commit -m "feat(storage): bundled MinIO + browser-facing presign endpoint"
```

---

### Task 2: Fake live-stream service (`LIVE_FAKE_ENABLED`)

**Files:**
- Create: `backend/apps/live/fake_stream_service.py`
- Modify: `backend/apps/live/stream_service.py`
- Modify: `backend/apps/live/views.py` (only the two `"api_key": settings.GETSTREAM_API_KEY` lines, ~176 and ~305)
- Modify: `backend/config/settings/base.py`, `backend/config/settings/dev.py`, `backend/config/settings/prod.py`
- Test: `backend/apps/live/tests/test_fake_stream.py` (create)

**Interfaces:**
- Produces: `stream_service.api_key()` → `str` (`settings.GETSTREAM_API_KEY` or `"fake-local"`); every existing public function (`upsert_user`, `create_call`, `stop_call`, `create_livestream`, `stop_livestream`, `generate_user_token`) short-circuits to the fake when `settings.LIVE_FAKE_ENABLED`. Views keep calling the same names.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/live/tests/test_fake_stream.py
from django.test import SimpleTestCase, override_settings

from apps.live import stream_service


@override_settings(LIVE_FAKE_ENABLED=True, GETSTREAM_API_KEY="")
class FakeStreamTests(SimpleTestCase):
    def test_token_is_deterministic_and_offline(self):
        assert stream_service.generate_user_token(42) == "fake-token-u42"

    def test_api_key_reports_fake(self):
        assert stream_service.api_key() == "fake-local"

    def test_lifecycle_functions_are_noops(self):
        class Obj:
            room_name = "room-1"
            auto_recording = False

        class U:
            id = 1
            name = "n"
            email = "e@example.com"
            avatar_url = ""
            role = "coach"

        stream_service.upsert_user(U())
        assert stream_service.create_call(Obj(), U()) is None
        stream_service.stop_call("room-1")
        assert stream_service.create_livestream(Obj(), U()) is None
        stream_service.stop_livestream("room-1")


@override_settings(LIVE_FAKE_ENABLED=False, GETSTREAM_API_KEY="k_real")
class RealStreamKeyTests(SimpleTestCase):
    def test_api_key_reports_real_key(self):
        assert stream_service.api_key() == "k_real"
```

- [ ] **Step 2:** Run: `docker compose exec -T django pytest apps/live/tests/test_fake_stream.py -v` — Expected: FAIL (`api_key` not defined / network attempted).
- [ ] **Step 3: Implement**

`backend/apps/live/fake_stream_service.py`:

```python
"""Offline stand-in for GetStream. Active only when settings.LIVE_FAKE_ENABLED.

Create/join/stop live classes works end-to-end without network; the browser
video canvas itself cannot connect (no real Stream backend) — UI is testable
up to the join screen.
"""
import logging

logger = logging.getLogger(__name__)


def _user_id(pk):
    return f"u{pk}"


def upsert_user(user):
    logger.info("[fake-stream] upsert_user %s", _user_id(user.id))


def create_call(live_class, instructor):
    logger.info("[fake-stream] create_call %s", live_class.room_name)
    return None


def stop_call(room_name):
    logger.info("[fake-stream] stop_call %s", room_name)


def create_livestream(live_stream, instructor):
    logger.info("[fake-stream] create_livestream %s", live_stream.room_name)
    return None


def stop_livestream(room_name):
    logger.info("[fake-stream] stop_livestream %s", room_name)


def generate_user_token(user_id):
    return f"fake-token-{_user_id(user_id)}"
```

`backend/apps/live/stream_service.py` — add after `logger = ...`:

```python
from . import fake_stream_service


def _fake():
    return bool(getattr(settings, "LIVE_FAKE_ENABLED", False))


def api_key():
    """Publishable key for browser SDKs; sentinel when running the fake."""
    return "fake-local" if _fake() else settings.GETSTREAM_API_KEY
```

Then add a two-line guard at the TOP of each existing public function (all six), e.g.:

```python
def upsert_user(user):
    if _fake():
        return fake_stream_service.upsert_user(user)
    ...existing body...
```

(Same pattern for `create_call`, `stop_call`, `create_livestream`, `stop_livestream`, `generate_user_token` — delegate with identical args.)

`backend/apps/live/views.py`: replace both `"api_key": settings.GETSTREAM_API_KEY,` occurrences with `"api_key": stream_service.api_key(),`.

Settings — `base.py` (near GETSTREAM block):

```python
LIVE_FAKE_ENABLED = _env_bool("LIVE_FAKE_ENABLED", False)
```

(Match the existing `_env_bool` helper used by `BILLING_BYPASS_ENABLED` at base.py:215.)

`dev.py` (append):

```python
import os

# No GetStream keys → run live classes against the offline fake.
if "LIVE_FAKE_ENABLED" not in os.environ:
    LIVE_FAKE_ENABLED = not GETSTREAM_API_KEY  # noqa: F405
```

`prod.py` (append, mirroring however prod already guards `BILLING_BYPASS_ENABLED`):

```python
from django.core.exceptions import ImproperlyConfigured

if LIVE_FAKE_ENABLED:  # noqa: F405
    raise ImproperlyConfigured("LIVE_FAKE_ENABLED must be false in production")
```

- [ ] **Step 4:** Run: `docker compose exec -T django pytest apps/live/tests/ -v` — Expected: new tests PASS, existing live tests PASS.
- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add backend/apps/live/fake_stream_service.py backend/apps/live/stream_service.py backend/apps/live/views.py backend/config/settings/base.py backend/config/settings/dev.py backend/config/settings/prod.py backend/apps/live/tests/test_fake_stream.py
git commit -m "feat(live): offline fake Stream service behind LIVE_FAKE_ENABLED"
```

---

### Task 3: Local email sink + dev read-back endpoint

**Files:**
- Modify: `backend/apps/core/models.py` (append model), `backend/apps/core/email.py`
- Create: `backend/apps/core/dev/__init__.py`, `backend/apps/core/dev/views.py`, `backend/apps/core/dev/urls.py`
- Modify: `backend/config/urls.py` (mount `api/v1/dev/`), `backend/config/settings/base.py`, `dev.py`, `prod.py`
- Migration: `docker compose exec django python manage.py makemigrations core`
- Test: `backend/apps/core/tests/test_email_sink.py` (create)

**Interfaces:**
- Produces: model `apps.core.models.DevOutboundEmail(to, subject, html, created_at)` (SHARED app → public schema, writable from tenant contexts via search_path); `GET /api/v1/dev/emails/latest/?to=<email>` → `{to, subject, html, created_at}` or 404; whole `/api/v1/dev/` tree 404s unless `EMAIL_SINK_ENABLED`.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/core/tests/test_email_sink.py
import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.core.email import send_email
from apps.core.models import DevOutboundEmail


@pytest.mark.django_db
@override_settings(EMAIL_SINK_ENABLED=True, RESEND_API_KEY="")
class TestEmailSink:
    def test_send_email_stores_instead_of_sending(self):
        assert send_email("s@example.com", "Hi", "<b>hello</b>") is True
        row = DevOutboundEmail.objects.get()
        assert (row.to, row.subject) == ("s@example.com", "Hi")

    def test_latest_endpoint_returns_newest_for_recipient(self):
        send_email("a@example.com", "first", "1")
        send_email("a@example.com", "second", "2")
        res = APIClient().get("/api/v1/dev/emails/latest/", {"to": "a@example.com"})
        assert res.status_code == 200
        assert res.data["subject"] == "second"

    def test_latest_endpoint_404_when_none(self):
        res = APIClient().get("/api/v1/dev/emails/latest/", {"to": "x@example.com"})
        assert res.status_code == 404


@pytest.mark.django_db
@override_settings(EMAIL_SINK_ENABLED=False)
def test_dev_endpoint_disabled_without_sink():
    res = APIClient().get("/api/v1/dev/emails/latest/", {"to": "a@example.com"})
    assert res.status_code == 404
```

- [ ] **Step 2:** Run: `docker compose exec -T django pytest apps/core/tests/test_email_sink.py -v` — Expected: FAIL (model/endpoint missing).
- [ ] **Step 3: Implement**

Append to `backend/apps/core/models.py`:

```python
class DevOutboundEmail(models.Model):
    """Dev-only sink for outbound mail (EMAIL_SINK_ENABLED). Lets local e2e
    read magic links / verification codes without a real inbox."""

    to = models.EmailField(db_index=True)
    subject = models.CharField(max_length=500)
    html = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
```

`backend/apps/core/email.py` — insert at the top of `send_email`, before the `RESEND_API_KEY` check:

```python
    if getattr(settings, "EMAIL_SINK_ENABLED", False):
        from apps.core.models import DevOutboundEmail

        DevOutboundEmail.objects.create(to=to, subject=subject, html=html)
        logger.info("[email-sink] captured to=%s subject=%s", to, subject)
        return True
```

`backend/apps/core/dev/views.py`:

```python
from django.conf import settings
from django.http import Http404
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core.models import DevOutboundEmail


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def latest_email(request):
    if not getattr(settings, "EMAIL_SINK_ENABLED", False):
        raise Http404
    to = request.query_params.get("to", "").strip()
    row = DevOutboundEmail.objects.filter(to__iexact=to).first() if to else None
    if not row:
        raise Http404
    return Response(
        {"to": row.to, "subject": row.subject, "html": row.html, "created_at": row.created_at}
    )
```

`backend/apps/core/dev/urls.py`:

```python
from django.urls import path

from . import views

urlpatterns = [path("emails/latest/", views.latest_email, name="dev-latest-email")]
```

`backend/config/urls.py` — add with the other v1 includes: `path("api/v1/dev/", include("apps.core.dev.urls")),`

Settings: `base.py` → `EMAIL_SINK_ENABLED = _env_bool("EMAIL_SINK_ENABLED", False)`; `dev.py` → `EMAIL_SINK_ENABLED = os.environ.get("EMAIL_SINK_ENABLED", "true").lower() in ("1", "true", "yes")`; `prod.py` → extend the Task 2 guard:

```python
if EMAIL_SINK_ENABLED:  # noqa: F405
    raise ImproperlyConfigured("EMAIL_SINK_ENABLED must be false in production")
```

- [ ] **Step 4:** `docker compose exec django python manage.py makemigrations core` then `make migrate-shared`.
- [ ] **Step 5:** Run: `docker compose exec -T django pytest apps/core/tests/test_email_sink.py -v` — Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add backend/apps/core/models.py backend/apps/core/email.py backend/apps/core/dev backend/apps/core/migrations backend/config/urls.py backend/config/settings/base.py backend/config/settings/dev.py backend/config/settings/prod.py backend/apps/core/tests/test_email_sink.py
git commit -m "feat(core): dev email sink + /api/v1/dev/emails/latest read-back"
```

---

### Task 4: Stripe test mode — env wiring + Connect test-account seeder

**Files:**
- Create: `backend/apps/billing/management/__init__.py`, `backend/apps/billing/management/commands/__init__.py`, `backend/apps/billing/management/commands/seed_connect_test.py`
- Modify: `.env`, `.env.example` (comment tweak only), `Makefile` (no new target here; `stripe-listen` exists)
- Test: `backend/apps/billing/tests/test_seed_connect_test.py` (create)

**Interfaces:**
- Consumes: `Tenant.stripe_account_id`, `Tenant.stripe_charges_enabled` (core/models.py:36 area), `can_monetize` (`apps/core/monetization.py` — requires `is_paid_active` + `stripe_charges_enabled`).
- Produces: `python manage.py seed_connect_test --tenant demo-yoga` → creates a test-mode Custom connected account (prefilled test data + tos_acceptance → `charges_enabled` without hosted onboarding), persists `stripe_account_id` + `stripe_charges_enabled=True` on the tenant. Refuses to run against `sk_live_*` keys.

- [ ] **Step 1: Human prerequisite (cannot be automated)** — confirm `.env` has `STRIPE_SECRET_KEY=sk_test_...`, `STRIPE_PUBLISHABLE_KEY=pk_test_...`, and `STRIPE_WEBHOOK_SECRET=whsec_...` from `make stripe-listen`. If keys are still `sk_live_*` STOP and ask the user (they are flagged for rotation). Platform Prices need no manual step — `seed_plans` auto-provisions from `PLAN_AMOUNTS` when `STRIPE_SECRET_KEY` is set.
- [ ] **Step 2: Write the failing test**

```python
# backend/apps/billing/tests/test_seed_connect_test.py
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.core.management import CommandError, call_command
from django.test import override_settings

from apps.core.models import Tenant


@pytest.mark.django_db
@override_settings(STRIPE_SECRET_KEY="sk_test_x")
def test_seeds_connect_account_and_flags_tenant():
    tenant = Tenant.objects.create(
        schema_name="e2etest", name="E2E", slug="e2etest", subdomain="e2etest",
        owner_email="c@example.com", provisioning_status="ready",
    )
    fake_acct = SimpleNamespace(id="acct_test_1", charges_enabled=True)
    with patch("apps.billing.management.commands.seed_connect_test.stripe") as mstripe:
        mstripe.Account.create.return_value = fake_acct
        mstripe.Account.retrieve.return_value = fake_acct
        call_command("seed_connect_test", tenant="e2etest")
    tenant.refresh_from_db()
    assert tenant.stripe_account_id == "acct_test_1"
    assert tenant.stripe_charges_enabled is True


@pytest.mark.django_db
@override_settings(STRIPE_SECRET_KEY="sk_live_x")
def test_refuses_live_keys():
    with pytest.raises(CommandError):
        call_command("seed_connect_test", tenant="whatever")
```

- [ ] **Step 3:** Run: `docker compose exec -T django pytest apps/billing/tests/test_seed_connect_test.py -v` — Expected: FAIL (command missing).
- [ ] **Step 4: Implement the command**

```python
# backend/apps/billing/management/commands/seed_connect_test.py
"""Create a Stripe TEST-MODE connected account for a tenant so marketplace
checkout works locally without hosted Express onboarding.

Uses a Custom account with Stripe's documented test data (tos_acceptance,
test routing/account numbers) so charges_enabled flips on programmatically.
"""
import time

import stripe
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.core.models import Tenant


class Command(BaseCommand):
    help = "Seed a test-mode Stripe Connect account onto a tenant (dev/e2e only)"

    def add_arguments(self, parser):
        parser.add_argument("--tenant", required=True, help="tenant slug, e.g. demo-yoga")

    def handle(self, *args, **options):
        key = settings.STRIPE_SECRET_KEY
        if not key.startswith("sk_test_"):
            raise CommandError("seed_connect_test requires a sk_test_* key (never live).")
        stripe.api_key = key

        tenant = Tenant.objects.get(slug=options["tenant"])
        if tenant.stripe_account_id and tenant.stripe_charges_enabled:
            self.stdout.write(f"{tenant.slug}: already enabled ({tenant.stripe_account_id})")
            return

        acct = stripe.Account.create(
            type="custom",
            country="US",
            email=tenant.owner_email,
            capabilities={"card_payments": {"requested": True}, "transfers": {"requested": True}},
            business_type="individual",
            business_profile={"mcc": "8299", "url": "https://accessible.stripe.com"},
            individual={
                "first_name": "E2E", "last_name": "Coach",
                "email": tenant.owner_email, "phone": "0000000000",
                "dob": {"day": 1, "month": 1, "year": 1990},
                "address": {"line1": "address_full_match", "city": "Columbus",
                            "state": "OH", "postal_code": "43214", "country": "US"},
                "ssn_last_4": "0000",
            },
            tos_acceptance={"date": int(time.time()), "ip": "127.0.0.1"},
            external_account={"object": "bank_account", "country": "US", "currency": "usd",
                              "routing_number": "110000000", "account_number": "000123456789"},
        )
        for _ in range(30):
            acct = stripe.Account.retrieve(acct.id)
            if acct.charges_enabled:
                break
            time.sleep(2)
        if not acct.charges_enabled:
            raise CommandError(f"{acct.id} never reached charges_enabled; check test data")

        Tenant.objects.filter(pk=tenant.pk).update(
            stripe_account_id=acct.id, stripe_charges_enabled=True
        )
        self.stdout.write(self.style.SUCCESS(f"{tenant.slug} ← {acct.id} (charges_enabled)"))
```

Before finishing: open `backend/apps/core/models.py` and confirm the exact field name `stripe_charges_enabled` (it sits near `stripe_account_id`, models.py:36; `can_monetize` reads it via `getattr`). If it differs, use the real name in both command and tests.

- [ ] **Step 5:** Run: `docker compose exec -T django pytest apps/billing/tests/test_seed_connect_test.py -v` — Expected: 2 PASS.
- [ ] **Step 6: Live-fire once (test mode):** with test keys in `.env`: `docker compose exec django python manage.py seed_connect_test --tenant demo-yoga` — Expected: `demo-yoga ← acct_... (charges_enabled)`.
- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add backend/apps/billing/management backend/apps/billing/tests/test_seed_connect_test.py
git commit -m "feat(billing): seed_connect_test — programmatic test-mode Connect account"
```

---

### Task 5: E2E scaffold — package, config, helpers, global setup, make targets

**Files:**
- Create: `e2e/package.json`, `e2e/tsconfig.json`, `e2e/playwright.config.ts`, `e2e/global-setup.ts`, `e2e/helpers/auth.ts`, `e2e/helpers/email.ts`, `e2e/helpers/compose.ts`, `e2e/.gitignore`
- Modify: `Makefile` (add `e2e`, `e2e-stripe` targets + help lines)

**Interfaces:**
- Produces (used by all spec tasks):
  - `coachContext(browser)` / `studentContext(browser)` / `superadminContext(browser)`: `Promise<BrowserContext>` pre-authed via minted JWT cookie `contentor_access_token` on `demo-yoga.localhost` (superadmin on `localhost`).
  - `latestEmail(to: string): Promise<{subject: string; html: string}>` (polls the Task 3 endpoint, 15s timeout); `firstLink(html: string): string`.
  - `manage(args: string[]): string` — runs `docker compose exec -T django python manage.py <args>` from repo root.
  - Constants: `MAIN = "http://localhost"`, `TENANT_HOST = "demo-yoga.localhost"`, `TENANT = "http://demo-yoga.localhost"`.
  - Env flag: Stripe specs guard with `test.skip(!process.env.STRIPE_E2E, "stripe-mode only (make e2e-stripe)")`.

- [ ] **Step 1: Package files**

`e2e/package.json`:

```json
{
  "name": "contentor-e2e",
  "private": true,
  "devDependencies": {
    "@playwright/test": "^1.49.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.5.4"
  }
}
```

(TS pinned <5.9 — 5.9.3 previously broke Next builds in this repo; keep the toolchains consistent.)

`e2e/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "types": ["node"]
  }
}
```

`e2e/.gitignore`:

```
node_modules/
test-results/
playwright-report/
```

- [ ] **Step 2: Config + helpers**

`e2e/playwright.config.ts`:

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./specs",
  globalSetup: "./global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Specs mutate shared tenant state (courses, payments) — keep them serial.
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
```

`e2e/helpers/compose.ts`:

```typescript
import { execFileSync } from "node:child_process";
import path from "node:path";

export const REPO_ROOT = path.resolve(__dirname, "..", "..");

export function manage(args: string[]): string {
  return execFileSync(
    "docker",
    ["compose", "exec", "-T", "django", "python", "manage.py", ...args],
    { cwd: REPO_ROOT, encoding: "utf8" }
  ).trim();
}
```

`e2e/helpers/auth.ts` (pattern proven by `tools/flowmap/crawler/auth.js`):

```typescript
import { Browser, BrowserContext } from "@playwright/test";
import { manage } from "./compose";

export const MAIN = "http://localhost";
export const TENANT_HOST = "demo-yoga.localhost";
export const TENANT = `http://${TENANT_HOST}`;

function cookie(jwt: string, domain: string) {
  return {
    name: "contentor_access_token",
    value: jwt,
    domain,
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "Lax" as const,
  };
}

async function roleContext(browser: Browser, role: string, host: string, tenant?: string) {
  const args = ["issue_login_token", "--role", role];
  if (tenant) args.push("--tenant", tenant);
  const jwt = manage(args);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([cookie(jwt, host)]);
  return ctx;
}

export const coachContext = (b: Browser): Promise<BrowserContext> =>
  roleContext(b, "coach", TENANT_HOST, "demo-yoga");
export const studentContext = (b: Browser): Promise<BrowserContext> =>
  roleContext(b, "student", TENANT_HOST, "demo-yoga");
export const superadminContext = (b: Browser): Promise<BrowserContext> =>
  roleContext(b, "superadmin", "localhost");
```

`e2e/helpers/email.ts`:

```typescript
export async function latestEmail(to: string): Promise<{ subject: string; html: string }> {
  const url = `http://localhost/api/v1/dev/emails/latest/?to=${encodeURIComponent(to)}`;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const res = await fetch(url);
    if (res.ok) return (await res.json()) as { subject: string; html: string };
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no sink email for ${to} within 15s`);
}

export function firstLink(html: string): string {
  const m = html.match(/href="([^"]+)"/);
  if (!m) throw new Error("no link in email html");
  return m[1].replace(/&amp;/g, "&");
}
```

`e2e/global-setup.ts`:

```typescript
import { execFileSync } from "node:child_process";
import { manage, REPO_ROOT } from "./helpers/compose";

export default async function globalSetup() {
  // 1. Stack must be up (make dev). Fail fast with a useful message.
  const health = await fetch("http://localhost/api/health/").catch(() => null);
  if (!health || !health.ok) {
    throw new Error("Stack is not running — start it with `make dev` first.");
  }
  // 2. Idempotent seed: plans/public tenant + demo tenants (incl. demo-yoga).
  manage(["seed_plans"]);
  execFileSync("docker", ["compose", "exec", "-T", "django", "python", "manage.py", "seed_all_demos"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
}
```

- [ ] **Step 3: Make targets** — append to the Makefile (new `E2E` section before Deploy), and add `e2e`/`e2e-stripe` to the `.PHONY` line and a `--- E2E ---` group in `help` mirroring the existing awk pattern:

```makefile
e2e: ## Run the local Playwright e2e suite (Stripe specs auto-skip)
	cd e2e && npm install --silent && npx playwright install chromium && npx playwright test

e2e-stripe: ## e2e incl. real Stripe test-mode specs (needs sk_test keys in .env + `make stripe-listen` running)
	cd e2e && npm install --silent && npx playwright install chromium && STRIPE_E2E=1 npx playwright test
```

- [ ] **Step 4: Smoke spec to prove the scaffold** — `e2e/specs/00-smoke.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { coachContext, studentContext, TENANT } from "../helpers/auth";

test("health endpoint responds", async ({ request }) => {
  const res = await request.get("http://localhost/api/health/");
  expect(res.ok()).toBeTruthy();
});

test("coach jwt reaches tenant admin", async ({ browser }) => {
  const ctx = await coachContext(browser);
  const page = await ctx.newPage();
  await page.goto(`${TENANT}/admin`);
  await expect(page).not.toHaveURL(/login/);
  await ctx.close();
});

test("student jwt reaches student dashboard", async ({ browser }) => {
  const ctx = await studentContext(browser);
  const page = await ctx.newPage();
  await page.goto(`${TENANT}/dashboard`);
  await expect(page).not.toHaveURL(/login/);
  await ctx.close();
});
```

- [ ] **Step 5:** Run: `make e2e` (stack up first: `make dev` in another shell or `docker compose up -d --build`). Expected: 3 passed. If `/dashboard` or `/admin` differ, list real routes via `make flowmap-show ARGS=screens` and fix the spec.
- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add e2e Makefile
git commit -m "feat(e2e): Playwright scaffold — auth/email helpers, global seed, make e2e"
```

---

### Task 6: Spec — coach signup → onboarding → tenant provisioned

**Files:**
- Create: `e2e/specs/01-signup-onboarding.spec.ts`

**Interfaces:**
- Consumes: email sink (`latestEmail`, `firstLink`); backend endpoints `/api/v1/onboarding/signup/`, `signup/verify/`, `skip-template/`, `status/`.

- [ ] **Step 1: Recon (required — this flow was just modified by another agent):** read `frontend-main/src/app/signup/signup-form.tsx` and `frontend-main/src/app/signup/verify/` to confirm: field placeholders (brand/name/email, from the `t(...)` message keys in `frontend-main/messages/en/auth.json`), and whether verify uses a code input or a clicked link. Adjust the spec below to what you find — the shape (fill → submit → email → verify → provisioned tenant) stays.
- [ ] **Step 2: Write the spec**

```typescript
// e2e/specs/01-signup-onboarding.spec.ts
import { test, expect } from "@playwright/test";
import { latestEmail } from "../helpers/email";
import en from "../../frontend-main/messages/en/auth.json";

const stamp = Date.now();
const EMAIL = `e2e-coach-${stamp}@example.com`;
const BRAND = `E2E Studio ${stamp}`;

test("coach signs up, verifies via sink email, tenant gets provisioned", async ({ page }) => {
  await page.goto("http://localhost/signup");
  await page.getByPlaceholder(en.brandNamePlaceholder).fill(BRAND);
  await page.getByPlaceholder(en.namePlaceholder).fill("E2E Coach");
  await page.getByPlaceholder(en.emailPlaceholder).fill(EMAIL);
  await page.getByRole("button", { name: en.signupSubmit ?? /sign up|continue/i }).click();

  await expect(page).toHaveURL(/signup\/verify/);
  const mail = await latestEmail(EMAIL);
  // Verify page uses a one-time code (confirm in recon; else click firstLink(mail.html)).
  const code = mail.html.match(/\b(\d{6})\b/)?.[1];
  expect(code, `no 6-digit code in: ${mail.subject}`).toBeTruthy();
  await page.locator("input").first().fill(code!);

  // Questionnaire + template steps: pick the first option / skip until dashboard.
  await page.getByRole("button", { name: /skip|continue|next/i }).first().click();
  await expect(page).toHaveURL(/dashboard|provisioning|welcome/, { timeout: 90_000 });
});
```

- [ ] **Step 3:** Run headed to reconcile selectors with reality: `cd e2e && npx playwright test specs/01 --headed` — iterate until green, then `make e2e` — Expected: all pass.
- [ ] **Step 4: Commit** — `git branch --show-current && git add e2e/specs/01-signup-onboarding.spec.ts && git commit -m "test(e2e): coach signup + onboarding journey"`

---

### Task 7: Spec — course creation (coach) + consumption (student)

**Files:**
- Create: `e2e/specs/02-courses.spec.ts`

- [ ] **Step 1: Recon:** `make flowmap-show ARGS=screens | grep -i course` for the exact routes (`/admin/courses`, `/admin/courses/[slug]`, `/learn/[slug]`, `/courses/[slug]`) and open `frontend-customer/src/app/admin/courses` to confirm the create-course button/field names.
- [ ] **Step 2: Write the spec**

```typescript
// e2e/specs/02-courses.spec.ts
import { test, expect } from "@playwright/test";
import { coachContext, studentContext, TENANT } from "../helpers/auth";

const TITLE = `E2E Course ${Date.now()}`;

test("coach creates a free course; student sees and opens it", async ({ browser }) => {
  const coach = await coachContext(browser);
  const cpage = await coach.newPage();
  await cpage.goto(`${TENANT}/admin/courses`);
  await cpage.getByRole("button", { name: /new course|create|add course/i }).click();
  await cpage.getByLabel(/title/i).fill(TITLE);
  await cpage.getByRole("button", { name: /create|save/i }).click();
  await expect(cpage.getByText(TITLE)).toBeVisible();
  // Publish it so student-facing lists don't hide it (same reason seed_demo_tenant publishes).
  await cpage.getByRole("button", { name: /publish/i }).click().catch(() => {});
  await coach.close();

  const student = await studentContext(browser);
  const spage = await student.newPage();
  await spage.goto(`${TENANT}/courses`);
  await expect(spage.getByText(TITLE)).toBeVisible();
  await spage.getByText(TITLE).click();
  await expect(spage).toHaveURL(/\/courses\//);
  await student.close();
});

test("student can open a seeded course's learn page", async ({ browser }) => {
  const student = await studentContext(browser);
  const page = await student.newPage();
  await page.goto(`${TENANT}/learn/yoga-for-beginners`); // seeded by seed_all_demos
  await expect(page.getByRole("main")).toBeVisible();
  await student.close();
});
```

- [ ] **Step 3:** `cd e2e && npx playwright test specs/02 --headed` — fix selectors → green.
- [ ] **Step 4: Commit** — `git add e2e/specs/02-courses.spec.ts && git commit -m "test(e2e): course create + consume"`

---

### Task 8: Spec — public calendar

**Files:**
- Create: `e2e/specs/03-calendar.spec.ts`

- [ ] **Step 1: Write the spec** (routes verified: `/calendar`, `/calendar/[type]/[id]`; API `/api/v1/calendar/`; demo seed publishes live classes so the calendar is non-empty)

```typescript
// e2e/specs/03-calendar.spec.ts
import { test, expect } from "@playwright/test";
import { TENANT } from "../helpers/auth";

test("public calendar renders seeded events and event detail opens", async ({ page, request }) => {
  const api = await request.get(`${TENANT}/api/v1/calendar/`);
  expect(api.ok()).toBeTruthy();
  const events = await api.json();
  const list = Array.isArray(events) ? events : events.results ?? [];
  expect(list.length).toBeGreaterThan(0);

  await page.goto(`${TENANT}/calendar`);
  await expect(page.getByRole("main")).toBeVisible();
  // Agenda/month toggle exists (view-toggle.tsx) — flip it to prove interactivity.
  await page.getByRole("button", { name: /agenda|list|month/i }).first().click();

  const ev = list[0];
  await page.goto(`${TENANT}/calendar/${ev.event_type ?? ev.type}/${ev.id}`);
  await expect(page.getByRole("main")).toBeVisible();
});
```

- [ ] **Step 2:** Headed run; confirm the calendar API response field names (`event_type` vs `type` — see `_to_calendar_event` in `backend/apps/live/views.py:413`) and fix.
- [ ] **Step 3: Commit** — `git add e2e/specs/03-calendar.spec.ts && git commit -m "test(e2e): public calendar"`

---

### Task 9: Spec — live class lifecycle on the fake stream

**Files:**
- Create: `e2e/specs/04-live-class.spec.ts`

**Interfaces:**
- Consumes: Task 2 fake (`api_key() === "fake-local"`), endpoints `/api/v1/live/` (list/create), `/api/v1/live/<pk>/start/`, `/api/v1/live/<pk>/token/`.

- [ ] **Step 1: Precondition:** `.env` must have empty `GETSTREAM_API_KEY` (or `LIVE_FAKE_ENABLED=true`) for the fake path; restart django if changed.
- [ ] **Step 2: Write the spec** (API-driven lifecycle + UI join screen — the video canvas itself can't connect on a fake backend, by design)

```typescript
// e2e/specs/04-live-class.spec.ts
import { test, expect } from "@playwright/test";
import { coachContext, studentContext, TENANT } from "../helpers/auth";

test("coach schedules + starts a class offline; student gets a fake token and join UI", async ({ browser }) => {
  const coach = await coachContext(browser);
  const capi = coach.request;
  const create = await capi.post(`${TENANT}/api/v1/live/`, {
    data: {
      title: `E2E Live ${Date.now()}`,
      scheduled_at: new Date(Date.now() + 3600_000).toISOString(),
      duration_minutes: 60,
    },
  });
  expect(create.status(), await create.text()).toBe(201);
  const cls = await create.json();

  const start = await capi.post(`${TENANT}/api/v1/live/${cls.id}/start/`);
  expect(start.ok(), await start.text()).toBeTruthy();

  const student = await studentContext(browser);
  const token = await student.request.get(`${TENANT}/api/v1/live/${cls.id}/token/`);
  expect(token.ok(), await token.text()).toBeTruthy();
  const body = await token.json();
  expect(body.api_key).toBe("fake-local");
  expect(body.token).toMatch(/^fake-token-u\d+$/);

  const page = await student.newPage();
  await page.goto(`${TENANT}/live/${cls.id}`);
  await expect(page.getByRole("main")).toBeVisible(); // join screen renders, no 500
  await coach.close();
  await student.close();
});
```

- [ ] **Step 3:** Headed run; adjust the create payload to the serializer's required fields (`docker compose exec -T django python -c "from apps.live.serializers import *"` + read the LiveClass serializer — it's in the do-not-touch list, read only).
- [ ] **Step 4: Commit** — `git add e2e/specs/04-live-class.spec.ts && git commit -m "test(e2e): live class lifecycle on fake stream"`

---

### Task 10: Spec — media upload/download through MinIO

**Files:**
- Create: `e2e/specs/05-media.spec.ts`, `e2e/fixtures/pixel.png` (any 1×1 png, `printf` a base64 blob in the task)

- [ ] **Step 1: Recon:** read `backend/apps/media/serializers.py::PhotoCreateSerializer` to confirm the create contract (it returns a presigned `upload_url` + stores `s3_key`, or expects the client to request `/api/v1/upload/` first — check `apps/core/uploads/urls.py` too). Write the spec against the REAL contract; the shape below assumes create → presigned PUT → readback.
- [ ] **Step 2: Write the spec**

```typescript
// e2e/specs/05-media.spec.ts
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { coachContext, TENANT } from "../helpers/auth";

test("photo upload round-trips through MinIO and presigned GET serves it", async ({ browser }) => {
  const coach = await coachContext(browser);
  const api = coach.request;

  const create = await api.post(`${TENANT}/api/v1/photos/`, {
    data: { title: `E2E ${Date.now()}`, content_type: "image/png", filename: "pixel.png" },
  });
  expect(create.status(), await create.text()).toBe(201);
  const photo = await create.json();
  expect(photo.upload_url).toContain("localhost:9000"); // external presign endpoint

  const png = fs.readFileSync(path.join(__dirname, "..", "fixtures", "pixel.png"));
  const put = await fetch(photo.upload_url, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: png,
  });
  expect(put.ok).toBeTruthy();

  const detail = await api.get(`${TENANT}/api/v1/photos/${photo.id}/`);
  const stored = await detail.json();
  const dl = await fetch(stored.url ?? stored.download_url);
  expect(dl.ok).toBeTruthy();
  expect((await dl.arrayBuffer()).byteLength).toBe(png.byteLength);
  await coach.close();
});
```

- [ ] **Step 3:** Headed/API run; reconcile field names (`upload_url`, `url`) with the serializer read in Step 1.
- [ ] **Step 4: Commit** — `git add e2e/specs/05-media.spec.ts e2e/fixtures && git commit -m "test(e2e): media upload via MinIO presigned URLs"`

---

### Task 11: Spec — announcements + coach mailbox

**Files:**
- Create: `e2e/specs/06-announcements.spec.ts`, `e2e/specs/07-mailbox.spec.ts`

- [ ] **Step 1: Recon:** `make flowmap-show ARGS=screens | grep -iE "notif|mail"` → coach routes (`/admin/notifications`, `/admin/notifications/[id]`, mailbox routes from the 19-commit mailbox work). Read `backend/apps/mailbox/urls.py` for the webhook path + signing scheme (signed inbound webhook, per commit `b230ec8`) and `backend/apps/notifications/admin_urls.py` for the announcement create endpoint.
- [ ] **Step 2: announcements spec** — coach composes an announcement in `/admin/notifications`, targets everyone, sends; assert the student feed shows it:

```typescript
// e2e/specs/06-announcements.spec.ts
import { test, expect } from "@playwright/test";
import { coachContext, studentContext, TENANT } from "../helpers/auth";

const TITLE = `E2E announce ${Date.now()}`;

test("coach sends announcement; student sees it in feed", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  await page.goto(`${TENANT}/admin/notifications`);
  await page.getByRole("button", { name: /new|compose|create/i }).first().click();
  await page.getByLabel(/title/i).fill(TITLE);
  await page.getByLabel(/message|body/i).fill("hello from e2e");
  await page.getByRole("button", { name: /send|publish/i }).click();
  await expect(page.getByText(TITLE)).toBeVisible();
  await coach.close();

  const student = await studentContext(browser);
  const spage = await student.newPage();
  await spage.goto(`${TENANT}/dashboard`);
  await spage.getByRole("button", { name: /notifications|bell/i }).click().catch(() => {});
  await expect(spage.getByText(TITLE)).toBeVisible({ timeout: 20_000 }); // celery fan-out
  await student.close();
});
```

- [ ] **Step 3: mailbox spec** — simulate an inbound student email by POSTing a signed payload to the mailbox webhook (exact signature per `backend/apps/mailbox/` webhook view — compute it in the spec with `node:crypto` the same way the Cloudflare worker does), then assert the coach inbox lists the conversation and a reply gets captured by the email sink:

```typescript
// e2e/specs/07-mailbox.spec.ts
import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";
import { latestEmail } from "../helpers/email";

test("inbound webhook → coach inbox → reply lands in email sink", async ({ browser }) => {
  // Build the signed POST exactly as apps/mailbox's webhook expects (read the
  // view for header names + HMAC input; secret comes from .env). If the local
  // mailbox is domain-gated and demo-yoga has no custom domain, enable it via
  // the mailbox settings API first (coach request context), or skip with a
  // clear reason if send-only mode applies.
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  await page.goto(`${TENANT}/admin`); // then nav to the mailbox entry found in recon
  await expect(page.getByRole("main")).toBeVisible();
  await coach.close();
});
```

(The mailbox spec starts as this smoke + the webhook POST from recon; the reply assertion uses `latestEmail(studentAddress)`. If demo-yoga can't enable mailbox without a custom domain, mark the inbound part `test.skip` with reason `mailbox requires custom domain — send-only locally`, and keep the UI smoke.)

- [ ] **Step 4:** Headed runs → green. **Step 5: Commit** — `git add e2e/specs/06-announcements.spec.ts e2e/specs/07-mailbox.spec.ts && git commit -m "test(e2e): announcements + mailbox"`

---

### Task 12: Spec — PWA

**Files:**
- Create: `e2e/specs/08-pwa.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
// e2e/specs/08-pwa.spec.ts
import { test, expect } from "@playwright/test";
import { studentContext, TENANT } from "../helpers/auth";

test("manifest is valid and tenant-branded", async ({ request }) => {
  const res = await request.get(`${TENANT}/manifest.webmanifest`).then(async (r) =>
    r.ok() ? r : request.get(`${TENANT}/manifest.json`)
  );
  expect(res.ok()).toBeTruthy();
  const m = await res.json();
  expect(m.name?.length).toBeGreaterThan(0);
  expect(m.icons?.length).toBeGreaterThan(0);
  expect(["standalone", "fullscreen", "minimal-ui"]).toContain(m.display);
});

test("service worker registers and offline page is reachable", async ({ browser }) => {
  const ctx = await studentContext(browser);
  const page = await ctx.newPage();
  await page.goto(`${TENANT}/dashboard`);
  const swCount = await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    return regs.length;
  });
  expect(swCount).toBeGreaterThan(0);
  const offline = await page.goto(`${TENANT}/offline.html`);
  expect(offline?.ok()).toBeTruthy();
  await ctx.close();
});
```

Note: SW registration may be production-build-only (`next dev` often skips SW). If `swCount` is 0 in dev mode, assert instead that `${TENANT}/sw.js` serves 200 with `Content-Type` JS, and leave a comment that full SW behavior is a prod-build concern.

- [ ] **Step 2:** Run → green. **Step 3: Commit** — `git add e2e/specs/08-pwa.spec.ts && git commit -m "test(e2e): pwa manifest + service worker"`

---

### Task 13: Spec — website builder pages + impersonation

**Files:**
- Create: `e2e/specs/09-builder.spec.ts`, `e2e/specs/10-impersonation.spec.ts`

- [ ] **Step 1: Recon:** builder routes from `make flowmap-show ARGS=screens | grep -iE "site|pages|builder"`; impersonation endpoints `/api/v1/auth/impersonate/verify/` + how the coach UI triggers login-as (memory: one-time signed tokens, `imp` claim, exit banner — see `apps/accounts/views.py::impersonate_verify`).
- [ ] **Step 2: builder spec** — coach opens the page builder, edits a block on the homepage, saves (autosave), and the public tenant homepage reflects it:

```typescript
// e2e/specs/09-builder.spec.ts
import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

const HEADLINE = `E2E headline ${Date.now()}`;

test("coach edits homepage block; public page reflects it", async ({ browser, page }) => {
  const coach = await coachContext(browser);
  const edit = await coach.newPage();
  await edit.goto(`${TENANT}/admin/site`); // adjust to recon route
  await edit.getByRole("main").getByRole("textbox").first().fill(HEADLINE);
  await edit.waitForTimeout(2000); // autosave debounce
  await coach.close();

  await page.goto(TENANT);
  await expect(page.getByText(HEADLINE)).toBeVisible();
});
```

- [ ] **Step 3: impersonation spec** — coach lists students, clicks "login as", new tab lands on the student dashboard with the exit banner; exit restores coach:

```typescript
// e2e/specs/10-impersonation.spec.ts
import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";

test("coach impersonates a student and exits via banner", async ({ browser }) => {
  const coach = await coachContext(browser);
  const page = await coach.newPage();
  await page.goto(`${TENANT}/admin/students`);
  await page.getByRole("row").nth(1).getByRole("button", { name: /login as|impersonate/i }).click();
  // Same-tab or popup — handle both (recon decides; popup shown here):
  const student = await page.context().waitForEvent("page").catch(() => page);
  await expect(student.getByText(/viewing as|impersonat/i)).toBeVisible();
  await student.getByRole("button", { name: /exit|stop/i }).click();
  await coach.close();
});
```

- [ ] **Step 4:** Headed runs → green. **Step 5: Commit** — `git add e2e/specs/09-builder.spec.ts e2e/specs/10-impersonation.spec.ts && git commit -m "test(e2e): builder + impersonation"`

---

### Task 14: Spec @stripe — platform subscription checkout (real test mode)

**Files:**
- Create: `e2e/specs/20-stripe-platform.spec.ts`, `e2e/helpers/stripe.ts`

**Interfaces:**
- Produces: `payStripeCheckout(page)` — fills Stripe-hosted Checkout with `4242 4242 4242 4242`, any future expiry, any CVC/name/postal, submits. Reused by Task 15.

- [ ] **Step 1: Preconditions (documented in spec header):** `make dev` with `BILLING_BYPASS_ENABLED=false` + `sk_test` keys in `.env`, `make stripe-listen` running in another shell, `make seed` re-run once so `seed_plans` provisions test Prices. Specs guard: `test.skip(!process.env.STRIPE_E2E, "stripe-mode only")`.
- [ ] **Step 2: helper**

```typescript
// e2e/helpers/stripe.ts
import { Page, expect } from "@playwright/test";

export async function payStripeCheckout(page: Page) {
  await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 20_000 });
  await page.getByPlaceholder(/1234 1234 1234 1234/).fill("4242424242424242");
  await page.getByPlaceholder(/MM \/ YY/).fill("12/34");
  await page.getByPlaceholder(/CVC/).fill("123");
  await page.getByLabel(/name on card|cardholder/i).fill("E2E Tester").catch(() => {});
  await page.getByPlaceholder(/zip|postal/i).fill("12345").catch(() => {});
  await page.getByTestId("hosted-payment-submit-button").click();
}
```

(`hosted-payment-submit-button` is Stripe's own stable test id on hosted Checkout.)

- [ ] **Step 3: spec**

```typescript
// e2e/specs/20-stripe-platform.spec.ts
import { test, expect } from "@playwright/test";
import { coachContext, TENANT } from "../helpers/auth";
import { payStripeCheckout } from "../helpers/stripe";

test.skip(!process.env.STRIPE_E2E, "stripe-mode only (make e2e-stripe)");

test("coach subscribes to a paid platform plan via real test Checkout", async ({ browser }) => {
  const coach = await coachContext(browser);
  const api = coach.request;
  const start = await api.post(`${TENANT}/api/v1/billing/platform/checkout/`, {
    data: { plan: "starter", currency: "USD" }, // reconcile with start_checkout serializer
  });
  expect(start.ok(), await start.text()).toBeTruthy();
  const { checkout_url } = await start.json();

  const page = await coach.newPage();
  await page.goto(checkout_url);
  await payStripeCheckout(page);
  await expect(page).toHaveURL(/localhost/, { timeout: 30_000 }); // success redirect home

  // Webhook (via stripe listen) flips the subscription — poll the API.
  await expect(async () => {
    const sub = await api.get(`${TENANT}/api/v1/billing/platform/subscription/`);
    const body = await sub.json();
    expect(body.status ?? body.subscription?.status).toMatch(/active|trialing/);
  }).toPass({ timeout: 30_000 });
  await coach.close();
});
```

- [ ] **Step 4:** Run: `make e2e-stripe` (with listener running) — Expected: pass. Reconcile the `start_checkout` request body with `backend/apps/billing/views/platform.py::start_checkout` (read it first).
- [ ] **Step 5: Commit** — `git add e2e/specs/20-stripe-platform.spec.ts e2e/helpers/stripe.ts && git commit -m "test(e2e): real Stripe test-mode platform checkout (@stripe)"`

---

### Task 15: Spec @stripe — marketplace purchase via Connect

**Files:**
- Create: `e2e/specs/21-stripe-marketplace.spec.ts`

**Interfaces:**
- Consumes: Task 4 `seed_connect_test` (run via `manage()`), Task 14 `payStripeCheckout`, `/api/v1/billing/payments/initialize/`, `/api/v1/billing/orders/`.

- [ ] **Step 1: Precondition note:** marketplace webhooks come from the CONNECTED account — the listener must also forward those: update the Makefile `stripe-listen` target to `stripe listen --forward-to http://localhost/api/webhooks/stripe/ --forward-connect-to http://localhost/api/webhooks/stripe/` (verify against `apps/billing/views/webhooks.py` whether connect events share the endpoint; if there's a dedicated connect webhook path, forward there).
- [ ] **Step 2: Write the spec**

```typescript
// e2e/specs/21-stripe-marketplace.spec.ts
import { test, expect } from "@playwright/test";
import { coachContext, studentContext, TENANT } from "../helpers/auth";
import { manage } from "../helpers/compose";
import { payStripeCheckout } from "../helpers/stripe";

test.skip(!process.env.STRIPE_E2E, "stripe-mode only (make e2e-stripe)");

test("student buys a paid course through Connect test checkout", async ({ browser }) => {
  // Coach must be paid-active first (Task 14 ran) and Connect-enabled:
  manage(["seed_connect_test", "--tenant", "demo-yoga"]);

  // Find a paid course seeded by seed_all_demos (STUDENT_BILLING data exists);
  // otherwise set one course paid via the coach API.
  const coach = await coachContext(browser);
  const list = await coach.request.get(`${TENANT}/api/v1/billing/products/`);
  const products = (await list.json()).results ?? (await list.json());
  const paid = products.find((p: any) => p.pricing_type === "paid" || Number(p.price) > 0);
  expect(paid, "no paid product in demo seed — mark one paid in recon").toBeTruthy();
  await coach.close();

  const student = await studentContext(browser);
  const init = await student.request.post(`${TENANT}/api/v1/billing/payments/initialize/`, {
    data: { items: [{ content_type: paid.content_type ?? "course", object_id: paid.id }] },
  });
  expect(init.status(), await init.text()).toBe(201);
  const body = await init.json();
  expect(body.checkout_url, "bypass still on? BILLING_BYPASS_ENABLED must be false").toBeTruthy();

  const page = await student.newPage();
  await page.goto(body.checkout_url);
  await payStripeCheckout(page);
  await expect(page).toHaveURL(new RegExp("demo-yoga.localhost"), { timeout: 30_000 });

  await expect(async () => {
    const orders = await student.request.get(`${TENANT}/api/v1/billing/orders/`);
    const data = await orders.json();
    const rows = data.results ?? data;
    expect(rows.some((o: any) => o.status === "completed")).toBeTruthy();
  }).toPass({ timeout: 45_000 });
  await student.close();
});
```

- [ ] **Step 3:** Run `make e2e-stripe`; reconcile `payment_initialize` request/response fields against `backend/apps/billing/views/payments.py` (lines 61-200, read them — the response for the Stripe branch returns the Checkout URL; confirm the key name).
- [ ] **Step 4: Commit** — `git add e2e/specs/21-stripe-marketplace.spec.ts Makefile && git commit -m "test(e2e): Connect marketplace purchase (@stripe) + connect webhook forwarding"`

---

### Task 16: Docs + full verification gate

**Files:**
- Modify: `CLAUDE.md` (Commands section + a short E2E paragraph), `.env.example` (already touched in Task 1/4 — verify coherent)

- [ ] **Step 1:** Add to CLAUDE.md's command list:

```
make e2e               # Playwright suite vs the running dev stack (Stripe specs skip)
make e2e-stripe        # + real Stripe test-mode specs (sk_test keys + make stripe-listen)
```

And one paragraph under Architecture noting: MinIO is the dev object store (`AWS_ENDPOINT_EXTERNAL` presigning), `LIVE_FAKE_ENABLED` / `EMAIL_SINK_ENABLED` are dev-only fakes (prod refuses them), e2e suite lives in `e2e/`.

- [ ] **Step 2: Full gate (verification-before-completion):**
  1. `make down && make dev` (fresh boot) — all services healthy, `make health-check` → OK.
  2. `make test` — backend suite green.
  3. `make e2e` — all local specs green, Stripe specs reported as skipped.
  4. With test keys + `make stripe-listen` running + `BILLING_BYPASS_ENABLED=false`: `make e2e-stripe` — green.
  5. `make lint` — pre-commit clean (remember: pre-commit does NOT lint the frontends; run `cd e2e && npx tsc --noEmit` yourself).
- [ ] **Step 3: Commit** — `git add CLAUDE.md && git commit -m "docs: local e2e + dev-fake commands"`
- [ ] **Step 4:** Report results with actual command output; do NOT push (user decides).
