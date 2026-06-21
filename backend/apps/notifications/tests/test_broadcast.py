"""
Tests for POST /api/v1/admin/notifications/broadcast/ (owner/coach only).

Mirrors apps/notifications/tests/test_api.py tenant fixture style.
"""

from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User

pytestmark = pytest.mark.django_db(transaction=True)

SHARED_DOMAIN = "shared-test.localhost"


# ---------------------------------------------------------------------------
# Test A: student cannot broadcast
# ---------------------------------------------------------------------------


def test_student_cannot_broadcast(tenant_ctx):
    student = User.objects.create_user(
        email="student@broadcasttest.com",
        name="Student",
        password="secret123",
        role="student",
    )
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    client.force_authenticate(user=student)
    res = client.post(
        "/api/v1/admin/notifications/broadcast/",
        {"message": "hi"},
        format="json",
    )
    assert res.status_code == 403


# ---------------------------------------------------------------------------
# Test B: owner can broadcast
# ---------------------------------------------------------------------------


def test_owner_broadcast_succeeds(tenant_ctx):
    owner = User.objects.create_user(
        email="owner@broadcasttest.com",
        name="Owner",
        password="secret123",
        role="owner",
    )
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    client.force_authenticate(user=owner)
    with patch("apps.notifications.views.broadcast_to_tenant") as mock_broadcast:
        res = client.post(
            "/api/v1/admin/notifications/broadcast/",
            {"message": "Live Q&A Friday!"},
            format="json",
        )
    # 204 (not 202) — the app's empty-body success convention. clientFetch only
    # skips JSON parsing on 204 (by status) or Content-Length:0; behind a proxy
    # (Cloudflare) that drops Content-Length, a 202 empty body made res.json()
    # throw → a false "Could not send announcement" even though the task queued.
    assert res.status_code == 204
    mock_broadcast.assert_called_once()
    payload = mock_broadcast.call_args.args[0]
    assert payload["body"] == "Live Q&A Friday!"
    assert payload["tag"] == "broadcast"


# ---------------------------------------------------------------------------
# Test B2: coach can also broadcast (role gate allows owner AND coach)
# ---------------------------------------------------------------------------


def test_coach_can_broadcast(tenant_ctx):
    coach = User.objects.create_user(
        email="coach@broadcasttest.com",
        name="Coach",
        password="secret123",
        role="coach",
    )
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    client.force_authenticate(user=coach)
    with patch("apps.notifications.views.broadcast_to_tenant") as mock_broadcast:
        res = client.post(
            "/api/v1/admin/notifications/broadcast/",
            {"message": "Welcome!"},
            format="json",
        )
    assert res.status_code == 204
    mock_broadcast.assert_called_once()


# ---------------------------------------------------------------------------
# Test C: empty message → 400
# ---------------------------------------------------------------------------


def test_empty_message_returns_400(tenant_ctx):
    owner = User.objects.create_user(
        email="owner2@broadcasttest.com",
        name="Owner2",
        password="secret123",
        role="owner",
    )
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    client.force_authenticate(user=owner)
    res = client.post(
        "/api/v1/admin/notifications/broadcast/",
        {"message": "   "},
        format="json",
    )
    assert res.status_code == 400
