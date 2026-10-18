"""Focus mode's question flow: a creation in progress (FocusCreation), the
course recipe's questions in order, and the draft course behind them. The
outline job is stubbed; it is tested in test_focus_outline.py."""

from decimal import Decimal
from unittest import mock

import pytest

from apps.accounts.models import User
from apps.core import ai as core_ai
from apps.core import tasks
from apps.core.copilot import runs
from apps.core.focus import analysis, flow, jobs
from apps.courses.models import Course, Lesson, Module
from apps.tenant_config.models import CopilotRun, FocusCreation

SCHEMA = "shared_test"

pytestmark = pytest.mark.django_db(transaction=True)


def test_a_creation_starts_active_and_empty(tenant_ctx):
    creation = FocusCreation.objects.create(kind="course")
    assert creation.status == "active"
    assert creation.answers == {}
    assert creation.active_ms == 0
    assert creation.mode == "focus"
    assert creation.outline_run is None


# ── The course recipe and the flow ──────────────────────────────────────────


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="focus-owner@x.com",
        name="Owner",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture(autouse=True)
def no_celery():
    """Looks good queues the descriptions job: nothing reaches a worker."""
    with mock.patch.object(tasks.run_focus_job, "delay"):
        yield


@pytest.fixture()
def outline_start():
    """The outline job, stubbed: a queued run per call, nothing enqueued."""

    def fake(creation, instruction=""):
        run = CopilotRun.objects.create(
            actor=creation.actor, chat=creation.chat, specialist="content", request={"instruction": instruction}
        )
        creation.outline_run = run
        creation.save(update_fields=["outline_run"])
        return run

    with mock.patch("apps.core.focus.outline.start", side_effect=fake) as stub:
        yield stub


def _started(owner, text="A course on desk yoga for office workers"):
    return flow.start(owner, "course", text=text)


def test_start_makes_an_unpublished_draft_titled_from_her_topic(owner, outline_start):
    creation = _started(owner)
    course = Course.objects.get(pk=creation.record_id)
    assert course.is_published is False
    assert course.title == "Desk yoga for office workers"
    assert creation.chat.entries[-1] == {"role": "coach", "text": "A course on desk yoga for office workers"}


def test_questions_come_in_recipe_order(owner, outline_start):
    creation = _started(owner)
    assert flow.current_field(creation) == "level"
    creation = flow.answer(creation, "level", value="beginners")
    assert flow.current_field(creation) == "size"


def test_the_outline_starts_once_when_topic_level_and_size_are_settled(owner, outline_start):
    creation = flow.answer(_started(owner), "level", value="beginners")
    assert outline_start.call_count == 0
    creation = flow.answer(creation, "size", value="short")
    assert outline_start.call_count == 1
    creation = flow.answer(creation, "size", value="full")  # no longer the current question
    assert outline_start.call_count == 1
    assert creation.answers["size"] == "short"


def test_just_draft_it_delegates_the_rest(owner, outline_start):
    creation = flow.answer(_started(owner), "level", rest=True)
    assert creation.answers["level"] == creation.answers["size"] == "delegate"
    assert outline_start.call_count == 1
    assert flow.current_field(creation) == "outline_review"


def test_a_typed_review_answer_redrafts_with_her_words(owner, outline_start):
    creation = flow.answer(_started(owner), "level", rest=True)
    creation = flow.answer(creation, "outline_review", text="make module 2 about breathing")
    assert outline_start.call_args.kwargs["instruction"] == "make module 2 about breathing"
    assert flow.current_field(creation) == "outline_review"
    creation = flow.answer(creation, "outline_review", value="ok")
    assert flow.current_field(creation) == "finish"


def _at_finish(owner, text="A course on desk yoga"):
    creation = flow.answer(_started(owner, text), "level", rest=True)
    return flow.answer(creation, "outline_review", value="ok")


def _filled(creation, content_html="<p>Breathe in.</p>"):
    """One module with one lesson, its text as given."""
    module = Module.objects.create(course_id=creation.record_id, title="Basics", order=1)
    return Lesson.objects.create(module=module, title="Lesson 1", order=1, content_html=content_html)


def test_finish_publishes_only_when_asked(owner, outline_start):
    kept = flow.finish(_at_finish(owner), publish=False)
    assert Course.objects.get(pk=kept.record_id).is_published is False
    assert kept.status == "done"
    assert kept.finished_at is not None
    ready = _at_finish(owner, "A course on breathing")
    _filled(ready)
    published = flow.finish(ready, publish=True)
    assert Course.objects.get(pk=published.record_id).is_published is True


def test_a_course_with_an_empty_lesson_is_never_published(owner, outline_start):
    creation = _at_finish(owner)
    _filled(creation, content_html="")
    question = flow.state(creation)["question"]
    assert question["question"] == flow.NOT_READY
    assert "1 of its 1 lessons have none yet" in question["why"]
    assert [o["value"] for o in question["options"]] == ["draft"]
    creation = flow.finish(creation, publish=True)  # a stale screen still asking
    assert Course.objects.get(pk=creation.record_id).is_published is False
    assert creation.answers["finish"] == "draft"


def test_publish_is_offered_once_every_lesson_has_content(owner, outline_start):
    creation = _at_finish(owner)
    _filled(creation)
    assert [o["value"] for o in flow.state(creation)["question"]["options"]] == ["publish", "draft"]


def test_abandon_leaves_the_draft(owner, outline_start):
    creation = flow.leave(_started(owner), abandon=True)
    assert creation.status == "left"
    assert Course.objects.filter(pk=creation.record_id).exists()
    assert flow.current_field(creation) is None


def test_save_and_leave_keeps_it_open_where_she_stopped(owner, outline_start):
    creation = flow.leave(_started(owner))
    assert creation.status == "active"
    assert flow.state(creation)["question"]["field"] == "level"


def test_a_deleted_course_closes_the_creation(owner, outline_start):
    creation = _started(owner)
    Course.objects.filter(pk=creation.record_id).delete()
    body = flow.state(creation)
    assert body["record"] is None
    creation.refresh_from_db()
    assert creation.status == "left"


def test_active_time_adds_reported_spans(owner, outline_start):
    creation = _started(owner)
    creation = flow.answer(creation, "level", value="beginners", active_ms=5000)
    creation = flow.answer(creation, "size", value="short", active_ms=3000)
    assert creation.active_ms == 8000
    creation = flow.leave(creation, active_ms=10**9)
    assert creation.active_ms == 8000 + 600000


def test_state_shapes_the_current_question(owner, outline_start):
    body = flow.state(flow.answer(_started(owner), "level", value="beginners"))
    question = body["question"]
    assert question["field"] == "size"
    assert question["question"] == "How big should it be?"
    assert [o["value"] for o in question["options"]] == ["quick", "short", "full"]
    assert question["options"][0] == {"value": "quick", "label": "Quick win", "hint": "1 module · 3–4 lessons"}
    assert question["can_delegate"] is True
    assert question["specialist"] == "content"
    assert body["answered"][-1] == {"field": "level", "label": "Complete beginners"}
    assert body["record"]["title"] == "Desk yoga for office workers"
    assert body["outline"] == {"status": "idle", "run": None}
    assert [s["done"] for s in body["steps"]] == [True, True, False, False, False]


def test_the_outline_status_follows_its_run(owner, outline_start):
    creation = flow.answer(_started(owner), "level", rest=True)
    assert flow.state(creation)["outline"]["status"] == "building"
    CopilotRun.objects.filter(pk=creation.outline_run_id).update(status="done")
    creation.refresh_from_db()
    assert flow.state(creation)["outline"] == {"status": "ready", "run": creation.outline_run_id}
    CopilotRun.objects.filter(pk=creation.outline_run_id).update(status="failed")
    assert flow.state(creation)["outline"]["status"] == "failed"


def test_working_title():
    assert flow.working_title("A course on desk yoga.") == "Desk yoga"
    assert flow.working_title("  ") == "New course"
    assert len(flow.working_title("x" * 300)) == 80


def test_try_again_after_a_failed_redraft_keeps_her_change(owner, outline_start):
    creation = flow.answer(_started(owner), "level", rest=True)
    CopilotRun.objects.filter(pk=creation.outline_run_id).update(status="done")
    creation = flow.answer(creation, "outline_review", text="make module 2 about breathing")
    CopilotRun.objects.filter(pk=creation.outline_run_id).update(status="failed")
    flow.answer(creation, "outline_review", value="retry")
    assert outline_start.call_args.kwargs["instruction"] == "make module 2 about breathing"


def test_her_first_answer_does_not_wait_for_a_cover(owner, outline_start):
    with mock.patch("apps.core.copilot.content._give_cover") as cover:
        _started(owner)
    cover.assert_not_called()


def test_just_draft_it_keeps_what_she_typed_first(owner, outline_start):
    creation = flow.answer(_started(owner), "level", text="nurses on night shifts", rest=True)
    assert creation.answers["level"] == "nurses on night shifts"
    assert creation.answers["size"] == "delegate"
    assert outline_start.call_count == 1


def test_just_draft_it_on_the_first_answer_is_one_step(owner, outline_start):
    creation = flow.start(owner, "course", rest=True)
    assert creation.answers == {"topic": "delegate", "level": "delegate", "size": "delegate"}
    assert outline_start.call_count == 1
    assert Course.objects.count() == 1
    typed = flow.start(owner, "course", text="A course on breathing", rest=True)
    assert typed.answers["topic"] == "A course on breathing"
    assert typed.answers["size"] == "delegate"


def test_finishing_a_course_deleted_meanwhile_leaves_it(owner, outline_start):
    creation = _at_finish(owner)
    Course.objects.filter(pk=creation.record_id).delete()
    creation = flow.finish(creation, publish=True)
    assert creation.status == "left"
    assert creation.finished_at is None


def test_abandon_drops_an_outline_still_being_written(owner, outline_start):
    creation = flow.answer(_started(owner), "level", rest=True)
    flow.leave(creation, abandon=True)
    assert CopilotRun.objects.get(pk=creation.outline_run_id).status == "stopped"


# ── The analysis of a typed answer (§5.1) ───────────────────────────────────


RICH = "A course on desk yoga for complete beginners, 4 modules of 3 lessons, $49"


@pytest.fixture()
def analysed():
    """The model on, its answer patched: ``analysed(found)`` or
    ``analysed(side_effect=...)``. Nothing is enqueued; ``_run_pending``
    runs the job in the test."""
    with (
        mock.patch("apps.core.focus.analysis.core_ai.structured") as model,
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.onboarding.ai_compose.record_spend"),
        mock.patch.object(tasks.run_focus_job, "delay"),
    ):

        def configure(found=None, side_effect=None):
            model.return_value = (found or analysis.Analysis(), Decimal("0"), "x")
            model.side_effect = side_effect
            return model

        configure()
        yield configure


def _run_pending(creation):
    jobs.execute(SCHEMA, creation.runs["analysis"])
    creation.refresh_from_db()
    return creation


def _tapped(owner):
    return flow.start(owner, "course", value="Desk yoga")


def test_a_rich_first_answer_skips_what_it_settled(owner, outline_start, analysed):
    analysed(analysis.Analysis(topic="desk yoga", level="beginners", modules=4, lessons=3, price="49"))
    creation = _run_pending(flow.start(owner, "course", text=RICH))
    assert creation.answers["level"] == "beginners"
    assert creation.answers["size"] == "4 modules · 3 lessons each"
    course = Course.objects.get(pk=creation.record_id)
    assert course.price == Decimal("49.00") and course.pricing_type == "paid"
    assert course.title == "Desk yoga" and "Desk yoga" in creation.drafted["titles"]
    assert outline_start.called  # nothing left to ask before the outline
    assert not creation.pending
    labels = [line["label"] for line in flow.state(creation)["answered"]]
    assert "Complete beginners" in labels and "$49" in labels


def test_she_waits_on_the_reading_and_cannot_tap_meanwhile(owner, outline_start, analysed):
    creation = flow.start(owner, "course", text="desk yoga")
    body = flow.state(creation)
    assert body["question"] is None
    assert body["reading"] == {"status": "building", "run": creation.runs["analysis"]}
    assert flow.answer(creation, "level", value="beginners").answers == {}
    assert flow.state(_run_pending(creation))["reading"] is None


def test_a_tap_never_waits_on_the_analysis(owner, outline_start, analysed):
    creation = flow.answer(_tapped(owner), "level", value="some")  # the model is on: a tap still skips it
    assert not creation.pending and "analysis" not in creation.runs
    assert creation.answers == {"topic": "Desk yoga", "level": "some"}


def test_an_unclear_count_is_asked_once(owner, outline_start, analysed):
    analysed(
        analysis.Analysis(
            topic="desk yoga",
            unclear=[
                analysis.Unclear(
                    field="modules",
                    question="How many modules?",
                    options=[analysis.ClarifyOption(label="3 modules", value="3")],
                )
            ],
        )
    )
    creation = _run_pending(flow.start(owner, "course", text="desk yoga, a few modules"))
    assert flow.current_field(creation) == "clarify"
    question = flow.state(creation)["question"]
    assert question["question"] == "How many modules?"
    assert question["options"] == [{"value": "3", "label": "3 modules", "hint": ""}]
    creation = flow.answer(creation, "clarify", value="3")
    assert creation.brief["modules"] == 3 and creation.brief["asked"] == ["modules"]
    assert flow.current_field(creation) == "level"


def test_a_detail_still_unclear_after_its_question_gets_its_usual_question(owner, outline_start, analysed):
    unclear = [analysis.Unclear(field="modules", question="How many modules?", options=[])]
    analysed(analysis.Analysis(topic="desk yoga", unclear=unclear))
    creation = _run_pending(flow.start(owner, "course", text="desk yoga, a few modules"))
    analysed(analysis.Analysis(unclear=unclear))  # her reply is still vague
    creation = _run_pending(flow.answer(creation, "clarify", text="not sure, some"))
    assert creation.brief["clarify"] == [] and creation.brief["asked"] == ["modules"]
    assert flow.current_field(creation) == "level"
    assert "size" not in creation.answers


def test_a_failed_analysis_falls_back_to_the_usual_questions(owner, outline_start, analysed):
    analysed(side_effect=core_ai.AiError("down"))
    creation = _run_pending(flow.start(owner, "course", text="desk yoga"))
    assert creation.answers["topic"] == "desk yoga" and not creation.pending
    assert flow.current_field(creation) == "level"


def test_a_stopped_analysis_settles_on_the_next_read(owner, outline_start, analysed):
    creation = flow.start(owner, "course", text="desk yoga")
    runs.stop(creation.runs["analysis"])
    assert flow.state(creation)["question"]["field"] == "level"
    creation.refresh_from_db()
    assert creation.answers["topic"] == "desk yoga" and not creation.pending


def test_her_words_answer_the_question_on_screen_and_route_the_rest(owner, outline_start, analysed):
    # At "level" she types "beginners, and make it 5 modules"
    analysed(analysis.Analysis(answer="beginners", level="beginners", modules=5))
    creation = flow.answer(_tapped(owner), "level", text="beginners, and make it 5 modules")
    creation = _run_pending(creation)
    assert creation.answers["level"] == "beginners" and creation.brief["modules"] == 5
    assert creation.answers["size"] == "5 modules"
    assert outline_start.call_count == 1


def test_just_draft_it_with_words_delegates_only_what_they_left_open(owner, outline_start, analysed):
    analysed(analysis.Analysis(topic="desk yoga", level="nurses on night shifts"))
    creation = _run_pending(flow.start(owner, "course", text="desk yoga for nurses on night shifts", rest=True))
    assert creation.answers["level"] == "nurses on night shifts"
    assert creation.answers["size"] == "delegate"
    assert creation.brief["rest"] is True
    assert outline_start.call_count == 1


def test_at_the_review_a_price_alone_sets_the_price_and_a_change_redrafts(owner, outline_start, analysed):
    creation = flow.answer(_tapped(owner), "level", rest=True)
    assert outline_start.call_count == 1
    analysed(analysis.Analysis(price="free"))
    creation = _run_pending(flow.answer(creation, "outline_review", text="it's free"))
    assert creation.answers["price"] == "free" and outline_start.call_count == 1
    analysed(analysis.Analysis(outline_change="module 2 about breathing"))
    creation = _run_pending(flow.answer(creation, "outline_review", text="make module 2 about breathing"))
    assert outline_start.call_count == 2
    assert outline_start.call_args.kwargs["instruction"] == "make module 2 about breathing"
    assert flow.current_field(creation) == "outline_review"


COUNTED = {"modules": 4, "lessons": 3, "capped": True, "named": [{"title": "Mine", "lessons": []}], "analysed": True}


def _reviewing(owner):
    creation = flow.answer(_tapped(owner), "level", rest=True)
    creation.brief = {**creation.brief, **COUNTED}
    creation.save()
    return creation


def test_a_redraft_without_a_count_drops_the_first_answers_counts(owner, outline_start, analysed):
    creation = _reviewing(owner)
    analysed(analysis.Analysis(outline_change="add a module on stretching"))
    creation = _run_pending(flow.answer(creation, "outline_review", text="add a module on stretching"))
    assert outline_start.call_count == 2
    assert not {"modules", "lessons", "total", "capped"} & creation.brief.keys()
    assert creation.brief["named"] == COUNTED["named"]


def test_a_redraft_that_names_a_count_keeps_it(owner, outline_start, analysed):
    creation = _reviewing(owner)
    analysed(analysis.Analysis(outline_change="make it 6 modules", modules=6))
    creation = _run_pending(flow.answer(creation, "outline_review", text="make it 6 modules"))
    assert creation.brief["modules"] == 6 and creation.brief["lessons"] == 3
    assert outline_start.call_count == 2


def test_a_failed_reading_at_the_review_also_drops_the_counts(owner, outline_start, analysed):
    creation = _reviewing(owner)
    analysed(side_effect=core_ai.AiError("down"))
    creation = _run_pending(flow.answer(creation, "outline_review", text="add a module"))
    assert outline_start.call_count == 2
    assert "modules" not in creation.brief


def test_a_focus_draft_with_a_price_never_blocks_go_live(owner, outline_start, analysed):
    from apps.tenant_config.setup_items import _has_paid_content

    analysed(analysis.Analysis(topic="desk yoga", price="49"))
    creation = _run_pending(flow.start(owner, "course", text=RICH))
    assert Course.objects.get(pk=creation.record_id).price == Decimal("49.00")
    assert _has_paid_content({}) is False


def test_fill_it_in_myself_while_reading_drops_the_reading(owner, outline_start, analysed):
    analysed(analysis.Analysis(topic="desk yoga", level="beginners", modules=2))
    creation = flow.leave(flow.start(owner, "course", text="desk yoga"), abandon=True)
    assert CopilotRun.objects.get(pk=creation.runs["analysis"]).status == "stopped"
    assert not creation.pending
    jobs.execute(SCHEMA, creation.runs["analysis"])  # a late delivery does nothing
    creation.refresh_from_db()
    assert creation.answers == {} and not outline_start.called
