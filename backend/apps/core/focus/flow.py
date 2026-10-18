"""Focus mode's question flow (spec §5, §6.1 of
docs/superpowers/specs/2026-10-18-focus-mode-design.md): one creation in
progress per FocusCreation row, its recipe's questions asked in order. The
draft record exists from her first answer; a tap never calls a model. What
she types is read first by the analysis job (apps.core.focus.analysis, §5.1),
which answers every question it can; the outline job writes the outline
(apps.core.focus.outline). Call inside her tenant's context. Writes lock the
row, so two tabs cannot both move it."""

from contextlib import suppress
from decimal import Decimal

from django.db import connection, transaction
from django.utils import timezone

from apps.core.onboarding import ai_compose
from apps.tenant_config.models import CopilotChat, CopilotRun, FocusCreation

from . import analysis, covers, descriptions, jobs, outline
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
# The finish step while a lesson is still empty: no "Publish now".
NOT_READY = "Your outline is saved. Next, your lessons."


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
    gave is unclear; None while her typed answer is read, and once it is over."""
    if creation.status != "active" or creation.pending:
        return None
    if (creation.brief or {}).get("clarify"):
        return "clarify"
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
                    question.kind == "finish"
                    # Only typed words are read at the cover; a tap or "You decide" never answers it.
                    or (question.kind == "cover" and (delegate or not (text or "").strip()))
                )
            )
        ):
            creation.save(update_fields=["active_ms", "updated_at"])
            return creation
        words = (text or "").strip()[:ANSWER_MAX]
        if words and not delegate:
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
            elif value == "retry" and status in ("failed", "idle"):
                # Again what failed: her change, when it was a redraft.
                failed = CopilotRun.objects.filter(pk=creation.outline_run_id).first()
                outline.start(creation, instruction=str(((failed and failed.request) or {}).get("instruction") or ""))
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
            _maybe_outline(creation)
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
        elif field and field != "cover":  # the cover's answer is set by the cover endpoint, never by words
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
    _maybe_outline(creation)


def finish(creation, *, publish: bool, active_ms=None) -> FocusCreation:
    """Her last tap: publish the course or keep it as a draft. Focus mode ends."""
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
        # Never an empty lesson in front of students: not ready, it stays a draft.
        choice = "publish" if publish and not _record(creation).not_ready() else "draft"
        if choice == "publish":
            with suppress(content.ContentOpError):  # already published by hand, or gone
                content.publish_course(creation.record_id)
        recipe = RECIPES[creation.kind]
        question = next(q for q in recipe.questions if q.id == "finish")
        creation.answers["finish"] = choice
        _say(creation, question, _label(recipe, question, choice))
        _chat_append(creation, [{"role": "assistant", "text": CLOSING[choice]}])
        creation.status = "done"
        creation.finished_at = timezone.now()
        creation.save()
    return creation


def leave(creation, *, abandon: bool = False, active_ms=None) -> FocusCreation:
    """Save & leave (it stays open to resume), or "Fill it in myself" (it ends;
    the draft stays as it is, and an outline or a reading still going is dropped)."""
    from apps.core.copilot import runs

    with transaction.atomic():
        creation = _locked(creation)
        _add_time(creation, active_ms)
        if abandon and creation.status == "active":
            creation.status = "left"
            creation.pending = {}
            for pk in (creation.outline_run_id, jobs.run_id(creation, "analysis")):
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
    return {
        "field": q.id,
        "kind": q.kind,
        "question": q.question,
        "why": q.why,
        "options": _tiles(recipe, q),
        "starter": q.options[0] if q.starter and q.options else None,
        "can_delegate": q.delegable,
        "specialist": recipe.specialists[q.id],
    }


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
    creation = _settle(_sync_cover(creation))
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
        + ([{"field": "price", "label": _price_label(answers["price"])}] if "price" in answers else []),
        "outline": {"status": outline_status(creation), "run": creation.outline_run_id},
        "descriptions": (
            {"status": jobs.status(creation, "descriptions"), "run": jobs.run_id(creation, "descriptions")}
            if jobs.run_id(creation, "descriptions") is not None
            else None
        ),
        "cover": covers.payload(creation),
        "reading": (
            {"status": jobs.status(creation, "analysis"), "run": jobs.run_id(creation, "analysis")}
            if creation.pending
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
    _maybe_outline(creation)
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


def _price_label(value: str) -> str:
    from apps.tenant_config.interview_brief import money

    return {"free": "Free", "membership": "In your membership"}.get(value) or money(value)


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
    open is hers to delegate, and nothing more is clarified."""
    creation.brief = {**(creation.brief or {}), "rest": True, "clarify": []}
    for q in _before_outline(RECIPES[creation.kind]):
        if q.id not in creation.answers:
            creation.answers[q.id] = DELEGATE
            _say(creation, q, "You decide")


def _maybe_outline(creation) -> None:
    """The outline starts once every question it waits for is answered and
    nothing is being clarified."""
    questions = _before_outline(RECIPES[creation.kind])
    if (
        creation.outline_run_id is None
        and not (creation.brief or {}).get("clarify")
        and all(q.id in creation.answers for q in questions)
    ):
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
