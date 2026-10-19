"""Follow-ups (spec §5 Follow-ups, F4): one question specific to her course,
only when the next draft would otherwise have to guess something that changes
it. A job on the agents worker decides whether one is needed and writes it
(2-4 short options) while she waits; the caps live in code
(flow.followup_allowed). A failed job is dropped and the flow goes on."""

import json
from functools import cache
from typing import Literal

from django.conf import settings
from django.db import transaction
from pydantic import BaseModel

from apps.core import ai as core_ai
from apps.core.copilot import runs
from apps.core.onboarding import ai_compose
from apps.tenant_config.models import CopilotRun, FocusCreation

from . import jobs, kinds, outline

# "outline": before the outline drafts. "later": after its review, before the cover.
SPECIALIST = {"outline": "content", "later": "designer"}
LABEL = "Thinking about your course"
QUESTION_MAX = 200
OPTION_MAX = 60

# Static per kind, byte-identical across tenants (prompt caching); her answers ride the user turn.
# ``{noun}`` is the kind's word, ``{slot}`` its follow-up slot before the drafting (``DRAFT_SLOT``).
SYSTEM = (
    "A coach is creating ONE online {noun} in a guided flow. Decide whether to ask her ONE more short "
    "question before the next draft. 'slot' says what comes next: '{slot}' (the {noun} {slot}: title, "
    "description, modules and lessons) or 'later' (the {noun} cover and the announcement to her "
    "students). You get her answers so far (topic, level, size, notes, earlier follow-ups) and her site.\n"
    "Rules:\n"
    "- Ask only when the next draft would otherwise have to guess something that changes it, and nothing "
    "she said settles it. Never to enrich, never to confirm what she already said. Most of the time the "
    "answer is needed=false.\n"
    "- Never ask again what an earlier follow-up asked.\n"
    "- When needed: one short plain question, and 2-4 short options she can tap (a few words each)."
)


@cache
def system_for(kind: str) -> str:
    adapter = kinds.get(kind)
    return SYSTEM.replace("{noun}", adapter.NOUN).replace("{slot}", adapter.DRAFT_SLOT)


class FollowUp(BaseModel):
    needed: bool
    question: str = ""
    options: list[str] = []


def start(creation, slot: Literal["outline", "later"]) -> CopilotRun:
    """Call on the locked creation, inside the writing transaction."""
    return jobs.queue(creation, "followup", specialist=SPECIALIST[slot], slot=slot)


def carry_out(tenant, run_id) -> None:
    """Decide outside any lock, then write the question under the creation's
    lock, unless Stop or "Fill it in myself" won meanwhile."""
    from . import flow

    run = CopilotRun.objects.get(pk=run_id)
    slot = (run.request or {}).get("slot")
    creation = FocusCreation.objects.get(pk=(run.request or {}).get("focus"))
    if not ai_compose.compose_available():
        raise core_ai.AiError("ai_unavailable")
    step = {"specialist": run.specialist, "label": LABEL}
    runs.emit(run_id, "step", {**step, "state": "start"})
    found = _decide(tenant, creation, kinds.get(creation.kind).record(creation.record_id), slot)
    question = found.question.strip()[:QUESTION_MAX]
    options = list(dict.fromkeys(o.strip()[:OPTION_MAX] for o in found.options if o.strip()))[:4]
    with transaction.atomic():
        creation = FocusCreation.objects.select_for_update().get(pk=creation.pk)
        if _thinking(creation, run_id) and jobs.active(run_id):
            if found.needed and question and len(options) >= 2:
                creation.brief = {
                    **creation.brief,
                    "followup": {"question": question, "options": options, "slot": slot},
                }
            flow.after_followup(creation)
            creation.save()
            runs.emit(run_id, "step", {**step, "state": "done"})
        runs.finish(run_id, True, found.model_dump())  # a stopped run stays stopped


def on_failure(tenant, run_id) -> None:
    """The model failed: no follow-up, the flow goes on."""
    from . import flow

    focus = (CopilotRun.objects.get(pk=run_id).request or {}).get("focus")
    with transaction.atomic():
        creation = FocusCreation.objects.select_for_update().filter(pk=focus).first()
        if creation is None or not _thinking(creation, run_id):
            return
        flow.after_followup(creation)
        creation.save()


def _thinking(creation, run_id) -> bool:
    """Whether she is still waiting on this run."""
    return creation.status == "active" and ((creation.brief or {}).get("thinking") or {}).get("run") == run_id


def _decide(tenant, creation, record, slot) -> FollowUp:
    answers, brief = creation.answers or {}, creation.brief or {}
    turn = {
        "slot": slot,
        "topic": answers.get("topic", ""),
        "level": answers.get("level", ""),
        "size": answers.get("size", ""),
        "notes": brief.get("notes", ""),
        "followups": brief.get("followups", []),
        **outline.site(tenant, creation.record_id),
    }
    if slot == "later" and record is not None:
        adapter = kinds.get(creation.kind)
        turn[adapter.NOUN] = adapter.cover_facts(record)  # {"title", "description"}
    try:
        found, cost, _model = core_ai.structured(
            system=system_for(creation.kind),
            user=json.dumps(turn, ensure_ascii=False),
            output_model=FollowUp,
            model=settings.COPILOT_MODEL,
            max_tokens=1000,
            label="contentor:copilot",
            effort="low",
        )
    except core_ai.AiError as exc:
        ai_compose.record_spend(tenant.schema_name, getattr(exc, "cost_usd", None) or 0)
        raise
    ai_compose.record_spend(tenant.schema_name, cost)
    return found
