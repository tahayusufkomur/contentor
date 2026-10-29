"""Task 2.2: the AI caches key on the language the answer is written in, so a Turkish answer or
look sample is never replayed on an English site (Review Focus #3)."""

import json
from decimal import Decimal
from unittest import mock

import pytest
from django.core.cache import cache

from apps.core import assistant
from apps.tenant_config import help_bot, look_copy, student_bot
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)

QUESTION = "what should I set up next?"
MONTH = "2026-10"


def _model(calls):
    def fake_stream(**kwargs):
        calls.append(kwargs["language"])
        yield ("delta", "answer")
        yield ("done", {"cost_usd": Decimal("0.001"), "provider": "anthropic", "model": "m"})

    return fake_stream


def _set_site_language(code):
    TenantConfig.objects.all().delete()
    TenantConfig.objects.create(brand_name="Glow", default_locale=code)


def _ask_help_bot(language):
    history = [{"role": "user", "content": QUESTION}]
    list(
        help_bot.sse_events(
            list(history), "visitor", "__marketing__", MONTH, question=QUESTION, session_id="s", language=language
        )
    )


def _ask_student_bot(tenant, code):
    _set_site_language(code)
    history = [{"role": "user", "content": QUESTION}]
    list(student_bot.sse_events(history, tenant, MONTH, question=QUESTION, session_id="s"))


def _write_look_copy(tenant, code):
    _set_site_language(code)
    languages = []

    def fake(**kwargs):
        languages.append(kwargs["language"])
        return look_copy.LookCopy(), Decimal("0"), "m"

    with (
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.onboarding.ai_compose.record_spend"),
        mock.patch("apps.core.ai.structured", side_effect=fake),
    ):
        look_copy.for_tenant(tenant, {"teaches": "Yoga", "audience": "Desk workers"})
    return languages


@pytest.mark.parametrize("cache_user", ["help_bot", "student_bot", "look_copy"])
def test_cache_key_carries_language(cache_user, tenant_ctx, monkeypatch):
    """Same input, tr then en: two keys, two model calls; tr again is a hit."""
    cache.clear()
    calls = []
    monkeypatch.setattr(assistant.core_ai, "stream_text", _model(calls))
    if cache_user == "help_bot":
        _ask_help_bot("tr")
        _ask_help_bot("en")
        _ask_help_bot("tr")
    elif cache_user == "student_bot":
        _ask_student_bot(tenant_ctx, "tr")
        _ask_student_bot(tenant_ctx, "en")
        _ask_student_bot(tenant_ctx, "tr")
    else:
        calls = _write_look_copy(tenant_ctx, "tr") + _write_look_copy(tenant_ctx, "en")
        assert _write_look_copy(tenant_ctx, "tr") == []  # cached
    assert calls == ["tr", "en"]


def test_the_answer_key_differs_by_language_only():
    key = lambda lang: assistant.answer_cache_key("help_bot", "coach", 4, "fp", "hi", scope="s", language=lang)  # noqa: E731
    assert key("tr") != key("en") and key("tr") == key("tr")


def test_name_check_keys_carry_the_language(restore_public):
    from apps.core.onboarding import name_check

    seen = []
    with (
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.onboarding.ai_compose.record_spend"),
        mock.patch("django.core.cache.cache.get", return_value=None),
        mock.patch("django.core.cache.cache.set", side_effect=lambda key, *a, **k: seen.append(key)),
        mock.patch("apps.core.ai.structured", return_value=(name_check.NameIdeas(names=["A"]), Decimal("0"), "m")),
    ):
        name_check.ideas("yoga", language="tr")
        name_check.ideas("yoga", language="en")
    assert len(set(seen)) == 2 and json.dumps(seen)
