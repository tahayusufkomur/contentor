"""The Designer's two helps in the photo studio: words for a cover (its label, title or subtitle), and four
styles for it, planned as focus mode plans the four covers it drafts (apps.core.focus.covers). Both answer
in the request: a few seconds of the model, never a job.

Words need the model (ai_compose.compose_available); four styles fall back to the fixed ones without it, so
she always has styles to pick from.

Runs inside the tenant context (media is a TENANT_APP).
"""

import json
import logging

from django.conf import settings
from django.db import connection
from pydantic import BaseModel

from apps.core import ai as core_ai
from apps.core.onboarding import ai_compose

from . import designs
from .design_recipe import TEXT_MAX, clean_text

logger = logging.getLogger(__name__)

PARTS = ("label", "title", "subtitle")
OPTIONS = 3
LABEL = "contentor:copilot"
# What each target kind is in focus mode's words (a series of sessions is a class).
FOCUS_KINDS = {"course": "course", "download": "download"}

# Static (prompt caching): what changes per cover travels in the user turn.
WORDS_SYSTEM = (
    "You write the words on the cover image of something a coach sells online: a course, a session or event, "
    "or a download (a guide, a workbook). You are given its facts, the words on the cover now, and which part "
    "to write. Give exactly three options for that part, each a different approach.\n"
    "- label: a small line above the title, 1 to 4 words, at most 30 characters (like '4-week course', "
    "'Free guide', 'Live session', 'Beginners welcome').\n"
    "- title: the cover's headline, at most 60 characters, true to the item's own title: shorter, sharper, "
    "or the same idea in other words.\n"
    "- subtitle: one short line under the title, at most 90 characters: who it is for, or what they get.\n"
    "Write in the language of the facts. Never invent a claim, a result, a number, a date, a price or a "
    "credential the facts do not state. No hashtags, no emoji, no quotation marks."
)


class WordOptions(BaseModel):
    options: list[str]


class AiUnavailableError(Exception):
    """The model cannot be asked right now."""


def available() -> bool:
    return ai_compose.compose_available()


def _facts(design) -> dict:
    rows = designs.target_rows(design.target_kind, design.target_key)
    row = rows[0] if rows else None
    return {
        "kind": FOCUS_KINDS.get(design.target_kind, "class"),
        "title": designs.target_title(design.target_kind, design.target_key),
        "description": (getattr(row, "description", "") or "")[:1500],
    }


def _ask(system: str, turn: dict, output_model, max_tokens: int):
    try:
        parsed, cost, _model = core_ai.structured(
            system=system,
            user=json.dumps(turn, ensure_ascii=False),
            output_model=output_model,
            model=settings.COPILOT_MODEL,
            max_tokens=max_tokens,
            label=LABEL,
            effort="low",
        )
    except core_ai.AiError as exc:
        ai_compose.record_spend(connection.schema_name, getattr(exc, "cost_usd", None) or 0)
        raise
    ai_compose.record_spend(connection.schema_name, cost)
    return parsed


def suggest_words(design, part: str) -> list[str]:
    """Three options for one of the cover's words, each cut to what the cover keeps. Raises AiUnavailableError,
    or core_ai.AiError when the model fails."""
    if not available():
        raise AiUnavailableError
    words = design.recipe.get("words") if isinstance(design.recipe, dict) else {}
    turn = {"part": part, **_facts(design), "now_on_the_cover": words or {}}
    parsed = _ask(WORDS_SYSTEM, turn, WordOptions, 600)
    options = []
    for option in parsed.options:
        text = clean_text(str(option)).strip().strip("\"'“”‘’").strip()[: TEXT_MAX[part]].rstrip()
        if text and text not in options:
            options.append(text)
    return options[:OPTIONS]


def four_styles(design, shown: list[str]) -> list[dict]:
    """Four styles for the cover on its own photo, as clean recipes: the model's plan when it can be asked,
    else (or where it gave fewer) the fixed styles. `shown`: the layouts she has already been shown, which
    the plan avoids and which turn the fixed styles to the next set."""
    from apps.core.focus import covers

    facts = _facts(design)
    styles = []
    if available():
        turn = {
            facts["kind"]: facts["title"],
            "description": facts["description"],
            "level": "",
            "look": designs.site_look({})[0],
            "notes": "",
            "followups": [],
            "earlier_layouts": shown,
        }
        kind = "event" if facts["kind"] == "class" else facts["kind"]
        try:
            styles = _ask(covers.system_for(kind), turn, covers.CoverPlan, 2000).styles
        except core_ai.AiError:
            logger.warning("studio styles: model failed, using the fixed styles schema=%s", connection.schema_name)
    picked = covers._four(styles, len(shown) // covers.COUNT)
    photo_id = designs._recipe_photo(design.recipe)
    return [covers.recipe_for(style, photo_id) for style in picked]
