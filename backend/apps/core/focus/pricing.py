"""The Financial Strategist's suggested price and its one line of reasoning
(spec F11, F13 of docs/superpowers/specs/2026-10-18-focus-mode-design.md).
Code only, from her own numbers: a model would have to invent a market range,
so there is none. The suggestion is only ever set from her tap. Each kind's
``suggest_price`` (apps.core.focus.kinds) holds its rule; these are shared."""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from django.utils.translation import gettext_lazy

FALLBACK = gettext_lazy("A common place to start; change it any time")
SETUP = gettext_lazy("The price you gave when you set up your site")


@dataclass(frozen=True)
class Suggestion:
    amount: Decimal
    reason: str


def whole(amount: Decimal) -> Decimal:
    """Whole units of her currency, never below one."""
    return max(Decimal(amount).quantize(Decimal(1), rounding=ROUND_HALF_UP), Decimal(1))
