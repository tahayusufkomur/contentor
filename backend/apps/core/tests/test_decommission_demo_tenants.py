"""decommission_demo_tenants: one-off ops command to drop legacy prod demo tenants.

Row-only tenants (no schema created) — the command never enters a tenant's
schema (it only touches Tenant/Domain rows in public), so the tests mirror the
pattern in test_wizard_recovery.py / test_onboarding_handoff.py rather than
paying for a real `create_schema(sync_schema=True)`.
"""

import pytest
from django.core.management import call_command
from django.db import connection

from apps.core.models import Domain, Tenant
from apps.demo_seed.registry import list_niches, load_niche


def _make_tenant(schema_name, slug, **overrides):
    connection.set_schema_to_public()
    original = Tenant.auto_create_schema
    Tenant.auto_create_schema = False
    try:
        defaults = {
            "name": overrides.pop("name", slug),
            "slug": slug,
            "subdomain": slug,
            "owner_email": "demo@x.com",
        }
        defaults.update(overrides)
        tenant, _ = Tenant.objects.get_or_create(schema_name=schema_name, defaults=defaults)
    finally:
        Tenant.auto_create_schema = original
    return tenant


@pytest.fixture()
def a_niche_schema():
    """schema_name for a real niche in the registry (e.g. "demo_yoga")."""
    niche = list_niches()[0]
    return load_niche(niche).TENANT["schema_name"]


@pytest.mark.django_db
def test_decommission_is_dry_run_by_default(a_niche_schema):
    t = _make_tenant(a_niche_schema, a_niche_schema.replace("_", "-"))
    Domain.objects.create(domain=f"{t.subdomain}.localhost", tenant=t)
    try:
        call_command("decommission_demo_tenants")
        assert Tenant.objects.filter(pk=t.pk).exists()
        assert Domain.objects.filter(tenant_id=t.pk).exists()
    finally:
        connection.set_schema_to_public()
        Domain.objects.filter(tenant_id=t.pk).delete()
        t.delete(force_drop=True)


@pytest.mark.django_db
def test_decommission_deletes_matching_tenant_with_yes(a_niche_schema):
    t = _make_tenant(a_niche_schema, a_niche_schema.replace("_", "-"))
    Domain.objects.create(domain=f"{t.subdomain}.localhost", tenant=t)
    tenant_pk = t.pk
    call_command("decommission_demo_tenants", "--yes")
    assert not Tenant.objects.filter(pk=tenant_pk).exists()
    assert not Domain.objects.filter(tenant_id=tenant_pk).exists()


@pytest.mark.django_db
def test_decommission_does_not_touch_unrelated_tenants():
    """--yes must only delete tenants whose schema_name matches the niche
    registry — it must not become a "delete everything" footgun."""
    other = _make_tenant("acme_coach", "acme-coach", name="Acme Coach")
    try:
        call_command("decommission_demo_tenants", "--yes")
        assert Tenant.objects.filter(pk=other.pk).exists()
    finally:
        connection.set_schema_to_public()
        Tenant.objects.filter(pk=other.pk).delete()


@pytest.mark.django_db
def test_decommission_no_matching_tenants_is_a_noop(capsys):
    call_command("decommission_demo_tenants", "--yes")
    out = capsys.readouterr().out
    assert "No demo tenants found" in out
