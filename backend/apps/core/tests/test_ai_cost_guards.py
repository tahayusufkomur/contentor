"""Answer cache (free repeat first-turn answers) + per-session daily cap."""

from decimal import Decimal

import pytest
from django.core.cache import cache

from apps.core import assistant

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _clean_cache():
    cache.clear()
    yield
    cache.clear()


def test_cache_key_normalizes_and_fingerprints():
    a = assistant.answer_cache_key("student_bot", "student", 2, "abc", "  What   COURSES? ")
    b = assistant.answer_cache_key("student_bot", "student", 2, "abc", "what courses?")
    c = assistant.answer_cache_key("student_bot", "student", 2, "OTHER", "what courses?")
    assert a == b != c and a.startswith("ai-answer:")


def test_cache_key_scope_isolates_otherwise_identical_keys():
    """Final-review hardening: the help bot's first-turn cache key must be
    scoped per tenant bucket, or Coach A's tenant-specific cached answer
    (account state, plan, setup progress) leaks to Coach B on an identical
    normalized first question. ``scope`` (e.g. the tenant schema / marketing
    bucket) must change the key even when every other component matches."""
    a = assistant.answer_cache_key("help_bot", "coach", 3, "fp", "what should I set up next?", scope="tenant-a")
    b = assistant.answer_cache_key("help_bot", "coach", 3, "fp", "what should I set up next?", scope="tenant-b")
    same = assistant.answer_cache_key("help_bot", "coach", 3, "fp", "what should I set up next?", scope="tenant-a")
    assert a != b
    assert a == same
    # Backward-compatible default: omitting scope must not raise.
    assert assistant.answer_cache_key("student_bot", "student", 2, "abc", "hi").startswith("ai-answer:")


def test_replay_cached_contract():
    seen = {}
    frames = list(
        assistant.replay_cached(
            {"answer": "cached!", "suggestions": ["more?"], "model": "m"},
            lambda info: seen.update(info) or {"transcript_id": 9},
        )
    )
    assert seen["provider"] == "cache" and seen["cost_usd"] == Decimal("0")
    assert '"cached!"' in frames[0] and '"transcript_id": 9' in frames[-1]


def test_session_daily_cap(settings):
    settings.ASSISTANT_SESSION_DAILY_QUESTIONS = 3
    assert not any(assistant.session_over_daily_cap("s1") for _ in range(3))
    assert assistant.session_over_daily_cap("s1") is True
    assert assistant.session_over_daily_cap("other") is False
    assert assistant.session_over_daily_cap("") is False
