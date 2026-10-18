"""Focus mode's question flow: a creation in progress (FocusCreation), the
course recipe's questions in order, and the draft course behind them. The
outline job is stubbed; it is tested in test_focus_outline.py."""

from unittest import mock

import pytest

from apps.accounts.models import User
from apps.core.focus import flow
from apps.courses.models import Course, Lesson, Module
from apps.tenant_config.models import CopilotRun, FocusCreation

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
