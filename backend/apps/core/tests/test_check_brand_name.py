"""check-brand-name: is a site name free (no token minted, no email sent)?
/setup's name question asks it before the name is sent."""

import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db(transaction=True)

CHECK_URL = "/api/v1/onboarding/check-brand-name/"


def _client(**extra):
    return APIClient(HTTP_HOST="localhost", **extra)


def test_available_brand_name_returns_true(restore_public):
    resp = _client().post(CHECK_URL, {"brand_name": "Totally Unique Studio Name"}, format="json")
    assert resp.status_code == 200
    assert resp.json() == {"available": True}


def test_taken_brand_name_returns_false(restore_public):
    # restore_public's shared tenant has slug "shared-test"; "Shared Test"
    # slugifies to exactly that.
    resp = _client().post(CHECK_URL, {"brand_name": "Shared Test"}, format="json")
    assert resp.status_code == 200
    data = resp.json()
    assert data["available"] is False
    assert data["detail"]  # localized brand_taken message, non-empty


def test_reserved_and_temporary_addresses_are_never_free(restore_public):
    for name in ("Admin", "new-site-abc123"):
        assert _client().post(CHECK_URL, {"brand_name": name}, format="json").json()["available"] is False


def test_blank_brand_name_returns_400(restore_public):
    resp = _client().post(CHECK_URL, {"brand_name": "   "}, format="json")
    assert resp.status_code == 400


def test_missing_brand_name_returns_400(restore_public):
    resp = _client().post(CHECK_URL, {}, format="json")
    assert resp.status_code == 400


def test_check_brand_name_is_throttled(restore_public):
    # Mirrors test_signup_throttle.py's pattern exactly: use the real
    # configured rate (30/min) rather than overriding it — one call over
    # the limit within the same minute must 429.
    client = _client()
    statuses = [client.post(CHECK_URL, {"brand_name": f"Brand {i}"}, format="json").status_code for i in range(31)]
    assert statuses[:30] == [s for s in statuses[:30] if s != 429]
    assert 429 in statuses, f"expected a 429 within 31 rapid calls, got {statuses}"


def test_review_offers_a_typo_fix_and_only_free_alternatives(restore_public):
    from unittest import mock

    from apps.core.onboarding import name_check

    found = {"typo_fix": "Yoga Studio Nova", "suggestions": ["Shared Test", "Nova Yoga House"]}
    with mock.patch.object(name_check, "review", return_value=found) as review:
        resp = _client().post(CHECK_URL, {"brand_name": "Yogga Studio Nova", "review": True}, format="json")
        plain = _client().post(CHECK_URL, {"brand_name": "Yogga Studio Nova"}, format="json")
    assert resp.json() == {"available": True, "typo_fix": "Yoga Studio Nova", "suggestions": ["Nova Yoga House"]}
    assert plain.json() == {"available": True} and review.call_count == 1  # no review asked, no AI call


def test_review_parses_the_models_answer_and_fails_soft():
    from decimal import Decimal
    from unittest import mock

    from apps.core import ai as core_ai
    from apps.core.onboarding import name_check

    reply = name_check.NameReview(
        typo_fix="yogga studio", suggestions=["Yogga Studio", "Flow House", " ", "Flow House"]
    )
    with (
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.onboarding.ai_compose.record_spend"),
        mock.patch("django.core.cache.cache.get", return_value=None),
        mock.patch("apps.core.ai.structured", return_value=(reply, Decimal("0"), "m")),
    ):
        # A "fix" that only changes case is no fix; the name itself and repeats are dropped.
        assert name_check.review("Yogga Studio", language="en") == {"typo_fix": "", "suggestions": ["Flow House"]}
    with (
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.onboarding.ai_compose.record_spend"),
        mock.patch("django.core.cache.cache.get", return_value=None),
        mock.patch("apps.core.ai.structured", side_effect=core_ai.AiError("down")),
    ):
        assert name_check.review("Other Name", language="en") == {"typo_fix": "", "suggestions": []}


def test_ideas_mode_returns_only_free_names(restore_public):
    from unittest import mock

    from apps.core.onboarding import name_check

    with mock.patch.object(name_check, "ideas", return_value=["Shared Test", "Flow Yoga with Anna"]) as ideas:
        resp = _client().post(CHECK_URL, {"ideas": "yoga for runners", "first_name": "Anna"}, format="json")
        bad = _client().post(CHECK_URL, {"ideas": ["x"]}, format="json")
    assert resp.status_code == 200 and resp.json() == {"ideas": ["Flow Yoga with Anna"]}
    ideas.assert_called_once_with("yoga for runners", "Anna", language="en")
    assert bad.status_code == 400


def test_ideas_parse_cap_and_fail_soft():
    from decimal import Decimal
    from unittest import mock

    from apps.core import ai as core_ai
    from apps.core.onboarding import name_check

    reply = name_check.NameIdeas(names=["Flow House", " ", "flow house", "A", "B", "C", "D", "E"])
    base = [
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.onboarding.ai_compose.record_spend"),
        mock.patch("django.core.cache.cache.get", return_value=None),
        mock.patch("django.core.cache.cache.set"),
    ]
    with (
        base[0],
        base[1],
        base[2],
        base[3],
        mock.patch("apps.core.ai.structured", return_value=(reply, Decimal("0"), "m")) as structured,
    ):
        # Blanks and repeats dropped, at most five kept; the oversized topic is cut before the prompt.
        assert name_check.ideas("x" * 500, "Anna", language="en") == ["Flow House", "A", "B", "C", "D"]
        sent = structured.call_args.kwargs["user"]
        assert "Anna" in sent and len(sent) < name_check.TOPIC_MAX + 100
    with base[0], base[1], base[2], mock.patch("apps.core.ai.structured", side_effect=core_ai.AiError("down")):
        assert name_check.ideas("yoga", language="en") == []
    with mock.patch("apps.core.ai.structured") as structured:
        assert name_check.ideas("   ", language="en") == []  # nothing to ask about, no AI call
        structured.assert_not_called()


def test_a_turkish_page_gets_turkish_suggestions_and_its_own_cache_entries(restore_public):
    """The endpoint runs in the public schema: the language is the page's, not a tenant's."""
    from decimal import Decimal
    from unittest import mock

    from django.core.cache import cache

    from apps.core.onboarding import name_check

    cache.clear()
    asked = []

    def fake(**kwargs):
        asked.append(kwargs["language"])
        model = kwargs["output_model"]
        return model(names=["Flow House"]) if model is name_check.NameIdeas else model(), Decimal("0"), "m"

    with (
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.onboarding.ai_compose.record_spend"),
        mock.patch("apps.core.ai.structured", side_effect=fake),
    ):
        for path, body in (("ideas", {"ideas": "yoga"}), ("review", {"brand_name": "Yogga Studio", "review": True})):
            asked.clear()
            _client(HTTP_ACCEPT_LANGUAGE="tr").post(CHECK_URL, body, format="json")
            _client(HTTP_ACCEPT_LANGUAGE="en").post(CHECK_URL, body, format="json")
            _client(HTTP_ACCEPT_LANGUAGE="tr").post(CHECK_URL, body, format="json")  # a cache hit
            assert asked == ["tr", "en"], path
