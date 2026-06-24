"""Account-scoped domain endpoints (/api/v1/me/tenants/<slug>/domain/*).

These are the endpoints the apex coach dashboard hits. They run in the PUBLIC
schema (where the coach's apex JWT authenticates) and resolve the target tenant
by slug + owner_email — unlike the tenant-scoped /api/v1/domains/* endpoints,
which require a tenant-context JWT. This is the fix for the production 401
("Authentication credentials were not provided") when the wizard called the
tenant-scoped endpoints with a public JWT.
"""

import contextlib

import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import Domain, Tenant

pytestmark = pytest.mark.django_db

PUBLIC_DOMAIN = "public-test.localhost"
OWNER_EMAIL = "owner@sharedtest.com"  # matches the shared_test tenant's owner_email


@contextlib.contextmanager
def _no_schema_autocreate():
    original = Tenant.auto_create_schema
    Tenant.auto_create_schema = False
    try:
        yield
    finally:
        Tenant.auto_create_schema = original


@pytest.fixture()
def public_host(restore_public, django_db_blocker):
    """A Domain pointing at the public schema so requests resolve to public."""
    with django_db_blocker.unblock():
        connection.set_schema_to_public()
        with _no_schema_autocreate():
            tenant, _ = Tenant.objects.get_or_create(
                schema_name="public",
                defaults={"name": "Platform", "slug": "public", "subdomain": "public", "owner_email": ""},
            )
        Domain.objects.get_or_create(domain=PUBLIC_DOMAIN, defaults={"tenant": tenant})
    return tenant


@pytest.fixture()
def owner(restore_public):
    return User.objects.create_user(email=OWNER_EMAIL, password="pw12345!", role="coach")  # noqa: S106


@pytest.fixture()
def other_user(restore_public):
    return User.objects.create_user(email="someone-else@x.com", password="pw12345!", role="coach")  # noqa: S106


def _client(user=None):
    client = APIClient(HTTP_HOST=PUBLIC_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


def test_account_search_ok_for_owner(public_host, owner, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    resp = _client(owner).get("/api/v1/me/tenants/shared-test/domain/search/?q=freecoach.com")
    assert resp.status_code == 200, resp.content
    hit = next(r for r in resp.json()["results"] if r["domain"] == "freecoach.com")
    assert hit["available"] is True
    assert hit["price_minor"] > 0


def test_account_endpoint_404_for_non_owner(public_host, other_user, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    resp = _client(other_user).get("/api/v1/me/tenants/shared-test/domain/search/?q=freecoach.com")
    assert resp.status_code == 404


def test_account_endpoint_requires_auth(public_host):
    resp = _client().get("/api/v1/me/tenants/shared-test/domain/search/?q=freecoach.com")
    assert resp.status_code in (401, 403)


def test_account_checkout_creates_domain_for_owner(public_host, owner, settings):
    from apps.domains.models import CustomDomain

    settings.DOMAINS_BYPASS_ENABLED = True
    resp = _client(owner).post(
        "/api/v1/me/tenants/shared-test/domain/checkout/",
        {"domain": "buycoach.com", "return_path": "/dashboard/domain/shared-test"},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["checkout_url"]
    cd = CustomDomain.objects.get(pk=body["custom_domain_id"])
    assert cd.domain == "buycoach.com"
    assert cd.tenant.slug == "shared-test"
