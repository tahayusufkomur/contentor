"""A student's Checkout opens in the site's language, and Stripe's receipts follow it.

Stripe is mocked: `Session.create` for the two student checkouts, `Customer.modify` for the
webhook. The webhook runs on the platform host (English), so it takes the language only
from the session's `metadata.locale`.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import pytest
import stripe
from django.test import override_settings
from rest_framework.test import APIClient

from apps.billing.providers import connect
from apps.billing.providers.stripe_provider import _SUPPORTED_STRIPE_LOCALES, StripeProvider
from apps.core import languages
from apps.core.models import Tenant
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db

_SESSION = SimpleNamespace(url="https://checkout.stripe.com/c/pay/cs_x", id="cs_x", client_secret="")
_PAY = {
    "line_items": [{"price_data": {"currency": "usd", "unit_amount": 1000}, "quantity": 1}],
    "application_fee_cents": 40,
}


def _site(locale):
    TenantConfig.objects.all().delete()
    TenantConfig.objects.create(brand_name="Studio", default_locale=locale)


def _marketplace():
    return connect.create_marketplace_checkout(
        account_id="acct_l", success_url="https://x/ok", cancel_url="https://x/no", metadata={"payment_id": "7"}, **_PAY
    )


def _subscription():
    return connect.create_subscription_checkout(
        account_id="acct_l",
        price_id="price_l",
        application_fee_percent=4.0,
        success_url="https://x/ok",
        cancel_url="https://x/no",
        metadata={"subscription_plan_id": "3"},
    )


@pytest.mark.parametrize("create", [_marketplace, _subscription])
def test_a_turkish_site_opens_checkout_in_turkish(tenant_ctx, create):
    _site("tr")
    with patch("stripe.checkout.Session.create", return_value=_SESSION) as mk:
        create()
    kwargs = mk.call_args.kwargs
    assert kwargs["locale"] == "tr"
    assert kwargs["metadata"]["locale"] == "tr"


@pytest.mark.parametrize(
    "create, metadata",
    [(_marketplace, {"payment_id": "7"}), (_subscription, {"subscription_plan_id": "3"})],
)
def test_an_english_site_is_unchanged_but_for_the_metadata_key(tenant_ctx, create, metadata):
    _site("en")
    with patch("stripe.checkout.Session.create", return_value=_SESSION) as mk:
        create()
    kwargs = mk.call_args.kwargs
    assert kwargs["locale"] == "en"
    assert kwargs["metadata"] == {**metadata, "locale": "en"}
    assert kwargs["stripe_account"] == "acct_l"
    assert kwargs["customer_email"] is None
    assert kwargs["mode"] == ("payment" if create is _marketplace else "subscription")


def test_the_checkout_locale_is_never_hardcoded():
    assert {languages.info(code)["stripe"] for code in languages.CODES} == _SUPPORTED_STRIPE_LOCALES


def _post_session_completed(*, mode, metadata, customer="cus_l", account="acct_l", modify_error=None):
    obj = {"id": "cs_l", "payment_status": "paid", "customer": customer, "metadata": metadata}
    if mode == "payment":
        obj["payment_intent"] = "pi_l"
    else:
        obj["subscription"] = "sub_l"
    body = {
        "id": f"evt_l_{mode}",
        "type": "checkout.session.completed",
        "data": {"object": obj},
    }
    if account:
        body["account"] = account

    class _Event(dict):
        def to_dict(self):
            return body

    with (
        patch("stripe.Webhook.construct_event", return_value=_Event(body)),
        patch("stripe.Customer.modify", side_effect=modify_error) as modify,
        patch("apps.billing.providers.connect.retrieve_receipt_url", return_value=""),
    ):
        resp = APIClient().post(
            "/api/webhooks/stripe/",
            data="{}",
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="t=1,v1=fake",
        )
    assert resp.status_code == 200, resp.content
    return modify


@pytest.fixture()
def connected(restore_public):
    Tenant.objects.filter(pk=restore_public.pk).update(stripe_account_id="acct_l")
    return restore_public


@pytest.mark.parametrize("mode", ["payment", "subscription"])
@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_WEBHOOK_SECRET="whsec_l")  # noqa: S106
def test_the_webhook_sets_the_customers_preferred_locale(connected, mode):
    metadata = {
        "tenant_id": str(connected.pk),
        "locale": "tr",
        "payment_id": "999999",
        "subscription_plan_id": "999999",
    }
    modify = _post_session_completed(mode=mode, metadata=metadata)
    modify.assert_called_once_with("cus_l", preferred_locales=["tr"], stripe_account="acct_l")


@pytest.mark.parametrize("mode", ["payment", "subscription"])
@pytest.mark.parametrize("locale", [None, "", "xx"])
@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_WEBHOOK_SECRET="whsec_l")  # noqa: S106
def test_a_missing_or_unknown_locale_changes_no_customer(connected, mode, locale):
    metadata = {"tenant_id": str(connected.pk), "payment_id": "999999", "subscription_plan_id": "999999"}
    if locale is not None:
        metadata["locale"] = locale
    _post_session_completed(mode=mode, metadata=metadata).assert_not_called()


@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_WEBHOOK_SECRET="whsec_l")  # noqa: S106
def test_a_session_without_a_customer_changes_no_customer(connected):
    metadata = {"tenant_id": str(connected.pk), "locale": "tr", "payment_id": "999999"}
    _post_session_completed(mode="payment", metadata=metadata, customer=None).assert_not_called()


@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_WEBHOOK_SECRET="whsec_l")  # noqa: S106
def test_an_event_without_an_account_changes_no_customer(connected):
    metadata = {"tenant_id": str(connected.pk), "locale": "tr", "payment_id": "999999"}
    _post_session_completed(mode="payment", metadata=metadata, account=None).assert_not_called()


@pytest.mark.parametrize("mode", ["payment", "subscription"])
@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_WEBHOOK_SECRET="whsec_l")  # noqa: S106
def test_a_stripe_failure_setting_the_locale_is_logged_and_the_webhook_still_succeeds(connected, mode):
    metadata = {
        "tenant_id": str(connected.pk),
        "locale": "tr",
        "payment_id": "999999",
        "subscription_plan_id": "999999",
    }
    # The app's logging config does not propagate to caplog, so watch the logger itself.
    with patch.object(connect.logger, "warning") as warn:
        modify = _post_session_completed(mode=mode, metadata=metadata, modify_error=stripe.StripeError("boom"))
    modify.assert_called_once()
    warn.assert_called_once()
    assert warn.call_args.args[1:] == ("acct_l", "cus_l")
    assert warn.call_args.kwargs == {"exc_info": True}


@pytest.mark.parametrize("enabled, expected", [(["en"], "en"), (["en", "pl"], "pl")])
@override_settings(STRIPE_SECRET_KEY="sk_test_locale_dummy")  # noqa: S106
def test_a_creators_platform_checkout_opens_in_an_enabled_language_only(enabled, expected):
    plan = SimpleNamespace(pk=1, name="starter", prices={"USD": {"stripe_price_id": "price_l"}})
    tenant = SimpleNamespace(pk=1, region="global", billing_currency="USD")
    session = SimpleNamespace(url="https://checkout.stripe.com/x", id="cs_p", expires_at=1893456000)
    with (
        override_settings(ENABLED_LOCALES=enabled),
        patch("stripe.checkout.Session.create", return_value=session) as mk,
    ):
        StripeProvider().create_checkout_session(
            tenant=tenant,
            user=SimpleNamespace(pk=1, email="c@x.test"),
            plan=plan,
            success_url="https://x/ok",
            cancel_url="https://x/no",
            locale="pl",
        )
    assert mk.call_args.kwargs["locale"] == expected
