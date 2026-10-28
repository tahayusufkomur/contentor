"""Each request is answered in the right language (Task 0.2).

Probe: an unauthenticated GET of an IsAuthenticated endpoint on the shared tenant,
whose site language is Turkish. DRF ships its own Turkish catalog, so these tests
don't depend on draft wording.
"""

from datetime import UTC, datetime, timedelta

import jwt
import pytest
from django.conf import settings
from django.test import Client, override_settings

from apps.accounts.models import User
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"
PROBE = "/api/v1/auth/users/me/"
ENGLISH = "Authentication credentials were not provided."


def _token(user, tenant):
    now = datetime.now(tz=UTC)
    payload = {
        "user_id": user.id,
        "tenant_id": tenant.schema_name,
        "role": user.role,
        "iat": now,
        "exp": now + timedelta(days=1),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


@pytest.fixture()
def site(tenant_ctx):
    TenantConfig.objects.all().delete()
    TenantConfig.objects.create(brand_name="Studio", default_locale="tr")
    return tenant_ctx


def _get(path=PROBE, host=HOST, **extra):
    return Client().get(path, HTTP_HOST=host, **extra)


def test_student_gets_site_language_whatever_the_browser(site):
    student = User.objects.create_user(email="s@example.com", password="x", role="student")
    response = _get(HTTP_AUTHORIZATION=f"Bearer {_token(student, site)}", HTTP_ACCEPT_LANGUAGE="en-US")
    assert response.headers["Content-Language"] == "tr"


def test_anonymous_visitor_gets_site_language(site):
    assert _get(HTTP_ACCEPT_LANGUAGE="de").headers["Content-Language"] == "tr"


def test_creator_gets_creator_language(site):
    owner = User.objects.create_user(email="o@example.com", password="x", role="owner", preferred_locale="pl")
    client = Client()
    client.cookies["contentor_access_token"] = _token(owner, site)
    client.cookies["user-locale"] = "de"
    assert client.get(PROBE, HTTP_HOST=HOST).headers["Content-Language"] == "de"


def test_creator_without_cookie_uses_their_row(site):
    owner = User.objects.create_user(email="o@example.com", password="x", role="owner", preferred_locale="pl")
    response = _get(HTTP_AUTHORIZATION=f"Bearer {_token(owner, site)}")
    assert response.headers["Content-Language"] == "pl"


def test_apex_follows_next_locale_then_accept_language(restore_public):
    path = "/api/v1/onboarding/check-brand-name/"  # the onboarding API runs in the public schema
    client = Client()
    assert client.get(path, HTTP_ACCEPT_LANGUAGE="de-DE,de;q=0.9").headers["Content-Language"] == "de"
    client.cookies["NEXT_LOCALE"] = "pl"
    assert client.get(path, HTTP_ACCEPT_LANGUAGE="de").headers["Content-Language"] == "pl"
    client.cookies["NEXT_LOCALE"] = "xx"
    assert client.get(path, HTTP_ACCEPT_LANGUAGE="de").headers["Content-Language"] == "en"


def test_django_admin_stays_english(site):
    response = _get("/django-admin/login/", HTTP_ACCEPT_LANGUAGE="tr")
    assert response.headers["Content-Language"] == "en"


@override_settings(ENABLED_LOCALES=["en"], LANGUAGES=[("en", "English")])
def test_hidden_language_answers_english(site):
    response = _get()
    assert response.headers["Content-Language"] == "en"
    assert response.json()["detail"] == ENGLISH


def test_drf_messages_are_translated(site):
    response = _get()
    assert response.json()["detail"] != ENGLISH


def test_session_claims_reads_header_then_cookie_and_never_raises(site):
    from django.test import RequestFactory

    from apps.accounts.authentication import session_claims

    owner = User.objects.create_user(email="o@example.com", password="x", role="owner")
    token = _token(owner, site)
    rf = RequestFactory()
    assert session_claims(rf.get("/", HTTP_AUTHORIZATION=f"Bearer {token}"))["user_id"] == owner.id
    request = rf.get("/")
    request.COOKIES["contentor_access_token"] = token
    assert session_claims(request)["role"] == "owner"
    assert session_claims(rf.get("/", HTTP_AUTHORIZATION="Bearer nonsense")) is None
    assert session_claims(rf.get("/")) is None


def test_a_site_without_its_config_table_answers_english(site):
    """Half-provisioned or being torn down: the schema has no tenant_config table."""
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute("ALTER TABLE tenant_config_tenantconfig RENAME TO tenant_config_tenantconfig_gone")
    try:
        response = _get(HTTP_ACCEPT_LANGUAGE="de")
    finally:
        with connection.cursor() as cursor:
            cursor.execute("ALTER TABLE tenant_config_tenantconfig_gone RENAME TO tenant_config_tenantconfig")
    assert response.headers["Content-Language"] == "en"
    assert response.status_code != 500


def test_responses_vary_on_what_picks_the_language(site):
    assert {"Accept-Language", "Cookie"} <= set(_get().headers["Vary"].replace(" ", "").split(","))
