"""Copilot conversation engine: one structured model call per coach message,
returning answer | ask | actions. Actions become confirmable cards backed by
single-use tokens; nothing here writes to the DB.

The system prompt is byte-identical across tenants (prompt-cache rule):
SYSTEM_PROMPT is a module constant and the appended platform KB is
platform-level, fingerprint-cached in help_bot — bytes only change when a
superadmin edits KB addenda. Everything tenant-specific rides in the user turn."""

import json
import logging
from datetime import UTC, datetime
from typing import Annotated, Literal

from django.conf import settings
from django.utils import timezone
from django_tenants.utils import tenant_context
from pydantic import BaseModel, Field

from apps.core import ai as core_ai
from apps.core.copilot import blocks, chrome, content, photos, tokens
from apps.core.onboarding import site_ai

logger = logging.getLogger(__name__)

MAX_TRANSCRIPT = 20
MAX_SELECTIONS = 5

SYSTEM_PROMPT = (
    "You are the coach's site copilot on a website-builder platform for "
    "coaches. You can answer questions about their site, ask a clarifying "
    "question when the request is genuinely ambiguous, or propose concrete "
    "actions. Prefer acting once intent is clear; do not ask about details "
    "you can choose sensibly yourself.\n"
    "Available actions:\n"
    "- edit_pages: rewrite existing page copy from an instruction\n"
    "- add_block: add a new section (types: hero, richText, imageText, "
    "courseGrid, upcomingEvents, storeProducts, pricingPlans, cta, faq, "
    "contact) to a page, with initial field content\n"
    "- remove_block / move_block: by block id from the page digest\n"
    "- create_course: create a DRAFT course (title, description, price, "
    "modules each with lesson titles); the coach reviews and publishes it "
    "from their admin\n"
    "- create_event: schedule a live class (event_kind=live) or an "
    "in-person event (event_kind=onsite, include location), with a future "
    "ISO 8601 scheduled_at — it becomes visible to students once the coach "
    "confirms the card\n"
    "- create_blog_post: create a DRAFT blog post (title, one-sentence "
    "summary, full body_html using simple tags: h2, h3, p, ul, li, strong)\n"
    "- edit_theme: switch the site's color theme; theme must be one of: "
    "ocean, ember, forest, sunset, violet, slate\n"
    "- edit_navbar: change the navbar layout (one of: classic, centered, "
    "split, minimal, pill) and/or its call-to-action button (cta_text plus "
    "cta_href, an internal path like /courses); include only what changes\n"
    "- set_block_image: put a photo from the platform's curated library on "
    "a hero or imageText block (block_id from the digest, plus a short "
    "description of the photo you want, e.g. 'calm sunlit yoga studio, "
    "warm tones'); propose it again with a different description if the "
    "coach wants another style\n"
    "Use block ids and page keys exactly as given in the digest. If the "
    "coach's selection is something you cannot change, say so honestly in "
    "an answer and suggest what you CAN do."
)


class EditPagesAction(BaseModel):
    kind: Literal["edit_pages"]
    instruction: str


class AddBlockAction(BaseModel):
    kind: Literal["add_block"]
    page: str
    block_type: str
    after_block_id: str | None = None
    fields: dict = Field(default_factory=dict)


class RemoveBlockAction(BaseModel):
    kind: Literal["remove_block"]
    page: str
    block_id: str


class MoveBlockAction(BaseModel):
    kind: Literal["move_block"]
    page: str
    block_id: str
    after_block_id: str | None = None


class CourseModuleOutline(BaseModel):
    title: str
    lessons: list[str] = Field(default_factory=list)


class CreateCourseAction(BaseModel):
    kind: Literal["create_course"]
    title: str
    description: str = ""
    price: float = 0
    modules: list[CourseModuleOutline] = Field(default_factory=list)


class CreateEventAction(BaseModel):
    kind: Literal["create_event"]
    event_kind: Literal["live", "onsite"] = "live"
    title: str
    description: str = ""
    scheduled_at: datetime
    location: str = ""
    price: float = 0


class CreateBlogPostAction(BaseModel):
    kind: Literal["create_blog_post"]
    title: str
    summary: str = ""
    body_html: str = ""


class EditThemeAction(BaseModel):
    kind: Literal["edit_theme"]
    theme: str


class EditNavbarAction(BaseModel):
    kind: Literal["edit_navbar"]
    layout: str | None = None
    cta_text: str | None = None
    cta_href: str | None = None


class SetBlockImageAction(BaseModel):
    kind: Literal["set_block_image"]
    page: str
    block_id: str
    description: str = ""


CopilotAction = Annotated[
    EditPagesAction
    | AddBlockAction
    | RemoveBlockAction
    | MoveBlockAction
    | CreateCourseAction
    | CreateEventAction
    | CreateBlogPostAction
    | EditThemeAction
    | EditNavbarAction
    | SetBlockImageAction,
    Field(discriminator="kind"),
]


class CopilotTurn(BaseModel):
    kind: Literal["answer", "ask", "actions"]
    text: str = ""
    actions: list[CopilotAction] = Field(default_factory=list)


def _pages_digest(tenant):
    """Bounded snapshot of the current pages tree for the user turn:
    page key, block ids/types, first 40 chars of each heading."""
    from apps.tenant_config.models import TenantConfig

    with tenant_context(tenant):
        cfg = TenantConfig.objects.first()
        pages = (cfg.pages if cfg else None) or {}
    lines = []
    for page, page_value in pages.items():
        blocks_ = blocks.page_blocks(page_value)
        if blocks_ is None:
            continue
        items = ", ".join(
            f"{b.get('id')}({b.get('type')}: {str(b.get('heading', ''))[:40]})" for b in blocks_ if isinstance(b, dict)
        )
        lines.append(f"{page}: {items}")
    return "\n".join(lines) or "(no pages yet)"


def _chrome_digest(tenant):
    """One-line current theme/navbar state for the user turn."""
    from apps.tenant_config.models import TenantConfig

    with tenant_context(tenant):
        cfg = TenantConfig.objects.first()
    if cfg is None:
        return "Theme: ocean; Navbar: layout=classic, cta=none"
    nav = cfg.navbar_config or {}
    cta = nav.get("cta") or {}
    cta_part = f"'{cta.get('text')}' -> {cta.get('href')}" if cta.get("text") else "none"
    return f"Theme: {cfg.theme}; Navbar: layout={nav.get('layout') or 'classic'}, cta={cta_part}"


def _block_for_image(tenant, page, block_id):
    """Resolve a block's image field and the s3_key of its current photo
    (so the pick can exclude it — "try another" must not return the same
    shot). Raises photos.PhotoOpError for unknown/unsupported blocks."""
    from apps.media.models import Photo
    from apps.tenant_config.models import TenantConfig

    with tenant_context(tenant):
        cfg = TenantConfig.objects.first()
        blocks_ = blocks.page_blocks(((cfg.pages if cfg else None) or {}).get(page))
        if blocks_ is None:
            raise photos.PhotoOpError(f"unknown page: {page}")
        block = next((b for b in blocks_ if isinstance(b, dict) and b.get("id") == block_id), None)
        if block is None:
            raise photos.PhotoOpError(f"no block {block_id} on {page}")
        field = photos.image_field_for(block.get("type"))
        current_id = (block.get(field) or {}).get("photo_id") if isinstance(block.get(field), dict) else None
        exclude_key = None
        if current_id:
            exclude_key = Photo.objects.filter(pk=current_id).values_list("s3_key", flat=True).first()
    return field, exclude_key


def _user_turn(tenant, transcript, selections, message):
    answers = (tenant.wizard_state or {}).get("answers") or {}
    parts = [
        f"Brand: {tenant.name}",
        f"Niche: {answers.get('niche') or 'general'}",
        "Current pages:\n" + _pages_digest(tenant),
        _chrome_digest(tenant),
    ]
    if selections:
        parts.append(
            "The coach clicked these elements as context:\n"
            + json.dumps(list(selections)[:MAX_SELECTIONS], ensure_ascii=False)
        )
    for entry in list(transcript)[-MAX_TRANSCRIPT:]:
        role = "Coach" if entry.get("role") == "coach" else "Assistant"
        parts.append(f"{role}: {str(entry.get('text', ''))[:1000]}")
    parts.append(f"Coach: {str(message)[:2000]}")
    return "\n\n".join(parts)


def _card(tenant, action):
    """Validate one proposed action and turn it into a confirmable card.
    Raises blocks.BlockOpError (or site_ai's ComposeError) when unusable."""
    schema = tenant.schema_name
    if isinstance(action, EditPagesAction):
        pages, extras, _cost = site_ai.preview_edit(tenant, action.instruction)
        changes = site_ai.diff_current(tenant, pages)
        return {
            "kind": "edit_pages",
            "title": action.instruction[:120],
            "detail": f"{len(changes)} field(s) change",
            "changes": changes,
            "token": tokens.stash_action(
                schema, {"kind": "edit_pages", "pages": pages, "extras": extras, "changes_count": len(changes)}
            ),
        }
    if isinstance(action, AddBlockAction):
        block = blocks.build_block(action.block_type, action.fields)
        detail = ", ".join(f"{k}: {v}" for k, v in block.items() if k not in ("id", "type", "enabled"))
        return {
            "kind": "add_block",
            "title": f"Add {action.block_type} to {action.page}",
            "detail": detail[:500],
            "token": tokens.stash_action(
                schema,
                {"kind": "add_block", "page": action.page, "block": block, "after_block_id": action.after_block_id},
            ),
        }
    if isinstance(action, RemoveBlockAction):
        return {
            "kind": "remove_block",
            "title": f"Remove {action.block_id} from {action.page}",
            "detail": "",
            "token": tokens.stash_action(schema, action.model_dump()),
        }
    if isinstance(action, MoveBlockAction):
        return {
            "kind": "move_block",
            "title": f"Move {action.block_id} on {action.page}",
            "detail": "to the top" if action.after_block_id is None else f"after {action.after_block_id}",
            "token": tokens.stash_action(schema, action.model_dump()),
        }
    if isinstance(action, SetBlockImageAction):
        field, exclude_key = _block_for_image(tenant, action.page, action.block_id)
        answers = (tenant.wizard_state or {}).get("answers") or {}
        row = photos.pick_photo(action.description, answers.get("niche"), field=field, exclude_s3_key=exclude_key)
        return {
            "kind": "set_block_image",
            "title": f"Use the photo '{row.title}'",
            "detail": "Ask for a different style anytime — nothing changes until you apply.",
            "image_url": photos.preview_url(row),
            "token": tokens.stash_action(
                schema,
                {
                    "kind": "set_block_image",
                    "page": action.page,
                    "block_id": action.block_id,
                    "field": field,
                    "curated_photo_id": row.pk,
                },
            ),
        }
    if isinstance(action, EditThemeAction):
        theme = chrome.clean_theme(action.theme)
        return {
            "kind": "edit_theme",
            "title": f"Switch theme to {chrome.theme_label(theme)}",
            "detail": "Colors change across the whole site — you can switch back anytime.",
            "token": tokens.stash_action(schema, {"kind": "edit_theme", "theme": theme}),
        }
    if isinstance(action, EditNavbarAction):
        updates = {}
        if action.layout is not None:
            updates["layout"] = chrome.clean_layout(action.layout)
        if action.cta_text:
            updates["cta"] = {"text": action.cta_text[:80], "href": str(action.cta_href or "/courses")[:300]}
        if not updates:
            raise chrome.ChromeOpError("nothing to change on the navbar")
        parts = []
        if "layout" in updates:
            parts.append(f"layout: {updates['layout']}")
        if "cta" in updates:
            parts.append(f"button: '{updates['cta']['text']}' → {updates['cta']['href']}")
        return {
            "kind": "edit_navbar",
            "title": "Update the navbar",
            "detail": ", ".join(parts),
            "token": tokens.stash_action(schema, {"kind": "edit_navbar", "updates": updates}),
        }
    if isinstance(action, CreateCourseAction):
        price = max(action.price, 0)
        params = {
            "title": action.title[:200],
            "description": action.description,
            "price": f"{price:.2f}",
            "pricing_type": "paid" if price > 0 else "free",
            "modules": [
                {"title": m.title[:200], "lessons": [{"title": t[:200]} for t in m.lessons]} for m in action.modules
            ],
        }
        lesson_count = sum(len(m.lessons) for m in action.modules)
        price_label = "free" if price == 0 else params["price"]
        return {
            "kind": "create_course",
            "title": f"Create draft course: {action.title[:120]}",
            "detail": f"{len(action.modules)} module(s), {lesson_count} lesson(s) — {price_label}",
            "token": tokens.stash_action(schema, {"kind": "create_course", "params": params}),
        }
    if isinstance(action, CreateEventAction):
        when = action.scheduled_at if action.scheduled_at.tzinfo else action.scheduled_at.replace(tzinfo=UTC)
        if when <= timezone.now():
            raise content.ContentOpError("event date must be in the future")
        price = max(action.price, 0)
        params = {
            "title": action.title[:200],
            "description": action.description,
            "price": f"{price:.2f}",
            "pricing_type": "paid" if price > 0 else "free",
            "scheduled_at": when.isoformat(),
        }
        if action.event_kind == "onsite":
            params["location"] = action.location[:500]
        label = "onsite event" if action.event_kind == "onsite" else "live class"
        return {
            "kind": "create_event",
            "title": f"Schedule {label}: {action.title[:120]}",
            "detail": f"{when:%b %d, %Y %H:%M} — visible to students once confirmed",
            "token": tokens.stash_action(
                schema, {"kind": "create_event", "event_kind": action.event_kind, "params": params}
            ),
        }
    params = {
        "title": action.title[:200],
        "excerpt": action.summary[:300],
        "body_html": action.body_html,
    }
    return {
        "kind": "create_blog_post",
        "title": f"Draft blog post: {action.title[:120]}",
        "detail": action.summary[:500] or "Draft for your review",
        "token": tokens.stash_action(schema, {"kind": "create_blog_post", "params": params}),
    }


_KB_HEADER = (
    "\n\n# PLATFORM KNOWLEDGE\n"
    "Contentor platform facts (plans, payouts, features) for questions like "
    "'how do I get paid?'. Ground platform answers in this section only — "
    "never invent plan numbers or fees. When pointing the coach somewhere, "
    "use ONLY paths from the ROUTES table below, formatted as a markdown "
    "link like [Payouts](/admin/payouts). If the knowledge does not cover "
    "the question, say so and point to support@contentor.app.\n\n"
)


def _system():
    """SYSTEM_PROMPT + platform KB. Still byte-identical across tenants —
    the KB is platform-level and help_bot's fingerprint cache keeps the
    string stable between addenda edits, so the prompt-cache prefix stays
    warm."""
    from apps.tenant_config import help_bot

    return SYSTEM_PROMPT + _KB_HEADER + help_bot.knowledge_text("coach")


CAP_STEER = (
    "\n\n(Do not ask another clarifying question this conversation — act on "
    "your best interpretation or answer directly.)"
)


def _ask_cap():
    """Superadmin knob (CopilotSettings): max clarifying questions per
    conversation. 0 = uncapped."""
    from apps.core.models import CopilotSettings

    return CopilotSettings.load().max_asks_per_conversation


def _asks_so_far(transcript):
    return sum(
        1 for e in list(transcript) if isinstance(e, dict) and e.get("role") != "coach" and e.get("kind") == "ask"
    )


def run_turn(tenant, transcript, selections, message):
    # Bound the transcript once, up front, to the same trailing window
    # _user_turn applies — the ask-cap count and the model's actual visible
    # context must agree on the same bounded view, or a stale "ask" outside
    # the model's window can spuriously trip the cap.
    windowed_transcript = [e for e in list(transcript) if isinstance(e, dict)][-MAX_TRANSCRIPT:]
    cap = _ask_cap()
    capped = cap > 0 and _asks_so_far(windowed_transcript) >= cap
    user = _user_turn(tenant, windowed_transcript, selections, message)
    if capped:
        user += CAP_STEER
    parsed, cost, _model = core_ai.structured(
        system=_system(),
        user=user,
        output_model=CopilotTurn,
        model=settings.COPILOT_MODEL,
        max_tokens=4000,
    )
    if parsed.kind == "ask" and capped:
        # Hard cap: the question still reads fine as a statement-of-need,
        # but without the quick-reply ask affordance it ends the loop.
        return {"kind": "answer", "text": parsed.text}, cost
    if parsed.kind in ("answer", "ask"):
        return {"kind": parsed.kind, "text": parsed.text}, cost
    cards = []
    drop_reason = None
    for action in parsed.actions:
        try:
            cards.append(_card(tenant, action))
        except (blocks.BlockOpError, chrome.ChromeOpError, content.ContentOpError, photos.PhotoOpError) as exc:
            # User-safe refusal — keep the first reason for the fallback answer.
            logger.info("copilot: dropped unusable action %s", getattr(action, "kind", "?"), exc_info=True)
            drop_reason = drop_reason or str(exc)
        except Exception:  # invalid page/block id, compose failure — drop this card
            logger.info("copilot: dropped unusable action %s", getattr(action, "kind", "?"), exc_info=True)
            continue
    if not cards:
        # Never echo parsed.text here: the model narrates the actions it
        # proposed ("Added a photo…"), and with every card dropped that
        # narration claims changes that never happened.
        text = "I couldn't turn that into a change I can make — could you rephrase?"
        if drop_reason:
            text = f"I couldn't make that change: {drop_reason}. Nothing on your site was changed."
        return {"kind": "answer", "text": text}, cost
    return {"kind": "actions", "text": parsed.text, "actions": cards}, cost
