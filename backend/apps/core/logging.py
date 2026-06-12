"""Logging helpers for production-grade, container-friendly logs.

`TenantContextFilter` stamps every record with the active django-tenants schema
so a line in `docker logs` tells you *which* tenant it came from. It is wired
into the console handler in `config/settings/base.py`.
"""

from __future__ import annotations

import logging


class TenantContextFilter(logging.Filter):
    """Add the current tenant schema to each record as `record.tenant`.

    Reads `connection.schema_name` (set by django-tenants per request / task).
    Defensive: logging happens during startup and in the celery worker before a
    DB connection exists, so any failure degrades to "-" rather than raising
    inside the logging machinery.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        schema = "-"
        try:
            from django.db import connection

            schema = getattr(connection, "schema_name", None) or "-"
        except Exception:  # noqa: BLE001 — never let logging raise
            schema = "-"
        record.tenant = schema
        return True
