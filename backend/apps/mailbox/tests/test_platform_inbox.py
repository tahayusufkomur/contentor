import json
from contextlib import contextmanager
from unittest.mock import patch

import pytest
from django.db import connection
from django.test import override_settings
from django_tenants.utils import get_public_schema_name, schema_context
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import Domain, Tenant
from apps.mailbox import services, signing
from apps.mailbox.models import Conversation, Message

pytestmark = pytest.mark.django_db(transaction=True)

_SECRET = "topsecret"
_HOST = "shared-test.localhost"  # from the shared conftest tenant fixture
_PUBLIC_HOST = "public-inbox-test.localhost"


@contextmanager
def _no_schema_autocreate():
    original = Tenant.auto_create_schema
    Tenant.auto_create_schema = False
    try:
        yield
    finally:
        Tenant.auto_create_schema = original


@pytest.fixture()
def public_host(django_db_blocker):
    """A Domain pointing at the public schema so requests resolve to public."""
    with django_db_blocker.unblock():
        connection.set_schema_to_public()
        with _no_schema_autocreate():
            pub, _ = Tenant.objects.get_or_create(
                schema_name=get_public_schema_name(),
                defaults={"name": "Platform", "slug": "public", "subdomain": "public", "owner_email": ""},
            )
            Domain.objects.get_or_create(domain=_PUBLIC_HOST, defaults={"tenant": pub, "is_primary": False})
    yield _PUBLIC_HOST
    with django_db_blocker.unblock():
        Domain.objects.filter(domain=_PUBLIC_HOST).delete()


@pytest.fixture()
def superuser():
    return User.objects.create(
        email="root-inbox@contentor.app", region="global", role="owner", is_staff=True, is_superuser=True
    )


def _client(user=None, host=_PUBLIC_HOST):
    client = APIClient(HTTP_HOST=host)
    if user is not None:
        client.force_authenticate(user=user)
    return client


def _post_inbound(payload):
    raw = json.dumps(payload).encode()
    return APIClient().post(
        "/api/v1/mailbox/inbound/",
        data=raw,
        content_type="application/json",
        HTTP_HOST=_HOST,
        HTTP_X_MAILBOX_SIGNATURE=signing.sign_payload(raw, _SECRET),
    )


@pytest.fixture(autouse=True)
def _clean_public_conversations():
    # transaction=True commits rows for real — clean the public-schema table
    # before and after each test so counterparty_email uniqueness can't leak.
    with schema_context(get_public_schema_name()):
        Conversation.objects.all().delete()
    yield
    with schema_context(get_public_schema_name()):
        Conversation.objects.all().delete()


def test_conversation_table_exists_in_public_schema():
    # Dual-listing apps.mailbox in SHARED_APPS creates its tables in public.
    with schema_context(get_public_schema_name()):
        conv = Conversation.objects.create(counterparty_email="visitor@example.com")
        assert Conversation.objects.filter(pk=conv.pk).exists()


@override_settings(MAILBOX_INBOUND_SECRET=_SECRET, PLATFORM_MAIL_DOMAIN="contentor.app")
def test_unresolved_platform_domain_lands_in_public_inbox(tenant_ctx):
    resp = _post_inbound(
        {
            "from": "prospect@gmail.com",
            "to": "support@contentor.app",
            "subject": "Hi",
            "text": "hello",
            "message_id": "<p1@x>",
        }
    )
    assert resp.status_code == 200
    with schema_context(get_public_schema_name()):
        conv = Conversation.objects.get(counterparty_email="prospect@gmail.com")
        assert conv.messages.filter(direction="inbound", to_email="support@contentor.app").exists()


@override_settings(MAILBOX_INBOUND_SECRET=_SECRET, PLATFORM_MAIL_DOMAIN="contentor.app")
def test_foreign_domain_still_dropped(tenant_ctx):
    resp = _post_inbound(
        {
            "from": "x@y.com",
            "to": "hi@somewhere-else.com",
            "subject": "s",
            "text": "t",
            "message_id": "<p2@x>",
        }
    )
    assert resp.status_code == 200
    with schema_context(get_public_schema_name()):
        assert not Message.objects.filter(message_id="<p2@x>").exists()


@override_settings(PLATFORM_SUPPORT_FROM="support@contentor.app")
def test_send_from_public_schema_uses_platform_address():
    with schema_context(get_public_schema_name()):
        conv = Conversation.objects.create(counterparty_email="prospect@gmail.com")
        with patch.object(services, "send_email", return_value=True) as mock_send:
            services.send_message(conversation=conv, text="hi there")
    assert mock_send.call_args.kwargs["from_email"] == "support@contentor.app"


def test_superuser_lists_public_conversations(public_host, superuser):
    with schema_context(get_public_schema_name()):
        Conversation.objects.create(counterparty_email="prospect@gmail.com")
    resp = _client(superuser, host=public_host).get("/api/v1/platform/mailbox/conversations/")
    assert resp.status_code == 200
    assert any(c["counterparty_email"] == "prospect@gmail.com" for c in resp.json())


def test_non_superuser_forbidden(public_host):
    coach = User.objects.create(email="coach-inbox@x.com", role="coach", is_active=True)
    resp = _client(coach, host=public_host).get("/api/v1/platform/mailbox/conversations/")
    assert resp.status_code == 403


def test_anonymous_forbidden(public_host):
    resp = _client(host=public_host).get("/api/v1/platform/mailbox/conversations/")
    assert resp.status_code in (401, 403)
