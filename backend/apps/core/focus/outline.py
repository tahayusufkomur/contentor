"""The outline job (spec §5 step 2–3): once she has said what, who and how
big, the Content Creating Specialist writes the course's title, description,
modules and lessons in one structured call, saves them in one step, then emits
the reveal (``field`` and ``row`` events) the course page replays over the
saved data. A copilot run on the agents worker, so it survives her leaving."""

import json
import logging

from django.conf import settings
from django.db import transaction
from django.db.models import Max
from pydantic import BaseModel

from apps.core import ai as core_ai
from apps.core.copilot import runs
from apps.core.onboarding import ai_compose
from apps.tenant_config.models import CopilotRun, FocusCreation
from apps.tenant_config.setup_flow import _DRAFT_RULES, _Module

from . import covers, descriptions, jobs
from .recipes import SIZES

logger = logging.getLogger(__name__)

TITLE_MAX = 200
MAX_MODULES = 12
MAX_LESSONS = 12
CAPPED = " I drafted the first 12 modules; add the rest on the page."
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
    "- topic: what the students will learn, in the coach's words; 'delegate' means pick a course "
    "that fits her site (brand, niche, description) and is not one of her_courses.\n"
    "- level: 'beginners' (complete beginners), 'some' (some experience), 'advanced', or the coach's "
    "own words; 'delegate' means pick what suits the topic.\n"
    "- size: "
    + "; ".join(f"'{key}' is {m} module{'s' if m > 1 else ''} of {n} lessons" for key, (m, n) in SIZES.items())
    + "; 'delegate' or anything else means 3-5 modules of 2-4 lessons.\n"
    "- exact: counts and titles the coach gave: use her titles word for word, in her order, and write "
    "only what she left open.\n"
    "- notes: what else she said about the course; follow it.\n"
    "- followups: questions she answered about this course; follow her answers.\n"
    "- When 'instruction' is given, it is the coach's change to 'current_outline': apply it and keep "
    "everything she did not ask to change. Modules marked 'kept' are hers and stay on the page as they "
    "are: leave them out of your modules."
)


class OutlineDraft(BaseModel):
    title: str
    description: str
    modules: list[_Module]


def start(creation, instruction: str = "") -> CopilotRun:
    """A queued outline run for the creation, handed to the agents worker once
    the row is committed. Call inside her tenant's context."""
    return jobs.queue(creation, "outline", specialist="content", instruction=instruction)


def carry_out(tenant, run_id) -> None:
    from apps.courses.models import Course, Lesson

    from .flow import DELEGATE, working_title

    run = CopilotRun.objects.get(pk=run_id)
    request = run.request or {}
    creation = FocusCreation.objects.get(pk=request.get("focus"))
    instruction = str(request.get("instruction") or "")
    runs.emit(run_id, "step", {**STEP, "state": "start"})
    course = Course.objects.get(pk=creation.record_id)
    draft = _draft(tenant, creation, course, instruction)
    topic = str((creation.answers or {}).get("topic") or "")
    with transaction.atomic():
        # The creation first, then the run, then the course: the order her requests lock them in.
        creation = FocusCreation.objects.select_for_update().get(pk=creation.pk)
        if not jobs.active(run_id):  # Stop won while the model wrote: drop it
            return
        course = Course.objects.select_for_update().get(pk=course.pk)
        capped = bool((creation.brief or {}).get("capped"))
        events, creation.drafted = write(
            course,
            draft,
            working_title("" if topic == DELEGATE else topic),
            drafted=creation.drafted or {},
            redraft=bool(instruction),
        )
        creation.save(update_fields=["drafted", "updated_at"])
        for event in events:
            runs.emit(run_id, event["type"], event["data"])
        if (creation.answers or {}).get("outline_review") == "ok":
            # A redraft after she confirmed the titles: what it created has no text yet.
            descriptions.start(creation)
        if (
            not instruction
            and not (course.thumbnail_id or course.thumbnail_url)
            and jobs.run_id(creation, "covers") is None
        ):
            covers.start(creation, ahead=True)  # the first outline: the Designer drafts ahead of the cover step
    runs.emit(run_id, "step", {**STEP, "state": "done"})
    modules = course.modules.count()
    lessons = Lesson.objects.filter(module__course=course).count()
    summary = f"{modules} module{'s' if modules != 1 else ''}, {lessons} lesson{'s' if lessons != 1 else ''}"
    text = f"Your outline is ready: {summary}." + (CAPPED if capped else "")
    runs.finish(run_id, True, {"text": text, "summary": summary})


def _draft(tenant, creation, course, instruction: str) -> OutlineDraft:
    """The model's outline, or the honest fallback when it is unavailable. A
    redraft never falls back: her outline is not replaced by a generic one.
    Either way her counts and titles are enforced by ``conform``."""
    answers = creation.answers or {}
    drafted = (creation.drafted or {}).get("modules") or []
    kept = len(_kept(course, drafted)) if instruction else 0
    brief = creation.brief or {}
    if not instruction and not brief.get("analysed"):
        brief = _read_first_answer(tenant, creation, course)
    if not ai_compose.compose_available():
        if instruction:
            raise core_ai.AiError("ai_unavailable")
        return fallback(answers, course.title, brief)
    try:
        parsed, cost, _model = core_ai.structured(
            system=SYSTEM,
            user=_user_turn(tenant, answers, course, instruction, drafted, brief),
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
        return fallback(answers, course.title, brief)
    ai_compose.record_spend(tenant.schema_name, cost)
    if not any(brief.get(key) for key in ("modules", "lessons", "total")):
        # No count of hers: the size she tapped holds even when the model writes more.
        size = SIZES.get(answers.get("size"))
        if size and not instruction:
            parsed = parsed.model_copy(update={"modules": parsed.modules[: size[0]]})
    return conform(parsed, brief, first=not instruction, kept=kept)


def _read_first_answer(tenant, creation, course) -> dict:
    """Her brief, after reading her typed first answer here when the analysis
    job never settled it (it failed or was stopped): her counts and titles hold
    either way. Without a reading the brief stays as it was (spec §5.1 Waiting)."""
    from apps.core.currency import tenant_charge_currency

    from . import analysis
    from .flow import DELEGATE, question

    topic = str((creation.answers or {}).get("topic") or "")
    if not topic or topic == DELEGATE or not ai_compose.compose_available():
        return creation.brief or {}
    try:
        found = analysis.read(
            tenant,
            topic,
            question=question(creation.kind, "topic")["question"],
            outline_exists=False,
            currency=tenant_charge_currency(tenant),
            course_id=course.pk,
        )
    except core_ai.AiError:
        logger.warning("focus outline: no reading of her answer, going on without schema=%s", tenant.schema_name)
        return creation.brief or {}
    with transaction.atomic():  # flow writes the brief too: change only that field, under the lock
        locked = FocusCreation.objects.select_for_update().get(pk=creation.pk)
        locked.brief = analysis.brief_from(found, locked.brief)
        locked.save(update_fields=["brief", "updated_at"])
    creation.brief = locked.brief
    return locked.brief


def conform(draft: OutlineDraft, brief: dict, *, first: bool, kept: int = 0) -> OutlineDraft:
    """The draft, made to match what she asked for exactly (spec §5.1): her
    module count (less the modules a redraft keeps), her lessons per module or
    her lessons in all, and, on the first draft only, her module and lesson
    titles word for word. Padding is honest and generic ("Module 3",
    "Lesson 3"); nothing exceeds MAX_MODULES x MAX_LESSONS."""
    brief = brief or {}
    modules = [(m.title, list(m.lessons)) for m in draft.modules]
    count, per, total = brief.get("modules"), brief.get("lessons"), brief.get("total")

    if count:
        modules = modules[: max(count - kept, 0)][:MAX_MODULES]
        while len(modules) < min(max(count - kept, 0), MAX_MODULES):
            n = len(modules) + 1
            modules.append(
                (f"Module {n}", [f"Lesson {k}" for k in range(1, (len(modules[-1][1]) if modules else 3) + 1)])
            )
    modules = modules[:MAX_MODULES]
    for _title, lessons in modules:
        if per:
            del lessons[per:]
            lessons.extend(f"Lesson {k}" for k in range(len(lessons) + 1, min(per, MAX_LESSONS) + 1))
        del lessons[MAX_LESSONS:]

    named = brief.get("named") or []
    if first:
        for index, item in enumerate(named[:MAX_MODULES]):
            if index == len(modules):
                modules.append((f"Module {index + 1}", [f"Lesson {k}" for k in range(1, (per or 2) + 1)]))
            title, lessons = modules[index]
            theirs = [t for t in item.get("lessons") or [] if t][:MAX_LESSONS]
            modules[index] = (item.get("title") or title, [*theirs, *lessons[len(theirs) :]])

    if total:
        _fit_total(modules, total, resize=not count)
    return draft.model_copy(update={"modules": [_Module(title=t, lessons=ls) for t, ls in modules]})


def _fit_total(modules: list, total: int, *, resize: bool) -> None:
    """Trim or pad lessons from the last module back until they add up to
    ``total``. ``resize``: a module count of hers is not given, so modules may
    be added (room ran out) or dropped (fewer lessons than modules)."""
    while (have := sum(len(ls) for _t, ls in modules)) != total:
        if have > total:
            room = next((m for m in reversed(modules) if len(m[1]) > 1), None)
            if room is not None:
                room[1].pop()
            elif resize and len(modules) > 1:
                modules.pop()
            else:
                return  # a module holds at least one lesson
        else:
            room = next((m for m in reversed(modules) if len(m[1]) < MAX_LESSONS), None)
            if room is None and resize and len(modules) < MAX_MODULES:
                room = (f"Module {len(modules) + 1}", [])
                modules.append(room)
            if room is None:
                return
            room[1].append(f"Lesson {len(room[1]) + 1}")


def site(tenant, course_id=None) -> dict:
    """What her site is about, even when /setup left no niche (a seeded site),
    and her other courses' titles."""
    from apps.core.onboarding.ai_curate import CoachBrief
    from apps.courses.models import Course
    from apps.tenant_config.models import TenantConfig

    brief = CoachBrief.from_tenant(tenant)
    config = TenantConfig.objects.first()
    return {
        "brand": config.brand_name if config else "",
        "niche": brief.subject or brief.niche,
        "description": brief.description,
        "her_courses": list(Course.objects.exclude(pk=course_id).values_list("title", flat=True)[:10]),
    }


def _user_turn(tenant, answers: dict, course, instruction: str, drafted: list, brief: dict) -> str:
    turn = {
        "topic": answers.get("topic", ""),
        "level": answers.get("level", ""),
        "size": answers.get("size", ""),
        "exact": {
            key: brief.get(key) or ([] if key == "named" else None) for key in ("modules", "lessons", "total", "named")
        },
        "notes": brief.get("notes", ""),
        "followups": brief.get("followups", []),
        "instruction": instruction,
        **site(tenant, course.pk),
    }
    if instruction:
        kept = _kept(course, drafted)
        turn["current_outline"] = {
            "title": course.title,
            "description": course.description,
            "modules": [
                {
                    "title": m.title,
                    "lessons": [lesson.title for lesson in m.lessons.order_by("order", "id")],
                    **({"kept": True} if m.id in kept else {}),
                }
                for m in course.modules.order_by("order", "id")
            ],
        }
    return json.dumps(turn, ensure_ascii=False)


def _kept(course, drafted: list) -> set:
    """The modules a redraft keeps: those she added, and those she has filled
    a lesson of (its text or a video)."""
    from apps.courses.models import EMPTY_LESSON, Lesson

    filled = Lesson.objects.filter(module__course=course).exclude(EMPTY_LESSON)
    return {
        *course.modules.exclude(pk__in=drafted).values_list("id", flat=True),
        *filled.values_list("module_id", flat=True),
    }


def fallback(answers: dict, title: str, brief: dict | None = None) -> OutlineDraft:
    """Honest and generic when the model is down: her counts and titles, then
    the size's usual shape, with the module names above."""
    brief = brief or {}
    modules, lessons = SIZES.get(answers.get("size"), SIZES["short"])
    modules, lessons = brief.get("modules") or modules, brief.get("lessons") or lessons
    draft = OutlineDraft(
        title=title,
        description="",
        modules=[
            _Module(
                title=FALLBACK_MODULES[i] if i < len(FALLBACK_MODULES) else f"Module {i + 1}",
                lessons=[f"Lesson {n}" for n in range(1, lessons + 1)],
            )
            for i in range(min(modules, MAX_MODULES))
        ],
    )
    return conform(draft, brief, first=True)


def write(course, draft: OutlineDraft, working_title: str, *, drafted: dict, redraft: bool = False):
    """Save the draft over the course in one step; what she wrote herself wins.
    The title and description are written only while they are still ours (the
    working title, or what an earlier outline wrote); modules only when the
    course has none, except a redraft, which replaces the modules the earlier
    outlines made (``drafted``) and keeps hers, and any she has filled in.
    Returns (events to emit in order, the creation's next ``drafted``)."""
    from apps.courses.models import Lesson, Module

    record = f"course:{course.id}"
    events, changed = [], []
    titles, descriptions = list(drafted.get("titles") or []), list(drafted.get("descriptions") or [])
    modules = list(drafted.get("modules") or [])
    ours = {"title": {working_title, *titles}, "description": {"", *descriptions}}
    for name, value in (("title", draft.title.strip()[:TITLE_MAX]), ("description", draft.description.strip())):
        if not value or getattr(course, name) not in ours[name]:
            continue
        setattr(course, name, value)
        changed.append(name)
        (titles if name == "title" else descriptions).append(value)
        events.append({"type": "field", "data": {"record": record, "name": name, "value": value}})
    if changed:
        course.save(update_fields=[*changed, "updated_at"])
    if redraft:
        Module.objects.filter(course=course, pk__in=modules).exclude(pk__in=_kept(course, modules)).delete()
        modules = []
    if redraft or not course.modules.exists():
        top = course.modules.aggregate(top=Max("order"))["top"] or 0
        for index, module_draft in enumerate(draft.modules, start=1):
            title = module_draft.title.strip()[:TITLE_MAX] or f"Module {index}"
            lessons = [t.strip()[:TITLE_MAX] for t in module_draft.lessons if t.strip()][:MAX_LESSONS]
            module = Module.objects.create(course=course, title=title, order=top + index)
            Lesson.objects.bulk_create(
                [Lesson(module=module, title=lesson, order=n) for n, lesson in enumerate(lessons, start=1)]
            )
            modules.append(module.id)
            events.append(
                {
                    "type": "row",
                    "data": {"record": record, "kind": "module", "value": {"title": title, "lessons": lessons}},
                }
            )
    return events, {"titles": titles, "descriptions": descriptions, "modules": modules}
