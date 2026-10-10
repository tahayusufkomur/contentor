"""A class schedule from the /setup interview: weekly on set days and times
between two dates, or once, on one date and time. The coach's picker sends it
as JSON (``parse`` validates it); ``summary`` reads it back as a sentence
and ``occurrences`` lists the classes it means, in the coach's timezone.

A weekly schedule has one or more slots, each with its own days and times:
"Mondays at 9 AM" and "Wednesdays at 6 PM" are two slots of the same class."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

MODES = ("recurring", "once")
MAX_SLOTS = 4
MAX_TIMES = 6
MAX_SPAN_DAYS = 365
DEFAULT_SPAN_WEEKS = 8
MAX_CLASSES = 60
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
_AT = re.compile(r"^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$")
# Python weekday() is Monday=0; the picker sends JS weekdays, Sunday=0.
_DAY_NAMES = ("Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays")


def _slot(raw) -> dict | None:
    """One days-and-times slot, or None when it does not fit."""
    if not isinstance(raw, dict):
        return None
    days, times = raw.get("days"), raw.get("times")
    if not isinstance(days, list) or not days or not all(isinstance(d, int) and 0 <= d <= 6 for d in days):
        return None
    if not isinstance(times, list):
        return None
    times = [t for t in times if t]
    if not times or len(times) > MAX_TIMES or not all(isinstance(t, str) and _TIME.match(t) for t in times):
        return None
    return {"days": sorted(set(days), key=lambda d: (d + 6) % 7), "times": sorted(set(times))}


def _slots(s: dict) -> list[dict]:
    """A weekly schedule's slots; one saved before slots existed is a single slot."""
    return s["slots"] if "slots" in s else [{"days": s["days"], "times": s["times"]}]


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
    # The coach's timezone, when the picker sent one this server knows.
    try:
        tz = ZoneInfo(value["tz"]).key if isinstance(value.get("tz"), str) else None
    except (ZoneInfoNotFoundError, ValueError):
        tz = None
    tz_part = {"tz": tz} if tz else {}
    if value["mode"] == "once":
        at = value.get("at")
        return {"mode": "once", "at": at, **tz_part} if isinstance(at, str) and _AT.match(at) else None
    start, end = value.get("start"), value.get("end") or None
    if not (isinstance(start, str) and _DATE.match(start)):
        return None
    if end is not None and not (isinstance(end, str) and _DATE.match(end) and start <= end):
        return None
    if end is not None and (date.fromisoformat(end) - date.fromisoformat(start)).days > MAX_SPAN_DAYS:
        return None
    # "slots" is the picker's shape; top-level "days" and "times" are the old one.
    raw = value["slots"] if isinstance(value.get("slots"), list) else [value]
    slots = [_slot(s) for s in raw] if 0 < len(raw) <= MAX_SLOTS else []
    if not slots or any(s is None for s in slots):
        return None
    return {"mode": "recurring", "start": start, **({"end": end} if end else {}), **tz_part, "slots": slots}


def _list(items: list[str]) -> str:
    return f"{', '.join(items[:-1])} and {items[-1]}" if len(items) > 1 else (items[0] if items else "")


def _time(t: str) -> str:
    h, m = (int(x) for x in t.split(":"))
    return f"{(h + 11) % 12 + 1}:{m:02d} {'PM' if h >= 12 else 'AM'}"


def _date(s: str, year: bool) -> str:
    d = date.fromisoformat(s[:10])
    return f"{d.day} {d.strftime('%b')}" + (f" {d.year}" if year else "")


def summary(s: dict) -> str:
    """ "Tuesdays and Thursdays at 6:30 PM; Saturdays at 9:00 AM, from 12 Oct to
    7 Dec 2026", or "Tuesday 13 Oct 2026 at 6:30 PM"."""
    if s["mode"] == "once":
        d = datetime.fromisoformat(s["at"])
        return f"{d.strftime('%A')} {_date(s['at'], True)} at {_time(s['at'][11:16])}"
    when = "; ".join(
        f"{_list([_DAY_NAMES[d] for d in sl['days']])} at {_list([_time(t) for t in sl['times']])}" for sl in _slots(s)
    )
    span = (
        f"from {_date(s['start'], False)} to {_date(s['end'], True)}"
        if s.get("end")
        else f"from {_date(s['start'], True)}"
    )
    return f"{when}, {span}"


def occurrences(s: dict, tz: str) -> list[datetime]:
    """Every class the schedule means, as aware datetimes in its timezone (or
    ``tz``), soonest first. A weekly schedule with no end runs DEFAULT_SPAN_WEEKS;
    never more than MAX_CLASSES."""
    zone = ZoneInfo(s.get("tz") or tz or "UTC")
    if s["mode"] == "once":
        return [datetime.fromisoformat(s["at"]).replace(tzinfo=zone)]
    start = date.fromisoformat(s["start"])
    end = date.fromisoformat(s["end"]) if s.get("end") else start + timedelta(weeks=DEFAULT_SPAN_WEEKS)
    out: list[datetime] = []
    day = start
    while day <= end:
        js_day = (day.weekday() + 1) % 7
        for sl in _slots(s):
            if js_day in sl["days"]:
                for t in sl["times"]:
                    h, m = (int(x) for x in t.split(":"))
                    out.append(datetime(day.year, day.month, day.day, h, m, tzinfo=zone))
        day += timedelta(days=1)
    return sorted(out)[:MAX_CLASSES]
