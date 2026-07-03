# backend/apps/billing/tests/test_seed_connect_test.py
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.core.management import CommandError, call_command
from django.test import override_settings

from apps.core.models import Tenant


@pytest.mark.django_db
@override_settings(STRIPE_SECRET_KEY="sk_test_x")  # noqa: S106  # pragma: allowlist secret
def test_seeds_connect_account_and_flags_tenant():
    tenant = Tenant.objects.create(
        schema_name="e2etest",
        name="E2E",
        slug="e2etest",
        subdomain="e2etest",
        owner_email="c@example.com",
        provisioning_status="ready",
    )
    fake_acct = SimpleNamespace(id="acct_test_1", charges_enabled=True)
    with patch("apps.billing.management.commands.seed_connect_test.stripe") as mstripe:
        mstripe.Account.create.return_value = fake_acct
        mstripe.Account.retrieve.return_value = fake_acct
        call_command("seed_connect_test", tenant="e2etest")
    tenant.refresh_from_db()
    assert tenant.stripe_account_id == "acct_test_1"
    assert tenant.stripe_charges_enabled is True


@pytest.mark.django_db
@override_settings(STRIPE_SECRET_KEY="sk_live_x")  # noqa: S106  # pragma: allowlist secret
def test_refuses_live_keys():
    with pytest.raises(CommandError):
        call_command("seed_connect_test", tenant="whatever")
