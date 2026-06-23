"""Integration tests for domain status, retry, and delete APIs.

Uses the shared tenant fixture pattern from test_checkout_api.py.
Mirrors the correct auth/tenant idiom: APIClient(HTTP_HOST=SHARED_DOMAIN) + force_authenticate.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import Domain
from apps.domains.models import CustomDomain

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@domains-status.test",
        name="Owner",
        password="secret123",  # noqa: S106  # pragma: allowlist secret
        role="owner",
    )


def _client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


def test_current_returns_latest(owner, tenant_ctx):
    CustomDomain.objects.create(
        tenant=tenant_ctx,
        domain="cur.com",
        cost_minor=1,
        price_minor=1200,
        currency="EUR",
    )
    client = _client(owner)
    resp = client.get("/api/v1/domains/")
    assert resp.status_code == 200, resp.content
    assert resp.json()["custom_domain"]["domain"] == "cur.com"


def test_retry_only_when_failed(owner, tenant_ctx):
    cd = CustomDomain.objects.create(
        tenant=tenant_ctx,
        domain="rt.com",
        cost_minor=1,
        price_minor=1,
        currency="EUR",
        provisioning_status="live",
    )
    client = _client(owner)
    resp = client.post(f"/api/v1/domains/{cd.id}/retry/")
    assert resp.status_code == 409, resp.content


def test_delete_marks_lapsed_and_removes_domain_row(owner, tenant_ctx):
    cd = CustomDomain.objects.create(
        tenant=tenant_ctx,
        domain="del.com",
        cost_minor=1,
        price_minor=1,
        currency="EUR",
        provisioning_status="live",
    )
    Domain.objects.create(domain="del.com", tenant=tenant_ctx, is_primary=False)
    client = _client(owner)
    resp = client.delete(f"/api/v1/domains/{cd.id}/")
    assert resp.status_code == 204, resp.content
    cd.refresh_from_db()
    assert cd.provisioning_status == "lapsed"
    assert not Domain.objects.filter(domain="del.com").exists()
