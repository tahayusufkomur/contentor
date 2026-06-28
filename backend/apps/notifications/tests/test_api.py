"""
API tests for push notification subscription endpoints.

Tests:
  - GET  /api/v1/notifications/vapid-key/   (public)
  - POST /api/v1/notifications/subscribe/   (IsAuthenticated)
  - POST /api/v1/notifications/unsubscribe/ (IsAuthenticated)

Mirrors billing/tests/test_payments.py tenant fixture style.
"""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.notifications.models import PushSubscription

pytestmark = pytest.mark.django_db(transaction=True)

SHARED_DOMAIN = "shared-test.localhost"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(
        email="student@apitest.com",
        name="Student",
        password="secret123",
        role="student",
    )


def make_client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


# ---------------------------------------------------------------------------
# vapid-key (public endpoint)
# ---------------------------------------------------------------------------


def test_vapid_key_is_public(settings, tenant_ctx):
    """Unauthenticated request must succeed and return the configured public key."""
    settings.VAPID_PUBLIC_KEY = "TEST_KEY"
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    res = client.get("/api/v1/notifications/vapid-key/")
    assert res.status_code == 200
    assert res.json()["public_key"] == "TEST_KEY"


# ---------------------------------------------------------------------------
# subscribe
# ---------------------------------------------------------------------------


def test_subscribe_returns_201(student):
    client = make_client(user=student)
    body = {"endpoint": "https://fcm.example.com/push/1", "keys": {"p256dh": "p", "auth": "a"}}
    res = client.post("/api/v1/notifications/subscribe/", body, format="json")
    assert res.status_code == 201


def test_subscribe_upserts_idempotent(student):
    """Posting the same endpoint twice keeps one row AND refreshes its keys."""
    client = make_client(user=student)
    endpoint = "https://fcm.example.com/push/9"
    client.post(
        "/api/v1/notifications/subscribe/",
        {"endpoint": endpoint, "keys": {"p256dh": "p", "auth": "a"}},
        format="json",
    )
    client.post(
        "/api/v1/notifications/subscribe/",
        {"endpoint": endpoint, "keys": {"p256dh": "p2", "auth": "a2"}},
        format="json",
    )
    rows = PushSubscription.objects.filter(endpoint=endpoint)
    assert rows.count() == 1
    row = rows.get()
    assert (row.p256dh, row.auth) == ("p2", "a2")


def test_subscribe_requires_auth(tenant_ctx):
    client = make_client()  # unauthenticated
    body = {"endpoint": "https://fcm.example.com/push/2", "keys": {"p256dh": "p", "auth": "a"}}
    res = client.post("/api/v1/notifications/subscribe/", body, format="json")
    assert res.status_code in (401, 403)


# ---------------------------------------------------------------------------
# unsubscribe
# ---------------------------------------------------------------------------


def test_unsubscribe_returns_204(student):
    PushSubscription.objects.create(user=student, endpoint="https://fcm.example.com/push/3", p256dh="p", auth="a")
    client = make_client(user=student)
    res = client.post(
        "/api/v1/notifications/unsubscribe/",
        {"endpoint": "https://fcm.example.com/push/3"},
        format="json",
    )
    assert res.status_code == 204
    assert not PushSubscription.objects.filter(endpoint="https://fcm.example.com/push/3").exists()


def test_unsubscribe_requires_auth(tenant_ctx):
    client = make_client()
    res = client.post(
        "/api/v1/notifications/unsubscribe/",
        {"endpoint": "https://fcm.example.com/push/4"},
        format="json",
    )
    assert res.status_code in (401, 403)
