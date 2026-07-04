from unittest.mock import patch

import pytest

from apps.accounts.models import User
from apps.mailbox.attachments import validate_attachment
from apps.mailbox.models import Conversation, Message, MessageAttachment

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="coach@x.com", name="Coach", password="x",  # noqa: S106
        role="owner", is_staff=True,
    )


@pytest.fixture()
def client(coach):
    from rest_framework.test import APIClient

    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=coach)
    return c


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


def test_validate_attachment_rules():
    assert validate_attachment("a.png", "image/png", 1000) is None
    assert validate_attachment("a.pdf", "application/pdf", 1000) is None
    assert validate_attachment("a.exe", "application/x-msdownload", 10) is not None
    assert validate_attachment("a.png", "image/png", 11 * 1024 * 1024) is not None


def test_upload_attachment_endpoint(client, tenant_ctx):
    from django.core.files.uploadedfile import SimpleUploadedFile

    f = SimpleUploadedFile("pic.png", b"\x89PNG fake", content_type="image/png")
    with patch("apps.mailbox.views.attachments_mod.store_attachment", return_value="k/pic.png") as store, \
         patch("apps.mailbox.serializers.generate_presigned_download_url", return_value="https://s3/x"):
        resp = client.post("/api/v1/mailbox/attachments/", {"file": f}, format="multipart")
    assert resp.status_code == 201, resp.content
    body = resp.json()
    assert body["filename"] == "pic.png"
    assert body["download_url"] == "https://s3/x"
    store.assert_called_once()


def test_upload_attachment_rejects_bad_type(client, tenant_ctx):
    from django.core.files.uploadedfile import SimpleUploadedFile

    f = SimpleUploadedFile("run.exe", b"MZ", content_type="application/x-msdownload")
    resp = client.post("/api/v1/mailbox/attachments/", {"file": f}, format="multipart")
    assert resp.status_code == 400
