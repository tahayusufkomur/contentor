"""Payload-parsing helpers shared by the platform and Connect webhook handlers.

Pure functions, no Django/DB access — safe to import from either side without
creating a cycle.
"""

from __future__ import annotations

from datetime import UTC, datetime


def _ts_to_dt(ts):
    if ts is None:
        return None
    return datetime.fromtimestamp(int(ts), tz=UTC)


def _sub_period(sub_obj):
    """(start, end) datetimes for a Stripe Subscription payload, across API versions.

    Pre-2025 versions expose `current_period_start/end` at the top level; newer
    versions (e.g. clover) moved them onto each subscription item.
    """
    start = sub_obj.get("current_period_start")
    end = sub_obj.get("current_period_end")
    if start is None or end is None:
        items = (sub_obj.get("items") or {}).get("data") or []
        if items:
            start = start if start is not None else items[0].get("current_period_start")
            end = end if end is not None else items[0].get("current_period_end")
    return _ts_to_dt(start), _ts_to_dt(end)


def _invoice_subscription_id(invoice) -> str:
    """Subscription id from an Invoice payload, across API versions.

    Legacy versions carry a top-level `subscription`; newer versions moved it to
    `parent.subscription_details.subscription` (and onto each line item).
    """
    sub = invoice.get("subscription")
    if isinstance(sub, dict):
        return sub.get("id") or ""
    if sub:
        return sub
    details = (invoice.get("parent") or {}).get("subscription_details") or {}
    sub = details.get("subscription")
    if isinstance(sub, dict):
        return sub.get("id") or ""
    return sub or ""


def _invoice_period_end(invoice):
    """Billing-period end from an Invoice payload.

    Prefer the first line item's period (the subscription's actual cycle); the
    top-level `period_end` is the invoice's own period and can equal creation
    time for the first invoice.
    """
    lines = (invoice.get("lines") or {}).get("data") or []
    if lines:
        period = lines[0].get("period") or {}
        if period.get("end"):
            return _ts_to_dt(period["end"])
    return _ts_to_dt(invoice.get("period_end"))
