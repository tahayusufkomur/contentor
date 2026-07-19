# backend/apps/logbook/parsing.py
"""Turn raw Vector events into typed ParsedEvents.

All knowledge about each container family's line format lives here (Vector is
a dumb transport). Unparseable lines are kept as INFO with the raw line as the
message — a parser bug must never silently drop logs."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime

from django.conf import settings
from django.utils import timezone

ACTIVITY_LOGGER = "apps.logbook.activity"
MESSAGE_MAX = 16384

LEVEL_ORDER = {"DEBUG": 10, "INFO": 20, "WARNING": 30, "ERROR": 40, "CRITICAL": 50}
_LEVEL_ALIASES = {
    "WARN": "WARNING",
    "FATAL": "CRITICAL",
    "PANIC": "CRITICAL",
    "LOG": "INFO",
    "NOTICE": "INFO",
    "TRACE": "DEBUG",
    "DBG": "DEBUG",
}

_CONTAINER_RE = re.compile(r"^/?(?:contentor[-_])?(?P<svc>.+?)(?:[-_]dev)?(?:[-_]\d+)?$")
_DJANGO_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4}\s+"
    r"(?P<level>[A-Z]+)\s+(?P<logger>\S+)\s+\[tenant=(?P<tenant>[^\]]*)\]\s+"
    r"(?:\[user=(?P<user>[^\]]*)\]\s+)?(?P<message>.*)$",
    re.DOTALL,
)
_GUNICORN_RE = re.compile(r"^\[\d{4}-\d{2}-\d{2} [^\]]+\] \[\d+\] \[(?P<level>[A-Z]+)\] (?P<message>.*)$", re.DOTALL)
_POSTGRES_RE = re.compile(
    r"^(?:\d{4}-\d{2}-\d{2} [\d:.]+ \S+ \[\d+\] )?"
    r"(?P<level>LOG|WARNING|ERROR|FATAL|PANIC|STATEMENT|DETAIL|HINT):\s+(?P<message>.*)$",
    re.DOTALL,
)
_REDIS_RE = re.compile(r"^\d+:[A-Z] \d{1,2} \w{3} \d{4} [\d:.]+ (?P<mark>[.\-*#]) (?P<message>.*)$", re.DOTALL)
_TS_NANO_RE = re.compile(r"^(.*\.\d{6})\d*([+-]\d{2}:\d{2})$")

_APP_SERVICES = ("django", "celery-worker", "celery-beat")


@dataclass
class ParsedEvent:
    ts: datetime
    container: str
    stream: str
    level: str
    logger_name: str
    tenant: str
    user_label: str
    message: str
    activity: dict | None = None


def service_from_container(name: str) -> str:
    m = _CONTAINER_RE.match((name or "").strip())
    return (m.group("svc") if m else name or "unknown")[:64]


def parse_ts(value: str | None) -> datetime:
    if not value:
        return timezone.now()
    v = value.strip().replace("Z", "+00:00")
    m = _TS_NANO_RE.match(v)
    if m:
        v = m.group(1) + m.group(2)
    try:
        return datetime.fromisoformat(v)
    except ValueError:
        return timezone.now()


def _norm_level(raw: str) -> str:
    level = (raw or "").upper()
    level = _LEVEL_ALIASES.get(level, level)
    return level if level in LEVEL_ORDER else "INFO"


def passes_floor(container: str, level: str) -> bool:
    floors = settings.LOGBOOK_LEVEL_FLOORS
    floor = floors.get(container) or floors.get("*", "WARNING")
    return LEVEL_ORDER.get(level, 20) >= LEVEL_ORDER.get(floor, 30)


def _heuristic_level(line: str) -> str:
    lowered = line.lower()
    if "⨯" in line or re.search(r"\berror\b", lowered):
        return "ERROR"
    if re.search(r"\bwarn(ing)?\b", lowered):
        return "WARNING"
    return "INFO"


def _parse_app_line(message: str) -> tuple[str, str, str, str, str, dict | None]:
    """Returns (level, logger_name, tenant, user, message, activity)."""
    m = _DJANGO_RE.match(message)
    if m:
        tenant = m.group("tenant")
        user = m.group("user") or "-"
        body = m.group("message")
        logger_name = m.group("logger")
        activity = None
        if logger_name == ACTIVITY_LOGGER:
            try:
                activity = json.loads(body)
            except ValueError:
                activity = None
        return (
            _norm_level(m.group("level")),
            logger_name,
            "" if tenant == "-" else tenant,
            "" if user == "-" else user,
            body,
            activity if isinstance(activity, dict) else None,
        )
    g = _GUNICORN_RE.match(message)
    if g:
        return _norm_level(g.group("level")), "gunicorn", "", "", g.group("message"), None
    return _heuristic_level(message), "", "", "", message, None


def parse_event(raw: dict) -> ParsedEvent | None:
    message = (raw.get("message") or "").rstrip()
    if not message.strip():
        return None
    container = service_from_container(raw.get("container_name") or "")
    ev = ParsedEvent(
        ts=parse_ts(raw.get("timestamp")),
        container=container,
        stream=(raw.get("stream") or "stdout")[:8],
        level="INFO",
        logger_name="",
        tenant="",
        user_label="",
        message=message[:MESSAGE_MAX],
    )
    if container in _APP_SERVICES:
        level, logger_name, tenant, user, body, activity = _parse_app_line(ev.message)
        ev.level, ev.logger_name, ev.tenant, ev.user_label = level, logger_name[:128], tenant[:63], user[:254]
        ev.message, ev.activity = body[:MESSAGE_MAX], activity
    elif container == "caddy" and message.startswith("{"):
        try:
            data = json.loads(message)
            ev.level = _norm_level(str(data.get("level", "info")))
        except ValueError:
            ev.level = _heuristic_level(message)
    elif container == "postgres":
        m = _POSTGRES_RE.match(message)
        ev.level = _norm_level(m.group("level")) if m else "INFO"
    elif container == "redis":
        m = _REDIS_RE.match(message)
        ev.level = "WARNING" if (m and m.group("mark") == "#") else "INFO"
    else:
        ev.level = _heuristic_level(message)
    return ev
