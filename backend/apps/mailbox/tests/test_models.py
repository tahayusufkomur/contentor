import pytest

from apps.accounts.models import User
from apps.mailbox.models import Conversation, Message

pytestmark = pytest.mark.django_db(transaction=True)


def test_message_links_to_conversation(tenant_ctx):
    student = User.objects.create_user(
        email="stu@x.com", name="Stu", password="secret123", role="student"
    )
    conv = Conversation.objects.create(
        counterparty_email="stu@x.com", counterparty_name="Stu", student=student
    )
    msg = Message.objects.create(
        conversation=conv, direction="inbound", from_email="stu@x.com",
        to_email="info@coach.com", text="hello",
    )
    assert conv.messages.count() == 1
    assert conv.messages.first() == msg
    assert conv.student_id == student.id


def test_conversation_ordering_newest_first(tenant_ctx):
    from django.utils import timezone

    old = Conversation.objects.create(
        counterparty_email="a@x.com", last_message_at=timezone.now() - timezone.timedelta(days=1)
    )
    new = Conversation.objects.create(
        counterparty_email="b@x.com", last_message_at=timezone.now()
    )
    assert list(Conversation.objects.all()) == [new, old]
