"""provision_tenant_schema is the reusable schema+owner+config step, split out
of provision_tenant so it can run early (at the wizard content step) without
seeding or AI-composing."""

import pytest
from django.db import connection
from django_tenants.utils import tenant_context

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
