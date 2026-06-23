from __future__ import annotations

import math

from django.conf import settings


def compute_price(cost_minor_usd: int, currency: str) -> tuple[int, float]:
    """Coach-facing yearly price in `currency` minor units, plus the fx rate used.

    price = ceil( cost_usd * fx * markup ) rounded UP to the whole currency unit.
    """
    rates = settings.DOMAINS_FX_RATES
    fx = float(rates.get(currency, rates["USD"]))
    markup = float(settings.DOMAINS_MARKUP_MULTIPLIER)
    marked_up_minor = cost_minor_usd * fx * markup
    # round up to the whole unit (multiple of 100 minor units)
    whole_units = math.ceil(marked_up_minor / 100.0)
    return whole_units * 100, fx
