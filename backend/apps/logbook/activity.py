# backend/apps/logbook/activity.py
"""One structured JSON log line per request → RequestEvent (via the pipeline).

Zero DB writes on the request path: the line rides stdout → Vector → ingest,
which routes ACTIVITY_LOGGER lines into RequestEvent. Registered LAST in
MIDDLEWARE so process_response runs first on the way out — after DRF set
request.user (its Request.user setter propagates to the underlying request)."""

from __future__ import annotations

import contextlib
import json
import logging
import time
from urllib.parse import parse_qsl, urlencode

from django.conf import settings
from django.db import connection

logger = logging.getLogger("apps.logbook.activity")


def client_ip(request) -> str | None:
    cf = request.META.get("HTTP_CF_CONNECTING_IP", "").strip()
    if cf:
        return cf
    xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR") or None


def redact_path(full_path: str) -> str:
    if "?" not in full_path:
        return full_path[:512]
    base, qs = full_path.split("?", 1)
    redact = {p.lower() for p in settings.LOGBOOK_REDACT_PARAMS}
    pairs = [(k, "redacted" if k.lower() in redact else v) for k, v in parse_qsl(qs, keep_blank_values=True)]
    return (base + "?" + urlencode(pairs))[:512]


class RequestActivityMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start = time.monotonic()
        response = self.get_response(request)
        # Activity capture must never break a response.
        with contextlib.suppress(Exception):
            self._record(request, response, start)
        return response

    def _record(self, request, response, start):
        path = request.path
        if request.method == "OPTIONS":
            return
        if any(path.startswith(p) for p in settings.LOGBOOK_ACTIVITY_EXCLUDE_PREFIXES):
            return
        user = getattr(request, "user", None)
        tenant = getattr(connection, "tenant", None)
        payload = {
            "kind": "api",
            "tenant": getattr(tenant, "schema_name", "") or "",
            "user": user.email if getattr(user, "is_authenticated", False) else "",
            "ip": client_ip(request),
            "session_id": request.headers.get("X-Session-Id", "")[:36],
            "method": request.method,
            "path": redact_path(request.get_full_path()),
            "status": response.status_code,
            "duration_ms": int((time.monotonic() - start) * 1000),
            "user_agent": request.META.get("HTTP_USER_AGENT", "")[:256],
        }
        logger.info(json.dumps(payload, ensure_ascii=False))
