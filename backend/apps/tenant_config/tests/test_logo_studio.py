import pytest

from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)


def test_tenant_config_has_logo_studio_fields(tenant_ctx):
    config = TenantConfig.objects.create(brand_name="Test Brand")
    assert config.icon is None
    assert config.icon_url == ""
    assert config.logo_recipe == {}
