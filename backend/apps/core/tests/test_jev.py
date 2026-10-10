"""apps.core.jev: Jev only fills what the keyword tables miss, and any doubt or
failure leaves the caller's own answer."""

import uuid
from unittest import mock

import requests

from apps.core import jev
from apps.tenant_config import interview_brief as brief


def _answer(choice, confidence):
    resp = mock.Mock()
    resp.json.return_value = {"answers": {"pick": {"type": "choice", "choice": choice, "confidence": confidence}}}
    return resp


def _text(words):
    return f"{words} {uuid.uuid4().hex}"  # a fresh cache key per test


def test_no_key_never_calls(settings):
    settings.TYPESAFE_API_KEY = ""
    with mock.patch.object(jev.requests, "post") as post:
        assert brief.niche_for(_text("capoeira roda")) == "general"
    post.assert_not_called()


def test_keyword_match_skips_jev(settings):
    settings.TYPESAFE_API_KEY = "k"
    with mock.patch.object(jev.requests, "post") as post:
        assert brief.niche_for("vinyasa yoga") == "yoga"
    post.assert_not_called()


def test_jev_fills_a_keyword_miss(settings):
    settings.TYPESAFE_API_KEY = "k"
    with mock.patch.object(jev.requests, "post", return_value=_answer("martial_arts", 0.9)):
        assert brief.niche_for(_text("capoeira roda")) == "martial_arts"


def test_unsure_none_or_failed_keeps_general(settings):
    settings.TYPESAFE_API_KEY = "k"
    for result in (_answer("dance", 0.3), _answer("none", 0.95), requests.Timeout()):
        kw = {"side_effect": result} if isinstance(result, Exception) else {"return_value": result}
        with mock.patch.object(jev.requests, "post", **kw):
            assert brief.niche_for(_text("something odd")) == "general"


def test_brand_tile_needs_high_confidence(settings):
    settings.TYPESAFE_API_KEY = "k"
    with mock.patch.object(jev.requests, "post", return_value=_answer("Dance", 0.7)):
        assert brief.tile_of_brand(_text("Studio Salsero")) is None
    with mock.patch.object(jev.requests, "post", return_value=_answer("Dance", 0.9)):
        assert brief.tile_of_brand(_text("Studio Salsero")) == "Dance"


def test_every_niche_has_a_meaning():
    assert set(brief._NICHE_MEANS) == {niche for niche, _ in brief._NICHE_WORDS}
