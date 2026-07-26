"""AI course-outline suggestions for the wizard content step.

Frozen system prompt (prompt caching); every coach specific rides the user
turn. Fail-soft by design: a deterministic fallback keeps the wizard moving
when AI is unavailable, over budget, or erroring — a coach must never be
blocked from creating their first course by our model.
"""

import logging

from django.conf import settings
from pydantic import BaseModel

from apps.core import ai as core_ai

from . import ai_compose

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You design first-course outlines for online coaches. Given a coach's niche "
    "and description, propose exactly three distinct, sellable first courses. "
    "Each: a concrete title (<=60 chars), a 1-2 sentence description, and a "
    "suggested price in whole units of their currency (0 for a free intro). "
    "Practical, specific to their niche, never generic."
)
MAX_OUTPUT_TOKENS = 900
MAX_OUTLINES = 3

# Deterministic fallback titles, per locale. TR strings need a native review.
_FALLBACK_COPY = {
    "en": (
        ("Getting Started with {niche}", "A beginner-friendly introduction to {niche}.", 0),
        ("{niche} Fundamentals", "The core skills every {niche} student needs.", 49),
        ("Advanced {niche}", "Go deeper and get real results in {niche}.", 99),
    ),
    "tr": (
        ("{niche} ile Başlangıç", "{niche} konusuna yeni başlayanlar için giriş.", 0),
        ("{niche} Temelleri", "Her {niche} öğrencisinin ihtiyaç duyduğu temel beceriler.", 490),
        ("İleri Seviye {niche}", "{niche} alanında daha derine inin ve gerçek sonuçlar alın.", 990),
    ),
}


class _Outline(BaseModel):
    title: str
    description: str
    suggested_price: int


class _Outlines(BaseModel):
    outlines: list[_Outline]


def _niche_label(brief) -> str:
    return (getattr(brief, "niche", "") or "your topic").replace("_", " ")


def _fallback(brief) -> list[dict]:
    niche = _niche_label(brief)
    locale = getattr(brief, "locale", "en")
    rows = _FALLBACK_COPY.get(locale, _FALLBACK_COPY["en"])
    return [
        {
            "title": title.format(niche=niche.title()),
            "description": description.format(niche=niche),
            "suggested_price": price,
        }
        for title, description, price in rows
    ]


def _user_turn(brief) -> str:
    language = "Turkish" if getattr(brief, "locale", "en") == "tr" else "English"
    return (
        f"Niche: {getattr(brief, 'niche', '') or '-'}\n"
        f"Description: {getattr(brief, 'description', '') or '-'}\n"
        f"They plan to offer: {', '.join(getattr(brief, 'goals', ()) or ()) or '-'}\n"
        f"Write ALL copy in: {language}"
    )


def generate_course_outlines(brief, tenant_schema: str) -> list[dict]:
    """Up to three {title, description, suggested_price} dicts. Never raises."""
    if not ai_compose.compose_available():
        return _fallback(brief)
    try:
        parsed, cost, _ = core_ai.structured(
            system=SYSTEM_PROMPT,
            user=_user_turn(brief),
            output_model=_Outlines,
            model=settings.ONBOARDING_AI_MODEL,
            max_tokens=MAX_OUTPUT_TOKENS,
        )
    except core_ai.AiError as exc:
        ai_compose.record_spend(tenant_schema, float(getattr(exc, "cost_usd", 0) or 0))
        logger.warning("course outline AI failed for %s; using fallback", tenant_schema)
        return _fallback(brief)
    ai_compose.record_spend(tenant_schema, float(cost or 0))
    return [o.model_dump() for o in parsed.outlines[:MAX_OUTLINES]] or _fallback(brief)
