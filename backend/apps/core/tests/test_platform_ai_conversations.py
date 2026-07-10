"""Superadmin conversation console: list/thread/takeover/message/release over
help_bot conversations (both audiences); student_bot rows are invisible.

Note: unlike the brief's literal snippet, requests go through APIClient(HTTP_HOST=SHARED_DOMAIN)
plus the shared `restore_public` fixture — this repo's tenant middleware 404s any request whose
Host doesn't resolve to a known Domain row (see every other apps/core/tests/test_platform_*.py)."""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AiConversation

SHARED_DOMAIN = "shared-test.localhost"
pytestmark = pytest.mark.django_db


@pytest.fixture
def superadmin_client(restore_public):
    admin = User.objects.create_superuser(email="root@x.com", name="Root", password="x")  # noqa: S106
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    client.force_authenticate(user=admin)
    return client


@pytest.fixture
def coach_convo(restore_public):
    return AiConversation.objects.create(feature="help_bot", audience="coach", tenant_schema="yoga", session_id="pc-1")


def test_requires_superuser(restore_public):
    user = User.objects.create_user(email="pleb@x.com", name="P", password="x", role="coach")  # noqa: S106
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    client.force_authenticate(user=user)
    assert client.get("/api/v1/platform/ai-conversations/").status_code == 403


def test_list_filters_and_hides_student_bot(superadmin_client, coach_convo):
    AiConversation.objects.create(
        feature="help_bot", audience="visitor", tenant_schema="__marketing__", session_id="pc-2"
    )
    AiConversation.objects.create(feature="student_bot", audience="student", tenant_schema="yoga", session_id="pc-3")
    body = superadmin_client.get("/api/v1/platform/ai-conversations/").json()
    assert {r["session_id"] for r in body["results"]} == {"pc-1", "pc-2"}
    only_marketing = superadmin_client.get("/api/v1/platform/ai-conversations/?audience=visitor").json()
    assert [r["tenant_schema"] for r in only_marketing["results"]] == ["__marketing__"]


def test_takeover_message_release_roundtrip(superadmin_client, coach_convo):
    res = superadmin_client.post(f"/api/v1/platform/ai-conversations/{coach_convo.id}/takeover/")
    assert res.status_code == 200 and res.json()["agent_label"] == "Contentor support"
    res = superadmin_client.post(
        f"/api/v1/platform/ai-conversations/{coach_convo.id}/message/", {"content": "hi!"}, format="json"
    )
    assert res.status_code == 200
    superadmin_client.post(f"/api/v1/platform/ai-conversations/{coach_convo.id}/release/")
    coach_convo.refresh_from_db()
    assert coach_convo.status == "ai"
    roles = list(coach_convo.messages.values_list("role", flat=True))
    assert roles == ["system", "agent", "system"]
