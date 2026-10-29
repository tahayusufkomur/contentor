"""The creator picks their language: one write reaches the public row and every studio they own."""

from unittest import mock

import pytest
from django_tenants.utils import schema_context
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.tokens import create_jwt
from apps.core.models import Domain, Tenant
from apps.core.tests.i18n_utils import translated

SHARED_DOMAIN = "shared-test.localhost"
EMAIL = "owner@sharedtest.com"  # the shared test tenant's owner_email
URL = "/api/v1/auth/users/me/locale/"

pytestmark = pytest.mark.django_db


@pytest.fixture()
def second_studio(restore_public):
    """A second tenant owned by the same creator, with its own owner row."""
    with schema_context("public"):
        tenant = Tenant.objects.create(
            schema_name="second_studio",
            name="Second",
            slug="second-studio",
            subdomain="second-studio",
            owner_email=EMAIL,
            provisioning_status="ready",
        )
        tenant.create_schema(check_if_exists=True, verbosity=0)
    with schema_context(tenant.schema_name):
        User.objects.create_user(email=EMAIL, name="Owner", role="owner", is_staff=True, preferred_locale="en")
    yield tenant
    with schema_context("public"):
        tenant.delete(force_drop=True)


@pytest.fixture()
def owner(tenant_ctx):
    with schema_context("public"):
        User.objects.create(email=EMAIL, name="Owner", role="coach", region="global", preferred_locale="en")
    return User.objects.create_user(email=EMAIL, name="Owner", role="owner", is_staff=True, preferred_locale="en")


def _post(owner, locale, cookie=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    client.cookies["contentor_access_token"] = create_jwt(owner, Tenant.objects.get(schema_name="shared_test"))
    if cookie:
        client.cookies["user-locale"] = cookie
    return client.post(URL, {"locale": locale}, format="json")


def _locale(schema):
    with schema_context(schema):
        return User.objects.get(email=EMAIL).preferred_locale


def test_an_enabled_language_is_accepted(owner):
    response = _post(owner, "tr")
    assert response.status_code == 200, response.content
    assert response.json() == {"locale": "tr"}


def test_the_public_row_and_every_owned_studio_follow(owner, second_studio):
    response = _post(owner, "tr")
    assert response.status_code == 200, response.content
    assert response.cookies["user-locale"].value == "tr"
    assert _locale("public") == "tr"
    assert _locale("shared_test") == "tr"
    assert _locale("second_studio") == "tr"


@pytest.fixture()
def broken_studio(restore_public):
    """A `ready` tenant whose schema is gone (torn down, mid-migration)."""
    with schema_context("public"):
        Tenant.auto_create_schema = False
        try:
            tenant = Tenant.objects.create(
                schema_name="broken_studio",
                name="Broken",
                slug="broken-studio",
                subdomain="broken-studio",
                owner_email=EMAIL,
                provisioning_status="ready",
            )
        finally:
            Tenant.auto_create_schema = True
    return tenant


def test_a_broken_studio_never_blocks_the_change(owner, second_studio, broken_studio, monkeypatch):
    from django.db import ProgrammingError

    from apps.accounts import views

    real = views.schema_context

    def schema_context_(schema):
        if schema == "broken_studio":  # Postgres search_path falls back to public for a missing schema; fail it
            raise ProgrammingError("relation does not exist")
        return real(schema)

    monkeypatch.setattr(views, "schema_context", schema_context_)
    warn = mock.Mock()
    monkeypatch.setattr(views.logger, "warning", warn)
    response = _post(owner, "tr")
    assert response.status_code == 200, response.content
    assert response.cookies["user-locale"].value == "tr"
    assert _locale("public") == "tr"
    assert _locale("shared_test") == "tr"
    assert _locale("second_studio") == "tr"
    warn.assert_called_once()
    assert warn.call_args.args[1] == "broken_studio"


def test_a_studio_still_being_made_is_seeded_with_the_new_language(owner):
    with schema_context("public"):
        Tenant.auto_create_schema = False
        try:
            Tenant.objects.create(
                schema_name="pending_studio",
                name="Pending",
                slug="pending-studio",
                subdomain="pending-studio",
                owner_email=EMAIL,
                provisioning_status="provisioning",
                wizard_state={"locale": "en", "answers": {"niche": "yoga"}},
            )
        finally:
            Tenant.auto_create_schema = True
    assert _post(owner, "de").status_code == 200
    with schema_context("public"):
        state = Tenant.objects.get(schema_name="pending_studio").wizard_state
    assert state == {"locale": "de", "answers": {"niche": "yoga"}}


def test_a_coach_role_creator_row_follows_too(tenant_ctx):
    with schema_context("public"):
        User.objects.create(email="coach@sharedtest.test", name="C", role="coach", region="global")
    coach = User.objects.create_user(email="coach@sharedtest.test", name="C", role="coach", is_staff=True)
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    client.cookies["contentor_access_token"] = create_jwt(coach, Tenant.objects.get(schema_name="shared_test"))
    assert client.post(URL, {"locale": "pl"}, format="json").status_code == 200
    for schema in ("public", "shared_test"):
        with schema_context(schema):
            assert User.objects.get(email="coach@sharedtest.test").preferred_locale == "pl"


@pytest.mark.parametrize("locale", ["xx", "de"])
def test_an_unknown_or_hidden_language_is_refused_in_the_requests_language(owner, settings, locale):
    settings.ENABLED_LOCALES = ("en", "tr")
    response = _post(owner, locale, cookie="tr")
    assert response.status_code == 400
    assert response.json()["detail"] == translated("Unsupported locale")
    assert _locale("shared_test") == "en"


def test_a_student_cannot_set_a_creator_language(tenant_ctx):
    student = User.objects.create_user(email="s@x.test", name="S", role="student")
    assert _post(student, "tr").status_code == 403


def _google_sign_in(tenant_schema, monkeypatch, *, language=None):
    """Run google_callback for a new address on `tenant_schema`; the new user's row."""
    from unittest.mock import Mock

    from apps.accounts import views

    monkeypatch.setattr(
        views.http_requests,
        "post",
        lambda *a, **k: Mock(status_code=200, json=lambda: {"access_token": "t"}),
    )
    monkeypatch.setattr(
        views.http_requests,
        "get",
        lambda *a, **k: Mock(status_code=200, json=lambda: {"email": "new@google.test", "name": "New"}),
    )
    state = views._create_oauth_state(tenant_schema, "http://localhost", "global")
    if tenant_schema == "public":  # the apex: contentor.app answers in the page's language
        with schema_context("public"):
            apex, _created = Tenant.objects.get_or_create(
                schema_name="public", defaults={"name": "Platform", "slug": "platform", "subdomain": "platform"}
            )
            Domain.objects.get_or_create(domain="localhost", defaults={"tenant": apex})
    client = APIClient(HTTP_HOST="localhost" if tenant_schema == "public" else SHARED_DOMAIN)
    if language:
        client.cookies["NEXT_LOCALE"] = language
    assert client.get("/api/v1/auth/google/callback/", {"code": "c", "state": state}).status_code == 302
    with schema_context(tenant_schema):
        return User.objects.get(email="new@google.test")


@pytest.mark.django_db(transaction=True)
def test_a_creator_made_through_google_on_the_platform_gets_the_pages_language(restore_public, monkeypatch):
    assert _google_sign_in("public", monkeypatch, language="tr").preferred_locale == "tr"


def test_a_student_made_through_google_keeps_no_language(tenant_ctx, monkeypatch):
    assert _google_sign_in("shared_test", monkeypatch, language="tr").preferred_locale == ""
