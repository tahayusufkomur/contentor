"""set_wizard_mockup_look: sets theme and/or home hero style on the
wizard-mockups scratch tenant, via the real compose pipeline."""

import pytest
from django.core.management import CommandError, call_command
from django.db import connection

from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def mockup_tenant(tenant_ctx, settings):
    """Points WIZARD_MOCKUP_TENANT_SCHEMA at the already-migrated shared test
    schema instead of creating a new one — same trade-off as
    test_set_wizard_mockup_layout.py (schema creation is the most expensive
    operation in the suite)."""
    settings.WIZARD_MOCKUP_TENANT_SCHEMA = connection.schema_name
    TenantConfig.objects.get_or_create(
        defaults={"brand_name": "Mockup Test", "landing_sections": {}, "pages": {}},
    )
    return connection.schema_name


def test_sets_theme(mockup_tenant):
    call_command("set_wizard_mockup_look", theme="ember")
    assert TenantConfig.objects.first().theme == "ember"


def test_sets_hero_rebuilds_home_as_spotlight(mockup_tenant):
    call_command("set_wizard_mockup_look", hero="split")
    config = TenantConfig.objects.first()
    blocks = config.pages["home"]["blocks"]
    assert [b["type"] for b in blocks] == ["hero", "courseGrid", "testimonials", "cta"]
    assert blocks[0]["layout"] == "split"


def test_requires_at_least_one_option(mockup_tenant):
    with pytest.raises(CommandError, match="--theme and/or --hero"):
        call_command("set_wizard_mockup_look")


def test_unknown_theme_errors(mockup_tenant):
    with pytest.raises(CommandError, match="Unknown theme"):
        call_command("set_wizard_mockup_look", theme="neon")


def test_unknown_hero_errors(mockup_tenant):
    with pytest.raises(CommandError, match="Unknown hero"):
        call_command("set_wizard_mockup_look", hero="jumbo")


def test_missing_tenant_errors(settings):
    settings.WIZARD_MOCKUP_TENANT_SCHEMA = "does_not_exist_schema"
    with pytest.raises(CommandError, match="not found"):
        call_command("set_wizard_mockup_look", theme="ember")
