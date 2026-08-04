"""Copilot conversation engine: one structured model call per coach message,
returning answer | ask | actions. Actions become confirmable cards backed by
single-use tokens; nothing here writes to the DB.

The system prompt is a module constant — byte-identical across tenants
(prompt-cache rule). Everything tenant-specific rides in the user turn."""

import json
import logging
from typing import Annotated, Literal

from django.conf import settings
from django_tenants.utils import tenant_context
from pydantic import BaseModel, Field

from apps.core import ai as core_ai
from apps.core.copilot import blocks, tokens
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


CopilotAction = Annotated[
    EditPagesAction | AddBlockAction | RemoveBlockAction | MoveBlockAction,
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


def _user_turn(tenant, transcript, selections, message):
    answers = (tenant.wizard_state or {}).get("answers") or {}
    parts = [
        f"Brand: {tenant.name}",
        f"Niche: {answers.get('niche') or 'general'}",
        "Current pages:\n" + _pages_digest(tenant),
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
    return {
        "kind": "move_block",
        "title": f"Move {action.block_id} on {action.page}",
        "detail": "to the top" if action.after_block_id is None else f"after {action.after_block_id}",
        "token": tokens.stash_action(schema, action.model_dump()),
    }


def run_turn(tenant, transcript, selections, message):
    parsed, cost, _model = core_ai.structured(
        system=SYSTEM_PROMPT,
        user=_user_turn(tenant, transcript, selections, message),
        output_model=CopilotTurn,
        model=settings.COPILOT_MODEL,
        max_tokens=4000,
    )
    if parsed.kind in ("answer", "ask"):
        return {"kind": parsed.kind, "text": parsed.text}, cost
    cards = []
    for action in parsed.actions:
        try:
            cards.append(_card(tenant, action))
        except Exception:  # invalid page/block id, compose failure — drop this card
            logger.info("copilot: dropped unusable action %s", getattr(action, "kind", "?"), exc_info=True)
            continue
    if not cards:
        text = parsed.text or "I couldn't turn that into a change I can make — could you rephrase?"
        return {"kind": "answer", "text": text}, cost
    return {"kind": "actions", "text": parsed.text, "actions": cards}, cost
