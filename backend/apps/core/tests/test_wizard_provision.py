"""Integration: provision_tenant consumes wizard_state.

Heavy tests — each provisions a real tenant schema + runs the yoga seeder.
Kept to three cases; everything unit-testable lives in test_wizard_compose.
"""

import pytest
from django.db import connection
from django_tenants.utils import tenant_context

from apps.core.models import Tenant
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
    "page_layouts": {"home": "home-story", "about": "about-story", "courses": "courses-grid",
                     "pricing": "pricing-simple", "faq": "faq-list", "contact": "contact-form"},
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


@pytest.fixture()
def cleanup(restore_public):
    created = []
    yield created
    connection.set_schema_to_public()
    for slug in created:
        for t in Tenant.objects.filter(slug=slug):
            t.delete(force_drop=True)


def test_wizard_answers_override_niche_defaults(cleanup):
    cleanup.append("prov-wiz")
    tenant = _provision(_make_tenant("prov-wiz", WIZARD_ANSWERS))
    assert tenant.provisioning_status == "ready"
    assert tenant.template_seed_status == "ready"

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
        title="Lotus", prompt="a lotus", tags="yoga",
        image_key="platform/curated-logos/lotus.png", enabled=True,
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
