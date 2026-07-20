# backend/apps/logbook/tests/test_tasks.py
"""Archive: gzip NDJSON per (day, kind), idempotent ledger. Purge: archived
days past 14d, hard cap at 21d with an ERROR breadcrumb."""

from __future__ import annotations

import gzip
import json
from datetime import UTC, datetime, timedelta

import pytest
from django.utils import timezone

from apps.logbook import archive, tasks
from apps.logbook.models import LogArchiveDay, LogEntry, RequestEvent, line_digest

pytestmark = pytest.mark.django_db


class FakeS3:
    def __init__(self):
        self.objects = {}

    def put_object(self, Bucket, Key, Body, ContentType):  # noqa: N803 — boto3 arg names
        self.objects[Key] = Body


@pytest.fixture()
def fake_s3(monkeypatch):
    fake = FakeS3()
    monkeypatch.setattr("apps.logbook.archive.get_s3_client", lambda: fake)
    return fake


def _entry(ts, msg):
    return LogEntry.objects.create(ts=ts, container="django", level="ERROR", message=msg, line_hash=line_digest(msg))


def test_archive_day_uploads_gzip_ndjson(fake_s3):
    day = datetime(2026, 7, 1, tzinfo=UTC)
    _entry(day + timedelta(hours=1), "first")
    _entry(day + timedelta(hours=2), "second")
    row = archive.archive_day(day.date(), "logs")
    assert row.line_count == 2
    assert row.object_key == "logs/archive/2026/07/01.ndjson.gz"
    lines = gzip.decompress(fake_s3.objects[row.object_key]).decode().strip().split("\n")
    assert [json.loads(x)["message"] for x in lines] == ["first", "second"]


def test_archive_day_is_idempotent(fake_s3):
    day = datetime(2026, 7, 1, tzinfo=UTC)
    _entry(day + timedelta(hours=1), "once")
    first = archive.archive_day(day.date(), "logs")
    again = archive.archive_day(day.date(), "logs")
    assert first.pk == again.pk
    assert LogArchiveDay.objects.count() == 1


def test_archive_task_covers_elapsed_days(fake_s3):
    yesterday = timezone.now() - timedelta(days=1)
    _entry(yesterday, "y-log")
    RequestEvent.objects.create(ts=yesterday, kind="api", path="/x", line_hash=line_digest("x"))
    tasks.archive_logbook_days()
    assert LogArchiveDay.objects.filter(kind="logs").count() == 1
    assert LogArchiveDay.objects.filter(kind="activity").count() == 1
    # today is never archived
    assert not LogArchiveDay.objects.filter(date=timezone.now().date()).exists()


def test_purge_deletes_archived_days_after_retention(fake_s3):
    old = timezone.now() - timedelta(days=15)
    _entry(old, "old-archived")
    archive.archive_day(old.date(), "logs")
    fresh = _entry(timezone.now() - timedelta(days=2), "fresh")
    tasks.purge_logbook()
    assert not LogEntry.objects.filter(message="old-archived").exists()
    assert LogEntry.objects.filter(pk=fresh.pk).exists()


def test_purge_keeps_unarchived_until_hard_cap(fake_s3, tasks_capture):
    unarchived_15d = _entry(timezone.now() - timedelta(days=15), "unarchived-young")
    _entry(timezone.now() - timedelta(days=22), "unarchived-ancient")
    tasks.purge_logbook()
    assert LogEntry.objects.filter(pk=unarchived_15d.pk).exists()  # inside hard cap, not archived → kept
    assert not LogEntry.objects.filter(message="unarchived-ancient").exists()  # past hard cap → deleted
    errors = [r for r in tasks_capture.records if r.levelname == "ERROR"]
    assert any("hard cap" in r.getMessage() for r in errors)
