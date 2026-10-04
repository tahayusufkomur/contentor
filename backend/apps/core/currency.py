"""Tenant charge currency — single source of truth.

Content models (Course, DownloadFile, LiveClass, ...) carry no currency
field: every price on a tenant is denominated in the currency the tenant
charges in (`Tenant.billing_currency`, decided once at tenant creation from the
coach's country and immutable afterwards). Display and Stripe charges must
agree, so anything that renders a content price uses this helper instead of a
hardcoded fallback.
"""

from __future__ import annotations

from django.db import connection

from apps.core.constants import CURRENCY_EUR, CURRENCY_USD

EUROZONE = frozenset("AT BE BG CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK".split())


def currency_for_country(country_code: str | None) -> str:
    """Eurozone country -> EUR; anything else (or unknown, e.g. dev) -> USD."""
    return CURRENCY_EUR if (country_code or "").strip().upper() in EUROZONE else CURRENCY_USD


def tenant_charge_currency(tenant=None) -> str:
    if tenant is None:
        tenant = getattr(connection, "tenant", None)
    return (getattr(tenant, "billing_currency", "") or "").strip() or CURRENCY_USD
