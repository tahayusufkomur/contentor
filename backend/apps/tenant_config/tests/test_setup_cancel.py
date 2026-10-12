"""Cancelling onboarding: ``POST /api/v1/admin/setup-flow/cancel/`` deletes the
never-finished platform from its own host. Eligibility rules are shared with the
dashboard delete (apps/core/tests/test_platform_delete.py)."""

from unittest import mock

import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import Domain, Tenant
from apps.core.onboarding import cancel
from apps.tenant_config import setup_flow_views

pytestmark = pytest.mark.django_db

URL = "/api/v1/admin/setup-flow/cancel/"
OWNER = "cancel-owner@example.com"
HOST = "sc-site.localhost"


@pytest.fixture()
def site(restore_public):
    connection.set_schema_to_public()
    tenant = Tenant.objects.create(
        schema_name="sc_site",
        name="Sc Site",
        slug="sc-site",
        subdomain="sc-site",
        owner_email=OWNER,
        provisioning_status="ready",
    )
    Domain.objects.create(domain=HOST, tenant=tenant, is_primary=True)
    return tenant


def _client(role="owner", email=OWNER):
    user = User(email=email, name="O", role=role, is_staff=True)
    client = APIClient(HTTP_HOST=HOST)
    client.force_authenticate(user=user)
    return client


@pytest.fixture(autouse=True)
def _setup_running():
    """The throwaway test schema has no TenantConfig table: pretend setup is active."""
    with mock.patch.object(setup_flow_views, "_setup_over", return_value=None) as m:
        yield m


@pytest.fixture(autouse=True)
def _no_media():
    with mock.patch.object(cancel, "purge_tenant_media") as m:
        yield m


def test_owner_cancels_onboarding_and_site_is_gone(site, _no_media):
    resp = _client().post(URL, {"confirm": "sc-site"}, format="json")
    assert resp.status_code == 204, resp.content
    connection.set_schema_to_public()
    assert not Tenant.objects.filter(slug="sc-site").exists()
    _no_media.assert_called_once_with("sc-site")


def _schema_exists(name):
    with connection.cursor() as cur:
        cur.execute("SELECT 1 FROM pg_namespace WHERE nspname = %s", [name])
        return cur.fetchone() is not None


def test_the_sites_schema_is_dropped_from_its_own_host(site):
    # The request runs ON the schema being dropped — the case that needs the public switch.
    with connection.cursor() as cur:
        cur.execute('CREATE SCHEMA "sc_site"')
    assert _schema_exists("sc_site")
    assert _client().post(URL, {"confirm": "sc-site"}, format="json").status_code == 204
    connection.set_schema_to_public()
    assert not _schema_exists("sc_site")


def test_confirmation_is_required(site):
    for body in ({}, {"confirm": "nope"}):
        assert _client().post(URL, body, format="json").status_code == 400
    connection.set_schema_to_public()
    assert Tenant.objects.filter(slug="sc-site").exists()


def test_only_while_setup_is_running(site, _setup_running):
    from rest_framework.response import Response

    _setup_running.return_value = Response({"detail": "setup_finished"}, status=409)
    resp = _client().post(URL, {"confirm": "sc-site"}, format="json")
    assert resp.status_code == 409 and resp.json() == {"detail": "setup_finished"}
    connection.set_schema_to_public()
    assert Tenant.objects.filter(slug="sc-site").exists()


@pytest.mark.parametrize("role", ["coach", "student"])
def test_only_the_owner_role_may_cancel(site, role):
    assert _client(role=role).post(URL, {"confirm": "sc-site"}, format="json").status_code == 403


def test_owner_role_of_a_different_email_is_refused(site):
    resp = _client(email="intruder@example.com").post(URL, {"confirm": "sc-site"}, format="json")
    assert resp.status_code == 403
    connection.set_schema_to_public()
    assert Tenant.objects.filter(slug="sc-site").exists()


def test_paid_site_cannot_be_cancelled(site):
    Tenant.objects.filter(pk=site.pk).update(stripe_account_id="acct_1")
    resp = _client().post(URL, {"confirm": "sc-site"}, format="json")
    assert resp.status_code == 409 and resp.json() == {"detail": "payments_connected"}
    connection.set_schema_to_public()
    assert Tenant.objects.filter(slug="sc-site").exists()


def test_anonymous_is_rejected(site):
    assert APIClient(HTTP_HOST=HOST).post(URL, {"confirm": "sc-site"}, format="json").status_code in (401, 403)
