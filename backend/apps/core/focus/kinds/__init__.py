"""The kinds focus mode can make, each behind its adapter module: its recipe,
its draft record and how that record is priced, checked and put live. The
flow (apps.core.focus.flow) asks ``get(creation.kind)`` for all of it, so
nothing in the flow names a kind. ``FOCUS_KINDS`` turns each one on.

The adapter (the course's in kinds/course.py):
- RECIPE: its questions, in order (recipes.Recipe).
- NOUN: its word in prompts ("course"). NEW_TITLE: a draft's title before she names it.
- SETUP_TOPIC: the /setup answer that seeds the topic's starter tile, or None.
- STARTERS: optional, (label, starter) tiles on its first question, each filling her answer box to finish.
- topic_tiles(): optional, its first question's tiles (a membership's tiers), in place of SETUP_TOPIC's.
- create_draft(actor, title, answers): the hidden draft's id, or None until a later answer makes it.
- record(record_id): the draft, or None when there is none (yet, or any more). ``record_id`` is the
  kind's own int: the event's packs the row's pk and which of its four models (kinds/event.py).
- payload(record): the record as the studio reads it; its "kind" (else the kind's) and "id" key the page's live record.
- owned_by(record, user): optional, whether she made it (the plain form's timing stamp); else its instructor.
- retitle(record_id, provisional, title): the new title, only while it has the provisional one; True if set.
- set_price(record_id, value): her price ("free" or an amount, or one of its own price tiles' values); None
  for a kind with no access step (no price: flow._set_price keeps none).
- put_in_plan(record_id, plan): puts it in a membership; None when it cannot be in one.
- suggest_price(record): a pricing.Suggestion from her own numbers, or None.
- price_tiles(creation, record): its own price step's tiles; None for the shared ones.
- not_ready(record): why it cannot go live yet, or "".
- cannot_sell(record): True while it is paid and selling is not open yet.
- go_live(record_id): puts it live.
- keep(record_id): optional, what "Keep as a draft" does to it (the draft is already hidden).
- FINISH: the finish step's (value, label) options: the go-live one first, the keep one second.
- CLOSING: the dock's closing line for each FINISH value, or a function of the record giving it (after
  go_live: "Scheduled for ..."). NOT_READY_LINE: the finish question while not ready.
- ANNOUNCER: the specialist who drafts the announcement after it goes live, or None (no offer).
- announce_facts(record): {"what", "title", "description", "link", "when"} for that announcement; None without
  an ANNOUNCER.
- apply_tick(record_id, ticked): optional, for a kind with no ANNOUNCER; finish's tick, before go_live.
- COVER: "styles" (four drafted styles), "photo" (a photo only) or None (no cover question).
- cover_target(record): the (target_kind, target_key) its cover Design files under. None without a COVER.
- cover_facts(record): {"title", "description"} for the Designer. None without a COVER.
- DRAFT_SLOT: the follow-up slot before its drafting. DRAFT_WHAT: what that drafting writes, in the
  follow-up's prompt ("title, description, modules and lessons").
- start_draft(creation, instruction=""): its drafting for the review step (the course's outline, the
  copy job for the others), and each redraft with her words; called once, when every question before
  the review is answered or skipped. REVIEWED_LINE: the dock's line after her "Looks good", or None.
- sync(creation): optional, after every answer: her answers it keeps on the record, written there (a
  ``multi`` question's tap arrives as its tiles' values, comma-separated, for ``sync`` to check).
- ask(creation, asked): optional, a question in its own words for this creation (``flow.question``).
- label(field, answer): optional, her answered line in its own words (a tile ``ask`` drew), or None.
- skips(creation): the questions it skips for this creation.
- FOUND: the analysis.Found subclass its typed answers are read into. RULES: its own analysis rules.
- UNCLEAR_FIELDS: the fields the analysis may ask a clarify question about.
- apply_found(creation, found): its own fields of a read answer, onto the creation.
- apply_change(creation, found, *, field, text, item, clarified, fresh): its redraft after a read answer.
- apply_clarified(creation, field, value): a clarify answer stored onto its own field; True only when
  the answer gave a count (it reshaped the size).

A kind the copy job drafts (its start_draft is copywriter.start) also has, all four or none (the course
has none; ``copywriter.drafts`` checks for them):
- COPY_FIELDS: the record's fields it writes, in order, its title first (("title", "description"); a plan's
  ("name", "description")).
- COPY_RULES: what to write, appended to the copy job's shared prompt.
- copy_facts(creation, record): what it writes from: her answers, brief and notes, her site, and its own.
- write_copy(record_id, fields): those fields onto the record (the job checked each is still its own).
- clean_copy(fields): optional, the model's fields as the record keeps them (a message's body as safe
  HTML), before the job compares, emits and writes them."""

from importlib import import_module
from types import ModuleType

from django.conf import settings

KINDS: dict[str, str] = {
    "course": "apps.core.focus.kinds.course",
    "event": "apps.core.focus.kinds.event",
    "message": "apps.core.focus.kinds.message",
    "download": "apps.core.focus.kinds.download",
    "membership": "apps.core.focus.kinds.membership",
}


def get(kind: str) -> ModuleType:
    from ..flow import FlowError

    if kind not in KINDS:
        raise FlowError("unknown_kind")
    return import_module(KINDS[kind])


def enabled() -> list[str]:
    """The kinds switched on, in ``KINDS`` order."""
    return [kind for kind in KINDS if kind in settings.FOCUS_KINDS]
