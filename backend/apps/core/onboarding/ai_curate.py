"""Shared foundation for the onboarding AI touch (curated photos, logo rank).

One CoachBrief per tenant, assembled from wizard_state, feeds every AI-touch
call. The prefilter is deliberately non-LLM (same idea as apps.blog.curated):
lowercase token overlap between the coach's own words and each catalog row's
tags/title, so one cheap structured call only ever sees a shortlist.
Spec: docs/superpowers/specs/2026-07-19-ai-touch-onboarding-design.md
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from django.conf import settings
from django_tenants.utils import schema_context
from pydantic import BaseModel, Field

from apps.core import ai as core_ai


@dataclass(frozen=True)
class CoachBrief:
    niche: str = "general"
    description: str = ""
    followups: tuple[tuple[str, str], ...] = ()
    goals: tuple[str, ...] = ()
    theme: str = "ocean"
    font_family: str = "Inter"
    brand_name: str = ""
    locale: str = "en"

    @classmethod
    def from_tenant(cls, tenant, locale: str = "en") -> CoachBrief:
        answers = (tenant.wizard_state or {}).get("answers") or {}
        followups = tuple(
            (str(item.get("q") or "").strip(), str(item.get("a") or "").strip())
            for item in ((answers.get("description_followups") or {}).get("items") or [])
            if str(item.get("q") or "").strip() and str(item.get("a") or "").strip()
        )
        return cls(
            niche=answers.get("niche") or "general",
            description=str(answers.get("description") or ""),
            followups=followups,
            goals=tuple(answers.get("goals") or ()),
            theme=answers.get("theme") or "ocean",
            font_family=answers.get("font_family") or "Inter",
            brand_name=tenant.name or "",
            locale=locale,
        )


def brief_block(brief: CoachBrief) -> str:
    """Tenant-specific prompt section. Static system prompts must stay
    byte-identical across tenants (prompt caching) — everything coach-specific
    goes through here."""
    language = "Turkish" if brief.locale == "tr" else "English"
    lines = [
        "<coach_brief>",
        f"Brand: {brief.brand_name or 'a new coaching brand'}",
        f"Niche: {brief.niche}",
        f"In their own words: {brief.description or '-'}",
    ]
    for q, a in brief.followups:
        lines.append(f'Asked: "{q}" — coach answered: "{a}"')
    lines += [
        f"They plan to offer: {', '.join(brief.goals) or '-'}",
        f"Site theme: {brief.theme}; font: {brief.font_family}",
        f"The coach writes in: {language}",
        "</coach_brief>",
    ]
    return "\n".join(lines)


def tokens(text: str) -> set[str]:
    return {w for w in re.split(r"[^\w]+", (text or "").lower()) if len(w) >= 3}


def brief_tokens(brief: CoachBrief) -> set[str]:
    parts = [brief.niche.replace("_", " "), brief.description]
    parts += [f"{q} {a}" for q, a in brief.followups]
    return tokens(" ".join(parts))


def shortlist(rows, brief: CoachBrief, *, limit: int = 40) -> list:
    """Top `limit` catalog rows by token overlap with the coach's own words;
    catalog position breaks ties, zero-score rows fill the tail (a thin match
    must not shrink the model's choice set to nothing)."""
    bt = brief_tokens(brief)

    def score(row) -> int:
        return len(bt & (tokens(row.tags.replace(",", " ")) | tokens(row.title)))

    return sorted(rows, key=lambda r: (-score(r), r.position, r.pk))[:limit]


LOGO_RANK_TOP = 24
LOGO_RANK_POOL = 60
LOGO_RANK_MAX_TOKENS = 600


class _LogoRank(BaseModel):
    logo_ids: list[int] = Field(default_factory=list)


# Static system prompt: byte-identical across tenants (prompt caching).
LOGO_RANK_SYSTEM_PROMPT = """You rank ready-made logo marks for a solo coach's new brand.

You receive the coach's brief and a candidate list of logo marks (id, title,
tags). Return logo_ids: the candidate ids ordered best-fit first — subject
match with the coach's niche and their own description weighs most, then
overall style fit. Return at most 24 ids; ids must come from the list.
"""


def rank_logos(brief: CoachBrief, *, tenant_schema: str) -> list[int]:
    """One structured call -> ordered CuratedLogo ids (validated, deduped,
    capped). Re-raises core_ai.AiError upward — an empty result is not the
    same as a failure, so callers treat exceptions as "no rank"."""
    from apps.core.models import CuratedLogo
    from apps.core.onboarding import ai_compose

    with schema_context("public"):
        rows = list(CuratedLogo.objects.filter(enabled=True).order_by("position", "id"))
    pool = shortlist(rows, brief, limit=LOGO_RANK_POOL)
    if not pool:
        return []
    lines = [brief_block(brief), "", "<curated_logos>"]
    lines += [f'{r.pk}: "{r.title}" tags: {r.tags}' for r in pool]
    lines.append("</curated_logos>")
    try:
        parsed, cost, _model = core_ai.structured(
            system=LOGO_RANK_SYSTEM_PROMPT,
            user="\n".join(lines),
            output_model=_LogoRank,
            model=settings.ONBOARDING_AI_MODEL,
            max_tokens=LOGO_RANK_MAX_TOKENS,
        )
    except core_ai.AiError as exc:
        ai_compose.record_spend(tenant_schema, float(getattr(exc, "cost_usd", 0) or 0))
        raise
    ai_compose.record_spend(tenant_schema, float(cost or 0))
    valid = {r.pk for r in pool}
    out: list[int] = []
    for logo_id in parsed.logo_ids:
        if logo_id in valid and logo_id not in out:
            out.append(logo_id)
    return out[:LOGO_RANK_TOP]
