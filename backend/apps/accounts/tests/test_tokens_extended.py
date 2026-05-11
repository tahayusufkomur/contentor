"""
Extended token tests.

Tests for:
  - create_signup_token / verify_signup_token round-trip
  - Signup token field validation
  - Rejection of wrong-purpose tokens
  - Rejection of expired tokens
  - create_jwt field validation and expiry check
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import Mock

import jwt
import pytest
from django.conf import settings

from apps.accounts.tokens import (
    create_jwt,
    create_magic_link_token,
    create_signup_token,
    verify_signup_token,
)


class TestSignupTokens:
    def test_create_and_verify_signup_token(self):
        """Round-trip: create then verify returns the original claims."""
        token = create_signup_token("coach@example.com", "Jane", "FitnessCo")
        payload = verify_signup_token(token)
        assert payload["email"] == "coach@example.com"
        assert payload["name"] == "Jane"
        assert payload["brand_name"] == "FitnessCo"
        assert payload["purpose"] == "signup"

    def test_signup_token_contains_expected_fields(self):
        """Token payload must include email, name, brand_name, purpose, exp, iat."""
        token = create_signup_token("a@b.com", "Alice", "BrandX")
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        for field in ("email", "name", "brand_name", "purpose", "exp", "iat"):
            assert field in payload, f"Missing field: {field}"
        assert payload["purpose"] == "signup"

    def test_verify_signup_token_rejects_wrong_purpose(self):
        """A magic-link token must not pass signup verification."""
        token = create_magic_link_token("user@test.com", "t_schema", "t_slug")
        with pytest.raises(jwt.InvalidTokenError):
            verify_signup_token(token)

    def test_verify_signup_token_rejects_expired(self):
        """An expired signup token must be rejected."""
        payload = {
            "email": "expired@test.com",
            "name": "Old",
            "brand_name": "Gone",
            "purpose": "signup",
            "exp": datetime.now(tz=UTC) - timedelta(seconds=10),
            "iat": datetime.now(tz=UTC) - timedelta(minutes=20),
        }
        token = jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
        with pytest.raises(jwt.ExpiredSignatureError):
            verify_signup_token(token)


class TestCreateJWT:
    def _make_user_and_tenant(self, user_id=42, role="owner", schema="test_tenant", region="global"):
        user = Mock()
        user.id = user_id
        user.role = role
        user.region = region
        tenant = Mock()
        tenant.schema_name = schema
        tenant.region = region
        return user, tenant

    def test_create_jwt_contains_expected_fields(self):
        """JWT payload must include user_id, tenant_id, role, region, exp, iat."""
        user, tenant = self._make_user_and_tenant(region="global")
        token = create_jwt(user, tenant)
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        assert payload["user_id"] == 42
        assert payload["tenant_id"] == "test_tenant"
        assert payload["role"] == "owner"
        assert payload["region"] == "global"
        for field in ("exp", "iat"):
            assert field in payload, f"Missing field: {field}"

    def test_create_jwt_expiry_is_7_days(self):
        """Token expiry (exp - iat) should equal settings.JWT_EXPIRY_DAYS."""
        user, tenant = self._make_user_and_tenant()
        token = create_jwt(user, tenant)
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        delta = payload["exp"] - payload["iat"]
        expected_seconds = settings.JWT_EXPIRY_DAYS * 86400
        # Allow 5-second tolerance for clock drift during test
        assert abs(delta - expected_seconds) < 5
