from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.courses.models import Course
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="coach@x.com", name="Coach", password="x",  # noqa: S106
        role="owner", is_staff=True,
    )


@pytest.fixture()
def client(coach):
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=coach)
    return c


@pytest.fixture()
def config(tenant_ctx):
    return TenantConfig.objects.get_or_create(brand_name="T")[0]


def test_setup_status_booleans(client, coach, config):
    with patch("apps.tenant_config.views.can_monetize", return_value=False):
        body = client.get("/api/v1/admin/setup-status/").json()
    assert body == {
        "site_customized": config.onboarding_completed,
        "has_content": False,
        "payments_ready": False,
        "published": False,
        "dismissed": False,
    }
    Course.objects.create(title="C", slug="c-setup-test", instructor=coach)
    with patch("apps.tenant_config.views.can_monetize", return_value=True):
        body = client.get("/api/v1/admin/setup-status/").json()
    assert body["has_content"] is True
    assert body["payments_ready"] is True


def test_setup_status_dismiss(client, config):
    with patch("apps.tenant_config.views.can_monetize", return_value=False):
        body = client.patch(
            "/api/v1/admin/setup-status/", {"dismissed": True}, format="json"
        ).json()
    assert body["dismissed"] is True
    config.refresh_from_db()
    assert config.setup_guide_dismissed is True
