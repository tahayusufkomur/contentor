"""Platform checkout may return to /setup (guided onboarding), nowhere else."""

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import PlatformPlan, Tenant

pytestmark = pytest.mark.django_db
URL = "/api/v1/billing/platform/checkout/"


@pytest.fixture()
def plan(restore_public):
    plan, _ = PlatformPlan.objects.update_or_create(
        name="return-path-starter",
        defaults={
            "price_monthly": 19,
            "transaction_fee_pct": 8,
            "max_students": 100,
            "max_storage_gb": 100,
            "max_streaming_hours": 100,
            "max_campaign_emails": 1000,
            "prices": {"USD": {"amount_cents": 1900, "stripe_price_id": "price_test_return_usd"}},
        },
    )
    return plan


@pytest.fixture()
def client(tenant_ctx):
    Tenant.objects.filter(pk=tenant_ctx.pk).update(billing_currency="USD")
    owner = User.objects.create_user(email="o@co.test", name="O", password="x", role="owner")  # noqa: S106
    c = APIClient(HTTP_HOST="shared-test.localhost")
    c.force_authenticate(user=owner)
    return c


def _session():
    return SimpleNamespace(
        id="cs_test_return",
        url="https://checkout.stripe.com/c/pay/cs_test_return",
        expires_at=int(datetime(2030, 1, 1, tzinfo=UTC).timestamp()),
    )


@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_SECRET_KEY="sk_test_return_dummy")  # noqa: S106
def test_setup_return_path_is_used(client, plan):
    with patch("stripe.checkout.Session.create", return_value=_session()) as create:
        resp = client.post(URL, {"plan_id": plan.pk, "return_path": "/setup"}, format="json")
    assert resp.status_code == 200, resp.content
    kwargs = create.call_args.kwargs
    assert "/setup?checkout=success" in kwargs["success_url"]
    assert "/admin/billing" not in kwargs["success_url"]
    assert kwargs["cancel_url"].endswith("/setup?checkout=cancel")


@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_SECRET_KEY="sk_test_return_dummy")  # noqa: S106
def test_default_return_is_admin_billing(client, plan):
    with patch("stripe.checkout.Session.create", return_value=_session()) as create:
        client.post(URL, {"plan_id": plan.pk}, format="json")
    assert "/admin/billing?checkout=success" in create.call_args.kwargs["success_url"]


def test_other_return_paths_are_refused(client, plan):
    resp = client.post(URL, {"plan_id": plan.pk, "return_path": "https://evil.test"}, format="json")
    assert resp.status_code == 400 and resp.json()["error"] == "INVALID_RETURN_PATH"
