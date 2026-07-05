from unittest.mock import patch

import pytest
from django.test import override_settings

from apps.accounts.models import User
from apps.mailbox import services
from apps.mailbox.models import Conversation, Message

pytestmark = pytest.mark.django_db(transaction=True)


def test_get_or_create_links_student_by_email(tenant_ctx):
    student = User.objects.create_user(
        email="stu@x.com",
        name="Stu",
        password="secret123",
        role="student",  # noqa: S106
    )
    conv = services.get_or_create_conversation(counterparty_email="STU@x.com", subject="Hi")
    assert conv.student_id == student.id
    assert conv.counterparty_email == "stu@x.com"


def test_get_or_create_reuses_open_conversation(tenant_ctx):
    a = services.get_or_create_conversation(counterparty_email="p@x.com")
    b = services.get_or_create_conversation(counterparty_email="p@x.com")
    assert a.id == b.id
    assert Conversation.objects.count() == 1


@override_settings(RESEND_FROM_EMAIL="no_reply@contentor.app", RESEND_API_KEY="re_test")
def test_send_message_sends_and_stores_outbound(tenant_ctx):
    conv = services.get_or_create_conversation(counterparty_email="p@x.com", subject="Hi")
    with patch.object(services, "send_email", return_value=True) as mock:
        msg = services.send_message(conversation=conv, text="Hello there", subject="Hi")
    assert mock.called
    assert mock.call_args.kwargs["from_email"] == "no_reply@contentor.app"
    assert msg.direction == "outbound"
    assert msg.to_email == "p@x.com"
    assert msg.message_id.startswith("<") and msg.message_id.endswith(">")
    conv.refresh_from_db()
    assert conv.last_message_at is not None


@override_settings(RESEND_FROM_EMAIL="no_reply@contentor.app", RESEND_API_KEY="re_test")
def test_reply_sets_in_reply_to_previous_message(tenant_ctx):
    conv = services.get_or_create_conversation(counterparty_email="p@x.com")
    Message.objects.create(
        conversation=conv,
        direction="inbound",
        from_email="p@x.com",
        to_email="no_reply@contentor.app",
        text="first",
        message_id="<abc@x.com>",
    )
    with patch.object(services, "send_email", return_value=True):
        reply = services.send_message(conversation=conv, text="reply body")
    assert reply.in_reply_to == "<abc@x.com>"
    assert "<abc@x.com>" in reply.references


@override_settings(RESEND_FROM_EMAIL="no_reply@contentor.app", RESEND_API_KEY="re_test")
def test_send_message_raises_when_provider_fails(tenant_ctx):
    conv = services.get_or_create_conversation(counterparty_email="p@x.com")
    with patch.object(services, "send_email", return_value=False), pytest.raises(RuntimeError):
        services.send_message(conversation=conv, text="x")


@override_settings(RESEND_FROM_EMAIL="no_reply@contentor.app", RESEND_API_KEY="re_test")
def test_send_message_escapes_xss_in_text(tenant_ctx):
    conv = services.get_or_create_conversation(counterparty_email="p@x.com")
    with patch.object(services, "send_email", return_value=True):
        msg = services.send_message(conversation=conv, text="<script>alert(1)</script>")
    assert "&lt;script&gt;" in msg.html
    assert "<script>" not in msg.html
