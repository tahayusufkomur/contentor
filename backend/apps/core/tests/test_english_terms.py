"""Task 2.3: the creator's words become English search terms before a Pix4Less query."""

from types import SimpleNamespace

import pytest
from django.core.cache import cache

from apps.core import ai as core_ai
from apps.core.onboarding import ai_curate
from apps.tenant_config import interview_brief
from apps.tenant_config.models import TenantConfig


@pytest.fixture(autouse=True)
def _fresh_cache():
    cache.clear()


@pytest.fixture()
def model(monkeypatch):
    """A fake model that answers every call with `terms` and records what it was asked."""
    calls = []
    answer = {"terms": "face yoga exercises"}

    def fake(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(terms=answer["terms"]), 0, "fake"

    monkeypatch.setattr(core_ai, "structured", fake)
    return SimpleNamespace(calls=calls, answer=answer)


def test_english_is_returned_as_it_is_with_no_model_call(model):
    assert ai_curate.english_terms("yoga", language="en") == "yoga"
    assert model.calls == []


def test_turkish_words_go_out_as_the_faked_english(model):
    assert ai_curate.english_terms("yüz yogası", language="tr") == "face yoga exercises"
    assert len(model.calls) == 1 and model.calls[0]["language"] is None  # the answer is for a search, not a reader


def test_a_second_identical_call_is_a_cache_hit(model):
    first = ai_curate.english_terms("yüz yogası", language="tr")
    assert ai_curate.english_terms("  yüz   yogası ", language="tr") == first
    assert len(model.calls) == 1
    ai_curate.english_terms("yüz yogası", language="de")  # another language: its own entry
    assert len(model.calls) == 2


def test_a_failed_call_keeps_the_words_and_is_not_cached(monkeypatch):
    def broken(**kwargs):
        raise core_ai.AiError("down")

    monkeypatch.setattr(core_ai, "structured", broken)
    assert ai_curate.english_terms("yüz yogası", language="tr") == "yüz yogası"
    monkeypatch.setattr(core_ai, "structured", lambda **k: (SimpleNamespace(terms="face yoga"), 0, "fake"))
    assert ai_curate.english_terms("yüz yogası", language="tr") == "face yoga"


def test_photo_and_brief_queries_search_in_english(model):
    brief = ai_curate.CoachBrief(niche="yoga", subject="face yoga", description="yüz yogası", language="tr")
    model.answer["terms"] = "calm studio"
    assert ai_curate.photo_query(brief, "sakin stüdyo") == "face yoga calm studio"
    assert ai_curate.photo_query(brief) == "face yoga"  # nothing to translate: no call
    assert len(model.calls) == 1
    assert ai_curate.brief_query(brief).startswith("calm studio")
    english = ai_curate.CoachBrief(niche="yoga", subject="face yoga")
    assert ai_curate.photo_query(english, "calm studio") == "face yoga calm studio"
    assert len(model.calls) == 2  # the English brief made none


def test_subject_of_keeps_non_ascii_words_and_translates_on_request(model):
    answers = {"niche": "general", "teaches": "Yüz yogası öğretiyorum"}
    assert interview_brief.subject_of(answers) == "yüz yogası"
    model.answer["terms"] = "face yoga"
    assert interview_brief.subject_of(answers, language="tr") == "face yoga"
    assert interview_brief.subject_of({"niche": "general", "teaches": "boxing"}, language="en") == "boxing"


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize(
    ("creator", "site", "calls"),
    [("tr", "en", 1), ("en", "tr", 1), ("tr", "tr", 1), ("en", "en", 0)],
)
def test_the_creators_words_are_translated_from_the_language_she_wrote_in(tenant_ctx, model, creator, site, calls):
    from apps.accounts.models import User
    from apps.tenant_config.models import TenantConfig

    User.objects.create_user(email="o@words.test", name="O", password="x", role="owner", preferred_locale=creator)
    TenantConfig.objects.all().delete()
    TenantConfig.objects.create(brand_name="Glow", default_locale=site)
    tenant = SimpleNamespace(
        schema_name=tenant_ctx.schema_name,
        wizard_state={"answers": {"niche": "general", "teaches": "yüz yogası"}},
        name="Glow",
    )
    brief = ai_curate.CoachBrief.from_tenant(tenant)
    assert len(model.calls) == calls
    assert brief.subject == ("face yoga exercises" if calls else "yüz yogası")


def test_subject_of_keeps_a_capital_dotted_i_turkish_word_whole(model):
    for words, kept in (("İngilizce", "ingilizce"), ("İspanyolca dersi", "ispanyolca dersi"), ("İş", "iş")):
        assert interview_brief.subject_of({"niche": "general", "teaches": words}) == kept


@pytest.fixture()
def two_disciplines(monkeypatch, model):
    """ "yüz yogası, beslenme" with her focus answered; each word translates to its own English."""
    english = {"yüz yogası": "face yoga", "beslenme": "nutrition"}
    monkeypatch.setattr(interview_brief, "niche_for", lambda text: "general")
    monkeypatch.setattr(core_ai, "structured", lambda **k: (SimpleNamespace(terms=english[k["user"]]), 0, "fake"))
    return lambda mode: {"niche": "general", "teaches": "yüz yogası, beslenme", "discipline_focus": {"mode": mode}}


def test_every_discipline_of_a_focus_is_searched_in_english(two_disciplines):
    answers = two_disciplines("equal")
    assert interview_brief.focus_of(answers)["disciplines"] == ["yüz yogası", "beslenme"]  # her own words
    assert interview_brief.focus_of(answers, language="tr")["disciplines"] == ["face yoga", "nutrition"]
    assert interview_brief.subject_of(answers, language="tr") == "face yoga"  # the lead one
    assert interview_brief.subject_of(answers) == "yüz yogası"  # read as text: her words


def test_a_subject_that_is_already_its_niches_english_name_is_not_translated(monkeypatch, model):
    english = {"beslenme": "nutrition"}  # "yoga" is not in it: asking the model about it would raise
    monkeypatch.setattr(interview_brief, "niche_for", lambda text: "yoga" if "yoga" in text else "general")
    monkeypatch.setattr(core_ai, "structured", lambda **k: (SimpleNamespace(terms=english[k["user"]]), 0, "fake"))
    answers = {"niche": "yoga", "teaches": "yoga, beslenme", "discipline_focus": {"mode": "equal"}}
    assert interview_brief.focus_of(answers, language="tr")["disciplines"] == ["yoga", "nutrition"]


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("mode", ["equal", "primary"])
def test_the_page_says_her_words_and_the_searches_ask_in_english(tenant_ctx, two_disciplines, mode):
    from apps.core.onboarding import site_composer

    TenantConfig.objects.all().delete()
    TenantConfig.objects.create(brand_name="Glow", default_locale="tr")
    answers = two_disciplines(mode)
    if mode == "primary":
        answers["discipline_focus"] = {"mode": "primary", "primary": "yüz yogası"}
    tenant = SimpleNamespace(schema_name=tenant_ctx.schema_name, wizard_state={"answers": answers}, name="Glow")
    coach = site_composer._coach_data(tenant, "Glow")
    # What a visitor reads: her own words, in both modes.
    assert coach["topic"] == ("yüz yogası and beslenme" if mode == "equal" else "yüz yogası")
    assert coach["focus"]["disciplines"] == ["yüz yogası", "beslenme"]
    # What is searched: English.
    assert coach["search"] == {
        "topic": "face yoga and nutrition" if mode == "equal" else "face yoga",
        "topics": ["face yoga", "nutrition"],
    }
    ctx = site_composer._ctx(
        "general", "Glow", subject=coach["topic"], focus=coach["focus"], language="tr", search=coach["search"]
    )
    assert ctx["topic"] == coach["topic"] and ctx["also"] == ("" if mode == "equal" else "beslenme")
    assert ctx["search"] == coach["search"]["topic"] and ctx["topics"] == ("face yoga", "nutrition")
    queries = site_composer._queries({"subject": "class", "person": "", "action": "", "setting": ""}, ctx, "")
    assert all("yüz" not in q and "beslenme" not in q for q in queries) and queries[-1] == ctx["search"]


@pytest.mark.django_db(transaction=True)
def test_an_english_creators_coach_data_is_unchanged(tenant_ctx, monkeypatch, model):
    from apps.core.onboarding import site_composer

    TenantConfig.objects.all().delete()
    TenantConfig.objects.create(brand_name="Glow", default_locale="en")
    answers = {"niche": "general", "teaches": "yoga, nutrition", "discipline_focus": {"mode": "equal"}}
    tenant = SimpleNamespace(schema_name=tenant_ctx.schema_name, wizard_state={"answers": answers}, name="Glow")
    coach = site_composer._coach_data(tenant, "Glow")
    assert "search" not in coach and coach["topic"] == "yoga and nutrition"
