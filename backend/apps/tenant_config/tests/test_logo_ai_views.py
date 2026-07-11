"""Logo Studio AI status endpoint: paid-tier gate, provider availability, and
the per-tenant monthly turn/refine quotas. The batch Brand Pack endpoint is
retired; conversation endpoints live in test_logo_converse_views.py.
"""

import pytest
from django_tenants.utils import schema_context
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import LogoAiUsage, PlatformPlan, PlatformSubscription
from apps.tenant_config import logo_ai

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"
SHARED_SCHEMA = "shared_test"
MONTH = "2026-07"

STATUS_URL = "/api/v1/admin/config/logo-ai/status/"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="coach@logoaitest.com",
        name="Coach",
        password="x",
        role="owner",
        is_staff=True,  # noqa: S106
    )


@pytest.fixture()
def coach_client(coach):
    client = APIClient(HTTP_HOST=HOST)
    client.force_authenticate(user=coach)
    return client


@pytest.fixture()
def paid_tenant(tenant_ctx):
    # PlatformPlan/Subscription/User are public-schema; create them under the
    # public schema explicitly so the subscription's user FK resolves (this
    # fixture runs inside tenant_ctx, which would otherwise write the user to
    # the tenant schema and break the cross-schema FK — see the identical
    # pattern in apps/mailbox/tests/test_platform_address.py).
    with schema_context("public"):
        plan = PlatformPlan.objects.create(name="Logo AI Test Paid", price_monthly=19, transaction_fee_pct=5)
        owner = User.objects.create_user(
            email="logoai-owner@x.com",
            name="Owner",
            password="x",
            role="owner",  # noqa: S106
        )
        PlatformSubscription.objects.create(
            tenant=tenant_ctx, user=owner, plan=plan, status=PlatformSubscription.STATUS_ACTIVE, provider="manual"
        )
    tenant_ctx.refresh_from_db()
    return tenant_ctx


@pytest.fixture(autouse=True)
def _clean_shared():
    def _scrub():
        # Run inside the tenant schema (not "public"): deleting
        # PlatformSubscription cascades into tenant-only tables (e.g.
        # billing_payment), which are only visible with the tenant on the
        # search path — same gotcha documented in
        # apps/mailbox/tests/test_platform_address.py.
        with schema_context(SHARED_SCHEMA):
            PlatformSubscription.objects.all().delete()
            PlatformPlan.objects.filter(name="Logo AI Test Paid").delete()
            User.objects.filter(email="logoai-owner@x.com").delete()
            LogoAiUsage.objects.all().delete()

    _scrub()
    yield
    _scrub()


class TestLogoAiStatus:
    def test_upgrade_required_for_free_tenant(self, coach_client, tenant_ctx, settings):
        settings.ANTHROPIC_API_KEY = "test-key"
        resp = coach_client.get(STATUS_URL)
        assert resp.status_code == 200
        assert resp.data["eligible"] is False
        assert resp.data["reason"] == "upgrade_required"

    def test_disabled_without_api_key_even_when_paid(self, coach_client, paid_tenant, settings):
        settings.ANTHROPIC_API_KEY = ""
        resp = coach_client.get(STATUS_URL)
        assert resp.data["eligible"] is True
        assert resp.data["enabled"] is False
        assert resp.data["reason"] == "disabled"

    def test_full_quota_for_fresh_paid_tenant(self, coach_client, paid_tenant, settings):
        settings.ANTHROPIC_API_KEY = "test-key"
        resp = coach_client.get(STATUS_URL)
        assert resp.data == {
            "enabled": True,
            "eligible": True,
            "turns_remaining": settings.LOGO_AI_MONTHLY_TURN_LIMIT,
            "refine_remaining": settings.LOGO_AI_MONTHLY_REFINE_LIMIT,
            "reason": None,
        }

    def test_turn_quota_exhausted(self, coach_client, paid_tenant, settings):
        settings.ANTHROPIC_API_KEY = "test-key"
        settings.LOGO_AI_MONTHLY_TURN_LIMIT = 2
        for _ in range(2):
            logo_ai.record_successful_turn(paid_tenant.schema_name, month=logo_ai._current_month())
        resp = coach_client.get(STATUS_URL)
        assert resp.data["turns_remaining"] == 0
        assert resp.data["reason"] == "quota_exhausted"

    def test_refine_remaining_reflects_usage(self, coach_client, paid_tenant, settings):
        settings.ANTHROPIC_API_KEY = "test-key"
        logo_ai.record_successful_refinement(paid_tenant.schema_name, month=logo_ai._current_month())
        resp = coach_client.get(STATUS_URL)
        assert resp.data["refine_remaining"] == settings.LOGO_AI_MONTHLY_REFINE_LIMIT - 1
