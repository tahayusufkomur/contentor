# backend/apps/logbook/tests/test_ingest.py
"""Ingest endpoint: token auth, floors, dedupe, LogEntry vs RequestEvent routing."""

from __future__ import annotations

import json

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.logbook.models import LogEntry, RequestEvent
from apps.logbook.parsing import ACTIVITY_LOGGER

pytestmark = pytest.mark.django_db

URL = "/api/v1/platform/logs/ingest/"
TOKEN = "test-logs-token"  # noqa: S105 — test fixture value


@pytest.fixture(autouse=True)
def _tenant_rows(restore_public):
    """shared-test.localhost must resolve even when this file runs alone."""


def _event(message, container="contentor-django-1", ts="2026-07-19T12:00:00.000000001Z"):
    return {"timestamp": ts, "container_name": container, "stream": "stdout", "message": message}


def _post(events, token=TOKEN):
    client = APIClient(HTTP_HOST="shared-test.localhost")
    headers = {"HTTP_X_LOGS_TOKEN": token} if token is not None else {}
    return client.post(URL, data=json.dumps(events), content_type="application/json", **headers)


@override_settings(LOGS_INGEST_TOKEN="")
def test_unconfigured_token_gives_503():
    assert _post([]).status_code == 503


@override_settings(LOGS_INGEST_TOKEN=TOKEN)
def test_wrong_token_403():
    assert _post([], token="nope").status_code == 403
    assert _post([], token=None).status_code == 403


@override_settings(LOGS_INGEST_TOKEN=TOKEN)
def test_ingest_stores_and_floors():
    events = [
        _event("2026-07-19T12:00:01+0000 ERROR   apps.blog [tenant=yoga] [user=a@b.co] boom"),
        _event("2026-07-19T12:00:02+0000 INFO    apps.blog [tenant=yoga] [user=-] fine"),
        _event('{"level":"info","msg":"routine"}', container="contentor-caddy"),  # floored out (WARN+ infra)
        _event('{"level":"error","msg":"upstream dead"}', container="contentor-caddy"),
    ]
    resp = _post(events)
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"accepted": 4, "logs": 3, "activity": 0}
    assert LogEntry.objects.filter(container="caddy").count() == 1
    row = LogEntry.objects.get(level="ERROR", container="django")
    assert row.tenant == "yoga" and row.user_label == "a@b.co" and row.message == "boom"


@override_settings(LOGS_INGEST_TOKEN=TOKEN)
def test_ingest_is_idempotent_on_retry():
    events = [_event("2026-07-19T12:00:01+0000 ERROR   apps.blog [tenant=-] dup")]
    assert _post(events).status_code == 200
    assert _post(events).status_code == 200  # Vector retry of same batch
    assert LogEntry.objects.filter(message="dup").count() == 1


@override_settings(LOGS_INGEST_TOKEN=TOKEN)
def test_activity_lines_become_request_events():
    # Payload tenant/user intentionally differ from the outer [tenant=]/[user=]
    # brackets: RequestEvent fields must come from the activity JSON payload.
    payload = {
        "kind": "api",
        "tenant": "yoga-payload",
        "user": "payload@t.io",
        "ip": "203.0.113.9",
        "session_id": "11111111-1111-1111-1111-111111111111",
        "method": "GET",
        "path": "/api/v1/courses/",
        "status": 200,
        "duration_ms": 45,
        "user_agent": "Mozilla/5.0",
    }
    line = f"2026-07-19T12:00:03+0000 INFO    {ACTIVITY_LOGGER} [tenant=yoga] [user=s@t.io] " + json.dumps(payload)
    resp = _post([_event(line)])
    assert resp.json() == {"accepted": 1, "logs": 0, "activity": 1}
    ev = RequestEvent.objects.get()
    assert ev.kind == "api" and ev.path == "/api/v1/courses/" and ev.status == 200
    assert ev.tenant == "yoga-payload" and ev.user_label == "payload@t.io"
    assert ev.ip == "203.0.113.9" and ev.duration_ms == 45


@override_settings(LOGS_INGEST_TOKEN=TOKEN)
def test_activity_ingest_is_idempotent_on_retry():
    payload = {"kind": "api", "path": "/api/v1/courses/", "status": 200}
    line = f"2026-07-19T12:00:04+0000 INFO    {ACTIVITY_LOGGER} [tenant=yoga] [user=s@t.io] " + json.dumps(payload)
    events = [_event(line)]
    assert _post(events).status_code == 200
    assert _post(events).status_code == 200  # Vector retry of same batch
    assert RequestEvent.objects.count() == 1


@override_settings(LOGS_INGEST_TOKEN=TOKEN)
def test_activity_hostile_values_coerced_not_500():
    payload = {"kind": "x" * 20, "ip": "not-an-ip", "status": True, "path": "/p/"}
    line = f"2026-07-19T12:00:05+0000 INFO    {ACTIVITY_LOGGER} [tenant=-] [user=-] " + json.dumps(payload)
    resp = _post([_event(line)])
    assert resp.status_code == 200
    assert resp.json() == {"accepted": 1, "logs": 0, "activity": 1}
    ev = RequestEvent.objects.get()
    assert ev.kind == "x" * 10  # truncated to field max_length
    assert ev.ip is None  # invalid IP dropped, not 500
    assert ev.status is None  # bool is not an int here


@override_settings(LOGS_INGEST_TOKEN=TOKEN)
def test_oversized_batch_rejected():
    events = [_event(f"line {i}") for i in range(501)]
    assert _post(events).status_code == 413
