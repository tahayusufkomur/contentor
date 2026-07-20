# backend/apps/logbook/tasks.py
"""Beat tasks: archive elapsed days to S3, purge the hot store."""

from __future__ import annotations

import logging
from datetime import datetime, time, timedelta

from celery import shared_task
from django.conf import settings
from django.utils import timezone
from django.utils.timezone import make_aware

from .archive import ARCHIVE_MODELS, archive_day
from .models import LogArchiveDay

logger = logging.getLogger(__name__)


def _day_range(model):
    first_ts = model.objects.order_by("ts").values_list("ts", flat=True).first()
    if first_ts is None:
        return []
    today = timezone.now().date()
    start = max(first_ts.date(), today - timedelta(days=settings.LOGBOOK_HARD_CAP_DAYS))
    return [start + timedelta(days=i) for i in range((today - start).days)]  # excludes today


@shared_task
def archive_logbook_days():
    for kind, model in ARCHIVE_MODELS.items():
        done = set(LogArchiveDay.objects.filter(kind=kind).values_list("date", flat=True))
        for day in _day_range(model):
            if day in done:
                continue
            try:
                row = archive_day(day, kind)
                logger.info(
                    "logbook archive: %s %s -> %s (%s lines)", kind, day, row.object_key or "(empty)", row.line_count
                )
            except Exception:
                logger.exception("logbook archive failed for %s %s; will retry tomorrow", kind, day)


def _delete_day(model, day):
    start = make_aware(datetime.combine(day, time.min))
    deleted, _ = model.objects.filter(ts__gte=start, ts__lt=start + timedelta(days=1)).delete()
    return deleted


@shared_task
def purge_logbook():
    today = timezone.now().date()
    retention_cutoff = today - timedelta(days=settings.LOGBOOK_RETENTION_DAYS)
    hard_cutoff = make_aware(datetime.combine(today - timedelta(days=settings.LOGBOOK_HARD_CAP_DAYS), time.min))
    for kind, model in ARCHIVE_MODELS.items():
        # Hard cap: anything older than 21d goes regardless — a persistently
        # failing archive must not grow the table forever. The ERROR below
        # surfaces in the panel itself.
        stale = model.objects.filter(ts__lt=hard_cutoff)
        if stale.exists():
            deleted, _ = stale.delete()
            logger.error("logbook purge: deleted %s unarchived %s rows past the 21d hard cap", deleted, kind)
        archived = set(
            LogArchiveDay.objects.filter(kind=kind, date__lt=retention_cutoff).values_list("date", flat=True)
        )
        for day in sorted(archived):
            deleted = _delete_day(model, day)
            if deleted:
                logger.info("logbook purge: %s %s -> deleted %s rows", kind, day, deleted)
