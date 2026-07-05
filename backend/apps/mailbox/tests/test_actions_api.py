import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.mailbox.models import Conversation, Message

pytestmark = pytest.mark.django_db(transaction=True)
HOST = "shared-test.localhost"


@pytest.fixture()
def client(tenant_ctx):
    coach = User.objects.create_user(
        email="coach@x.com", name="Coach", password="secret123", role="owner", is_staff=True
    )
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=coach)
    return c


def test_message_html_is_sanitized(client, tenant_ctx):
    conv = Conversation.objects.create(counterparty_email="p@x.com")
    Message.objects.create(
        conversation=conv,
        direction="inbound",
        from_email="p@x.com",
        to_email="info@coach.com",
        html="<p>hi</p><script>alert(1)</script>",
    )
    resp = client.get(f"/api/v1/mailbox/conversations/{conv.id}/")
    assert resp.status_code == 200
    html = resp.json()["messages"][0]["html"]
    assert "<script>" not in html
    assert "<p>hi</p>" in html


def test_archive_conversation(client, tenant_ctx):
    conv = Conversation.objects.create(counterparty_email="p@x.com")
    resp = client.patch(f"/api/v1/mailbox/conversations/{conv.id}/", {"is_archived": True}, format="json")
    assert resp.status_code == 200
    conv.refresh_from_db()
    assert conv.is_archived is True


def test_mark_spam(client, tenant_ctx):
    conv = Conversation.objects.create(counterparty_email="p@x.com")
    resp = client.patch(f"/api/v1/mailbox/conversations/{conv.id}/", {"is_spam": True}, format="json")
    assert resp.status_code == 200
    conv.refresh_from_db()
    assert conv.is_spam is True


def test_delete_conversation(client, tenant_ctx):
    conv = Conversation.objects.create(counterparty_email="p@x.com")
    Message.objects.create(conversation=conv, direction="inbound", from_email="p@x.com", to_email="info@coach.com")
    resp = client.delete(f"/api/v1/mailbox/conversations/{conv.id}/")
    assert resp.status_code == 204
    assert Conversation.objects.filter(id=conv.id).count() == 0
    assert Message.objects.count() == 0


def test_action_on_missing_conversation_404(client, tenant_ctx):
    resp = client.patch("/api/v1/mailbox/conversations/99999/", {"is_archived": True}, format="json")
    assert resp.status_code == 404
