"""Coach link registry: validation, knowledge-pack LINKS section, status
whitelist. Reuses the coach_client/tenant_client/paid_tenant scaffolding
from test_assistant_takeover.py (unique names: plan "Assistant Links Test
Paid", owner assistant-links-owner@x.com, coach links-coach@x.com)."""

import pytest
from django_tenants.utils import schema_context
from rest_framework.test import APIClient

from apps.core.models import PlatformPlan, PlatformSubscription
from apps.tenant_config import student_bot
from apps.tenant_config.models import AssistantConfig

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture
def tenant_client(tenant_ctx):
    return APIClient(HTTP_HOST="shared-test.localhost")


@pytest.fixture
def paid_tenant(tenant_ctx):
    from apps.accounts.models import User

    with schema_context("public"):
        plan = PlatformPlan.objects.create(
            name="Assistant Links Test Paid",
            price_monthly=19,
            transaction_fee_pct=5,
            max_student_bot_questions=100,
        )
        owner = User.objects.create_user(
            email="assistant-links-owner@x.com",
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
def _enabled_and_clean(paid_tenant):
    from apps.accounts.models import User
    from apps.tenant_config.models import AssistantLink

    cfg = AssistantConfig.load()
    cfg.enabled = True
    cfg.save()

    def _scrub():
        with schema_context(paid_tenant.schema_name):
            AssistantLink.objects.all().delete()
            PlatformSubscription.objects.all().delete()
            PlatformPlan.objects.filter(name="Assistant Links Test Paid").delete()
            User.objects.filter(email="assistant-links-owner@x.com").delete()

    yield
    _scrub()


@pytest.fixture
def coach_client(tenant_ctx):
    from apps.accounts.models import User

    coach = User.objects.create_user(
        email="links-coach@x.com",
        name="Cem Koç",
        password="x",
        role="owner",  # noqa: S106
    )
    coach.is_staff = True
    coach.save()
    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=coach)
    return client


class TestLinkCrud:
    def test_create_valid_and_reject_bad_schemes(self, coach_client):
        ok = coach_client.post(
            "/api/v1/admin/assistant/links/",
            {"label": "My Instagram", "url": "https://instagram.com/coach", "note": "social"},
            format="json",
        )
        assert ok.status_code == 201
        for bad in (
            "http://x.com",
            "javascript:alert(1)",
            "//evil.com",
            "ftp://x",
            "instagram.com",
            "/\\evil.com",
            "/\\/evil.com",
        ):
            res = coach_client.post("/api/v1/admin/assistant/links/", {"label": "x", "url": bad}, format="json")
            assert res.status_code == 400, bad

    def test_same_site_path_allowed(self, coach_client):
        assert (
            coach_client.post(
                "/api/v1/admin/assistant/links/", {"label": "Store", "url": "/store"}, format="json"
            ).status_code
            == 201
        )

    def test_cap_of_20(self, coach_client):
        for i in range(20):
            coach_client.post(
                "/api/v1/admin/assistant/links/", {"label": f"L{i}", "url": f"https://x.com/{i}"}, format="json"
            )
        assert (
            coach_client.post(
                "/api/v1/admin/assistant/links/", {"label": "over", "url": "https://x.com/over"}, format="json"
            ).status_code
            == 400
        )


class TestPackAndWhitelist:
    def test_links_enter_pack_and_hash(self, tenant_ctx, coach_client):
        from apps.tenant_config.models import TenantConfig

        config = TenantConfig.objects.first()
        before, hash_before = student_bot.build_system_prompt(tenant_ctx, config)
        coach_client.post(
            "/api/v1/admin/assistant/links/",
            {"label": "Book a call", "url": "https://calendly.com/coach", "note": "1:1 intro"},
            format="json",
        )
        after, hash_after = student_bot.build_system_prompt(tenant_ctx, config)
        assert "LINKS (approved extra links" in after
        assert "Book a call: https://calendly.com/coach — 1:1 intro" in after
        assert hash_before != hash_after

    def test_status_whitelist_only_external_enabled(self, tenant_client, coach_client, paid_tenant):
        coach_client.post(
            "/api/v1/admin/assistant/links/", {"label": "IG", "url": "https://instagram.com/c"}, format="json"
        )
        coach_client.post("/api/v1/admin/assistant/links/", {"label": "Store", "url": "/store"}, format="json")
        off = coach_client.post(
            "/api/v1/admin/assistant/links/", {"label": "Off", "url": "https://off.com"}, format="json"
        ).json()
        coach_client.patch(f"/api/v1/admin/assistant/links/{off['id']}/", {"enabled": False}, format="json")
        wl = tenant_client.get("/api/v1/assistant/status/").json()["link_whitelist"]
        assert wl == ["https://instagram.com/c"]
