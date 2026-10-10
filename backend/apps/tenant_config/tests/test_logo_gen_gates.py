"""logo_gen.gates: the deterministic checks and the prompt/parse pairs."""

import json

from apps.tenant_config.logo_gen import gates


def test_normalise_folds_case_whitespace_and_punctuation_keeps_diacritics():
    assert gates.normalise("  Görkem   Hancı — YOGA! ") == "görkem hancı yoga"
    assert gates.normalise("Shift-Left") == "shift left"


def test_text_ok_exact_match_only():
    assert gates.text_ok({"text_seen": "ELARA FACE YOGA", "extra_glyphs": False}, "Elara Face Yoga")
    assert not gates.text_ok({"text_seen": "Elara Face Yog", "extra_glyphs": False}, "Elara Face Yoga")
    assert not gates.text_ok({"text_seen": "Elara Face Yoga Natural lift", "extra_glyphs": False}, "Elara Face Yoga")
    assert not gates.text_ok({"text_seen": "Elara Face Yoga", "extra_glyphs": True}, "Elara Face Yoga")
    assert not gates.text_ok(None, "Elara Face Yoga")


def test_read_back_prompt_names_every_file_and_the_schema():
    p = gates.read_back_prompt(["a/cand_1.png", "a/cand_2.png"], "Elara Face Yoga")
    assert "a/cand_1.png" in p and "a/cand_2.png" in p and "text_seen" in p and "extra_glyphs" in p


def test_parse_read_back_tolerates_fences_and_garbage():
    body = {"a/cand_1.png": {"text_seen": "Elara Face Yoga", "extra_glyphs": False}}
    assert gates.parse_read_back("```json\n" + json.dumps(body) + "\n```") == body
    assert gates.parse_read_back("not json") == {}


def test_parse_judge_validates_positions_and_fills_missing():
    out = gates.parse_judge(
        json.dumps({"ranking": [2, 1, 9, 2], "reasons": {"2": "clean"}, "defects": {"1": ["cramped"]}}), 3
    )
    assert out["ranking"] == [2, 1, 3]
    assert out["reasons"] == {2: "clean"} and out["defects"] == {1: ["cramped"]}
    assert gates.parse_judge("garbage", 3)["ranking"] == [1, 2, 3]
