"""Pure schedule math for recurring announcements.

No DB access — given a rule's fields and a reference instant, compute the next
fire time in the tenant's timezone, returned as an aware UTC datetime.
"""

import calendar
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

_UTC = ZoneInfo("UTC")


def _at(d: date, t: time, tz: ZoneInfo) -> datetime:
    return datetime(d.year, d.month, d.day, t.hour, t.minute, tzinfo=tz)


def _monthly(d: date, dom: int, tz: ZoneInfo, t: time) -> datetime:
    last = calendar.monthrange(d.year, d.month)[1]
    return _at(date(d.year, d.month, min(dom, last)), t, tz)


def next_occurrence(*, frequency, send_time, weekday, day_of_month, after_utc, tz_name, start_date) -> datetime:
    tz = ZoneInfo(tz_name or "UTC")
    after_local = after_utc.astimezone(tz)
    floor = max(after_local, _at(start_date, send_time, tz) - timedelta(seconds=1))
    cur = floor.date()

    if frequency == "daily":
        slot = _at(cur, send_time, tz)
        if slot <= floor:
            slot = _at(cur + timedelta(days=1), send_time, tz)
        return slot.astimezone(_UTC)

    if frequency == "weekly":
        for i in range(0, 15):
            d = cur + timedelta(days=i)
            if d.weekday() == weekday:
                slot = _at(d, send_time, tz)
                if slot > floor:
                    return slot.astimezone(_UTC)
        raise ValueError("no weekly slot found")

    if frequency == "monthly":
        slot = _monthly(cur, day_of_month, tz, send_time)
        if slot <= floor:
            nxt_month = (cur.replace(day=1) + timedelta(days=32)).replace(day=1)
            slot = _monthly(nxt_month, day_of_month, tz, send_time)
        return slot.astimezone(_UTC)

    raise ValueError(f"bad frequency {frequency}")
