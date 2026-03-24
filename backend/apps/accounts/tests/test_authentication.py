"""
TenantJWTAuthentication tests.

Tests for:
  - No token -> returns None
  - Cookie-based authentication
  - Bearer header authentication
  - Expired token -> returns None (anonymous)
  - Invalid token -> returns None (anonymous)
  - Wrong-tenant -> returns None (anonymous)
  - Missing-user -> returns None (anonymous)

Uses shared tenant fixtures from conftest.py.
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import jwt
import pytest
from django.conf import settings
from django.test import RequestFactory

from apps.accounts.authentication import TenantJWTAuthentication
from apps.accounts.models import User

SHARED_DOMAIN = "shared-test.localhost"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_client():
    return RequestFactory()


def _make_token(user_id, tenant_id, role="owner", expired=False):
    """Create a JWT for testing."""
    now = datetime.now(tz=UTC)
    payload = {
        "user_id": user_id,
        "tenant_id": tenant_id,
        "role": role,
        "iat": now,
        "exp": now - timedelta(seconds=10) if expired else now + timedelta(days=7),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestTenantJWTAuthentication:
    def test_returns_none_when_no_token(self):
        """No cookie and no Authorization header -> return None."""
        rf = make_client()
        request = rf.get("/", HTTP_HOST=SHARED_DOMAIN)
        request.COOKIES = {}
        auth = TenantJWTAuthentication()
        result = auth.authenticate(request)
        assert result is None

    def test_authenticates_from_cookie(self, tenant_ctx):
        """A valid JWT in the contentor_access_token cookie authenticates."""
        user = User.objects.create_user(
            email="cookie@authtest.com",
            name="Cookie User",
            password="secret123",
            role="owner",
        )
        token = _make_token(user.id, "shared_test")

        rf = make_client()
        request = rf.get("/", HTTP_HOST=SHARED_DOMAIN)
        request.COOKIES = {"contentor_access_token": token}

        auth = TenantJWTAuthentication()
        with patch("apps.accounts.authentication.connection") as mock_conn:
            mock_conn.tenant.schema_name = "shared_test"
            result = auth.authenticate(request)

        assert result is not None
        returned_user, returned_payload = result
        assert returned_user.id == user.id
        assert returned_payload["tenant_id"] == "shared_test"

    def test_authenticates_from_bearer_header(self, tenant_ctx):
        """A valid JWT in the Authorization: Bearer header authenticates."""
        user = User.objects.create_user(
            email="bearer@authtest.com",
            name="Bearer User",
            password="secret123",
            role="owner",
        )
        token = _make_token(user.id, "shared_test")

        rf = make_client()
        request = rf.get(
            "/",
            HTTP_HOST=SHARED_DOMAIN,
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
        request.COOKIES = {}

        auth = TenantJWTAuthentication()
        with patch("apps.accounts.authentication.connection") as mock_conn:
            mock_conn.tenant.schema_name = "shared_test"
            result = auth.authenticate(request)

        assert result is not None
        returned_user, _ = result
        assert returned_user.id == user.id

    def test_returns_none_on_expired_token(self):
        """An expired JWT returns None (anonymous) instead of raising."""
        token = _make_token(user_id=1, tenant_id="shared_test", expired=True)

        rf = make_client()
        request = rf.get("/", HTTP_HOST=SHARED_DOMAIN)
        request.COOKIES = {"contentor_access_token": token}

        auth = TenantJWTAuthentication()
        assert auth.authenticate(request) is None

    def test_returns_none_on_invalid_token(self):
        """A garbled token returns None (anonymous) instead of raising."""
        rf = make_client()
        request = rf.get("/", HTTP_HOST=SHARED_DOMAIN)
        request.COOKIES = {"contentor_access_token": "not.a.valid.jwt"}

        auth = TenantJWTAuthentication()
        assert auth.authenticate(request) is None

    def test_returns_none_on_wrong_tenant(self, tenant_ctx):
        """A token for a different tenant returns None (anonymous)."""
        user = User.objects.create_user(
            email="wrong@authtest.com",
            name="Wrong Tenant",
            password="secret123",
            role="owner",
        )
        token = _make_token(user.id, "some_other_tenant")

        rf = make_client()
        request = rf.get("/", HTTP_HOST=SHARED_DOMAIN)
        request.COOKIES = {"contentor_access_token": token}

        auth = TenantJWTAuthentication()
        with patch("apps.accounts.authentication.connection") as mock_conn:
            mock_conn.tenant.schema_name = "shared_test"
            assert auth.authenticate(request) is None

    def test_returns_none_on_missing_user(self, tenant_ctx):
        """A valid token pointing to a non-existent user returns None (anonymous)."""
        token = _make_token(user_id=99999, tenant_id="shared_test")

        rf = make_client()
        request = rf.get("/", HTTP_HOST=SHARED_DOMAIN)
        request.COOKIES = {"contentor_access_token": token}

        auth = TenantJWTAuthentication()
        with patch("apps.accounts.authentication.connection") as mock_conn:
            mock_conn.tenant.schema_name = "shared_test"
            assert auth.authenticate(request) is None
