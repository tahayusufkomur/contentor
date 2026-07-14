"""Wizard drop-off recovery: candidates, email send, beat task, recover endpoint."""

import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.tokens import create_wizard_token
from apps.core.models import DevOutboundEmail, Tenant

pytestmark = pytest.mark.django_db(transaction=True)

SHARED_DOMAIN = "shared-test.localhost"


@pytest.fixture(autouse=True)
def _clean_throttle_cache():
    """The recover endpoint is throttled 5/hour per IP and the throttle
    bucket lives in the shared cache — without this, the module's earlier
    endpoint tests exhaust the default 127.0.0.1 bucket and later ones 429."""
    from django.core.cache import cache

    cache.clear()
    yield


def _client(**extra):
    return APIClient(HTTP_HOST=SHARED_DOMAIN, **extra)


def _token(email="coach@x.com", brand="Rec Studio", region="global"):
    return create_wizard_token(email, "Coach", brand, region=region)


def _make_tenant(schema, name, slug, **overrides):
    """Row-only tenant (no schema): recovery never enters the tenant schema.
    Mirrors apps/core/tests/test_onboarding_handoff.py."""
    connection.set_schema_to_public()
    original = Tenant.auto_create_schema
    Tenant.auto_create_schema = False
    try:
        t, _ = Tenant.objects.get_or_create(
            schema_name=schema,
            defaults={"name": name, "slug": slug, "subdomain": slug, "owner_email": "coach@x.com"},
        )
        t.provisioning_status = overrides.pop("provisioning_status", "pending")
        t.template_seed_status = overrides.pop("template_seed_status", "pending")
        t.wizard_state = overrides.pop("wizard_state", {})
        t.recovery_email_sent_at = overrides.pop("recovery_email_sent_at", None)
        for field, value in overrides.items():
            setattr(t, field, value)
        t.save()
    finally:
        Tenant.auto_create_schema = original
    return t


@pytest.fixture()
def tenant(restore_public):
    t = _make_tenant("rec_studio", "Rec Studio", "rec-studio")
    yield t
    connection.set_schema_to_public()
    DevOutboundEmail.objects.filter(to="coach@x.com").delete()
    Tenant.objects.filter(schema_name="rec_studio").delete()


def test_recovery_email_sent_at_defaults_to_null(tenant):
    tenant.refresh_from_db()
    assert tenant.recovery_email_sent_at is None
