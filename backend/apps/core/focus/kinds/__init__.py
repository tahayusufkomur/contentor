"""The kinds focus mode can make, each behind its adapter module: its recipe,
its draft record and how that record is priced, checked and put live. The
flow (apps.core.focus.flow) asks ``get(creation.kind)`` for all of it, so
nothing in the flow names a kind. ``FOCUS_KINDS`` turns each one on.

The adapter (the course's in kinds/course.py):
- RECIPE: its questions, in order (recipes.Recipe).
- NOUN: its word in prompts ("course"). NEW_TITLE: a draft's title before she names it.
- SETUP_TOPIC: the /setup answer that seeds the topic's starter tile, or None.
- create_draft(actor, title, answers): the hidden draft's id, or None until a later answer makes it.
- record(record_id): the draft, or None when there is none (yet, or any more).
- payload(record): the record as the studio reads it.
- retitle(record_id, provisional, title): the new title, only while it has the provisional one; True if set.
- set_price(record_id, value): her price ("free" or an amount, or one of its own price tiles' values).
- put_in_plan(record_id, plan): puts it in a membership; None when it cannot be in one.
- suggest_price(record): a pricing.Suggestion from her own numbers, or None.
- price_tiles(creation, record): its own price step's tiles; None for the shared ones.
- not_ready(record): why it cannot go live yet, or "".
- cannot_sell(record): True while it is paid and selling is not open yet.
- go_live(record_id): puts it live.
- FINISH: the finish step's (value, label) options: the go-live one first, the keep one second.
- CLOSING: the dock's closing line for each FINISH value. NOT_READY_LINE: the finish question while not ready.
- ANNOUNCER: the specialist who drafts the announcement after it goes live, or None (no offer).
- announce_facts(record): {"what", "title", "description", "link", "when"} for that announcement.
- apply_tick(record_id, ticked): optional, for a kind with no ANNOUNCER; finish's tick, before go_live.
- COVER: "styles" (four drafted styles), "photo" (a photo only) or None (no cover question).
- cover_target(record): the (target_kind, target_key) its cover Design files under.
- cover_facts(record): {"title", "description"} for the Designer.
- DRAFT_SLOT: the follow-up slot before its drafting.
- skips(creation): the questions it skips for this creation.
- FOUND: the analysis.Found subclass its typed answers are read into. RULES: its own analysis rules.
- UNCLEAR_FIELDS: the fields the analysis may ask a clarify question about.
- apply_found(creation, found): its own fields of a read answer, onto the creation.
- apply_change(creation, found, *, field, text, item, clarified, fresh): its redraft after a read answer.
- apply_clarified(creation, field, value): a clarify answer stored onto its own field; True only when
  the answer gave a count (it reshaped the size)."""

from importlib import import_module
from types import ModuleType

from django.conf import settings

KINDS: dict[str, str] = {"course": "apps.core.focus.kinds.course"}


def get(kind: str) -> ModuleType:
    from ..flow import FlowError

    if kind not in KINDS:
        raise FlowError("unknown_kind")
    return import_module(KINDS[kind])


def enabled() -> list[str]:
    """The kinds switched on, in ``KINDS`` order."""
    return [kind for kind in KINDS if kind in settings.FOCUS_KINDS]
