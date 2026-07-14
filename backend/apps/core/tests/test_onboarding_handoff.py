import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.tokens import create_signup_token
from apps.core.models import Tenant

pytestmark = pytest.mark.django_db(transaction=True)

SHARED_DOMAIN = "shared-test.localhost"


def _client():
    return APIClient(HTTP_HOST=SHARED_DOMAIN)


def _token(email="coach@x.com", brand="Glow Studio"):
    return create_signup_token(email, "Coach", brand)


@pytest.fixture()
def tenant(restore_public):
    # Row-only tenant: the handoff endpoint never enters the tenant schema, so
    # skip schema creation. Public-schema rows are NOT flushed between
    # transaction=True tests — get_or_create + explicit cleanup keeps reruns green.
    connection.set_schema_to_public()
    original = Tenant.auto_create_schema
    Tenant.auto_create_schema = False
    try:
        t, _ = Tenant.objects.get_or_create(
            schema_name="glow_studio",
            defaults={
                "name": "Glow Studio",
                "slug": "glow-studio",
                "subdomain": "glow-studio",
                "owner_email": "coach@x.com",
            },
        )
        t.provisioning_status = "ready"
        t.save(update_fields=["provisioning_status"])
    finally:
        Tenant.auto_create_schema = original
    yield t
    connection.set_schema_to_public()
    Tenant.objects.filter(schema_name="glow_studio").delete()


def test_handoff_returns_login_url(tenant, settings):
    settings.SITE_SCHEME = "https"
    resp = _client().post("/api/v1/onboarding/handoff/", {"token": _token()}, format="json")
    assert resp.status_code == 200, resp.content
    url = resp.json()["login_url"]
    assert url.startswith(f"https://glow-studio.{settings.CONTENTOR_DOMAIN}/callback?token=")
    assert url.endswith("&next=/")


def test_handoff_requires_ready(tenant):
    tenant.provisioning_status = "provisioning"
    tenant.save(update_fields=["provisioning_status"])
    resp = _client().post("/api/v1/onboarding/handoff/", {"token": _token()}, format="json")
    assert resp.status_code == 409


def test_handoff_rejects_bad_token(tenant):
    resp = _client().post("/api/v1/onboarding/handoff/", {"token": "garbage"}, format="json")
    assert resp.status_code == 400


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
