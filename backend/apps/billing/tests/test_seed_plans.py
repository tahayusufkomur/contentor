"""Phase 0 — seed_plans writes Stripe Price IDs into PlatformPlan.prices."""

from __future__ import annotations

from io import StringIO

import pytest
from django.core.management import call_command
from django.test import override_settings

from apps.core.models import PlatformPlan

pytestmark = pytest.mark.django_db


@override_settings(
    BILLING_FREE_PLAN_NAME="Free",
    STRIPE_PRICE_STARTER_USD="price_starter_usd_test",
    STRIPE_PRICE_STARTER_TRY="price_starter_try_test",
    STRIPE_PRICE_PRO_USD="price_pro_usd_test",
    STRIPE_PRICE_PRO_TRY="price_pro_try_test",
    STRIPE_SECRET_KEY="",  # skip price retrieval
    CONTENTOR_SUPERUSERS=[],
)
def test_seed_plans_writes_stripe_price_ids(restore_public, settings):
    # Run the seed command into the running schema. Output discarded.
    out = StringIO()
    call_command("seed_plans", stdout=out)

    starter = PlatformPlan.objects.get(name="starter")
    assert starter.prices["USD"]["stripe_price_id"] == "price_starter_usd_test"
    assert starter.prices["TRY"]["stripe_price_id"] == "price_starter_try_test"
    # Amounts mirror PLAN_AMOUNTS in seed_plans (the source of truth): $19.90 / ₺999.00.
    assert starter.prices["USD"]["amount_cents"] == 1990
    assert starter.prices["TRY"]["amount_cents"] == 99900

    pro = PlatformPlan.objects.get(name="pro")
    assert pro.prices["USD"]["stripe_price_id"] == "price_pro_usd_test"
    assert pro.prices["TRY"]["stripe_price_id"] == "price_pro_try_test"

    free = PlatformPlan.objects.get(name="Free")
    # Free plan has an empty prices dict by design.
    assert free.prices == {}
