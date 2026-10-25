"""The pure parts of a reel: sentences and cut pauses (words), the window that follows a face (framing), and
the captions file (ass)."""

from types import SimpleNamespace

import pytest

from apps.reels import ass, framing
from apps.reels import words as w

# "Hello there. Do this now?" then a long pause, then "Yes."
WORDS = [
    (1.0, 1.4, " Hello"),
    (1.4, 1.9, " there."),
    (2.0, 2.3, " Do"),
    (2.3, 2.6, " this"),
    (2.6, 3.0, " now?"),
    (5.0, 5.5, " Yes."),
]


class TestWords:
    def test_sentences_end_at_full_stops_questions_and_long_silences(self):
        found = w.sentences(WORDS)
        assert [s["text"] for s in found] == ["Hello there.", "Do this now?", "Yes."]
        assert (found[1]["start"], found[1]["end"], found[1]["first"], found[1]["last"]) == (2.0, 3.0, 2, 4)
        no_stops = [(i * 0.5, i * 0.5 + 0.4, " word") for i in range(3)] + [(4.0, 4.4, " after")]
        assert [s["text"] for s in w.sentences(no_stops)] == ["word word word", "after"]

    def test_malformed_words_are_left_out(self):
        video = SimpleNamespace(captions_words=[[0, 1, " ok"], ["x", 1, " bad"], [2, 1, " backwards"], [3, 4]])
        assert w.words_of(video) == [(0.0, 1.0, " ok")]

    def test_a_long_pause_is_cut_down_to_a_little_either_side_on_whole_frames(self):
        spans = w.keep(WORDS, 0.9, 5.8)
        frame = 1 / w.FPS + 0.001
        assert len(spans) == 2
        assert spans[0][0] == 0.0 and spans[0][1] == pytest.approx(3.0 + w.PAD - 0.9, abs=frame)
        assert spans[1] == [pytest.approx(5.0 - w.PAD - 0.9, abs=frame), 4.9]
        assert all(abs(t * w.FPS - round(t * w.FPS)) < 0.05 for span in spans for t in span)
        assert w.keep(WORDS, 0.9, 5.8, cut=False) == [[0.0, 4.9]]

    def test_video_times_on_the_reels_clock(self):
        spans = w.keep(WORDS, 0.9, 5.8)
        after_cut = round(spans[0][1] + (5.0 - 0.9) - spans[1][0], 3)
        assert w.on_reel(1.0, 0.9, spans) == 0.1
        assert w.on_reel(4.0, 0.9, spans) is None  # in the cut
        assert w.on_reel(5.0, 0.9, spans) == after_cut
        reel_words = w.reel_words(WORDS, 0.9, 5.8, spans)
        assert reel_words[-1][0] == after_cut
        assert all(e >= s for s, e, _t in reel_words)
        assert w.length_of(spans) == pytest.approx(spans[0][1] + spans[1][1] - spans[1][0], abs=0.001)


class TestFraming:
    def _reel(self, samples, layout="auto", width=1920, height=1080):
        faces = {"from": 0.0, "to": 20.0, "width": width, "height": height, "samples": samples}
        return SimpleNamespace(start=2.0, end=12.0, layout=layout, faces=faces)

    def test_the_window_holds_still_while_the_face_stays_near_its_centre(self):
        samples = [[i * 0.25, [[0.45, 0.3, 0.1, 0.2, 0.9]]] for i in range(80)]
        found = framing.frame_of(self._reel(samples))
        assert found["layout"] == "crop"
        assert found["keys"] == [[0.0, 0.5]]

    def test_the_window_follows_a_face_that_moves_away(self):
        samples = [[i * 0.25, [[0.15 if i < 30 else 0.6, 0.3, 0.1, 0.2, 0.9]]] for i in range(80)]
        keys = framing.frame_of(self._reel(samples))["keys"]
        assert keys[0][1] < 0.25 and keys[-1][1] == 0.65
        assert keys[-1][0] - keys[-2][0] == pytest.approx(framing.PAN)

    def test_a_stray_detection_does_not_move_the_window(self):
        samples = [[i * 0.25, [[0.45, 0.3, 0.1, 0.2, 0.9]]] for i in range(80)]
        samples[40] = [10.0, [[0.05, 0.3, 0.1, 0.2, 0.9]]]
        assert framing.frame_of(self._reel(samples))["keys"] == [[0.0, 0.5]]

    def test_no_faces_shows_the_whole_frame_and_no_scan_the_middle(self):
        assert framing.frame_of(self._reel([[i * 0.25, []] for i in range(80)]))["layout"] == "fit"
        unscanned = SimpleNamespace(start=2.0, end=12.0, layout="auto", faces={})
        assert framing.frame_of(unscanned) == {"layout": "crop", "keys": [[0.0, 0.5]], "share": 0.3164}

    def test_the_coachs_choice_wins_and_a_vertical_video_needs_no_window(self):
        samples = [[i * 0.25, [[0.1, 0.3, 0.1, 0.2, 0.9]]] for i in range(80)]
        assert framing.frame_of(self._reel(samples, layout="center"))["keys"] == [[0.0, 0.5]]
        assert framing.frame_of(self._reel(samples, layout="fit"))["layout"] == "fit"
        assert framing.frame_of(self._reel(samples, width=1080, height=1920))["share"] == 1.0

    def test_a_scan_covers_a_reel_only_inside_its_range(self):
        reel = self._reel([])
        assert framing.scanned(reel)
        reel.end = 25.0
        assert not framing.scanned(reel)


COLORS = {"primary": "#c2410c", "primaryForeground": "#ffffff", "accent": "#a3e635"}


class TestCaptions:
    def test_each_word_lights_up_in_turn_within_its_group(self):
        text = ass.build(words=[(0.1, 0.5, " Hello"), (0.5, 1.0, " there.")], length=2.0, style="bold", colors=COLORS)
        lines = [line for line in text.splitlines() if line.startswith("Dialogue")]
        lit = r"{\c&H35E6A3&\fscx112\fscy112}"
        assert lines == [
            rf"Dialogue: 1,0:00:00.10,0:00:00.50,Caption,,0,0,0,,{{\fad(60,0)}}{lit}HELLO{{\r}} THERE.",
            rf"Dialogue: 1,0:00:00.50,0:00:01.50,Caption,,0,0,0,,HELLO {lit}THERE.{{\r}}",
        ]

    def test_groups_break_at_sentences_pauses_and_size(self):
        words = [(0, 0.2, " One."), (0.2, 0.4, " Two"), (1.0, 1.2, " three"), (1.2, 1.4, " four"), (1.4, 1.6, " five")]
        assert [[x[2] for x in g] for g in ass.groups(words, "bold")] == [
            [" One."],
            [" Two"],
            [" three", " four", " five"],
        ]

    def test_turkish_capitals_keep_their_dots(self):
        assert ass.upper("istanbul ılık", "tr") == "İSTANBUL ILIK"

    def test_braces_never_reach_libass(self):
        text = ass.build(words=[(0, 1, " Do"), (1, 2, " {\\b1}this")], length=5, style="clean", colors=COLORS)
        assert "{\\b1}" not in text and "b1this" in text
        assert "Style: Caption,@caption," in text and "Title" not in text

    def test_translated_phrases_replace_the_words(self):
        text = ass.build(
            words=[(0, 1, " Hello")],
            length=5,
            style="brand",
            colors=COLORS,
            phrases=[{"start": 0, "end": 1.2, "text": "Hallo"}],
        )
        assert [line for line in text.splitlines() if line.startswith("Dialogue")] == [
            r"Dialogue: 1,0:00:00.00,0:00:01.20,Caption,,0,0,0,,{\fad(60,0)}Hallo"
        ]

    def test_nothing_to_draw_is_no_file(self):
        assert ass.build(words=[], length=5, style="bold", colors=COLORS) == ""

    def test_a_translated_sentence_is_shown_a_phrase_at_a_time_over_its_own_time(self):
        from apps.reels import render

        assert [len(r) for r in render.sentence_runs(WORDS)] == [2, 3, 1]
        found = render.phrases_of("Beginnen wir langsam in der Berghaltung und atmen tief ein.", 2.0, 8.0)
        assert all(len(p["text"]) <= render.PHRASE for p in found) and len(found) == 2
        assert (found[0]["start"], found[-1]["end"]) == (2.0, 8.0)
        assert found[0]["end"] == found[1]["start"]

    def test_a_highlight_reads_over_video(self):
        assert ass.highlight({"accent": "#0b1d51", "primary": "#e11d48"}) == "#e11d48"
        assert ass.highlight({"accent": "#0b1d51", "primary": "#111827"}) == ass.YELLOW
