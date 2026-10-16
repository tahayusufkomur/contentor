"""show_badge: a free-plan site wears the "Built with Contentor" badge in its
footer; a site on a paid plan teaches under its own name alone."""

from datetime import UTC, datetime, timedelta

import pytest
from django_tenants.utils import get_public_schema_name, schema_context

from apps.accounts.models import User
from apps.core.models import PlatformPlan, PlatformSubscription
from apps.tenant_config.models import TenantConfig
from apps.tenant_config.serializers import TenantConfigSerializer

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def config(tenant_ctx):
    return TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")


def test_a_free_site_shows_the_badge(config):
    assert TenantConfigSerializer(config).data["show_badge"] is True


def test_a_paid_site_hides_the_badge(tenant_ctx, config):
    # The subscription and its user are public-schema rows; the test runs in
    # the tenant's schema, where accounts_user is the tenant's own copy.
    with schema_context(get_public_schema_name()):
        plan = PlatformPlan.objects.create(
            name="Starter (badge test)",
            price_monthly=19,
            transaction_fee_pct=5,
            max_students=100,
            max_storage_gb=10,
            max_streaming_hours=10,
            max_campaign_emails=1000,
        )
        coach = User.objects.create_user(
            email="badge-owner@test.com",
            name="Badge Owner",
            password="secret123",  # noqa: S106
            role="owner",
        )
        PlatformSubscription.objects.create(
            tenant=tenant_ctx,
            user=coach,
            plan=plan,
            status=PlatformSubscription.STATUS_ACTIVE,
            provider="stripe",
            provider_subscription_id="sub_badge_test",
            provider_customer_id="cus_badge_test",
            current_period_end=datetime.now(tz=UTC) + timedelta(days=30),
        )
    tenant_ctx.refresh_from_db()
    assert TenantConfigSerializer(config).data["show_badge"] is False
