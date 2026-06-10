"""Tenant charge currency — single source of truth.

Content models (Course, DownloadFile, LiveClass, ...) carry no currency
field: every price on a tenant is denominated in the currency the tenant
charges in. That is the connected account's currency
(`Tenant.billing_currency`, locked at the coach's first platform checkout),
falling back to the region default. Display and Stripe charges must agree,
so anything that renders a content price uses this helper instead of a
hardcoded fallback.
"""

from __future__ import annotations

from django.db import connection

from apps.core.constants import REGION_DEFAULT_CURRENCY


def tenant_charge_currency(tenant=None) -> str:
    if tenant is None:
        tenant = getattr(connection, "tenant", None)
    cur = (getattr(tenant, "billing_currency", "") or "").strip()
    if cur:
        return cur
    region = getattr(tenant, "region", "") or "global"
    return REGION_DEFAULT_CURRENCY.get(region, "USD")
