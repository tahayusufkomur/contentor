"""AdminJWTBackend hardening (audit P1-B).

The Django-admin auto-login backend must validate the same tenant/region claims
as TenantJWTAuthentication, only accept a real session token (no `purpose`), and
never 500 on a token that lacks `user_id`.
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import jwt
import pytest
from django.conf import settings
from django.test import RequestFactory

from apps.accounts.backends import AdminJWTBackend
from apps.accounts.models import User

SHARED_DOMAIN = "shared-test.localhost"


def _token(**claims):
    now = datetime.now(tz=UTC)
    payload = {"iat": now, "exp": now + timedelta(days=1), **claims}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def _request(token):
    rf = RequestFactory()
    request = rf.get("/django-admin/login/", HTTP_HOST=SHARED_DOMAIN)
    request.COOKIES = {"contentor_access_token": token} if token else {}
    return request


def _authenticate(request, schema="shared_test"):
    with patch("apps.accounts.backends.connection") as mock_conn:
        mock_conn.tenant.schema_name = schema
        return AdminJWTBackend().authenticate(request)


@pytest.mark.django_db(transaction=True)
class TestAdminJWTBackend:
    def _staff(self):
        return User.objects.create_user(
            email="staff@admin.test",
            name="Staff",
            password="secret123",
            role="owner",
            is_staff=True,  # noqa: S106  # pragma: allowlist secret
        )

    def test_valid_session_token_for_current_schema_authenticates(self, tenant_ctx):
        user = self._staff()
        token = _token(user_id=user.id, tenant_id="shared_test", role="owner")
        assert _authenticate(_request(token)) == user

    def test_token_for_other_schema_is_rejected(self, tenant_ctx):
        """A staff user_id valid in another schema must not authenticate here."""
        user = self._staff()
        token = _token(user_id=user.id, tenant_id="some_other_tenant", role="owner")
        assert _authenticate(_request(token)) is None

    def test_purpose_token_is_rejected(self, tenant_ctx):
        """Magic-link/impersonation/etc. tokens carry a `purpose` and must not log in."""
        user = self._staff()
        token = _token(user_id=user.id, tenant_id="shared_test", purpose="magic_link")
        assert _authenticate(_request(token)) is None

    def test_token_without_user_id_does_not_500(self, tenant_ctx):
        """A signature-valid token lacking user_id returns None, not a KeyError."""
        token = _token(tenant_id="shared_test", email="x@y.z", purpose=None)
        # purpose explicitly None but no user_id -> rejected cleanly.
        assert _authenticate(_request(token)) is None

    def test_cross_region_token_is_rejected(self, tenant_ctx):
        user = self._staff()
        token = _token(user_id=user.id, tenant_id="shared_test", role="owner", region="tr")
        rf = RequestFactory()
        request = rf.get("/django-admin/login/", HTTP_HOST=SHARED_DOMAIN)
        request.COOKIES = {"contentor_access_token": token}
        request.region = "global"
        assert _authenticate(request) is None

    def test_non_staff_user_is_rejected(self, tenant_ctx):
        student = User.objects.create_user(
            email="stu@admin.test",
            name="Stu",
            password="secret123",
            role="student",  # noqa: S106  # pragma: allowlist secret
        )
        token = _token(user_id=student.id, tenant_id="shared_test", role="student")
        assert _authenticate(_request(token)) is None
