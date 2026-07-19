# backend/apps/logbook/tests/test_track.py
"""Pageview beacon: anonymous + authenticated attribution, throttle, validation.

Uses the activity_capture fixture from tests/conftest.py (caplog can't see
apps.logbook.* — propagate=False)."""

from __future__ import annotations

import json

import jwt as pyjwt
import pytest
from django.conf import settings
from django.test import override_settings
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

URL = "/api/v1/track/pageview/"
HOST = "shared-test.localhost"


def _emitted(capture):
    return [json.loads(m) for m in capture.messages]


def _post(client, body=None, **extra):
    data = body if body is not None else {"path": "/courses", "referrer": "/"}
    return client.post(URL, data=data, format="json", **extra)


def test_anonymous_pageview_accepted(activity_capture):
    client = APIClient(HTTP_HOST=HOST)
    resp = _post(client, HTTP_X_SESSION_ID="s-1", HTTP_CF_CONNECTING_IP="198.51.100.7")
    assert resp.status_code == 202
    (event,) = _emitted(activity_capture)
    assert event["kind"] == "pageview"
    assert event["path"] == "/courses"
    assert event["referrer"] == "/"
    assert event["session_id"] == "s-1"
    assert event["ip"] == "198.51.100.7"
    assert event["user"] == ""


def test_authenticated_pageview_labels_user(activity_capture, tenant_ctx):
    from apps.accounts.models import User

    # apps.accounts is dual-listed (SHARED_APPS + TENANT_APPS): accounts_user
    # is a separate physical table per schema. The real APIClient request below
    # resolves Host shared-test.localhost to the shared_test tenant, so the
    # user row (and the JWT's tenant_id claim) must live/match there — not
    # "public" — for TenantJWTAuthentication's same-schema User lookup to find
    # it. tenant_ctx (conftest.py) creates it inside that tenant's schema.
    user = User.objects.create(email="pv@test.io", region="global", role="owner")
    token = pyjwt.encode(
        {"user_id": user.id, "tenant_id": tenant_ctx.schema_name, "role": "owner"},
        settings.SECRET_KEY,
        algorithm="HS256",
    )
    client = APIClient(HTTP_HOST=HOST)
    client.cookies["contentor_access_token"] = token
    assert _post(client).status_code == 202
    (event,) = _emitted(activity_capture)
    assert event["user"] == "pv@test.io"


def test_invalid_path_rejected():
    client = APIClient(HTTP_HOST=HOST)
    assert _post(client, body={"path": "not-a-path"}).status_code == 400
    assert _post(client, body={}).status_code == 400


@override_settings(LOGBOOK_PAGEVIEW_RATE="3/min")
def test_throttle_kicks_in():
    client = APIClient(HTTP_HOST=HOST)
    codes = [_post(client, HTTP_CF_CONNECTING_IP="203.0.113.99").status_code for _ in range(4)]
    assert codes[:3] == [202, 202, 202]
    assert codes[3] == 429
