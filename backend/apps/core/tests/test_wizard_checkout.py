import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.tokens import create_wizard_token
from apps.core.models import PlatformPlan, PlatformSubscription, Tenant

pytestmark = pytest.mark.django_db(transaction=True)

SHARED_DOMAIN = "shared-test.localhost"


def _client():
    return APIClient(HTTP_HOST=SHARED_DOMAIN)


def _token():
    return create_wizard_token("coach@x.com", "Coach", "Pay Studio")


@pytest.fixture()
def tenant(restore_public):
    connection.set_schema_to_public()
    t, _ = Tenant.objects.get_or_create(
        schema_name="pay_studio",
        defaults={
            "name": "Pay Studio",
            "slug": "pay-studio",
            "subdomain": "pay-studio",
            "owner_email": "coach@x.com",
            "region": "global",
        },
    )
    # Tenant.pre_save auto-fills billing_currency from region on creation and
    # then enforces immutability on every subsequent save — so resetting it
    # here has to go through a bare queryset .update() (no signals) rather
    # than instance.save(), which would raise ValidationError.
    Tenant.objects.filter(pk=t.pk).update(provisioning_status="pending", billing_currency="")
    t.refresh_from_db()
    yield t
    connection.set_schema_to_public()
    # Plain QuerySet.delete() would make Django's cascade Collector try to
    # SET NULL on billing_payment (Payment.platform_subscription) — a
    # tenant-schema-only table (db_constraint=False specifically because it
    # doesn't exist under search_path=public). This tenant has
    # auto_create_schema=False (never provisioned), so there's no tenant
    # schema to switch into either; raw-delete the row instead of going
    # through the ORM cascade.
    with connection.cursor() as cur:
        table = PlatformSubscription._meta.db_table  # not user input; from model metadata
        cur.execute(f"DELETE FROM {table} WHERE tenant_id = %s", [t.pk])  # noqa: S608
    Tenant.objects.filter(schema_name="pay_studio").delete()


@pytest.fixture()
def plan():
    plan, _ = PlatformPlan.objects.get_or_create(
        name="starter-checkout-test",
        defaults={
            "price_monthly": 19,
            "transaction_fee_pct": 8,
            "prices": {"USD": {"stripe_price_id": "price_test_usd"}},
        },
    )
    if not (plan.prices or {}).get("USD", {}).get("stripe_price_id"):
        plan.prices = {"USD": {"stripe_price_id": "price_test_usd"}}
        plan.save(update_fields=["prices"])
    return plan


@pytest.fixture()
def fake_provider(monkeypatch):
    calls = {}

    class FakeSession:
        url = "https://checkout.example/sess_123"
        from datetime import UTC, datetime

        expires_at = datetime.now(UTC)

    class FakeProvider:
        name = "fake"

        def create_checkout_session(self, **kwargs):
            calls.update(kwargs)
            return FakeSession()

    from apps.core.onboarding import wizard as wizard_mod

    monkeypatch.setattr(wizard_mod, "get_provider", lambda tenant: FakeProvider())
    return calls


def _checkout(plan_id):
    return _client().post("/api/v1/onboarding/wizard/checkout/", {"token": _token(), "plan_id": plan_id}, format="json")


def test_checkout_creates_session_and_locks_currency(tenant, plan, fake_provider):
    resp = _checkout(plan.pk)
    assert resp.status_code == 200, resp.content
    assert resp.json()["checkout_url"].startswith("https://checkout.example/")
    tenant.refresh_from_db()
    assert tenant.billing_currency == "USD"
    assert fake_provider["plan"].pk == plan.pk
    assert fake_provider["success_url"].endswith("/signup/verify?upgraded=1")
    assert fake_provider["cancel_url"].endswith("/signup/verify?upgraded=0")
    assert fake_provider["user"].email == "coach@x.com"


def test_checkout_rejects_unknown_plan_and_subscribed(tenant, plan, fake_provider):
    from apps.accounts.models import User

    assert _checkout(999999).status_code == 404
    # PlatformSubscription.user is a required FK (on_delete=PROTECT) — the
    # brief's original literal (`defaults={"plan": plan, "status": "active"}`)
    # omits it and violates the NOT NULL constraint; supply a real coach user.
    coach, _ = User.objects.get_or_create(email="coach@x.com", defaults={"name": "Coach", "role": "owner"})
    PlatformSubscription.objects.update_or_create(
        tenant=tenant, defaults={"plan": plan, "status": "active", "user": coach}
    )
    assert _checkout(plan.pk).status_code == 409


def test_webhook_attaches_subscription_to_pending_tenant(tenant, plan):
    # Regression pin for the spec's core assumption: the platform webhook
    # handler works before provisioning. Call the handler function directly
    # with a minimal checkout.session.completed event shaped like the ones
    # apps/billing/tests build. The real event-fixture builder lives in
    # apps/billing/tests/test_stripe_webhook.py (`_checkout_session_completed_event`)
    # — apps/core/tests/test_platform_subscription.py has no such helper, so we
    # reuse the real one instead of inventing a new one.
    from apps.accounts.models import User
    from apps.billing.tests.test_stripe_webhook import _checkout_session_completed_event

    coach, _ = User.objects.get_or_create(
        email="coach@x.com",
        defaults={"name": "Coach", "role": "owner"},
    )

    event = _checkout_session_completed_event(tenant=tenant, user=coach, plan=plan, event_id="evt_wizard_checkout_001")
    from apps.billing.views.webhooks import _handle_checkout_session_completed

    _handle_checkout_session_completed(event, webhook_event=None)
    sub = PlatformSubscription.objects.get(tenant=tenant)
    assert sub.status in ("active", "trialing")
    tenant.refresh_from_db()
    assert tenant.provisioning_status == "pending"  # untouched
