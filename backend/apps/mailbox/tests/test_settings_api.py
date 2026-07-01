from unittest.mock import patch

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.domains.models import CustomDomain

pytestmark = pytest.mark.django_db(transaction=True)
HOST = "shared-test.localhost"


@pytest.fixture(autouse=True)
def _clean_domains():
    CustomDomain.objects.all().delete()
    yield
    CustomDomain.objects.all().delete()


@pytest.fixture()
def client(tenant_ctx):
    coach = User.objects.create_user(
        email="coach@x.com", name="Coach", password="secret123", role="owner", is_staff=True
    )
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=coach)
    return c


@override_settings(RESEND_FROM_EMAIL="no_reply@contentor.app")
def test_settings_get_without_domain(client, tenant_ctx):
    resp = client.get("/api/v1/mailbox/settings/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["has_custom_domain"] is False
    assert data["can_receive"] is False
    assert data["from_email"] == "no_reply@contentor.app"


def test_settings_put_requires_domain_to_enable(client, tenant_ctx):
    resp = client.put(
        "/api/v1/mailbox/settings/", {"local_part": "info", "enabled": True}, format="json"
    )
    assert resp.status_code == 400


def test_settings_put_rejects_bad_local_part(client, tenant_ctx):
    CustomDomain.objects.create(
        tenant=tenant_ctx, domain="coach.com", cost_minor=1, price_minor=1,
        currency="usd", provisioning_status="live",
    )
    resp = client.put(
        "/api/v1/mailbox/settings/", {"local_part": "bad address!", "enabled": True}, format="json"
    )
    assert resp.status_code == 400


@override_settings(CLOUDFLARE_EMAIL_WORKER_NAME="mailbox-inbound")
def test_settings_put_enables_and_rebinds_worker(client, tenant_ctx):
    CustomDomain.objects.create(
        tenant=tenant_ctx, domain="coach.com", cost_minor=1, price_minor=1,
        currency="usd", provisioning_status="live", cloudflare_zone_id="zone-1",
    )
    with patch("apps.mailbox.views.get_cloudflare") as mock_cf:
        resp = client.put(
            "/api/v1/mailbox/settings/", {"local_part": "support", "enabled": True}, format="json"
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["local_part"] == "support"
    assert data["enabled"] is True
    assert data["from_email"] == "support@coach.com"
    assert data["can_receive"] is True
    mock_cf.return_value.enable_email_routing.assert_called_once_with(
        zone_id="zone-1", worker_name="mailbox-inbound"
    )
    cd = CustomDomain.objects.get(domain="coach.com")
    assert cd.mailbox_local_part == "support"
    assert cd.mailbox_enabled is True
