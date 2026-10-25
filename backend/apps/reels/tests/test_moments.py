"""Picking a video's moments: the model's picks checked and fitted to whole sentences, and the plain rule
that stands in for the model."""

from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

import pytest

from apps.core import ai as core_ai
from apps.reels import moments
from apps.reels import words as w


def talk(sentences: int = 12, seconds: float = 8.0, pause: float = 0.4) -> list[tuple]:
    """Sentences of eight words, `seconds` long each, `pause` apart."""
    out, t = [], 0.0
    for s in range(sentences):
        step = seconds / 8
        for i in range(8):
            text = f" s{s}w{i}" + ("." if i == 7 else "")
            out.append((round(t, 3), round(t + step * 0.9, 3), text))
            t += step
        t += pause
    return out


def video_of(words) -> SimpleNamespace:
    return SimpleNamespace(pk=1, title="Lesson", captions_language="en", captions_words=[list(x) for x in words])


class TestFit:
    def test_runs_grow_to_twenty_seconds_and_shrink_under_the_limit(self):
        sents = w.sentences(talk())
        first, last = moments._fit(sents, 0, 0)
        assert sents[last]["end"] - sents[first]["start"] >= moments.TARGET
        first, last = moments._fit(sents, 0, 11)
        assert sents[last]["end"] - sents[first]["start"] <= moments.MAX
        assert moments._fit(w.sentences(talk(sentences=1)), 0, 0) is None  # 8 s: too short for a reel


class TestRule:
    def test_moments_never_overlap_each_other_or_what_is_taken(self):
        sents = w.sentences(talk(sentences=30))
        taken = [(0.0, 60.0)]
        picked = moments.by_rule(sents, 3, taken)
        assert len(picked) == 3
        spans = sorted((m["start"], m["end"]) for m in picked)
        assert not any(moments._overlaps(a, b, 0.0, 60.0) for a, b in spans)
        assert not any(moments._overlaps(*x, *y) for x, y in zip(spans, spans[1:], strict=False))
        assert all(moments.MIN <= b - a <= moments.MAX + 1 for a, b in spans)
        assert picked[0]["title"].startswith("s")


class TestModel:
    def _picks(self, *picks):
        return moments.Picks(moments=[moments.Pick(**p) for p in picks])

    def test_the_models_picks_are_checked_and_fitted(self, settings):
        sents = w.sentences(talk(sentences=20))
        picks = self._picks(
            {
                "first": 0,
                "last": 3,
                "title": '"Stop doing this" #yoga',
                "caption": "Tip. #yoga",
                "score": 9,
                "photos": [{"sentence": 1, "query": "yoga mat"}, {"sentence": 15, "query": "outside the moment"}],
            },
            {"first": 2, "last": 5, "title": "Overlaps the first", "score": 8},
            {"first": 30, "last": 31, "title": "Out of range", "score": 10},
            {"first": 10, "last": 13, "title": "Second", "score": 7},
        )
        found = moments._accept(picks.moments, sents, 3, [])
        assert [m["title"] for m in found] == ["Stop doing this", "Second"]
        assert found[0]["ideas"] == [{"at": sents[1]["start"], "query": "yoga mat"}]
        assert found[0]["start"] == pytest.approx(max(0.0, sents[0]["start"] - moments.LEAD))

    def test_pick_asks_the_model_and_falls_back_to_the_rule(self):
        video = video_of(talk(sentences=20))
        answer = self._picks({"first": 0, "last": 3, "title": "Hook", "score": 9})
        with (
            mock.patch("apps.reels.moments.ai_compose.compose_available", return_value=True),
            mock.patch("apps.reels.moments.ai_compose.record_spend") as spend,
            mock.patch("apps.reels.moments.core_ai.structured", return_value=(answer, Decimal("0.01"), "m")) as asked,
        ):
            found = moments.pick(video, 2)
        assert [m["title"] for m in found] == ["Hook"]
        assert '"count": 2' in asked.call_args.kwargs["user"]
        spend.assert_called_once()
        with (
            mock.patch("apps.reels.moments.ai_compose.compose_available", return_value=True),
            mock.patch("apps.reels.moments.ai_compose.record_spend"),
            mock.patch("apps.reels.moments.core_ai.structured", side_effect=core_ai.AiError("down")),
        ):
            assert len(moments.pick(video, 2)) == 2  # by rule
        with mock.patch("apps.reels.moments.ai_compose.compose_available", return_value=False):
            assert len(moments.pick(video, 2)) == 2

    def test_a_translation_keeps_one_line_for_each(self):
        with (
            mock.patch("apps.reels.moments.ai_compose.compose_available", return_value=True),
            mock.patch("apps.reels.moments.ai_compose.record_spend"),
            mock.patch(
                "apps.reels.moments.core_ai.structured",
                return_value=(moments.Lines(lines=['"Hallo"', "Welt"]), Decimal("0"), "m"),
            ),
        ):
            assert moments.translate(["Hello", "world"], "de") == ["Hallo", "Welt"]
        with (
            mock.patch("apps.reels.moments.ai_compose.compose_available", return_value=True),
            mock.patch("apps.reels.moments.ai_compose.record_spend"),
            mock.patch(
                "apps.reels.moments.core_ai.structured", return_value=(moments.Lines(lines=["eins"]), Decimal("0"), "m")
            ),
            pytest.raises(moments.TranslationError),
        ):
            moments.translate(["Hello", "world"], "de")
