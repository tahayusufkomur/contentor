"""A creator's plan checkout (and the domain they buy) opens in the creator's language, and Stripe's
receipts for the platform customer follow it. Stripe is faked: `Session.create`, `Customer.modify`."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import patch

import pytest
import stripe
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.providers import connect
from apps.billing.providers.bypass_provider import BypassProvider
from apps.core.models import PlatformPlan, Tenant
from apps.domains.billing import create_domain_checkout

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db

_SESSION = SimpleNamespace(
    id="cs_p",
    url="https://checkout.stripe.com/c/pay/cs_p",
    expires_at=int(datetime(2030, 1, 1, tzinfo=UTC).timestamp()),
)


@pytest.fixture(autouse=True)
def _all_languages(settings):
    settings.ENABLED_LOCALES = ["en", "tr", "de", "pl"]


@pytest.fixture()
def plan(restore_public):
    plan, _created = PlatformPlan.objects.update_or_create(
        name="locale-starter",
        defaults={
            "price_monthly": 19,
            "transaction_fee_pct": 8,
            "max_students": 100,
            "max_storage_gb": 100,
            "max_streaming_hours": 100,
            "max_campaign_emails": 1000,
            "is_live_enabled": True,
            "prices": {"USD": {"amount_cents": 1900, "stripe_price_id": "price_locale_usd"}},
        },
    )
    return plan


def _owner(tenant_ctx, locale):
    return User.objects.create_user(
        email="owner@locale.test",
        name="Owner",
        password="secret123",
        role="owner",
        preferred_locale=locale,  # noqa: S106
    )


@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_SECRET_KEY="sk_test_locale_dummy")  # noqa: S106
@pytest.mark.parametrize("locale", ["de", "pl", "en"])
def test_plan_checkout_is_in_the_creators_language(tenant_ctx, plan, locale):
    Tenant.objects.filter(pk=tenant_ctx.pk).update(billing_currency="", region="global")
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    client.force_authenticate(user=_owner(tenant_ctx, locale))
    with patch("stripe.checkout.Session.create", return_value=_SESSION) as create:
        resp = client.post("/api/v1/billing/platform/checkout/", {"plan_id": plan.pk}, format="json")
    assert resp.status_code == 200, resp.content
    kwargs = create.call_args.kwargs
    assert kwargs["locale"] == locale
    assert kwargs["metadata"]["locale"] == locale
    assert kwargs["subscription_data"]["metadata"]["locale"] == locale


def _complete(metadata, *, customer="cus_p", modify_error=None):
    body = {
        "id": "evt_p_locale",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_p",
                "mode": "subscription",
                "payment_status": "paid",
                "customer": customer,
                "subscription": "sub_p",
                "metadata": metadata,
            }
        },
    }

    class _Event(dict):
        def to_dict(self):
            return body

    with (
        patch("stripe.Webhook.construct_event", return_value=_Event(body)),
        patch("stripe.Customer.modify", side_effect=modify_error) as modify,
    ):
        resp = APIClient().post(
            "/api/webhooks/stripe/", data="{}", content_type="application/json", HTTP_STRIPE_SIGNATURE="t=1,v1=fake"
        )
    assert resp.status_code == 200, resp.content
    return modify


@pytest.fixture()
def refs(restore_public, plan):
    user = User.objects.create_user(email="owner@locale.test", name="Owner", password="secret123", role="owner")  # noqa: S106
    return {"tenant_id": str(restore_public.pk), "user_id": str(user.pk), "plan_id": str(plan.pk)}


@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_WEBHOOK_SECRET="whsec_l")  # noqa: S106
def test_the_webhook_sets_the_platform_customers_preferred_locale(refs):
    modify = _complete({**refs, "locale": "de"})
    modify.assert_called_once_with("cus_p", preferred_locales=["de"])


@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_WEBHOOK_SECRET="whsec_l")  # noqa: S106
@pytest.mark.parametrize("locale", [None, "", "xx"])
def test_a_missing_or_unknown_locale_changes_no_customer(refs, locale):
    metadata = refs if locale is None else {**refs, "locale": locale}
    _complete(metadata).assert_not_called()


@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_WEBHOOK_SECRET="whsec_l")  # noqa: S106
def test_a_stripe_failure_setting_the_locale_is_logged_and_access_is_still_granted(refs):
    with patch.object(connect.logger, "warning") as warn:
        _complete({**refs, "locale": "de"}, modify_error=stripe.StripeError("boom"))
    warn.assert_called_once()
    assert warn.call_args.args[1:] == ("", "cus_p") and warn.call_args.kwargs == {"exc_info": True}
    from apps.core.models import PlatformSubscription

    assert PlatformSubscription.objects.filter(tenant_id=refs["tenant_id"], provider_subscription_id="sub_p").exists()


@override_settings(DOMAINS_BYPASS_ENABLED=False, STRIPE_SECRET_KEY="sk_test_locale_dummy")  # noqa: S106
def test_the_domain_checkout_opens_in_the_creators_language():
    tenant = SimpleNamespace(pk=1)
    domain = SimpleNamespace(id=5, domain="ornek.com", currency="USD", price_minor=1500)
    with patch("stripe.checkout.Session.create", return_value=_SESSION) as create:
        create_domain_checkout(
            tenant=tenant,
            user=SimpleNamespace(email="c@x.test", preferred_locale="pl"),
            custom_domain=domain,
            success_url="https://x/ok",
            cancel_url="https://x/no",
        )
    assert create.call_args.kwargs["locale"] == "pl"


def test_the_bypass_checkout_makes_the_creators_row_in_the_creators_language(restore_public, plan):
    placeholder = User(email="pending@locale.test", name="Pending")
    BypassProvider().create_checkout_session(
        tenant=restore_public, user=placeholder, plan=plan, success_url="x", cancel_url="y", locale="de"
    )
    assert User.objects.get(email="pending@locale.test").preferred_locale == "de"
