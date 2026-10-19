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
from decimal import Decimal

from django.db import connection, transaction
from django.utils import timezone

from apps.core.onboarding import ai_compose
from apps.tenant_config.models import CopilotChat, CopilotRun, FocusCreation

from . import analysis, covers, descriptions, followup, jobs, outline, pricing
from . import announce as announcing  # ``announce`` is finish()'s flag
from .recipes import RECIPES

DELEGATE = "delegate"
# A reported span of active time counts up to ten minutes: a bogus number
# (a clock jump, a crafted request) cannot inflate her total.
MAX_SPAN_MS = 600_000
TITLE_MAX = 80
ANSWER_MAX = 500
CLOSING = {
    "publish": "Published. Students can find it on your site now.",
    "draft": "Saved as a draft. Once every lesson has its video or text, publish it from this page.",
}
WRITING_DESCRIPTIONS = "Writing a short description for each lesson's video. Edit any of them on the page."
# Not now: what became of Marketing's draft, if it made one.
SAVED_IN_MESSAGES = "Your announcement is saved as a draft in Messages."
NO_ANNOUNCEMENT = "No announcement this time."
ANNOUNCE_LABELS = {"scheduled": "Schedule", "draft": "Not now", "skip": "Not now"}
# The finish step while a lesson is still empty: no "Publish now".
NOT_READY = "Your outline is saved. Next, your lessons."
# The finish step of a paid course she cannot sell yet: no "Publish now" (F11).
START_SELLING = {"value": "start_selling", "label": "Start selling", "hint": "your plan, then payouts"}
# Follow-ups asked (F4): at most four per creation, two before the outline.
MAX_FOLLOWUPS = 4
MAX_PER_SLOT = 2


class FlowError(Exception):
    pass


def working_title(topic: str) -> str:
    """Her topic as a course title until the outline writes a better one."""
    text = (topic or "").strip()
    starter = RECIPES["course"].questions[0].options[0].strip()
    if text.lower().startswith(starter.lower()):
        text = text[len(starter) :].strip()
    text = text.rstrip(".").strip()
    if not text:
        return "New course"
    return (text[0].upper() + text[1:])[:TITLE_MAX]


def start(user, kind: str, *, value=None, text=None, delegate=False, rest=False, active_ms=0) -> FocusCreation:
    """Her first answer (the topic): the draft course, the dock thread and the
    creation, all at once. With ``rest`` ("Just draft it"), the questions after
    it are delegated in the same step, so a failure cannot leave a second draft.
    Typed words are read by the analysis first; the title is provisional until then."""
    from apps.core.copilot import content

    recipe = RECIPES.get(kind)
    if recipe is None:
        raise FlowError("unknown_kind")
    first = recipe.questions[0]
    picked = _pick(recipe, first, value, text, delegate) or (DELEGATE if rest else None)
    if picked is None:
        raise FlowError("no_answer")
    typed = picked != DELEGATE and bool((text or "").strip())
    title = working_title("" if picked == DELEGATE else picked)
    actor = user if getattr(user, "pk", None) else None
    with transaction.atomic():
        record_id = content.create_course(actor, {"title": title}, cover=False)["id"]
        chat = CopilotChat.objects.create(
            actor=actor,
            title=f"New course: {title}"[:120],
            entries=[
                {"role": "assistant", "text": first.question},
                {"role": "coach", "text": _label(recipe, first, picked)},
            ],
        )
        creation = FocusCreation(
            kind=kind, actor=actor, chat=chat, record_id=record_id, answers={} if typed else {first.id: picked}
        )
        _add_time(creation, active_ms)
        creation.save()
        if typed:
            _analyse(creation, first.id, picked, rest)
            creation.save()
        elif rest:
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
    return next((q.id for q in RECIPES[creation.kind].questions if q.id not in answers), None)


def answer(creation, field, *, value=None, text=None, delegate=False, rest=False, active_ms=None):
    """Her answer to the current question. An answer to any other question
    (a double tap, a second tab, a stale screen) changes nothing. What she
    types is read by the analysis first; taps and "You decide" apply at once."""
    with transaction.atomic():
        creation = _locked(creation)
        _add_time(creation, active_ms)
        recipe = RECIPES[creation.kind]
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
            status = outline_status(creation)
            if value == "ok":
                creation.answers[field] = "ok"
                _say(creation, question, "Looks good, continue")
                if status == "ready":  # otherwise the outline job starts them once it has written
                    descriptions.start(creation)
                _chat_append(creation, [{"role": "assistant", "text": WRITING_DESCRIPTIONS}])
                if followup_allowed(creation, "later"):  # before the cover; it never redrafts the outline
                    _ask_followup(creation, "later")
            elif value == "retry" and status in ("failed", "idle"):
                # Again what failed: her change, when it was a redraft.
                failed = CopilotRun.objects.filter(pk=creation.outline_run_id).first()
                outline.start(creation, instruction=str(((failed and failed.request) or {}).get("instruction") or ""))
        elif question.kind == "finish":
            price = _sell_for(creation, value)
            _set_price(creation, price)
            _say(creation, question, f"Sell it for {_price_label(price)}")
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
    recipe = RECIPES[creation.kind]
    creation.answers = dict(creation.answers or {})
    item = _pop_clarify(creation) if field == "clarify" else None
    if found is None:
        if item:
            _clarified(creation, item["field"], text)
        elif field == "outline_review":
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
            _retitle(creation, working_title(text), working_title(found.topic or text))
        if found.level.strip():
            creation.answers["level"] = _choice(recipe, "level", found.level)
        creation.brief = analysis.brief_from(found, creation.brief)
        counted = any(n is not None for n in (found.modules, found.lessons, found.total)) or bool(found.named)
        if counted and (label := size_label(creation.brief)):
            creation.answers["size"] = label
        if field == "cover" and found.photo.strip():
            creation.covers = {**(creation.covers or {}), "query": found.photo.strip()}
        price = analysis.price_value(found.price)
        if price:
            _set_price(creation, price)
        if found.answer.strip():
            if item:
                _clarified(creation, item["field"], found.answer)
            elif field in recipe.values and field not in creation.answers:
                creation.answers[field] = _choice(recipe, field, found.answer)
        drafted = creation.outline_run_id is not None or bool((creation.drafted or {}).get("modules"))
        at_review = field == "outline_review" and (found.answer.strip() or not price)  # a price alone is no change
        if drafted and (found.outline_change.strip() or counted or at_review):
            _redraft(
                creation, text, keep_counts=any(n is not None for n in (found.modules, found.lessons, found.total))
            )
        brief = creation.brief
        clarify = list(brief.get("clarify") or [])
        for unclear in found.unclear:  # each asked once
            if unclear.field not in {*(brief.get("asked") or []), *(c["field"] for c in clarify)}:
                clarify.append(unclear.model_dump())
        creation.brief = {**brief, "clarify": clarify}
    if pending.get("rest"):
        _delegate_rest(creation)
    _next_draft(creation)


def finish(creation, *, publish: bool, announce: bool = False, active_ms=None) -> FocusCreation:
    """Her last tap: publish the course or keep it as a draft. Focus mode ends,
    unless it went live with "Tell my students" (``announce``): then Marketing
    drafts the announcement while she waits, and her Schedule or Not now ends it."""
    from apps.core.copilot import content

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
        # Never an empty lesson in front of students, nor a paid course she cannot sell yet: a draft.
        record = _record(creation)
        choice = "publish" if publish and not record.not_ready() and not _cannot_sell(record) else "draft"
        if choice == "publish":
            with suppress(content.ContentOpError):  # already published by hand, or gone
                content.publish_course(creation.record_id)
        recipe = RECIPES[creation.kind]
        question = next(q for q in recipe.questions if q.id == "finish")
        creation.answers["finish"] = choice
        _say(creation, question, _label(recipe, question, choice))
        _chat_append(creation, [{"role": "assistant", "text": CLOSING[choice]}])
        if choice == "publish" and announce:
            announcing.start(creation)
        else:
            _end(creation, "skip")
        creation.save()
    return creation


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
            closing = f"Your announcement is scheduled for {when:%A} {when.day} {when:%B} at {when:%H:%M}."
        else:
            closing = SAVED_IN_MESSAGES if row else NO_ANNOUNCEMENT
        value = "scheduled" if schedule else "draft" if row else "skip"
        question = next(q for q in RECIPES[creation.kind].questions if q.id == "announce")
        _say(creation, question, ANNOUNCE_LABELS[value])
        _chat_append(creation, [{"role": "assistant", "text": closing}])
        _end(creation, value)
        creation.save()
    return creation


def retry_announcement(creation) -> FocusCreation:
    """Try again after Marketing's draft failed; never while one is being written."""
    with transaction.atomic():
        creation = _locked(creation)
        shown = announcing.payload(creation)
        if current_field(creation) == "announce" and (shown is None or shown["status"] == "failed"):
            announcing.start(creation)
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
                *(jobs.run_id(creation, job) for job in ("analysis", "announce", "followup")),
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
            "specialist": followup.SPECIALIST[asked["slot"]],
        }
    if field == "clarify":  # one short question about a detail she gave, its options written by the analysis
        unclear = creation.brief["clarify"][0]
        return {
            "field": "clarify",
            "kind": "choice",
            "question": unclear["question"],
            "why": "",
            "options": [{"value": o["value"], "label": o["label"], "hint": ""} for o in unclear["options"]],
            "starter": None,
            "can_delegate": True,
            "specialist": "content",
        }
    recipe = RECIPES[kind]
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
    return {**asked, **_price_tiles(creation)} if q.kind == "price" else asked


def _sync_cover(creation):
    """A cover kept in the photo studio ("I'll edit it") answers the cover
    question when she comes back: the kept design is the answer."""
    from apps.media.models import Design

    if creation.status != "active" or "cover" in (creation.answers or {}) or creation.record_id is None:
        return creation
    if not Design.objects.filter(
        kind="cover", target_kind="course", target_key=str(creation.record_id), state="kept"
    ).exists():
        return creation
    with transaction.atomic():
        creation = _locked(creation)
        if "cover" not in (creation.answers or {}):
            creation.answers = {**(creation.answers or {}), "cover": "kept"}
            creation.save(update_fields=["answers", "updated_at"])
    return creation


def state(creation) -> dict:
    creation = _settle_followup(_settle(_sync_cover(creation)))
    recipe = RECIPES[creation.kind]
    record = _record(creation)
    if record is None and creation.status == "active":  # deleted by hand, or by an Undo
        FocusCreation.objects.filter(pk=creation.pk, status="active").update(status="left")
        creation.status = "left"
    field = current_field(creation)
    answers = creation.answers or {}
    asked = question(creation.kind, field, creation) if field else None
    gap = record and field == "finish" and record.not_ready()
    if gap:
        asked = {
            **asked,
            "question": NOT_READY,
            "why": f"{gap.capitalize()}. Until then it stays a hidden draft.",
            "options": [o for o in asked["options"] if o["value"] != "publish"],
            "specialist": "content",
        }
    if record and field == "finish":
        asked = _finish_options(creation, asked, record)
    return {
        "id": creation.id,
        "kind": creation.kind,
        "status": creation.status,
        "chat": creation.chat_id,
        "record": {"id": record.id, "slug": record.slug, "title": record.title} if record else None,
        "question": asked,
        "answered": [
            {"field": q.id, "label": _label(recipe, q, answers[q.id])} for q in recipe.questions if q.id in answers
        ]
        # Her price said before its own step; once the step is answered, its line says it.
        + (
            [{"field": "price", "label": _price_label(answers["price"])}]
            if "price" in answers and "access" not in answers
            else []
        ),
        "outline": {"status": outline_status(creation), "run": creation.outline_run_id},
        "descriptions": (
            {"status": jobs.status(creation, "descriptions"), "run": jobs.run_id(creation, "descriptions")}
            if jobs.run_id(creation, "descriptions") is not None
            else None
        ),
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
                "specialist": followup.SPECIALIST[thinking["slot"]],
            }
            if (thinking := (creation.brief or {}).get("thinking"))
            else None
        ),
        "steps": [{"id": q.id, "done": q.id in answers} for q in recipe.questions],
    }


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
    if not brief.get("followup") and thinking["slot"] == "outline":  # a later one never touches the outline
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
    if asked["slot"] == "outline":
        _next_draft(creation)  # a second follow-up when allowed, else the outline
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
    label = None
    if delegate:
        if unclear["field"] in ("modules", "lessons"):
            creation.answers.setdefault("size", DELEGATE)
        elif unclear["field"] == "level":
            creation.answers.setdefault("level", DELEGATE)
        label = "You decide"
    elif value is not None and str(value).strip():
        _clarified(creation, unclear["field"], value)
        label = next((o["label"] for o in unclear["options"] if o["value"] == value), str(value)[:ANSWER_MAX])
    elif not rest:
        return False
    _pop_clarify(creation)
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


def _clarified(creation, field, value) -> None:
    """Her answer to a clarify question, onto the field it asked about. One
    that is still no count or price leaves that field to its usual question."""
    words = str(value).strip()
    if not words:
        return
    if field == "price":
        if price := analysis.price_value(words):
            _set_price(creation, price)
    elif field == "level":
        creation.answers["level"] = _choice(RECIPES[creation.kind], "level", words)
    else:
        try:
            count = int(words)
        except ValueError:
            return
        creation.brief = analysis.brief_from(analysis.Analysis(**{field: count}), creation.brief)
        creation.answers["size"] = size_label(creation.brief)


def _set_price(creation, value: str) -> None:
    """Her price, from her own tap or words (F11): "free", "membership" (the
    course is left as it is; the access step offers her memberships) or an amount."""
    from apps.courses.models import Course

    course = Course.objects.filter(pk=creation.record_id)
    if value == "free":
        course.update(pricing_type="free", price=0)
    elif value != "membership":
        course.update(pricing_type="paid", price=Decimal(value))
    creation.answers["price"] = value
    if value != "membership":  # the access step is answered too; "membership" asks which one
        creation.answers["access"] = value if value == "free" else f"paid:{value}"


def _amount(value, prefix: str) -> str | None:
    """A tapped amount ("paid:39", "price:39"), checked as her typed price is:
    a positive amount in the course's range, two decimals; None otherwise."""
    value = str(value or "")
    price = analysis.price_value(value.removeprefix(prefix)) if value.startswith(prefix) else None
    return price if price not in (None, "free", "membership") else None


def _sell_for(creation, value) -> str | None:
    """ "Sell it for" on finish: only after "Just draft it" left the price to her."""
    return _amount(value, "price:") if (creation.answers or {}).get("access") == DELEGATE else None


def _access(creation, q, value, delegate) -> bool:
    """A tap at "How will students get it?": Free, a one-time price (any valid
    amount she taps is hers, F11) or one of her active memberships. "You
    decide" leaves the course as it is. False when the tap carried no answer."""
    from django.contrib.contenttypes.models import ContentType

    from apps.billing.models import SubscriptionPlan, SubscriptionPlanAccess
    from apps.courses.models import Course

    value = str(value or "")
    plan_id = value.removeprefix("plan:")
    if delegate:
        creation.answers["access"] = DELEGATE
    elif value == "free" or (price := _amount(value, "paid:")):
        _set_price(creation, "free" if value == "free" else price)
    elif value.startswith("plan:") and plan_id.isascii() and plan_id.isdigit() and len(plan_id) < 10:
        plan = SubscriptionPlan.objects.filter(pk=int(plan_id), is_active=True).first()
        if plan is None:
            return False
        Course.objects.filter(pk=creation.record_id).update(pricing_type="subscription")
        SubscriptionPlanAccess.objects.get_or_create(
            plan=plan, content_type=ContentType.objects.get_for_model(Course), object_id=creation.record_id
        )
        creation.answers["price"] = "membership"
        creation.answers["access"] = f"plan:{plan.pk}"
    else:
        return False
    _say(creation, q, _label(RECIPES[creation.kind], q, creation.answers["access"]))
    return True


def _price_tiles(creation) -> dict:
    """The access step's tiles: Free, the suggested one-time price with its
    reason, and each active membership; after "membership" in her words, only
    those (when she has any)."""
    from apps.billing.models import SubscriptionPlan

    plans = [
        {"value": f"plan:{p.pk}", "label": f"In {p.name}", "hint": ""}
        for p in SubscriptionPlan.objects.filter(is_active=True)
    ]
    if plans and (creation.answers or {}).get("price") == "membership":
        return {"options": plans, "suggested": None}
    s = pricing.suggest(_record(creation))
    paid = {"value": f"paid:{s.amount}", "label": f"One-time price: {_price_label(str(s.amount))}", "hint": s.reason}
    return {"options": [{"value": "free", "label": "Free", "hint": ""}, paid, *plans], "suggested": paid["value"]}


def _cannot_sell(record) -> bool:
    """A paid course while selling is not open yet (her plan, then payouts)."""
    from apps.core import monetization

    return record.pricing_type == "paid" and not monetization.can_monetize(connection.tenant)


def _finish_options(creation, asked: dict, record) -> dict:
    """The finish step's buttons: "Start selling" in place of "Publish now"
    while she cannot sell a paid course, and "Sell it for" the suggested
    price when "Just draft it" left the price to her (F11)."""
    from apps.core import monetization

    options = asked["options"]
    if _cannot_sell(record):
        options = [START_SELLING, *(o for o in options if o["value"] != "publish")]
        asked = {**asked, "paid_active": monetization.is_paid_active(connection.tenant)}
    if (creation.answers or {}).get("access") == DELEGATE:
        s = pricing.suggest(record)
        options = [
            *options,
            {"value": f"price:{s.amount}", "label": f"Sell it for {_price_label(str(s.amount))}", "hint": s.reason},
        ]
    return {**asked, "options": options}


def _price_label(value: str) -> str:
    from apps.tenant_config.interview_brief import money

    return {"free": "Free", "membership": "In your membership"}.get(value) or money(value)


def _access_label(value: str) -> str:
    """ "free", "paid:39.00" or "plan:<id>", as her answered line."""
    from apps.billing.models import SubscriptionPlan

    if value.startswith("plan:"):
        plan = SubscriptionPlan.objects.filter(pk=int(value[5:])).first()
        return f"In {plan.name}" if plan else "In your membership"
    return _price_label(value.removeprefix("paid:"))


def _retitle(creation, provisional: str, title: str) -> None:
    """The working title from the topic she named, while the course still has
    the provisional one. Recorded as ours, so the outline may replace it."""
    from apps.courses.models import Course

    if title == provisional or not Course.objects.filter(pk=creation.record_id, title=provisional).update(title=title):
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
    outline.start(creation, instruction=words)


def _before_outline(recipe):
    """The questions the outline waits for: those before its review."""
    return recipe.questions[: [q.id for q in recipe.questions].index("outline_review")]


def _delegate_rest(creation) -> None:
    """ "Just draft it": every question the outline waits for that is still
    open is hers to delegate, and the price step; nothing more is clarified."""
    creation.brief = {**(creation.brief or {}), "rest": True, "clarify": []}
    recipe = RECIPES[creation.kind]
    # The price too, which keeps the course free: a paid price is only ever her tap (F11, R2).
    for q in (*_before_outline(recipe), *(q for q in recipe.questions if q.id == "access")):
        if q.id not in creation.answers:
            creation.answers[q.id] = DELEGATE
            _say(creation, q, "You decide")


def _next_draft(creation) -> None:
    """Once every question the outline waits for is answered and nothing is
    being clarified or followed up: a follow-up when one is allowed, else the
    outline."""
    brief = creation.brief or {}
    questions = _before_outline(RECIPES[creation.kind])
    if (
        creation.outline_run_id is None
        and not (creation.drafted or {}).get("modules")  # its run pruned: still written
        and not any(brief.get(key) for key in ("clarify", "followup", "thinking"))
        and all(q.id in creation.answers for q in questions)
    ):
        if followup_allowed(creation, "outline"):
            _ask_followup(creation, "outline")
        else:
            outline.start(creation)


def _choice(recipe, field: str, words: str) -> str:
    """A choice question's value when her words name one of its options, else her words."""
    words = words.strip()[:ANSWER_MAX]
    q = next(q for q in recipe.questions if q.id == field)
    for value, label in zip(recipe.values.get(field, ()), q.options, strict=False):
        if words.lower() in (value, label.lower()):
            return value
    return words


def _record(creation):
    from apps.courses.models import Course

    return Course.objects.filter(pk=creation.record_id).first() if creation.record_id else None


def _locked(creation):
    return FocusCreation.objects.select_for_update().get(pk=creation.pk)


def _add_time(creation, active_ms) -> None:
    if isinstance(active_ms, int) and not isinstance(active_ms, bool) and active_ms > 0:
        creation.active_ms += min(active_ms, MAX_SPAN_MS)


def _tiles(recipe, q) -> list[dict]:
    if q.starter:
        # Her own words from /setup, when she gave a course topic there.
        from apps.tenant_config.interview_brief import answers_of

        topic = str(answers_of(connection.tenant).get("course_topic") or "").strip()[:ANSWER_MAX]
        return [{"value": topic, "label": topic, "hint": ""}] if topic else []
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
    values = recipe.values.get(q.id)
    if values is not None:
        return value if value in values else None
    return str(value).strip()[:ANSWER_MAX] or None


def _label(recipe, q, answer) -> str:
    if answer == DELEGATE:
        return "You decide"
    if q.kind == "review":
        return "Looks good" if answer == "ok" else str(answer)
    if q.kind == "cover":
        return "Cover chosen" if answer == "kept" else "Later"
    if q.kind == "price":
        return _access_label(answer)
    if q.kind == "announce":
        return ANNOUNCE_LABELS.get(answer, str(answer))
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
