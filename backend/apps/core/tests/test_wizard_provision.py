"""Integration: provision_tenant consumes wizard_state.

Heavy tests — each provisions a real tenant schema + runs the yoga seeder.
Kept to three cases; everything unit-testable lives in test_wizard_compose.
"""

import pytest
from django.db import connection
from django_tenants.utils import schema_context, tenant_context

from apps.core.models import PlatformPlan, PlatformSubscription, Tenant
from apps.core.tasks import provision_tenant

pytestmark = pytest.mark.django_db(transaction=True)

WIZARD_ANSWERS = {
    "niche": "yoga",
    "description": "Vinyasa for busy professionals.",
    "goals": ["sell_courses", "build_community"],
    "theme": "slate",  # deliberately NOT yoga's default (forest) — proves override
    "font_family": "Inter",
    "navbar_layout": "minimal",
    "hero_style": "split",
    "page_layouts": {
        "home": "home-story",
        "about": "about-story",
        "courses": "courses-grid",
        "pricing": "pricing-simple",
        "faq": "faq-list",
        "contact": "contact-form",
    },
    "logo": {"mode": "wordmark", "curated_id": None},
}


def _make_tenant(slug, wizard_answers=None):
    connection.set_schema_to_public()
    tenant = Tenant.objects.create(
        schema_name=slug.replace("-", "_"),
        name="Prov Studio",
        slug=slug,
        subdomain=slug,
        owner_email="prov@x.com",
        provisioning_status="pending",
        template_niche="yoga",
        template_seed_status="seeding",
        wizard_state={"answers": wizard_answers} if wizard_answers else {},
    )
    return tenant


def _provision(tenant):
    provision_tenant.apply(args=[tenant.id, "prov@x.com", "Prov Coach", "yoga"])
    tenant.refresh_from_db()
    return tenant


def _grant_paid_plan(tenant):
    """Attach an active non-Free PlatformSubscription so has_paid_platform_plan
    is True at provision time. PlatformPlan/PlatformSubscription/User are
    public-schema models; create under schema_context("public") explicitly so
    the subscription's user FK resolves correctly regardless of caller schema.
    """
    from apps.accounts.models import User

    with schema_context("public"):
        plan, _ = PlatformPlan.objects.get_or_create(
            name="Starter",
            defaults={"price_monthly": 19, "transaction_fee_pct": 8},
        )
        owner = User.objects.filter(email="prov-paid@x.com").first() or User.objects.create_user(
            email="prov-paid@x.com",
            name="Prov Paid Owner",
            password="secret123",  # noqa: S106
            role="owner",
        )
        PlatformSubscription.objects.create(tenant=tenant, user=owner, plan=plan, status="active", provider="bypass")
    tenant.refresh_from_db()
    return tenant


@pytest.fixture()
def cleanup(restore_public):
    created = []
    yield created
    connection.set_schema_to_public()
    for slug in created:
        for t in Tenant.objects.filter(slug=slug):
            # PlatformSubscription is public-schema but cascades into
            # tenant-only tables (→ billing_payment), which are only visible
            # with the tenant schema on the search_path — delete it first,
            # same guard apps/mailbox/tests/test_platform_address.py uses.
            with schema_context(t.schema_name):
                PlatformSubscription.objects.filter(tenant=t).delete()
            t.delete(force_drop=True)


def test_wizard_answers_override_niche_defaults(cleanup):
    cleanup.append("prov-wiz")
    tenant = _provision(_make_tenant("prov-wiz", WIZARD_ANSWERS))
    assert tenant.provisioning_status == "ready"
    assert tenant.template_seed_status == "ready"
    assert tenant.wizard_state["provisioning_stage"] == "finalizing"

    with tenant_context(tenant):
        from apps.community.models import CommunitySettings
        from apps.tenant_config.models import TenantConfig

        config = TenantConfig.objects.first()
        assert config.theme == "slate"
        assert config.font_family == "Inter"
        assert config.navbar_config["layout"] == "minimal"
        hrefs = [link["href"] for link in config.navbar_config["links"]]
        assert "/plans" in hrefs and "/events" not in hrefs and "/store" not in hrefs
        assert "community" in config.enabled_modules
        assert "live" not in config.enabled_modules
        hero = config.pages["home"]["blocks"][0]
        assert hero["type"] == "hero" and hero["layout"] == "split"
        assert hero["bgImage"]["photo_id"]  # harvested from the seeded niche photo
        assert hero["heading"] == "Find Your Balance Through Yoga"  # niche copy kept
        assert [b["type"] for b in config.pages["home"]["blocks"]][:2] == ["hero", "imageText"]
        assert config.onboarding_completed is True
        assert CommunitySettings.load().is_enabled is True
        # Seeded content still there as drafts:
        from apps.courses.models import Course

        assert Course.objects.filter(is_published=False).count() >= 6


def test_legacy_tenant_without_wizard_state_unchanged(cleanup):
    cleanup.append("prov-legacy")
    tenant = _provision(_make_tenant("prov-legacy"))
    with tenant_context(tenant):
        from apps.community.models import CommunitySettings
        from apps.tenant_config.models import TenantConfig

        config = TenantConfig.objects.first()
        assert config.theme == "forest"  # yoga niche default untouched
        assert config.onboarding_completed is False
        assert CommunitySettings.load().is_enabled is False


def test_curated_logo_applied_at_provision(cleanup):
    from django.db import connection as conn

    from apps.core.models import CuratedLogo

    conn.set_schema_to_public()
    curated = CuratedLogo.objects.create(
        title="Lotus",
        prompt="a lotus",
        tags="yoga",
        image_key="platform/curated-logos/lotus.png",
        enabled=True,
    )
    cleanup.append("prov-logo")
    answers = {**WIZARD_ANSWERS, "logo": {"mode": "curated", "curated_id": curated.id}}
    try:
        tenant = _provision(_make_tenant("prov-logo", answers))
        with tenant_context(tenant):
            from apps.tenant_config.models import TenantConfig

            config = TenantConfig.objects.first()
            assert config.logo is not None
            assert config.logo.s3_key == "platform/curated-logos/lotus.png"
            assert config.navbar_config["show_brand_name"] is True
    finally:
        conn.set_schema_to_public()
        curated.delete()


def test_wordmark_logo_stores_nothing(cleanup):
    cleanup.append("prov-word")
    tenant = _provision(_make_tenant("prov-word", WIZARD_ANSWERS))  # logo.mode == wordmark
    with tenant_context(tenant):
        from apps.tenant_config.models import TenantConfig

        config = TenantConfig.objects.first()
        assert config.logo is None
        assert config.logo_url == ""


def _wiz_tenant(cleanup, slug, extra_state=None):
    cleanup.append(slug)
    tenant = _make_tenant(slug, WIZARD_ANSWERS)
    if extra_state:
        tenant.wizard_state = {**tenant.wizard_state, **extra_state}
        tenant.save(update_fields=["wizard_state"])
    return tenant


def _home_hero_heading(tenant):
    with tenant_context(tenant):
        from apps.tenant_config.models import TenantConfig

        return TenantConfig.objects.first().pages["home"]["blocks"][0]["heading"]


def test_ai_compose_ok_applies_copy(cleanup, monkeypatch):
    from apps.core.onboarding import ai_compose

    def fake_compose(pages, **kwargs):
        import copy

        out = copy.deepcopy(pages)
        out["home"]["blocks"][0]["heading"] = "AI WROTE THIS"
        return out

    monkeypatch.setattr(ai_compose, "compose_available", lambda: True)
    monkeypatch.setattr(ai_compose, "compose_pages", fake_compose)
    tenant = _provision(_wiz_tenant(cleanup, "prov-ai-ok"))
    assert tenant.provisioning_status == "ready"
    assert tenant.wizard_state["ai_compose_status"] == "ok"
    assert _home_hero_heading(tenant) == "AI WROTE THIS"


def test_ai_compose_failure_falls_back_to_static(cleanup, monkeypatch):
    from apps.core.onboarding import ai_compose

    def boom(pages, **kwargs):
        raise ai_compose.ComposeError("provider down")

    monkeypatch.setattr(ai_compose, "compose_available", lambda: True)
    monkeypatch.setattr(ai_compose, "compose_pages", boom)
    tenant = _provision(_wiz_tenant(cleanup, "prov-ai-fail"))
    assert tenant.provisioning_status == "ready"  # provisioning NEVER fails on AI
    assert tenant.wizard_state["ai_compose_status"] == "failed"
    assert _home_hero_heading(tenant) == "Find Your Balance Through Yoga"  # static niche copy stands


def test_ai_compose_skipped_when_unavailable_and_idempotent(cleanup, monkeypatch):
    from apps.core.onboarding import ai_compose

    calls = []
    monkeypatch.setattr(ai_compose, "compose_available", lambda: False)
    monkeypatch.setattr(ai_compose, "compose_pages", lambda *a, **k: calls.append(1))
    tenant = _provision(_wiz_tenant(cleanup, "prov-ai-skip"))
    assert tenant.wizard_state["ai_compose_status"] == "skipped"
    assert calls == []

    # Retry with a status already recorded: no second attempt even if available.
    monkeypatch.setattr(ai_compose, "compose_available", lambda: True)
    _provision(tenant)
    assert calls == []


# Full v2 shape (mark/badge/colors all present with explicit enum values) —
# logo_recipe.validate_recipe has no defaults for those enums, so a bare
# {"version": 2, "layout": ..., "name": ...} 400s on a missing mark.type
# (see apps/core/tests/test_wizard_catalog.py's _VALID_AI_RECIPE, same shape).
AI_RECIPE = {
    "version": 2,
    "layout": "name_only",
    "name": "Prov Studio",
    "mark": {"type": "initials", "style": "plain"},
    "badge": {"shape": "circle", "outline": False},
    "colors": {"badge": {"type": "solid", "color": "#111827"}, "mark": "#ffffff", "text": "#111827"},
}


def test_ai_logo_applied_at_provision(cleanup):
    cleanup.append("prov-ai-logo")
    answers = {
        **WIZARD_ANSWERS,
        "logo": {
            "mode": "ai",
            "curated_id": None,
            "recipe": AI_RECIPE,
            "export_keys": {
                "logo": "wizard/prov_ai_logo/logo.png",
                "icon": "wizard/prov_ai_logo/icon.png",
            },
        },
    }
    tenant = _grant_paid_plan(_make_tenant("prov-ai-logo", answers))
    tenant = _provision(tenant)
    with tenant_context(tenant):
        from apps.tenant_config.models import TenantConfig

        config = TenantConfig.objects.first()
        assert config.logo_recipe.get("layout") == "name_only"
        assert config.logo is not None and config.logo.s3_key == "wizard/prov_ai_logo/logo.png"
        assert config.icon is not None and config.icon.s3_key == "wizard/prov_ai_logo/icon.png"
        assert config.navbar_config.get("show_brand_name") is False


def test_ai_logo_requires_paid_plan(cleanup):
    """Defense-in-depth: a hand-crafted wizard-state PATCH could set mode:"ai"
    with a valid recipe even without payment (validate_answers checks shape,
    not payment). No PlatformSubscription is created for this tenant, so
    has_paid_platform_plan is False (the default) — apply_wizard_logo must
    refuse the AI branch and degrade to the wordmark behavior (stores nothing).
    """
    cleanup.append("prov-ai-unpaid")
    answers = {
        **WIZARD_ANSWERS,
        "logo": {
            "mode": "ai",
            "curated_id": None,
            "recipe": AI_RECIPE,
            "export_keys": {
                "logo": "wizard/prov_ai_unpaid/logo.png",
                "icon": "wizard/prov_ai_unpaid/icon.png",
            },
        },
    }
    tenant = _provision(_make_tenant("prov-ai-unpaid", answers))
    assert tenant.has_paid_platform_plan is False
    with tenant_context(tenant):
        from apps.tenant_config.models import TenantConfig

        config = TenantConfig.objects.first()
        assert config.logo_recipe == {}
        assert config.logo is None
        assert config.icon is None
        assert config.logo_url == ""


def test_ai_logo_foreign_export_keys_ignored(cleanup):
    cleanup.append("prov-ai-evil")
    answers = {
        **WIZARD_ANSWERS,
        "logo": {
            "mode": "ai",
            "curated_id": None,
            "recipe": AI_RECIPE,
            "export_keys": {"logo": "wizard/someone_else/logo.png", "icon": "platform/x.png"},
        },
    }
    tenant = _grant_paid_plan(_make_tenant("prov-ai-evil", answers))
    tenant = _provision(tenant)
    with tenant_context(tenant):
        from apps.tenant_config.models import TenantConfig

        config = TenantConfig.objects.first()
        assert config.logo_recipe.get("layout") == "name_only"  # recipe still applies
        assert config.logo is None  # foreign keys refused
        assert config.icon is None
