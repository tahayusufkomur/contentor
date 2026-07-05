"""Site contact form routes submissions into the coach's in-app mailbox
(decision 2026-07-03), falling back to the coach's personal email only if
mailbox storage raises.
"""

import pytest
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
        password="secret123",
        role="owner",  # noqa: S106
    )


def _submit(payload):
    return APIClient(HTTP_HOST=HOST).post("/api/v1/contact/", payload, format="json")


def test_contact_lands_in_mailbox(coach, tenant_ctx):
    resp = _submit({"name": "Student Sam", "email": "sam@x.com", "message": "When is class?"})
    assert resp.status_code == 200
    conv = Conversation.objects.get(counterparty_email="sam@x.com")
    msg = conv.messages.get(direction="inbound")
    assert "When is class?" in msg.text
    assert conv.unread_count == 1


def test_contact_includes_phone(coach, tenant_ctx):
    _submit({"name": "Sam", "email": "sam@x.com", "message": "Hi", "phone": "555-1234"})
    msg = Message.objects.get(direction="inbound")
    assert "555-1234" in msg.text


def test_contact_honeypot_stores_nothing(coach, tenant_ctx):
    resp = _submit({"name": "Bot", "email": "bot@x.com", "message": "spam", "website": "filled"})
    assert resp.status_code == 200
    assert Message.objects.count() == 0
