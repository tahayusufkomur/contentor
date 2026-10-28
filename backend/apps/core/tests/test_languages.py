import pytest
from django.core.exceptions import ImproperlyConfigured
from django.test import override_settings
from django.utils import translation

from apps.accounts.models import User
from apps.core import languages
from apps.core.constants import LOCALE_CHOICES
from apps.tenant_config.models import TenantConfig
from config.celery import task_prerun
from config.settings.base import _env_locales

pytestmark = pytest.mark.django_db(transaction=True)


def test_the_list():
    assert languages.CODES == ("en", "tr", "de", "pl")
    assert dict(LOCALE_CHOICES)["pl"] == "Polish"
    assert languages.info("tr")["native"] == "Türkçe"


@override_settings(ENABLED_LOCALES=["en", "tr"])
def test_resolve():
    assert [languages.resolve(c) for c in ("tr", "de", "xx", None, "")] == ["tr", "en", "en", "en", "en"]


def _set_site(locale):
    TenantConfig.objects.all().delete()
    TenantConfig.objects.create(brand_name="Studio", default_locale=locale)


def test_site_language_follows_the_tenant_config(tenant_ctx):
    _set_site("tr")
    assert languages.site_language() == "tr"
    with override_settings(ENABLED_LOCALES=["en"]):
        assert languages.site_language() == "en"


def test_site_language_of_a_given_tenant(tenant_ctx):
    _set_site("de")
    assert languages.site_language(tenant_ctx) == "de"


def test_site_language_in_the_public_schema_is_english(restore_public):
    assert languages.site_language() == "en"


def test_creator_language_reads_the_row_then_the_owner(tenant_ctx):
    owner = User.objects.create_user(email="o@example.com", password="x", role="owner", preferred_locale="de")
    assert languages.creator_language() == "de"
    assert languages.creator_language(owner) == "de"
    owner.preferred_locale = ""
    owner.save()
    assert languages.creator_language() == "en"
    owner.delete()
    assert languages.creator_language() == "en"


def test_task_starts_in_english_after_a_turkish_task():
    translation.activate("tr")
    try:
        task_prerun.send(sender=None, task_id="t", task=None)
        assert translation.get_language() == "en"
    finally:
        translation.deactivate()


def test_env_locales():
    assert _env_locales("tr, de") == ["en", "tr", "de"]
    assert _env_locales("") == ["en"]
    with pytest.raises(ImproperlyConfigured):
        _env_locales("xx")


def test_settings_languages_are_the_enabled_pairs(settings):
    assert settings.ENABLED_LOCALES == ["en", "tr", "de", "pl"]
    assert [c for c, _ in settings.LANGUAGES] == settings.ENABLED_LOCALES


def test_in_site_language_runs_in_the_site_language_and_leaves_it_after(tenant_ctx):
    _set_site("tr")

    @languages.in_site_language
    def now():
        return translation.get_language()

    with translation.override("en"):
        assert now() == "tr"
        assert translation.get_language() == "en"  # the caller's language is back


def test_in_site_language_restores_the_language_after_an_exception(tenant_ctx):
    _set_site("tr")

    @languages.in_site_language
    def fails():
        raise RuntimeError("boom")

    with translation.override("de"):
        with pytest.raises(RuntimeError):
            fails()
        assert translation.get_language() == "de"


def test_in_site_language_nests_and_looks_the_language_up_once(tenant_ctx, django_assert_num_queries):
    _set_site("tr")

    @languages.in_site_language
    def inner():
        return translation.get_language()

    @languages.in_site_language
    def outer():
        return [inner(), inner(), translation.get_language()]

    with django_assert_num_queries(1):  # one TenantConfig read for the outer call, none for the nested ones
        assert outer() == ["tr", "tr", "tr"]

    @languages.in_site_language
    def switch():
        with translation.override("de"):  # a language changed inside is not the site's: entered again
            return inner()

    assert switch() == "tr"


def test_outside_the_decorator_it_is_english_again(tenant_ctx):
    _set_site("tr")
    translation.deactivate()
    languages.in_site_language(lambda: None)()
    assert translation.gettext("Unsubscribe") == "Unsubscribe"
