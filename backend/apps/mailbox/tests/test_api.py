from unittest.mock import patch

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.mailbox.models import Conversation, Message

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="coach@x.com",
        name="Coach",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture()
def client(coach):
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=coach)
    return c


def test_list_conversations(client, tenant_ctx):
    Conversation.objects.create(counterparty_email="p@x.com", subject="Hi")
    resp = client.get("/api/v1/mailbox/conversations/")
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["counterparty_email"] == "p@x.com"


def test_thread_marks_read(client, tenant_ctx):
    conv = Conversation.objects.create(counterparty_email="p@x.com", unread_count=2)
    Message.objects.create(
        conversation=conv,
        direction="inbound",
        from_email="p@x.com",
        to_email="info@coach.com",
        text="hello",
        is_read=False,
    )
    resp = client.get(f"/api/v1/mailbox/conversations/{conv.id}/")
    assert resp.status_code == 200
    assert len(resp.json()["messages"]) == 1
    conv.refresh_from_db()
    assert conv.unread_count == 0
    assert conv.messages.first().is_read is True


@override_settings(RESEND_FROM_EMAIL="no_reply@contentor.app", RESEND_API_KEY="re_test")  # pragma: allowlist secret
def test_compose_creates_conversation_and_sends(client, tenant_ctx):
    with patch("apps.mailbox.services.send_email", return_value=True):
        resp = client.post(
            "/api/v1/mailbox/compose/",
            {"to": "new@x.com", "subject": "Hey", "text": "Body"},
            format="json",
        )
    assert resp.status_code == 201
    cid = resp.json()["conversation_id"]
    conv = Conversation.objects.get(id=cid)
    assert conv.counterparty_email == "new@x.com"
    assert conv.messages.filter(direction="outbound").count() == 1


@override_settings(RESEND_FROM_EMAIL="no_reply@contentor.app", RESEND_API_KEY="re_test")  # pragma: allowlist secret
def test_reply_sends_in_thread(client, tenant_ctx):
    conv = Conversation.objects.create(counterparty_email="p@x.com", subject="Hi")
    with patch("apps.mailbox.services.send_email", return_value=True):
        resp = client.post(
            f"/api/v1/mailbox/conversations/{conv.id}/reply/",
            {"text": "my reply"},
            format="json",
        )
    assert resp.status_code == 201
    assert conv.messages.filter(direction="outbound").count() == 1


def test_requires_auth(tenant_ctx):
    resp = APIClient(HTTP_HOST=HOST).get("/api/v1/mailbox/conversations/")
    assert resp.status_code in (401, 403)
