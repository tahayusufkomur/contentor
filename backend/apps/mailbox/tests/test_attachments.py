import pytest

from apps.mailbox.models import Conversation, Message, MessageAttachment

pytestmark = pytest.mark.django_db(transaction=True)


def test_attachment_links_to_message(tenant_ctx):
    conv = Conversation.objects.create(counterparty_email="p@x.com")
    msg = Message.objects.create(
        conversation=conv, direction="outbound",
        from_email="c@x.com", to_email="p@x.com", text="hi",
    )
    att = MessageAttachment.objects.create(
        message=msg, filename="a.png", content_type="image/png",
        size=123, storage_key="tenants/t/mailbox/x/a.png",
    )
    assert list(msg.attachments.all()) == [att]
    assert att.omitted is False


def test_attachment_allows_null_message(tenant_ctx):
    att = MessageAttachment.objects.create(
        filename="b.pdf", content_type="application/pdf", size=1, storage_key="k",
    )
    assert att.message is None
