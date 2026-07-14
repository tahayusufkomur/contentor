"""set_wizard_mockup_layout: rewrites one page's blocks on the wizard-mockups
scratch tenant to a specific wizard layout, via the real compose pipeline."""

import pytest
from django.core.management import CommandError, call_command
from django.db import connection

from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def mockup_tenant(tenant_ctx, settings):
    """Points WIZARD_MOCKUP_TENANT_SCHEMA at the already-migrated shared test
    schema instead of creating a new one — schema creation is the most
    expensive operation in the suite (see conftest.py), and this command
    only needs a Tenant + TenantConfig to exist under that schema name, not
    a from-scratch seeded tenant."""
    settings.WIZARD_MOCKUP_TENANT_SCHEMA = connection.schema_name
    TenantConfig.objects.get_or_create(
        defaults={"brand_name": "Mockup Test", "landing_sections": {}, "pages": {}},
    )
    return connection.schema_name


def test_sets_home_story_blocks(mockup_tenant):
    call_command("set_wizard_mockup_layout", "home", "home-story")
    config = TenantConfig.objects.first()
    types = [b["type"] for b in config.pages["home"]["blocks"]]
    assert types == ["hero", "imageText", "courseGrid", "faq", "cta"]


def test_sets_home_spotlight_blocks(mockup_tenant):
    call_command("set_wizard_mockup_layout", "home", "home-spotlight")
    config = TenantConfig.objects.first()
    types = [b["type"] for b in config.pages["home"]["blocks"]]
    assert types == ["hero", "courseGrid", "testimonials", "cta"]


def test_does_not_touch_other_pages(mockup_tenant):
    call_command("set_wizard_mockup_layout", "home", "home-story")
    config = TenantConfig.objects.first()
    config.pages["about"] = {"blocks": [{"id": "sentinel", "type": "richText", "enabled": True}]}
    config.save(update_fields=["pages"])

    call_command("set_wizard_mockup_layout", "home", "home-spotlight")
    config.refresh_from_db()
    assert config.pages["about"]["blocks"][0]["id"] == "sentinel"


def test_unknown_page_errors(mockup_tenant):
    with pytest.raises(CommandError, match="Unknown page"):
        call_command("set_wizard_mockup_layout", "not-a-page", "whatever")


def test_unknown_layout_errors(mockup_tenant):
    with pytest.raises(CommandError, match="Unknown layout"):
        call_command("set_wizard_mockup_layout", "home", "not-a-layout")


def test_missing_tenant_errors(settings):
    settings.WIZARD_MOCKUP_TENANT_SCHEMA = "does_not_exist_schema"
    with pytest.raises(CommandError, match="not found"):
        call_command("set_wizard_mockup_layout", "home", "home-story")
