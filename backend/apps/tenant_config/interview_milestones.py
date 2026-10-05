"""Work the interview brief unlocks — page builds, first-content drafts, logo
ranking — each fired exactly once when its facts are settled; plus the look
cards (style, logo) and applying the coach's picks.

Order matters: Home is built first and plans the whole site (site_composer
.plan_site caches the plan); other pages reuse that plan.
ponytail: a page fired while Home's plan call is still running plans again
(one extra AI call); serialize builds if that cost shows up.
"""

import logging

from django.core.cache import cache
from django.db import transaction
from django_tenants.utils import schema_context

from . import interview_brief as brief
from .models import TenantConfig
from .setup_items import _live_entitled

logger = logging.getLogger(__name__)

PAGE_NEEDS = {
    "home": ("teaches", "audience", "outcome", "offers", "pitch"),
    "about": ("teaches", "story", "credentials", "tone"),
    "contact": ("contact", "location"),
    "faq": ("offers", "sells", "course_price", "live_when"),
}
DRAFT_NEEDS = {
    "course": ("course_topic", "course_format", "course_level", "sells", "course_price"),
    "event": ("live_topic", "live_when"),
    "post": ("article_topic",),
}
DRAFT_OFFERS = {"event": ("live", "onsite"), "post": ("articles",)}
LOGO_PAGE = 3


class ChoiceError(Exception):
    """A refused card/chip pick (400) — the message is the machine-readable detail."""


# ── firing ───────────────────────────────────────────────────────────────────


def _due(tenant, answers) -> list[str]:
    offers = set(answers.get("offers") or [])
    if not brief.settled(answers, PAGE_NEEDS["home"]):
        return []
    due = ["style:auto", "page:home", "rank:logos"]
    due += [f"page:{p}" for p in ("about", "contact", "faq") if brief.settled(answers, PAGE_NEEDS[p])]
    for kind, needs in DRAFT_NEEDS.items():
        wanted = kind not in DRAFT_OFFERS or offers.intersection(DRAFT_OFFERS[kind])
        if kind == "event" and wanted and not _live_entitled(tenant):
            wanted = False  # free plan: go-live offers the plan, then this fires
        if wanted and brief.settled(answers, needs):
            due.append(f"draft:{kind}")
    return due


def fire(tenant, answers: dict) -> list[str]:
    """Start every newly-due milestone; returns the keys fired by THIS call.
    The fired set is read and written under the setup_flow row lock, so two
    racing turns can never fire the same milestone twice."""
    from .setup_flow import _update_flow

    due = _due(tenant, answers)
    if not due:
        return []
    fired_now: list[str] = []

    def mutate(_config, flow):
        interview = dict(flow.get("interview") or {})
        already = list(interview.get("fired") or [])
        fired_now.extend(k for k in due if k not in already)
        interview["fired"] = already + fired_now
        flow["interview"] = interview
        statuses = dict(flow.get("draft_status") or {})
        for key in fired_now:
            if key.startswith("draft:"):
                statuses[key.removeprefix("draft:")] = "building"
        flow["draft_status"] = statuses

    _update_flow(tenant, mutate)
    for key in fired_now:
        _start(tenant, answers, key)
    return fired_now


def _start(tenant, answers, key) -> None:
    from apps.core import tasks
    from apps.core.onboarding.wizard_catalog import recommended_style

    from .setup_flow import start_page_build

    action, _, arg = key.partition(":")
    tenant_id = tenant.id
    if action == "style" and not brief.is_settled(answers, "site_style"):
        apply_style(tenant, recommended_style(answers.get("niche") or "general"))
    elif action == "page":
        start_page_build(tenant, arg)
    elif action == "rank":
        transaction.on_commit(lambda: tasks.rank_curated_logos.delay(tenant_id))
    elif action == "draft":
        prompt = draft_prompt(answers, arg)
        transaction.on_commit(lambda: tasks.interview_draft_task.delay(tenant_id, arg, prompt))


# ── drafts ───────────────────────────────────────────────────────────────────


def _val(answers, field_id, default) -> str:
    if field_id in (answers.get("delegated") or []) or answers.get(field_id) in (None, ""):
        return default
    return str(answers[field_id])


def draft_prompt(answers: dict, kind: str) -> str:
    if kind == "course":
        price = answers.get("course_price")
        if answers.get("sells") != "paid" or price == 0:
            price_text = "free"
        elif price is None:
            price_text = "a fair price for this niche"
        else:
            price_text = f"{price:g}"
        topic = _val(answers, "course_topic", "you choose a strong first course for my students")
        return (
            f"My first course. Topic: {topic}. "
            f"Format: {_val(answers, 'course_format', 'you choose')}. "
            f"Level: {_val(answers, 'course_level', 'beginners')}. "
            f"For: {_val(answers, 'audience', 'my students')}. Price: {price_text}."
        )
    if kind == "event":
        offers = answers.get("offers") or []
        where = "in person" if "onsite" in offers and "live" not in offers else "online"
        return (
            f"My first {where} class. Topic: {_val(answers, 'live_topic', 'you choose')}. "
            f"When: {_val(answers, 'live_when', 'an evening that suits my students')}."
        )
    return f"My first article. Topic: {_val(answers, 'article_topic', 'you choose something useful for my students')}."


def _set_draft_status(tenant, kind, status) -> None:
    from .setup_flow import _update_flow

    def mutate(_config, flow):
        flow["draft_status"] = {**(flow.get("draft_status") or {}), kind: status}

    _update_flow(tenant, mutate)


def run_draft(tenant, kind: str, prompt: str) -> None:
    """AI draft, else the deterministic fallback. Inside tenant_context."""
    from apps.accounts.models import User
    from apps.core import ai as core_ai
    from apps.core.copilot.content import ContentOpError

    from . import setup_flow

    owner = User.objects.filter(role="owner").order_by("id").first()
    status = "ready"
    try:
        setup_flow.create_draft(tenant, owner, kind, prompt)
    except (core_ai.AiError, ContentOpError):
        logger.warning("interview draft fell back schema=%s kind=%s", tenant.schema_name, kind, exc_info=True)
        try:
            setup_flow.create_fallback_draft(tenant, owner, kind, brief.answers_of(tenant))
        except ContentOpError:
            logger.exception("interview fallback draft failed schema=%s kind=%s", tenant.schema_name, kind)
            status = "failed"
    _set_draft_status(tenant, kind, status)
    if kind == "course" and status == "ready":
        setup_flow.start_page_build(tenant, "courses")


# ── look: cards and picks ────────────────────────────────────────────────────


def style_cards(answers: dict) -> dict:
    from apps.core.onboarding.wizard_catalog import recommended_style

    from . import sections

    enabled = sorted(sections.enabled_styles().values(), key=lambda s: s.get("order", 0))
    first = recommended_style(answers.get("niche") or "general")
    ordered = sorted(enabled, key=lambda s: s["id"] != first)[:2]
    return {
        "kind": "style",
        "options": [
            {"value": s["id"], "label": s.get("label") or s["id"], "detail": s.get("mood", "")} for s in ordered
        ],
    }


def logo_cards(tenant, answers: dict, page: int = 0) -> dict:
    from apps.core.copilot.logos import preview_url
    from apps.core.models import CuratedLogo
    from apps.core.onboarding.ai_curate import CoachBrief, shortlist

    with schema_context("public"):
        rows = list(CuratedLogo.objects.filter(enabled=True).order_by("position", "id"))
    by_id = {r.pk: r for r in rows}
    ranked = [by_id[i] for i in (tenant.wizard_state or {}).get("curated_logo_rank") or [] if i in by_id]
    ordered = ranked or shortlist(rows, CoachBrief.from_tenant(tenant), limit=24)
    chunk = ordered[page * LOGO_PAGE : (page + 1) * LOGO_PAGE]
    return {
        "kind": "logo",
        "page": page,
        "more": len(ordered) > (page + 1) * LOGO_PAGE,
        "options": [{"value": str(r.pk), "label": r.title, "image_url": preview_url(r)} for r in chunk],
    }


def cards_for(tenant, answers: dict, field_id: str | None) -> dict | None:
    if field_id == "site_style":
        return style_cards(answers)
    if field_id == "site_logo":
        return logo_cards(tenant, answers)
    return None


def _bust(tenant) -> None:
    cache.delete(f"tenant:{tenant.schema_name}:config")


def apply_style(tenant, style_id: str) -> None:
    """Same effect as the copilot's edit_style: every block takes the style's
    layout (no AI), and the `look` publish blocker clears."""
    from . import sections

    with transaction.atomic():
        cfg = TenantConfig.objects.select_for_update().first()
        cfg.style = style_id
        cfg.pages = sections.restyle_pages(cfg.pages or {}, style_id)
        cfg.setup_progress = {**(cfg.setup_progress or {}), "look_edited": True}
        cfg.save(update_fields=["style", "pages", "setup_progress"])
    _bust(tenant)


def apply_logo(tenant, answers: dict) -> None:
    from apps.core.onboarding.compose import apply_wizard_logo

    with transaction.atomic():
        cfg = TenantConfig.objects.select_for_update().first()
        cfg.logo = None  # switching back to a text logo must clear a picked mark
        cfg.logo_url = ""
        apply_wizard_logo(cfg, answers, tenant)
        cfg.save()
    _bust(tenant)


def choose(tenant, answers: dict, field_id: str, value) -> None:
    """A tapped card or chip. Mutates ``answers``; the caller saves them."""
    from apps.core.models import CuratedLogo
    from apps.core.onboarding.wizard_catalog import recommended_style

    from . import sections

    if value == brief.DELEGATE:
        if not brief.delegate(answers, field_id):
            raise ChoiceError("unknown_field")
        if field_id == "site_style":
            apply_style(tenant, recommended_style(answers.get("niche") or "general"))
        elif field_id == "site_logo":
            answers["logo"] = {"mode": "wordmark", "curated_id": None}
            apply_logo(tenant, answers)
        return
    if field_id == "site_style":
        if value not in sections.enabled_styles():
            raise ChoiceError("unknown_style")
        answers["site_style"] = answers["style"] = value
        apply_style(tenant, value)
        return
    if field_id == "site_logo":
        if value == "wordmark":
            logo = {"mode": "wordmark", "curated_id": None}
        else:
            try:
                logo_id = int(value)
            except (TypeError, ValueError):
                raise ChoiceError("unknown_logo") from None
            with schema_context("public"):
                if not CuratedLogo.objects.filter(pk=logo_id, enabled=True).exists():
                    raise ChoiceError("unknown_logo")
            logo = {"mode": "curated", "curated_id": logo_id}
        answers["site_logo"] = str(value)
        answers["logo"] = logo
        apply_logo(tenant, answers)
        return
    if not brief.apply_fact(answers, field_id, value):
        raise ChoiceError("invalid_value")
