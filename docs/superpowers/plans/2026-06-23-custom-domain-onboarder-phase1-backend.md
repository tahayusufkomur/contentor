# Custom Domain Onboarder — Phase 1 Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend for a coach to search, buy, and provision a custom domain on their tenant — availability/pricing via AWS Route 53 Domains, an annual Stripe subscription (cost × 1.20, rounded up), and end-to-end provisioning (register → Cloudflare zone → tunnel DNS → Resend sender-auth → live `Domain` row).

**Architecture:** A new public-schema Django app `apps.domains`. Third-party access (registrar, Cloudflare, Resend) sits behind ABCs + factories — exactly like `apps.billing.providers` — each with a real impl and a deterministic fake so CI never makes live calls or purchases. A resumable, idempotent provisioning state machine advances `CustomDomain.provisioning_status`, driven by the Stripe `checkout.session.completed` webhook via a Celery task.

**Tech Stack:** Django 5.1, DRF, django-tenants, Celery, boto3 (`route53domains`), Stripe, Resend, pytest.

## Global Constraints

- Domains + billing are **public-schema** concerns → `apps.domains` goes in `SHARED_APPS` (verbatim list in `config/settings/base.py:15`). It declares models, so it must NOT be a tenant-only app.
- Coach-facing endpoints run **under tenant context** and are gated by `apps.core.permissions.IsCoachOrOwner`. The active tenant is `django.db.connection.tenant`.
- Webhooks mount under `/api/webhooks/*` (outside `/api/v1/`, escapes `TenantJWTAuthentication`, runs in public schema) — same as `apps/billing/views/webhooks.py`.
- All third-party SDK failures raise the app's `RegistrarError` / `CloudflareError` / `ResendError`; views translate to `{"error": "<CODE>", "detail": ...}` with a 4xx/5xx — mirror `apps.billing.providers.types.ProviderError`.
- Money is stored in **minor units** (cents) as integers, with `currency` (ISO 4217) alongside. Never store floats for money.
- Price formula (verbatim): `price_minor = ceil(cost_minor * 1.20)` then rounded up to the whole currency unit (multiple of 100 minor units).
- Provider/service selection is settings-driven; when `DOMAINS_BYPASS_ENABLED` is true (dev/CI) the fakes are used. Default true in dev settings, **false** in prod.
- TDD: write the failing test, see it fail, implement minimally, see it pass, commit. Use existing fixtures from `backend/conftest.py` (`shared_tenant`, `restore_public`, `tenant_ctx`).
- Run tests inside the django container: `make test` runs `pytest -v`; target a file with `docker compose exec django pytest <path> -v`.

---

## File structure

```
backend/apps/domains/
  __init__.py
  apps.py                      # AppConfig
  models.py                    # CustomDomain, DomainSubscription
  pricing.py                   # compute_price()
  provisioning.py              # ProvisioningOrchestrator (state machine)
  tasks.py                     # Celery: provision_domain, renew_domain
  serializers.py               # search/result/status serializers
  views.py                     # search, checkout, status, retry, delete
  urls.py                      # /api/v1/domains/* routes
  webhooks.py                  # domain-subscription Stripe event handlers
  admin_panels.py              # adminkit registration (superadmin visibility)
  registrar/
    __init__.py                # get_registrar() factory
    types.py                   # value objects + RegistrarError
    base.py                    # Registrar ABC
    bypass.py                  # BypassRegistrar (fake)
    route53.py                 # Route53Registrar (boto3)
  cloudflare/
    __init__.py                # get_cloudflare() factory
    base.py                    # Cloudflare ABC + CloudflareError
    fake.py                    # FakeCloudflare
    client.py                  # CloudflareClient (real)
  email_auth/
    __init__.py                # get_resend_domains() factory
    base.py                    # ResendDomains ABC + ResendError
    fake.py                    # FakeResendDomains
    client.py                  # ResendDomainsClient (real)
  tests/
    __init__.py
    test_registrar_bypass.py
    test_route53.py
    test_pricing.py
    test_models.py
    test_cloudflare.py
    test_email_auth.py
    test_provisioning.py
    test_tasks.py
    test_search_api.py
    test_checkout_api.py
    test_status_api.py
    test_webhooks.py
```

Settings touched: `config/settings/base.py` (SHARED_APPS + `DOMAINS_*` settings), `config/settings/dev.py` (`DOMAINS_BYPASS_ENABLED = True`), `config/settings/prod.py` (`= False`), `config/urls.py` (include domains urls + webhook route).

---

### Task 1: Scaffold `apps.domains` and register it

**Files:**
- Create: `backend/apps/domains/__init__.py` (empty)
- Create: `backend/apps/domains/apps.py`
- Modify: `backend/config/settings/base.py:15-30` (add to `SHARED_APPS`)
- Modify: `backend/config/settings/base.py` (append `DOMAINS_*` settings block)
- Modify: `backend/config/settings/dev.py`, `backend/config/settings/prod.py`
- Create: `backend/apps/domains/tests/__init__.py` (empty)
- Test: `backend/apps/domains/tests/test_app_registered.py`

**Interfaces:**
- Produces: the `apps.domains` app label; settings `DOMAINS_BYPASS_ENABLED`, `DOMAINS_MARKUP_MULTIPLIER`, `DOMAINS_DEFAULT_CURRENCY`, `DOMAINS_FX_RATES`.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/domains/tests/test_app_registered.py
from django.apps import apps as django_apps


def test_domains_app_is_installed():
    assert django_apps.is_installed("apps.domains")


def test_domains_settings_present(settings):
    assert hasattr(settings, "DOMAINS_BYPASS_ENABLED")
    assert settings.DOMAINS_MARKUP_MULTIPLIER == 1.20
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/domains/tests/test_app_registered.py -v`
Expected: FAIL — `apps.domains` not installed / no such module.

- [ ] **Step 3: Create the app config**

```python
# backend/apps/domains/apps.py
from django.apps import AppConfig


class DomainsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.domains"
    label = "domains"
```

- [ ] **Step 4: Register in SHARED_APPS**

In `backend/config/settings/base.py`, add `"apps.domains",` to the `SHARED_APPS` list immediately after `"apps.platform_email",`.

- [ ] **Step 5: Add settings block**

Append to `backend/config/settings/base.py`:

```python
# --- Custom domains (apps.domains) -------------------------------------------
# When true, registrar/Cloudflare/Resend use deterministic fakes (no live API
# calls or real purchases). Overridden per-environment below.
DOMAINS_BYPASS_ENABLED = True
DOMAINS_MARKUP_MULTIPLIER = 1.20
DOMAINS_DEFAULT_CURRENCY = "EUR"
# Static USD->currency FX table (markup + ceil rounding absorbs drift). Keyed by
# ISO 4217. 1 USD = N units of the currency.
DOMAINS_FX_RATES = {"USD": 1.0, "EUR": 0.92, "TRY": 32.0}

# AWS Route 53 Domains
AWS_ROUTE53_REGION = os.environ.get("AWS_ROUTE53_REGION", "us-east-1")
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY", "")

# Cloudflare
CLOUDFLARE_API_TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")
CLOUDFLARE_ACCOUNT_ID = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
CLOUDFLARE_TUNNEL_HOSTNAME = os.environ.get("CLOUDFLARE_TUNNEL_HOSTNAME", "")

# Resend (sender auth) — reuses the campaign Resend key if already set.
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
```

(If `import os` is not already at the top of `base.py`, confirm it is — it is used elsewhere in the file.)

- [ ] **Step 6: Per-environment overrides**

In `backend/config/settings/dev.py` add `DOMAINS_BYPASS_ENABLED = True`.
In `backend/config/settings/prod.py` add `DOMAINS_BYPASS_ENABLED = False`.

- [ ] **Step 7: Run test to verify it passes**

Run: `docker compose exec django pytest apps/domains/tests/test_app_registered.py -v`
Expected: PASS (both tests).

- [ ] **Step 8: Commit**

```bash
git add backend/apps/domains backend/config/settings
git commit -m "feat(domains): scaffold apps.domains app + settings"
```

---

### Task 2: Registrar abstraction + value objects + BypassRegistrar + factory

**Files:**
- Create: `backend/apps/domains/registrar/__init__.py`
- Create: `backend/apps/domains/registrar/types.py`
- Create: `backend/apps/domains/registrar/base.py`
- Create: `backend/apps/domains/registrar/bypass.py`
- Test: `backend/apps/domains/tests/test_registrar_bypass.py`

**Interfaces:**
- Produces:
  - `DomainAvailability(domain: str, available: bool)` (frozen dataclass)
  - `DomainPrice(domain: str, cost_minor: int, currency: str)` (frozen dataclass; `cost_minor` is the **registrar cost** in USD minor units)
  - `RegisterResult(domain: str, operation_id: str)` (frozen dataclass)
  - `RegistrarError(Exception)` with `.code: str`
  - `Registrar` ABC with: `check_availability(self, domain: str) -> DomainAvailability`, `suggest(self, domain: str, limit: int = 5) -> list[DomainAvailability]`, `get_price(self, domain: str) -> DomainPrice`, `register(self, *, domain: str, contact: dict, nameservers: list[str]) -> RegisterResult`, `set_nameservers(self, *, domain: str, nameservers: list[str]) -> None`, `renew(self, *, domain: str) -> RegisterResult`
  - `get_registrar() -> Registrar` factory (returns `BypassRegistrar` when `settings.DOMAINS_BYPASS_ENABLED` else `Route53Registrar`)

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/domains/tests/test_registrar_bypass.py
import pytest

from apps.domains.registrar import get_registrar
from apps.domains.registrar.bypass import BypassRegistrar
from apps.domains.registrar.types import DomainAvailability, RegistrarError


@pytest.fixture()
def reg():
    return BypassRegistrar()


def test_factory_returns_bypass_when_enabled(settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    assert isinstance(get_registrar(), BypassRegistrar)


def test_available_domain(reg):
    res = reg.check_availability("freecoach.com")
    assert isinstance(res, DomainAvailability)
    assert res.available is True


def test_taken_domain(reg):
    # Bypass treats anything containing "taken" as unavailable (deterministic).
    res = reg.check_availability("taken-domain.com")
    assert res.available is False


def test_price_is_usd_minor_units(reg):
    price = reg.get_price("freecoach.com")
    assert price.currency == "USD"
    assert price.cost_minor == 999  # fixed bypass price $9.99


def test_register_returns_operation(reg):
    out = reg.register(domain="freecoach.com", contact={"email": "c@x.com"}, nameservers=["a.ns", "b.ns"])
    assert out.domain == "freecoach.com"
    assert out.operation_id


def test_register_taken_raises(reg):
    with pytest.raises(RegistrarError) as exc:
        reg.register(domain="taken-domain.com", contact={}, nameservers=[])
    assert exc.value.code == "UNAVAILABLE"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/domains/tests/test_registrar_bypass.py -v`
Expected: FAIL — module `apps.domains.registrar` not found.

- [ ] **Step 3: Implement value objects + error**

```python
# backend/apps/domains/registrar/types.py
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DomainAvailability:
    domain: str
    available: bool


@dataclass(frozen=True)
class DomainPrice:
    domain: str
    cost_minor: int  # registrar wholesale cost, USD minor units
    currency: str


@dataclass(frozen=True)
class RegisterResult:
    domain: str
    operation_id: str


class RegistrarError(Exception):
    def __init__(self, message: str, *, code: str = "REGISTRAR_ERROR") -> None:
        super().__init__(message)
        self.code = code
```

- [ ] **Step 4: Implement the ABC**

```python
# backend/apps/domains/registrar/base.py
from __future__ import annotations

from abc import ABC, abstractmethod

from .types import DomainAvailability, DomainPrice, RegisterResult


class Registrar(ABC):
    name: str = ""

    @abstractmethod
    def check_availability(self, domain: str) -> DomainAvailability: ...

    @abstractmethod
    def suggest(self, domain: str, limit: int = 5) -> list[DomainAvailability]: ...

    @abstractmethod
    def get_price(self, domain: str) -> DomainPrice: ...

    @abstractmethod
    def register(self, *, domain: str, contact: dict, nameservers: list[str]) -> RegisterResult: ...

    @abstractmethod
    def set_nameservers(self, *, domain: str, nameservers: list[str]) -> None: ...

    @abstractmethod
    def renew(self, *, domain: str) -> RegisterResult: ...
```

- [ ] **Step 5: Implement BypassRegistrar**

```python
# backend/apps/domains/registrar/bypass.py
from __future__ import annotations

import uuid

from .base import Registrar
from .types import DomainAvailability, DomainPrice, RegisterResult, RegistrarError

# Deterministic: a domain is "taken" iff its name contains this marker.
_TAKEN_MARKER = "taken"
_FIXED_COST_MINOR = 999  # $9.99


class BypassRegistrar(Registrar):
    name = "bypass"

    def _available(self, domain: str) -> bool:
        return _TAKEN_MARKER not in domain.lower()

    def check_availability(self, domain: str) -> DomainAvailability:
        return DomainAvailability(domain=domain, available=self._available(domain))

    def suggest(self, domain: str, limit: int = 5) -> list[DomainAvailability]:
        stem = domain.split(".")[0]
        cands = [f"{stem}{i}.com" for i in range(1, limit + 1)]
        return [DomainAvailability(domain=d, available=self._available(d)) for d in cands]

    def get_price(self, domain: str) -> DomainPrice:
        return DomainPrice(domain=domain, cost_minor=_FIXED_COST_MINOR, currency="USD")

    def register(self, *, domain: str, contact: dict, nameservers: list[str]) -> RegisterResult:
        if not self._available(domain):
            raise RegistrarError(f"{domain} is unavailable", code="UNAVAILABLE")
        return RegisterResult(domain=domain, operation_id=f"bypass-op-{uuid.uuid4().hex[:12]}")

    def set_nameservers(self, *, domain: str, nameservers: list[str]) -> None:
        return None

    def renew(self, *, domain: str) -> RegisterResult:
        return RegisterResult(domain=domain, operation_id=f"bypass-renew-{uuid.uuid4().hex[:12]}")
```

- [ ] **Step 6: Implement the factory**

```python
# backend/apps/domains/registrar/__init__.py
from __future__ import annotations

from django.conf import settings

from .base import Registrar


def get_registrar() -> Registrar:
    if settings.DOMAINS_BYPASS_ENABLED:
        from .bypass import BypassRegistrar

        return BypassRegistrar()
    from .route53 import Route53Registrar

    return Route53Registrar()
```

- [ ] **Step 7: Run test to verify it passes**

Run: `docker compose exec django pytest apps/domains/tests/test_registrar_bypass.py -v`
Expected: PASS (all 6 tests).

- [ ] **Step 8: Commit**

```bash
git add backend/apps/domains/registrar backend/apps/domains/tests/test_registrar_bypass.py
git commit -m "feat(domains): registrar abstraction + bypass impl + factory"
```

---

### Task 3: Pricing

**Files:**
- Create: `backend/apps/domains/pricing.py`
- Test: `backend/apps/domains/tests/test_pricing.py`

**Interfaces:**
- Consumes: `settings.DOMAINS_MARKUP_MULTIPLIER`, `settings.DOMAINS_FX_RATES`.
- Produces: `compute_price(cost_minor_usd: int, currency: str) -> tuple[int, float]` returning `(price_minor, fx_rate)`. `price_minor` is in the target currency's minor units, after FX, ×markup, ceil-rounded **up to the whole unit** (multiple of 100).

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/domains/tests/test_pricing.py
from apps.domains.pricing import compute_price


def test_eur_markup_and_ceil(settings):
    # $9.99 cost, EUR rate 0.92 -> 9.99*0.92 = 9.19 EUR cost -> *1.20 = 11.03 -> ceil to 12.00
    settings.DOMAINS_MARKUP_MULTIPLIER = 1.20
    settings.DOMAINS_FX_RATES = {"USD": 1.0, "EUR": 0.92, "TRY": 32.0}
    price_minor, fx = compute_price(999, "EUR")
    assert price_minor == 1200  # €12.00
    assert fx == 0.92


def test_usd_passthrough_ceil(settings):
    settings.DOMAINS_MARKUP_MULTIPLIER = 1.20
    settings.DOMAINS_FX_RATES = {"USD": 1.0}
    # $9.99 * 1.20 = 11.988 -> ceil to whole unit = $12.00
    price_minor, fx = compute_price(999, "USD")
    assert price_minor == 1200


def test_unknown_currency_falls_back_to_usd_rate(settings):
    settings.DOMAINS_FX_RATES = {"USD": 1.0}
    price_minor, fx = compute_price(999, "GBP")
    assert fx == 1.0
    assert price_minor == 1200
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/domains/tests/test_pricing.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement pricing**

```python
# backend/apps/domains/pricing.py
from __future__ import annotations

import math

from django.conf import settings


def compute_price(cost_minor_usd: int, currency: str) -> tuple[int, float]:
    """Coach-facing yearly price in `currency` minor units, plus the fx rate used.

    price = ceil( cost_usd * fx * markup ) rounded UP to the whole currency unit.
    """
    rates = settings.DOMAINS_FX_RATES
    fx = float(rates.get(currency, rates["USD"]))
    markup = float(settings.DOMAINS_MARKUP_MULTIPLIER)
    marked_up_minor = cost_minor_usd * fx * markup
    # round up to the whole unit (multiple of 100 minor units)
    whole_units = math.ceil(marked_up_minor / 100.0)
    return whole_units * 100, fx
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec django pytest apps/domains/tests/test_pricing.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/domains/pricing.py backend/apps/domains/tests/test_pricing.py
git commit -m "feat(domains): yearly price calculation (fx + 20% markup, ceil)"
```

---

### Task 4: Models — CustomDomain + DomainSubscription

**Files:**
- Create: `backend/apps/domains/models.py`
- Create: migration `backend/apps/domains/migrations/0001_initial.py` (via makemigrations)
- Test: `backend/apps/domains/tests/test_models.py`

**Interfaces:**
- Produces:
  - `CustomDomain` with fields: `tenant` (FK `core.Tenant`, related_name `custom_domains`), `domain` (unique), `registrar` (char, default `"route53"`), `registrar_status` (char, default `""`), `cloudflare_zone_id` (char, blank), `resend_domain_id` (char, blank), `forward_to_email` (email, blank), `contact` (JSON, default dict), `cost_minor` (int), `price_minor` (int), `currency` (char), `fx_rate` (float, default 1.0), `provisioning_status` (choices below, default `"pending"`), `failed_step` (char, blank), `expires_at` (datetime null), `auto_renew` (bool default True), `is_primary` (bool default True), `created_at`/`updated_at`.
  - `PROVISIONING_STATUSES = ["pending","registering","dns_zone","dns_records","email_auth","ssl","live","failed","lapsed"]`
  - `DomainSubscription`: `tenant` FK, `custom_domain` OneToOne (related_name `subscription`), `provider` (char default `"stripe"`), `provider_subscription_id` (char, blank, db_index), `provider_customer_id` (char, blank), `status` (char default `"incomplete"`), `current_period_start`/`current_period_end` (datetime null), `created_at`/`updated_at`.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/domains/tests/test_models.py
import pytest

from apps.domains.models import CustomDomain, DomainSubscription

pytestmark = pytest.mark.django_db


def test_create_custom_domain(restore_public):
    cd = CustomDomain.objects.create(
        tenant=restore_public,
        domain="freecoach.com",
        cost_minor=999,
        price_minor=1200,
        currency="EUR",
    )
    assert cd.provisioning_status == "pending"
    assert cd.auto_renew is True
    assert cd.is_primary is True
    assert str(cd) == "freecoach.com"


def test_domain_is_unique(restore_public):
    CustomDomain.objects.create(tenant=restore_public, domain="dupe.com", cost_minor=1, price_minor=1, currency="EUR")
    with pytest.raises(Exception):
        CustomDomain.objects.create(tenant=restore_public, domain="dupe.com", cost_minor=1, price_minor=1, currency="EUR")


def test_subscription_one_to_one(restore_public):
    cd = CustomDomain.objects.create(tenant=restore_public, domain="sub.com", cost_minor=1, price_minor=1, currency="EUR")
    sub = DomainSubscription.objects.create(tenant=restore_public, custom_domain=cd)
    assert cd.subscription == sub
    assert sub.status == "incomplete"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/domains/tests/test_models.py -v`
Expected: FAIL — cannot import `CustomDomain`.

- [ ] **Step 3: Implement models**

```python
# backend/apps/domains/models.py
from __future__ import annotations

from django.db import models

PROVISIONING_STATUSES = [
    ("pending", "Pending"),
    ("registering", "Registering"),
    ("dns_zone", "Creating DNS zone"),
    ("dns_records", "Creating DNS records"),
    ("email_auth", "Configuring email"),
    ("ssl", "Issuing SSL"),
    ("live", "Live"),
    ("failed", "Failed"),
    ("lapsed", "Lapsed"),
]


class CustomDomain(models.Model):
    tenant = models.ForeignKey("core.Tenant", on_delete=models.CASCADE, related_name="custom_domains")
    domain = models.CharField(max_length=255, unique=True)
    registrar = models.CharField(max_length=20, default="route53")
    registrar_status = models.CharField(max_length=40, blank=True, default="")
    cloudflare_zone_id = models.CharField(max_length=64, blank=True, default="")
    resend_domain_id = models.CharField(max_length=64, blank=True, default="")
    forward_to_email = models.EmailField(blank=True, default="")
    contact = models.JSONField(default=dict, blank=True)
    cost_minor = models.IntegerField()
    price_minor = models.IntegerField()
    currency = models.CharField(max_length=3)
    fx_rate = models.FloatField(default=1.0)
    provisioning_status = models.CharField(max_length=20, choices=PROVISIONING_STATUSES, default="pending")
    failed_step = models.CharField(max_length=40, blank=True, default="")
    expires_at = models.DateTimeField(null=True, blank=True)
    auto_renew = models.BooleanField(default=True)
    is_primary = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "domains"

    def __str__(self) -> str:
        return self.domain


class DomainSubscription(models.Model):
    tenant = models.ForeignKey("core.Tenant", on_delete=models.CASCADE, related_name="domain_subscriptions")
    custom_domain = models.OneToOneField(CustomDomain, on_delete=models.CASCADE, related_name="subscription")
    provider = models.CharField(max_length=20, default="stripe")
    provider_subscription_id = models.CharField(max_length=255, blank=True, default="", db_index=True)
    provider_customer_id = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=20, default="incomplete")
    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "domains"

    def __str__(self) -> str:
        return f"{self.custom_domain.domain} ({self.status})"
```

- [ ] **Step 4: Generate the migration**

Run: `docker compose exec django python manage.py makemigrations domains`
Expected: creates `apps/domains/migrations/0001_initial.py`. (Ensure `apps/domains/migrations/__init__.py` exists — makemigrations creates it.)

- [ ] **Step 5: Apply to the shared (public) schema**

Run: `docker compose exec django python manage.py migrate_schemas --shared`
Expected: applies `domains.0001_initial` to the public schema.

- [ ] **Step 6: Run test to verify it passes**

Run: `docker compose exec django pytest apps/domains/tests/test_models.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/domains/models.py backend/apps/domains/migrations backend/apps/domains/tests/test_models.py
git commit -m "feat(domains): CustomDomain + DomainSubscription models"
```

---

### Task 5: Route53Registrar (real boto3 impl)

**Files:**
- Create: `backend/apps/domains/registrar/route53.py`
- Test: `backend/apps/domains/tests/test_route53.py`

**Interfaces:**
- Consumes: `settings.AWS_ROUTE53_REGION`, AWS creds. boto3 `route53domains` client.
- Produces: `Route53Registrar(Registrar)` implementing all ABC methods. Uses `CheckDomainAvailability`, `GetDomainSuggestions`, `ListPrices`, `RegisterDomain`, `UpdateDomainNameservers`, `RenewDomain`.

- [ ] **Step 1: Write the failing test (boto3 mocked via unittest.mock)**

```python
# backend/apps/domains/tests/test_route53.py
from unittest.mock import MagicMock, patch

from apps.domains.registrar.route53 import Route53Registrar
from apps.domains.registrar.types import DomainAvailability, RegistrarError


def _registrar_with_client(client):
    reg = Route53Registrar()
    reg._client = client  # inject mock
    return reg


def test_check_availability_available():
    client = MagicMock()
    client.check_domain_availability.return_value = {"Availability": "AVAILABLE"}
    reg = _registrar_with_client(client)
    out = reg.check_availability("freecoach.com")
    assert out == DomainAvailability(domain="freecoach.com", available=True)
    client.check_domain_availability.assert_called_once_with(DomainName="freecoach.com")


def test_check_availability_taken():
    client = MagicMock()
    client.check_domain_availability.return_value = {"Availability": "UNAVAILABLE"}
    reg = _registrar_with_client(client)
    assert reg.check_availability("x.com").available is False


def test_get_price_returns_usd_minor():
    client = MagicMock()
    client.list_prices.return_value = {
        "Prices": [{"Name": "com", "RegistrationPrice": {"Price": 9.99, "Currency": "USD"}}]
    }
    reg = _registrar_with_client(client)
    price = reg.get_price("freecoach.com")
    assert price.cost_minor == 999
    assert price.currency == "USD"


def test_register_calls_aws():
    client = MagicMock()
    client.register_domain.return_value = {"OperationId": "op-123"}
    reg = _registrar_with_client(client)
    out = reg.register(
        domain="freecoach.com",
        contact={"FirstName": "A", "LastName": "B", "Email": "c@x.com"},
        nameservers=["a.ns.cloudflare.com", "b.ns.cloudflare.com"],
    )
    assert out.operation_id == "op-123"
    kwargs = client.register_domain.call_args.kwargs
    assert kwargs["DomainName"] == "freecoach.com"
    assert kwargs["DurationInYears"] == 1


def test_aws_error_wrapped():
    client = MagicMock()
    client.check_domain_availability.side_effect = Exception("boom")
    reg = _registrar_with_client(client)
    try:
        reg.check_availability("x.com")
        assert False, "expected RegistrarError"
    except RegistrarError as exc:
        assert exc.code == "REGISTRAR_ERROR"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/domains/tests/test_route53.py -v`
Expected: FAIL — module `route53` not found.

- [ ] **Step 3: Implement Route53Registrar**

```python
# backend/apps/domains/registrar/route53.py
from __future__ import annotations

import boto3
from django.conf import settings

from .base import Registrar
from .types import DomainAvailability, DomainPrice, RegisterResult, RegistrarError


def _tld(domain: str) -> str:
    return domain.split(".", 1)[1] if "." in domain else domain


class Route53Registrar(Registrar):
    name = "route53"

    def __init__(self) -> None:
        self._client = None

    @property
    def client(self):
        if self._client is None:
            self._client = boto3.client(
                "route53domains",
                region_name=settings.AWS_ROUTE53_REGION,
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID or None,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY or None,
            )
        return self._client

    def _wrap(self, fn, *args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except RegistrarError:
            raise
        except Exception as exc:  # noqa: BLE001 — translate any SDK failure
            raise RegistrarError(str(exc), code="REGISTRAR_ERROR") from exc

    def check_availability(self, domain: str) -> DomainAvailability:
        resp = self._wrap(self.client.check_domain_availability, DomainName=domain)
        return DomainAvailability(domain=domain, available=resp.get("Availability") == "AVAILABLE")

    def suggest(self, domain: str, limit: int = 5) -> list[DomainAvailability]:
        resp = self._wrap(
            self.client.get_domain_suggestions,
            DomainName=domain,
            SuggestionCount=limit,
            OnlyAvailable=True,
        )
        return [
            DomainAvailability(domain=s["DomainName"], available=s.get("Availability") == "AVAILABLE")
            for s in resp.get("SuggestionsList", [])
        ]

    def get_price(self, domain: str) -> DomainPrice:
        resp = self._wrap(self.client.list_prices, Tld=_tld(domain))
        prices = resp.get("Prices", [])
        if not prices:
            raise RegistrarError(f"No price for {domain}", code="PRICE_NOT_AVAILABLE")
        reg_price = prices[0]["RegistrationPrice"]
        return DomainPrice(
            domain=domain,
            cost_minor=round(float(reg_price["Price"]) * 100),
            currency=reg_price.get("Currency", "USD"),
        )

    def register(self, *, domain: str, contact: dict, nameservers: list[str]) -> RegisterResult:
        kwargs = {
            "DomainName": domain,
            "DurationInYears": 1,
            "AutoRenew": False,  # we control renewal via Stripe webhooks
            "AdminContact": contact,
            "RegistrantContact": contact,
            "TechContact": contact,
        }
        if nameservers:
            kwargs["Nameservers"] = [{"Name": ns} for ns in nameservers]
        resp = self._wrap(self.client.register_domain, **kwargs)
        return RegisterResult(domain=domain, operation_id=resp["OperationId"])

    def set_nameservers(self, *, domain: str, nameservers: list[str]) -> None:
        self._wrap(
            self.client.update_domain_nameservers,
            DomainName=domain,
            Nameservers=[{"Name": ns} for ns in nameservers],
        )

    def renew(self, *, domain: str) -> RegisterResult:
        resp = self._wrap(self.client.renew_domain, DomainName=domain, DurationInYears=1)
        return RegisterResult(domain=domain, operation_id=resp["OperationId"])
```

(The test injects a mock into `_client`, so the `client` property's lazy boto3 init is never triggered in CI.)

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec django pytest apps/domains/tests/test_route53.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/domains/registrar/route53.py backend/apps/domains/tests/test_route53.py
git commit -m "feat(domains): Route 53 registrar implementation"
```

---

### Task 6: Cloudflare service abstraction + fake + real client

**Files:**
- Create: `backend/apps/domains/cloudflare/__init__.py`
- Create: `backend/apps/domains/cloudflare/base.py`
- Create: `backend/apps/domains/cloudflare/fake.py`
- Create: `backend/apps/domains/cloudflare/client.py`
- Test: `backend/apps/domains/tests/test_cloudflare.py`

**Interfaces:**
- Produces:
  - `CloudflareError(Exception)` with `.code`
  - `Cloudflare` ABC: `create_zone(self, domain: str) -> dict` (returns `{"zone_id": str, "name_servers": list[str]}`), `upsert_dns_record(self, *, zone_id: str, type: str, name: str, content: str, proxied: bool = True) -> str` (returns record id), `enable_email_routing(self, *, zone_id: str, forward_to: str) -> None`, `get_ssl_status(self, *, zone_id: str) -> str` (returns `"active"|"pending"`)
  - `FakeCloudflare(Cloudflare)` — in-memory, deterministic NS `["a.ns.cloudflare.com","b.ns.cloudflare.com"]`, SSL `"active"`
  - `get_cloudflare() -> Cloudflare` factory (fake when `DOMAINS_BYPASS_ENABLED`)

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/domains/tests/test_cloudflare.py
from apps.domains.cloudflare import get_cloudflare
from apps.domains.cloudflare.fake import FakeCloudflare


def test_factory_returns_fake(settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    assert isinstance(get_cloudflare(), FakeCloudflare)


def test_create_zone_returns_nameservers():
    cf = FakeCloudflare()
    out = cf.create_zone("freecoach.com")
    assert out["zone_id"]
    assert out["name_servers"] == ["a.ns.cloudflare.com", "b.ns.cloudflare.com"]


def test_upsert_dns_record_returns_id():
    cf = FakeCloudflare()
    zone = cf.create_zone("freecoach.com")["zone_id"]
    rid = cf.upsert_dns_record(zone_id=zone, type="CNAME", name="freecoach.com", content="tunnel.example", proxied=True)
    assert rid


def test_ssl_status_active():
    cf = FakeCloudflare()
    zone = cf.create_zone("freecoach.com")["zone_id"]
    assert cf.get_ssl_status(zone_id=zone) == "active"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/domains/tests/test_cloudflare.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement ABC + error**

```python
# backend/apps/domains/cloudflare/base.py
from __future__ import annotations

from abc import ABC, abstractmethod


class CloudflareError(Exception):
    def __init__(self, message: str, *, code: str = "CLOUDFLARE_ERROR") -> None:
        super().__init__(message)
        self.code = code


class Cloudflare(ABC):
    @abstractmethod
    def create_zone(self, domain: str) -> dict: ...

    @abstractmethod
    def upsert_dns_record(self, *, zone_id: str, type: str, name: str, content: str, proxied: bool = True) -> str: ...

    @abstractmethod
    def enable_email_routing(self, *, zone_id: str, forward_to: str) -> None: ...

    @abstractmethod
    def get_ssl_status(self, *, zone_id: str) -> str: ...
```

- [ ] **Step 4: Implement FakeCloudflare**

```python
# backend/apps/domains/cloudflare/fake.py
from __future__ import annotations

import uuid

from .base import Cloudflare


class FakeCloudflare(Cloudflare):
    def __init__(self) -> None:
        self.zones: dict[str, dict] = {}

    def create_zone(self, domain: str) -> dict:
        zone_id = f"zone-{uuid.uuid4().hex[:12]}"
        self.zones[zone_id] = {"domain": domain, "records": [], "email_forward": ""}
        return {"zone_id": zone_id, "name_servers": ["a.ns.cloudflare.com", "b.ns.cloudflare.com"]}

    def upsert_dns_record(self, *, zone_id: str, type: str, name: str, content: str, proxied: bool = True) -> str:
        rid = f"rec-{uuid.uuid4().hex[:12]}"
        self.zones.setdefault(zone_id, {"records": []})["records"].append(
            {"id": rid, "type": type, "name": name, "content": content, "proxied": proxied}
        )
        return rid

    def enable_email_routing(self, *, zone_id: str, forward_to: str) -> None:
        self.zones.setdefault(zone_id, {})["email_forward"] = forward_to

    def get_ssl_status(self, *, zone_id: str) -> str:
        return "active"
```

- [ ] **Step 5: Implement real client + factory**

```python
# backend/apps/domains/cloudflare/client.py
from __future__ import annotations

import requests
from django.conf import settings

from .base import Cloudflare, CloudflareError

_BASE = "https://api.cloudflare.com/client/v4"


class CloudflareClient(Cloudflare):
    def __init__(self) -> None:
        self._headers = {
            "Authorization": f"Bearer {settings.CLOUDFLARE_API_TOKEN}",
            "Content-Type": "application/json",
        }
        self._account_id = settings.CLOUDFLARE_ACCOUNT_ID

    def _post(self, path: str, payload: dict) -> dict:
        resp = requests.post(f"{_BASE}{path}", json=payload, headers=self._headers, timeout=30)
        data = resp.json()
        if not data.get("success"):
            raise CloudflareError(str(data.get("errors")), code="CLOUDFLARE_ERROR")
        return data["result"]

    def _get(self, path: str) -> dict:
        resp = requests.get(f"{_BASE}{path}", headers=self._headers, timeout=30)
        data = resp.json()
        if not data.get("success"):
            raise CloudflareError(str(data.get("errors")), code="CLOUDFLARE_ERROR")
        return data["result"]

    def create_zone(self, domain: str) -> dict:
        result = self._post("/zones", {"name": domain, "account": {"id": self._account_id}, "type": "full"})
        return {"zone_id": result["id"], "name_servers": result.get("name_servers", [])}

    def upsert_dns_record(self, *, zone_id: str, type: str, name: str, content: str, proxied: bool = True) -> str:
        result = self._post(
            f"/zones/{zone_id}/dns_records",
            {"type": type, "name": name, "content": content, "proxied": proxied},
        )
        return result["id"]

    def enable_email_routing(self, *, zone_id: str, forward_to: str) -> None:
        self._post(f"/zones/{zone_id}/email/routing/enable", {})
        # Catch-all rule -> forward to the coach's address.
        self._post(
            f"/zones/{zone_id}/email/routing/rules/catch_all",
            {
                "enabled": True,
                "actions": [{"type": "forward", "value": [forward_to]}],
                "matchers": [{"type": "all"}],
            },
        )

    def get_ssl_status(self, *, zone_id: str) -> str:
        result = self._get(f"/zones/{zone_id}/ssl/universal/settings")
        return "active" if result.get("enabled") else "pending"
```

```python
# backend/apps/domains/cloudflare/__init__.py
from __future__ import annotations

from django.conf import settings

from .base import Cloudflare


def get_cloudflare() -> Cloudflare:
    if settings.DOMAINS_BYPASS_ENABLED:
        from .fake import FakeCloudflare

        return FakeCloudflare()
    from .client import CloudflareClient

    return CloudflareClient()
```

- [ ] **Step 6: Run test to verify it passes**

Run: `docker compose exec django pytest apps/domains/tests/test_cloudflare.py -v`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/domains/cloudflare backend/apps/domains/tests/test_cloudflare.py
git commit -m "feat(domains): Cloudflare service abstraction + fake + client"
```

---

### Task 7: Resend sender-auth helper + fake

**Files:**
- Create: `backend/apps/domains/email_auth/__init__.py`
- Create: `backend/apps/domains/email_auth/base.py`
- Create: `backend/apps/domains/email_auth/fake.py`
- Create: `backend/apps/domains/email_auth/client.py`
- Test: `backend/apps/domains/tests/test_email_auth.py`

**Interfaces:**
- Produces:
  - `ResendError(Exception)` with `.code`
  - `ResendDomains` ABC: `create_domain(self, domain: str) -> dict` (returns `{"resend_domain_id": str, "records": list[dict]}` where each record is `{"type","name","value"}`), `get_status(self, *, resend_domain_id: str) -> str` (`"verified"|"pending"`)
  - `FakeResendDomains` (deterministic id + SPF/DKIM records, status `"verified"`)
  - `get_resend_domains() -> ResendDomains` factory (fake when `DOMAINS_BYPASS_ENABLED`)

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/domains/tests/test_email_auth.py
from apps.domains.email_auth import get_resend_domains
from apps.domains.email_auth.fake import FakeResendDomains


def test_factory_returns_fake(settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    assert isinstance(get_resend_domains(), FakeResendDomains)


def test_create_domain_returns_records():
    r = FakeResendDomains()
    out = r.create_domain("freecoach.com")
    assert out["resend_domain_id"]
    types = {rec["type"] for rec in out["records"]}
    assert {"TXT", "MX"} & types  # SPF/DKIM (TXT) + return-path (MX)


def test_status_verified():
    r = FakeResendDomains()
    out = r.create_domain("freecoach.com")
    assert r.get_status(resend_domain_id=out["resend_domain_id"]) == "verified"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/domains/tests/test_email_auth.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement ABC + error**

```python
# backend/apps/domains/email_auth/base.py
from __future__ import annotations

from abc import ABC, abstractmethod


class ResendError(Exception):
    def __init__(self, message: str, *, code: str = "RESEND_ERROR") -> None:
        super().__init__(message)
        self.code = code


class ResendDomains(ABC):
    @abstractmethod
    def create_domain(self, domain: str) -> dict: ...

    @abstractmethod
    def get_status(self, *, resend_domain_id: str) -> str: ...
```

- [ ] **Step 4: Implement fake**

```python
# backend/apps/domains/email_auth/fake.py
from __future__ import annotations

import uuid

from .base import ResendDomains


class FakeResendDomains(ResendDomains):
    def create_domain(self, domain: str) -> dict:
        return {
            "resend_domain_id": f"resend-{uuid.uuid4().hex[:12]}",
            "records": [
                {"type": "TXT", "name": domain, "value": "v=spf1 include:resend.com ~all"},
                {"type": "TXT", "name": f"resend._domainkey.{domain}", "value": "p=FAKEDKIM"},
                {"type": "MX", "name": f"send.{domain}", "value": "feedback-smtp.resend.com"},
            ],
        }

    def get_status(self, *, resend_domain_id: str) -> str:
        return "verified"
```

- [ ] **Step 5: Implement real client + factory**

```python
# backend/apps/domains/email_auth/client.py
from __future__ import annotations

import requests
from django.conf import settings

from .base import ResendDomains, ResendError

_BASE = "https://api.resend.com"


class ResendDomainsClient(ResendDomains):
    def __init__(self) -> None:
        self._headers = {"Authorization": f"Bearer {settings.RESEND_API_KEY}"}

    def create_domain(self, domain: str) -> dict:
        resp = requests.post(f"{_BASE}/domains", json={"name": domain}, headers=self._headers, timeout=30)
        if resp.status_code >= 400:
            raise ResendError(resp.text, code="RESEND_ERROR")
        data = resp.json()
        records = [
            {"type": r.get("type", "TXT"), "name": r.get("name", ""), "value": r.get("value", "")}
            for r in data.get("records", [])
        ]
        return {"resend_domain_id": data["id"], "records": records}

    def get_status(self, *, resend_domain_id: str) -> str:
        resp = requests.get(f"{_BASE}/domains/{resend_domain_id}", headers=self._headers, timeout=30)
        if resp.status_code >= 400:
            raise ResendError(resp.text, code="RESEND_ERROR")
        return "verified" if resp.json().get("status") == "verified" else "pending"
```

```python
# backend/apps/domains/email_auth/__init__.py
from __future__ import annotations

from django.conf import settings

from .base import ResendDomains


def get_resend_domains() -> ResendDomains:
    if settings.DOMAINS_BYPASS_ENABLED:
        from .fake import FakeResendDomains

        return FakeResendDomains()
    from .client import ResendDomainsClient

    return ResendDomainsClient()
```

- [ ] **Step 6: Run test to verify it passes**

Run: `docker compose exec django pytest apps/domains/tests/test_email_auth.py -v`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/domains/email_auth backend/apps/domains/tests/test_email_auth.py
git commit -m "feat(domains): Resend sender-auth helper + fake"
```

---

### Task 8: Provisioning state machine

**Files:**
- Create: `backend/apps/domains/provisioning.py`
- Test: `backend/apps/domains/tests/test_provisioning.py`

**Interfaces:**
- Consumes: `get_registrar()`, `get_cloudflare()`, `get_resend_domains()`, the `CustomDomain` model, `core.Domain`.
- Produces: `provision(custom_domain: CustomDomain) -> None` — advances `provisioning_status` through `registering → dns_zone → dns_records → email_auth → ssl → live`, idempotent per step (re-running a `live` domain is a no-op; re-running a `failed` domain resumes from `failed_step`). On any step failure, sets `provisioning_status="failed"` + `failed_step=<step>` and re-raises.
  - Each step has a guard: skip if its output field is already populated.
  - At `live`, creates a `core.Domain` row (`domain=cd.domain`, `tenant=cd.tenant`, `is_primary=cd.is_primary`, `ssl_status="active"`).

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/domains/tests/test_provisioning.py
import pytest

from apps.core.models import Domain
from apps.domains.models import CustomDomain
from apps.domains.provisioning import provision

pytestmark = pytest.mark.django_db


def _make(restore_public, domain="freecoach.com"):
    return CustomDomain.objects.create(
        tenant=restore_public, domain=domain, cost_minor=999, price_minor=1200, currency="EUR",
        forward_to_email="coach@personal.com", contact={"Email": "coach@personal.com"},
        provisioning_status="pending",
    )


def test_full_provision_reaches_live(restore_public, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    cd = _make(restore_public)
    provision(cd)
    cd.refresh_from_db()
    assert cd.provisioning_status == "live"
    assert cd.cloudflare_zone_id
    assert cd.resend_domain_id
    assert Domain.objects.filter(domain="freecoach.com", tenant=restore_public).exists()


def test_provision_is_idempotent(restore_public, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    cd = _make(restore_public, domain="idem.com")
    provision(cd)
    zone1 = cd.cloudflare_zone_id
    provision(cd)  # second run must not create a second core.Domain row or new zone
    cd.refresh_from_db()
    assert cd.cloudflare_zone_id == zone1
    assert Domain.objects.filter(domain="idem.com").count() == 1


def test_failure_records_failed_step(restore_public, settings, monkeypatch):
    settings.DOMAINS_BYPASS_ENABLED = True
    cd = _make(restore_public, domain="fail.com")

    from apps.domains import provisioning

    def boom(*a, **k):
        raise RuntimeError("registrar down")

    # Force the registering step to fail.
    monkeypatch.setattr(provisioning, "_step_register", boom)
    with pytest.raises(RuntimeError):
        provision(cd)
    cd.refresh_from_db()
    assert cd.provisioning_status == "failed"
    assert cd.failed_step == "registering"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/domains/tests/test_provisioning.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the orchestrator**

```python
# backend/apps/domains/provisioning.py
from __future__ import annotations

import logging

from apps.core.models import Domain

from .cloudflare import get_cloudflare
from .email_auth import get_resend_domains
from .registrar import get_registrar

logger = logging.getLogger(__name__)


def _step_register(cd) -> None:
    if cd.registrar_status == "registered":
        return
    reg = get_registrar()
    reg.register(domain=cd.domain, contact=cd.contact, nameservers=[])
    cd.registrar_status = "registered"
    cd.save(update_fields=["registrar_status", "updated_at"])


def _step_dns_zone(cd) -> None:
    if cd.cloudflare_zone_id:
        return
    cf = get_cloudflare()
    zone = cf.create_zone(cd.domain)
    cd.cloudflare_zone_id = zone["zone_id"]
    cd.save(update_fields=["cloudflare_zone_id", "updated_at"])
    # Point the registered domain's nameservers at Cloudflare.
    get_registrar().set_nameservers(domain=cd.domain, nameservers=zone["name_servers"])


def _step_dns_records(cd) -> None:
    cf = get_cloudflare()
    from django.conf import settings

    tunnel = settings.CLOUDFLARE_TUNNEL_HOSTNAME or "tunnel.contentor.app"
    cf.upsert_dns_record(zone_id=cd.cloudflare_zone_id, type="CNAME", name=cd.domain, content=tunnel, proxied=True)
    cf.upsert_dns_record(zone_id=cd.cloudflare_zone_id, type="CNAME", name=f"www.{cd.domain}", content=tunnel, proxied=True)


def _step_email_auth(cd) -> None:
    if cd.resend_domain_id:
        return
    resend = get_resend_domains()
    out = resend.create_domain(cd.domain)
    cd.resend_domain_id = out["resend_domain_id"]
    cd.save(update_fields=["resend_domain_id", "updated_at"])
    cf = get_cloudflare()
    for rec in out["records"]:
        cf.upsert_dns_record(
            zone_id=cd.cloudflare_zone_id, type=rec["type"], name=rec["name"], content=rec["value"], proxied=False
        )
    if cd.forward_to_email:
        cf.enable_email_routing(zone_id=cd.cloudflare_zone_id, forward_to=cd.forward_to_email)


def _step_ssl(cd) -> None:
    cf = get_cloudflare()
    status = cf.get_ssl_status(zone_id=cd.cloudflare_zone_id)
    if status != "active":
        raise RuntimeError("SSL not yet active")  # Celery retries


def _step_live(cd) -> None:
    Domain.objects.get_or_create(
        domain=cd.domain,
        defaults={"tenant": cd.tenant, "is_primary": cd.is_primary, "ssl_status": "active"},
    )


# Ordered (status-after-step, step-fn).
_STEPS = [
    ("registering", _step_register),
    ("dns_zone", _step_dns_zone),
    ("dns_records", _step_dns_records),
    ("email_auth", _step_email_auth),
    ("ssl", _step_ssl),
    ("live", _step_live),
]


def provision(cd) -> None:
    if cd.provisioning_status == "live":
        return
    for status, step in _STEPS:
        cd.provisioning_status = status
        cd.failed_step = ""
        cd.save(update_fields=["provisioning_status", "failed_step", "updated_at"])
        try:
            step(cd)
        except Exception:
            cd.provisioning_status = "failed"
            cd.failed_step = status
            cd.save(update_fields=["provisioning_status", "failed_step", "updated_at"])
            logger.exception("Provisioning failed for %s at %s", cd.domain, status)
            raise
    cd.provisioning_status = "live"
    cd.save(update_fields=["provisioning_status", "updated_at"])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec django pytest apps/domains/tests/test_provisioning.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/domains/provisioning.py backend/apps/domains/tests/test_provisioning.py
git commit -m "feat(domains): resumable provisioning state machine"
```

---

### Task 9: Celery tasks (provision + renew)

**Files:**
- Create: `backend/apps/domains/tasks.py`
- Test: `backend/apps/domains/tests/test_tasks.py`

**Interfaces:**
- Consumes: `provision()`, `CustomDomain`, `get_registrar()`.
- Produces: `provision_domain(custom_domain_id: int) -> None` (Celery task; loads the row, calls `provision`), `renew_domain(custom_domain_id: int) -> None` (calls `registrar.renew`, extends `expires_at` by 1 year).

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/domains/tests/test_tasks.py
import pytest

from apps.domains.models import CustomDomain
from apps.domains.tasks import provision_domain

pytestmark = pytest.mark.django_db


def test_provision_domain_task_runs_orchestrator(restore_public, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    cd = CustomDomain.objects.create(
        tenant=restore_public, domain="taskcoach.com", cost_minor=999, price_minor=1200,
        currency="EUR", contact={"Email": "c@x.com"}, provisioning_status="pending",
    )
    provision_domain(cd.id)  # call synchronously
    cd.refresh_from_db()
    assert cd.provisioning_status == "live"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/domains/tests/test_tasks.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the tasks**

```python
# backend/apps/domains/tasks.py
from __future__ import annotations

from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from .models import CustomDomain
from .provisioning import provision
from .registrar import get_registrar


@shared_task(bind=True, max_retries=10, default_retry_delay=60)
def provision_domain(self, custom_domain_id: int) -> None:
    cd = CustomDomain.objects.get(pk=custom_domain_id)
    try:
        provision(cd)
    except Exception as exc:  # noqa: BLE001 — retry transient failures (e.g. SSL pending)
        raise self.retry(exc=exc)


@shared_task
def renew_domain(custom_domain_id: int) -> None:
    cd = CustomDomain.objects.get(pk=custom_domain_id)
    get_registrar().renew(domain=cd.domain)
    base = cd.expires_at or timezone.now()
    cd.expires_at = base + timedelta(days=365)
    cd.save(update_fields=["expires_at", "updated_at"])
```

Note: when called directly in tests (not via `.delay`), `self.retry` won't fire because the bypass path never raises. The test calls `provision_domain(cd.id)` — `bind=True` tasks are still callable directly; `self` is bound automatically by Celery's task wrapper.

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec django pytest apps/domains/tests/test_tasks.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/domains/tasks.py backend/apps/domains/tests/test_tasks.py
git commit -m "feat(domains): Celery provision + renew tasks"
```

---

### Task 10: Search API

**Files:**
- Create: `backend/apps/domains/serializers.py`
- Create: `backend/apps/domains/views.py` (search view only this task)
- Create: `backend/apps/domains/urls.py`
- Modify: `backend/config/urls.py` (include `apps.domains.urls` under `/api/v1/domains/`)
- Test: `backend/apps/domains/tests/test_search_api.py`

**Interfaces:**
- Consumes: `get_registrar()`, `compute_price()`, `connection.tenant`, `IsCoachOrOwner`.
- Produces: `GET /api/v1/domains/search/?q=<name>` → `{"results": [{"domain","available","price_minor","currency"}], "suggestions": [...]}`. Price computed from `registrar.get_price(...).cost_minor` via `compute_price(cost_minor, tenant.billing_currency or DOMAINS_DEFAULT_CURRENCY)`.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/domains/tests/test_search_api.py
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User

pytestmark = pytest.mark.django_db


@pytest.fixture()
def coach_client(restore_public):
    user = User.objects.create_user(email="coach@x.com", password="pw12345!", role="coach")
    client = APIClient()
    client.force_authenticate(user=user)
    # Send tenant Host so TenantJWTAuth/tenant middleware resolve the shared tenant.
    client.defaults["HTTP_X_TENANT_DOMAIN"] = "shared-test.localhost"
    return client


def test_search_returns_priced_results(coach_client, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    resp = coach_client.get("/api/v1/domains/search/?q=freecoach.com")
    assert resp.status_code == 200
    body = resp.json()
    hit = next(r for r in body["results"] if r["domain"] == "freecoach.com")
    assert hit["available"] is True
    assert hit["price_minor"] > 0
    assert hit["currency"]


def test_search_requires_query(coach_client):
    resp = coach_client.get("/api/v1/domains/search/")
    assert resp.status_code == 400
```

(Confirm the exact tenant-resolution header/auth idiom against `apps/billing/tests/test_platform_checkout.py` and copy whatever that suite uses to authenticate a coach under the shared tenant.)

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/domains/tests/test_search_api.py -v`
Expected: FAIL — 404 (route missing).

- [ ] **Step 3: Implement serializers**

```python
# backend/apps/domains/serializers.py
from __future__ import annotations

from rest_framework import serializers


class DomainResultSerializer(serializers.Serializer):
    domain = serializers.CharField()
    available = serializers.BooleanField()
    price_minor = serializers.IntegerField()
    currency = serializers.CharField()
```

- [ ] **Step 4: Implement the search view**

```python
# backend/apps/domains/views.py
from __future__ import annotations

from django.conf import settings
from django.db import connection
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner

from .pricing import compute_price
from .registrar import get_registrar
from .registrar.types import RegistrarError


def _currency() -> str:
    tenant = connection.tenant
    return getattr(tenant, "billing_currency", "") or settings.DOMAINS_DEFAULT_CURRENCY


def _priced(reg, availability, currency):
    price_minor = 0
    if availability.available:
        cost = reg.get_price(availability.domain)
        price_minor, _fx = compute_price(cost.cost_minor, currency)
    return {
        "domain": availability.domain,
        "available": availability.available,
        "price_minor": price_minor,
        "currency": currency,
    }


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def search(request):
    q = (request.query_params.get("q") or "").strip().lower()
    if not q:
        return Response({"error": "QUERY_REQUIRED", "detail": "q is required."}, status=status.HTTP_400_BAD_REQUEST)
    reg = get_registrar()
    currency = _currency()
    try:
        primary = reg.check_availability(q)
        results = [_priced(reg, primary, currency)]
        suggestions = [_priced(reg, s, currency) for s in reg.suggest(q)]
    except RegistrarError as exc:
        return Response({"error": exc.code, "detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
    return Response({"results": results, "suggestions": suggestions})
```

- [ ] **Step 5: Wire URLs**

```python
# backend/apps/domains/urls.py
from django.urls import path

from . import views

urlpatterns = [
    path("search/", views.search, name="domains-search"),
]
```

In `backend/config/urls.py`, add under the `/api/v1/` includes (next to billing):

```python
    path("api/v1/domains/", include("apps.domains.urls")),
```

- [ ] **Step 6: Run test to verify it passes**

Run: `docker compose exec django pytest apps/domains/tests/test_search_api.py -v`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/domains/serializers.py backend/apps/domains/views.py backend/apps/domains/urls.py backend/config/urls.py backend/apps/domains/tests/test_search_api.py
git commit -m "feat(domains): domain search API (availability + pricing)"
```

---

### Task 11: Checkout API + domain Stripe subscription

**Files:**
- Modify: `backend/apps/domains/views.py` (add `checkout`)
- Modify: `backend/apps/domains/urls.py` (add route)
- Create: `backend/apps/domains/billing.py` (thin helper to create the annual Stripe Checkout for a domain)
- Test: `backend/apps/domains/tests/test_checkout_api.py`

**Interfaces:**
- Consumes: `get_registrar()`, `compute_price()`, `CustomDomain`, Stripe (via `apps.billing.providers`), `connection.tenant`.
- Produces:
  - `create_domain_checkout(*, tenant, user, custom_domain, success_url, cancel_url) -> CheckoutSession` in `billing.py`. In bypass mode returns a fake `CheckoutSession`; in real mode creates an annual Stripe Price on the fly (`recurring={"interval":"year"}`, `unit_amount=price_minor`, `currency`) and a subscription-mode Checkout Session with metadata `{"domains_custom_domain_id": str(cd.id), "tenant_id": ...}`.
  - `POST /api/v1/domains/checkout/` body `{domain, contact?}` → validates availability, creates `CustomDomain` (status `pending`) + `DomainSubscription` (status `incomplete`), returns `{checkout_url, custom_domain_id}`.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/domains/tests/test_checkout_api.py
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.domains.models import CustomDomain, DomainSubscription

pytestmark = pytest.mark.django_db


@pytest.fixture()
def coach_client(restore_public):
    user = User.objects.create_user(email="coach2@x.com", password="pw12345!", role="coach")
    client = APIClient()
    client.force_authenticate(user=user)
    client.defaults["HTTP_X_TENANT_DOMAIN"] = "shared-test.localhost"
    return client


def test_checkout_creates_rows_and_returns_url(coach_client, restore_public, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    resp = coach_client.post("/api/v1/domains/checkout/", {"domain": "buycoach.com"}, format="json")
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["checkout_url"]
    cd = CustomDomain.objects.get(pk=body["custom_domain_id"])
    assert cd.domain == "buycoach.com"
    assert cd.price_minor > 0
    assert DomainSubscription.objects.filter(custom_domain=cd).exists()


def test_checkout_rejects_taken_domain(coach_client, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    resp = coach_client.post("/api/v1/domains/checkout/", {"domain": "taken-x.com"}, format="json")
    assert resp.status_code == 409
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/domains/tests/test_checkout_api.py -v`
Expected: FAIL — route missing.

- [ ] **Step 3: Implement billing helper**

```python
# backend/apps/domains/billing.py
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from django.conf import settings

from apps.billing.providers.types import CheckoutSession


def create_domain_checkout(*, tenant, user, custom_domain, success_url, cancel_url) -> CheckoutSession:
    if settings.DOMAINS_BYPASS_ENABLED:
        return CheckoutSession(
            url=f"{success_url}?bypass=1&custom_domain_id={custom_domain.id}",
            expires_at=datetime.now(tz=UTC) + timedelta(hours=1),
            provider_session_id=f"bypass-cs-{custom_domain.id}",
        )

    import stripe

    stripe.api_key = settings.STRIPE_SECRET_KEY
    metadata = {"domains_custom_domain_id": str(custom_domain.id), "tenant_id": str(tenant.pk)}
    session = stripe.checkout.Session.create(
        mode="subscription",
        customer_email=getattr(user, "email", None),
        line_items=[
            {
                "price_data": {
                    "currency": custom_domain.currency.lower(),
                    "product_data": {"name": f"Custom domain: {custom_domain.domain}"},
                    "unit_amount": custom_domain.price_minor,
                    "recurring": {"interval": "year"},
                },
                "quantity": 1,
            }
        ],
        metadata=metadata,
        subscription_data={"metadata": metadata},
        success_url=f"{success_url}?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=cancel_url,
    )
    return CheckoutSession(
        url=session.url,
        expires_at=datetime.fromtimestamp(session.expires_at, tz=UTC),
        provider_session_id=session.id,
    )
```

(Confirm `settings.STRIPE_SECRET_KEY` is the exact name used by `apps/billing/providers/stripe_provider.py:_client`; reuse the same setting.)

- [ ] **Step 4: Implement the checkout view**

Append to `backend/apps/domains/views.py`:

```python
from django.db import transaction

from apps.billing.providers.types import ProviderError

from .billing import create_domain_checkout
from .models import CustomDomain, DomainSubscription


def _origin(request) -> str:
    scheme = "https" if request.is_secure() else "http"
    return f"{scheme}://{request.get_host()}"


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def checkout(request):
    domain = (request.data.get("domain") or "").strip().lower()
    if not domain:
        return Response({"error": "DOMAIN_REQUIRED", "detail": "domain is required."}, status=status.HTTP_400_BAD_REQUEST)

    tenant = connection.tenant
    reg = get_registrar()
    try:
        if not reg.check_availability(domain).available:
            return Response({"error": "UNAVAILABLE", "detail": "Domain is not available."}, status=status.HTTP_409_CONFLICT)
        cost = reg.get_price(domain)
    except RegistrarError as exc:
        return Response({"error": exc.code, "detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

    currency = _currency()
    price_minor, fx = compute_price(cost.cost_minor, currency)
    contact = request.data.get("contact") or {"Email": getattr(request.user, "email", "")}

    with transaction.atomic():
        cd = CustomDomain.objects.create(
            tenant=tenant, domain=domain, cost_minor=cost.cost_minor, price_minor=price_minor,
            currency=currency, fx_rate=fx, contact=contact, forward_to_email=getattr(request.user, "email", ""),
            provisioning_status="pending",
        )
        DomainSubscription.objects.create(tenant=tenant, custom_domain=cd, status="incomplete")

    success = f"{_origin(request)}/settings/domain"
    cancel = f"{_origin(request)}/settings/domain?canceled=1"
    try:
        session = create_domain_checkout(
            tenant=tenant, user=request.user, custom_domain=cd, success_url=success, cancel_url=cancel
        )
    except ProviderError as exc:
        return Response({"error": exc.code, "detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

    return Response({"checkout_url": session.url, "custom_domain_id": cd.id})
```

Add the route to `urls.py`:

```python
    path("checkout/", views.checkout, name="domains-checkout"),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `docker compose exec django pytest apps/domains/tests/test_checkout_api.py -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/domains/billing.py backend/apps/domains/views.py backend/apps/domains/urls.py backend/apps/domains/tests/test_checkout_api.py
git commit -m "feat(domains): annual checkout API + Stripe domain subscription"
```

---

### Task 12: Status, retry, and delete APIs

**Files:**
- Modify: `backend/apps/domains/views.py` (add `current`, `retry`, `destroy`)
- Modify: `backend/apps/domains/serializers.py` (add `CustomDomainSerializer`)
- Modify: `backend/apps/domains/urls.py`
- Test: `backend/apps/domains/tests/test_status_api.py`

**Interfaces:**
- Produces:
  - `GET /api/v1/domains/` → current `CustomDomain` for the tenant (most recent) serialized, or `{"custom_domain": null}`.
  - `POST /api/v1/domains/<id>/retry/` → re-enqueue `provision_domain` for a `failed` domain; 409 if not failed.
  - `DELETE /api/v1/domains/<id>/` → mark `lapsed`, remove the matching `core.Domain` row, cancel the Stripe subscription (best-effort). Returns 204.
  - `CustomDomainSerializer` exposing `id, domain, provisioning_status, failed_step, price_minor, currency, expires_at, is_primary`.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/domains/tests/test_status_api.py
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import Domain
from apps.domains.models import CustomDomain

pytestmark = pytest.mark.django_db


@pytest.fixture()
def coach_client(restore_public):
    user = User.objects.create_user(email="coach3@x.com", password="pw12345!", role="coach")
    client = APIClient()
    client.force_authenticate(user=user)
    client.defaults["HTTP_X_TENANT_DOMAIN"] = "shared-test.localhost"
    return client


def test_current_returns_latest(coach_client, restore_public):
    CustomDomain.objects.create(tenant=restore_public, domain="cur.com", cost_minor=1, price_minor=1200, currency="EUR")
    resp = coach_client.get("/api/v1/domains/")
    assert resp.status_code == 200
    assert resp.json()["custom_domain"]["domain"] == "cur.com"


def test_retry_only_when_failed(coach_client, restore_public):
    cd = CustomDomain.objects.create(tenant=restore_public, domain="rt.com", cost_minor=1, price_minor=1, currency="EUR", provisioning_status="live")
    resp = coach_client.post(f"/api/v1/domains/{cd.id}/retry/")
    assert resp.status_code == 409


def test_delete_marks_lapsed_and_removes_domain_row(coach_client, restore_public):
    cd = CustomDomain.objects.create(tenant=restore_public, domain="del.com", cost_minor=1, price_minor=1, currency="EUR", provisioning_status="live")
    Domain.objects.create(domain="del.com", tenant=restore_public, is_primary=False)
    resp = coach_client.delete(f"/api/v1/domains/{cd.id}/")
    assert resp.status_code == 204
    cd.refresh_from_db()
    assert cd.provisioning_status == "lapsed"
    assert not Domain.objects.filter(domain="del.com").exists()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/domains/tests/test_status_api.py -v`
Expected: FAIL — routes missing.

- [ ] **Step 3: Add the serializer**

Append to `backend/apps/domains/serializers.py`:

```python
from .models import CustomDomain


class CustomDomainSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomDomain
        fields = ["id", "domain", "provisioning_status", "failed_step", "price_minor", "currency", "expires_at", "is_primary"]
```

- [ ] **Step 4: Implement the views**

Append to `backend/apps/domains/views.py`:

```python
from .serializers import CustomDomainSerializer
from .tasks import provision_domain


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def current(request):
    cd = CustomDomain.objects.filter(tenant=connection.tenant).order_by("-created_at").first()
    return Response({"custom_domain": CustomDomainSerializer(cd).data if cd else None})


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def retry(request, pk: int):
    cd = CustomDomain.objects.filter(tenant=connection.tenant, pk=pk).first()
    if cd is None:
        return Response({"error": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
    if cd.provisioning_status != "failed":
        return Response({"error": "NOT_FAILED", "detail": "Only failed domains can retry."}, status=status.HTTP_409_CONFLICT)
    provision_domain.delay(cd.id)
    return Response({"custom_domain": CustomDomainSerializer(cd).data})


@api_view(["DELETE"])
@permission_classes([IsCoachOrOwner])
def destroy(request, pk: int):
    from apps.core.models import Domain

    cd = CustomDomain.objects.filter(tenant=connection.tenant, pk=pk).first()
    if cd is None:
        return Response({"error": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
    Domain.objects.filter(domain=cd.domain, tenant=connection.tenant).delete()
    cd.provisioning_status = "lapsed"
    cd.save(update_fields=["provisioning_status", "updated_at"])
    # Best-effort Stripe cancellation.
    sub = getattr(cd, "subscription", None)
    if sub and sub.provider_subscription_id and not settings.DOMAINS_BYPASS_ENABLED:
        try:
            import stripe

            stripe.api_key = settings.STRIPE_SECRET_KEY
            stripe.Subscription.delete(sub.provider_subscription_id)
        except Exception:  # noqa: BLE001 — teardown is best-effort
            pass
    return Response(status=status.HTTP_204_NO_CONTENT)
```

Add routes to `urls.py`:

```python
    path("", views.current, name="domains-current"),
    path("<int:pk>/retry/", views.retry, name="domains-retry"),
    path("<int:pk>/", views.destroy, name="domains-destroy"),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `docker compose exec django pytest apps/domains/tests/test_status_api.py -v`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/domains/views.py backend/apps/domains/serializers.py backend/apps/domains/urls.py backend/apps/domains/tests/test_status_api.py
git commit -m "feat(domains): status, retry, delete APIs"
```

---

### Task 13: Webhook handling (provision on payment, renew, lapse)

**Files:**
- Create: `backend/apps/domains/webhooks.py`
- Modify: `backend/apps/billing/views/webhooks.py` (delegate domain-subscription events)
- Test: `backend/apps/domains/tests/test_webhooks.py`

**Interfaces:**
- Consumes: the Stripe event dict already parsed by the billing webhook view, `CustomDomain`, `DomainSubscription`, `provision_domain`, `renew_domain`, `WebhookEvent` idempotency.
- Produces: `handle_domain_event(event: dict) -> bool` — returns `True` if it handled the event. Recognizes events whose `metadata.domains_custom_domain_id` is set:
  - `checkout.session.completed` → set `DomainSubscription` active + ids, enqueue `provision_domain`.
  - `invoice.paid` (after first) → enqueue `renew_domain`.
  - `invoice.payment_failed` (final) / `customer.subscription.deleted` → mark `lapsed`, remove `core.Domain` row.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/domains/tests/test_webhooks.py
import pytest

from apps.core.models import Domain
from apps.domains.models import CustomDomain, DomainSubscription
from apps.domains.webhooks import handle_domain_event

pytestmark = pytest.mark.django_db


def _cd(restore_public, **kw):
    return CustomDomain.objects.create(
        tenant=restore_public, domain=kw.pop("domain", "hook.com"), cost_minor=1, price_minor=1200,
        currency="EUR", contact={"Email": "c@x.com"}, **kw
    )


def test_checkout_completed_enqueues_provision(restore_public, settings, monkeypatch):
    settings.DOMAINS_BYPASS_ENABLED = True
    cd = _cd(restore_public)
    DomainSubscription.objects.create(tenant=restore_public, custom_domain=cd)
    calls = []
    from apps.domains import webhooks
    monkeypatch.setattr(webhooks.provision_domain, "delay", lambda cid: calls.append(cid))

    event = {
        "type": "checkout.session.completed",
        "data": {"object": {
            "metadata": {"domains_custom_domain_id": str(cd.id)},
            "subscription": "sub_123", "customer": "cus_123",
        }},
    }
    assert handle_domain_event(event) is True
    cd.subscription.refresh_from_db()
    assert cd.subscription.status == "active"
    assert cd.subscription.provider_subscription_id == "sub_123"
    assert calls == [cd.id]


def test_non_domain_event_ignored(restore_public):
    event = {"type": "checkout.session.completed", "data": {"object": {"metadata": {}}}}
    assert handle_domain_event(event) is False


def test_subscription_deleted_lapses(restore_public, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    cd = _cd(restore_public, domain="lapse.com", provisioning_status="live")
    DomainSubscription.objects.create(tenant=restore_public, custom_domain=cd, provider_subscription_id="sub_9")
    Domain.objects.create(domain="lapse.com", tenant=restore_public, is_primary=False)
    event = {"type": "customer.subscription.deleted", "data": {"object": {
        "id": "sub_9", "metadata": {"domains_custom_domain_id": str(cd.id)}}}}
    assert handle_domain_event(event) is True
    cd.refresh_from_db()
    assert cd.provisioning_status == "lapsed"
    assert not Domain.objects.filter(domain="lapse.com").exists()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/domains/tests/test_webhooks.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler**

```python
# backend/apps/domains/webhooks.py
from __future__ import annotations

import logging

from apps.core.models import Domain

from .models import CustomDomain, DomainSubscription
from .tasks import provision_domain, renew_domain

logger = logging.getLogger(__name__)

_HANDLED = {
    "checkout.session.completed",
    "invoice.paid",
    "invoice.payment_failed",
    "customer.subscription.deleted",
}


def _custom_domain_id(obj: dict) -> str:
    return (obj.get("metadata") or {}).get("domains_custom_domain_id", "")


def handle_domain_event(event: dict) -> bool:
    """Return True if this event belongs to a domain subscription and was handled."""
    etype = event.get("type", "")
    if etype not in _HANDLED:
        return False
    obj = event.get("data", {}).get("object", {})
    cd_id = _custom_domain_id(obj)
    if not cd_id:
        return False
    cd = CustomDomain.objects.filter(pk=cd_id).first()
    if cd is None:
        return False
    sub, _ = DomainSubscription.objects.get_or_create(tenant=cd.tenant, custom_domain=cd)

    if etype == "checkout.session.completed":
        sub.status = "active"
        sub.provider_subscription_id = obj.get("subscription", "") or sub.provider_subscription_id
        sub.provider_customer_id = obj.get("customer", "") or sub.provider_customer_id
        sub.save(update_fields=["status", "provider_subscription_id", "provider_customer_id", "updated_at"])
        provision_domain.delay(cd.id)
        return True

    if etype == "invoice.paid":
        # First invoice is paid at checkout; treat subsequent paid invoices as renewals.
        if cd.provisioning_status == "live":
            renew_domain.delay(cd.id)
        return True

    if etype in ("invoice.payment_failed", "customer.subscription.deleted"):
        Domain.objects.filter(domain=cd.domain, tenant=cd.tenant).delete()
        cd.provisioning_status = "lapsed"
        cd.save(update_fields=["provisioning_status", "updated_at"])
        sub.status = "canceled"
        sub.save(update_fields=["status", "updated_at"])
        return True

    return False
```

- [ ] **Step 4: Delegate from the billing webhook view**

In `backend/apps/billing/views/webhooks.py`, after the event is parsed and BEFORE the existing `_STRIPE_HANDLED` dispatch, add a delegation so domain events are handled by `apps.domains` and don't fall through to platform-subscription logic:

```python
from apps.domains.webhooks import handle_domain_event

# ... after `event = provider.parse_webhook(...)` (or however the dict is obtained):
if handle_domain_event(event):
    return Response(status=status.HTTP_200_OK)
```

Place this immediately before the `event["type"]` branch that updates `PlatformSubscription`. (Read the surrounding code first; insert at the point where `event` is a parsed dict and the function is about to branch on type.)

- [ ] **Step 5: Run test to verify it passes**

Run: `docker compose exec django pytest apps/domains/tests/test_webhooks.py -v`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/domains/webhooks.py backend/apps/billing/views/webhooks.py backend/apps/domains/tests/test_webhooks.py
git commit -m "feat(domains): Stripe webhook handling (provision/renew/lapse)"
```

---

### Task 14: Superadmin visibility (adminkit) + full-suite green

**Files:**
- Create: `backend/apps/domains/admin_panels.py`
- Test: run the whole `apps/domains` suite + a smoke `manage.py check`.

**Interfaces:**
- Consumes: the adminkit registration pattern (see `apps/billing/admin_panels.py`).
- Produces: `CustomDomain` + `DomainSubscription` registered for the superadmin panel (read-only list: domain, tenant, provisioning_status, price_minor, currency, expires_at).

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/domains/tests/test_admin_panels.py
def test_admin_panels_importable():
    import apps.domains.admin_panels  # noqa: F401
```

- [ ] **Step 2: Run it (fails)**

Run: `docker compose exec django pytest apps/domains/tests/test_admin_panels.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement registration**

Read `backend/apps/billing/admin_panels.py` and mirror its registration style exactly. Register `CustomDomain` and `DomainSubscription` with the superadmin admin site, list fields as above, all read-only. (Copy the concrete decorator/registration calls that file uses — do not invent a new API.)

- [ ] **Step 4: Run the test (passes)**

Run: `docker compose exec django pytest apps/domains/tests/test_admin_panels.py -v`
Expected: PASS.

- [ ] **Step 5: Full suite + system check**

Run: `docker compose exec django pytest apps/domains -v`
Expected: PASS (all tasks' tests).
Run: `docker compose exec django python manage.py check`
Expected: `System check identified no issues`.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/domains/admin_panels.py backend/apps/domains/tests/test_admin_panels.py
git commit -m "feat(domains): superadmin adminkit registration for domains"
```

---

## Self-Review

**Spec coverage:**
- Route 53 availability/suggest/price/register/renew → Tasks 2, 5.
- Pricing (cost×1.20, ceil, FX) → Task 3.
- Cloudflare zone + tunnel DNS + Universal SSL + Email Routing forward → Tasks 6, 8.
- Resend sender-auth records → Tasks 7, 8.
- Models (`CustomDomain`, `DomainSubscription`) → Task 4.
- Provisioning state machine (resumable/idempotent, `failed_step`) → Task 8.
- Annual Stripe subscription, lapse-on-failure → Tasks 11, 13.
- APIs (search/checkout/status/retry/delete) → Tasks 10, 11, 12.
- `core.Domain` routing row at `live` → Task 8.
- Superadmin visibility → Task 14.
- Fakes so CI makes no live calls → every external task ships a fake + factory.

**Deferred to later plans (by design):** the coach-facing wizard UI (frontend-main) and Phase 2 (coach inbox). The "connect existing domain" path and FX-source hardening remain spec open-items.

**Placeholder scan:** every code step contains complete code; the only "read the surrounding code first" notes (Task 13 step 4, Task 14 step 3) are deliberate — they integrate with files whose exact local idiom must be matched, and they name the precise insertion point + reference file.

**Type consistency:** `compute_price` returns `(price_minor, fx)` everywhere it's used (Tasks 3, 10, 11). `get_registrar/get_cloudflare/get_resend_domains` factory names are consistent across provisioning + views. `CheckoutSession` reused from `apps.billing.providers.types`. `provision(cd)` / `provision_domain.delay(id)` names consistent across Tasks 8, 9, 12, 13.

## Verification-before-completion notes

- Before claiming Phase 1 done: `docker compose exec django pytest apps/domains -v` green, `manage.py check` clean, and `make lint` passes (ruff). Confirm the migration applies on a fresh `make dev-reset`.
- The tunnel **catch-all** assumption (spec open-item) must be verified on the home server before flipping `DOMAINS_BYPASS_ENABLED=False` in prod — if ingress is per-hostname, add a provisioning step to register the tunnel hostname route.
