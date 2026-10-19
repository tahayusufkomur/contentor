"""A class or event in focus mode (apps.core.focus.kinds.event): its draft
waits for the kind (G10), holds her date as a draft (G12), and on finish a
weekly schedule becomes its series, published or held (G11). The copy job
itself (the review step's drafting) is tested in test_focus_copy.py."""

from datetime import datetime, timedelta
from unittest import mock
from zoneinfo import ZoneInfo

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core import tasks
from apps.core.focus import flow, followup, jobs, kinds
from apps.core.focus.kinds import event
from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass
from apps.tenant_config.models import CopilotRun, TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)

SCHEMA = "shared_test"
ZONE = "Europe/Istanbul"
MODELS = (LiveClass, LiveStream, ZoomClass, OnsiteEvent)


@pytest.fixture()
def owner(tenant_ctx):
    config = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Studio")
    config.timezone = ZONE
    config.save(update_fields=["timezone"])
    return User.objects.create_user(
        email="focus-event@x.com",
        name="Owner",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture(autouse=True)
def on(settings):
    settings.FOCUS_KINDS = ["course", "event"]
    with mock.patch.object(tasks.run_focus_job, "delay"):
        yield


def _local(days: int, hour: int = 18) -> datetime:
    """A wall-clock time in her zone, ``days`` from today."""
    now = timezone.now().astimezone(ZoneInfo(ZONE))
    return (now + timedelta(days=days)).replace(hour=hour, minute=0, second=0, microsecond=0)


def _once(days: int) -> str:
    return f'{{"mode": "once", "at": "{_local(days):%Y-%m-%dT%H:%M}"}}'


def _weekly(weeks: int = 2) -> str:
    """Every day of the week at 18:00, from tomorrow, for ``weeks`` weeks."""
    start = _local(1)
    end = start + timedelta(weeks=weeks, days=-1)
    return (
        f'{{"mode": "recurring", "start": "{start:%Y-%m-%d}", "end": "{end:%Y-%m-%d}", '
        f'"slots": [{{"days": [0, 1, 2, 3, 4, 5, 6], "times": ["18:00"]}}]}}'
    )


def _started(owner, topic="A class on morning breath"):
    return flow.start(owner, "event", value=topic)


def _typed(owner, text, found):
    """Her typed first answer, read by the analysis as ``found`` (the model patched)."""
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True):
        creation = flow.start(owner, "event", text=text)
    with (
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.focus.analysis.read", return_value=found),
        mock.patch("apps.core.focus.flow.followup_allowed", return_value=False),
    ):
        jobs.execute(SCHEMA, creation.pending["run"])
    creation.refresh_from_db()
    return creation


def _at_finish(owner, where="live", when=None, place=None):
    """A class of kind ``where`` answered up to the finish step, free."""
    creation = flow.answer(_started(owner), "where", value=where)
    creation = flow.answer(creation, "when", value=when or _once(3))
    if place is not None:
        creation = flow.answer(creation, "place", value=place)
    creation.answers = {**creation.answers, "review": "ok", "cover": "later"}
    creation.save()
    if flow.current_field(creation) == "access":
        creation = flow.answer(creation, "access", value="free")
    assert flow.current_field(creation) == "finish"
    return creation


def _row(creation):
    return event.record(creation.record_id)


# ── The brief's tests ───────────────────────────────────────────────────────


def test_the_draft_waits_for_the_kind_then_is_an_undated_draft(owner):
    with mock.patch("apps.core.copilot.content._give_cover") as cover:
        creation = _started(owner)
        assert creation.record_id is None
        assert flow.state(creation)["record"] is None
        assert flow.current_field(creation) == "where"
        creation = flow.answer(creation, "where", value="live")
    row = _row(creation)
    assert isinstance(row, LiveClass)
    assert (row.title, row.status, row.scheduled_at) == ("Morning breath", "draft", None)
    cover.assert_not_called()  # the Designer's cover step gives it one later
    body = flow.state(creation)
    assert body["record"]["path"] == f"/admin/live?event={row.pk}&kind=live"
    assert body["question"]["field"] == "when"


def test_a_first_answer_with_everything_skips_where_when_and_place(owner):
    text = "weekly yoga at my studio, Tuesdays 18:00, Kadıköy Moda Cd. 12, 200 lira"
    found = event.EventFound(
        topic="weekly yoga",
        where="onsite",
        schedule=event.EventSchedule(mode="weekly", days=[2], times=["18:00"]),
        address="Kadıköy Moda Cd. 12",
        price="200",
    )
    creation = _typed(owner, text, found)
    assert flow.current_field(creation) == "review"
    assert creation.answers["where"] == "onsite"
    assert creation.answers["place"] == "Kadıköy Moda Cd. 12"
    assert creation.answers["when"]["slots"] == [{"days": [2], "times": ["18:00"]}]
    row = _row(creation)
    assert isinstance(row, OnsiteEvent)
    assert (row.title, row.status, row.address) == ("Weekly yoga", "draft", "Kadıköy Moda Cd. 12")
    assert (row.pricing_type, str(row.price)) == ("paid", "200.00")
    local = row.scheduled_at.astimezone(ZoneInfo(ZONE))
    assert (local.strftime("%A %H:%M"), row.scheduled_at > timezone.now()) == ("Tuesday 18:00", True)
    answered = {a["field"]: a["label"] for a in flow.state(creation)["answered"]}
    assert answered["where"] == "In person"
    assert answered["when"].startswith("Tuesdays at 6:00 PM")


def test_leaving_before_the_kind_is_known_leaves_no_record(owner):
    creation = flow.leave(_started(owner))
    body = flow.state(creation)
    assert (body["status"], body["record"]) == ("active", None)  # Save & leave: it stays open to resume
    creation = flow.leave(creation, abandon=True)
    assert flow.state(creation)["status"] == "left"
    assert not any(model.objects.exists() for model in MODELS)


def test_zoom_is_free_and_its_access_step_is_skipped(owner):
    # A price said before the kind was known: a Zoom class is still free (G9).
    creation = _typed(owner, "breathwork, 20 lira", event.EventFound(topic="breathwork", price="20"))
    assert creation.record_id is None
    creation = flow.answer(creation, "where", value="zoom")
    row = _row(creation)
    assert isinstance(row, ZoomClass)
    assert (row.pricing_type, row.price) == ("free", 0)
    assert "access" in event.skips(creation) and "place" not in event.skips(creation)
    assert creation.answers["access"] == "free"
    answered = flow.state(creation)["answered"]
    assert {"field": "access", "label": event.ZOOM_FREE} in answered
    assert [a for a in answered if a["field"] == "price"] == []
    # Her Zoom link, kept exactly; no access step before finish.
    creation = flow.answer(creation, "when", value=_once(3))
    asked = flow.state(creation)["question"]
    assert (asked["field"], asked["starter"]) == ("place", "https://zoom.us/j/")
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=False):
        creation = flow.answer(creation, "place", text="https://zoom.us/j/123?pwd=AbC")
    assert _row(creation).zoom_link == "https://zoom.us/j/123?pwd=AbC"
    creation.answers = {**creation.answers, "review": "ok", "cover": "later"}
    assert flow.current_field(creation) == "finish"


def test_publish_is_refused_without_the_address_or_link_or_a_future_date(owner):
    creation = _at_finish(owner, "onsite", place="later")
    assert event.not_ready(_row(creation)) == "Add the address first"
    assert [o["value"] for o in flow.state(creation)["question"]["options"]] == ["draft"]
    creation = flow.finish(creation, publish=True)
    assert creation.answers["finish"] == "draft" and _row(creation).status == "draft"

    zoom = ZoomClass.objects.create(title="Z", instructor=owner, scheduled_at=_local(2))
    assert event.not_ready(zoom) == "Add the Zoom link first"
    live = LiveClass.objects.create(title="L", instructor=owner, scheduled_at=_local(-2))
    assert event.not_ready(live) == "Pick a date in the future"
    live.scheduled_at = None
    assert event.not_ready(live) == "Pick a date in the future"
    live.scheduled_at = _local(2)
    assert event.not_ready(live) == ""


def test_publish_makes_and_publishes_the_weekly_series(owner):
    creation = flow.finish(_at_finish(owner, when=_weekly(2)), publish=True)
    assert creation.answers["finish"] == "publish"
    rows = list(LiveClass.objects.filter(title="Morning breath").order_by("scheduled_at"))
    assert len(rows) == 14
    assert {r.status for r in rows} == {"scheduled"}
    assert [r.scheduled_at.astimezone(ZoneInfo(ZONE)).hour for r in rows] == [18] * 14
    event.go_live(creation.record_id)  # a retry never makes the series twice
    assert LiveClass.objects.filter(title="Morning breath").count() == 14
    facts = event.announce_facts(rows[0])  # the Community manager's announcement has the schedule in it
    assert facts["link"] == f"/calendar/live_class/{rows[0].pk}" and "at 6:00 PM, from" in facts["when"]


def test_keep_as_a_draft_holds_the_whole_series(owner):
    creation = flow.finish(_at_finish(owner, when=_weekly(2)), publish=False)
    assert creation.answers["finish"] == "draft" and creation.status == "done"
    rows = LiveClass.objects.filter(title="Morning breath")
    assert rows.count() == 14
    assert set(rows.values_list("status", flat=True)) == {"draft"}
    event.keep(creation.record_id)
    assert rows.count() == 14


def test_a_date_she_gave_keeps_the_event_a_draft_until_finish(owner):
    creation = flow.answer(flow.answer(_started(owner), "where", value="live"), "when", value=_once(3))
    row = _row(creation)
    assert row.scheduled_at == _local(3) and row.status == "draft"
    assert flow.current_field(creation) == "review"  # no place for a live class
    creation.answers = {**creation.answers, "review": "ok", "cover": "later"}
    creation.save()
    creation = flow.answer(creation, "access", value="free")
    assert _row(creation).status == "draft"
    flow.finish(creation, publish=True)
    assert _row(creation).status == "scheduled"


# ── The when question, and her words kept exactly ───────────────────────────


@pytest.mark.parametrize(
    "value",
    ['{"mode": "once", "at": "tomorrow"}', '{"mode": "weekly"}', "not json", '{"mode": "once"}'],
)
def test_the_when_tap_takes_only_a_schedule_the_picker_could_send(owner, value):
    creation = flow.answer(flow.answer(_started(owner), "where", value="live"), "when", value=value)
    assert "when" not in creation.answers
    assert flow.current_field(creation) == "when" and _row(creation).scheduled_at is None


def test_a_zoom_link_that_is_no_link_is_asked_once_never_stored(owner):
    found = event.EventFound(where="zoom", zoom_link="zoom.us/j/123")
    creation = _typed(owner, "a zoom class, zoom.us/j/123", found)
    assert "place" not in creation.answers and _row(creation).zoom_link == ""
    assert flow.current_field(creation) == "clarify"
    asked = flow.state(creation)["question"]
    assert asked["options"] == [{"value": "later", "label": "Add it later", "hint": ""}]
    creation = flow.answer(creation, "clarify", value="later")
    assert creation.answers["place"] == "later" and flow.current_field(creation) == "when"


def test_a_clarify_answer_sets_where_and_when(owner):
    creation = _started(owner)
    assert event.apply_clarified(creation, "where", "In person") is False
    assert creation.answers["where"] == "onsite"
    assert event.apply_clarified(creation, "when", f"{_local(4):%Y-%m-%dT%H:%M}") is False
    assert creation.answers["when"]["mode"] == "once"
    event.apply_clarified(creation, "when", "next week sometime")  # no date: left to its question
    assert creation.answers["when"]["mode"] == "once"
    schema = event.EventFound.model_json_schema()
    assert schema["$defs"]["EventUnclear"]["properties"]["field"]["enum"] == list(event.UNCLEAR_FIELDS)


def test_the_event_prompt_names_its_own_fields():
    from apps.core.focus import analysis

    system = analysis.system_for("event")
    for word in ("where:", "schedule:", "duration_minutes:", "address:", "zoom_link:", "capacity:", "(where, when or"):
        assert word in system
    assert "modules" not in system and "her students will learn" not in system and "{" not in system


# ── Carry-forward: skips, the overview, the series ──────────────────────────


def test_a_skipped_place_neither_waits_nor_is_delegated(owner):
    with mock.patch.object(event, "start_draft") as start_draft:
        creation = flow.answer(_started(owner), "where", value="stream", rest=True)
        assert "place" not in creation.answers and "when" not in creation.answers  # her date: never delegated
        start_draft.assert_not_called()
        creation = flow.answer(creation, "when", value=_once(3))
    assert "place" not in creation.answers
    start_draft.assert_called_once()  # every question before the review is answered or skipped
    with mock.patch("apps.core.focus.outline.start") as outline_start:
        creation = flow.answer(flow.answer(_started(owner), "where", value="live"), "when", value=_once(3))
    outline_start.assert_not_called()  # an event never starts the course's outline


def test_the_overview_lists_a_class_without_a_record_yet(owner):
    creation = flow.start(owner, "event", value="A class on morning breath")
    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=owner)
    open_ = client.get("/api/v1/admin/focus/").json()["open"]
    assert {"id": creation.id, "kind": "event", "record": None, "title": "Morning breath"} in open_


def test_a_first_session_whose_date_passed_moves_to_the_next_slot(owner):
    creation = _at_finish(owner, when=_weekly(2))
    first = _row(creation)
    LiveClass.objects.filter(pk=first.pk).update(scheduled_at=_local(-1))  # she came back two days later
    assert event.not_ready(_row(creation)) == ""  # her schedule still has sessions to come
    creation = flow.finish(creation, publish=True)
    rows = list(LiveClass.objects.filter(title="Morning breath").order_by("scheduled_at"))
    assert rows[0].pk == first.pk and rows[0].scheduled_at > timezone.now()
    assert len(rows) == 14 and {r.status for r in rows} == {"scheduled"}


def test_the_price_suggestion_reads_her_classes_then_setup_then_starts_at_15(owner, tenant_ctx, monkeypatch):
    from apps.core.focus import pricing

    draft = LiveClass.objects.create(title="Draft", instructor=owner)
    assert (event.suggest_price(draft).amount, event.suggest_price(draft).reason) == (15, pricing.FALLBACK)
    monkeypatch.setattr(tenant_ctx, "wizard_state", {"flow": "interview", "answers": {"event_price": "12"}})
    assert (event.suggest_price(draft).amount, event.suggest_price(draft).reason) == (12, pricing.SETUP)
    for title, price, status in (("Flow", 20, "scheduled"), ("Flow", 20, "scheduled"), ("Held", 90, "draft")):
        LiveClass.objects.create(
            title=title, instructor=owner, pricing_type="paid", price=price, status=status, scheduled_at=_local(2)
        )
    assert event.suggest_price(draft).amount == 20
    assert event.suggest_price(draft).reason.startswith("Flow sells for")
    zoom = ZoomClass.objects.create(title="Z", instructor=owner)
    assert event.price_tiles(None, zoom)["options"] == [{"value": "free", "label": event.ZOOM_FREE, "hint": ""}]
    stream = LiveStream.objects.create(title="S", instructor=owner)  # no membership; her /setup price, 12
    assert [o["value"] for o in event.price_tiles(None, stream)["options"]] == ["free", "paid:12"]
    assert event.price_tiles(None, draft) is None  # live: the shared tiles, memberships too


def test_the_record_is_found_by_its_ref(owner):
    row = LiveClass.objects.create(title="By hand", instructor=owner)
    assert event.record(row.pk * 10 + 1) == row
    assert event.record(row.pk * 10 + 3) is None  # no Zoom class with that pk
    assert event.payload(row)["kind"] == "live"
    assert "event" in kinds.KINDS


# ── Carry-forward (task B4): drafting once, where is hers, her words exactly ──


def _copies():
    return CopilotRun.objects.filter(request__job="copy").count()


def _off():
    return mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=False)


def test_the_copy_starts_once_and_a_later_answer_never_restarts_it(owner):
    creation = flow.answer(flow.answer(_started(owner), "where", value="live"), "when", value=_once(3))
    assert _copies() == 1 and creation.runs["copy"]
    creation = flow.answer(creation, "review", value="ok")
    creation.answers = {**creation.answers, "cover": "later"}
    creation.save()
    with _off(), mock.patch("apps.core.focus.flow.followup_allowed", return_value=True):
        creation = flow.answer(creation, "access", text="free")  # typed: read, then the flow goes on
    assert creation.answers["access"] == "free" and flow.current_field(creation) == "finish"
    assert _copies() == 1 and not creation.brief.get("thinking")  # nor the draft's follow-up after its review


def test_looks_good_answers_the_review_without_the_courses_line(owner):
    creation = flow.answer(flow.answer(_started(owner), "where", value="live"), "when", value=_once(3))
    creation = flow.answer(creation, "review", value="ok")
    assert creation.answers["review"] == "ok" and flow.current_field(creation) == "cover"
    assert "descriptions" not in creation.runs and event.REVIEWED_LINE is None
    creation.chat.refresh_from_db()
    assert creation.chat.entries[-1]["text"] == "Looks good, continue"
    course = flow.answer(flow.start(owner, "course", value="A course on desk yoga"), "level", rest=True)
    course = flow.answer(course, "outline_review", value="ok")
    course.chat.refresh_from_db()
    assert course.chat.entries[-1]["text"] == kinds.get("course").REVIEWED_LINE


def test_her_words_at_the_review_redraft_the_copy_when_the_reading_fails(owner):
    creation = flow.answer(flow.answer(_started(owner), "where", value="live"), "when", value=_once(3))
    first = creation.runs["copy"]
    with _off():
        creation = flow.answer(creation, "review", text="make it warmer")
    assert "review" not in creation.answers and flow.current_field(creation) == "review"
    run = CopilotRun.objects.get(pk=creation.runs["copy"])
    assert run.pk != first and run.request["instruction"] == "make it warmer"


def test_a_typed_answer_after_the_draft_is_read_as_a_change_without_a_course_id(owner):
    creation = flow.answer(flow.answer(_started(owner), "where", value="live"), "when", value=_once(3))
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True):
        creation = flow.answer(creation, "review", text="warmer")
    found = event.EventFound(answer="warmer", change="warmer")
    with (
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.focus.analysis.read", return_value=found) as read,
    ):
        jobs.execute(SCHEMA, creation.pending["run"])
    assert read.call_args.kwargs["course_id"] is None and read.call_args.kwargs["outline_exists"] is True
    creation.refresh_from_db()
    assert CopilotRun.objects.get(pk=creation.runs["copy"]).request["instruction"] == "warmer"


def test_the_follow_up_before_the_copy_is_the_events_own(owner, tenant_ctx):
    for kind, line in (
        ("course", "'outline' (the course outline: title, description, modules and lessons)"),
        ("event", "'copy' (the class copy: title and description)"),
    ):
        assert line in followup.system_for(kind)
    assert "modules" not in followup.system_for("event")
    assert (followup.label("course"), followup.label("event")) == (
        "Thinking about your course",
        "Thinking about your class",
    )
    creation = flow.answer(_started(owner), "where", value="live")
    with mock.patch("apps.core.focus.flow.followup_allowed", return_value=True):
        creation = flow.answer(creation, "when", value=_once(3))
    thinking = creation.brief["thinking"]
    run = CopilotRun.objects.get(pk=thinking["run"])
    assert (thinking["slot"], run.request["slot"], run.specialist) == ("copy", "copy", "content")
    assert flow.state(creation)["thinking"]["specialist"] == "content" and "copy" not in (creation.runs or {})
    with (
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.focus.followup.ai_compose.record_spend"),
        mock.patch("apps.core.focus.outline.site", return_value={}) as site,
        mock.patch(
            "apps.core.focus.followup.core_ai.structured",
            return_value=(followup.FollowUp(needed=False), 0, "x"),
        ),
    ):
        jobs.execute(SCHEMA, run.id)
    site.assert_called_once_with(tenant_ctx, None)
    assert run.events.first().data["label"] == "Thinking about your class"
    creation.refresh_from_db()
    assert creation.runs["copy"] and creation.brief["settled"] == ["copy"]


def test_just_draft_it_before_the_kind_is_known_stops_at_where(owner):
    creation = flow.start(owner, "event", value="A class on morning breath", rest=True)
    assert creation.record_id is None and "where" not in creation.answers
    asked = flow.state(creation)["question"]
    assert (asked["field"], asked["question"], asked["can_delegate"]) == ("where", "Where will it happen?", False)
    assert "where" not in flow.answer(creation, "where", delegate=True).answers  # "You decide" is refused
    assert "where" not in flow.answer(creation, "where", rest=True).answers  # and "Just draft it" again
    assert event._where(flow.DELEGATE) is None
    creation = flow.answer(creation, "where", value="stream")
    assert "when" not in creation.answers and "place" not in creation.answers
    assert flow.current_field(creation) == "when" and "copy" not in (creation.runs or {})


def test_just_draft_it_with_the_kind_known_stops_at_when(owner):
    creation = flow.answer(_started(owner), "where", value="onsite", rest=True)
    asked = flow.state(creation)["question"]
    assert (asked["field"], asked["question"], asked["can_delegate"]) == ("when", "When is it?", False)
    assert "when" not in flow.answer(creation, "when", delegate=True).answers  # "You decide" is refused
    assert "when" not in flow.answer(creation, "when", rest=True).answers
    creation = flow.answer(creation, "when", value=_once(3))
    assert flow.current_field(creation) == "place"  # the address too: "Add it later" is hers to tap
    creation = flow.answer(creation, "place", value="later")
    assert flow.current_field(creation) == "review" and creation.runs["copy"]
    assert creation.answers["access"] == flow.DELEGATE  # the price step stays delegated (free)


def test_a_zoom_place_that_is_no_link_is_asked_again_when_the_model_is_off(owner):
    creation = flow.answer(flow.answer(_started(owner), "where", value="zoom"), "when", value=_once(3))
    with _off():
        creation = flow.answer(creation, "place", text="zoom.us/j/123")
    assert "place" not in creation.answers and flow.current_field(creation) == "place"
    assert "place" not in creation.drafted["event"] and _row(creation).zoom_link == ""


def test_a_live_class_never_records_a_place(owner):
    creation = _typed(owner, "breath, at Moda Cd. 12", event.EventFound(topic="breath", address="Moda Cd. 12"))
    assert creation.answers["place"] == "Moda Cd. 12" and creation.record_id is None
    creation = flow.answer(creation, "where", value="live")
    assert "place" not in creation.answers and "place" not in (creation.drafted or {}).get("event", {})


def test_a_capacity_past_the_cap_is_dropped(owner):
    creation = _started(owner)
    event.apply_found(creation, event.EventFound(capacity=10**12))  # max_capacity would overflow
    assert "capacity" not in creation.brief
    event.apply_found(creation, event.EventFound(capacity=event.MAX_CAPACITY))
    assert creation.brief["capacity"] == 10_000


def test_the_plain_forms_timing_stamp_is_the_events_own_ref(owner):
    """The plain event form sends the row's pk and its kind; the stamp holds the ref."""
    from apps.tenant_config.models import FocusCreation

    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=owner)
    LiveStream.objects.create(title="Someone's stream", instructor=owner)  # what pk 12 read as a ref would be
    row = OnsiteEvent.objects.create(title="By hand", instructor=owner)
    body = {"kind": "event", "event_kind": "onsite", "record_id": row.pk, "active_ms": 9}
    assert client.post("/api/v1/admin/focus/form-timing/", body, format="json").status_code == 201
    stamp = FocusCreation.objects.get(mode="form")
    assert (stamp.kind, stamp.record_id) == ("event", event.ref_for("onsite", row.pk))
    assert event.record(stamp.record_id) == row
    for bad in ({**body, "event_kind": "live"}, {**body, "event_kind": "nope"}, {**body, "event_kind": None}):
        assert client.post("/api/v1/admin/focus/form-timing/", bad, format="json").status_code == 404
