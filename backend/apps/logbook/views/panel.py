# backend/apps/logbook/views/panel.py
"""Superadmin list + facet endpoints for the /admin/logs page.

Faceted-search semantics: each facet dimension is counted under every OTHER
active filter (plus q/since/until) but never its own — picking level=ERROR
narrows the container options to containers that HAVE errors, while the level
facet itself keeps showing the alternatives. Zero-count options are omitted.

Malformed `since`/`until`/`cursor` params — and, on the activity endpoints,
`status_class`/`ip` — are rejected with 400 (never silently ignored — an
unfiltered result mid-incident is worse than an error); the shared helpers
raise DRF ValidationError so every endpoint reusing them enforces the same
contract."""

from __future__ import annotations

import ipaddress
from datetime import datetime

from django.db.models import Count, Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.core.permissions import IsSuperUser

from ..models import LogEntry, RequestEvent

PAGE_SIZE = 100
FACET_LIMIT = 20

LOG_FIELDS = ("id", "ts", "container", "stream", "level", "logger_name", "tenant", "user_label", "message")
ACTIVITY_FIELDS = (
    "id",
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


def _multi(params, name):
    raw = (params.get(name) or "").strip()
    return [v.strip() for v in raw.split(",") if v.strip()] if raw else []


def _parse_dt(value):
    """ISO-8601 → aware datetime, Z tolerated; None when absent OR unparseable.

    Pure parser — callers decide whether a present-but-unparseable value is a
    400 (`_apply_time_and_q` and `_paginate` both do)."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _apply_time_and_q(qs, params, q_field):
    for name, lookup in (("since", "ts__gte"), ("until", "ts__lt")):
        raw = (params.get(name) or "").strip()
        if not raw:
            continue
        parsed = _parse_dt(raw)
        if parsed is None:
            raise ValidationError({"detail": f"invalid '{name}' timestamp"})
        qs = qs.filter(**{lookup: parsed})
    q = (params.get("q") or "").strip()
    if q:
        qs = qs.filter(**{f"{q_field}__icontains": q})
    return qs


def _log_filters(params, skip=""):
    """Field filters for LogEntry; `skip` omits one dimension (facet self)."""
    spec = {"level": "level", "container": "container", "tenant": "tenant", "user": "user_label"}
    filters = Q()
    for param, field in spec.items():
        if param == skip:
            continue
        values = _multi(params, param)
        if values:
            filters &= Q(**{f"{field}__in": values})
    return filters


def _log_queryset(params, skip=""):
    qs = LogEntry.objects.filter(_log_filters(params, skip=skip))
    return _apply_time_and_q(qs, params, "message")


def _paginate(qs, params, fields):
    cursor = (params.get("cursor") or "").strip()
    if cursor:
        ts_raw, sep, id_raw = cursor.partition("|")
        cts = _parse_dt(ts_raw)
        if not sep or cts is None or not id_raw.isdigit():
            raise ValidationError({"detail": "invalid cursor"})
        qs = qs.filter(Q(ts__lt=cts) | (Q(ts=cts) & Q(id__lt=int(id_raw))))
    rows = list(qs.order_by("-ts", "-id").values(*fields)[: PAGE_SIZE + 1])
    next_cursor = None
    if len(rows) > PAGE_SIZE:
        rows = rows[:PAGE_SIZE]
        last = rows[-1]
        next_cursor = f"{last['ts'].isoformat()}|{last['id']}"
    for r in rows:
        r["ts"] = r["ts"].isoformat()
    return {"results": rows, "next_cursor": next_cursor}


def _facet(build_qs, params, param_name, field, limit=None, extra_q=None):
    qs = build_qs(params, skip=param_name)
    if extra_q:
        qs = qs.filter(extra_q)
    counts = qs.exclude(**{field: ""}).values(field).annotate(count=Count("id")).order_by("-count", field)
    if limit:
        counts = counts[:limit]
    return [{"value": row[field], "count": row["count"]} for row in counts]


@api_view(["GET"])
@permission_classes([IsSuperUser])
def platform_logs(request):
    return Response(_paginate(_log_queryset(request.query_params), request.query_params, LOG_FIELDS))


@api_view(["GET"])
@permission_classes([IsSuperUser])
def platform_logs_facets(request):
    params = request.query_params
    users_q = (params.get("users_q") or "").strip()
    users_extra = Q(user_label__icontains=users_q) if users_q else None
    return Response(
        {
            "levels": _facet(_log_queryset, params, "level", "level"),
            "containers": _facet(_log_queryset, params, "container", "container"),
            "tenants": _facet(_log_queryset, params, "tenant", "tenant", limit=FACET_LIMIT),
            "users": _facet(_log_queryset, params, "user", "user_label", limit=FACET_LIMIT, extra_q=users_extra),
        }
    )


_STATUS_CLASSES = {"2xx": (200, 300), "3xx": (300, 400), "4xx": (400, 500), "5xx": (500, 600)}


def _status_class_q(values):
    """OR of status ranges; callers validate values against `_STATUS_CLASSES` first."""
    q = Q()
    for v in values:
        lo, hi = _STATUS_CLASSES[v]
        q |= Q(status__gte=lo, status__lt=hi)
    return q


def _activity_queryset(params, skip=""):
    spec = {"kind": "kind", "method": "method", "tenant": "tenant", "user": "user_label", "session": "session_id"}
    filters = Q()
    for param, field in spec.items():
        if param == skip:
            continue
        values = _multi(params, param)
        if values:
            filters &= Q(**{f"{field}__in": values})
    # status_class/ip are validated even when their dimension is skipped —
    # a malformed param is a 400 regardless of which facet build sees it first.
    classes = _multi(params, "status_class")
    if any(v not in _STATUS_CLASSES for v in classes):
        raise ValidationError({"detail": "invalid 'status_class' value"})
    if classes and skip != "status_class":
        filters &= _status_class_q(classes)
    ip = (params.get("ip") or "").strip()
    if ip:
        try:
            ipaddress.ip_address(ip)
        except ValueError as exc:
            raise ValidationError({"detail": "invalid 'ip' address"}) from exc
        if skip != "ip":
            filters &= Q(ip=ip)
    qs = RequestEvent.objects.filter(filters)
    return _apply_time_and_q(qs, params, "path")


@api_view(["GET"])
@permission_classes([IsSuperUser])
def platform_activity(request):
    return Response(_paginate(_activity_queryset(request.query_params), request.query_params, ACTIVITY_FIELDS))


@api_view(["GET"])
@permission_classes([IsSuperUser])
def platform_activity_facets(request):
    params = request.query_params
    status_counts = []
    base = _activity_queryset(params, skip="status_class")
    for name, (lo, hi) in _STATUS_CLASSES.items():
        count = base.filter(status__gte=lo, status__lt=hi).count()
        if count:
            status_counts.append({"value": name, "count": count})
    return Response(
        {
            "kinds": _facet(_activity_queryset, params, "kind", "kind"),
            "methods": _facet(_activity_queryset, params, "method", "method"),
            "status_classes": status_counts,
            "tenants": _facet(_activity_queryset, params, "tenant", "tenant", limit=FACET_LIMIT),
            "users": _facet(_activity_queryset, params, "user", "user_label", limit=FACET_LIMIT),
        }
    )
