"""provision_tenant idempotency (audit P2-B / finding E).

The signup provisioning task must be safe to retry: a second run (as Celery
would do after a transient failure) must not create a duplicate TenantConfig or
crash on a duplicate owner user. Previously it did both, bricking the signup.
"""

import pytest
from django.db import connection
from django_tenants.utils import tenant_context

from apps.accounts.models import User
from apps.core.models import Tenant
from apps.core.tasks import provision_tenant
from apps.tenant_config.models import TenantConfig

SCHEMA = "prov_idem_test"


@pytest.mark.django_db(transaction=True)
def test_provision_tenant_is_idempotent(restore_public):
    connection.set_schema_to_public()
    tenant = Tenant.objects.create(
        schema_name=SCHEMA,
        name="Prov Idem",
        slug="prov-idem",
        subdomain="prov-idem",
        owner_email="owner@prov.test",
        region="global",
    )
    try:
        # Run twice — the second call simulates a Celery retry after a partial
        # first run. Both must succeed with no duplicates.
        r1 = provision_tenant.apply(args=(tenant.id, "owner@prov.test", "Prov Owner"))
        r2 = provision_tenant.apply(args=(tenant.id, "owner@prov.test", "Prov Owner"))
        assert r1.successful(), r1.traceback
        assert r2.successful(), r2.traceback

        tenant.refresh_from_db()
        assert tenant.provisioning_status == "ready"
        with tenant_context(tenant):
            assert TenantConfig.objects.count() == 1
            assert User.objects.filter(role="owner").count() == 1
    finally:
        connection.set_schema_to_public()
        with connection.cursor() as cur:
            cur.execute(f'DROP SCHEMA IF EXISTS "{SCHEMA}" CASCADE')
        Tenant.objects.filter(schema_name=SCHEMA).delete()
        connection.set_schema_to_public()
