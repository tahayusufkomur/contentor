import jwt
import pytest
from django.conf import settings

from apps.accounts.tokens import create_magic_link_token, verify_magic_link_token


class TestMagicLinkTokens:
    def test_create_and_verify_token(self):
        token = create_magic_link_token("test@example.com", "test_schema", "test")
        payload = verify_magic_link_token(token)
        assert payload["email"] == "test@example.com"
        assert payload["tenant_id"] == "test_schema"
        assert payload["purpose"] == "magic_link"

    def test_invalid_token_rejected(self):
        with pytest.raises(jwt.InvalidTokenError):
            verify_magic_link_token("invalid.token.here")

    def test_wrong_purpose_rejected(self):
        payload = {
            "email": "test@example.com",
            "tenant_id": "test",
            "purpose": "wrong",
            "exp": 9999999999,
        }
        token = jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
        with pytest.raises(jwt.InvalidTokenError):
            verify_magic_link_token(token)
