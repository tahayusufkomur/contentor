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
    # Regression pin: wizard_checkout must pass a REAL User (real pk), not a
    # SimpleNamespace(pk=None) placeholder. stripe_provider.py stringifies
    # user.pk into checkout metadata; str(None) -> "None" makes the
    # checkout.session.completed webhook's _resolve_user's int("None") raise
    # ValueError, silently dropping the PlatformSubscription for a paying coach.
    assert fake_provider["user"].pk is not None


def test_checkout_user_metadata_resolves_via_real_webhook_path(tenant, plan, fake_provider):
    # Regression pin for the actual bug: build the checkout metadata exactly
    # the way stripe_provider.py does from the user wizard_checkout passes in
    # (str(user.pk)), then feed it through the REAL _resolve_user used by the
    # checkout.session.completed webhook handler, and assert it resolves back
    # to that same coach user. Before the fix, user.pk was None, metadata was
    # str(None) == "None", and _resolve_user's int("None") raised ValueError
    # -> resolved to None -> the subscription was never created.
    from apps.billing.views.webhooks import _resolve_user

    resp = _checkout(plan.pk)
    assert resp.status_code == 200, resp.content
    coach = fake_provider["user"]
    assert coach.pk is not None

    metadata = {"user_id": str(coach.pk)}
    resolved = _resolve_user(metadata)
    assert resolved is not None
    assert resolved.pk == coach.pk
    assert resolved.email == "coach@x.com"


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


def _sync(session_id="cs_test_sync_1"):
    return _client().post(
        "/api/v1/onboarding/wizard/checkout/sync/",
        {"token": _token(), "session_id": session_id},
        format="json",
    )


def _fake_session(tenant, user, plan, **overrides):
    """Minimal retrieved-Checkout-Session shape (expand=["subscription"])."""
    session = {
        "id": "cs_test_sync_1",
        "mode": "subscription",
        "payment_status": "paid",
        "customer": "cus_sync_1",
        "metadata": {"tenant_id": str(tenant.pk), "user_id": str(user.pk), "plan_id": str(plan.pk)},
        "subscription": {
            "id": "sub_sync_1",
            "status": "active",
            "current_period_start": 1_700_000_000,
            "current_period_end": 1_702_600_000,
        },
    }
    session.update(overrides)
    return session


@pytest.fixture()
def coach():
    from apps.accounts.models import User

    user, _ = User.objects.get_or_create(email="coach@x.com", defaults={"name": "Coach", "role": "coach"})
    return user


def _patch_retrieve(monkeypatch, result):
    """Patch at the source module — sync_platform_checkout_session imports it
    lazily, so the name resolves at call time."""
    from apps.billing.providers import stripe_provider

    if isinstance(result, Exception):

        def _raise(session_id):
            raise result

        monkeypatch.setattr(stripe_provider, "retrieve_checkout_session", _raise)
    else:
        monkeypatch.setattr(stripe_provider, "retrieve_checkout_session", lambda session_id: result)


def test_checkout_sync_activates_paid_session(tenant, plan, coach, monkeypatch):
    # The local-dev path: no webhook ever arrives, the browser comes back with
    # ?upgraded=1&session_id=… and the sync endpoint must activate the plan.
    _patch_retrieve(monkeypatch, _fake_session(tenant, coach, plan))
    resp = _sync()
    assert resp.status_code == 200, resp.content
    assert resp.json()["has_paid_platform_plan"] is True
    sub = PlatformSubscription.objects.get(tenant=tenant)
    assert sub.status == "active"
    assert sub.provider_subscription_id == "sub_sync_1"
    assert sub.provider_customer_id == "cus_sync_1"
    assert sub.current_period_end is not None


def test_checkout_sync_is_idempotent_with_webhook(tenant, plan, coach, monkeypatch):
    # Webhook already landed -> sync must not touch Stripe at all.
    PlatformSubscription.objects.update_or_create(
        tenant=tenant, defaults={"plan": plan, "status": "active", "user": coach}
    )
    _patch_retrieve(monkeypatch, AssertionError("retrieve must not be called when already subscribed"))
    resp = _sync()
    assert resp.status_code == 200, resp.content
    assert resp.json()["has_paid_platform_plan"] is True


def test_checkout_sync_rejects_unpaid_and_foreign_sessions(tenant, plan, coach, monkeypatch):
    # Unpaid session (async payment method still pending) -> no activation.
    _patch_retrieve(monkeypatch, _fake_session(tenant, coach, plan, payment_status="unpaid"))
    assert _sync().json()["has_paid_platform_plan"] is False

    # Paid session for a DIFFERENT tenant -> token holder gets nothing.
    foreign = _fake_session(tenant, coach, plan)
    foreign["metadata"] = {**foreign["metadata"], "tenant_id": "999999"}
    _patch_retrieve(monkeypatch, foreign)
    assert _sync().json()["has_paid_platform_plan"] is False
    assert not PlatformSubscription.objects.filter(tenant=tenant).exists()


def test_checkout_sync_survives_provider_error_and_missing_session_id(tenant, plan, monkeypatch):
    from apps.billing.providers.types import ProviderError

    _patch_retrieve(monkeypatch, ProviderError("boom", code="PROVIDER_ERROR"))
    resp = _sync()
    assert resp.status_code == 200, resp.content
    assert resp.json()["has_paid_platform_plan"] is False

    resp = _client().post("/api/v1/onboarding/wizard/checkout/sync/", {"token": _token()}, format="json")
    assert resp.status_code == 200, resp.content
    assert resp.json()["has_paid_platform_plan"] is False


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
