from datetime import UTC, date, datetime, time

from apps.notifications.recurrence import next_occurrence


def _utc(y, m, d, h, mi=0):
    return datetime(y, m, d, h, mi, tzinfo=UTC)


def test_daily_rolls_to_next_day():
    nxt = next_occurrence(
        frequency="daily",
        send_time=time(9, 0),
        weekday=None,
        day_of_month=None,
        after_utc=_utc(2026, 6, 22, 12, 0),
        tz_name="UTC",
        start_date=date(2026, 6, 1),
    )
    assert nxt == _utc(2026, 6, 23, 9, 0)


def test_weekly_picks_weekday():
    # 2026-06-22 is a Monday (weekday 0); after it, land next Monday
    nxt = next_occurrence(
        frequency="weekly",
        send_time=time(8, 0),
        weekday=0,
        day_of_month=None,
        after_utc=_utc(2026, 6, 22, 9, 0),
        tz_name="UTC",
        start_date=date(2026, 6, 1),
    )
    assert nxt == _utc(2026, 6, 29, 8, 0)


def test_monthly_clamps_to_month_length():
    nxt = next_occurrence(
        frequency="monthly",
        send_time=time(7, 0),
        weekday=None,
        day_of_month=31,
        after_utc=_utc(2026, 3, 31, 8, 0),
        tz_name="UTC",
        start_date=date(2026, 1, 1),
    )
    assert nxt == _utc(2026, 4, 30, 7, 0)  # April has 30 days


def test_timezone_applied():
    # 9am Europe/Istanbul (UTC+3) == 06:00 UTC
    nxt = next_occurrence(
        frequency="daily",
        send_time=time(9, 0),
        weekday=None,
        day_of_month=None,
        after_utc=_utc(2026, 6, 22, 12, 0),
        tz_name="Europe/Istanbul",
        start_date=date(2026, 6, 1),
    )
    assert nxt == _utc(2026, 6, 23, 6, 0)
