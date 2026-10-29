"""A creator's platform emails (signup verification, setup recovery, sign-in link) come in the creator's
language, and every link carries the language's address prefix (/pl/signup/verify)."""

from html import unescape
from unittest import mock

import pytest
from django.conf import settings as django_settings
from django.core.cache import cache
from django.db import connection
from django.utils import translation
from django.utils.translation import ngettext
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
    assert languages.locale_href("/", "pl") == "/pl"  # not "/pl/"
    assert languages.locale_href("/?a=1", "pl") == "/pl?a=1"
    assert languages.locale_href("/#team", "pl") == "/pl#team"
    assert languages.locale_href("/pricing", "pl") == "/pl/pricing"
    assert languages.locale_href("/", "en") == "/"


@pytest.mark.parametrize("code", ["xx", "", None, "de"])
def test_a_link_never_names_a_hidden_or_unknown_language(settings, code):
    settings.ENABLED_LOCALES = ["en", "pl"]
    assert languages.locale_href("/signup/verify", code) == "/signup/verify"
    assert languages.locale_href("/", code) == "/"


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


RECOVERY_INTRO = (
    "You started setting up %(brand)s — every answer you gave is saved. "
    "Click below to continue right where you left off."
)
ABANDON_INTRO = (
    "You started setting up %(brand)s but never finished. "
    "We'll remove this unfinished signup in %(grace)d {days} to free it up. "
    "Click below to pick up exactly where you left off — nothing is lost yet."
)
NO_NAME_RECOVERY_INTRO = RECOVERY_INTRO.replace("%(brand)s", "your site")
NO_NAME_ABANDON_INTRO = ABANDON_INTRO.replace("%(brand)s", "your site")


def _body(mail):
    """What the creator reads: the email's HTML with its escapes (an apostrophe) undone."""
    return unescape(mail.html)


def _abandon_intro(language, template):
    """The abandon intro in a language, for the configured grace (ngettext picks the plural form)."""
    grace = django_settings.WIZARD_ABANDON_DELETE_GRACE_DAYS
    one, other = (template.format(days=d) for d in ("day", "days"))
    with translation.override(language):
        text = ngettext(one, other, grace)
    assert text != (one if grace == 1 else other), f"{language} has no translation for the abandon intro"
    return text


@pytest.mark.parametrize("language", ["pl", "de", "tr"])
def test_a_site_with_no_name_gets_whole_sentences_not_a_spliced_fragment(cleanup, language):
    """Placeholder slug: "your site" must not be glued into a sentence that needs a grammatical case
    (pl "Rozpocząłeś konfigurację twoja strona"), so each sentence is its own message."""
    grace = django_settings.WIZARD_ABANDON_DELETE_GRACE_DAYS
    tenant = _tenant({"locale": language, "site_locale": "en"})
    assert recovery.send_recovery_email(tenant)
    mail = DevOutboundEmail.objects.get(to=EMAIL)
    assert mail.subject == translated("Pick up where you left off — your site", language)
    assert translated(NO_NAME_RECOVERY_INTRO, language) in _body(mail)
    assert f"/{language}/signup/verify?token=" in mail.html

    DevOutboundEmail.objects.filter(to=EMAIL).delete()
    assert recovery.send_abandon_warning(tenant)
    mail = DevOutboundEmail.objects.get(to=EMAIL)
    assert mail.subject == translated("Your unfinished setup will be removed — your site", language)
    assert translated("Still want to build your site?", language) in _body(mail)
    assert (_abandon_intro(language, NO_NAME_ABANDON_INTRO) % {"grace": grace}) in _body(mail)
    assert f"/{language}/signup/verify?token=" in mail.html


@pytest.mark.parametrize("language", ["pl", "de", "tr"])
def test_a_named_site_still_fills_its_name_into_the_sentences(cleanup, language):
    grace = django_settings.WIZARD_ABANDON_DELETE_GRACE_DAYS
    brand = {"brand": "Lang Rec"}
    tenant = _tenant({"locale": language}, slug="lang-rec")
    assert recovery.send_recovery_email(tenant)
    mail = DevOutboundEmail.objects.get(to=EMAIL)
    assert mail.subject == translated("Pick up where you left off — %(brand)s", language) % brand
    assert translated(RECOVERY_INTRO, language) % brand in _body(mail)

    DevOutboundEmail.objects.filter(to=EMAIL).delete()
    assert recovery.send_abandon_warning(tenant)
    mail = DevOutboundEmail.objects.get(to=EMAIL)
    assert translated("Still want to build %(brand)s?", language) % brand in _body(mail)
    assert _abandon_intro(language, ABANDON_INTRO) % {**brand, "grace": grace} in _body(mail)


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
    assert NO_NAME_RECOVERY_INTRO in _body(mail)


def test_an_english_abandon_warning_is_unchanged(cleanup):
    tenant = _tenant({"locale": "en"})
    assert recovery.send_abandon_warning(tenant)
    mail = DevOutboundEmail.objects.get(to=EMAIL)
    assert mail.subject == "Your unfinished setup will be removed — your site"
    assert "Still want to build your site?" in _body(mail)
    grace = django_settings.WIZARD_ABANDON_DELETE_GRACE_DAYS
    expected = ABANDON_INTRO.format(days="day" if grace == 1 else "days") % {"brand": "your site", "grace": grace}
    assert expected in _body(mail)


@pytest.fixture()
def apex(restore_public):
    """A host on the public schema, as contentor.app is: no TenantConfig table behind it."""
    connection.set_schema_to_public()
    public, _created = Tenant.objects.get_or_create(
        schema_name="public",
        defaults={"name": "Public", "slug": "public", "owner_email": "root@x.test", "subdomain": "public"},
    )
    Domain.objects.get_or_create(domain=APEX, defaults={"tenant": public, "is_primary": True})


def _apex_magic_link(email=EMAIL, **extra):
    with mock.patch("apps.accounts.views.MagicLinkThrottle.allow_request", return_value=True):
        return APIClient(HTTP_HOST=APEX, **extra).post(MAGIC_LINK, {"email": email}, format="json")


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


def test_the_apex_sign_in_does_not_tell_a_known_address_from_an_unknown_one(apex, cleanup):
    User.objects.create(email=EMAIL, name="C", role="owner", preferred_locale="de")
    with mock.patch("apps.core.email.send_email", return_value=True):
        known = _apex_magic_link(EMAIL)
        unknown = _apex_magic_link("nobody@lang.test")
    assert (known.status_code, known.content) == (unknown.status_code, unknown.content)
    assert known.status_code == 200
