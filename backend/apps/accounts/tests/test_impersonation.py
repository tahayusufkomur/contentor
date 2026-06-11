"""Impersonation: superadmin → tenant admin, coach → student, redeem/exit.

Exercises the admin-kit row actions that issue tokens, the verify endpoint
that exchanges them for sessions, single-use enforcement, and the stop
endpoint's restore-vs-clear behaviour.
"""

from __future__ import annotations

import urllib.parse

import pytest
from django_tenants.utils import schema_context
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.tokens import create_impersonation_token, create_jwt
from apps.core.models import Domain, Tenant

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db


def _token_from_redirect(url: str) -> str:
    return urllib.parse.parse_qs(urllib.parse.urlparse(url).query)["token"][0]


# ---------------------------------------------------------------------------
# Studio: coach → student (same tenant, same domain)
# ---------------------------------------------------------------------------


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@imp.test", name="Owner", role="owner", is_staff=True)


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(email="student@imp.test", name="Student", role="student")


def _client(user=None, token=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    if token is not None:
        client.cookies["contentor_access_token"] = token
    return client


def test_coach_impersonates_student_then_exits(owner, student):
    coach_token = create_jwt(owner, owner_tenant())
    client = _client(token=coach_token)

    issued = client.post("/api/v1/studio-admin/users/actions/login_as/", {"ids": [student.pk]}, format="json")
    assert issued.status_code == 200, issued.content
    token = _token_from_redirect(issued.json()["redirect"])

    redeemed = client.post("/api/v1/auth/impersonate/verify/", {"token": token}, format="json")
    assert redeemed.status_code == 200, redeemed.content
    assert redeemed.json()["user"]["email"] == "student@imp.test"
    assert redeemed.json()["impersonating"] == {"by": "owner@imp.test", "scope": "studio"}
    assert "contentor_impersonator_return" in redeemed.cookies  # coach session stashed

    me = client.get("/api/v1/auth/users/me/")
    assert me.json()["email"] == "student@imp.test"
    assert me.json()["impersonating"]["by"] == "owner@imp.test"

    stopped = client.post("/api/v1/auth/impersonate/stop/")
    assert stopped.json()["restored"] is True
    assert stopped.json()["user"]["email"] == "owner@imp.test"


def test_login_as_rejects_non_students(owner):
    other = User.objects.create_user(email="coach2@imp.test", name="Coach Two", role="coach")
    client = _client(token=create_jwt(owner, owner_tenant()))
    resp = client.post("/api/v1/studio-admin/users/actions/login_as/", {"ids": [other.pk]}, format="json")
    assert resp.status_code == 200
    assert "redirect" not in resp.json()
    assert "student" in resp.json()["detail"].lower()


def test_token_is_single_use(owner, student):
    client = _client(token=create_jwt(owner, owner_tenant()))
    issued = client.post("/api/v1/studio-admin/users/actions/login_as/", {"ids": [student.pk]}, format="json")
    token = _token_from_redirect(issued.json()["redirect"])

    assert _client().post("/api/v1/auth/impersonate/verify/", {"token": token}, format="json").status_code == 200
    replay = _client().post("/api/v1/auth/impersonate/verify/", {"token": token}, format="json")
    assert replay.status_code == 400


def test_verify_rejects_wrong_tenant(student):
    # Token minted for a different schema must not redeem here.
    token = create_impersonation_token(
        tenant_schema="some-other-schema",
        target_user_id=student.pk,
        impersonator_email="root@imp.test",
        scope="platform",
        jti="jti-wrong-tenant",
    )
    resp = _client().post("/api/v1/auth/impersonate/verify/", {"token": token}, format="json")
    assert resp.status_code == 403


def test_students_cannot_issue_impersonation(student):
    resp = _client(user=student).post(
        "/api/v1/studio-admin/users/actions/login_as/", {"ids": [student.pk]}, format="json"
    )
    assert resp.status_code == 403


def owner_tenant():
    """The shared test tenant (public schema row), used to mint session JWTs."""
    with schema_context("public"):
        return Tenant.objects.get(schema_name="shared_test")


# ---------------------------------------------------------------------------
# Platform: superadmin → tenant admin
# ---------------------------------------------------------------------------


@pytest.fixture()
def superuser(restore_public):
    return User.objects.create(email="root@imp.test", region="global", role="owner", is_staff=True, is_superuser=True)


def test_superadmin_logs_in_as_tenant_admin(superuser, owner):
    # `owner` (created via tenant_ctx) is the staff admin in the shared tenant.
    tenant = owner_tenant()
    with schema_context("public"):
        Domain.objects.get_or_create(domain=SHARED_DOMAIN, defaults={"tenant": tenant, "is_primary": True})

    admin_client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    admin_client.force_authenticate(user=superuser)
    issued = admin_client.post(
        "/api/v1/platform-admin/tenants/actions/login_as_admin/", {"ids": [tenant.pk]}, format="json"
    )
    assert issued.status_code == 200, issued.content
    redirect = issued.json()["redirect"]
    assert "/impersonate?token=" in redirect

    token = _token_from_redirect(redirect)
    redeemed = APIClient(HTTP_HOST=SHARED_DOMAIN).post(
        "/api/v1/auth/impersonate/verify/", {"token": token}, format="json"
    )
    assert redeemed.status_code == 200, redeemed.content
    assert redeemed.json()["impersonating"]["scope"] == "platform"
    # Lands as a staff/owner user (admin area).
    assert redeemed.json()["user"]["role"] in ("owner", "coach")


def test_platform_scope_exit_returns_to_apex_not_a_stale_session(superuser, owner):
    """A superadmin's exit must drop the tenant session — never adopt whatever
    session already sat on the subdomain (that's a studio-scope behaviour)."""
    tenant = owner_tenant()
    with schema_context("public"):
        Domain.objects.get_or_create(domain=SHARED_DOMAIN, defaults={"tenant": tenant, "is_primary": True})

    admin_client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    admin_client.force_authenticate(user=superuser)
    issued = admin_client.post(
        "/api/v1/platform-admin/tenants/actions/login_as_admin/", {"ids": [tenant.pk]}, format="json"
    )
    token = _token_from_redirect(issued.json()["redirect"])

    # Redeem on a browser that already holds a coach session for this tenant.
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    client.cookies["contentor_access_token"] = create_jwt(owner, tenant)
    redeemed = client.post("/api/v1/auth/impersonate/verify/", {"token": token}, format="json")
    assert redeemed.status_code == 200
    ret = redeemed.cookies.get("contentor_impersonator_return")
    assert ret is None or ret.value == ""  # platform scope stashes nothing

    stopped = client.post("/api/v1/auth/impersonate/stop/")
    assert stopped.json()["restored"] is False


def test_non_superuser_cannot_use_platform_login(owner):
    tenant = owner_tenant()
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    client.force_authenticate(user=owner)  # tenant owner, not a superuser
    resp = client.post("/api/v1/platform-admin/tenants/actions/login_as_admin/", {"ids": [tenant.pk]}, format="json")
    assert resp.status_code == 403
