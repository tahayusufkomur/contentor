"""The copy job (G5 of docs/superpowers/plans/2026-10-19-focus-mode-every-kind.md):
the review step's drafting for a kind it drafts (an event's title and
description). The specialist at its review writes them in one structured
call; each field is written only while it is blank or still holds what this
job (or her topic's working title) put there, checked under the record's lock
right before the write, so her edit, made before a redraft or while the model
wrote, is never overwritten. Each field written is emitted as a ``field``
event the page types in. A failure leaves the record as it was, and the guide
offers Try again (``flow.retry_copy``). A copilot run on the agents worker."""

import json
from functools import cache

from django.conf import settings
from django.db import transaction
from pydantic import create_model

from apps.core import ai as core_ai
from apps.core.copilot import runs
from apps.core.onboarding import ai_compose
from apps.tenant_config.models import CopilotRun, FocusCreation

from . import covers, jobs, kinds

F13 = "Never invent a claim, a result or a number."
MAX_TOKENS = 2000
# Static per kind, byte-identical across tenants (prompt caching); her answers ride the user turn.
# ``{noun}`` is the kind's word; each kind's COPY_RULES says what to write and what its facts mean.
SHARED = (
    "A coach is making ONE {noun} in a guided flow. Write its short copy for her students from what she "
    "said and her site (brand, niche, description). Use only those. " + F13 + " Plain text, no markdown.\n"
    "- current: what the {noun} holds now. When 'instruction' is given, it is the coach's change to it: "
    "apply it and keep what she did not ask to change."
)


def drafts(kind: str) -> bool:
    """Whether the copy job is the kind's drafting: it defines the copy group (kinds/__init__.py)."""
    return hasattr(kinds.get(kind), "COPY_FIELDS")


@cache
def system_for(kind: str) -> str:
    adapter = kinds.get(kind)
    return SHARED.replace("{noun}", adapter.NOUN) + "\n" + adapter.COPY_RULES


@cache
def output_for(kind: str):
    """The model's output: one string per field the kind's copy writes."""
    return create_model("Copy", **{name: (str, ...) for name in kinds.get(kind).COPY_FIELDS})


def start(creation, instruction: str = "") -> CopilotRun:
    """A queued copy run, a building one stopped first (it would write over
    this one). Call on the locked creation, inside the writing transaction."""
    pk = jobs.run_id(creation, "copy")
    if pk is not None:
        runs.stop(pk)  # a finished one is left as it is
    specialist = kinds.get(creation.kind).RECIPE.specialists["review"]
    return jobs.queue(creation, "copy", specialist=specialist, instruction=instruction)


def _gone(creation, record) -> bool:
    """Nothing to write on: the record deleted, focus mode over, or the record
    put live (by her finish tap, or by hand on the page)."""
    # ponytail: a kind the copy job drafts keeps its draft state in ``status`` or ``is_published`` (a download);
    # ask the adapter once one keeps it elsewhere.
    live = getattr(record, "status", "draft") != "draft" or getattr(record, "is_published", False)
    return record is None or creation.status != "active" or live


def carry_out(tenant, run_id) -> None:
    from .flow import draft_title

    run = CopilotRun.objects.get(pk=run_id)
    request = run.request or {}
    creation = FocusCreation.objects.get(pk=request.get("focus"))
    adapter = kinds.get(creation.kind)
    instruction = str(request.get("instruction") or "")
    record = adapter.record(creation.record_id)
    if _gone(creation, record):
        runs.finish(run_id, True, {"fields": []})
        return
    if not ai_compose.compose_available():
        raise core_ai.AiError("ai_unavailable")
    step = {"specialist": run.specialist, "label": f"Writing your {adapter.NOUN}"}
    runs.emit(run_id, "step", {**step, "state": "start"})
    copy = _write(tenant, creation, adapter, record, instruction)
    with transaction.atomic():
        # The creation first, then the run, then the record: the order her requests lock them in.
        locked = FocusCreation.objects.select_for_update().get(pk=creation.pk)
        if not jobs.active(run_id):  # Stop won while the model wrote: drop it
            return
        record = type(record).objects.select_for_update().filter(pk=record.pk).first()
        if _gone(locked, record):  # while the model wrote
            runs.finish(run_id, True, {"fields": []})
            return
        drafted = locked.drafted or {}
        wrote = dict(drafted.get("copy") or {})
        # Her topic's current working title is ours too (``flow._retitle``), until the job has written a title.
        title = adapter.COPY_FIELDS[0]  # its title ("title"; a membership's "name")
        working = draft_title(locked) if title not in wrote else None
        written = {name: getattr(copy, name).strip() for name in adapter.COPY_FIELDS}
        if clean := getattr(adapter, "clean_copy", None):  # optional: as the record keeps it (a message's HTML)
            written = clean(written)
        fields = {}
        for name in adapter.COPY_FIELDS:
            value = written[name][: type(record)._meta.get_field(name).max_length]
            current = getattr(record, name) or ""
            ours = not current.strip() or current == wrote.get(name) or (name == title and current == working)
            if value and value != current and ours:
                fields[name] = value
        if fields:
            adapter.write_copy(locked.record_id, fields)
        locked.drafted = {**drafted, "copy": {**wrote, **fields}}
        locked.save(update_fields=["drafted", "updated_at"])
        shown = adapter.payload(record)  # the page's key for it: "<kind>:<id>" ("live:12"; the course's "course:7")
        key = f"{shown.get('kind', locked.kind)}:{shown['id']}"
        for name, value in fields.items():
            runs.emit(run_id, "field", {"record": key, "name": name, "value": value})
        if (
            not instruction
            and not (getattr(record, "thumbnail_id", None) or getattr(record, "thumbnail_url", ""))
            and jobs.run_id(locked, "covers") is None
        ):
            covers.start(locked, ahead=True)  # the first copy: the Designer drafts ahead (a "styles" cover only)
    runs.emit(run_id, "step", {**step, "state": "done"})
    runs.finish(run_id, True, {"fields": list(fields)})


def _write(tenant, creation, adapter, record, instruction: str):
    turn = {
        **adapter.copy_facts(creation, record),
        "current": {name: getattr(record, name) for name in adapter.COPY_FIELDS},
        "instruction": instruction,
    }
    try:
        parsed, cost, _model = core_ai.structured(
            system=system_for(creation.kind),
            user=json.dumps(turn, ensure_ascii=False),
            output_model=output_for(creation.kind),
            model=settings.COPILOT_MODEL,
            max_tokens=MAX_TOKENS,
            label="contentor:copilot",  # she waits at the review
            effort="low",
        )
    except core_ai.AiError as exc:
        ai_compose.record_spend(tenant.schema_name, getattr(exc, "cost_usd", None) or 0)
        raise
    ai_compose.record_spend(tenant.schema_name, cost)
    return parsed
