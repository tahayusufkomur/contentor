"""Task 2.3: a reel's captions and end card follow the site's language until she chooses another."""

from types import SimpleNamespace

import pytest

from apps.reels import moments, render
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)


def reel_of(spoken, options=None):
    return SimpleNamespace(video=SimpleNamespace(captions_language=spoken), options=options)


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


def test_the_end_card_speaks_the_site_language(tenant_ctx):
    site_in("pl")
    kit = {k: "" for k in ("look", "name", "site", "host", "logo")} | {"colors": {}, "language": "pl"}
    card = render.end_card_of(reel_of("ja"), kit)  # a spoken language the card has no line for
    assert card["line"] == render.END_LINES["pl"]
    assert render.end_card_of(reel_of("en"), kit)["line"] == render.END_LINES["pl"]  # default target = site


def test_the_pick_asks_for_the_covers_words_in_the_site_language():
    assert "language of the site" in moments.PICK_SYSTEM and "language of the transcript" not in moments.PICK_SYSTEM
