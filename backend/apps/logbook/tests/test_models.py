# backend/apps/logbook/tests/test_models.py
"""Logbook models: dedupe constraints and the trigram search index."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from django.db import connection

from apps.logbook.models import LogArchiveDay, LogEntry, RequestEvent, line_digest

pytestmark = pytest.mark.django_db

TS = datetime(2026, 7, 19, 12, 0, 0, tzinfo=UTC)


def test_line_digest_is_stable_32_hex():
    d = line_digest("hello world")
    assert len(d) == 32
    assert d == line_digest("hello world")
    assert d != line_digest("hello worlds")


def test_logentry_dedupe_ignores_conflicts():
    row = {"ts": TS, "container": "django", "level": "ERROR", "message": "boom", "line_hash": line_digest("boom")}
    LogEntry.objects.create(**row)
    LogEntry.objects.bulk_create([LogEntry(**row)], ignore_conflicts=True)
    assert LogEntry.objects.count() == 1


def test_requestevent_dedupe_ignores_conflicts():
    row = {"ts": TS, "kind": RequestEvent.KIND_API, "path": "/api/v1/courses/", "line_hash": line_digest("x")}
    RequestEvent.objects.create(**row)
    RequestEvent.objects.bulk_create([RequestEvent(**row)], ignore_conflicts=True)
    assert RequestEvent.objects.count() == 1


def test_archive_day_unique_per_kind():
    LogArchiveDay.objects.create(date=TS.date(), kind="logs", object_key="logs/archive/2026/07/19.ndjson.gz")
    LogArchiveDay.objects.create(date=TS.date(), kind="activity", object_key="activity/archive/2026/07/19.ndjson.gz")
    assert LogArchiveDay.objects.count() == 2
    with pytest.raises(Exception):  # noqa: B017 — IntegrityError via constraint
        LogArchiveDay.objects.create(date=TS.date(), kind="logs", object_key="dup")


def test_trigram_index_exists():
    with connection.cursor() as cur:
        cur.execute("SELECT indexname FROM pg_indexes WHERE tablename = 'logbook_logentry'")
        names = {r[0] for r in cur.fetchall()}
    assert "logbook_msg_trgm" in names
