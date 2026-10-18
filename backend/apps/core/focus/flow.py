"""Focus mode's question flow (spec §5, §6.1 of
docs/superpowers/specs/2026-10-18-focus-mode-design.md): one creation in
progress per FocusCreation row, its recipe's questions asked in order. The
draft record exists from her first answer; a tap never calls a model, only
the outline job does (apps.core.focus.outline). Call inside her tenant's
context. Writes lock the row, so two tabs cannot both move it."""

from contextlib import suppress

from django.db import connection, transaction
from django.utils import timezone

from apps.tenant_config.models import CopilotChat, CopilotRun, FocusCreation

from . import outline
from .recipes import RECIPES

DELEGATE = "delegate"
# A reported span of active time counts up to ten minutes: a bogus number
# (a clock jump, a crafted request) cannot inflate her total.
MAX_SPAN_MS = 600_000
TITLE_MAX = 80
ANSWER_MAX = 500
OUTLINE_STATUS = {
    "queued": "building",
    "thinking": "building",
    "working": "building",
    "done": "ready",
    "stopped": "failed",
    "failed": "failed",
}
CLOSING = {
    "publish": "Published. Students can find it on your site now.",
    "draft": "Saved as a draft. Once every lesson has its video or text, publish it from this page.",
}
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
    it are delegated in the same step, so a failure cannot leave a second draft."""
    from apps.core.copilot import content

    recipe = RECIPES.get(kind)
    if recipe is None:
        raise FlowError("unknown_kind")
    first = recipe.questions[0]
    picked = _pick(recipe, first, value, text, delegate) or (DELEGATE if rest else None)
    if picked is None:
        raise FlowError("no_answer")
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
        creation = FocusCreation(kind=kind, actor=actor, chat=chat, record_id=record_id, answers={first.id: picked})
        _add_time(creation, active_ms)
        creation.save()
        if rest:
            creation = answer(creation, current_field(creation), rest=True)
    return creation


def current_field(creation) -> str | None:
    """The first question she has not answered; None once it is over."""
    if creation.status != "active":
        return None
    answers = creation.answers or {}
    return next((q.id for q in RECIPES[creation.kind].questions if q.id not in answers), None)


def answer(creation, field, *, value=None, text=None, delegate=False, rest=False, active_ms=None):
    """Her answer to the current question. An answer to any other question
    (a double tap, a second tab, a stale screen) changes nothing."""
    from apps.core.copilot import runs

    with transaction.atomic():
        creation = _locked(creation)
        _add_time(creation, active_ms)
        recipe = RECIPES[creation.kind]
        question = next((q for q in recipe.questions if q.id == field), None)
        if question is None or field != current_field(creation) or question.kind == "finish":
            creation.save(update_fields=["active_ms", "updated_at"])
            return creation
        if question.kind == "review":
            status = outline_status(creation)
            words = (text or "").strip()[:ANSWER_MAX]
            if value == "ok":
                creation.answers[field] = "ok"
                _say(creation, question, "Looks good, continue")
            elif words:
                # Her change, written as a new outline; one still being written is dropped.
                if status == "building":
                    runs.stop(creation.outline_run_id)
                _say(creation, question, words)
                outline.start(creation, instruction=words)
            elif value == "retry" and status in ("failed", "idle"):
                # Again what failed: her change, when it was a redraft.
                failed = CopilotRun.objects.filter(pk=creation.outline_run_id).first()
                outline.start(creation, instruction=str(((failed and failed.request) or {}).get("instruction") or ""))
        else:
            asked = [q for q in recipe.questions if q.kind not in ("review", "finish")]
            picked = _pick(recipe, question, value, text, delegate)
            if picked is None and not rest:
                creation.save(update_fields=["active_ms", "updated_at"])
                return creation
            if picked is not None:  # with "Just draft it" too: what she typed first
                creation.answers[field] = picked
                _say(creation, question, _label(recipe, question, picked))
            if rest:  # "Just draft it": every question still open is hers to delegate
                for q in asked:
                    if q.id not in creation.answers:
                        creation.answers[q.id] = DELEGATE
                        _say(creation, q, "You decide")
            if creation.outline_run_id is None and all(q.id in creation.answers for q in asked):
                outline.start(creation)
        creation.save()
    return creation


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
    the draft stays as it is, and an outline still being written is dropped)."""
    from apps.core.copilot import runs

    with transaction.atomic():
        creation = _locked(creation)
        _add_time(creation, active_ms)
        if abandon and creation.status == "active":
            creation.status = "left"
            if creation.outline_run_id is not None:
                runs.stop(creation.outline_run_id)  # a finished one is left as it is
        creation.save(update_fields=["active_ms", "status", "updated_at"])
    return creation


def outline_status(creation) -> str:
    """idle | building | ready | failed, from its outline run. A run nobody is
    advancing is failed here, so the guide never waits forever."""
    from apps.core.copilot import runs

    if creation.outline_run_id is None:  # never started, or its run was pruned
        return "ready" if (creation.drafted or {}).get("modules") else "idle"
    runs.sweep(CopilotRun.objects.filter(pk=creation.outline_run_id))
    status = CopilotRun.objects.filter(pk=creation.outline_run_id).values_list("status", flat=True).first()
    return OUTLINE_STATUS.get(status, "idle")


def question(kind: str, field: str) -> dict:
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


def state(creation) -> dict:
    recipe = RECIPES[creation.kind]
    record = _record(creation)
    if record is None and creation.status == "active":  # deleted by hand, or by an Undo
        FocusCreation.objects.filter(pk=creation.pk, status="active").update(status="left")
        creation.status = "left"
    field = current_field(creation)
    answers = creation.answers or {}
    asked = question(creation.kind, field) if field else None
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
        ],
        "outline": {"status": outline_status(creation), "run": creation.outline_run_id},
        "steps": [{"id": q.id, "done": q.id in answers} for q in recipe.questions],
    }


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
