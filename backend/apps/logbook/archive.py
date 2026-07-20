# backend/apps/logbook/archive.py
"""Daily gzip NDJSON exports to object storage (MinIO dev / Hetzner prod).

Archives are the long-term record ("zcat | grep" when needed); the ledger row
in LogArchiveDay is what allows the purge to delete the hot rows."""

from __future__ import annotations

import gzip
import io
import json
from datetime import date, datetime, time, timedelta

from django.conf import settings
from django.utils.timezone import make_aware

from apps.core.storage import get_s3_client

from .models import LogArchiveDay, LogEntry, RequestEvent

ARCHIVE_MODELS = {"logs": LogEntry, "activity": RequestEvent}

_LOG_FIELDS = ("ts", "container", "stream", "level", "logger_name", "tenant", "user_label", "message")
_ACTIVITY_FIELDS = (
    "ts",
    "kind",
    "tenant",
    "user_label",
    "ip",
    "session_id",
    "method",
    "path",
    "status",
    "duration_ms",
    "referrer",
    "user_agent",
)


def _serialize(obj, fields) -> str:
    row = {}
    for f in fields:
        value = getattr(obj, f)
        row[f] = value.isoformat() if hasattr(value, "isoformat") else value
    return json.dumps(row, ensure_ascii=False)


def archive_day(day: date, kind: str) -> LogArchiveDay:
    existing = LogArchiveDay.objects.filter(date=day, kind=kind).first()
    if existing:
        return existing
    model = ARCHIVE_MODELS[kind]
    fields = _LOG_FIELDS if kind == "logs" else _ACTIVITY_FIELDS
    start = make_aware(datetime.combine(day, time.min))
    end = start + timedelta(days=1)
    qs = model.objects.filter(ts__gte=start, ts__lt=end).order_by("ts", "id")

    buf = io.BytesIO()
    count = 0
    with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
        for obj in qs.iterator(chunk_size=2000):
            gz.write((_serialize(obj, fields) + "\n").encode("utf-8"))
            count += 1

    object_key = ""
    if count:
        prefix = settings.LOGBOOK_ARCHIVE_PREFIXES[kind]
        object_key = f"{prefix}{day:%Y/%m/%d}.ndjson.gz"
        get_s3_client().put_object(
            Bucket=settings.AWS_BUCKET_NAME,
            Key=object_key,
            Body=buf.getvalue(),
            ContentType="application/gzip",
        )
    return LogArchiveDay.objects.create(date=day, kind=kind, object_key=object_key, line_count=count)
