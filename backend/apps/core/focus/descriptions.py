"""The descriptions job (spec §5.3): once she confirms the outline's lesson
titles, the Content Creating Specialist writes the short description that goes
with each lesson's video, one module per model call, into the lesson's text.
It never overwrites a lesson that already has text, and Stop keeps what is
already written. A copilot run on the agents worker, so it survives her leaving."""

import json

from django.conf import settings
from django.db import transaction
from django.utils.html import escape
from pydantic import BaseModel

from apps.core import ai as core_ai
from apps.core.copilot import runs
from apps.core.onboarding import ai_compose
from apps.core.sanitize import clean_rich_html
from apps.tenant_config.models import CopilotRun, FocusCreation

from . import jobs

STEP = {"specialist": "content", "label": "Writing lesson descriptions"}
# Up to 12 lessons of 2-4 sentences, plus the model's thinking.
MAX_TOKENS = 6000
SYSTEM = (
    "For each lesson, write the brief description that goes with its video, the way creators describe "
    "their videos: 2–4 sentences for students, what the lesson covers and what they can do after it. "
    "Use only the lesson title, the course and the coach's own words. Never invent a claim, a result "
    "or a number. Plain text, no markdown."
)


class LessonText(BaseModel):
    id: int
    text: str


class ModuleTexts(BaseModel):
    lessons: list[LessonText]


def start(creation) -> CopilotRun:
    """A queued descriptions run, a building one stopped first (it would write
    the old lessons). Call on the locked creation, inside the writing transaction."""
    pk = jobs.run_id(creation, "descriptions")
    if pk is not None:
        runs.stop(pk)  # a finished one is left as it is
    return jobs.queue(creation, "descriptions", specialist="content")


def carry_out(tenant, run_id) -> None:
    from apps.courses.models import Course, Lesson

    request = CopilotRun.objects.get(pk=run_id).request or {}
    creation = FocusCreation.objects.get(pk=request.get("focus"))
    if not ai_compose.compose_available():
        raise core_ai.AiError("ai_unavailable")
    course_id = creation.record_id
    todo = list(
        Lesson.objects.filter(module__course_id=course_id, content_html="")
        .order_by("module__order", "module_id", "order", "id")
        .values("id", "title", "module_id")
    )
    runs.emit(run_id, "step", {**STEP, "state": "start", "total": len(todo)})
    course = Course.objects.filter(pk=course_id).first()
    if course is None:  # deleted meanwhile: nothing to write on
        runs.finish(run_id, True, {"text": "Wrote 0 lesson descriptions."})
        return
    brief = creation.brief or {}
    answers = creation.answers or {}
    written = 0
    for module_id in dict.fromkeys(row["module_id"] for row in todo):
        lessons = [{"id": r["id"], "title": r["title"]} for r in todo if r["module_id"] == module_id]
        turn = {
            "course": course.title,
            "description": course.description,
            "level": answers.get("level", ""),
            "topic": answers.get("topic", ""),
            "notes": brief.get("notes", ""),
            "lessons": lessons,
        }
        try:
            parsed, cost, _model = core_ai.structured(
                system=SYSTEM,
                user=json.dumps(turn, ensure_ascii=False),
                output_model=ModuleTexts,
                model=settings.COPILOT_MODEL,
                max_tokens=MAX_TOKENS,
                label="contentor:focus-ahead",
                effort="low",
            )
        except core_ai.AiError as exc:
            ai_compose.record_spend(tenant.schema_name, getattr(exc, "cost_usd", None) or 0)
            raise
        ai_compose.record_spend(tenant.schema_name, cost)
        texts = {item.id: item.text.strip() for item in parsed.lessons}
        with transaction.atomic():
            if not jobs.active(run_id):  # Stop won while the model wrote: keep what is written
                return
            for lesson in lessons:
                text = texts.get(lesson["id"])
                if not text:
                    continue
                html = clean_rich_html(f"<p>{escape(text)}</p>")
                # Only a lesson still empty: text she typed meanwhile (or a deleted lesson) matches no row.
                if Lesson.objects.filter(pk=lesson["id"], content_html="").update(content_html=html, drafted_html=html):
                    written += 1
                    runs.emit(
                        run_id,
                        "field",
                        {"record": f"lesson:{lesson['id']}", "name": "content_html", "value": text},
                    )
    runs.emit(run_id, "step", {**STEP, "state": "done"})
    runs.finish(run_id, True, {"text": f"Wrote {written} lesson descriptions."})
