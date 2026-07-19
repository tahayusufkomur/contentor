# backend/apps/logbook/tests/test_parsing.py
"""Per-container-family parsing: level/logger/tenant/user extraction, service
name normalization, floors, activity JSON routing, nanosecond timestamps."""

from __future__ import annotations

import json

from django.test import override_settings

from apps.logbook.parsing import (
    ACTIVITY_LOGGER,
    MESSAGE_MAX,
    parse_event,
    parse_ts,
    passes_floor,
    service_from_container,
)


def _raw(container, message, ts="2026-07-19T12:00:00.123456789Z", stream="stdout"):
    return {"timestamp": ts, "container_name": container, "stream": stream, "message": message}


# --- service names -----------------------------------------------------------


def test_service_from_container_variants():
    assert service_from_container("contentor-django") == "django"  # prod
    assert service_from_container("contentor-django-1") == "django"  # dev
    assert service_from_container("contentor-celery-worker-1") == "celery-worker"
    assert service_from_container("contentor-caddy-dev") == "caddy"
    assert service_from_container("/contentor-redis-1") == "redis"
    assert service_from_container("unrelated") == "unrelated"


# --- timestamps ---------------------------------------------------------------


def test_parse_ts_truncates_nanoseconds():
    ts = parse_ts("2026-07-19T12:00:00.123456789Z")
    assert ts.microsecond == 123456
    assert ts.tzinfo is not None


# --- django/celery family -----------------------------------------------------

DJANGO_LINE = "2026-07-19T12:00:01+0000 ERROR   apps.blog.tasks [tenant=yoga] [user=a@b.co] generation failed"
DJANGO_LINE_NO_USER = "2026-07-19T12:00:01+0000 INFO    apps.core.tasks [tenant=-] Tenant x provisioned successfully"


def test_django_line_parses_fields():
    ev = parse_event(_raw("contentor-django-1", DJANGO_LINE))
    assert ev.level == "ERROR"
    assert ev.logger_name == "apps.blog.tasks"
    assert ev.tenant == "yoga"
    assert ev.user_label == "a@b.co"
    assert ev.message == "generation failed"
    assert ev.container == "django"
    assert ev.activity is None


def test_django_line_without_user_bracket_still_parses():
    ev = parse_event(_raw("contentor-celery-worker-1", DJANGO_LINE_NO_USER))
    assert ev.level == "INFO"
    assert ev.tenant == ""  # "-" normalizes to empty
    assert ev.user_label == ""


def test_multiline_traceback_stays_one_event():
    line = DJANGO_LINE + "\nTraceback (most recent call last):\n  File x\nValueError: boom"
    ev = parse_event(_raw("contentor-django-1", line))
    assert ev.level == "ERROR"
    assert "ValueError: boom" in ev.message


def test_activity_json_line_routes_to_activity():
    payload = {"kind": "api", "path": "/api/v1/courses/", "status": 200}
    line = f"2026-07-19T12:00:01+0000 INFO    {ACTIVITY_LOGGER} [tenant=yoga] [user=a@b.co] " + json.dumps(payload)
    ev = parse_event(_raw("contentor-django-1", line))
    assert ev.activity == payload


def test_gunicorn_line():
    ev = parse_event(_raw("contentor-django-1", "[2026-07-19 10:00:00 +0000] [7] [CRITICAL] WORKER TIMEOUT (pid:12)"))
    assert ev.level == "CRITICAL"
    assert "WORKER TIMEOUT" in ev.message


# --- infra families -----------------------------------------------------------


def test_caddy_json_line():
    line = json.dumps({"level": "error", "msg": "dial tcp: connection refused", "logger": "http.log"})
    ev = parse_event(_raw("contentor-caddy", line))
    assert ev.level == "ERROR"
    assert "connection refused" in ev.message


def test_postgres_levels():
    warning_line = "2026-07-19 12:00:00.000 UTC [56] WARNING:  terminating connection"
    log_line = "2026-07-19 12:00:00.000 UTC [1] LOG:  checkpoint starting"
    fatal_line = "2026-07-19 12:00:00.000 UTC [9] FATAL:  out of memory"
    assert parse_event(_raw("contentor-postgres-1", warning_line)).level == "WARNING"
    assert parse_event(_raw("contentor-postgres-1", log_line)).level == "INFO"
    assert parse_event(_raw("contentor-postgres-1", fatal_line)).level == "CRITICAL"


def test_redis_levels():
    warning_line = "1:M 19 Jul 2026 12:00:00.000 # Warning: overcommit disabled"
    info_line = "1:M 19 Jul 2026 12:00:00.000 * Ready to accept connections"
    assert parse_event(_raw("contentor-redis-1", warning_line)).level == "WARNING"
    assert parse_event(_raw("contentor-redis-1", info_line)).level == "INFO"


def test_nextjs_heuristic_and_fallback():
    assert parse_event(_raw("contentor-nextjs-main-1", " ⨯ Error: boom at page.tsx")).level == "ERROR"
    assert parse_event(_raw("contentor-nextjs-customer-1", "compiled client successfully")).level == "INFO"
    ev = parse_event(_raw("contentor-minio-1", "some unparseable noise"))
    assert ev.level == "INFO"  # unparseable lines are kept, never dropped


def test_empty_message_returns_none():
    assert parse_event(_raw("contentor-django-1", "   ")) is None


def test_message_truncated_at_cap():
    ev = parse_event(_raw("contentor-django-1", "x" * (MESSAGE_MAX + 500)))
    assert len(ev.message) == MESSAGE_MAX


# --- floors --------------------------------------------------------------------


def test_floors_default():
    assert passes_floor("django", "INFO") is True
    assert passes_floor("celery-worker", "INFO") is True
    assert passes_floor("caddy", "INFO") is False
    assert passes_floor("caddy", "WARNING") is True
    assert passes_floor("postgres", "ERROR") is True


@override_settings(LOGBOOK_LEVEL_FLOORS={"*": "ERROR"})
def test_floors_overridable():
    assert passes_floor("django", "WARNING") is False
