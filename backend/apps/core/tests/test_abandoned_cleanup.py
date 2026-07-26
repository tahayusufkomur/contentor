"""The cleanup cron reclaims abandoned signups that early provisioning would
otherwise leave as orphaned schemas. It is destructive, so every guard is a
test: never touch public, published, ready, or in-flight tenants."""

from datetime import timedelta
from unittest import mock

import pytest
from django.db import connection
from django.utils import timezone

from apps.core import tasks
from apps.core.models import Tenant
from apps.core.onboarding.recovery import find_abandoned_tenants

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def _isolate_ab_tenants():
    """These tests commit real rows (transaction=True) and must not see each
    other's (or a prior --reuse-db run's) leftovers. Scope hard to this file's
    'ab_' schema prefix so the shared-test tenant is never touched; force_drop
    reclaims any schema a mid-test failure leaked."""

    def _purge():
        # Force public: an earlier test in this xdist worker may have left the
        # connection on another schema, and Tenant rows live only in public.
        connection.set_schema_to_public()
        for t in Tenant.objects.filter(schema_name__startswith="ab_"):
            t.delete(force_drop=True)

    _purge()
    yield
    _purge()


def _tenant(**kw):
    connection.set_schema_to_public()
    n = kw.pop("n", "ab")
    defaults = {
        "schema_name": f"ab_{n}",
        "name": "Ab Co",
        "slug": f"ab-{n}",
        "owner_email": f"{n}@example.com",
        "subdomain": f"ab-{n}",
        "provisioning_status": "pending",
        "is_published": False,
    }
    defaults.update(kw)
    t = Tenant.objects.create(**defaults)
    return t


def _age(tenant, days):
    """Force created_at and clear activity so _last_activity == created_at."""
    Tenant.objects.filter(pk=tenant.pk).update(
        created_at=timezone.now() - timedelta(days=days),
        wizard_state={},
    )
    tenant.refresh_from_db()
    return tenant


def test_idle_pending_tenant_past_warn_window_is_selected_to_warn():
    t = _age(_tenant(n="warn"), 15)
    to_warn, to_delete = find_abandoned_tenants(timezone.now())
    assert t in list(to_warn)
    assert t not in to_delete


def test_warned_tenant_past_grace_is_selected_to_delete():
    t = _tenant(n="del")
    _age(t, 30)
    Tenant.objects.filter(pk=t.pk).update(abandon_warned_at=timezone.now() - timedelta(days=8))
    t.refresh_from_db()
    to_warn, to_delete = find_abandoned_tenants(timezone.now())
    assert t in to_delete


def test_published_tenant_is_never_touched():
    t = _age(_tenant(n="pub", is_published=True), 90)
    Tenant.objects.filter(pk=t.pk).update(abandon_warned_at=timezone.now() - timedelta(days=90))
    to_warn, to_delete = find_abandoned_tenants(timezone.now())
    assert t not in list(to_warn)
    assert t not in to_delete


def test_ready_tenant_is_never_touched():
    t = _age(_tenant(n="ready", provisioning_status="ready"), 90)
    to_warn, to_delete = find_abandoned_tenants(timezone.now())
    assert t not in list(to_warn) and t not in to_delete


def test_in_flight_provisioning_tenant_is_never_touched():
    t = _age(_tenant(n="inflight", provisioning_status="provisioning"), 90)
    to_warn, to_delete = find_abandoned_tenants(timezone.now())
    assert t not in list(to_warn) and t not in to_delete


def test_public_tenant_is_never_touched():
    """The public row must be invisible to cleanup regardless of age.

    The test DB has no public Tenant row (conftest only creates the shared
    tenant), so this builds one wearing the *exact* abandoned profile — idle,
    unpublished, pending, long past the grace window. Without the
    exclude(schema_name="public") guard it would land in to_delete, and
    force_drop on it would take the whole platform schema with it. The row is
    torn down in finally; auto_create_schema=False means no schema is made.
    """
    pub = Tenant.objects.filter(schema_name="public").first()
    created = False
    if pub is None:
        pub = Tenant.objects.create(
            schema_name="public",
            name="Public Guard Probe",
            slug="public-guard-probe",
            subdomain="public-guard-probe",
            owner_email="public-guard-probe@example.com",
            provisioning_status="pending",
            is_published=False,
        )
        created = True
    try:
        Tenant.objects.filter(pk=pub.pk).update(
            created_at=timezone.now() - timedelta(days=365),
            wizard_state={},
            abandon_warned_at=timezone.now() - timedelta(days=365),
        )
        pub.refresh_from_db()
        to_warn, to_delete = find_abandoned_tenants(timezone.now())
        assert pub not in list(to_warn) and pub not in to_delete
    finally:
        if created:
            # Plain delete(): never force_drop a row named 'public'.
            Tenant.objects.filter(pk=pub.pk).delete()


def test_recent_pending_tenant_is_left_alone():
    t = _age(_tenant(n="fresh"), 2)
    to_warn, _ = find_abandoned_tenants(timezone.now())
    assert t not in list(to_warn)  # 2 days idle is well inside the 14-day window


def test_provisioned_but_abandoned_tenant_with_schema_is_deletable():
    """The new risk: early provisioning leaves a real schema. Cleanup must
    delete it via force_drop without error even though the schema exists."""
    t = _tenant(n="hasschema", provisioning_status="provisioned")
    t.create_schema(check_if_exists=True, verbosity=0)
    _age(t, 30)
    Tenant.objects.filter(pk=t.pk).update(abandon_warned_at=timezone.now() - timedelta(days=8))
    t.refresh_from_db()
    _, to_delete = find_abandoned_tenants(timezone.now())
    assert t in to_delete
    # The task's delete call must not raise with a live schema:
    t.delete(force_drop=True)
    assert not Tenant.objects.filter(pk=t.pk).exists()


def test_cleanup_task_warns_then_deletes():
    warn = _age(_tenant(n="taskwarn"), 20)
    doomed = _tenant(n="taskdel", provisioning_status="provisioned")

    with (
        mock.patch(
            "apps.core.onboarding.recovery.find_abandoned_tenants",
            return_value=([warn], [doomed]),
        ),
        mock.patch("apps.core.onboarding.recovery.send_abandon_warning") as warn_send,
    ):
        tasks.cleanup_abandoned_signups()

    warn_send.assert_called_once()
    assert warn_send.call_args.args[0].pk == warn.pk
    assert not Tenant.objects.filter(pk=doomed.pk).exists()  # deleted (force_drop)
    assert Tenant.objects.filter(pk=warn.pk).exists()  # only warned
