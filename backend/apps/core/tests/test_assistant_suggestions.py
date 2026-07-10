"""run_chat tail parsing: the |||SUGGESTIONS block is stripped from the delta
stream, parsed into the done event, and hidden from on_complete's answer."""

import json
from decimal import Decimal

from apps.core import assistant


def _run(deltas, on_complete=None):
    def fake(**kwargs):
        for d in deltas:
            yield ("delta", d)
        yield ("done", {"cost_usd": Decimal("0"), "provider": "anthropic", "model": "m"})

    original = assistant.core_ai.stream_text
    assistant.core_ai.stream_text = fake
    try:
        frames = [
            json.loads(f.removeprefix("data: ").strip())
            for f in assistant.run_chat(system="s", history=[], model="m", max_tokens=10, on_complete=on_complete)
        ]
    finally:
        assistant.core_ai.stream_text = original
    text = "".join(f.get("text", "") for f in frames if f["type"] == "delta")
    return text, frames[-1]


def test_tail_split_across_deltas_is_stripped():
    text, done = _run(["The course costs $10.", "\n||", '|SUGGESTIONS ["What about refunds?","Is it live?"]'])
    assert "SUGGESTIONS" not in text and text.startswith("The course costs $10.")
    assert done["suggestions"] == ["What about refunds?", "Is it live?"]


def test_no_tail_yields_empty_suggestions_and_full_text():
    text, done = _run(["plain answer"])
    assert text == "plain answer" and done["suggestions"] == []


def test_malformed_tail_fails_soft():
    text, done = _run(["hi", "\n|||SUGGESTIONS [not json"])
    assert text.startswith("hi") and done["suggestions"] == []


def test_clamps_count_and_length():
    tail = json.dumps(["q" * 200, "a", "b", "c", "d"])
    _, done = _run(["x\n|||SUGGESTIONS " + tail])
    assert len(done["suggestions"]) == 3
    assert len(done["suggestions"][0]) == assistant.MAX_SUGGESTION_CHARS


def test_on_complete_gets_clean_answer_and_suggestions():
    seen = {}

    def hook(info):
        seen.update(info)
        return {"transcript_id": 1}

    text, done = _run(["ans", '\n|||SUGGESTIONS ["next?"]'], on_complete=hook)
    assert seen["answer"] == "ans" and seen["suggestions"] == ["next?"]
    assert done["transcript_id"] == 1 and done["suggestions"] == ["next?"]
