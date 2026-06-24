"""Integration tests for POST /api/v1/domains/checkout/.

Uses the shared tenant fixture pattern from apps/billing/tests/test_platform_checkout.py.
Mocks no external services because DOMAINS_BYPASS_ENABLED=True routes through BypassRegistrar
and the bypass billing path returns a fake CheckoutSession.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.domains.models import CustomDomain, DomainSubscription

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@domains-checkout.test",
        name="Owner",
        password="secret123",  # noqa: S106  # pragma: allowlist secret
        role="owner",
    )


def _client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


def test_checkout_creates_rows_and_returns_url(owner, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    client = _client(owner)
    resp = client.post("/api/v1/domains/checkout/", {"domain": "buycoach.com"}, format="json")
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["checkout_url"]
    cd = CustomDomain.objects.get(pk=body["custom_domain_id"])
    assert cd.domain == "buycoach.com"
    assert cd.price_minor > 0
    assert DomainSubscription.objects.filter(custom_domain=cd).exists()


def test_checkout_rejects_taken_domain(owner, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    client = _client(owner)
    resp = client.post("/api/v1/domains/checkout/", {"domain": "taken-x.com"}, format="json")
    assert resp.status_code == 409, resp.content


def test_checkout_cleans_up_on_provider_error(owner, settings):
    from unittest.mock import patch

    from apps.billing.providers.types import ProviderError

    settings.DOMAINS_BYPASS_ENABLED = True
    client = _client(owner)
    with patch("apps.domains.views.create_domain_checkout", side_effect=ProviderError("boom")):
        resp = client.post("/api/v1/domains/checkout/", {"domain": "cleanup.com"}, format="json")
    assert resp.status_code == 502, resp.content
    assert not CustomDomain.objects.filter(domain="cleanup.com").exists()


def test_checkout_uses_apex_return_path(owner, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    settings.SITE_SCHEME = "https"
    settings.CONTENTOR_DOMAIN = "contentor.app"
    client = _client(owner)
    resp = client.post(
        "/api/v1/domains/checkout/",
        {"domain": "apexcoach.com", "return_path": "/dashboard/domain/acme"},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    # bypass CheckoutSession.url is built from success_url; assert apex origin + path present
    assert "https://contentor.app/dashboard/domain/acme" in resp.json()["checkout_url"]


def test_checkout_rejects_unsafe_return_path(owner, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    client = _client(owner)
    resp = client.post(
        "/api/v1/domains/checkout/",
        {"domain": "apexcoach2.com", "return_path": "//evil.com"},
        format="json",
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "BAD_RETURN_PATH"


def test_checkout_rejects_backslash_in_return_path(owner, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    client = _client(owner)
    resp = client.post(
        "/api/v1/domains/checkout/",
        {"domain": "apexcoach3.com", "return_path": "/\\evil.com"},
        format="json",
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "BAD_RETURN_PATH"


def test_checkout_rejects_query_in_return_path(owner, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    client = _client(owner)
    resp = client.post(
        "/api/v1/domains/checkout/",
        {"domain": "apexcoach4.com", "return_path": "/dashboard?evil=true"},
        format="json",
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "BAD_RETURN_PATH"
