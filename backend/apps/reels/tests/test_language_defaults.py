"""Task 2.3: a reel's captions and end card follow the site's language until she chooses another."""

from types import SimpleNamespace

import pytest

from apps.reels import moments, render
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def _no_site_config_left_behind(tenant_ctx):
    yield
    TenantConfig.objects.all().delete()


def reel_of(spoken, options=None, translation=None):
    return SimpleNamespace(
        video=SimpleNamespace(captions_language=spoken, s3_key="v.mp4"),
        options=options,
        translation=translation,
        start=0,
        end=9,
        edits=None,
    )


def site_in(locale):
    TenantConfig.objects.all().delete()
    TenantConfig.objects.create(brand_name="Glow", default_locale=locale)


def test_english_speech_on_a_german_site_defaults_the_captions_to_german(tenant_ctx):
    site_in("de")
    assert render.options_of(reel_of("en"))["language"] == "de"


def test_speech_in_the_sites_language_needs_no_translation(tenant_ctx):
    site_in("de")
    assert render.options_of(reel_of("de"))["language"] == ""
    assert render.options_of(reel_of(""))["language"] == ""  # no transcript language yet


def test_her_choice_wins_even_as_spoken(tenant_ctx):
    site_in("de")
    assert render.options_of(reel_of("en", {"language": ""}))["language"] == ""
    assert render.options_of(reel_of("en", {"language": "fr"}))["language"] == "fr"


def test_an_english_site_changes_nothing(tenant_ctx):
    site_in("en")
    assert render.options_of(reel_of("tr"))["language"] == "en"
    assert render.options_of(reel_of("en"))["language"] == ""


def test_the_end_card_speaks_the_captions_language_and_falls_back_to_the_sites(tenant_ctx):
    site_in("pl")
    kit = {k: "" for k in ("look", "name", "site", "host", "logo")} | {"colors": {}, "language": "pl"}
    # A spoken language the card has no line for: the site's (by the default target or by her "as spoken").
    assert render.end_card_of(reel_of("ja"), kit)["line"] == render.END_LINES["pl"]
    assert render.end_card_of(reel_of("ja", {"language": ""}), kit)["line"] == render.END_LINES["pl"]
    assert render.end_card_of(reel_of("", {"language": ""}), kit)["line"] == render.END_LINES["pl"]
    # No translation yet: the captions are as spoken, and so is the card. With one, both are in its language.
    assert render.end_card_of(reel_of("en"), kit)["line"] == render.END_LINES["en"]
    translated = reel_of("en")
    translated.translation = {"language": "pl", "groups": [], "of": render.translation_key(translated)}
    assert render.caption_language(translated) == "pl"
    assert render.end_card_of(translated, kit)["line"] == render.END_LINES["pl"]


def test_the_pick_asks_for_the_covers_words_in_the_site_language():
    assert "language of the site" in moments.PICK_SYSTEM and "language of the transcript" not in moments.PICK_SYSTEM
