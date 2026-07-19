"""Public-schema log store: raw container log lines (LogEntry), the per-request
activity/pageview trail (RequestEvent), and the S3 archive ledger
(LogArchiveDay). No Meta.ordering anywhere — it would pollute the facet
GROUP BYs; every query orders explicitly."""

from __future__ import annotations

import hashlib

from django.contrib.postgres.indexes import GinIndex
from django.db import models

LEVEL_CHOICES = [(x, x) for x in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")]


def line_digest(text: str) -> str:
    return hashlib.md5(text.encode("utf-8", "replace"), usedforsecurity=False).hexdigest()


class LogEntry(models.Model):
    ts = models.DateTimeField()
    container = models.CharField(max_length=64)
    stream = models.CharField(max_length=8, default="stdout")
    level = models.CharField(max_length=10, choices=LEVEL_CHOICES, default="INFO")
    logger_name = models.CharField(max_length=128, blank=True, default="")
    tenant = models.CharField(max_length=63, blank=True, default="")
    user_label = models.CharField(max_length=254, blank=True, default="")
    message = models.TextField()
    line_hash = models.CharField(max_length=32)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["container", "ts", "line_hash"], name="logbook_logentry_dedupe"),
        ]
        indexes = [
            models.Index(fields=["level", "ts"], name="logbook_le_level_ts"),
            models.Index(fields=["container", "ts"], name="logbook_le_container_ts"),
            models.Index(fields=["tenant", "ts"], name="logbook_le_tenant_ts"),
            models.Index(fields=["user_label", "ts"], name="logbook_le_user_ts"),
            models.Index(fields=["ts"], name="logbook_le_ts"),
            GinIndex(fields=["message"], name="logbook_msg_trgm", opclasses=["gin_trgm_ops"]),
        ]

    def __str__(self):
        return f"{self.ts:%Y-%m-%dT%H:%M:%S} {self.level} {self.container}"


class RequestEvent(models.Model):
    KIND_API = "api"
    KIND_PAGEVIEW = "pageview"
    KIND_CHOICES = [(KIND_API, KIND_API), (KIND_PAGEVIEW, KIND_PAGEVIEW)]

    ts = models.DateTimeField()
    kind = models.CharField(max_length=10, choices=KIND_CHOICES, default=KIND_API)
    tenant = models.CharField(max_length=63, blank=True, default="")
    user_label = models.CharField(max_length=254, blank=True, default="")
    ip = models.GenericIPAddressField(null=True, blank=True)
    session_id = models.CharField(max_length=36, blank=True, default="")
    method = models.CharField(max_length=8, blank=True, default="")
    path = models.CharField(max_length=512, blank=True, default="")
    status = models.PositiveSmallIntegerField(null=True, blank=True)
    duration_ms = models.PositiveIntegerField(null=True, blank=True)
    referrer = models.CharField(max_length=512, blank=True, default="")
    user_agent = models.CharField(max_length=256, blank=True, default="")
    line_hash = models.CharField(max_length=32)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["kind", "ts", "line_hash"], name="logbook_requestevent_dedupe"),
        ]
        indexes = [
            models.Index(fields=["kind", "ts"], name="logbook_re_kind_ts"),
            models.Index(fields=["tenant", "ts"], name="logbook_re_tenant_ts"),
            models.Index(fields=["user_label", "ts"], name="logbook_re_user_ts"),
            models.Index(fields=["session_id", "ts"], name="logbook_re_session_ts"),
            models.Index(fields=["ip", "ts"], name="logbook_re_ip_ts"),
            models.Index(fields=["ts"], name="logbook_re_ts"),
        ]

    def __str__(self):
        return f"{self.ts:%Y-%m-%dT%H:%M:%S} {self.kind} {self.path}"


class LogArchiveDay(models.Model):
    KIND_CHOICES = [("logs", "logs"), ("activity", "activity")]

    date = models.DateField()
    kind = models.CharField(max_length=10, choices=KIND_CHOICES)
    object_key = models.CharField(max_length=256, blank=True, default="")
    line_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["date", "kind"], name="logbook_archiveday_unique")]

    def __str__(self):
        return f"{self.date} {self.kind} ({self.line_count})"
