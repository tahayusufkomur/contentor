"""A class schedule: validated, read back as a sentence, expanded to dates."""

from apps.tenant_config import interview_schedule as schedule

WEEKLY = {"mode": "recurring", "start": "2026-10-12", "end": "2026-12-07", "days": [4, 2], "times": ["18:30"]}


def test_parse_cleans_and_rejects():
    assert schedule.parse('{"mode": "once", "at": "2026-10-13T18:30"}') == {"mode": "once", "at": "2026-10-13T18:30"}
    assert schedule.parse({**WEEKLY, "times": ["18:30", "", "07:00"]}) == {
        **WEEKLY,
        "days": [2, 4],
        "times": ["07:00", "18:30"],
    }
    assert schedule.parse({**WEEKLY, "end": None})["start"] == "2026-10-12" and "end" not in schedule.parse(
        {**WEEKLY, "end": ""}
    )
    for bad in (
        "not json",
        {"mode": "weekly"},
        {"mode": "once", "at": "tomorrow"},
        {**WEEKLY, "days": []},
        {**WEEKLY, "days": [7]},
        {**WEEKLY, "times": ["25:00"]},
        {**WEEKLY, "end": "2026-10-01"},
        {**WEEKLY, "end": "2028-10-12"},
    ):
        assert schedule.parse(bad) is None, bad


def test_summary_reads_like_the_coach():
    assert schedule.summary(schedule.parse(WEEKLY)) == "Tuesdays and Thursdays at 6:30 PM, from 12 Oct to 7 Dec 2026"
    assert schedule.summary(schedule.parse({**WEEKLY, "end": None, "days": [1], "times": ["07:00", "18:30"]})) == (
        "Mondays at 7:00 AM and 6:30 PM, from 12 Oct 2026"
    )
    assert schedule.summary({"mode": "once", "at": "2026-10-13T18:30"}) == "Tuesday 13 Oct 2026 at 6:30 PM"


def test_occurrences_follow_the_tenant_timezone_and_the_caps():
    dates = schedule.occurrences(schedule.parse(WEEKLY), "Europe/Istanbul")
    assert dates[0].isoformat() == "2026-10-13T18:30:00+03:00" and dates[-1].isoformat()[:10] == "2026-12-03"
    assert len(dates) == 16
    assert len(schedule.occurrences(schedule.parse({**WEEKLY, "end": None}), "UTC")) == 16  # eight weeks by default
    assert (
        len(schedule.occurrences(schedule.parse({**WEEKLY, "end": "2027-10-11", "days": [0, 1, 2, 3, 4, 5, 6]}), "UTC"))
        == schedule.MAX_CLASSES
    )
    assert (
        schedule.occurrences({"mode": "once", "at": "2026-10-13T18:30"}, "UTC")[0].isoformat()
        == "2026-10-13T18:30:00+00:00"
    )
