"""Finish's "Tell my students" (team spec T12): once the course goes live,
Marketing drafts an announcement from her own words with a proposed send time;
she taps Schedule or Not now, and focus mode ends. The model call is patched;
what is under test is the draft that lands in Messages, the send time, and
what each tap does."""

import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from unittest import mock
from zoneinfo import ZoneInfo

import pytest

from apps.accounts.models import User
from apps.core import ai as core_ai
from apps.core import tasks
from apps.core.focus import announce, flow, jobs
from apps.core.focus.recipes import RECIPES
from apps.courses.models import Course, Lesson, Module
from apps.notifications.models import Announcement
from apps.tenant_config.models import CopilotRun, FocusCreation, TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)

SCHEMA = "shared_test"


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="announce-owner@x.com",
        name="Owner",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture(autouse=True)
def enqueue():
    with mock.patch.object(tasks.run_focus_job, "delay") as delay:
        yield delay


@pytest.fixture(autouse=True)
def ai_on():
    with (
        mock.patch("apps.core.focus.announce.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.focus.announce.ai_compose.record_spend"),
    ):
        yield


@pytest.fixture(autouse=True)
def outline_start():
    def fake(creation, instruction=""):
        run = CopilotRun.objects.create(actor=creation.actor, chat=creation.chat, specialist="content")
        creation.outline_run = run
        creation.save(update_fields=["outline_run"])
        return run

    with mock.patch("apps.core.focus.outline.start", side_effect=fake):
        yield


@pytest.fixture()
def berlin(tenant_ctx):
    config = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="x")
    before = config.timezone
    config.timezone = "Europe/Berlin"
    config.save(update_fields=["timezone"])
    yield
    TenantConfig.objects.filter(pk=config.pk).update(timezone=before)


@pytest.fixture()
def model():
    """Marketing's draft, patched; ``model.call_args`` holds what it was given."""
    draft = announce.AnnouncementDraft(
        title="New course: Desk yoga, gently", body="A short course for office workers. It starts today."
    )
    with mock.patch("apps.core.focus.announce.core_ai.structured", return_value=(draft, Decimal("0"), "x")) as stub:
        yield stub


def _ready(owner, text="A course on desk yoga"):
    """At the finish step with a lesson she wrote, so it can go live."""
    creation = flow.answer(flow.start(owner, "course", value=text), "level", rest=True)
    creation = flow.answer(creation, "outline_review", value="ok")
    creation.answers = {**creation.answers, "cover": "later", "access": "free"}
    creation.brief = {**(creation.brief or {}), "notes": "For people who sit all day."}
    creation.save()
    Course.objects.filter(pk=creation.record_id).update(title="Desk yoga, gently", description="Five minute breaks.")
    module = Module.objects.create(course_id=creation.record_id, title="Basics", order=1)
    Lesson.objects.create(module=module, title="Lesson 1", order=1, content_html="<p>Breathe in.</p>")
    return creation


def _drafted(owner):
    creation = flow.finish(_ready(owner), publish=True, announce=True)
    jobs.execute(SCHEMA, creation.runs["announce"])
    creation.refresh_from_db()
    return creation


def _chat(creation):
    creation.chat.refresh_from_db()
    return [e["text"] for e in creation.chat.entries]


def test_publish_with_tell_my_students_drafts_an_announcement_and_waits(owner, berlin, model):
    creation = flow.finish(_ready(owner), publish=True, announce=True)
    course = Course.objects.get(pk=creation.record_id)
    assert course.is_published is True
    assert creation.status == "active" and creation.finished_at is None
    assert creation.answers["finish"] == "publish"
    assert flow.current_field(creation) == "announce"
    state = flow.state(creation)
    assert state["question"]["field"] == "announce"
    assert state["question"]["specialist"] == "marketing"
    assert state["announcement"]["status"] == "building"

    jobs.execute(SCHEMA, creation.runs["announce"])
    creation.refresh_from_db()
    row = Announcement.objects.get()
    assert row.status == "draft" and row.scheduled_at is None
    assert row.link == f"/courses/{course.slug}"
    assert CopilotRun.objects.get(pk=creation.runs["announce"]).result == {
        "announcement": row.id,
        "send_at": flow.state(creation)["announcement"]["send_at"],
    }
    given = json.loads(model.call_args.kwargs["user"])
    assert given == {
        "course": "Desk yoga, gently",
        "description": "Five minute breaks.",
        "notes": "For people who sit all day.",
        "followups": [],
    }
    assert model.call_args.kwargs["label"] == "contentor:copilot"
    shown = flow.state(creation)["announcement"]
    assert shown["status"] == "ready"
    assert shown["zone"] == "Europe/Berlin"
    assert shown["id"] == row.id
    assert shown["title"] == "New course: Desk yoga, gently"
    assert shown["body"] == "A short course for office workers. It starts today."
    send_at = datetime.fromisoformat(shown["send_at"])
    assert send_at.hour == 10  # her wall clock, with its offset
    assert send_at.astimezone(ZoneInfo("Europe/Berlin")).hour == 10
    assert send_at - datetime.now(UTC) >= timedelta(hours=1)


def test_the_send_time_is_the_next_ten_oclock_at_least_an_hour_away():
    zone = ZoneInfo("America/New_York")
    morning = datetime(2026, 10, 19, 12, 30, tzinfo=UTC)  # 08:30 in New York
    assert announce.send_time(morning, zone) == datetime(2026, 10, 19, 10, tzinfo=zone)
    close = datetime(2026, 10, 19, 13, 30, tzinfo=UTC)  # 09:30: under an hour away
    assert announce.send_time(close, zone) == datetime(2026, 10, 20, 10, tzinfo=zone)
    later = datetime(2026, 10, 19, 20, tzinfo=UTC)
    assert announce.send_time(later, zone).isoformat() == "2026-10-20T10:00:00-04:00"


def test_keep_as_a_draft_never_offers_an_announcement(owner, model):
    kept = flow.finish(_ready(owner), publish=False, announce=True)
    assert kept.status == "done"
    assert kept.answers["announce"] == "skip"
    assert "announce" not in (kept.runs or {})
    # Ticked, but it cannot go live yet (an empty lesson): a draft, and no announcement.
    creation = _ready(owner, "A course on breathing")
    Lesson.objects.filter(module__course_id=creation.record_id).update(content_html="")
    creation = flow.finish(creation, publish=True, announce=True)
    assert creation.answers["finish"] == "draft" and creation.answers["announce"] == "skip"
    assert creation.status == "done"
    assert "announce" not in (creation.runs or {})
    model.assert_not_called()


def test_schedule_schedules_it_and_ends_focus_mode(owner, berlin, model):
    creation = _drafted(owner)
    send_at = flow.state(creation)["announcement"]["send_at"]
    creation = flow.decide_announcement(creation, schedule=True)
    row = Announcement.objects.get()
    assert row.status == "scheduled"
    assert row.scheduled_at == datetime.fromisoformat(send_at)
    assert creation.status == "done" and creation.finished_at is not None
    assert creation.answers["announce"] == "scheduled"
    assert _chat(creation)[-1].startswith("Your announcement is scheduled for ")
    # A double tap changes nothing.
    again = flow.decide_announcement(creation, schedule=False)
    assert again.answers["announce"] == "scheduled"
    assert Announcement.objects.get().status == "scheduled"


def test_not_now_leaves_it_a_draft_and_says_where(owner, model):
    creation = flow.decide_announcement(_drafted(owner), schedule=False)
    row = Announcement.objects.get()
    assert row.status == "draft" and row.scheduled_at is None
    assert creation.status == "done"
    assert _chat(creation)[-2:] == ["Not now", "Your announcement is saved as a draft in Messages."]


def test_a_failed_announcement_can_be_skipped(owner, enqueue):
    creation = flow.finish(_ready(owner), publish=True, announce=True)
    first = creation.runs["announce"]
    with mock.patch("apps.core.focus.announce.core_ai.structured", side_effect=core_ai.AiError("down")):
        jobs.execute(SCHEMA, first)
    creation.refresh_from_db()
    assert flow.state(creation)["announcement"]["status"] == "failed"
    # Schedule has nothing to schedule.
    assert flow.decide_announcement(creation, schedule=True).status == "active"
    # Try again: a new run.
    creation = flow.retry_announcement(creation)
    assert creation.runs["announce"] != first
    assert flow.state(creation)["announcement"]["status"] == "building"
    with mock.patch("apps.core.focus.announce.core_ai.structured", side_effect=core_ai.AiError("down")):
        jobs.execute(SCHEMA, creation.runs["announce"])
    creation.refresh_from_db()
    creation = flow.decide_announcement(creation, schedule=False)
    assert creation.status == "done" and creation.answers["announce"] == "skip"
    assert not Announcement.objects.exists()
    assert not any("draft" in line for line in _chat(creation)[-2:])


def test_the_announcement_comes_after_finish_and_is_never_delegated(owner):
    recipe = RECIPES["course"]
    assert [q.id for q in recipe.questions][-2:] == ["finish", "announce"]
    assert recipe.specialists["announce"] == "marketing"
    creation = flow.answer(flow.start(owner, "course", value="A course on desk yoga"), "level", rest=True)
    assert "announce" not in creation.answers
    assert creation.outline_run_id is not None  # it never holds up the outline
    # No answer reaches it but its own taps.
    creation = _ready(owner, "A course on breathing")
    creation.answers = {**creation.answers, "finish": "publish"}
    creation.save()
    assert flow.current_field(creation) == "announce"
    assert "announce" not in flow.answer(creation, "announce", value="scheduled").answers
    assert "announce" not in flow.answer(creation, "announce", text="Send it now").answers


def test_a_stale_send_time_moves_to_the_next_one(owner, berlin, model):
    """She left and came back after the proposed 10:00: Schedule never sends at once."""
    creation = _drafted(owner)
    run = CopilotRun.objects.get(pk=creation.runs["announce"])
    run.result = {**run.result, "send_at": "2026-01-05T10:00:00+01:00"}
    run.save(update_fields=["result"])
    shown = flow.state(creation)["announcement"]["send_at"]
    assert datetime.fromisoformat(shown) - datetime.now(UTC) >= timedelta(hours=1)
    flow.decide_announcement(creation, schedule=True)
    scheduled = Announcement.objects.get().scheduled_at
    assert scheduled == datetime.fromisoformat(shown)
    assert scheduled - datetime.now(UTC) >= timedelta(minutes=59)


def test_fill_it_in_myself_at_the_announcement_ends_it_as_not_now(owner, model):
    creation = flow.leave(_drafted(owner), abandon=True)
    assert creation.status == "done" and creation.finished_at is not None
    assert creation.answers["announce"] == "draft"
    assert Announcement.objects.get().status == "draft"
    assert _chat(creation)[-1] == flow.SAVED_IN_MESSAGES
    # While Marketing is still writing: the run stops, and nothing claims a draft.
    writing = flow.finish(_ready(owner, "A course on breathing"), publish=True, announce=True)
    writing = flow.leave(writing, abandon=True)
    assert writing.status == "done" and writing.answers["announce"] == "skip"
    assert CopilotRun.objects.get(pk=writing.runs["announce"]).status == "stopped"
    assert _chat(writing)[-1] == flow.NO_ANNOUNCEMENT


def test_a_run_stopped_by_not_now_never_drafts(owner, model):
    creation = flow.finish(_ready(owner), publish=True, announce=True)
    flow.decide_announcement(creation, schedule=False)  # before the worker took it
    jobs.execute(SCHEMA, creation.runs["announce"])
    assert not Announcement.objects.exists()
    # Not now while the model writes: Stop wins, no draft lands.
    creation = flow.finish(_ready(owner, "A course on breathing"), publish=True, announce=True)
    draft = model.return_value

    def not_now_meanwhile(**kwargs):
        flow.decide_announcement(creation, schedule=False)
        return draft

    model.side_effect = not_now_meanwhile
    jobs.execute(SCHEMA, creation.runs["announce"])
    assert not Announcement.objects.exists()
    assert CopilotRun.objects.get(pk=creation.runs["announce"]).status == "stopped"


@pytest.mark.parametrize("sent", [False, True])
def test_a_draft_she_scheduled_or_sent_from_messages_ends_it_as_decided(owner, berlin, model, sent):
    creation = _drafted(owner)
    row = Announcement.objects.get()
    when = datetime(2026, 11, 3, 9, 30, tzinfo=UTC)  # 10:30 in Berlin
    row.status, row.scheduled_at = ("sent", None) if sent else ("scheduled", when)
    row.save(update_fields=["status", "scheduled_at"])
    first = creation.runs["announce"]
    creation = flow.retry_announcement(creation)  # a stale screen's Try again: never a second one
    assert creation.runs["announce"] == first
    assert creation.status == "done" and creation.answers["announce"] == row.status
    assert _chat(creation)[-1] == (
        flow.SENT if sent else "Your announcement is scheduled for Tuesday 3 November at 10:30."
    )
    assert Announcement.objects.count() == 1


def test_coming_back_after_scheduling_it_in_messages_never_offers_try_again(owner, model):
    creation = _drafted(owner)
    Announcement.objects.update(status="sent")
    state = flow.state(creation)
    assert state["status"] == "done" and state["question"] is None and state["announcement"] is None
    assert FocusCreation.objects.get(pk=creation.pk).finished_at is not None


def test_the_announcement_job_locks_the_creation_before_its_run(owner, model):
    creation = flow.finish(_ready(owner), publish=True, announce=True)
    order, lock, active = [], FocusCreation.objects.select_for_update, jobs.active

    def locks_creation(*args, **kwargs):
        order.append("creation")
        return lock(*args, **kwargs)

    def locks_run(pk):
        order.append("run")
        return active(pk)

    with (
        mock.patch.object(FocusCreation.objects, "select_for_update", side_effect=locks_creation),
        mock.patch("apps.core.focus.jobs.active", side_effect=locks_run),
    ):
        jobs.execute(SCHEMA, creation.runs["announce"])
    assert order == ["creation", "run"]
    assert Announcement.objects.exists()
