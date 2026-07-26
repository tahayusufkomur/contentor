"""provision_tenant_schema is the reusable schema+owner+config step, split out
of provision_tenant so it can run early (at the wizard content step) without
seeding or AI-composing."""

from unittest import mock

import pytest
from django.db import connection
from django_tenants.utils import tenant_context
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import Tenant
from apps.core.tasks import provision_tenant_schema
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)


def _make_tenant(schema):
    connection.set_schema_to_public()
    return Tenant.objects.create(
        schema_name=schema,
        name="Prov Step",
        slug=schema.replace("_", "-"),
        subdomain=schema.replace("_", "-"),
        owner_email="owner@provstep.test",
        region="global",
    )


def _drop(schema):
    connection.set_schema_to_public()
    with connection.cursor() as cur:
        cur.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
    Tenant.objects.filter(schema_name=schema).delete()
    connection.set_schema_to_public()


def test_schema_step_creates_schema_owner_config_and_stops_at_provisioned(restore_public):
    schema = "prov_step_test"
    tenant = _make_tenant(schema)
    try:
        provision_tenant_schema(tenant, "owner@provstep.test", "Prov Owner", "en")

        tenant.refresh_from_db()
        assert tenant.provisioning_status == "provisioned"  # NOT 'ready'
        with tenant_context(tenant):
            assert TenantConfig.objects.count() == 1
            assert User.objects.filter(role="owner").count() == 1
            # Never seeded / composed: the schema step leaves content empty.
            from apps.blog.models import BlogPost

            assert BlogPost.objects.count() == 0
    finally:
        _drop(schema)


def test_schema_step_is_idempotent(restore_public):
    schema = "prov_step_idem"
    tenant = _make_tenant(schema)
    try:
        # Two runs (as a Celery retry would): no duplicate config/owner, no crash.
        provision_tenant_schema(tenant, "owner@provstep.test", "Prov Owner", "en")
        provision_tenant_schema(tenant, "owner@provstep.test", "Prov Owner", "en")

        tenant.refresh_from_db()
        assert tenant.provisioning_status == "provisioned"
        with tenant_context(tenant):
            assert TenantConfig.objects.count() == 1
            assert User.objects.filter(role="owner").count() == 1
    finally:
        _drop(schema)


@pytest.fixture()
def client():
    return APIClient()


def _row_tenant(schema, **kw):
    """A public-schema Tenant row only — no PG schema (the enqueue task is
    mocked). region='global' so the wizard token's slugify(brand_name) + region
    resolve back to this row."""
    connection.set_schema_to_public()
    defaults = dict(
        schema_name=schema,
        name=schema.replace("_", "-"),
        slug=schema.replace("_", "-"),
        subdomain=schema.replace("_", "-"),
        owner_email=f"{schema}@example.com",
        region="global",
        provisioning_status="pending",
    )
    defaults.update(kw)
    return Tenant.objects.create(**defaults)


def _wizard_token(tenant):
    # Mirror how _resolve_tenant_from_wizard_token resolves: it does
    # slug = slugify(brand_name) and matches owner_email + region. Passing the
    # already-slug tenant.slug as brand_name slugifies to itself, so it resolves.
    from apps.accounts.tokens import create_wizard_token

    return create_wizard_token(
        tenant.owner_email, tenant.name, tenant.slug, region=tenant.region or "global"
    )


# The view imports the task function-locally to dodge an import cycle (the
# house style in this package), so the task is not an attribute of wizard.py.
# Patch it at its source module, exactly as test_wizard_finalize.py does for
# provision_tenant.
_TASK_DELAY = "apps.core.tasks.provision_wizard_schema.delay"


def test_provision_endpoint_enqueues_only_when_pending(client):
    tenant = _row_tenant("prov_ep", provisioning_status="pending")
    try:
        with mock.patch(_TASK_DELAY) as delay:
            resp = client.post(
                "/api/v1/onboarding/wizard/provision/",
                {"token": _wizard_token(tenant)},
                format="json",
            )
        assert resp.status_code == 200
        delay.assert_called_once_with(tenant.id, tenant.owner_email, tenant.name)
    finally:
        Tenant.objects.filter(pk=tenant.pk).delete()


def test_provision_endpoint_is_idempotent_when_already_provisioned(client):
    tenant = _row_tenant("prov_ep2", provisioning_status="provisioned")
    try:
        with mock.patch(_TASK_DELAY) as delay:
            resp = client.post(
                "/api/v1/onboarding/wizard/provision/",
                {"token": _wizard_token(tenant)},
                format="json",
            )
        assert resp.status_code == 200
        assert resp.json()["status"] == "provisioned"
        delay.assert_not_called()
    finally:
        Tenant.objects.filter(pk=tenant.pk).delete()
