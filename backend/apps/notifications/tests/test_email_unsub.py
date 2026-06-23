import pytest
from rest_framework.test import APIRequestFactory

from apps.notifications import email_render
from apps.notifications.models import EmailOptOut
from apps.notifications.views import email_unsubscribe

pytestmark = pytest.mark.django_db(transaction=True)


def test_unsubscribe_creates_optout(tenant_ctx):
    token = email_render.unsubscribe_url(tenant_ctx, email="a@b.com").split("t=")[1]
    req = APIRequestFactory().get(f"/api/v1/notifications/email/unsubscribe/?t={token}")
    resp = email_unsubscribe(req)
    assert resp.status_code == 200
    assert EmailOptOut.objects.filter(email="a@b.com").exists()


def test_unsubscribe_bad_token():
    req = APIRequestFactory().get("/api/v1/notifications/email/unsubscribe/?t=garbage")
    resp = email_unsubscribe(req)
    assert resp.status_code == 400
