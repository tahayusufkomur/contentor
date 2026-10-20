"""Focus mode's question flow (spec §5, §6.1 of
docs/superpowers/specs/2026-10-18-focus-mode-design.md): one creation in
progress per FocusCreation row, its recipe's questions asked in order. The
draft record exists from her first answer; a tap never calls a model. What
she types is read first by the analysis job (apps.core.focus.analysis, §5.1),
which answers every question it can; the outline job writes the outline
(apps.core.focus.outline). Call inside her tenant's context. Writes lock the
row, so two tabs cannot both move it."""

from contextlib import suppress
from datetime import datetime

from django.db import connection, transaction
from django.utils import timezone

from apps.core.onboarding import ai_compose
from apps.tenant_config.models import CopilotChat, CopilotRun, FocusCreation

from . import analysis, copywriter, covers, descriptions, followup, jobs, kinds
from . import announce as announcing  # ``announce`` is finish()'s flag

DELEGATE = "delegate"
# A reported span of active time counts up to ten minutes: a bogus number
# (a clock jump, a crafted request) cannot inflate her total.
MAX_SPAN_MS = 600_000
TITLE_MAX = 80
ANSWER_MAX = 500
# A multi-pick tap's values, comma-separated: cut at a whole value past this (hundreds of tiles).
MULTI_MAX = 4000
# Not now: what became of Marketing's draft, if it made one.
SAVED_IN_MESSAGES = "Your announcement is saved as a draft in Messages."
NO_ANNOUNCEMENT = "No announcement this time."
ANNOUNCE_LABELS = {"scheduled": "Schedule", "draft": "Not now", "skip": "Not now", "sent": "Sent"}
SENT = "Your announcement has gone out."
# The finish step of a paid course she cannot sell yet: no "Publish now" (F11).
START_SELLING = {"value": "start_selling", "label": "Start selling", "hint": "your plan, then payouts"}
# Follow-ups asked (F4): at most four per creation, two before the outline.
MAX_FOLLOWUPS = 4
MAX_PER_SLOT = 2


class FlowError(Exception):
    pass


# Kinds only the site owner may make (G18): their endpoints are hers alone today.
OWNER_ONLY = ("membership", "bundle")


def check_owner(user, kind: str) -> None:
    """FlowError("owner_only") for a membership or bundle made or driven by anyone but the owner."""
    if kind in OWNER_ONLY and getattr(user, "role", None) != "owner":
        raise FlowError("owner_only")


def working_title(topic: str, kind: str = "course") -> str:
    """Her topic as the record's title until the outline writes a better one."""
    adapter = kinds.get(kind)
    text = (topic or "").strip()
    starter = (adapter.RECIPE.questions[0].options or ("",))[0].strip()
    if text.lower().startswith(starter.lower()):
        text = text[len(starter) :].strip()
    text = text.rstrip(".").strip()
    if not text:
        return adapter.NEW_TITLE
    return (text[0].upper() + text[1:])[:TITLE_MAX]


def draft_title(creation) -> str:
    """Her working title while a kind has no record yet (G10): the one her
    topic named, else her topic as it stands."""
    titles = (creation.drafted or {}).get("titles") or []
    topic = str((creation.answers or {}).get("topic") or "")
    return titles[-1] if titles else working_title("" if topic == DELEGATE else topic, creation.kind)


def start(user, kind: str, *, value=None, text=None, delegate=False, rest=False, active_ms=0) -> FocusCreation:
    """Her first answer (the topic): the draft record (unless the kind needs
    an answer first), the dock thread and the creation, all at once. With
    ``rest`` ("Just draft it"), the questions after it are delegated in the
    same step, so a failure cannot leave a second draft. Typed words are read
    by the analysis first; the title is provisional until then."""
    if kind not in kinds.enabled():
        raise FlowError("unknown_kind")
    check_owner(user, kind)
    adapter = kinds.get(kind)
    recipe = adapter.RECIPE
    first = recipe.questions[0]
    # "Just draft it" with no words leaves her topic to us only where it is ours to decide (not a message's).
    picked = _pick(recipe, first, value, text, delegate) or (DELEGATE if rest and first.delegable else None)
    if picked is None:
        raise FlowError("no_answer")
    typed = picked != DELEGATE and bool((text or "").strip())
    # Ticked tiles (a bundle's items) are values, not a title: the kind's new one until it has words.
    title = working_title("" if picked == DELEGATE or (first.multi and not typed) else picked, kind)
    actor = user if getattr(user, "pk", None) else None
    answers = {} if typed else {first.id: picked}
    with transaction.atomic():
        record_id = adapter.create_draft(actor, title, answers)
        chat = CopilotChat.objects.create(
            actor=actor,
            title=f"{adapter.NEW_TITLE}: {title}"[:120],
            entries=[
                {"role": "assistant", "text": first.question},
                {"role": "coach", "text": _label(recipe, first, picked)},
            ],
        )
        creation = FocusCreation(kind=kind, actor=actor, chat=chat, record_id=record_id, answers=answers)
        _add_time(creation, active_ms)
        creation.save()
        if typed:
            _analyse(creation, first.id, picked, rest)
            creation.save()
        else:
            _next_draft(creation)  # her tap may be all its drafting waits for (a bundle's items)
            creation.save()
            if rest:
                creation = answer(creation, current_field(creation), rest=True)
    return creation


def current_field(creation) -> str | None:
    """The first question she has not answered: "clarify" while a detail she
    gave is unclear, "followup" while a follow-up is asked; None while her
    typed answer is read or a follow-up is written, and once it is over."""
    brief = creation.brief or {}
    if creation.status != "active" or creation.pending or brief.get("thinking"):
        return None
    if brief.get("clarify"):
        return "clarify"
    if brief.get("followup"):
        return "followup"
    answers = creation.answers or {}
    adapter = kinds.get(creation.kind)
    skipped = adapter.skips(creation)
    return next((q.id for q in adapter.RECIPE.questions if q.id not in answers and q.id not in skipped), None)


def answer(creation, field, *, value=None, text=None, delegate=False, rest=False, active_ms=None):
    """Her answer to the current question. An answer to any other question
    (a double tap, a second tab, a stale screen) changes nothing. What she
    types is read by the analysis first; taps and "You decide" apply at once."""
    with transaction.atomic():
        creation = _locked(creation)
        _add_time(creation, active_ms)
        recipe = kinds.get(creation.kind).RECIPE
        question = next((q for q in recipe.questions if q.id == field), None)
        if (
            not field
            or field != current_field(creation)
            or (
                question is not None
                and (
                    # The one answer on finish: "Sell it for", after "Just draft it" left the price to her.
                    (question.kind == "finish" and (delegate or (text or "").strip() or not _sell_for(creation, value)))
                    # Only typed words are read at the cover; a tap or "You decide" never answers it.
                    or (question.kind == "cover" and (delegate or not (text or "").strip()))
                    # Only its own taps answer the announcement (decide_announcement).
                    or question.kind == "announce"
                )
            )
        ):
            creation.save(update_fields=["active_ms", "updated_at"])
            return creation
        words = (text or "").strip()[:ANSWER_MAX]
        if field == "followup":
            if not _followup_answered(creation, value, words, delegate, rest):
                creation.save(update_fields=["active_ms", "updated_at"])
                return creation
        elif words and not delegate:
            asking = question.question if question else creation.brief["clarify"][0]["question"]
            _chat_append(creation, [{"role": "assistant", "text": asking}, {"role": "coach", "text": words}])
            _analyse(creation, field, words, rest)
        elif field == "clarify":
            if not _clarify(creation, value, delegate, rest):
                creation.save(update_fields=["active_ms", "updated_at"])
                return creation
        elif question.kind == "review":
            if value == "ok":
                status = outline_status(creation)
                creation.answers[field] = "ok"
                _say(creation, question, "Looks good, continue")
                # The outline on the page: ready, or an earlier one a stopped or failed redraft left.
                # While one is being written, the outline job starts them once it has written.
                if status == "ready" or (status in ("failed", "idle") and _has_outline(creation)):
                    descriptions.start(creation)
                if line := kinds.get(creation.kind).REVIEWED_LINE:
                    _chat_append(creation, [{"role": "assistant", "text": line}])
                # The Designer's, before a styled cover (it shapes the styles; none for a photo cover or
                # none at all); it never redrafts the outline.
                if kinds.get(creation.kind).COVER == "styles" and followup_allowed(creation, "later"):
                    _ask_followup(creation, "later")
            elif value == "retry":
                _retry_draft(creation)
        elif question.kind == "finish":
            price = _sell_for(creation, value)
            _set_price(creation, price)
            _say(creation, question, f"Sell it for {_amount_label(creation, price)}")
        elif question.kind == "price":
            if not _access(creation, question, value, delegate) and not rest:
                creation.save(update_fields=["active_ms", "updated_at"])
                return creation
            if rest:
                _delegate_rest(creation)
        else:
            picked = _pick(recipe, question, value, None, delegate)
            if picked is None and not rest:
                creation.save(update_fields=["active_ms", "updated_at"])
                return creation
            if picked is not None:  # with "Just draft it" too: what she tapped first
                creation.answers[field] = picked
                _say(creation, question, _label(recipe, question, picked))
            if rest:
                _delegate_rest(creation)
            _next_draft(creation)
        creation.save()
    return creation


def apply(creation, found) -> None:
    """Her typed answer (``pending``), read: ``found`` is the analysis, None
    when it failed, was stopped or swept (stage 1: her words answer the
    question on screen). Every field it got is filled, so its question is
    skipped. Call under the creation's lock; the caller saves."""
    pending, creation.pending = creation.pending or {}, {}
    field, text = pending.get("field"), str(pending.get("text") or "")
    adapter = kinds.get(creation.kind)
    recipe = adapter.RECIPE
    creation.answers = dict(creation.answers or {})
    item = _pop_clarify(creation) if field == "clarify" else None
    if found is None:
        if item:
            clarified = _clarified(creation, item["field"], text)
            if not clarified and (waiting := _waiting(creation, item)):  # more than a count: never lost
                waiting["redraft"] = f"{waiting['redraft']}; {text}"
            _redraft_waiting(creation, item, clarified)
        elif field == _review_id(recipe):
            _redraft(creation, text)
        elif field == "cover":  # never her answer (the cover endpoint sets it); her words describe the photo
            creation.covers = {**(creation.covers or {}), "query": text}
        elif field == "access":  # a paid price only from words that are one (F11); else she taps
            if price := analysis.price_value(text):
                _set_price(creation, price)
        elif field:
            creation.answers[field] = text
    else:
        if field == "topic":
            creation.answers["topic"] = text  # her whole words: the outline reads them
            _retitle(creation, working_title(text, creation.kind), working_title(found.topic or text, creation.kind))
        adapter.apply_found(creation, found)
        if field == "cover" and found.photo.strip():
            creation.covers = {**(creation.covers or {}), "query": found.photo.strip()}
        price = analysis.price_value(found.price)
        if price:
            _set_price(creation, price)
        clarified = False
        if found.answer.strip():
            if item:
                clarified = _clarified(creation, item["field"], found.answer)
            elif field in recipe.values and field not in creation.answers:
                creation.answers[field] = _choice(recipe, field, found.answer)
        brief = creation.brief
        clarify = list(brief.get("clarify") or [])
        for unclear in found.unclear:  # each asked once
            if unclear.field not in {*(brief.get("asked") or []), *(c["field"] for c in clarify)}:
                clarify.append(unclear.model_dump())
        fresh = clarify[len(brief.get("clarify") or []) :]
        adapter.apply_change(creation, found, field=field, text=text, item=item, clarified=clarified, fresh=fresh)
        creation.brief = {**creation.brief, "clarify": clarify}
    if pending.get("rest"):
        _delegate_rest(creation)
    _next_draft(creation)


def finish(creation, *, publish: bool, announce: bool = False, active_ms=None) -> FocusCreation:
    """Her last tap: put it live (the kind's first FINISH option) or keep it
    as a draft (its second). Focus mode ends, unless it went live with "Tell
    my students" (``announce``) and the kind has an ANNOUNCER: then it drafts
    the announcement while she waits, and her Schedule or Not now ends it. A
    kind without one may take the tick itself (``apply_tick``)."""
    from apps.core.copilot import content, runs

    with transaction.atomic():
        creation = _locked(creation)
        _add_time(creation, active_ms)
        if current_field(creation) != "finish":
            creation.save(update_fields=["active_ms", "updated_at"])
            return creation
        if _record(creation) is None:  # deleted by hand, or by an Undo: nothing was made
            creation.status = "left"
            creation.save(update_fields=["active_ms", "status", "updated_at"])
            return creation
        if (job := draft_job(creation.kind)) and (pk := jobs.run_id(creation, job)) is not None:
            runs.stop(pk)  # what she saw is what she finishes: a copy still being written is dropped (G4)
        # Never an empty lesson in front of students, nor a paid course she cannot sell yet: a draft.
        adapter = kinds.get(creation.kind)
        record = _record(creation)
        live = publish and not adapter.not_ready(record) and not adapter.cannot_sell(record)
        choice = adapter.FINISH[0 if live else 1][0]
        # Optional: the tick is the kind's own (a message's "Also by email"), kept on a draft too.
        if tick := getattr(adapter, "apply_tick", None):
            tick(creation.record_id, announce)
        if live:
            with suppress(content.ContentOpError):  # already published by hand, or gone
                adapter.go_live(creation.record_id)
        elif keep := getattr(adapter, "keep", None):  # optional: what keeping a draft does
            keep(creation.record_id)
        recipe = adapter.RECIPE
        question = next(q for q in recipe.questions if q.id == "finish")
        creation.answers["finish"] = choice
        _say(creation, question, _label(recipe, question, choice))
        _chat_append(creation, [{"role": "assistant", "text": closing_line(creation)}])
        if live and announce and adapter.ANNOUNCER:
            announcing.start(creation)
        else:
            _end(creation, "skip")
        creation.save()
    return creation


def closing_line(creation) -> str:
    """Her finish's closing line (a message's "Sent." or "Scheduled for …",
    a kind's published or kept line); "" before she finished."""
    choice = (creation.answers or {}).get("finish")
    if choice is None:
        return ""
    closing = kinds.get(creation.kind).CLOSING[choice]  # or a function of the record, for a line that says when
    return closing(_record(creation)) if callable(closing) else closing


def decide_announcement(creation, *, schedule: bool, active_ms=None) -> FocusCreation:
    """Her tap on Marketing's draft: Schedule (at the send time she was shown)
    or Not now (the draft stays in Messages, or there is none). Focus mode
    ends. Refused unless the announcement is the question, so a double tap
    changes nothing; Schedule needs a draft."""
    from apps.core.copilot import runs

    with transaction.atomic():
        creation = _locked(creation)
        _add_time(creation, active_ms)
        if current_field(creation) != "announce":
            creation.save(update_fields=["active_ms", "updated_at"])
            return creation
        if _decided_meanwhile(creation):
            creation.save()
            return creation
        if not schedule and (pk := jobs.run_id(creation, "announce")) is not None:
            runs.stop(pk)  # still writing: no draft after all; a finished one is left as it is
        row, send_at = announcing.draft(creation)
        if schedule and row is None:
            creation.save(update_fields=["active_ms", "updated_at"])
            return creation
        if schedule:
            when = datetime.fromisoformat(send_at)
            row.status, row.scheduled_at = "scheduled", when
            row.save(update_fields=["status", "scheduled_at"])
            closing = _scheduled_line(when)
        else:
            closing = SAVED_IN_MESSAGES if row else NO_ANNOUNCEMENT
        value = "scheduled" if schedule else "draft" if row else "skip"
        question = next(q for q in kinds.get(creation.kind).RECIPE.questions if q.id == "announce")
        _say(creation, question, ANNOUNCE_LABELS[value])
        _chat_append(creation, [{"role": "assistant", "text": closing}])
        _end(creation, value)
        creation.save()
    return creation


def retry_announcement(creation) -> FocusCreation:
    """Try again after Marketing's draft failed; never while one is being written."""
    with transaction.atomic():
        creation = _locked(creation)
        if _decided_meanwhile(creation):  # never a second announcement
            creation.save()
            return creation
        shown = announcing.payload(creation)
        if current_field(creation) == "announce" and (shown is None or shown["status"] == "failed"):
            announcing.start(creation)
    return creation


def _scheduled_line(when) -> str:
    return f"Your announcement is scheduled for {when:%A} {when.day} {when:%B} at {when:%H:%M}."


def _decided_meanwhile(creation) -> bool:
    """Her draft scheduled or sent from Messages while the announce step was
    open: the step is decided, and focus mode ends with the line that says
    so. Call under the creation's lock; the caller saves."""
    from apps.core.copilot.engine import _tenant_zone

    row = announcing.decided(creation) if current_field(creation) == "announce" else None
    if row is None:
        return False
    if row.status == "scheduled" and row.scheduled_at:
        closing = _scheduled_line(row.scheduled_at.astimezone(_tenant_zone(connection.tenant)))
    else:
        closing = SENT if row.status == "sent" else "Your announcement is scheduled."
    _chat_append(creation, [{"role": "assistant", "text": closing}])
    _end(creation, row.status)
    return True


def _settle_announcement(creation):
    """Her return to the announce step after she scheduled or sent the draft
    from Messages: decided, never "failed" with Try again."""
    if creation.status != "active" or current_field(creation) != "announce" or announcing.decided(creation) is None:
        return creation
    with transaction.atomic():
        creation = _locked(creation)
        if _decided_meanwhile(creation):
            creation.save()
    return creation


def _end(creation, announced: str) -> None:
    """Focus mode ends; the caller saves."""
    creation.answers["announce"] = announced
    creation.status = "done"
    creation.finished_at = timezone.now()


def leave(creation, *, abandon: bool = False, active_ms=None) -> FocusCreation:
    """Save & leave (it stays open to resume), or "Fill it in myself" (it ends;
    the draft stays as it is, and an outline or a reading still going is dropped)."""
    from apps.core.copilot import runs

    with transaction.atomic():
        creation = _locked(creation)
        if abandon and current_field(creation) == "announce":  # already live: it ends as Not now does
            return decide_announcement(creation, schedule=False, active_ms=active_ms)
        _add_time(creation, active_ms)
        if abandon and creation.status == "active":
            creation.status = "left"
            creation.pending = {}
            for pk in (
                creation.outline_run_id,
                *(
                    jobs.run_id(creation, job)
                    for job in ("analysis", "announce", "followup", draft_job(creation.kind))
                    if job
                ),
            ):
                if pk is not None:
                    runs.stop(pk)  # a finished one is left as it is
        creation.save(update_fields=["active_ms", "status", "pending", "updated_at"])
    return creation


def retry_descriptions(creation) -> FocusCreation:
    """Try again after the descriptions failed (or never started): only once
    the titles are confirmed, and never while a run is going."""
    with transaction.atomic():
        creation = _locked(creation)
        if (creation.answers or {}).get("outline_review") == "ok" and jobs.status(creation, "descriptions") in (
            "failed",
            "idle",
        ):
            descriptions.start(creation)
    return creation


def retry_copy(creation) -> FocusCreation:
    """Try again after the copy (or a kind's own drafting, ``draft_job``)
    failed or was stopped; never while it is being written, nor before it
    ever started."""
    with transaction.atomic():
        creation = _locked(creation)
        job = draft_job(creation.kind)
        if creation.status == "active" and job and jobs.run_id(creation, job) is not None:
            _retry_draft(creation)
    return creation


def draft_job(kind: str) -> str | None:
    """The job drafting the kind's review, other than the course's outline:
    its own (``DRAFT_JOB``, a post's), else the copy job for a kind it drafts;
    None for the course."""
    return getattr(kinds.get(kind), "DRAFT_JOB", None) or ("copy" if copywriter.drafts(kind) else None)


def _retry_draft(creation) -> None:
    """Again the review's drafting that failed (``draft_job``, else the
    outline), with her change when it was a redraft; never while it is being
    written. Call under the creation's lock."""
    job = draft_job(creation.kind) or "outline"
    status = outline_status(creation) if job == "outline" else jobs.status(creation, job)
    if status in ("failed", "idle"):
        failed = CopilotRun.objects.filter(pk=jobs.run_id(creation, job)).first()
        kinds.get(creation.kind).start_draft(
            creation, instruction=str(((failed and failed.request) or {}).get("instruction") or "")
        )


def draft_started(creation) -> bool:
    """Whether the kind's drafting for the review has started: its job was
    queued, or what it wrote is on the record (its run pruned)."""
    drafted = creation.drafted or {}
    if job := draft_job(creation.kind):
        return jobs.run_id(creation, job) is not None or job in drafted
    return creation.outline_run_id is not None or bool(drafted.get("modules"))


def _has_outline(creation) -> bool:
    return bool((creation.drafted or {}).get("modules"))


def outline_status(creation) -> str:
    """idle | building | ready | failed, from its outline run."""
    if creation.outline_run_id is None:  # never started, or its run was pruned
        return "ready" if (creation.drafted or {}).get("modules") else "idle"
    return jobs.status(creation, "outline")


def question(kind: str, field: str, creation=None) -> dict:
    if field == "followup":  # one question specific to her course, its options written by the follow-up job
        asked = creation.brief["followup"]
        return {
            "field": "followup",
            "kind": "choice",
            "question": asked["question"],
            "why": "",
            "options": [{"value": o, "label": o, "hint": ""} for o in asked["options"]],
            "starter": None,
            "can_delegate": True,
            "specialist": followup.specialist(kind, asked["slot"]),
        }
    if field == "clarify":  # one short question about a detail she gave, its options written by the analysis
        unclear = creation.brief["clarify"][0]
        recipe = kinds.get(kind).RECIPE
        return {
            "field": "clarify",
            "kind": "choice",
            "question": unclear["question"],
            "why": "",
            "options": [{"value": o["value"], "label": o["label"], "hint": ""} for o in unclear["options"]],
            "starter": None,
            "can_delegate": True,
            # Whoever asks her first question (a message's Community manager; the course's and event's: content).
            "specialist": recipe.specialists[recipe.questions[0].id],
        }
    recipe = kinds.get(kind).RECIPE
    q = next(q for q in recipe.questions if q.id == field)
    asked = {
        "field": q.id,
        "kind": q.kind,
        "question": q.question,
        "why": q.why,
        "options": _tiles(recipe, q),
        "starter": q.options[0] if q.starter and q.options else None,
        "can_delegate": q.delegable,
        "specialist": recipe.specialists[q.id],
    }
    if q.starter and (starters := getattr(kinds.get(kind), "STARTERS", ())):  # optional: more starters, as tiles
        asked["starters"] = [{"label": label, "starter": starter} for label, starter in starters]
    if q.kind == "price":
        asked = {**asked, **_price_tiles(creation)}
    ask = getattr(kinds.get(kind), "ask", None)  # optional: its wording for this creation
    return ask(creation, asked) if ask and creation is not None else asked


def _sync_cover(creation):
    """A cover kept in the photo studio ("I'll edit it") answers the cover
    question when she comes back: the kept design is the answer."""
    from apps.media.models import Design

    adapter = kinds.get(creation.kind)
    # Only a styled cover is a Design (a photo cover, a post's, is the record's own photo).
    if creation.status != "active" or "cover" in (creation.answers or {}) or adapter.COVER != "styles":
        return creation
    record = _record(creation)
    if record is None:
        return creation
    target_kind, target_key = adapter.cover_target(record)
    if not Design.objects.filter(kind="cover", target_kind=target_kind, target_key=target_key, state="kept").exists():
        return creation
    with transaction.atomic():
        creation = _locked(creation)
        if "cover" not in (creation.answers or {}):
            creation.answers = {**(creation.answers or {}), "cover": "kept"}
            creation.save(update_fields=["answers", "updated_at"])
    return creation


def state(creation) -> dict:
    creation = _settle_announcement(_settle_followup(_settle(_sync_cover(creation))))
    adapter = kinds.get(creation.kind)
    recipe = adapter.RECIPE
    record = _record(creation)
    # Deleted by hand, or by an Undo; a kind that makes its record after a later answer has none yet.
    if record is None and creation.record_id is not None and creation.status == "active":
        FocusCreation.objects.filter(pk=creation.pk, status="active").update(status="left")
        creation.status = "left"
    field = current_field(creation)
    answers = creation.answers or {}
    asked = question(creation.kind, field, creation) if field else None
    gap = record and field == "finish" and adapter.not_ready(record)
    if gap:
        asked = {
            **asked,
            "question": adapter.NOT_READY_LINE,
            # Upper-first, never capitalize(): that lowercases the rest ("Zoom", "Messages").
            "why": f"{gap[0].upper()}{gap[1:]}. Until then it stays a hidden draft.",
            "options": [o for o in asked["options"] if o["value"] != adapter.FINISH[0][0]],
            # Whoever drafts it says what it still needs (the course's and the event's: content),
            # unless the kind names who asks its finish (a membership's: Finance, whose step its price is).
            "specialist": getattr(adapter, "FINISH_SPECIALIST", None) or recipe.specialists[_review_id(recipe)],
        }
    if record and field == "finish":
        asked = _finish_options(creation, asked, record)
    # A kind's own price tiles label her access line with the tile she tapped.
    tiles = {o["value"]: o["label"] for o in (adapter.price_tiles(creation, record) or {}).get("options", [])}
    # Her own amount (typed, or "Sell it for") in the kind's words for it: a membership's "$9 a month".
    if (paid := str(answers.get("access") or "")).startswith("paid:") and hasattr(adapter, "amount_label"):
        tiles[paid] = adapter.amount_label(record, paid.removeprefix("paid:"))
    return {
        "id": creation.id,
        "kind": creation.kind,
        "status": creation.status,
        "chat": creation.chat_id,
        "record": adapter.payload(record) if record else None,
        "question": asked,
        "answered": [
            {"field": q.id, "label": _label(recipe, q, answers[q.id], tiles)}
            for q in recipe.questions
            if q.id in answers
        ]
        # Her price said before its own step; once the step is answered, its line says it.
        + (
            [{"field": "price", "label": _price_label(answers["price"])}]
            if "price" in answers and "access" not in answers
            else []
        ),
        "outline": {
            "status": outline_status(creation),
            "run": creation.outline_run_id,
            # An outline is on the page: after a failed redraft, "Looks good" still goes on with it.
            "drafted": _has_outline(creation),
        },
        "descriptions": (
            {"status": jobs.status(creation, "descriptions"), "run": jobs.run_id(creation, "descriptions")}
            if jobs.run_id(creation, "descriptions") is not None
            else None
        ),
        # The copy job's run (or the kind's own drafting, ``draft_job``): its status, and a failed one's
        # "Try again", or why it was refused (a post's blog gate: Try again could only fail again).
        "copy": _draft_state(creation),
        "cover": covers.payload(creation),
        "announcement": announcing.payload(creation) if field == "announce" else None,
        "reading": (
            {"status": jobs.status(creation, "analysis"), "run": jobs.run_id(creation, "analysis")}
            if creation.pending
            else None
        ),
        "thinking": (
            {
                "status": jobs.status(creation, "followup"),
                "run": thinking["run"],
                "specialist": followup.specialist(creation.kind, thinking["slot"]),
            }
            if (thinking := (creation.brief or {}).get("thinking"))
            else None
        ),
        "steps": [{"id": q.id, "done": q.id in answers} for q in recipe.questions],
    }


def _draft_state(creation) -> dict | None:
    job = draft_job(creation.kind)
    pk = jobs.run_id(creation, job) if job else None
    if pk is None:
        return None
    status = jobs.status(creation, job)
    reason = None
    if status == "failed":
        reason = (CopilotRun.objects.filter(pk=pk).values_list("result", flat=True).first() or {}).get("reason")
    return {"status": status, "run": pk, **({"reason": reason} if reason else {})}


def size_label(brief) -> str:
    """The counts she gave, as the size's answered line: "4 modules · 3
    lessons each", "4 modules", "12 lessons"; "" without a count."""
    brief = brief or {}
    modules, lessons, total = brief.get("modules"), brief.get("lessons"), brief.get("total")
    parts = [_count(modules, "module")] if modules else []
    if lessons:
        parts.append(_count(lessons, "lesson") + (" each" if modules else " per module"))
    elif total:
        parts.append(_count(total, "lesson"))
    return " · ".join(parts)


def _count(n: int, noun: str) -> str:
    return f"{n} {noun}{'' if n == 1 else 's'}"


def _analyse(creation, field, text, rest) -> None:
    """Her typed words, read by the analysis job while she waits (``pending``).
    Without a model, stage 1 at once: her words answer the question on screen.
    The caller saves."""
    creation.pending = {"field": field, "text": text, "rest": rest}
    if not ai_compose.compose_available():
        apply(creation, None)
        return
    run = jobs.queue(creation, "analysis", specialist="content")
    creation.pending = {**creation.pending, "run": run.id}


def _settle(creation):
    """A reading that ended without being applied (stopped, swept): her words
    answer the question as in stage 1, so the screen never stays on it."""
    pk = (creation.pending or {}).get("run")
    if pk is None or creation.status != "active" or jobs.status(creation, "analysis") == "building":
        return creation
    with transaction.atomic():
        creation = _locked(creation)
        if (creation.pending or {}).get("run") == pk and not jobs.active(pk):
            apply(creation, None)
            creation.save()
    return creation


def followup_allowed(creation, slot: str) -> bool:
    """Whether a follow-up may be asked in ``slot``: at most four asked per
    creation and two per slot, never after "Just draft it", never while one is
    open or being written, never again in a slot where a job asked nothing
    (none needed, or it failed), and only with the model on."""
    brief = creation.brief or {}
    asked = brief.get("followups") or []
    return (
        not brief.get("rest")
        and not brief.get("followup")
        and not brief.get("thinking")
        and slot not in (brief.get("settled") or [])
        and len(asked) < MAX_FOLLOWUPS
        and sum(1 for f in asked if f.get("slot") == slot) < MAX_PER_SLOT
        and ai_compose.compose_available()
    )


def after_followup(creation) -> None:
    """A follow-up job ended (it wrote one, found none needed, failed or was
    stopped): the flow goes on. A job that asked nothing settles its slot;
    before the outline, the outline comes next. Call under the creation's lock
    while she waits on the job; the caller saves."""
    brief = dict(creation.brief or {})
    thinking = brief.pop("thinking")
    if not brief.get("followup"):
        brief["settled"] = [*(brief.get("settled") or []), thinking["slot"]]
    creation.brief = brief
    if not brief.get("followup") and thinking["slot"] == kinds.get(creation.kind).DRAFT_SLOT:  # never "later"
        _next_draft(creation)


def _ask_followup(creation, slot: str) -> None:
    """A follow-up job she waits on; the caller saves."""
    run = followup.start(creation, slot)
    creation.brief = {**(creation.brief or {}), "thinking": {"run": run.id, "slot": slot}}


def _followup_answered(creation, value, words, delegate, rest) -> bool:
    """Her answer to a follow-up: a tap on one of its options, her words (as
    she typed them, never analysed: they answer a written question) or "You
    decide". False when the tap carried no answer."""
    asked = creation.brief["followup"]
    tapped = value if value in asked["options"] else None
    label = "You decide" if delegate else words or tapped or ("You decide" if rest else None)
    if label is None:
        return False
    entry = {"question": asked["question"], "answer": label, "slot": asked["slot"]}
    creation.brief = {
        **{k: v for k, v in creation.brief.items() if k != "followup"},
        "followups": [*(creation.brief.get("followups") or []), entry],
    }
    _chat_append(creation, [{"role": "assistant", "text": asked["question"]}, {"role": "coach", "text": label}])
    if rest:
        _delegate_rest(creation)
    if asked["slot"] == kinds.get(creation.kind).DRAFT_SLOT:
        _next_draft(creation)  # a second follow-up when allowed, else the drafting
    elif label != "You decide":
        _redraw_covers(creation)
    return True


def _redraw_covers(creation) -> None:
    """Her answer to the Designer's question shapes the cover step: the round
    drafted ahead (before it was asked) gives way to a fresh round that reads
    it, unless the cover is already answered. Her photo and query stay."""
    from apps.core.copilot import runs

    if "cover" in creation.answers:
        return
    if jobs.status(creation, "covers") == "building":
        runs.stop(jobs.run_id(creation, "covers"))
    covers.start(creation, ahead=False)


def _settle_followup(creation):
    """A follow-up job that ended without going on (stopped, swept): the flow
    goes on without it, so the screen never stays on it."""
    pk = ((creation.brief or {}).get("thinking") or {}).get("run")
    if pk is None or creation.status != "active" or jobs.status(creation, "followup") == "building":
        return creation
    with transaction.atomic():
        creation = _locked(creation)
        if ((creation.brief or {}).get("thinking") or {}).get("run") == pk and not jobs.active(pk):
            after_followup(creation)
            creation.save()
    return creation


def _clarify(creation, value, delegate, rest) -> bool:
    """A tap on the clarify question: an option, "You decide" (the size or
    level is delegated; a price is left to its own step) or "Just draft it".
    False when the tap carried no answer."""
    unclear = creation.brief["clarify"][0]
    label, clarified = None, False
    if delegate:
        if unclear["field"] in ("modules", "lessons"):
            creation.answers.setdefault("size", DELEGATE)
        elif unclear["field"] == "level":
            creation.answers.setdefault("level", DELEGATE)
        label = "You decide"
    elif value is not None and str(value).strip():
        clarified = _clarified(creation, unclear["field"], value)
        label = next((o["label"] for o in unclear["options"] if o["value"] == value), str(value)[:ANSWER_MAX])
    elif not rest:
        return False
    _pop_clarify(creation)
    _redraft_waiting(creation, unclear, clarified)
    if label:
        _chat_append(creation, [{"role": "assistant", "text": unclear["question"]}, {"role": "coach", "text": label}])
    if rest:
        _delegate_rest(creation)
    _next_draft(creation)
    return True


def _pop_clarify(creation) -> dict:
    """The clarify question on screen, now asked: it is never asked again."""
    clarify = list(creation.brief["clarify"])
    unclear = clarify.pop(0)
    asked = [*(creation.brief.get("asked") or []), unclear["field"]]
    creation.brief = {**creation.brief, "clarify": clarify, "asked": asked}
    return unclear


def _clarified(creation, field, value) -> bool:
    """Her answer to a clarify question, onto the field it asked about. A
    price is set here; a field the kind does not own keeps her words as the
    answer; the kind reads the rest. True when it gave a count."""
    words = str(value).strip()
    if not words:
        return False
    if field == "price":
        if price := analysis.price_value(words):
            _set_price(creation, price)
        return False
    adapter = kinds.get(creation.kind)
    if field not in adapter.UNCLEAR_FIELDS:
        creation.answers[field] = words[:ANSWER_MAX]
        return False
    return adapter.apply_clarified(creation, field, words)


def _waiting(creation, item) -> dict | None:
    """The clarify item a change at the review waits on: the one just
    answered, else one still to ask."""
    if item.get("redraft"):
        return item
    return next((c for c in (creation.brief or {}).get("clarify") or [] if c.get("redraft")), None)


def _redraft_waiting(creation, item, clarified: bool) -> None:
    """The change she asked for at the review that waited on this count: drafted
    now, once, with the count she gave (without one when she left it to us)."""
    if words := item.get("redraft"):
        label = size_label(creation.brief) if clarified else ""
        _redraft(creation, f"{words} ({label})" if label else words, keep_counts=clarified or item["keep_counts"])


def _set_price(creation, value: str) -> None:
    """Her price, from her own tap or words (F11): "free", "membership" (the
    record is left as it is; the access step offers her memberships) or an amount.
    A kind that skips the access step for this creation answers it itself (a
    Zoom class is free); without a record yet, ``_ensure_record`` sets it later."""
    adapter = kinds.get(creation.kind)
    # A kind with no price (a message, no access step) keeps none: nothing her words could set.
    if "access" in adapter.skips(creation) or not any(q.id == "access" for q in adapter.RECIPE.questions):
        return
    if value != "membership" and creation.record_id is not None:
        adapter.set_price(creation.record_id, value)
    creation.answers["price"] = value
    # The access step is answered too; "membership" asks which one.
    if value != "membership":
        creation.answers["access"] = value if value == "free" else f"paid:{value}"


def _amount(value, prefix: str) -> str | None:
    """A tapped amount ("paid:39", "price:39"), checked as her typed price is:
    a positive amount in the course's range, two decimals; None otherwise."""
    value = str(value or "")
    price = analysis.price_value(value.removeprefix(prefix)) if value.startswith(prefix) else None
    return price if price not in (None, "free", "membership") else None


def _sell_for(creation, value) -> str | None:
    """ "Sell it for" on finish: only after "Just draft it" left the price to her,
    and only while it is offered (a price she set on the page since stands,
    and a draft she deleted by hand takes no tap)."""
    if (creation.answers or {}).get("access") != DELEGATE:
        return None
    record = _record(creation)
    return _amount(value, "price:") if record and kinds.get(creation.kind).suggest_price(record) else None


def _access(creation, q, value, delegate) -> bool:
    """A tap at "How will students get it?": Free, a one-time price (any valid
    amount she taps is hers, F11) or one of her active memberships; for a kind
    with its own price tiles, one of those, passed to its ``set_price`` as it
    is. "You decide" leaves the record as it is. False when the tap carried no
    answer."""
    from apps.billing.models import SubscriptionPlan

    adapter = kinds.get(creation.kind)
    value = str(value or "")
    plan_id = value.removeprefix("plan:")
    own = adapter.price_tiles(creation, _record(creation))
    if delegate:
        creation.answers["access"] = DELEGATE
    elif own is not None:
        tile = next((o for o in own["options"] if o["value"] == value), None)
        if tile is None:
            return False
        adapter.set_price(creation.record_id, value)
        creation.answers["access"] = value
        _say(creation, q, tile["label"])
        return True
    elif value == "free" or (price := _amount(value, "paid:")):
        _set_price(creation, "free" if value == "free" else price)
    elif value.startswith("plan:") and plan_id.isascii() and plan_id.isdigit() and len(plan_id) < 10:
        plan = SubscriptionPlan.objects.filter(pk=int(plan_id), is_active=True).first()
        if plan is None or adapter.put_in_plan is None:
            return False
        adapter.put_in_plan(creation.record_id, plan)
        creation.answers["price"] = "membership"
        creation.answers["access"] = f"plan:{plan.pk}"
    else:
        return False
    _say(creation, q, _label(adapter.RECIPE, q, creation.answers["access"]))
    return True


def _price_tiles(creation) -> dict:
    """The access step's tiles: the kind's own, or Free, the suggested
    one-time price with its reason (when the kind has one), and each active
    membership (when it can be in one); after "membership" in her words, only
    those (when she has any)."""
    from apps.billing.models import SubscriptionPlan

    adapter = kinds.get(creation.kind)
    record = _record(creation)
    if (own := adapter.price_tiles(creation, record)) is not None:
        return own
    plans = [
        {"value": f"plan:{p.pk}", "label": f"In {p.name}", "hint": ""}
        for p in (SubscriptionPlan.objects.filter(is_active=True) if adapter.put_in_plan is not None else ())
    ]
    if plans and (creation.answers or {}).get("price") == "membership":
        return {"options": plans, "suggested": None}
    free = {"value": "free", "label": "Free", "hint": ""}
    if (s := adapter.suggest_price(record)) is None:
        return {"options": [free, *plans], "suggested": None}
    paid = {"value": f"paid:{s.amount}", "label": f"One-time price: {_price_label(str(s.amount))}", "hint": s.reason}
    return {"options": [free, paid, *plans], "suggested": paid["value"]}


def _finish_options(creation, asked: dict, record) -> dict:
    """The finish step's buttons: "Start selling" in place of "Publish now"
    while she cannot sell a paid course, and "Sell it for" the suggested
    price when "Just draft it" left the price to her (F11)."""
    from apps.core import monetization

    adapter = kinds.get(creation.kind)
    options = asked["options"]
    if adapter.cannot_sell(record):
        options = [START_SELLING, *(o for o in options if o["value"] != adapter.FINISH[0][0])]
        asked = {**asked, "paid_active": monetization.is_paid_active(connection.tenant)}
    if (creation.answers or {}).get("access") == DELEGATE and (s := adapter.suggest_price(record)):
        options = [
            *options,
            {
                "value": f"price:{s.amount}",
                "label": f"Sell it for {_amount_label(creation, str(s.amount))}",
                "hint": s.reason,
            },
        ]
    return {**asked, "options": options}


def _amount_label(creation, amount: str) -> str:
    """An amount on her finish step: the kind's own words for it (a membership's "$9 a month"), else "$9"."""
    own = getattr(kinds.get(creation.kind), "amount_label", None)  # optional
    return own(_record(creation), amount) if own else _price_label(amount)


def _price_label(value: str) -> str:
    from apps.tenant_config.interview_brief import money

    return {"free": "Free", "membership": "In your membership"}.get(value) or money(value)


def _access_label(value: str) -> str:
    """ "free", "paid:39.00" or "plan:<id>", as her answered line."""
    from apps.billing.models import SubscriptionPlan

    if value.startswith("plan:"):
        plan = SubscriptionPlan.objects.filter(pk=int(value[5:])).first()
        return f"In {plan.name}" if plan else "In your membership"
    try:
        return _price_label(value.removeprefix("paid:"))
    except ValueError:  # a kind's own tile value no longer among its tiles: never a 500
        return value


def _retitle(creation, provisional: str, title: str) -> None:
    """The working title from the topic she named, while the record still has
    the provisional one. Recorded as ours, so the outline may replace it."""
    if title == provisional:
        return
    # Without a record yet (G10), it is the title the record is made with.
    if creation.record_id is not None and not kinds.get(creation.kind).retitle(creation.record_id, provisional, title):
        return
    drafted = creation.drafted or {}
    creation.drafted = {**drafted, "titles": [*(drafted.get("titles") or []), title]}


def _redraft(creation, words: str, *, keep_counts: bool = False) -> None:
    """Her change, written as a new outline; an outline or descriptions still
    being written is dropped. The counts of her first answer no longer apply
    unless this change gave new ones (``keep_counts``): her request decides the
    size, so "add a module" is not cut back to the first answer's count."""
    from apps.core.copilot import runs

    if not keep_counts:
        creation.brief = {
            k: v for k, v in (creation.brief or {}).items() if k not in ("modules", "lessons", "total", "capped")
        }

    for pk in (creation.outline_run_id, jobs.run_id(creation, "descriptions")):
        if pk is not None:
            runs.stop(pk)  # a finished one is left as it is
    kinds.get(creation.kind).start_draft(creation, instruction=words)


def _review_id(recipe) -> str:
    """Its review question's id (the course's "outline_review")."""
    return next(q.id for q in recipe.questions if q.kind == "review")


def _before_draft(creation):
    """The questions the kind's drafting waits for: those before its review,
    but those it skips for this creation."""
    adapter = kinds.get(creation.kind)
    questions = adapter.RECIPE.questions
    skipped = adapter.skips(creation)
    review = [q.kind for q in questions].index("review")
    return tuple(q for q in questions[:review] if q.id not in skipped)


def _delegate_rest(creation) -> None:
    """ "Just draft it": every question the drafting waits for that is still
    open is hers to delegate, and the price step (unless the kind skips it);
    nothing more is clarified. A question the guide may not answer (not
    delegable: an event's kind and date) is left for her."""
    creation.brief = {**(creation.brief or {}), "rest": True, "clarify": []}
    adapter = kinds.get(creation.kind)
    access = [q for q in adapter.RECIPE.questions if q.id == "access" and q.id not in adapter.skips(creation)]
    # The price too, which keeps the course free: a paid price is only ever her tap (F11, R2).
    for q in (*_before_draft(creation), *access):
        if q.id not in creation.answers and q.delegable:
            creation.answers[q.id] = DELEGATE
            _say(creation, q, "You decide")


def _ensure_record(creation) -> None:
    """The kind's draft, once an answer lets it be made (G10; the course's is
    made at start), with the price she gave before it existed; then her
    answers onto it, when the kind keeps any there itself (``sync``). Call
    under the creation's lock; the caller saves."""
    adapter = kinds.get(creation.kind)
    if creation.record_id is None:
        creation.record_id = adapter.create_draft(creation.actor, draft_title(creation), creation.answers)
        price = creation.answers.get("price")
        if creation.record_id is not None and price not in (None, "membership"):
            adapter.set_price(creation.record_id, price)
    if sync := getattr(adapter, "sync", None):  # optional
        sync(creation)


def _next_draft(creation) -> None:
    """The draft record first, once it can be made. Then, once every question
    the drafting waits for is answered and nothing is being clarified or
    followed up: a follow-up when one is allowed, else the kind's drafting.
    Once only: a redraft is her change (``_redraft``), never a later answer."""
    _ensure_record(creation)
    brief = creation.brief or {}
    questions = _before_draft(creation)
    adapter = kinds.get(creation.kind)
    if (
        not draft_started(creation)
        and not any(brief.get(key) for key in ("clarify", "followup", "thinking"))
        and all(q.id in creation.answers for q in questions)
    ):
        # Optional: a drafting refused before it starts (a post's blog gate) is said at once (its
        # start_draft says why), never after a follow-up that would go nowhere.
        refused = getattr(adapter, "draft_refused", None)
        if followup_allowed(creation, adapter.DRAFT_SLOT) and not (refused and refused()):
            _ask_followup(creation, adapter.DRAFT_SLOT)
        else:
            adapter.start_draft(creation)


def _choice(recipe, field: str, words: str) -> str:
    """A choice question's value when her words name one of its options, else her words."""
    words = words.strip()[:ANSWER_MAX]
    q = next(q for q in recipe.questions if q.id == field)
    for value, label in zip(recipe.values.get(field, ()), q.options, strict=False):
        if words.lower() in (value, label.lower()):
            return value
    return words


def _record(creation):
    return kinds.get(creation.kind).record(creation.record_id)


def _locked(creation):
    return FocusCreation.objects.select_for_update().get(pk=creation.pk)


def _add_time(creation, active_ms) -> None:
    if isinstance(active_ms, int) and not isinstance(active_ms, bool) and active_ms > 0:
        creation.active_ms += min(active_ms, MAX_SPAN_MS)


def _tiles(recipe, q) -> list[dict]:
    adapter = kinds.get(recipe.kind)
    # Optional: its own first tiles (a membership's tiers, a bundle's items), with or without a creation.
    if q.id == recipe.questions[0].id and (own := getattr(adapter, "topic_tiles", None)):
        return own()
    if q.starter:
        # Her own words from /setup, when she gave a topic for this kind there.
        from apps.tenant_config.interview_brief import answers_of

        topic = str(answers_of(connection.tenant).get(adapter.SETUP_TOPIC) or "").strip()[:ANSWER_MAX]
        return [{"value": topic, "label": topic, "hint": ""}] if topic else []
    if q.kind == "finish":
        return [{"value": v, "label": label, "hint": ""} for v, label in adapter.FINISH]
    values = recipe.values.get(q.id, ())
    return [
        {"value": v, "label": label, "hint": q.hints[i] if i < len(q.hints) else ""}
        for i, (v, label) in enumerate(zip(values, q.options, strict=False))
    ]


def _pick(recipe, q, value, text, delegate):
    """What her answer stores: a tile's value, her own words, or "delegate"."""
    if delegate and q.delegable:
        return DELEGATE
    words = (text or "").strip()[:ANSWER_MAX]
    if words:
        return words
    if value is None:
        return None
    if q.multi:  # the values of the tiles she ticked, comma-separated: the kind's ``sync`` checks them
        words = str(value).strip()
        return (words[:MULTI_MAX].rsplit(",", 1)[0] if len(words) > MULTI_MAX else words) or None
    if q.kind == "schedule":  # the /setup picker's JSON, or nothing it would not send
        from apps.tenant_config import interview_schedule

        return interview_schedule.parse(value)
    values = recipe.values.get(q.id)
    if values is not None:
        return value if value in values else None
    return str(value).strip()[:ANSWER_MAX] or None


def _label(recipe, q, answer, tiles=None) -> str:
    """Her answer as its answered line; ``tiles``: a kind's own price tiles, value to label."""
    if answer == DELEGATE:
        return "You decide"
    own = getattr(kinds.get(recipe.kind), "label", None)  # optional: its words for an answer (a tile it drew)
    if own and (text := own(q.id, answer)):
        return text
    if q.kind == "review":
        return "Looks good" if answer == "ok" else str(answer)
    if q.kind == "cover":
        return "Cover chosen" if answer == "kept" else "Later"
    if q.kind == "price":
        return (tiles or {}).get(answer) or _access_label(answer)
    if q.kind == "announce":
        return ANNOUNCE_LABELS.get(answer, str(answer))
    if q.kind == "finish":
        return dict(kinds.get(recipe.kind).FINISH).get(answer, str(answer))
    if q.kind == "schedule" and isinstance(answer, dict):
        from apps.tenant_config import interview_schedule

        return interview_schedule.summary(answer)
    values = recipe.values.get(q.id, ())
    return q.options[values.index(answer)] if answer in values else str(answer)


def _say(creation, q, label: str) -> None:
    """The question and her answer, in the dock thread."""
    _chat_append(creation, [{"role": "assistant", "text": q.question}, {"role": "coach", "text": label}])


def _chat_append(creation, entries) -> None:
    if creation.chat_id is None:
        return
    chat = CopilotChat.objects.select_for_update().filter(pk=creation.chat_id).first()
    if chat is None:
        return
    chat.entries = [*(chat.entries or []), *entries]
    chat.save(update_fields=["entries", "updated_at"])
