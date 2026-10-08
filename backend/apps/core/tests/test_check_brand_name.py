"""check-brand-name: pre-wizard step 1 availability check (no token minted,
no email sent — mirrors creator_signup's own slug-availability check)."""

import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db(transaction=True)

CHECK_URL = "/api/v1/onboarding/check-brand-name/"
SHARED_DOMAIN = "shared-test.localhost"


def _client(**extra):
    return APIClient(HTTP_HOST=SHARED_DOMAIN, **extra)


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
        assert name_check.review("Yogga Studio") == {"typo_fix": "", "suggestions": ["Flow House"]}
    with (
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.onboarding.ai_compose.record_spend"),
        mock.patch("django.core.cache.cache.get", return_value=None),
        mock.patch("apps.core.ai.structured", side_effect=core_ai.AiError("down")),
    ):
        assert name_check.review("Other Name") == {"typo_fix": "", "suggestions": []}
