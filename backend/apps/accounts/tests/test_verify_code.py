"""
Tests for POST /api/v1/auth/magic-link/verify-code/

Success+cookie, wrong code, lockout-then-right-code, reuse-after-success,
unknown email.  Follows the request/host pattern of test_views.py.
"""

import pytest
from rest_framework.test import APIClient

from apps.accounts import login_code
from apps.accounts.models import User

SHARED_DOMAIN = "shared-test.localhost"
URL = "/api/v1/auth/magic-link/verify-code/"


def make_client():
    return APIClient(HTTP_HOST=SHARED_DOMAIN)


@pytest.mark.django_db(transaction=True)
class TestVerifyCode:
    def test_success_creates_user_and_sets_cookie(self, tenant_ctx):
        """Valid code returns 200 with user payload and sets the session cookie."""
        tenant = tenant_ctx
        code = login_code.issue(tenant.schema_name, "newstudent@example.com")
        client = make_client()
        res = client.post(URL, {"email": "newstudent@example.com", "code": code}, format="json")
        assert res.status_code == 200, res.content
        data = res.json()
        assert "user" in data
        assert data["user"]["email"] == "newstudent@example.com"
        assert data["user"]["role"] == "student"
        assert "contentor_access_token" in res.cookies
        # User was created in the tenant schema
        assert User.objects.filter(email="newstudent@example.com", role="student").exists()

    def test_wrong_code_returns_400(self, tenant_ctx):
        """An incorrect code returns 400 with the generic error detail."""
        tenant = tenant_ctx
        login_code.issue(tenant.schema_name, "user@example.com")
        client = make_client()
        res = client.post(URL, {"email": "user@example.com", "code": "000000"}, format="json")
        assert res.status_code == 400, res.content
        detail = res.json().get("detail")
        assert detail, "detail must be non-empty"

    def test_right_code_after_five_wrong_returns_400(self, tenant_ctx):
        """After 5 failed attempts, the correct code is also rejected (lockout)."""
        tenant = tenant_ctx
        code = login_code.issue(tenant.schema_name, "locked@example.com")
        client = make_client()
        for _ in range(5):
            client.post(URL, {"email": "locked@example.com", "code": "000000"}, format="json")
        # Now the right code must fail too
        res = client.post(URL, {"email": "locked@example.com", "code": code}, format="json")
        assert res.status_code == 400, res.content
        detail = res.json().get("detail")
        assert detail, "detail must be non-empty"

    def test_reuse_after_success_returns_400(self, tenant_ctx):
        """A code that was already consumed cannot be reused."""
        tenant = tenant_ctx
        code = login_code.issue(tenant.schema_name, "reuse@example.com")
        client = make_client()
        res1 = client.post(URL, {"email": "reuse@example.com", "code": code}, format="json")
        assert res1.status_code == 200, res1.content
        # Second attempt with the same code
        res2 = client.post(URL, {"email": "reuse@example.com", "code": code}, format="json")
        assert res2.status_code == 400, res2.content
        detail = res2.json().get("detail")
        assert detail, "detail must be non-empty"

    def test_unknown_email_returns_400(self, tenant_ctx):
        """An email that was never issued a code returns 400 (same generic message)."""
        client = make_client()
        res = client.post(URL, {"email": "ghost@example.com", "code": "123456"}, format="json")
        assert res.status_code == 400, res.content
        detail = res.json().get("detail")
        assert detail, "detail must be non-empty"

    def test_failure_responses_use_same_detail_message(self, tenant_ctx):
        """All failure scenarios should return the same generic detail message (no oracle variance)."""
        tenant = tenant_ctx
        code = login_code.issue(tenant.schema_name, "vary@example.com")
        client = make_client()

        # Wrong code
        res_wrong = client.post(URL, {"email": "vary@example.com", "code": "000000"}, format="json")
        detail_wrong = res_wrong.json().get("detail")

        # Lockout (5 wrong attempts + right code on same email/code)
        code_lockout = login_code.issue(tenant.schema_name, "lockout@example.com")
        for _ in range(5):
            client.post(URL, {"email": "lockout@example.com", "code": "000000"}, format="json")
        res_lockout = client.post(URL, {"email": "lockout@example.com", "code": code_lockout}, format="json")
        detail_lockout = res_lockout.json().get("detail")

        # Unknown email
        res_unknown = client.post(URL, {"email": "never-seen@example.com", "code": "999999"}, format="json")
        detail_unknown = res_unknown.json().get("detail")

        # All three should be identical (no oracle variance)
        assert detail_wrong == detail_lockout == detail_unknown, \
            f"Expected identical detail messages, got: wrong={detail_wrong!r}, lockout={detail_lockout!r}, unknown={detail_unknown!r}"
