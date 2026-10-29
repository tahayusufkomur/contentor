"""Task 2.3: the creator's words become English search terms before a Pix4Less query."""

from types import SimpleNamespace

import pytest
from django.core.cache import cache

from apps.core import ai as core_ai
from apps.core.onboarding import ai_curate
from apps.tenant_config import interview_brief


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
