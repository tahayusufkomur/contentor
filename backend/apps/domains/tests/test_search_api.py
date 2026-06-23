"""Integration tests for GET /api/v1/domains/search/.

Uses the shared tenant fixture pattern from apps/billing/tests/test_platform_checkout.py.
Mocks no external services because DOMAINS_BYPASS_ENABLED=True routes through BypassRegistrar.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@domains.test",
        name="Owner",
        password="secret123",  # noqa: S106
        role="owner",
    )


def _client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


def test_search_returns_priced_results(owner, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    client = _client(owner)
    resp = client.get("/api/v1/domains/search/?q=freecoach.com")
    assert resp.status_code == 200, resp.content
    body = resp.json()
    hit = next(r for r in body["results"] if r["domain"] == "freecoach.com")
    assert hit["available"] is True
    assert hit["price_minor"] > 0
    assert hit["currency"]


def test_search_requires_query(owner):
    client = _client(owner)
    resp = client.get("/api/v1/domains/search/")
    assert resp.status_code == 400, resp.content
