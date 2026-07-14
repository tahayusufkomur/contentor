"""AI copywriting for the onboarding wizard (phase 2).

One structured call rewrites the copy of the statically-composed pages in
the coach's voice. Trust boundary: the model can ONLY submit text for
(page, block_id) pairs that already exist, only for fields whitelisted for
that block type, clamped to length caps, rich text sanitized. Testimonials
are never writable (no fabricated social proof).

Usage/budget accounting mirrors apps.blog.ai + BlogAiUsage.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from django.conf import settings
from django.db.models import F, Sum
from pydantic import BaseModel, Field

from apps.core import ai as core_ai
from apps.core.models import OnboardingAiUsage
from apps.tenant_config.defaults import sanitize_rich_text

MAX_OUTPUT_TOKENS = 3000
MAX_FAQ_ITEMS = 6
MAX_BLOCK_UPDATES = 40

# The ONLY fields the model may rewrite, per block type. testimonials is
# deliberately absent. hrefs/images/layout are never writable.
WRITABLE_FIELDS = {
    "hero": ("heading", "subheading", "ctaText"),
    "richText": ("heading", "body"),
    "imageText": ("heading", "body"),
    "courseGrid": ("heading",),
    "upcomingEvents": ("heading",),
    "storeProducts": ("heading",),
    "pricingPlans": ("heading", "subheading"),
    "cta": ("heading", "buttonText"),
    "faq": ("heading", "items"),
    "contact": ("heading", "intro"),
}

FIELD_CAPS = {
    "heading": 120,
    "subheading": 200,
    "ctaText": 40,
    "buttonText": 40,
    "intro": 200,
    "body": 2000,
    "q": 150,
    "a": 500,
}


class ComposeError(Exception):
    pass


class _QA(BaseModel):
    q: str = ""
    a: str = ""


class _BlockCopy(BaseModel):
    page: str
    block_id: str
    heading: str | None = None
    subheading: str | None = None
    body: str | None = None
    ctaText: str | None = None
    buttonText: str | None = None
    intro: str | None = None
    items: list[_QA] | None = None  # faq only


class _ComposeResult(BaseModel):
    blocks: list[_BlockCopy] = Field(default_factory=list)


# Static system prompt: byte-identical across tenants (prompt caching) —
# everything tenant-specific goes into the user brief.
SYSTEM_PROMPT = """You write website copy for a solo coach's brand-new platform.

You receive the coach's brief and their site's current pages as a list of
blocks with their writable fields and current placeholder text. Rewrite the
copy in the coach's voice: warm, concrete, second person, no hype.

Hard rules:
- Write in the language named in the brief.
- Only return blocks you are improving; only use the listed writable fields.
- NEVER invent facts, statistics, credentials, student quotes, prices, or
  guarantees. If the brief gives no detail, stay general but warm.
- For faq items, write 3-6 practical questions a NEW student would actually
  ask this coach, with honest, reassuring answers.
- body fields: plain sentences or simple <p>/<ul><li> HTML only.
- Respect the character caps given per field.
"""


def current_month() -> str:
    return datetime.now(UTC).strftime("%Y-%m")


def tenant_usage(tenant_schema: str, month: str | None = None) -> OnboardingAiUsage:
    row, _ = OnboardingAiUsage.objects.get_or_create(
        tenant_schema=tenant_schema, month=month or current_month()
    )
    return row


def record_spend(tenant_schema: str, usd: float) -> None:
    row = tenant_usage(tenant_schema)
    OnboardingAiUsage.objects.filter(pk=row.pk).update(usd_spent=F("usd_spent") + Decimal(str(usd)))


def _record_success(tenant_schema: str) -> None:
    row = tenant_usage(tenant_schema)
    OnboardingAiUsage.objects.filter(pk=row.pk).update(composes_used=F("composes_used") + 1)


def _global_spend(month: str | None = None) -> float:
    total = OnboardingAiUsage.objects.filter(month=month or current_month()).aggregate(
        t=Sum("usd_spent")
    )["t"]
    return float(total or 0)


def compose_available() -> bool:
    if not settings.ONBOARDING_AI_ENABLED:
        return False
    if not core_ai.available():
        return False
    return _global_spend() < settings.ONBOARDING_AI_MONTHLY_BUDGET_USD


def _brief(pages: dict, *, brand_name, niche, description, goals, locale) -> str:
    language = "Turkish" if locale == "tr" else "English"
    lines = [
        "<coach_brief>",
        f"Brand: {brand_name or 'a new coaching brand'}",
        f"Niche: {niche}",
        f"In their own words: {description or '-'}",
        f"They plan to offer: {', '.join(goals) or '-'}",
        f"Write ALL copy in: {language}",
        "</coach_brief>",
        "",
        "<current_pages>",
    ]
    for page_key, page in pages.items():
        for block in page.get("blocks", []):
            writable = WRITABLE_FIELDS.get(block.get("type"), ())
            if not writable:
                continue
            lines.append(f"page={page_key} block_id={block['id']} type={block['type']}")
            for field in writable:
                if field == "items":
                    lines.append(f"  items: {len(block.get('items') or [])} faq entries (write 3-{MAX_FAQ_ITEMS})")
                else:
                    current = str(block.get(field) or "")[:200]
                    lines.append(f'  {field} (max {FIELD_CAPS[field]} chars): "{current}"')
    lines.append("</current_pages>")
    return "\n".join(lines)


def _clamp(value: str, field: str) -> str:
    return str(value)[: FIELD_CAPS[field]].strip()


def _apply(pages: dict, updates: list[_BlockCopy]) -> dict:
    import copy

    out = copy.deepcopy(pages)
    index = {}
    for page_key, page in out.items():
        for block in page.get("blocks", []):
            index[(page_key, block["id"])] = block

    for update in updates[:MAX_BLOCK_UPDATES]:
        block = index.get((update.page, update.block_id))
        if block is None:
            continue
        writable = WRITABLE_FIELDS.get(block.get("type"), ())
        for field in ("heading", "subheading", "ctaText", "buttonText", "intro"):
            value = getattr(update, field)
            if field in writable and value:
                block[field] = _clamp(value, field)
        if "body" in writable and update.body:
            block["body"] = sanitize_rich_text(_clamp(update.body, "body"))
        if "items" in writable and update.items is not None:
            items = [
                {"q": _clamp(item.q, "q"), "a": _clamp(item.a, "a")}
                for item in update.items[:MAX_FAQ_ITEMS]
                if item.q.strip() and item.a.strip()
            ]
            if items:
                block["items"] = items
    return out


def compose_pages(pages: dict, *, brand_name, niche, description, goals, locale, tenant_schema) -> dict:
    """One structured call -> new pages dict with AI copy applied.

    Raises ComposeError on ANY provider/validation failure — the caller
    falls back to the static pages. Spend is recorded even on failure.
    """
    user_prompt = _brief(
        pages, brand_name=brand_name, niche=niche, description=description, goals=goals, locale=locale
    )
    try:
        parsed, cost, _model = core_ai.structured(
            system=SYSTEM_PROMPT,
            user=user_prompt,
            output_model=_ComposeResult,
            model=settings.ONBOARDING_AI_MODEL,
            max_tokens=MAX_OUTPUT_TOKENS,
        )
    except core_ai.AiError as exc:
        record_spend(tenant_schema, float(getattr(exc, "cost_usd", 0) or 0))
        raise ComposeError(str(exc)) from exc
    record_spend(tenant_schema, float(cost or 0))
    result = _apply(pages, parsed.blocks)
    _record_success(tenant_schema)
    return result
