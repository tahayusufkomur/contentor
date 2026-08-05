"""CopilotSettings: platform-wide copilot knobs (singleton row), edited by
superadmin through adminkit at /api/v1/platform-admin/copilot-settings/.
The ask-cap is a conversation-behavior knob, not metering — see the
Phase 3 plan."""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import CopilotSettings

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db


def make_client(user=None, host=SHARED_DOMAIN):
    client = APIClient(HTTP_HOST=host)
    if user is not None:
        client.force_authenticate(user=user)
    return client


@pytest.fixture()
def superuser(restore_public):
    return User.objects.create(
        email="root-copilot-settings@contentor.app", region="global", role="owner", is_staff=True, is_superuser=True
    )


def test_load_returns_the_pk1_singleton():
    a = CopilotSettings.load()
    b = CopilotSettings.load()
    assert a.pk == b.pk == 1
    assert a.max_asks_per_conversation == 0  # default: uncapped


def test_superadmin_can_read_and_update_the_cap(superuser):
    CopilotSettings.load()  # ensure the row exists even under --no-migrations
    client = make_client(superuser)
    resp = client.get("/api/v1/platform-admin/copilot-settings/1/")
    assert resp.status_code == 200, resp.content
    resp = client.patch("/api/v1/platform-admin/copilot-settings/1/", {"max_asks_per_conversation": 3}, format="json")
    assert resp.status_code == 200, resp.content
    assert CopilotSettings.load().max_asks_per_conversation == 3


def test_create_and_delete_are_blocked(superuser):
    CopilotSettings.load()
    client = make_client(superuser)
    assert (
        client.post(
            "/api/v1/platform-admin/copilot-settings/", {"max_asks_per_conversation": 1}, format="json"
        ).status_code
        == 405
    )
    assert client.delete("/api/v1/platform-admin/copilot-settings/1/").status_code == 405


def test_non_superuser_is_rejected(restore_public):
    user = User.objects.create(email="coach-copilot-settings@contentor.app", region="global", role="coach")
    client = make_client(user)
    assert client.get("/api/v1/platform-admin/copilot-settings/").status_code in (403, 404)
