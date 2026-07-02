import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.core.email import send_email
from apps.core.models import DevOutboundEmail

# Use the shared-test domain seeded by conftest so tenant middleware resolves OK.
# DevOutboundEmail is a SHARED model (apps.core); django-tenants exposes it via
# the public search_path even from tenant schema context.
_HOST = "shared-test.localhost"


@pytest.mark.django_db
@override_settings(EMAIL_SINK_ENABLED=True, RESEND_API_KEY="")
def test_send_email_stores_instead_of_sending(shared_tenant):
    assert send_email("s@example.com", "Hi", "<b>hello</b>") is True
    row = DevOutboundEmail.objects.get()
    assert (row.to, row.subject) == ("s@example.com", "Hi")


@pytest.mark.django_db
@override_settings(EMAIL_SINK_ENABLED=True, RESEND_API_KEY="")
def test_latest_endpoint_returns_newest_for_recipient(shared_tenant):
    send_email("a@example.com", "first", "1")
    send_email("a@example.com", "second", "2")
    res = APIClient(HTTP_HOST=_HOST).get("/api/v1/dev/emails/latest/", {"to": "a@example.com"})
    assert res.status_code == 200
    assert res.data["subject"] == "second"


@pytest.mark.django_db
@override_settings(EMAIL_SINK_ENABLED=True, RESEND_API_KEY="")
def test_latest_endpoint_404_when_none(shared_tenant):
    res = APIClient(HTTP_HOST=_HOST).get("/api/v1/dev/emails/latest/", {"to": "x@example.com"})
    assert res.status_code == 404


@pytest.mark.django_db
@override_settings(EMAIL_SINK_ENABLED=False)
def test_dev_endpoint_disabled_without_sink(shared_tenant):
    res = APIClient(HTTP_HOST=_HOST).get("/api/v1/dev/emails/latest/", {"to": "a@example.com"})
    assert res.status_code == 404
