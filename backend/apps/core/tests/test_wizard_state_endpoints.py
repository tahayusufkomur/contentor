import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.tokens import create_signup_token, create_wizard_token
from apps.core.models import Tenant

pytestmark = pytest.mark.django_db(transaction=True)

SHARED_DOMAIN = "shared-test.localhost"


def _client():
    return APIClient(HTTP_HOST=SHARED_DOMAIN)


def _token(email="coach@x.com", brand="Wiz Studio"):
    return create_wizard_token(email, "Coach", brand)


@pytest.fixture()
def tenant(restore_public):
    # Row-only tenant (no schema): wizard endpoints never enter the tenant
    # schema. Mirrors apps/core/tests/test_onboarding_handoff.py.
    connection.set_schema_to_public()
    original = Tenant.auto_create_schema
    Tenant.auto_create_schema = False
    try:
        t, _ = Tenant.objects.get_or_create(
            schema_name="wiz_studio",
            defaults={
                "name": "Wiz Studio",
                "slug": "wiz-studio",
                "subdomain": "wiz-studio",
                "owner_email": "coach@x.com",
            },
        )
        t.provisioning_status = "pending"
        t.template_seed_status = "pending"
        t.wizard_state = {}
        t.save(update_fields=["provisioning_status", "template_seed_status", "wizard_state"])
    finally:
        Tenant.auto_create_schema = original
    yield t
    connection.set_schema_to_public()
    Tenant.objects.filter(schema_name="wiz_studio").delete()


def test_wizard_state_defaults_to_empty_dict(tenant):
    tenant.refresh_from_db()
    assert tenant.wizard_state == {}
