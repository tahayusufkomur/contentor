"""check-brand-name: pre-wizard step 1 availability check (no token minted,
no email sent — mirrors creator_signup's own slug-availability check)."""

import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db(transaction=True)

CHECK_URL = "/api/v1/onboarding/check-brand-name/"
SHARED_DOMAIN = "shared-test.localhost"


def _client(**extra):
    return APIClient(HTTP_HOST=SHARED_DOMAIN, **extra)


def test_available_brand_name_returns_true(restore_public):
    resp = _client().post(CHECK_URL, {"brand_name": "Totally Unique Studio Name"}, format="json")
    assert resp.status_code == 200
    assert resp.json() == {"available": True}


def test_taken_brand_name_returns_false(restore_public):
    # restore_public's shared tenant has slug "shared-test"; "Shared Test"
    # slugifies to exactly that.
    resp = _client().post(CHECK_URL, {"brand_name": "Shared Test"}, format="json")
    assert resp.status_code == 200
    data = resp.json()
    assert data["available"] is False
    assert data["detail"]  # localized brand_taken message, non-empty


def test_blank_brand_name_returns_400(restore_public):
    resp = _client().post(CHECK_URL, {"brand_name": "   "}, format="json")
    assert resp.status_code == 400


def test_missing_brand_name_returns_400(restore_public):
    resp = _client().post(CHECK_URL, {}, format="json")
    assert resp.status_code == 400


def test_check_brand_name_is_throttled(restore_public):
    # Mirrors test_signup_throttle.py's pattern exactly: use the real
    # configured rate (30/min) rather than overriding it — one call over
    # the limit within the same minute must 429.
    client = _client()
    statuses = [client.post(CHECK_URL, {"brand_name": f"Brand {i}"}, format="json").status_code for i in range(31)]
    assert statuses[:30] == [s for s in statuses[:30] if s != 429]
    assert 429 in statuses, f"expected a 429 within 31 rapid calls, got {statuses}"
