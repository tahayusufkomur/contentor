import pytest
from django.db import IntegrityError, transaction

from apps.accounts.models import User
from apps.mailbox.inbound import receive_inbound
from apps.mailbox.models import Conversation, Message

pytestmark = pytest.mark.django_db(transaction=True)


def test_receive_stores_inbound_and_links_student(tenant_ctx):
    student = User.objects.create_user(email="stu@x.com", name="Stu", password="secret123", role="student")
    msg = receive_inbound(
        from_email="stu@x.com",
        to_email="info@coach.com",
        subject="Question",
        text="hi coach",
        message_id="<m1@x.com>",
    )
    assert msg is not None
    assert msg.direction == "inbound"
    assert msg.is_read is False
    conv = msg.conversation
    assert conv.student_id == student.id
    assert conv.unread_count == 1
    assert conv.last_message_at is not None


def test_receive_is_idempotent_on_message_id(tenant_ctx):
    first = receive_inbound(
        from_email="p@x.com",
        to_email="info@coach.com",
        subject="Hi",
        text="one",
        message_id="<dup@x.com>",
    )
    second = receive_inbound(
        from_email="p@x.com",
        to_email="info@coach.com",
        subject="Hi",
        text="one again",
        message_id="<dup@x.com>",
    )
    assert first is not None
    assert second is None
    assert Message.objects.filter(message_id="<dup@x.com>").count() == 1
    assert Conversation.objects.get(counterparty_email="p@x.com").unread_count == 1


def test_receive_threads_into_existing_conversation(tenant_ctx):
    receive_inbound(
        from_email="p@x.com",
        to_email="info@coach.com",
        subject="Hi",
        text="one",
        message_id="<a@x.com>",
    )
    receive_inbound(
        from_email="p@x.com",
        to_email="info@coach.com",
        subject="Re: Hi",
        text="two",
        message_id="<b@x.com>",
    )
    conv = Conversation.objects.get(counterparty_email="p@x.com")
    assert conv.messages.count() == 2
    assert conv.unread_count == 2


def test_db_constraint_rejects_duplicate_message_id(tenant_ctx):
    """DB-level uniqueness: two rows with the same non-empty message_id must raise IntegrityError."""
    conv = receive_inbound(
        from_email="a@x.com",
        to_email="info@coach.com",
        subject="Test",
        text="first",
        message_id="<constrained@x.com>",
    ).conversation
    with pytest.raises(IntegrityError), transaction.atomic():
        Message.objects.create(
            conversation=conv,
            direction="inbound",
            from_email="a@x.com",
            to_email="info@coach.com",
            text="duplicate",
            message_id="<constrained@x.com>",
        )


def test_db_constraint_allows_multiple_empty_message_id(tenant_ctx):
    """Empty message_id is NOT constrained — multiple rows with '' are allowed."""
    conv = receive_inbound(
        from_email="b@x.com",
        to_email="info@coach.com",
        subject="No-ID",
        text="first",
        message_id="",
    ).conversation
    # Direct create of a second empty-message_id row must succeed.
    Message.objects.create(
        conversation=conv,
        direction="inbound",
        from_email="b@x.com",
        to_email="info@coach.com",
        text="second",
        message_id="",
    )
    assert Message.objects.filter(conversation=conv, message_id="").count() == 2
