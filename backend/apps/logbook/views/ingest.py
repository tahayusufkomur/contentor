# backend/apps/logbook/views/ingest.py
"""Vector → Postgres. Public URL, guarded by a shared-secret header; Vector
reaches Django on the compose-internal network but the token guards the
endpoint regardless of exposure."""

from __future__ import annotations

import hmac
import ipaddress

from django.conf import settings
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from ..models import LogEntry, RequestEvent, line_digest
from ..parsing import parse_event, passes_floor

MAX_BATCH = 500


def _ip_or_none(value):
    """Validate before hitting the inet column — a bad string inside
    bulk_create would 500 the whole batch. str() first so ints are not
    read as packed addresses (ip_address(123) == 0.0.0.123)."""
    try:
        return str(ipaddress.ip_address(str(value))) if value else None
    except ValueError:
        return None


def _int_or_none(value):
    # bool is an int subtype — `true` must not persist as 1.
    return int(value) if isinstance(value, int) and not isinstance(value, bool) else None


def _request_event(parsed):
    a = parsed.activity
    return RequestEvent(
        ts=parsed.ts,
        kind=str(a.get("kind") or RequestEvent.KIND_API)[:10],
        tenant=str(a.get("tenant") or "")[:63],
        user_label=str(a.get("user") or "")[:254],
        ip=_ip_or_none(a.get("ip")),
        session_id=str(a.get("session_id") or "")[:36],
        method=str(a.get("method") or "")[:8],
        path=str(a.get("path") or "")[:512],
        status=_int_or_none(a.get("status")),
        duration_ms=_int_or_none(a.get("duration_ms")),
        referrer=str(a.get("referrer") or "")[:512],
        user_agent=str(a.get("user_agent") or "")[:256],
        line_hash=line_digest(parsed.message),
    )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def logs_ingest(request):
    token = settings.LOGS_INGEST_TOKEN
    if not token:
        return Response({"detail": "ingest disabled"}, status=503)
    provided = request.headers.get("X-Logs-Token", "")
    if not hmac.compare_digest(provided.encode(), token.encode()):
        return Response(status=403)
    events = request.data if isinstance(request.data, list) else []
    if len(events) > MAX_BATCH:
        return Response({"detail": f"batch exceeds {MAX_BATCH} events"}, status=413)

    log_rows, activity_rows = [], []
    for raw in events:
        if not isinstance(raw, dict):
            continue
        parsed = parse_event(raw)
        if parsed is None:
            continue
        if parsed.activity is not None:
            activity_rows.append(_request_event(parsed))
        elif passes_floor(parsed.container, parsed.level):
            log_rows.append(
                LogEntry(
                    ts=parsed.ts,
                    container=parsed.container,
                    stream=parsed.stream,
                    level=parsed.level,
                    logger_name=parsed.logger_name,
                    tenant=parsed.tenant,
                    user_label=parsed.user_label,
                    message=parsed.message,
                    line_hash=line_digest(parsed.message),
                )
            )
    LogEntry.objects.bulk_create(log_rows, ignore_conflicts=True, batch_size=500)
    RequestEvent.objects.bulk_create(activity_rows, ignore_conflicts=True, batch_size=500)
    return Response({"accepted": len(events), "logs": len(log_rows), "activity": len(activity_rows)})
