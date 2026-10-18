"""The outline job (spec §5 step 2–3): once she has said what, who and how
big, the Content Creating Specialist writes the course's title, description,
modules and lessons in one structured call, saves them in one step, then emits
the reveal (``field`` and ``row`` events) the course page replays over the
saved data. A copilot run on the agents worker, so it survives her leaving."""

import json
import logging

from django.conf import settings
from django.db import connection, transaction
from django.db.models import Max
from django_tenants.utils import tenant_context
from pydantic import BaseModel

from apps.core import ai as core_ai
from apps.core import tasks
from apps.core.copilot import runs
from apps.core.onboarding import ai_compose
from apps.tenant_config.models import CopilotRun, FocusCreation
from apps.tenant_config.setup_flow import _DRAFT_RULES, _Module

from .recipes import SIZES

logger = logging.getLogger(__name__)

TITLE_MAX = 200
MAX_MODULES = 8
MAX_LESSONS = 8
STEP = {"specialist": "content", "label": "Writing your outline"}
# Honest and generic when the model is down: no invented facts, she renames them.
FALLBACK_MODULES = (
    "Getting started",
    "Building the basics",
    "Putting it into practice",
    "Going deeper",
    "Making it yours",
    "Bringing it together",
)

# Static, byte-identical across tenants (prompt caching); her answers ride the user turn.
SYSTEM = _DRAFT_RULES + (
    "Draft the outline of ONE course: a concrete title (max 80 chars); a 2-3 sentence description of "
    "who it is for and what they will be able to do; modules in a sensible learning order, each with "
    "lesson titles. Titles only: no lesson text.\n"
    "- topic: what the students will learn, in the coach's words; 'delegate' means pick a first "
    "course that fits the niche.\n"
    "- level: 'beginners' (complete beginners), 'some' (some experience), 'advanced', or the coach's "
    "own words; 'delegate' means pick what suits the topic.\n"
    "- size: "
    + "; ".join(f"'{key}' is {m} module{'s' if m > 1 else ''} of {n} lessons" for key, (m, n) in SIZES.items())
    + "; 'delegate' or anything else means 3-5 modules of 2-4 lessons.\n"
    "- When 'instruction' is given, it is the coach's change to 'current_outline': apply it and keep "
    "everything she did not ask to change."
)


class OutlineDraft(BaseModel):
    title: str
    description: str
    modules: list[_Module]


def start(creation, instruction: str = "") -> CopilotRun:
    """A queued outline run for the creation, handed to the agents worker once
    the row is committed. Call inside her tenant's context."""
    run = CopilotRun.objects.create(
        actor=creation.actor,
        chat=creation.chat,
        specialist="content",
        request={"focus": creation.id, "job": "outline", "instruction": instruction},
    )
    creation.outline_run = run
    creation.save(update_fields=["outline_run", "updated_at"])
    schema = connection.schema_name
    transaction.on_commit(lambda: tasks.run_focus_outline.delay(schema, run.id))
    return run


def execute(schema_name, run_id) -> None:
    from apps.core.models import Tenant

    tenant = Tenant.objects.filter(schema_name=schema_name).first()
    if tenant is None:
        return
    with tenant_context(tenant):
        if not runs.claim(run_id):  # stopped, swept, or a second delivery of the task
            return
        try:
            _carry_out(tenant, run_id)
        except Exception:
            logger.exception("focus outline failed schema=%s run=%s", schema_name, run_id)
            runs.finish(run_id, False)


def _carry_out(tenant, run_id) -> None:
    from apps.courses.models import Course, Lesson

    from .flow import DELEGATE, working_title

    run = CopilotRun.objects.get(pk=run_id)
    request = run.request or {}
    creation = FocusCreation.objects.get(pk=request.get("focus"))
    instruction = str(request.get("instruction") or "")
    prior = [
        r.result or {}
        for r in CopilotRun.objects.filter(request__focus=creation.id, request__job="outline", status="done").exclude(
            pk=run_id
        )
    ]
    runs.emit(run_id, "step", {**STEP, "state": "start"})
    course = Course.objects.get(pk=creation.record_id)
    draft = _draft(tenant, creation, course, instruction)
    topic = str((creation.answers or {}).get("topic") or "")
    with transaction.atomic():
        locked = CopilotRun.objects.select_for_update().get(pk=run_id)
        if locked.status not in runs.ACTIVE:  # Stop won while the model wrote: drop it
            return
        course = Course.objects.select_for_update().get(pk=course.pk)
        events, written = write(
            course, draft, working_title("" if topic == DELEGATE else topic), prior=prior, redraft=bool(instruction)
        )
        for event in events:
            runs.emit(run_id, event["type"], event["data"])
    runs.emit(run_id, "step", {**STEP, "state": "done"})
    modules = course.modules.count()
    lessons = Lesson.objects.filter(module__course=course).count()
    summary = f"{modules} module{'s' if modules != 1 else ''}, {lessons} lesson{'s' if lessons != 1 else ''}"
    runs.finish(run_id, True, {"text": f"Your outline is ready: {summary}.", "summary": summary, **written})


def _draft(tenant, creation, course, instruction: str) -> OutlineDraft:
    """The model's outline, or the honest fallback when it is unavailable. A
    redraft never falls back: her outline is not replaced by a generic one."""
    answers = creation.answers or {}
    if not ai_compose.compose_available():
        if instruction:
            raise core_ai.AiError("ai_unavailable")
        return fallback(answers, course.title)
    try:
        parsed, cost, _model = core_ai.structured(
            system=SYSTEM,
            user=_user_turn(tenant, answers, course, instruction),
            output_model=OutlineDraft,
            model=settings.COPILOT_MODEL,
            max_tokens=12000,
            label="contentor:copilot",
            effort="medium",
        )
    except core_ai.AiError as exc:
        ai_compose.record_spend(tenant.schema_name, getattr(exc, "cost_usd", None) or 0)
        if instruction:
            raise
        logger.warning("focus outline: model failed, using the fallback schema=%s", tenant.schema_name)
        return fallback(answers, course.title)
    ai_compose.record_spend(tenant.schema_name, cost)
    # The size she picked holds even when the model writes more.
    limit = SIZES[answers["size"]][0] if answers.get("size") in SIZES and not instruction else MAX_MODULES
    return parsed.model_copy(update={"modules": parsed.modules[:limit]})


def _user_turn(tenant, answers: dict, course, instruction: str) -> str:
    from apps.core.onboarding.ai_curate import CoachBrief

    brief = CoachBrief.from_tenant(tenant)
    turn = {
        "topic": answers.get("topic", ""),
        "level": answers.get("level", ""),
        "size": answers.get("size", ""),
        "instruction": instruction,
        "niche": brief.subject or brief.niche,
    }
    if instruction:
        turn["current_outline"] = {
            "title": course.title,
            "description": course.description,
            "modules": [
                {"title": m.title, "lessons": [lesson.title for lesson in m.lessons.order_by("order", "id")]}
                for m in course.modules.order_by("order", "id")
            ],
        }
    return json.dumps(turn, ensure_ascii=False)


def fallback(answers: dict, title: str) -> OutlineDraft:
    modules, lessons = SIZES.get(answers.get("size"), SIZES["short"])
    return OutlineDraft(
        title=title,
        description="",
        modules=[
            _Module(title=FALLBACK_MODULES[i], lessons=[f"Lesson {n}" for n in range(1, lessons + 1)])
            for i in range(modules)
        ],
    )


def write(course, draft: OutlineDraft, working_title: str, *, prior=(), redraft: bool = False):
    """Save the draft over the course in one step; what she wrote herself wins.
    The title and description are written only while they are still ours (the
    working title, or what an earlier outline wrote); modules only when the
    course has none, except a redraft, which replaces the modules the earlier
    outlines made and keeps hers. Returns (events to emit in order, what was
    written: the run's result, read by the next redraft)."""
    from apps.courses.models import Lesson, Module

    record = f"course:{course.id}"
    events, written = [], {"title": None, "description": None, "modules": []}
    changed = []
    ours = {
        "title": {working_title} | {p["title"] for p in prior if p.get("title")},
        "description": {""} | {p["description"] for p in prior if p.get("description")},
    }
    for name, value in (("title", draft.title.strip()[:TITLE_MAX]), ("description", draft.description.strip())):
        if getattr(course, name) not in ours[name]:
            continue
        if value:
            setattr(course, name, value)
            changed.append(name)
            events.append({"type": "field", "data": {"record": record, "name": name, "value": value}})
        written[name] = getattr(course, name)
    if changed:
        course.save(update_fields=[*changed, "updated_at"])
    if redraft:
        Module.objects.filter(course=course, pk__in=[i for p in prior for i in p.get("modules") or []]).delete()
    if redraft or not course.modules.exists():
        top = course.modules.aggregate(top=Max("order"))["top"] or 0
        for index, module_draft in enumerate(draft.modules, start=1):
            title = module_draft.title.strip()[:TITLE_MAX] or f"Module {index}"
            lessons = [t.strip()[:TITLE_MAX] for t in module_draft.lessons if t.strip()][:MAX_LESSONS]
            module = Module.objects.create(course=course, title=title, order=top + index)
            Lesson.objects.bulk_create(
                [Lesson(module=module, title=lesson, order=n) for n, lesson in enumerate(lessons, start=1)]
            )
            written["modules"].append(module.id)
            events.append(
                {
                    "type": "row",
                    "data": {"record": record, "kind": "module", "value": {"title": title, "lessons": lessons}},
                }
            )
    return events, written
