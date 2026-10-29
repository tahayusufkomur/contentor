"""A creator's platform emails (signup verification, setup recovery, sign-in link) come in the creator's
language, and every link carries the language's address prefix (/pl/signup/verify)."""

from unittest import mock

import pytest
from django.core.cache import cache
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core import languages
from apps.core.models import DevOutboundEmail, Domain, Tenant
from apps.core.onboarding import recovery
from apps.core.tests.i18n_utils import translated

pytestmark = pytest.mark.django_db(transaction=True)

SIGNUP = "/api/v1/onboarding/signup/"
MAGIC_LINK = "/api/v1/auth/magic-link/"
EMAIL = "creator@lang.test"
APEX = "apex-host.localhost"


@pytest.fixture(autouse=True)
def _all_languages(settings):
    settings.ENABLED_LOCALES = ["en", "tr", "de", "pl"]
    settings.EMAIL_SINK_ENABLED = True
    cache.clear()


def test_the_locale_prefix_follows_the_frontend_rule():
    assert languages.locale_href("/signup/verify", "en") == "/signup/verify"
    assert languages.locale_href("/signup/verify", "pl") == "/pl/signup/verify"


@pytest.mark.parametrize("locale", ["pl", "de"])
def test_the_verify_email_is_in_the_creators_language(locale):
    with mock.patch("apps.core.email.send_email", return_value=True) as send:
        resp = APIClient(HTTP_HOST="localhost").post(
            SIGNUP, {"email": EMAIL, "name": "C", "locale": locale}, format="json"
        )
    assert resp.status_code == 200, resp.content
    mail = send.call_args.kwargs
    assert mail["subject"] == translated("Verify your email to create your site", locale)
    assert translated("Confirm your email", locale) in mail["html"]
    assert f"/{locale}/signup/verify?token=" in mail["text"]
    assert f"/{locale}/signup/verify?token=" in mail["html"]


def test_the_english_verify_email_has_no_prefix():
    with mock.patch("apps.core.email.send_email", return_value=True) as send:
        APIClient(HTTP_HOST="localhost").post(SIGNUP, {"email": EMAIL, "name": "C"}, format="json")
    mail = send.call_args.kwargs
    assert mail["subject"] == "Verify your email to create your site"
    assert "/signup/verify?token=" in mail["text"] and "/en/" not in mail["text"]


def _tenant(wizard_state, slug="new-site-aa0001", name="Lang Rec"):
    connection.set_schema_to_public()
    original = Tenant.auto_create_schema
    Tenant.auto_create_schema = False
    try:
        return Tenant.objects.create(
            schema_name=slug.replace("-", "_"),
            name=name,
            slug=slug,
            subdomain=slug,
            owner_email=EMAIL,
            wizard_state=wizard_state,
        )
    finally:
        Tenant.auto_create_schema = original


@pytest.fixture()
def cleanup():
    yield
    connection.set_schema_to_public()
    DevOutboundEmail.objects.filter(to=EMAIL).delete()
    Domain.objects.filter(domain=APEX).delete()
    Tenant.objects.filter(owner_email=EMAIL).delete()
    User.objects.filter(email=EMAIL)._raw_delete("default")  # a delete would cascade into tenant-only tables


@pytest.mark.parametrize("send", [recovery.send_recovery_email, recovery.send_abandon_warning])
def test_the_setup_emails_follow_the_creators_language(cleanup, send):
    tenant = _tenant({"locale": "pl", "site_locale": "en"})
    assert send(tenant)
    mail = DevOutboundEmail.objects.get(to=EMAIL)
    assert translated("your site", "pl") in mail.subject
    assert "/pl/signup/verify?token=" in mail.html
    assert "your site" not in mail.subject


def test_the_setup_email_falls_back_to_the_owners_language(cleanup):
    User.objects.create(email=EMAIL, name="C", role="owner", preferred_locale="de")
    tenant = _tenant({})
    assert recovery.send_recovery_email(tenant)
    assert "/de/signup/verify?token=" in DevOutboundEmail.objects.get(to=EMAIL).html


def test_an_english_setup_email_is_unchanged(cleanup):
    tenant = _tenant({"locale": "en"})
    assert recovery.send_recovery_email(tenant)
    mail = DevOutboundEmail.objects.get(to=EMAIL)
    assert mail.subject == "Pick up where you left off — your site"
    assert "/signup/verify?token=" in mail.html and "/en/signup" not in mail.html


@pytest.fixture()
def apex(restore_public):
    """A host on the public schema, as contentor.app is: no TenantConfig table behind it."""
    connection.set_schema_to_public()
    public, _created = Tenant.objects.get_or_create(
        schema_name="public",
        defaults={"name": "Public", "slug": "public", "owner_email": "root@x.test", "subdomain": "public"},
    )
    Domain.objects.get_or_create(domain=APEX, defaults={"tenant": public, "is_primary": True})


def _apex_magic_link(**extra):
    with mock.patch("apps.accounts.views.MagicLinkThrottle.allow_request", return_value=True):
        return APIClient(HTTP_HOST=APEX, **extra).post(MAGIC_LINK, {"email": EMAIL}, format="json")


def test_the_apex_sign_in_link_is_in_the_creators_language_without_a_site(apex, cleanup):
    """contentor.app has no TenantConfig: the creator's own email, drawn without the studio's email engine."""
    User.objects.create(email=EMAIL, name="C", role="owner", preferred_locale="de")
    with mock.patch("apps.core.email.send_email", return_value=True) as send:
        resp = _apex_magic_link()
    assert resp.status_code == 200, resp.content
    mail = send.call_args.kwargs
    assert mail["subject"] == translated("Your Contentor sign-in link", "de")
    assert "/de/callback?token=" in mail["text"]


def test_an_unknown_address_gets_the_pages_language(apex, cleanup):
    with mock.patch("apps.core.email.send_email", return_value=True) as send:
        resp = _apex_magic_link(HTTP_ACCEPT_LANGUAGE="pl")
    assert resp.status_code == 200, resp.content
    assert send.call_args.kwargs["subject"] == translated("Your Contentor sign-in link", "pl")
    assert "/pl/callback?token=" in send.call_args.kwargs["text"]


def test_the_apex_link_still_signs_in(apex, cleanup):
    """The token the email carries is the one magic-link verify accepts on the apex."""
    User.objects.create(email=EMAIL, name="C", role="owner")
    with mock.patch("apps.core.email.send_email", return_value=True) as send:
        _apex_magic_link()
    token = send.call_args.kwargs["text"].split("token=")[1].split()[0]
    resp = APIClient(HTTP_HOST=APEX).post("/api/v1/auth/magic-link/verify/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
