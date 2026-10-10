"""The /setup funnel read from interview transcripts."""

from datetime import UTC, datetime

from apps.tenant_config.management.commands.setup_funnel import funnel

T = "2026-10-10T10:00:{:02d}+00:00"


def _iv(turns, asked, last_at, done=False):
    return {"turns": turns, "asked": asked, "last_at": last_at, "done": done}


def test_time_per_question_delegate_rate_typed_vs_tapped_latency_and_drop_off():
    a = _iv(
        [
            {"role": "guide", "field": "teaches", "at": T.format(0)},
            {"role": "coach", "field": "teaches", "at": T.format(10), "how": "tap"},
            {"role": "guide", "field": "tone", "at": T.format(12), "ms": 2000},
            {"role": "coach", "field": "tone", "at": T.format(20), "how": "delegate"},
            {"role": "guide", "field": None, "at": T.format(21), "ms": 900},
        ],
        asked=None,
        last_at=T.format(21),
        done=True,
    )
    b = _iv(
        [
            {"role": "guide", "field": "teaches", "at": T.format(0)},
            {"role": "coach", "field": "teaches", "at": T.format(30), "how": "typed"},
            {"role": "guide", "field": "tone", "at": T.format(36), "ms": 6000},
            # Older transcripts carry no stamps: counted, never timed.
            {"role": "coach", "field": "tone", "text": "warm"},
            {"role": "guide", "field": "story"},
        ],
        asked="story",
        last_at=T.format(40),
    )
    # Never answered the first question: nothing stored, still a drop-off.
    c = _iv([], asked="teaches", last_at=T.format(0))
    report = funnel([a, b, c], idle_before=datetime(2026, 10, 11, tzinfo=UTC))
    teaches, tone = report["fields"]["teaches"], report["fields"]["tone"]
    assert (teaches["reached"], teaches["answered"]) == (3, 2)
    assert teaches["median_secs"] == 20 and teaches["how"] == {"tap": 1, "typed": 1}
    assert teaches["median_reply_ms"] == 4000  # the turns that answered it
    assert tone["how"] == {"delegate": 1} and tone["answered"] == 2
    assert report["fields"]["story"] == {**report["fields"]["story"], "reached": 1, "answered": 0}
    assert report["dropped"] == {"story": 1, "teaches": 1}
    assert (report["tenants"], report["done"]) == (3, 1)
