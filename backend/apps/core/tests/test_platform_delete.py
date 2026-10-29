"""Coach-initiated platform deletion: ``DELETE /api/v1/me/tenants/<slug>/`` and
the eligibility rules in ``onboarding.cancel`` (cancelling onboarding uses the
same rules — see tenant_config/tests/test_setup_cancel.py)."""

from unittest import mock

import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import Domain, PlatformPlan, PlatformSubscription, Tenant
from apps.core.onboarding import cancel
from apps.domains.models import CustomDomain

pytestmark = pytest.mark.django_db

HOST = "shared-test.localhost"
OWNER = "del-owner@example.com"


@pytest.fixture()
def coach(restore_public):
    return User.objects.create(email=OWNER, name="Del Owner", region="global", role="coach")


def _tenant(**kw):
    connection.set_schema_to_public()
    n = kw.pop("n", "del")
    defaults = {
        "schema_name": f"pd_{n}",
        "name": f"Pd {n}",
        "slug": f"pd-{n}",
        "subdomain": f"pd-{n}",
        "owner_email": OWNER,
        "provisioning_status": "ready",
    }
    defaults.update(kw)
    tenant = Tenant.objects.create(**defaults)
    Domain.objects.create(domain=f"pd-{n}.localhost", tenant=tenant, is_primary=True)
    return tenant


def _delete(user, slug, body=None):
    client = APIClient(HTTP_HOST=HOST)
    client.force_authenticate(user=user)
    return client.delete(f"/api/v1/me/tenants/{slug}/", body if body is not None else {"confirm": slug}, format="json")


def _subscribe(tenant, user, *, free=False, status="active"):
    plan, _ = PlatformPlan.objects.get_or_create(
        name="Free" if free else "Pro-pd", defaults={"price_monthly": 0 if free else 19, "transaction_fee_pct": 5}
    )
    return PlatformSubscription.objects.create(tenant=tenant, user=user, plan=plan, status=status)


def test_owner_deletes_unpaid_platform(coach):
    tenant = _tenant()
    with mock.patch.object(cancel, "purge_tenant_media") as purge:
        resp = _delete(coach, tenant.slug)
    assert resp.status_code == 204, resp.content
    assert not Tenant.objects.filter(slug=tenant.slug).exists()
    assert not Domain.objects.filter(domain="pd-del.localhost").exists()
    purge.assert_called_once_with(tenant.slug)


def test_free_plan_subscription_is_deletable(coach):
    tenant = _tenant(n="freesub")
    _subscribe(tenant, coach, free=True)
    with mock.patch.object(cancel, "purge_tenant_media"):
        assert _delete(coach, tenant.slug).status_code == 204


def test_published_free_platform_is_deletable(coach):
    tenant = _tenant(n="pub", is_published=True)
    with mock.patch.object(cancel, "purge_tenant_media"):
        assert _delete(coach, tenant.slug).status_code == 204


@pytest.mark.parametrize("status", ["active", "past_due"])
def test_paid_platform_is_refused(coach, status):
    tenant = _tenant(n="paid")
    _subscribe(tenant, coach, status=status)
    resp = _delete(coach, tenant.slug)
    assert resp.status_code == 409
    assert resp.json()["detail"] == "paid_plan"
    assert Tenant.objects.filter(slug=tenant.slug).exists()


def test_canceled_paid_subscription_is_deletable(coach):
    tenant = _tenant(n="canceled")
    _subscribe(tenant, coach, status="canceled")
    with mock.patch.object(cancel, "purge_tenant_media"):
        assert _delete(coach, tenant.slug).status_code == 204


def test_connected_stripe_account_is_refused(coach):
    tenant = _tenant(n="connect", stripe_account_id="acct_123")
    resp = _delete(coach, tenant.slug)
    assert resp.status_code == 409
    assert resp.json()["detail"] == "payments_connected"


def test_custom_domain_is_refused(coach):
    tenant = _tenant(n="domain")
    CustomDomain.objects.create(
        tenant=tenant, domain="mine.example.com", cost_minor=1000, price_minor=1500, currency="USD"
    )
    resp = _delete(coach, tenant.slug)
    assert resp.status_code == 409
    assert resp.json()["detail"] == "custom_domain"


def test_in_flight_provisioning_is_refused_but_stuck_one_is_not(coach):
    tenant = _tenant(n="prov", provisioning_status="provisioning")
    resp = _delete(coach, tenant.slug)
    assert resp.status_code == 409
    assert resp.json()["detail"] == "provisioning"

    from datetime import timedelta

    from django.utils import timezone

    Tenant.objects.filter(pk=tenant.pk).update(created_at=timezone.now() - timedelta(hours=2))
    with mock.patch.object(cancel, "purge_tenant_media"):
        assert _delete(coach, tenant.slug).status_code == 204


@pytest.mark.parametrize("body", [{}, {"confirm": "wrong"}, {"confirm": ""}])
def test_confirmation_must_match_slug(coach, body):
    tenant = _tenant(n="confirm")
    resp = _delete(coach, tenant.slug, body)
    assert resp.status_code == 400
    assert resp.json()["detail"] == "confirm_required"
    assert Tenant.objects.filter(slug=tenant.slug).exists()


def test_someone_elses_platform_is_404(coach):
    tenant = _tenant(n="theirs", owner_email="other@example.com")
    resp = _delete(coach, tenant.slug)
    assert resp.status_code == 404
    assert Tenant.objects.filter(slug=tenant.slug).exists()


def test_my_tenants_reports_why_a_platform_cannot_be_deleted(coach):
    free = _tenant(n="listfree")
    paid = _tenant(n="listpaid")
    _subscribe(paid, coach)
    client = APIClient(HTTP_HOST=HOST)
    client.force_authenticate(user=coach)
    # These tenants have no schema (they are rows only), so there is no config to read the language from.
    with mock.patch("apps.core.me.views.languages.site_language", return_value="en"):
        rows = {r["slug"]: r for r in client.get("/api/v1/me/tenants/").json()}
    assert rows[free.slug]["delete_blocker"] is None
    assert rows[paid.slug]["delete_blocker"] == "paid_plan"


def test_anonymous_is_rejected(restore_public):
    tenant = _tenant(n="anon")
    resp = APIClient(HTTP_HOST=HOST).delete(
        f"/api/v1/me/tenants/{tenant.slug}/", {"confirm": tenant.slug}, format="json"
    )
    assert resp.status_code in (401, 403)
    assert Tenant.objects.filter(slug=tenant.slug).exists()


def test_purge_removes_every_object_under_the_tenant_prefix(settings):
    settings.AWS_BUCKET_NAME = "bucket"
    client = mock.MagicMock()
    client.get_paginator.return_value.paginate.return_value = [
        {"Contents": [{"Key": "tenants/pd-x/a.png"}, {"Key": "tenants/pd-x/b.png"}]},
        {},  # an empty page
        {"Contents": [{"Key": "tenants/pd-x/c.png"}]},
    ]
    with mock.patch("apps.core.storage.get_s3_client", return_value=client):
        assert cancel.purge_tenant_media("pd-x") == 3
    client.get_paginator.return_value.paginate.assert_called_once_with(Bucket="bucket", Prefix="tenants/pd-x/")
    assert client.delete_objects.call_count == 2


def test_purge_failure_never_raises(settings):
    settings.AWS_BUCKET_NAME = "bucket"
    with mock.patch("apps.core.storage.get_s3_client", side_effect=RuntimeError("s3 down")):
        assert cancel.purge_tenant_media("pd-x") == 0
