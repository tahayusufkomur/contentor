"""
Accounts Views API tests.

Tests for:
  - POST /api/v1/auth/magic-link/          (magic_link_request)
  - POST /api/v1/auth/magic-link/verify/   (magic_link_verify)
  - GET  /api/v1/auth/users/me/            (me)
  - PATCH /api/v1/auth/users/me/update/    (update_me)
  - POST /api/v1/auth/logout/              (logout)
  - GET  /api/v1/auth/students/            (student_list)
  - DELETE /api/v1/auth/students/<pk>/     (student_delete)
  - POST /api/v1/auth/google/              (google_login)

Uses shared tenant fixtures from conftest.py.
"""

from unittest.mock import patch

import pytest
from django.db import connection
from django_tenants.utils import tenant_context
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.tokens import create_magic_link_token
from apps.core.models import Domain, Tenant

SHARED_DOMAIN = "shared-test.localhost"


# ---------------------------------------------------------------------------
# User fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@accountstest.com", name="Owner", password="secret123", role="owner")


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(email="coach@accountstest.com", name="Coach", password="secret123", role="coach")


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(
        email="student@accountstest.com", name="Student", password="secret123", role="student"
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_client(user=None):
    """Return an APIClient routing requests to the test tenant."""
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


# ---------------------------------------------------------------------------
# Tests: magic_link_request
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
@patch("apps.accounts.views.MagicLinkThrottle.allow_request", return_value=True)
class TestMagicLinkRequest:
    def test_valid_email_returns_200(self, _mock_throttle, tenant_ctx):
        """POST with a valid email returns 200 and a generic message."""
        client = make_client()
        with patch("apps.core.email.send_magic_link", return_value=True):
            response = client.post(
                "/api/v1/auth/magic-link/",
                {"email": "newuser@example.com"},
                format="json",
            )
        assert response.status_code == 200, response.content
        assert "detail" in response.json()

    def test_missing_email_returns_400(self, _mock_throttle, tenant_ctx):
        """POST without email returns 400."""
        client = make_client()
        response = client.post("/api/v1/auth/magic-link/", {}, format="json")
        assert response.status_code == 400, response.content

    @patch("apps.accounts.views.MagicLinkThrottle.allow_request", return_value=True)
    def test_demo_tenant_returns_demo_redirect(self, _mock_throttle, django_db_blocker):
        """Demo tenants (slug starts with 'demo-') return a demo_redirect URL."""
        demo_domain = "demo-test.localhost"
        demo_schema = "demo_test"
        with django_db_blocker.unblock():
            connection.set_schema_to_public()
            demo_tenant, _ = Tenant.objects.get_or_create(
                schema_name=demo_schema,
                defaults={
                    "name": "Demo Test Tenant",
                    "slug": "demo-test",
                    "owner_email": "owner@demotest.com",
                    "subdomain": "demo-test",
                },
            )
            demo_tenant.create_schema(check_if_exists=True, sync_schema=True)
            Domain.objects.get_or_create(
                domain=demo_domain,
                defaults={"tenant": demo_tenant, "is_primary": True},
            )
        try:
            demo_client = APIClient(HTTP_HOST=demo_domain)
            response = demo_client.post(
                "/api/v1/auth/magic-link/",
                {"email": "demo@example.com"},
                format="json",
            )
            assert response.status_code == 200, response.content
            data = response.json()
            assert "demo_redirect" in data
            assert "callback?token=" in data["demo_redirect"]
        finally:
            with django_db_blocker.unblock():
                connection.set_schema_to_public()
                demo_tenant.delete(force_drop=True)


# ---------------------------------------------------------------------------
# Tests: magic_link_verify
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestMagicLinkVerify:
    def test_valid_token_creates_user_and_sets_cookie(self, restore_public):
        """Valid token creates a user (if not exists) and sets the access cookie."""
        tenant = restore_public
        with tenant_context(tenant):
            try:
                token = create_magic_link_token("verified@example.com", tenant.schema_name, tenant.slug)
                client = make_client()
                response = client.post(
                    "/api/v1/auth/magic-link/verify/",
                    {"token": token},
                    format="json",
                )
                assert response.status_code == 200, response.content
                assert "user" in response.json()
                assert response.json()["user"]["email"] == "verified@example.com"
                assert "contentor_access_token" in response.cookies
                # User should have been created with student role
                user = User.objects.get(email="verified@example.com")
                assert user.role == "student"
            finally:
                User.objects.all().delete()

    def test_invalid_token_returns_400(self, tenant_ctx):
        """Invalid/expired token returns 400."""
        client = make_client()
        response = client.post(
            "/api/v1/auth/magic-link/verify/",
            {"token": "invalid-token-value"},
            format="json",
        )
        assert response.status_code == 400, response.content
        assert "Invalid or expired token" in response.json()["detail"]

    def test_token_for_wrong_tenant_returns_403(self, tenant_ctx):
        """Token issued for a different tenant returns 403."""
        token = create_magic_link_token("wrongtenant@example.com", "other_schema", "other-slug")
        client = make_client()
        response = client.post(
            "/api/v1/auth/magic-link/verify/",
            {"token": token},
            format="json",
        )
        assert response.status_code == 403, response.content
        assert "not valid for this tenant" in response.json()["detail"]

    def test_missing_token_returns_400(self, tenant_ctx):
        """POST without token returns 400."""
        client = make_client()
        response = client.post("/api/v1/auth/magic-link/verify/", {}, format="json")
        assert response.status_code == 400, response.content


# ---------------------------------------------------------------------------
# Tests: me
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestMe:
    def test_authenticated_user_gets_their_data(self, owner):
        """Authenticated user receives their serialized data."""
        client = make_client(owner)
        response = client.get("/api/v1/auth/users/me/")
        assert response.status_code == 200, response.content
        data = response.json()
        assert data["email"] == owner.email
        assert data["name"] == owner.name
        assert data["role"] == "owner"

    def test_unauthenticated_returns_401(self, tenant_ctx):
        """Unauthenticated request returns 401."""
        client = make_client()
        response = client.get("/api/v1/auth/users/me/")
        assert response.status_code in (401, 403), response.content


# ---------------------------------------------------------------------------
# Tests: update_me
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestUpdateMe:
    def test_update_name(self, owner):
        """PATCH updates the user's name."""
        client = make_client(owner)
        response = client.patch(
            "/api/v1/auth/users/me/update/",
            {"name": "New Name"},
            format="json",
        )
        assert response.status_code == 200, response.content
        assert response.json()["name"] == "New Name"
        owner.refresh_from_db()
        assert owner.name == "New Name"

    def test_update_avatar_url(self, owner):
        """PATCH updates the user's avatar_url."""
        client = make_client(owner)
        response = client.patch(
            "/api/v1/auth/users/me/update/",
            {"avatar_url": "https://example.com/avatar.png"},
            format="json",
        )
        assert response.status_code == 200, response.content
        assert response.json()["avatar_url"] == "https://example.com/avatar.png"

    def test_cannot_update_email(self, owner):
        """Email is read-only and should not change."""
        original_email = owner.email
        client = make_client(owner)
        response = client.patch(
            "/api/v1/auth/users/me/update/",
            {"email": "hacked@example.com"},
            format="json",
        )
        assert response.status_code == 200, response.content
        owner.refresh_from_db()
        assert owner.email == original_email

    def test_unauthenticated_returns_401(self, tenant_ctx):
        """Unauthenticated request returns 401."""
        client = make_client()
        response = client.patch(
            "/api/v1/auth/users/me/update/",
            {"name": "Nope"},
            format="json",
        )
        assert response.status_code in (401, 403), response.content


# ---------------------------------------------------------------------------
# Tests: logout
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestLogout:
    def test_logout_returns_200_and_deletes_cookie(self, owner):
        """POST /logout/ returns 200 and deletes the access cookie."""
        client = make_client(owner)
        response = client.post("/api/v1/auth/logout/")
        assert response.status_code == 200, response.content
        assert response.json()["detail"] == "Logged out"
        # Cookie deletion sets max-age=0
        cookie = response.cookies.get("contentor_access_token")
        assert cookie is not None
        assert cookie["max-age"] == 0

    def test_unauthenticated_returns_401(self, tenant_ctx):
        """Unauthenticated request returns 401."""
        client = make_client()
        response = client.post("/api/v1/auth/logout/")
        assert response.status_code in (401, 403), response.content


# ---------------------------------------------------------------------------
# Tests: student_list
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestStudentList:
    def test_owner_sees_student_list(self, owner, student):
        """Owner can list students."""
        client = make_client(owner)
        response = client.get("/api/v1/auth/students/")
        assert response.status_code == 200, response.content
        data = response.json()
        emails = [s["email"] for s in data]
        assert student.email in emails

    def test_coach_sees_student_list(self, coach, student):
        """Coach can list students."""
        client = make_client(coach)
        response = client.get("/api/v1/auth/students/")
        assert response.status_code == 200, response.content
        data = response.json()
        emails = [s["email"] for s in data]
        assert student.email in emails

    def test_student_gets_403(self, student):
        """Student cannot list students."""
        client = make_client(student)
        response = client.get("/api/v1/auth/students/")
        assert response.status_code == 403, response.content

    def test_search_filter_works(self, owner, student):
        """Search by name filters results."""
        client = make_client(owner)
        response = client.get("/api/v1/auth/students/?search=Student")
        assert response.status_code == 200, response.content
        data = response.json()
        assert len(data) >= 1
        assert all("Student" in s["name"] or "student" in s["email"] for s in data)

    def test_search_no_results(self, owner, student):
        """Search with non-matching term returns empty list."""
        client = make_client(owner)
        response = client.get("/api/v1/auth/students/?search=nonexistent999")
        assert response.status_code == 200, response.content
        data = response.json()
        assert len(data) == 0

    def test_limit_offset_returns_paginated_payload(self, owner, student):
        """When limit/offset are passed, API returns paginated shape."""
        User.objects.create_user(email="student2@accountstest.com", name="Student Two", password="secret123", role="student")
        client = make_client(owner)
        response = client.get("/api/v1/auth/students/?limit=1&offset=0&ordering=name")
        assert response.status_code == 200, response.content
        data = response.json()
        assert isinstance(data, dict)
        assert {"count", "next", "results"}.issubset(data.keys())
        assert data["count"] >= 2
        assert len(data["results"]) == 1


# ---------------------------------------------------------------------------
# Tests: student_delete
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestStudentDelete:
    def test_owner_deletes_student(self, owner, student):
        """Owner can delete a student, returns 204."""
        student_pk = student.pk
        client = make_client(owner)
        response = client.delete(f"/api/v1/auth/students/{student_pk}/")
        assert response.status_code == 204, response.content
        assert not User.objects.filter(pk=student_pk).exists()

    def test_student_cannot_delete(self, student):
        """Student cannot delete another student, returns 403."""
        other = User.objects.create_user(
            email="other@accountstest.com", name="Other", password="secret123", role="student"
        )
        client = make_client(student)
        response = client.delete(f"/api/v1/auth/students/{other.pk}/")
        assert response.status_code == 403, response.content

    def test_nonexistent_student_returns_404(self, owner):
        """Deleting a non-existent student returns 404."""
        client = make_client(owner)
        response = client.delete("/api/v1/auth/students/999999/")
        assert response.status_code == 404, response.content

    def test_cannot_delete_non_student_role(self, owner, coach):
        """Owner cannot delete a coach via student_delete endpoint."""
        client = make_client(owner)
        response = client.delete(f"/api/v1/auth/students/{coach.pk}/")
        assert response.status_code == 404, response.content


# ---------------------------------------------------------------------------
# Tests: google_login
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestGoogleLogin:
    @patch("django.conf.settings.GOOGLE_REDIRECT_URI", "http://localhost/callback", create=True)
    @patch("django.conf.settings.GOOGLE_CLIENT_ID", "fake-client-id", create=True)
    def test_returns_google_auth_url(self, tenant_ctx):
        """POST /google/ returns a URL containing the Google auth endpoint."""
        client = make_client()
        response = client.post(
            "/api/v1/auth/google/",
            {"origin": "http://localhost:3000"},
            format="json",
        )
        assert response.status_code == 200, response.content
        data = response.json()
        assert "url" in data
        assert "accounts.google.com" in data["url"]
        assert "fake-client-id" in data["url"]
        assert "state=" in data["url"]
