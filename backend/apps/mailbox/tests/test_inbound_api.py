import json

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.domains.models import CustomDomain
from apps.mailbox import signing
from apps.mailbox.models import Conversation, Message

pytestmark = pytest.mark.django_db(transaction=True)

SECRET = "topsecret"
HOST = "shared-test.localhost"


@pytest.fixture(autouse=True)
def _clean_custom_domains():
    # CustomDomain is a SHARED (public-schema) model and is NOT cleaned by the
    # tenant_ctx teardown, so committed rows would leak across tests (domain is
    # unique). Clean before and after each test in this module.
    CustomDomain.objects.all().delete()
    yield
    CustomDomain.objects.all().delete()


def _post(body: dict, *, sign=True):
    raw = json.dumps(body).encode()
    headers = {"HTTP_HOST": HOST}
    if sign:
        headers["HTTP_X_MAILBOX_SIGNATURE"] = signing.sign_payload(raw, SECRET)
    return APIClient().post(
        "/api/v1/mailbox/inbound/", data=raw,
        content_type="application/json", **headers,
    )


@override_settings(MAILBOX_INBOUND_SECRET=SECRET)
def test_inbound_rejects_bad_signature(tenant_ctx):
    resp = APIClient().post(
        "/api/v1/mailbox/inbound/", data=b"{}", content_type="application/json",
        HTTP_HOST=HOST, HTTP_X_MAILBOX_SIGNATURE="deadbeef",
    )
    assert resp.status_code == 401


@override_settings(MAILBOX_INBOUND_SECRET=SECRET)
def test_inbound_unknown_domain_drops_with_200(tenant_ctx):
    resp = _post({"from": "p@x.com", "to": "info@nope.com", "subject": "Hi", "text": "yo",
                  "message_id": "<u@x.com>"})
    assert resp.status_code == 200
    assert Message.objects.count() == 0


@override_settings(MAILBOX_INBOUND_SECRET=SECRET)
def test_inbound_stores_for_live_enabled_domain(tenant_ctx):
    CustomDomain.objects.create(
        tenant=tenant_ctx, domain="coach.com",
        cost_minor=1, price_minor=1, currency="usd",
        provisioning_status="live", mailbox_enabled=True,
    )
    resp = _post({"from": "p@x.com", "to": "info@coach.com", "subject": "Hi",
                  "text": "hello", "message_id": "<m@x.com>"})
    assert resp.status_code == 200
    conv = Conversation.objects.get(counterparty_email="p@x.com")
    assert conv.messages.filter(direction="inbound").count() == 1
    assert conv.unread_count == 1


@override_settings(MAILBOX_INBOUND_SECRET=SECRET)
def test_inbound_duplicate_message_id_is_200_no_store(tenant_ctx):
    CustomDomain.objects.create(
        tenant=tenant_ctx, domain="coach.com",
        cost_minor=1, price_minor=1, currency="usd",
        provisioning_status="live", mailbox_enabled=True,
    )
    body = {"from": "p@x.com", "to": "info@coach.com", "subject": "Hi",
            "text": "hello", "message_id": "<dup@x.com>"}
    assert _post(body).status_code == 200
    assert _post(body).status_code == 200
    assert Message.objects.filter(message_id="<dup@x.com>").count() == 1
