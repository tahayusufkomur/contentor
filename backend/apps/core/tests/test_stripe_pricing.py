"""Unit tests for apps.core.stripe_pricing.provision_stripe_price.

No DB. The stripe client is mocked — we assert the grandfathering mechanism:
unchanged amount reuses the Price; a changed amount creates a NEW Price and
transfers the stable lookup_key onto it (so old subscribers keep the old Price).
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from apps.core import stripe_pricing


def test_returns_empty_when_stripe_unconfigured():
    with patch.object(stripe_pricing, "_stripe_client", return_value=None):
        out = stripe_pricing.provision_stripe_price(
            plan_key="starter", currency="USD", amount_cents=1990
        )
    assert out == ""


def test_reuses_price_when_amount_unchanged():
    stripe = MagicMock()
    existing = MagicMock(id="price_existing", unit_amount=1990, currency="usd")
    stripe.Price.list.return_value = MagicMock(data=[existing])
    with patch.object(stripe_pricing, "_stripe_client", return_value=stripe):
        out = stripe_pricing.provision_stripe_price(
            plan_key="starter", currency="USD", amount_cents=1990, log=lambda *_: None
        )
    assert out == "price_existing"
    stripe.Price.create.assert_not_called()


def test_creates_new_price_and_transfers_lookup_key_on_change():
    stripe = MagicMock()
    old = MagicMock(id="price_old", unit_amount=1990, currency="usd")
    stripe.Price.list.return_value = MagicMock(data=[old])
    stripe.Product.search.return_value = MagicMock(data=[MagicMock(id="prod_1")])
    stripe.Price.create.return_value = MagicMock(id="price_new")
    with patch.object(stripe_pricing, "_stripe_client", return_value=stripe):
        out = stripe_pricing.provision_stripe_price(
            plan_key="starter", currency="USD", amount_cents=2490, log=lambda *_: None
        )
    assert out == "price_new"
    _, kwargs = stripe.Price.create.call_args
    assert kwargs["transfer_lookup_key"] is True
    assert kwargs["lookup_key"] == "contentor_starter_usd_monthly"
    assert kwargs["unit_amount"] == 2490
    assert kwargs["currency"] == "usd"


def test_returns_empty_on_stripe_error():
    stripe = MagicMock()
    stripe.Price.list.side_effect = RuntimeError("stripe down")
    with patch.object(stripe_pricing, "_stripe_client", return_value=stripe):
        out = stripe_pricing.provision_stripe_price(
            plan_key="pro", currency="TRY", amount_cents=249900, log=lambda *_: None
        )
    assert out == ""
