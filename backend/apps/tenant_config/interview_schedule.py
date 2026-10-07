"""A class schedule from the /setup interview: weekly on set days and times
between two dates, or once, on one date and time. The coach's picker sends it
as JSON (``parse`` validates it); ``summary`` reads it back as a sentence
and ``occurrences`` lists the classes it means, in the tenant's timezone."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

MODES = ("recurring", "once")
MAX_TIMES = 6
MAX_SPAN_DAYS = 365
DEFAULT_SPAN_WEEKS = 8
MAX_CLASSES = 60
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
_AT = re.compile(r"^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$")
# Python weekday() is Monday=0; the picker sends JS weekdays, Sunday=0.
_DAY_NAMES = ("Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays")


def parse(value) -> dict | None:
    """The picker's JSON (or dict) → a clean schedule, or None when it does not fit."""
    import json

    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return None
    if not isinstance(value, dict) or value.get("mode") not in MODES:
        return None
    if value["mode"] == "once":
        at = value.get("at")
        return {"mode": "once", "at": at} if isinstance(at, str) and _AT.match(at) else None
    start, end = value.get("start"), value.get("end") or None
    days = value.get("days")
    times = [t for t in (value.get("times") or []) if t] if isinstance(value.get("times"), list) else None
    if not (isinstance(start, str) and _DATE.match(start)):
        return None
    if end is not None and not (isinstance(end, str) and _DATE.match(end) and start <= end):
        return None
    if end is not None and (date.fromisoformat(end) - date.fromisoformat(start)).days > MAX_SPAN_DAYS:
        return None
    if not isinstance(days, list) or not days or not all(isinstance(d, int) and 0 <= d <= 6 for d in days):
        return None
    if not times or len(times) > MAX_TIMES or not all(isinstance(t, str) and _TIME.match(t) for t in times):
        return None
    return {
        "mode": "recurring",
        "start": start,
        **({"end": end} if end else {}),
        "days": sorted(set(days), key=lambda d: (d + 6) % 7),
        "times": sorted(set(times)),
    }


def _list(items: list[str]) -> str:
    return f"{', '.join(items[:-1])} and {items[-1]}" if len(items) > 1 else (items[0] if items else "")


def _time(t: str) -> str:
    h, m = (int(x) for x in t.split(":"))
    return f"{(h + 11) % 12 + 1}:{m:02d} {'PM' if h >= 12 else 'AM'}"


def _date(s: str, year: bool) -> str:
    d = date.fromisoformat(s[:10])
    return f"{d.day} {d.strftime('%b')}" + (f" {d.year}" if year else "")


def summary(s: dict) -> str:
    """ "Tuesdays and Thursdays at 6:30 PM, from 12 Oct to 7 Dec 2026", or
    "Tuesday 13 Oct 2026 at 6:30 PM"."""
    if s["mode"] == "once":
        d = datetime.fromisoformat(s["at"])
        return f"{d.strftime('%A')} {_date(s['at'], True)} at {_time(s['at'][11:16])}"
    days = _list([_DAY_NAMES[d] for d in s["days"]])
    times = _list([_time(t) for t in s["times"]])
    span = (
        f"from {_date(s['start'], False)} to {_date(s['end'], True)}"
        if s.get("end")
        else f"from {_date(s['start'], True)}"
    )
    return f"{days} at {times}, {span}"


def occurrences(s: dict, tz: str) -> list[datetime]:
    """Every class the schedule means, as aware datetimes in ``tz``, soonest
    first. A weekly schedule with no end runs DEFAULT_SPAN_WEEKS; never more
    than MAX_CLASSES."""
    zone = ZoneInfo(tz or "UTC")
    if s["mode"] == "once":
        return [datetime.fromisoformat(s["at"]).replace(tzinfo=zone)]
    start = date.fromisoformat(s["start"])
    end = date.fromisoformat(s["end"]) if s.get("end") else start + timedelta(weeks=DEFAULT_SPAN_WEEKS)
    js_days = set(s["days"])
    out: list[datetime] = []
    day = start
    while day <= end and len(out) < MAX_CLASSES:
        if (day.weekday() + 1) % 7 in js_days:
            for t in s["times"]:
                h, m = (int(x) for x in t.split(":"))
                out.append(datetime(day.year, day.month, day.day, h, m, tzinfo=zone))
        day += timedelta(days=1)
    return out[:MAX_CLASSES]
