"""Focus mode's question flow: a creation in progress (FocusCreation), the
course recipe's questions in order, and the draft course behind them. The
outline job is stubbed; it is tested in test_focus_outline.py."""

import json
from decimal import Decimal
from unittest import mock

import pytest

from apps.accounts.models import User
from apps.billing import ways
from apps.billing.models import SubscriptionPlan, SubscriptionPlanAccess
from apps.core import ai as core_ai
from apps.core import tasks
from apps.core.copilot import runs
from apps.core.focus import analysis, flow, jobs, outline, pricing
from apps.core.focus.kinds import course as course_kind
from apps.courses.models import Course, Lesson, Module
from apps.media.models import Design
from apps.tenant_config.models import CopilotChat, CopilotRun, FocusCreation
from apps.tenant_config.setup_flow import _Module

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
    assert flow.current_field(creation) == "cover"


def _at_cover(owner, text="A course on desk yoga"):
    creation = flow.answer(_started(owner, text), "level", rest=True)
    return flow.answer(creation, "outline_review", value="ok")


def _at_finish(owner, text="A course on desk yoga"):
    """Past the cover and price steps: she chose "later" (the cover
    endpoint's answer), then Free."""
    creation = _at_cover(owner, text)
    creation.answers = {**creation.answers, "cover": "later", "access": "free"}
    creation.save()
    return creation


def test_the_cover_and_the_price_come_after_the_outline_and_before_finish():
    recipe = course_kind.RECIPE
    assert [q.id for q in recipe.questions] == [
        "topic",
        "level",
        "size",
        "outline_review",
        "cover",
        "access",
        "finish",
        "announce",
    ]
    assert recipe.specialists["cover"] == "designer"
    assert recipe.specialists["access"] == "finance"


def test_the_cover_is_asked_after_looks_good_and_never_delegated(owner, outline_start):
    creation = flow.answer(_started(owner), "level", rest=True)
    assert "cover" not in creation.answers  # "Just draft it" leaves it to her
    assert outline_start.call_count == 1  # and the outline did not wait for it
    creation = flow.answer(creation, "outline_review", value="ok")
    question = flow.state(creation)["question"]
    assert (question["field"], question["kind"], question["specialist"]) == ("cover", "cover", "designer")


def test_a_tap_never_answers_the_cover(owner, outline_start):
    creation = _at_cover(owner)
    for tap in ({"value": "kept"}, {"value": "later"}, {"delegate": True}):
        creation = flow.answer(creation, "cover", **tap)
    assert "cover" not in creation.answers
    assert flow.current_field(creation) == "cover"


def test_words_at_the_cover_never_become_its_answer(owner, outline_start):
    creation = flow.answer(_at_cover(owner), "cover", text="something calmer")
    assert "cover" not in creation.answers
    assert flow.current_field(creation) == "cover"


def test_delegate_or_a_tap_with_words_at_the_cover_never_becomes_its_answer(owner, outline_start):
    creation = _at_cover(owner)
    for body in (
        {"delegate": True, "text": "you pick"},
        {"value": "kept", "text": "kept"},
        {"value": "later", "delegate": True},
        {"value": "kept", "delegate": True, "text": "x"},
        {"value": "later", "rest": True, "delegate": True, "text": "x"},
        {"rest": True, "delegate": True, "text": "anything"},
    ):
        creation = flow.answer(creation, "cover", **body)
        assert "cover" not in creation.answers
        assert flow.current_field(creation) == "cover"


def test_a_cover_kept_in_the_studio_answers_the_question(owner, outline_start):
    creation = _at_cover(owner)
    assert flow.state(creation)["question"]["field"] == "cover"
    Design.objects.create(
        kind="cover", target_kind="course", target_key=str(creation.record_id), state="kept", recipe={}
    )
    assert flow.state(creation)["question"]["field"] == "finish"
    assert FocusCreation.objects.get(pk=creation.pk).answers["cover"] == "kept"


def test_a_design_for_another_course_or_still_a_draft_does_not(owner, outline_start):
    creation = _at_cover(owner)
    Design.objects.create(kind="cover", target_kind="course", target_key="999999", state="kept", recipe={})
    Design.objects.create(
        kind="cover", target_kind="course", target_key=str(creation.record_id), state="draft", recipe={}
    )
    assert flow.state(creation)["question"]["field"] == "cover"


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
    assert question["question"] == course_kind.NOT_READY_LINE
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
    assert body["outline"] == {"status": "idle", "run": None, "drafted": False}
    assert [s["done"] for s in body["steps"]] == [True, True, False, False, False, False, False, False]


def test_the_outline_status_follows_its_run(owner, outline_start):
    creation = flow.answer(_started(owner), "level", rest=True)
    assert flow.state(creation)["outline"]["status"] == "building"
    CopilotRun.objects.filter(pk=creation.outline_run_id).update(status="done")
    creation.refresh_from_db()
    assert flow.state(creation)["outline"] == {"status": "ready", "run": creation.outline_run_id, "drafted": False}
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


def test_looks_good_after_a_stopped_redraft_goes_on_with_the_outline_on_the_page(owner, outline_start):
    creation = flow.answer(_started(owner), "level", rest=True)
    CopilotRun.objects.filter(pk=creation.outline_run_id).update(status="done")
    creation.drafted = {"modules": [1]}
    creation.save()
    creation = flow.answer(creation, "outline_review", text="make module 2 about breathing")
    runs.stop(creation.outline_run_id)
    creation.refresh_from_db()
    assert flow.state(creation)["outline"] == {"status": "failed", "run": creation.outline_run_id, "drafted": True}
    creation = flow.answer(creation, "outline_review", value="ok")
    assert creation.answers["outline_review"] == "ok"
    assert jobs.status(creation, "descriptions") == "building"


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
    assert creation.answers == {"topic": "delegate", "level": "delegate", "size": "delegate", "access": "delegate"}
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
    runs the job in the test. No follow-ups (test_focus_followup.py)."""
    with (
        mock.patch("apps.core.focus.analysis.core_ai.structured") as model,
        mock.patch("apps.core.focus.flow.followup_allowed", return_value=False),
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.onboarding.ai_compose.record_spend"),
        mock.patch.object(tasks.run_focus_job, "delay"),
    ):

        def configure(found=None, side_effect=None):
            model.return_value = (found or course_kind.CourseFound(), Decimal("0"), "x")
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
    analysed(course_kind.CourseFound(topic="desk yoga", level="beginners", modules=4, lessons=3, price="49"))
    creation = _run_pending(flow.start(owner, "course", text=RICH))
    assert creation.answers["level"] == "beginners"
    assert creation.answers["size"] == "4 modules · 3 lessons each"
    course = Course.objects.get(pk=creation.record_id)
    assert course.price == Decimal("49.00") and course.pricing_type == "paid"
    assert course.title == "Desk yoga" and "Desk yoga" in creation.drafted["titles"]
    assert outline_start.called  # nothing left to ask before the outline
    assert not creation.pending
    labels = [line["label"] for line in flow.state(creation)["answered"]]
    assert "Complete beginners" in labels and "$49 once, theirs to keep." in labels


def test_a_21_day_course_drafts_21_lessons_in_three_weeks(owner, analysed):
    """Her typed first answer, a model that read no count of it, the size question
    skipped, the outline job and its post-processing: 21 lessons, a week each."""
    analysed(course_kind.CourseFound(topic="21-day yoga course"))
    creation = _run_pending(flow.start(owner, "course", text="21-day yoga course, one lesson per day"))
    assert creation.answers["size"] == "21 lessons"
    creation = flow.answer(creation, "level", value="beginners")
    assert creation.outline_run_id  # her words left no size to ask

    def write(**kwargs):
        plan = json.loads(kwargs["user"])["exact"]["lessons_per_module"]
        modules = [
            _Module(title=f"Week {w}", lessons=[f"Day {w}.{n}" for n in range(1, size + 1)])
            for w, size in enumerate(plan, start=1)
        ]
        return outline.OutlineDraft(title="21 days of yoga", description="A week at a time.", modules=modules), 0, "x"

    with mock.patch("apps.core.focus.outline.core_ai.structured", side_effect=write):
        jobs.execute(SCHEMA, creation.outline_run_id)
    course = Course.objects.get(pk=creation.record_id)
    assert [m.lessons.count() for m in course.modules.order_by("order")] == [7, 7, 7]
    assert not (creation.brief or {}).get("capped")


def test_she_waits_on_the_reading_and_cannot_tap_meanwhile(owner, outline_start, analysed):
    creation = flow.start(owner, "course", text="desk yoga")
    body = flow.state(creation)
    assert body["question"] is None
    assert body["reading"] == {"status": "building", "run": creation.runs["analysis"], "specialist": "content"}
    assert flow.answer(creation, "level", value="beginners").answers == {}
    assert flow.state(_run_pending(creation))["reading"] is None


def test_a_tap_never_waits_on_the_analysis(owner, outline_start, analysed):
    creation = flow.answer(_tapped(owner), "level", value="some")  # the model is on: a tap still skips it
    assert not creation.pending and "analysis" not in creation.runs
    assert creation.answers == {"topic": "Desk yoga", "level": "some"}


def test_an_unclear_count_is_asked_once(owner, outline_start, analysed):
    analysed(
        course_kind.CourseFound(
            topic="desk yoga",
            unclear=[
                course_kind.CourseUnclear(
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
    unclear = [course_kind.CourseUnclear(field="modules", question="How many modules?", options=[])]
    analysed(course_kind.CourseFound(topic="desk yoga", unclear=unclear))
    creation = _run_pending(flow.start(owner, "course", text="desk yoga, a few modules"))
    analysed(course_kind.CourseFound(unclear=unclear))  # her reply is still vague
    creation = _run_pending(flow.answer(creation, "clarify", text="not sure, some"))
    assert creation.brief["clarify"] == [] and creation.brief["asked"] == ["modules"]
    assert flow.current_field(creation) == "level"
    assert "size" not in creation.answers


def test_her_words_win_on_a_typed_answer_to_a_level_question(owner, outline_start, analysed):
    unclear = [course_kind.CourseUnclear(field="level", question="Who is it for?", options=[])]
    analysed(course_kind.CourseFound(topic="desk yoga", unclear=unclear))
    creation = _run_pending(flow.start(owner, "course", text="desk yoga for some people"))
    words = "people who've done a little yoga"
    analysed(course_kind.CourseFound(answer=words, level="some"))  # the reading also names an option
    creation = _run_pending(flow.answer(creation, "clarify", text=words))
    assert creation.answers["level"] == words  # her clarify answer lands last, as before


def test_a_total_typed_for_a_lessons_question_is_a_count_of_lessons_each(owner, outline_start, analysed):
    unclear = [course_kind.CourseUnclear(field="lessons", question="How many lessons in each?", options=[])]
    analysed(course_kind.CourseFound(topic="desk yoga", modules=4, unclear=unclear))
    creation = _run_pending(flow.start(owner, "course", text="desk yoga, 4 modules, a few lessons each"))
    analysed(course_kind.CourseFound(answer="20", total=20))  # the reading calls her 20 a total
    creation = _run_pending(flow.answer(creation, "clarify", text="20"))
    assert (creation.brief["modules"], creation.brief["lessons"]) == (4, 12)  # her answer, clamped
    assert creation.brief["capped"] is True and "total" not in creation.brief


def test_a_failed_analysis_falls_back_to_the_usual_questions(owner, outline_start, analysed):
    analysed(side_effect=core_ai.AiError("down"))
    creation = _run_pending(flow.start(owner, "course", text="desk yoga"))
    assert creation.answers["topic"] == "desk yoga" and not creation.pending
    assert flow.current_field(creation) == "level"


def _at_cover_unanalysed(owner):
    """The cover step reached without a model, so no reading is pending on the way."""
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=False):
        return _at_cover(owner)


def test_at_the_cover_step_her_words_search_the_photo_row(owner, outline_start, analysed):
    model = analysed(course_kind.CourseFound(photo="hands on a keyboard, no faces"))
    creation = _at_cover_unanalysed(owner)
    creation.covers = {"rounds": [], "query": "old"}
    creation.runs = {**creation.runs, "covers": CopilotRun.objects.create(status="done", request={}).pk}
    creation.save()
    creation = _run_pending(flow.answer(creation, "cover", text="hands on a keyboard, no faces"))
    assert creation.covers["query"] == "hands on a keyboard, no faces"
    assert creation.covers["rounds"] == []  # its other keys stay
    assert "cover" not in creation.answers and flow.current_field(creation) == "cover"
    assert json.loads(model.call_args.kwargs["user"])["cover_step"] is True
    assert flow.state(creation)["cover"]["query"] == "hands on a keyboard, no faces"


def test_a_failed_analysis_at_the_cover_uses_her_words_as_the_photo_query(owner, outline_start, analysed):
    analysed(side_effect=core_ai.AiError("down"))
    creation = _run_pending(flow.answer(_at_cover_unanalysed(owner), "cover", text="hands on a keyboard"))
    assert creation.covers["query"] == "hands on a keyboard" and not creation.pending
    assert "cover" not in creation.answers and flow.current_field(creation) == "cover"


def test_words_at_the_cover_without_a_photo_leave_the_query_alone(owner, outline_start, analysed):
    analysed(course_kind.CourseFound(answer="something calmer"))
    creation = _at_cover_unanalysed(owner)
    creation.covers = {"query": "old"}
    creation.save()
    creation = _run_pending(flow.answer(creation, "cover", text="something calmer"))
    assert creation.covers["query"] == "old"


def test_a_price_said_at_the_cover_still_applies_with_the_photo(owner, outline_start, analysed):
    analysed(course_kind.CourseFound(photo="a quiet desk", price="49"))
    creation = _run_pending(flow.answer(_at_cover_unanalysed(owner), "cover", text="a quiet desk, $49"))
    assert creation.covers["query"] == "a quiet desk"
    assert Course.objects.get(pk=creation.record_id).price == Decimal("49.00")


def test_a_photo_read_at_another_step_is_ignored(owner, outline_start, analysed):
    analysed(course_kind.CourseFound(topic="desk yoga", level="beginners", photo="a quiet desk"))
    creation = _run_pending(flow.start(owner, "course", text="desk yoga for beginners"))
    assert not (creation.covers or {}).get("query")
    creation = flow.answer(creation, "level", text="beginners")
    creation = _run_pending(creation) if creation.pending else creation
    assert not (creation.covers or {}).get("query")


def test_a_stopped_analysis_settles_on_the_next_read(owner, outline_start, analysed):
    creation = flow.start(owner, "course", text="desk yoga")
    runs.stop(creation.runs["analysis"])
    assert flow.state(creation)["question"]["field"] == "level"
    creation.refresh_from_db()
    assert creation.answers["topic"] == "desk yoga" and not creation.pending


def test_her_words_answer_the_question_on_screen_and_route_the_rest(owner, outline_start, analysed):
    # At "level" she types "beginners, and make it 5 modules"
    analysed(course_kind.CourseFound(answer="beginners", level="beginners", modules=5))
    creation = flow.answer(_tapped(owner), "level", text="beginners, and make it 5 modules")
    creation = _run_pending(creation)
    assert creation.answers["level"] == "beginners" and creation.brief["modules"] == 5
    assert creation.answers["size"] == "5 modules"
    assert outline_start.call_count == 1


def test_just_draft_it_with_words_delegates_only_what_they_left_open(owner, outline_start, analysed):
    analysed(course_kind.CourseFound(topic="desk yoga", level="nurses on night shifts"))
    creation = _run_pending(flow.start(owner, "course", text="desk yoga for nurses on night shifts", rest=True))
    assert creation.answers["level"] == "nurses on night shifts"
    assert creation.answers["size"] == "delegate"
    assert creation.brief["rest"] is True
    assert outline_start.call_count == 1


def test_at_the_review_a_price_alone_sets_the_price_and_a_change_redrafts(owner, outline_start, analysed):
    creation = flow.answer(_tapped(owner), "level", rest=True)
    assert outline_start.call_count == 1
    analysed(course_kind.CourseFound(price="free"))
    creation = _run_pending(flow.answer(creation, "outline_review", text="it's free"))
    assert creation.answers["price"] == "free" and outline_start.call_count == 1
    analysed(course_kind.CourseFound(change="module 2 about breathing"))
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
    analysed(course_kind.CourseFound(change="add a module on stretching"))
    creation = _run_pending(flow.answer(creation, "outline_review", text="add a module on stretching"))
    assert outline_start.call_count == 2
    assert not {"modules", "lessons", "total", "capped"} & creation.brief.keys()
    assert creation.brief["named"] == COUNTED["named"]


def test_a_redraft_that_names_a_count_keeps_it(owner, outline_start, analysed):
    creation = _reviewing(owner)
    analysed(course_kind.CourseFound(change="make it 6 modules", modules=6))
    creation = _run_pending(flow.answer(creation, "outline_review", text="make it 6 modules"))
    assert creation.brief["modules"] == 6 and creation.brief["lessons"] == 3
    assert outline_start.call_count == 2


def _more_lessons(analysed):
    unclear = course_kind.CourseUnclear(
        field="lessons",
        question="How many lessons in each module?",
        options=[analysis.ClarifyOption(label="4 lessons each", value="4")],
    )
    analysed(course_kind.CourseFound(change="add a few more lessons", unclear=[unclear]))


def test_a_change_with_an_unclear_count_redrafts_once_with_her_count(owner, outline_start, analysed):
    creation = _reviewing(owner)
    _more_lessons(analysed)
    creation = _run_pending(flow.answer(creation, "outline_review", text="add a few more lessons"))
    assert outline_start.call_count == 1  # not yet: her count first
    assert flow.current_field(creation) == "clarify"
    creation = flow.answer(creation, "clarify", value="4")
    assert outline_start.call_count == 2
    # Her new count holds, and the rest of her first answer's with it, as when she says the count outright.
    assert outline_start.call_args.kwargs["instruction"] == "add a few more lessons (4 modules · 4 lessons each)"
    assert (creation.brief["modules"], creation.brief["lessons"]) == (4, 4)
    assert flow.current_field(creation) == "outline_review"


def test_a_change_whose_count_she_leaves_to_us_redrafts_without_one(owner, outline_start, analysed):
    creation = _reviewing(owner)
    _more_lessons(analysed)
    creation = _run_pending(flow.answer(creation, "outline_review", text="add a few more lessons"))
    creation = flow.answer(creation, "clarify", delegate=True)
    assert outline_start.call_count == 2
    assert outline_start.call_args.kwargs["instruction"] == "add a few more lessons"
    assert not {"modules", "lessons", "total"} & creation.brief.keys()


def test_her_words_beyond_the_count_go_with_the_waiting_change(owner, outline_start, analysed):
    creation = _reviewing(owner)
    _more_lessons(analysed)
    creation = _run_pending(flow.answer(creation, "outline_review", text="add a few more lessons"))
    analysed(course_kind.CourseFound(lessons=4, change="module 2 about breathing"))
    words = "4, and make module 2 about breathing"
    creation = _run_pending(flow.answer(creation, "clarify", text=words))
    assert outline_start.call_count == 2
    assert outline_start.call_args.kwargs["instruction"].startswith(f"add a few more lessons; {words}")
    assert creation.brief["lessons"] == 4
    # Unread (the reading failed), her words still go with it.
    creation = _reviewing(owner)
    _more_lessons(analysed)
    creation = _run_pending(flow.answer(creation, "outline_review", text="add a few more lessons"))
    analysed(side_effect=core_ai.AiError("down"))
    creation = _run_pending(flow.answer(creation, "clarify", text=words))
    assert outline_start.call_args.kwargs["instruction"] == f"add a few more lessons; {words}"


def test_two_counts_for_one_change_redraft_once(owner, outline_start, analysed):
    creation = _reviewing(owner)
    analysed(
        course_kind.CourseFound(
            change="make it bigger",
            unclear=[
                course_kind.CourseUnclear(field="modules", question="How many modules?", options=[]),
                course_kind.CourseUnclear(field="lessons", question="How many lessons in each?", options=[]),
            ],
        )
    )
    creation = _run_pending(flow.answer(creation, "outline_review", text="make it bigger"))
    analysed(course_kind.CourseFound(modules=5))
    creation = _run_pending(flow.answer(creation, "clarify", text="5 modules"))
    assert outline_start.call_count == 1  # still waiting on the lessons
    creation = flow.answer(creation, "clarify", value="4")
    assert outline_start.call_count == 2
    assert outline_start.call_args.kwargs["instruction"] == "make it bigger (5 modules · 4 lessons each)"
    assert (creation.brief["modules"], creation.brief["lessons"]) == (5, 4)


def test_a_level_with_a_price_at_the_review_redrafts(owner, outline_start, analysed):
    creation = _reviewing(owner)
    analysed(course_kind.CourseFound(level="advanced", price="49"))
    creation = _run_pending(flow.answer(creation, "outline_review", text="make it advanced and $49"))
    assert creation.answers["level"] == "advanced" and creation.answers["price"] == "49.00"
    assert outline_start.call_count == 2
    assert outline_start.call_args.kwargs["instruction"] == "make it advanced and $49"


def test_a_failed_reading_at_the_review_also_drops_the_counts(owner, outline_start, analysed):
    creation = _reviewing(owner)
    analysed(side_effect=core_ai.AiError("down"))
    creation = _run_pending(flow.answer(creation, "outline_review", text="add a module"))
    assert outline_start.call_count == 2
    assert "modules" not in creation.brief


def test_a_focus_draft_with_a_price_never_blocks_go_live(owner, outline_start, analysed):
    from apps.tenant_config.setup_items import _has_paid_content

    analysed(course_kind.CourseFound(topic="desk yoga", price="49"))
    creation = _run_pending(flow.start(owner, "course", text=RICH))
    assert Course.objects.get(pk=creation.record_id).price == Decimal("49.00")
    assert _has_paid_content({}) is False


def test_fill_it_in_myself_while_reading_drops_the_reading(owner, outline_start, analysed):
    analysed(course_kind.CourseFound(topic="desk yoga", level="beginners", modules=2))
    creation = flow.leave(flow.start(owner, "course", text="desk yoga"), abandon=True)
    assert CopilotRun.objects.get(pk=creation.runs["analysis"]).status == "stopped"
    assert not creation.pending
    jobs.execute(SCHEMA, creation.runs["analysis"])  # a late delivery does nothing
    creation.refresh_from_db()
    assert creation.answers == {} and not outline_start.called


# ── How students get it: the price step (F11, F13) ─────────────────────────


@pytest.fixture()
def plans(tenant_ctx):
    gold = SubscriptionPlan.objects.create(name="Gold", price=Decimal("20"), currency="USD")
    SubscriptionPlan.objects.create(name="Old", price=Decimal("10"), currency="USD", is_active=False)
    return gold


def _at_access(owner, creation=None):
    """Past the cover without "Just draft it", so the price is hers to choose."""
    creation = creation or flow.answer(flow.answer(_started(owner), "level", value="beginners"), "size", value="short")
    creation = flow.answer(creation, "outline_review", value="ok")
    creation.answers = {**creation.answers, "cover": "later"}
    creation.save()
    return creation


def _published(owner, title, chosen):
    course = Course.objects.create(title=title, instructor=owner, is_published=True)
    ways.set_ways(course, chosen)
    return course


def test_the_access_step_offers_every_way_and_pretics_her_usual_setup(owner, outline_start, plans):
    creation = _at_access(owner)
    question = flow.state(creation)["question"]
    assert (question["field"], question["kind"], question["specialist"]) == ("access", "price", "finance")
    assert question["options"] == [
        {"value": "free", "label": "Free", "hint": ""},
        {"value": "paid:19", "label": "One-time price: $19", "hint": "A common place to start; change it any time"},
        {"value": f"plan:{plans.pk}", "label": "In Gold", "hint": ""},
    ]
    assert (question["multi"], question["can_delegate"], question["suggested"]) == (True, False, "paid:19")
    assert question["ticked"] == ["paid:19"]  # none of her own yet: the suggested price

    # Most of her published courses are sold once and in Gold; drafts and a free one don't outvote them.
    in_gold = [{"plan_id": plans.pk, "window": None}]
    _published(owner, "Neck release", {"buy": {"price": "29"}, "plans": in_gold})
    _published(owner, "Wrist care", {"buy": {"price": "49"}, "plans": in_gold})
    _published(owner, "Free taster", {"free": {}})
    for n in range(3):
        Course.objects.create(title=f"Draft {n}", instructor=owner)
    question = flow.state(creation)["question"]
    assert question["ticked"] == ["paid:39", f"plan:{plans.pk}"]
    assert question["why"] == flow.USUAL_WHY

    # A subscription's contents are the owner's: a coach is offered no plan.
    coach = User.objects.create_user(email="focus-coach@x.com", name="Coach", password="x", role="coach")  # noqa: S106
    creation.actor = coach
    creation.save()
    assert [o["value"] for o in flow.state(creation)["question"]["options"]] == ["free", "paid:39"]


def test_ticking_two_ways_sets_both(owner, outline_start, plans):
    creation = _at_access(owner)
    course = Course.objects.get(pk=creation.record_id)
    ways.set_ways(course, {"buy": {"price": "10", "window": {"closes_after_days": 365}}})  # set on the page
    for bad in ("", ",", f"paid:39,plan:{plans.pk},nonsense", f"plan:{plans.pk},plan:{plans.pk}"):
        creation = flow.answer(creation, "access", value=bad)
        assert "access" not in creation.answers
    creation = flow.answer(creation, "access", value=f"paid:39,plan:{plans.pk}")
    course.refresh_from_db()
    assert ways.ways_of(course) == {
        "free": None,
        "buy": {"price": "39.00", "window": {"closes_after_days": 365}},  # her window stays
        "plans": [{"plan_id": plans.pk, "window": None}],
    }
    assert creation.answers["access"] == f"paid:39.00,plan:{plans.pk}" and creation.answers["price"] == "39.00"
    assert flow.current_field(creation) == "finish"
    line = "$39 once with 1 year of access; in Gold."
    assert {"field": "access", "label": line} in flow.state(creation)["answered"]
    assert {"role": "coach", "text": line} in CopilotChat.objects.get(pk=creation.chat_id).entries


def test_select_all_ticks_every_way(owner, outline_start, plans):
    creation = flow.answer(_at_access(owner), "access", value="all")
    chosen = ways.ways_of(Course.objects.get(pk=creation.record_id))
    assert (bool(chosen["free"]), chosen["buy"]["price"], chosen["plans"]) == (
        True,
        "19.00",
        [{"plan_id": plans.pk, "window": None}],
    )


def test_her_words_set_a_price_and_a_members_window_in_one_go(owner, outline_start, analysed, plans):
    said = analysis.FoundWays(
        buy="49", plans=[analysis.FoundPlan(plan="gold", window=analysis.FoundWindow(opens_after_days=30))]
    )
    analysed(course_kind.CourseFound(topic="desk yoga", level="beginners", modules=4, lessons=3, ways=said))
    creation = _run_pending(flow.start(owner, "course", text="Desk yoga, $49 once, free for Gold after a month"))
    assert ways.ways_of(Course.objects.get(pk=creation.record_id)) == {
        "free": None,
        "buy": {"price": "49.00", "window": None},
        "plans": [{"plan_id": plans.pk, "window": {"opens_after_days": 30}}],
    }
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=False):
        creation = _at_access(owner, creation)
    assert flow.current_field(creation) == "finish"  # the access step is answered


def test_a_members_only_course_cannot_go_live_before_she_can_sell(owner, outline_start, plans):
    creation = flow.answer(_at_access(owner), "access", value=f"plan:{plans.pk}")
    _filled(creation)
    assert [o["value"] for o in flow.state(creation)["question"]["options"]] == ["start_selling", "draft"]
    creation = flow.finish(creation, publish=True)
    assert Course.objects.get(pk=creation.record_id).is_published is False


def test_tapping_a_price_sets_it_and_moves_on(owner, outline_start):
    creation = _at_access(owner)
    for bad in (
        "paid:-5",
        "paid:abc",
        "paid:0",
        "paid:NaN",
        "plan:abc",
        "plan:99999999999999999999",
        "plan:²",
        "membership",
        "nonsense",
    ):
        creation = flow.answer(creation, "access", value=bad)
        assert "access" not in creation.answers
    creation = flow.answer(creation, "access", value="paid:39")
    course = Course.objects.get(pk=creation.record_id)
    assert (course.pricing_type, course.price) == ("paid", Decimal("39.00"))
    assert creation.answers["access"] == "paid:39.00" and creation.answers["price"] == "39.00"
    assert flow.current_field(creation) == "finish"
    assert {"field": "access", "label": "$39 once, theirs to keep."} in flow.state(creation)["answered"]


def test_tapping_free_keeps_it_free(owner, outline_start):
    creation = flow.answer(_at_access(owner), "access", value="free")
    assert Course.objects.get(pk=creation.record_id).pricing_type == "free"
    assert creation.answers["access"] == "free" and flow.current_field(creation) == "finish"


def test_tapping_a_membership_puts_the_course_in_it(owner, outline_start, plans):
    creation = flow.answer(_at_access(owner), "access", value=f"plan:{plans.pk}")
    assert Course.objects.get(pk=creation.record_id).pricing_type == "subscription"
    assert SubscriptionPlanAccess.objects.filter(plan=plans, object_id=creation.record_id).count() == 1
    assert creation.answers["access"] == f"plan:{plans.pk}" and creation.answers["price"] == "membership"
    answered = flow.state(creation)["answered"]
    assert {"field": "access", "label": "In Gold."} in answered
    assert not any(line["field"] == "price" for line in answered)  # one line for it, not two


def test_an_inactive_or_unknown_plan_is_ignored(owner, outline_start, plans):
    creation = _at_access(owner)
    old = SubscriptionPlan.objects.get(name="Old")
    for tap in (f"plan:{old.pk}", "plan:999999"):
        creation = flow.answer(creation, "access", value=tap)
    assert "access" not in creation.answers and not SubscriptionPlanAccess.objects.exists()


def test_a_price_from_her_first_answer_skips_the_access_question(owner, outline_start, analysed):
    analysed(course_kind.CourseFound(topic="desk yoga", level="beginners", modules=4, lessons=3, price="49"))
    creation = _run_pending(flow.start(owner, "course", text=RICH))
    assert creation.answers["access"] == "paid:49.00"
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=False):
        creation = _at_access(owner, creation)
    assert flow.current_field(creation) == "finish"


def test_a_membership_in_her_first_answer_keeps_the_question_with_her_memberships(
    owner, outline_start, analysed, plans
):
    analysed(course_kind.CourseFound(topic="desk yoga", level="beginners", modules=4, lessons=3, price="membership"))
    creation = _run_pending(flow.start(owner, "course", text="desk yoga, in my membership"))
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=False):
        creation = _at_access(owner, creation)
    question = flow.state(creation)["question"]
    assert question["field"] == "access"
    assert [o["value"] for o in question["options"]] == ["free", "paid:19", f"plan:{plans.pk}"]
    assert question["ticked"] == [f"plan:{plans.pk}"]


def test_her_words_at_the_access_step_are_read_for_a_price(owner, outline_start, analysed):
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=False):
        creation = _at_access(owner)
    analysed(course_kind.CourseFound(price="25"))
    creation = _run_pending(flow.answer(creation, "access", text="25 dollars"))
    assert Course.objects.get(pk=creation.record_id).price == Decimal("25.00")
    assert creation.answers["access"] == "paid:25.00" and flow.current_field(creation) == "finish"


def test_words_with_no_price_leave_the_access_question_open(owner, outline_start):
    creation = flow.answer(_at_access(owner), "access", text="not sure yet")  # no model: read as stage 1
    assert "access" not in creation.answers and flow.current_field(creation) == "access"
    creation = flow.answer(creation, "access", text="45")
    assert creation.answers["access"] == "paid:45.00"


def test_just_draft_it_keeps_it_free_and_finish_offers_the_suggested_price(owner, outline_start):
    creation = _at_cover(owner)  # "Just draft it" at the level question
    assert creation.answers["access"] == "delegate"
    creation.answers = {**creation.answers, "cover": "later"}
    creation.save()
    assert Course.objects.get(pk=creation.record_id).pricing_type == "free"
    question = flow.state(creation)["question"]
    assert question["field"] == "finish"
    assert {"value": "price:19", "label": "Sell it for $19", "hint": pricing.FALLBACK} in question["options"]
    creation = flow.answer(creation, "finish", value="publish")  # no other answer on finish
    assert "finish" not in creation.answers
    creation = flow.answer(creation, "finish", value="price:19")
    course = Course.objects.get(pk=creation.record_id)
    assert (course.pricing_type, course.price) == ("paid", Decimal("19.00"))
    assert flow.current_field(creation) == "finish"
    assert not any(o["value"].startswith("price:") for o in flow.state(creation)["question"]["options"])


def test_a_price_tap_on_finish_needs_a_delegated_price(owner, outline_start):
    creation = flow.answer(_at_finish(owner), "finish", value="price:19")  # she chose Free herself
    assert Course.objects.get(pk=creation.record_id).pricing_type == "free"


def test_a_paid_course_she_cannot_sell_yet_offers_start_selling_not_publish(owner, outline_start):
    creation = flow.answer(_at_access(owner), "access", value="paid:39")
    _filled(creation)
    question = flow.state(creation)["question"]
    assert [o["value"] for o in question["options"]] == ["start_selling", "draft"]
    assert question["options"][0] == {
        "value": "start_selling",
        "label": "Start selling",
        "hint": "your plan, then payouts",
    }
    assert question["paid_active"] is False
    creation = flow.finish(creation, publish=True)  # a stale screen still asking
    assert Course.objects.get(pk=creation.record_id).is_published is False
    assert creation.answers["finish"] == "draft"


def test_a_paid_course_she_can_sell_is_offered_publish(owner, outline_start):
    creation = flow.answer(_at_access(owner), "access", value="paid:39")
    _filled(creation)
    with mock.patch("apps.core.monetization.can_monetize", return_value=True):
        assert [o["value"] for o in flow.state(creation)["question"]["options"]] == ["publish", "draft"]


def test_no_job_ever_sets_a_paid_price(owner, outline_start):
    creation = flow.start(owner, "course", value="Desk yoga", rest=True)
    creation = flow.answer(creation, "outline_review", value="ok")
    creation.answers = {**creation.answers, "cover": "later"}
    creation.save()
    flow.state(creation)
    course = Course.objects.get(pk=creation.record_id)
    assert (course.pricing_type, course.price) == ("free", Decimal("0"))
    assert creation.answers["access"] == "delegate"
