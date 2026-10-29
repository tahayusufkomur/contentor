"""Every AI entry point says which language it writes in (Task 2.1)."""

import inspect
from decimal import Decimal

import pytest
from pydantic import BaseModel

from apps.core import ai
from apps.core.languages import Mixed, rule


class _Out(BaseModel):
    ok: bool = True


@pytest.mark.parametrize(
    "fn", [ai.structured, ai.structured_stream, ai.structured_messages, ai.stream_text, ai.agentc_look]
)
def test_language_is_required(fn):
    param = inspect.signature(fn).parameters["language"]
    assert param.default is inspect.Parameter.empty
    assert param.kind is inspect.Parameter.KEYWORD_ONLY


def _capture(monkeypatch, settings):
    settings.AI_PROVIDER = "anthropic"
    seen = []

    def fake(system, *args, **kwargs):
        seen.append(system)
        return _Out(), Decimal("0"), "m"

    monkeypatch.setattr(ai, "_anthropic_structured", fake)
    return seen


def _call(language):
    ai.structured(system="Persona.", user="u", output_model=_Out, model="m", max_tokens=9, language=language)


def test_rule_is_appended_to_system(monkeypatch, settings):
    seen = _capture(monkeypatch, settings)
    _call("tr")
    assert seen[0] == "Persona.\n\n" + rule("tr")
    assert "Turkish" in seen[0]


def test_no_language_leaves_system_byte_identical(monkeypatch, settings):
    seen = _capture(monkeypatch, settings)
    _call(None)
    assert seen[0] == "Persona."


def test_the_rule_reaches_the_other_entry_points(monkeypatch, settings):
    seen = _capture(monkeypatch, settings)
    monkeypatch.setattr(ai, "_anthropic_structured_stream", lambda system, *a: iter([seen.append(system)]))
    monkeypatch.setattr(ai, "_stream_anthropic", lambda system, *a: iter([seen.append(system)]))
    list(ai.structured_stream(system="S.", user="u", output_model=_Out, model="m", max_tokens=9, language="de"))
    list(ai.stream_text(system="S.", history=[], model="m", max_tokens=9, language="pl"))
    assert [s.split("\n\n")[0] for s in seen] == ["S.", "S."]
    assert "German" in seen[0] and "Polish" in seen[1]


def test_agentc_look_appends_the_rule(monkeypatch, settings):
    settings.AI_PROVIDER = "agentc"
    prompts = []

    def fake_execute(prompt, label, deadline, model):
        prompts.append(prompt)
        return {"resultText": '{"ok": true}'}

    monkeypatch.setattr(ai, "_agentc_execute", fake_execute)
    ai.agentc_look(system="Look.", user="u", urls=["http://x/a.png"], output_model=_Out, label="l", language="tr")
    assert prompts[0].startswith("Look.\n\n" + rule("tr"))


def test_mixed_names_both_languages():
    r = rule(Mixed(creator="tr", site="en"))
    assert "Turkish" in r and "English" in r
    assert r.startswith("Talk to the creator in Turkish. Write every word that goes on their site in English.")


def test_mixed_carries_voice_and_terms_of_each_non_english_language():
    r = rule(Mixed(creator="de", site="pl"))
    assert "du" in r and "ty" in r and "Plattform" in r and "platforma" in r
    only_site = rule(Mixed(creator="en", site="tr"))
    assert "sen" in only_site and "du" not in only_site.split("Use these words")[0]


def test_rule_keeps_searches_english():
    assert "stay in English" in rule("pl")
    assert "stay in English" in rule(Mixed(creator="tr", site="de"))


def test_rule_carries_voice_and_terms():
    assert "du" in rule("de")
