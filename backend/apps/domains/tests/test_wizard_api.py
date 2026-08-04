"""Wizard-token domain endpoints: /api/v1/onboarding/wizard/domain/*.

Auth is the wizard token in the request BODY (no JWT exists mid-onboarding) —
same model as apps/core/tests/test_wizard_checkout.py, whose tenant fixture
this mirrors. DOMAINS_BYPASS_ENABLED=True keeps registrar + billing offline.
"""

from __future__ import annotations

import pytest
from django.db import connection
from django_tenants.utils import schema_context
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.tokens import create_wizard_token
from apps.core.models import PlatformPlan, PlatformSubscription, Tenant
from apps.domains.models import CustomDomain, DomainSubscription

pytestmark = pytest.mark.django_db(transaction=True)

SHARED_DOMAIN = "shared-test.localhost"
EMAIL = "coach@domain-studio.test"
BRAND = "Domain Studio"


def _client():
    return APIClient(HTTP_HOST=SHARED_DOMAIN)


def _token():
    return create_wizard_token(EMAIL, "Coach", BRAND)


@pytest.fixture()
def tenant(restore_public):
    connection.set_schema_to_public()
    t, _ = Tenant.objects.get_or_create(
        schema_name="domain_studio",
        defaults={
            "name": BRAND,
            "slug": "domain-studio",
            "subdomain": "domain-studio",
            "owner_email": EMAIL,
            "region": "global",
        },
    )
    Tenant.objects.filter(pk=t.pk).update(provisioning_status="pending")
    t.refresh_from_db()
    yield t
    connection.set_schema_to_public()
    # Never provisioned (auto_create_schema=False) — no tenant schema exists,
    # so the ORM cascade into tenant-only billing_payment can't run; raw-delete
    # the subscription rows first (same guard as test_wizard_checkout.py).
    with connection.cursor() as cur:
        table = PlatformSubscription._meta.db_table  # not user input; from model metadata
        cur.execute(f"DELETE FROM {table} WHERE tenant_id = %s", [t.pk])  # noqa: S608
    CustomDomain.objects.filter(tenant=t).delete()
    Tenant.objects.filter(schema_name="domain_studio").delete()
    # The User row stays: deleting it cascades into tenant-only tables
    # (courses_course) that aren't on the public search_path. Every consumer
    # get_or_creates by email, so the leftover is idempotent-safe.


@pytest.fixture()
def paid(tenant):
    with schema_context("public"):
        plan, _ = PlatformPlan.objects.get_or_create(
            name="Starter",
            defaults={"price_monthly": 19, "transaction_fee_pct": 8},
        )
        user = User.objects.filter(email=EMAIL).first() or User.objects.create_user(
            email=EMAIL,
            name="Coach",
            password="secret123",  # noqa: S106  # pragma: allowlist secret
            role="coach",
        )
        PlatformSubscription.objects.create(tenant=tenant, user=user, plan=plan, status="active", provider="bypass")
    return tenant


def _checkout(client, **extra):
    return client.post(
        "/api/v1/onboarding/wizard/domain/checkout/",
        {"token": _token(), "domain": "domainstudio.com", **extra},
        format="json",
    )


def test_search_requires_token(tenant, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    resp = _client().post("/api/v1/onboarding/wizard/domain/search/", {"q": "x.com"}, format="json")
    assert resp.status_code == 400, resp.content


def test_search_returns_priced_results(tenant, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    resp = _client().post(
        "/api/v1/onboarding/wizard/domain/search/", {"token": _token(), "q": "domainstudio"}, format="json"
    )
    assert resp.status_code == 200, resp.content
    body = resp.json()
    hit = next(r for r in body["results"] if r["domain"] == "domainstudio.com")
    assert hit["available"] is True
    assert hit["price_minor"] > 0


def test_checkout_requires_paid_plan(tenant, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    resp = _checkout(_client())
    assert resp.status_code == 403, resp.content
    assert resp.json()["error"] == "PLAN_REQUIRED"


def test_checkout_returns_to_wizard_on_request_host(paid, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    resp = _checkout(_client())
    assert resp.status_code == 200, resp.content
    body = resp.json()
    # Bypass builds its fake url from success_url: same-host /signup/verify,
    # NOT the apex — a tr. wizard must land back on its own origin.
    assert f"http://{SHARED_DOMAIN}/signup/verify" in body["checkout_url"]
    cd = CustomDomain.objects.get(pk=body["custom_domain_id"])
    assert cd.tenant_id == paid.pk
    assert cd.forward_to_email == EMAIL


def test_checkout_clears_canceled_husk_and_allows_retry(paid, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    client = _client()
    first = _checkout(client)
    assert first.status_code == 200, first.content
    husk_id = first.json()["custom_domain_id"]
    # Coach canceled on Stripe and tries the SAME domain again — the unpaid
    # husk must not trip the domain-unique constraint.
    second = _checkout(client)
    assert second.status_code == 200, second.content
    assert not CustomDomain.objects.filter(pk=husk_id).exists()


def test_checkout_conflicts_when_domain_already_active(paid, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    client = _client()
    first = _checkout(client)
    cd = CustomDomain.objects.get(pk=first.json()["custom_domain_id"])
    sub = cd.subscription
    sub.status = "active"
    sub.save(update_fields=["status"])
    resp = _checkout(client)
    assert resp.status_code == 409, resp.content
    assert resp.json()["error"] == "ALREADY_PURCHASED"


def test_sync_bypass_activates_and_enqueues(paid, settings, monkeypatch, django_capture_on_commit_callbacks):
    settings.DOMAINS_BYPASS_ENABLED = True
    calls = []
    from apps.domains import webhooks

    monkeypatch.setattr(webhooks.provision_domain, "delay", lambda cid: calls.append(cid))
    client = _client()
    cd_id = _checkout(client).json()["custom_domain_id"]
    with django_capture_on_commit_callbacks(execute=True):
        resp = client.post(
            "/api/v1/onboarding/wizard/domain/sync/",
            {"token": _token(), "custom_domain_id": cd_id},
            format="json",
        )
    assert resp.status_code == 200, resp.content
    body = resp.json()["custom_domain"]
    assert body["domain"] == "domainstudio.com"
    cd = CustomDomain.objects.get(pk=cd_id)
    assert cd.subscription.status == "active"
    assert calls == [cd_id]


def test_sync_ignores_foreign_custom_domain(paid, restore_public, settings, monkeypatch):
    """A custom_domain_id belonging to another tenant must not activate."""
    settings.DOMAINS_BYPASS_ENABLED = True
    calls = []
    from apps.domains import webhooks

    monkeypatch.setattr(webhooks.provision_domain, "delay", lambda cid: calls.append(cid))
    other_cd = CustomDomain.objects.create(
        tenant=restore_public,
        domain="not-yours.com",
        cost_minor=1,
        price_minor=1200,
        currency="EUR",
        contact={"Email": "other@x.com"},
    )
    DomainSubscription.objects.create(tenant=restore_public, custom_domain=other_cd)
    resp = _client().post(
        "/api/v1/onboarding/wizard/domain/sync/",
        {"token": _token(), "custom_domain_id": other_cd.id},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    other_cd.subscription.refresh_from_db()
    assert other_cd.subscription.status == "incomplete"
    assert calls == []
    other_cd.delete()


def test_sync_without_params_reads_current(paid, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    client = _client()
    resp = client.post("/api/v1/onboarding/wizard/domain/sync/", {"token": _token()}, format="json")
    assert resp.status_code == 200, resp.content
    assert resp.json()["custom_domain"] is None
