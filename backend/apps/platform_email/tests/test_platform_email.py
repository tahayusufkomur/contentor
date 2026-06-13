"""Platform email: recipient resolution, permissions, and the send flow.

Recipient resolution targets public-schema coaches, so the endpoint tests issue
requests against a public-resolving host — exactly how the superadmin SPA hits
these routes on the apex in production.
"""

from __future__ import annotations

from contextlib import contextmanager
from unittest.mock import patch

import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import Domain, PlatformPlan, Tenant
from apps.platform_email.models import PlatformEmailCampaign
from apps.platform_email.recipients import resolve_recipients

PUBLIC_DOMAIN = "public-test.localhost"

pytestmark = pytest.mark.django_db


@contextmanager
def _no_schema_autocreate():
    original = Tenant.auto_create_schema
    Tenant.auto_create_schema = False
    try:
        yield
    finally:
        Tenant.auto_create_schema = original


@pytest.fixture()
def public_host(restore_public, django_db_blocker):
    """A Domain pointing at the public schema so requests resolve to public."""
    with django_db_blocker.unblock():
        connection.set_schema_to_public()
        with _no_schema_autocreate():
            pub, _ = Tenant.objects.get_or_create(
                schema_name="public",
                defaults={"name": "Platform", "slug": "public", "subdomain": "public", "owner_email": ""},
            )
            Domain.objects.get_or_create(domain=PUBLIC_DOMAIN, defaults={"tenant": pub, "is_primary": False})
    return PUBLIC_DOMAIN


@pytest.fixture()
def superuser(restore_public):
    return User.objects.create(
        email="root@contentor.app", region="global", role="owner", is_staff=True, is_superuser=True
    )


@pytest.fixture()
def plans(restore_public):
    PlatformPlan.objects.all().delete()
    starter = PlatformPlan.objects.create(name="starter", price_monthly=19, transaction_fee_pct=5)
    pro = PlatformPlan.objects.create(name="pro", price_monthly=49, transaction_fee_pct=2)
    return {"starter": starter, "pro": pro}


@pytest.fixture()
def coaches(restore_public, plans):
    """Two coaches on the starter plan, one on pro, plus an inactive coach."""
    a = User.objects.create(email="a@coach.test", name="Coach A", role="coach", is_active=True)
    b = User.objects.create(email="b@coach.test", name="Coach B", role="coach", is_active=True)
    c = User.objects.create(email="c@coach.test", name="Coach C", role="coach", is_active=True)
    User.objects.create(email="d@coach.test", name="Coach D", role="coach", is_active=False)
    with _no_schema_autocreate():
        Tenant.objects.create(
            schema_name="ta", name="A", slug="ta", subdomain="ta", owner_email=a.email, plan=plans["starter"]
        )
        Tenant.objects.create(
            schema_name="tb", name="B", slug="tb", subdomain="tb", owner_email=b.email, plan=plans["starter"]
        )
        Tenant.objects.create(
            schema_name="tc", name="C", slug="tc", subdomain="tc", owner_email=c.email, plan=plans["pro"]
        )
    return {"a": a, "b": b, "c": c}


def _client(user=None, host=PUBLIC_DOMAIN):
    client = APIClient(HTTP_HOST=host)
    if user is not None:
        client.force_authenticate(user=user)
    return client


# --- recipient resolution (runs in the public schema set by restore_public) ---


def test_resolve_all_coaches_excludes_inactive(coaches):
    emails = set(resolve_recipients({"type": "all_coaches"}).values_list("email", flat=True))
    assert emails == {"a@coach.test", "b@coach.test", "c@coach.test"}


def test_resolve_by_plan(coaches, plans):
    emails = set(
        resolve_recipients({"type": "plan", "plan_ids": [plans["starter"].pk]}).values_list("email", flat=True)
    )
    assert emails == {"a@coach.test", "b@coach.test"}


def test_resolve_by_tenant(coaches):
    tenant_c = Tenant.objects.get(schema_name="tc")
    emails = set(resolve_recipients({"type": "tenant", "tenant_ids": [tenant_c.pk]}).values_list("email", flat=True))
    assert emails == {"c@coach.test"}


def test_resolve_individual(coaches):
    emails = set(
        resolve_recipients({"type": "individual", "user_ids": [coaches["a"].pk]}).values_list("email", flat=True)
    )
    assert emails == {"a@coach.test"}


def test_resolve_unknown_type_is_empty(coaches):
    assert resolve_recipients({"type": "bogus"}).count() == 0


# --- endpoints ---


def test_setup_requires_superuser(public_host, coaches):
    resp = _client(coaches["a"]).post("/api/v1/platform/email/setup/")
    assert resp.status_code == 403


@patch("apps.platform_email.views._get_api_key", return_value=("key_123", None))
def test_setup_ok_for_superuser(_mock_key, public_host, superuser):
    resp = _client(superuser).post("/api/v1/platform/email/setup/")
    assert resp.status_code == 200, resp.content
    assert resp.json()["ready"] is True


@patch("apps.platform_email.tasks.send_platform_campaign_emails.delay")
@patch("apps.platform_email.views._get_api_key", return_value=("key_123", None))
def test_send_creates_campaign_and_queues(_mock_key, mock_delay, public_host, superuser, coaches):
    resp = _client(superuser).post(
        "/api/v1/platform/email/send/",
        {"template_id": "tmpl_1", "subject": "Hello coaches", "recipient_filter": {"type": "all_coaches"}},
        format="json",
    )
    assert resp.status_code == 201, resp.content
    campaign = PlatformEmailCampaign.objects.get(pk=resp.json()["id"])
    assert campaign.subject == "Hello coaches"
    assert campaign.recipient_count == 3
    mock_delay.assert_called_once_with(campaign.id)


@patch("apps.platform_email.views._get_api_key", return_value=("key_123", None))
def test_send_rejects_empty_recipient_set(_mock_key, public_host, superuser, plans):
    # No coaches exist → all_coaches resolves to zero → 400.
    resp = _client(superuser).post(
        "/api/v1/platform/email/send/",
        {"template_id": "tmpl_1", "subject": "Hi", "recipient_filter": {"type": "all_coaches"}},
        format="json",
    )
    assert resp.status_code == 400, resp.content
