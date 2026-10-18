"""The Financial Strategist's suggested price and its one line of reasoning
(spec F11, F13 of docs/superpowers/specs/2026-10-18-focus-mode-design.md).
Code only, from her own numbers: a model would have to invent a market range,
so there is none. The suggestion is only ever set from her tap."""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from statistics import median

from django.db import connection
from django.db.models import Count, Q

FALLBACK = "A common place to start; change it any time"
SETUP = "The price you gave when you set up your site"


@dataclass(frozen=True)
class Suggestion:
    amount: Decimal
    reason: str


def suggest(course) -> Suggestion:
    """The first rule that has her numbers: her other courses on sale, the
    price she gave in /setup, else a starting point by the course's size."""
    from apps.courses.models import Course
    from apps.tenant_config.interview_brief import DELEGATE, answers_of, money, parse_price

    # Published only: "sells for" is a claim, and a draft sells nothing.
    others = list(
        Course.objects.filter(pricing_type="paid", price__gt=0, is_published=True)
        .exclude(pk=course.pk)
        .annotate(students=Count("enrollments", filter=Q(enrollments__is_active=True)))
        .order_by("price")
    )
    if others:
        low, high = others[0].price, others[-1].price
        if len(others) == 1:
            reason = f"{others[0].title} sells for {money(low)}"
        else:
            reason = f"Your other courses sell for {money(low)}" + (f"–{money(high)}" if high != low else "")
        best = max(others, key=lambda c: c.students)
        if best.students:
            reason += f"; {best.title} has {best.students} student{'' if best.students == 1 else 's'}"
        return Suggestion(_whole(median(c.price for c in others)), reason)
    given = answers_of(connection.tenant).get("course_price")
    if given != DELEGATE and (price := parse_price(given)):
        return Suggestion(_whole(Decimal(str(price))), SETUP)
    modules = course.modules.count()
    return Suggestion(Decimal(19 if modules <= 1 else 39 if modules <= 3 else 69), FALLBACK)


def _whole(amount: Decimal) -> Decimal:
    """Whole units of her currency, never below one."""
    return max(Decimal(amount).quantize(Decimal(1), rounding=ROUND_HALF_UP), Decimal(1))
