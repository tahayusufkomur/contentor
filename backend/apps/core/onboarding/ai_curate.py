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
