from unittest import mock

import pytest
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"
URL = "/api/v1/admin/config/logo-suggestions/"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="coach@logosuggestiontest.com",
        name="Coach",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture()
def coach_client(coach):  # reuse the coach/owner auth fixture pattern from test_logo_studio.py
    client = APIClient(HTTP_HOST=HOST)
    client.force_authenticate(user=coach)
    return client


@pytest.fixture(autouse=True)
def _clear_rate_limit(tenant_ctx):
    """Reset the logo-suggestions rate-limit counter before/after every test.

    logo_suggestions() rate-limits on cache key f"logo-suggest:{schema_name}"
    with a 1-hour timeout. That key isn't touched by conftest's autouse
    _clear_rate_limits fixture (which only purges "ratelimit:*"/"*throttle*"
    patterns used by other limiters), and DB flushing between transaction=True
    tests never touches Redis. Without this, running this file twice in a row
    (e.g. during iterative TDD, without restarting Redis) leaves the counter
    at 10 from test_rate_limited_after_ten_calls and makes the next run's
    earlier tests see 429 instead of 200 -- mirrors the tenant-config-cache
    clearing convention _ensure_config uses in test_logo_studio.py.
    """
    cache.delete(f"logo-suggest:{tenant_ctx.schema_name}")
    yield
    cache.delete(f"logo-suggest:{tenant_ctx.schema_name}")


def _assert_valid_recipes(payload, count=4):
    assert len(payload["suggestions"]) >= count
    for recipe in payload["suggestions"]:
        assert recipe["version"] == 2
        assert recipe["layout"] in {"horizontal", "horizontal_reversed", "stacked", "name_only", "emblem"}
        assert recipe["badge"]["shape"] in {"none", "circle", "rounded", "squircle", "hexagon", "shield", "diamond"}
        assert recipe["mark"]["type"] in {"icon", "initials", "abstract"}
        assert recipe["colors"]["badge"]["type"] in {"solid", "linear", "radial"}
        assert recipe["typography"]["name"]["weight"] in {400, 500, 600, 700, 800}


@override_settings(ANTHROPIC_API_KEY="")
def test_fallback_suggestions_without_api_key(coach_client):
    resp = coach_client.post(URL, {}, format="json")
    assert resp.status_code == 200
    assert resp.data["source"] == "fallback"
    _assert_valid_recipes(resp.data)


@override_settings(ANTHROPIC_API_KEY="sk-test")
def test_ai_suggestions_are_validated_against_catalog(coach_client):
    fake_item = mock.Mock(
        layout="horizontal",
        mark_type="icon",
        icon="not-a-real-icon",
        initials_style="plain",
        abstract_family="orbits",
        badge_shape="circle",
        badge_outline=False,
        palette_id="not-a-palette",
        font="Comic Sans",
        weight=700,
        case="none",
        tracking=0.0,
        tagline="",
    )
    fake_parsed = mock.Mock(suggestions=[fake_item] * 8)
    fake_response = mock.Mock(parsed_output=fake_parsed)
    with mock.patch("apps.tenant_config.logo_ai._anthropic_client") as client_factory:
        client_factory.return_value.messages.parse.return_value = fake_response
        resp = coach_client.post(URL, {}, format="json")
    assert resp.status_code == 200
    assert resp.data["source"] == "ai"
    _assert_valid_recipes(resp.data, count=8)
    for recipe in resp.data["suggestions"]:
        # unknown icon -> catalog icon; unknown font -> Inter; unknown palette -> ink
        assert recipe["mark"]["icon"] != "not-a-real-icon"
        assert recipe["typography"]["name"]["font"] == "Inter"
        assert recipe["colors"]["palette_id"] == "ink"


@override_settings(ANTHROPIC_API_KEY="sk-test")
def test_api_error_falls_back(coach_client):
    with mock.patch("apps.tenant_config.logo_ai._anthropic_client") as client_factory:
        client_factory.return_value.messages.parse.side_effect = RuntimeError("boom")
        resp = coach_client.post(URL, {}, format="json")
    assert resp.status_code == 200
    assert resp.data["source"] == "fallback"


@override_settings(ANTHROPIC_API_KEY="sk-test")
def test_rate_limited_after_ten_ai_calls(coach_client):
    # Only the AI path consumes the hourly budget; the free deterministic
    # fallback is unlimited (see test_fallback_suggestions_are_not_rate_limited
    # in test_logo_studio.py). Drive the AI path with a mocked client so the
    # first 10 succeed and the 11th is throttled.
    cache.clear()
    fake_item = mock.Mock(
        layout="horizontal",
        mark_type="icon",
        icon="flower-2",
        initials_style="plain",
        abstract_family="orbits",
        badge_shape="circle",
        badge_outline=False,
        palette_id="ink",
        font="Inter",
        weight=700,
        case="none",
        tracking=0.0,
        tagline="",
    )
    fake_response = mock.Mock(parsed_output=mock.Mock(suggestions=[fake_item] * 4))
    with mock.patch("apps.tenant_config.logo_ai._anthropic_client") as client_factory:
        client_factory.return_value.messages.parse.return_value = fake_response
        for _ in range(10):
            assert coach_client.post(URL, {}, format="json").status_code == 200
        assert coach_client.post(URL, {}, format="json").status_code == 429
