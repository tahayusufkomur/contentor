"""A message to her students in focus mode (apps.core.focus.kinds.message):
its draft is an Announcement held as a draft, who gets it is a question with
student counts (G14), when it goes out is now, the next 10:00 or her time
(G15), and nothing is sent without her Send tap, and only once. The send
itself is apps.notifications' fan-out, patched here."""

from datetime import datetime, timedelta
from decimal import Decimal
from unittest import mock
from zoneinfo import ZoneInfo

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import Bundle
from apps.core import tasks
from apps.core.focus import copywriter, flow, jobs
from apps.core.focus.kinds import message
from apps.courses.models import Course
from apps.notifications.models import Announcement
from apps.notifications.recurrence import next_send_time
from apps.tenant_config.models import CopilotRun, TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)

SCHEMA = "shared_test"
ZONE = "Europe/Istanbul"
TOPIC = "Tell them class moves to 7pm on Friday"


@pytest.fixture()
def owner(tenant_ctx):
    config = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Studio")
    config.timezone = ZONE
    config.save(update_fields=["timezone"])
    return User.objects.create_user(
        email="focus-message@x.com",
        name="Owner",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture()
def students(owner):
    return [
        User.objects.create_user(email=f"student{i}@x.com", name=f"S{i}", password="x", role="student")  # noqa: S106
        for i in range(3)
    ]


@pytest.fixture(autouse=True)
def on(settings):
    settings.FOCUS_KINDS = ["course", "event", "message"]
    with mock.patch.object(tasks.run_focus_job, "delay"):
        yield


@pytest.fixture()
def fanout():
    with mock.patch("apps.notifications.tasks.fanout_announcement.delay") as delay:
        yield delay


def _local(days: int, hour: int) -> datetime:
    """A wall-clock time in her zone, ``days`` from today."""
    now = timezone.now().astimezone(ZoneInfo(ZONE))
    return (now + timedelta(days=days)).replace(hour=hour, minute=0, second=0, microsecond=0)


def _iso(at: datetime) -> str:
    return f"{at:%Y-%m-%dT%H:%M}"


def _said(at: datetime) -> str:
    return f"{at:%A} {at.day} {at:%B} at {at:%H:%M}"


def _course(owner, title="Desk Yoga", *, paid=False):
    return Course.objects.create(
        title=title,
        slug=title.lower().replace(" ", "-"),
        instructor=owner,
        is_published=True,
        pricing_type="paid" if paid else "free",
        price=Decimal("49") if paid else 0,
    )


def _typed(owner, text, found):
    """Her typed first answer, read by the analysis as ``found`` (the model patched)."""
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True):
        creation = flow.start(owner, "message", text=text)
    return _read(creation, found)


def _typed_at(creation, field, text, found):
    """Her words at ``field``, read by the analysis as ``found``."""
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True):
        creation = flow.answer(creation, field, text=text)
    return _read(creation, found)


def _read(creation, found):
    with (
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.focus.analysis.read", return_value=found),
        mock.patch("apps.core.focus.flow.followup_allowed", return_value=False),
    ):
        jobs.execute(SCHEMA, creation.pending["run"])
    creation.refresh_from_db()
    return creation


def _write(creation, title="Class moves to 7pm", body="Friday's class starts at 7pm. See you there!"):
    """The Community manager's copy run, the model patched."""
    copy = copywriter.output_for("message")(title=title, body=body)
    with (
        mock.patch("apps.core.focus.copywriter.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.focus.copywriter.ai_compose.record_spend"),
        mock.patch("apps.core.focus.copywriter.core_ai.structured", return_value=(copy, Decimal("0"), "x")),
    ):
        jobs.execute(SCHEMA, creation.runs["copy"])


def _at_review(owner, audience="all", *, written=True):
    """At the review, its copy run queued; with ``written``, done."""
    creation = flow.answer(flow.start(owner, "message", value=TOPIC), "audience", value=audience)
    assert flow.current_field(creation) == "review"
    if written:
        _write(creation)
    return creation


def _at_finish(owner, audience="all", when="now"):
    """A message to ``audience`` answered up to the finish step; ``when`` a tile's value."""
    creation = _at_review(owner, audience)
    creation.answers = {**creation.answers, "review": "ok"}
    creation.save()
    creation = flow.answer(creation, "when", value=when)
    assert flow.current_field(creation) == "finish"
    return creation


def _row(creation):
    return Announcement.objects.get(pk=creation.record_id)


def _closing(creation):
    creation.chat.refresh_from_db()
    return creation.chat.entries[-1]["text"]


# ── The brief's tests ───────────────────────────────────────────────────────


def test_a_first_answer_with_everything_skips_audience_and_when(owner, students):
    course = _course(owner)
    at = _local(1, 9)
    found = message.MessageFound(topic="class moves to 7pm", audience="desk yoga", when=_iso(at), also_email=True)
    creation = _typed(owner, "Tell them class moves to 7pm, Desk Yoga students, tomorrow at 9, by email too", found)
    assert flow.current_field(creation) == "review"
    assert creation.answers["audience"] == f"course:{course.pk}"
    assert creation.answers["when"] == _iso(at)
    assert creation.runs["copy"]  # the Community manager writes it now
    row = _row(creation)
    assert (row.title, row.status, row.created_by_id) == ("Class moves to 7pm", "draft", owner.id)
    body = flow.state(creation)
    assert body["record"] == {
        "id": row.pk,
        "kind": "message",
        "title": "Class moves to 7pm",
        "path": f"/admin/messages/new?draft={row.pk}",
    }
    answered = {a["field"]: a["label"] for a in body["answered"]}
    assert answered["audience"] == "Students of Desk Yoga"
    assert answered["when"] == _said(at)
    creation.answers = {**creation.answers, "review": "ok"}
    assert flow.question("message", "finish", creation)["tick"] is True  # "by email too"


def test_send_twice_sends_once(owner, students, fanout):
    creation = flow.finish(_at_finish(owner), publish=True, announce=True)
    flow.finish(creation, publish=True)  # a double tap, a second tab
    message.go_live(creation.record_id)  # the adapter reached again: it is no longer a draft
    row = _row(creation)
    assert (row.status, row.filters_json, row.also_email) == ("scheduled", {}, True)
    assert row.scheduled_at <= timezone.now()
    fanout.assert_called_once_with(row.pk, SCHEMA)
    creation.refresh_from_db()
    assert (creation.status, creation.answers["finish"]) == ("done", "send")
    assert _closing(creation) == "Sent."
    assert "announce" not in (creation.runs or {})  # no Marketing draft: the tick was the email


@pytest.mark.parametrize("paid_course", [False, True])
def test_an_empty_audience_offers_only_keep_as_a_draft(owner, fanout, paid_course):
    if paid_course:  # students, but none of them bought it
        User.objects.create_user(email="s@x.com", name="S", password="x", role="student")  # noqa: S106
        audience = f"course:{_course(owner, paid=True).pk}"
    else:  # no students at all
        audience = "all"
    creation = _at_finish(owner, audience)
    asked = flow.state(creation)["question"]
    assert [o["value"] for o in asked["options"]] == ["draft"]
    assert asked["why"].startswith("Nobody would receive it yet.")
    creation = flow.finish(creation, publish=True)
    assert creation.answers["finish"] == "draft"
    assert _row(creation).status == "draft"
    fanout.assert_not_called()


def test_a_scheduled_message_goes_out_at_her_time_not_now(owner, students, fanout):
    creation = _at_review(owner)
    creation.answers = {**creation.answers, "review": "ok"}
    creation.save()
    asked = flow.state(creation)["question"]
    nxt = next_send_time(timezone.now(), ZoneInfo(ZONE))
    assert [(o["value"], o["label"]) for o in asked["options"]] == [("now", "Now"), ("next", _said(nxt))]
    at = _local(2, 18)
    creation = _typed_at(creation, "when", "Friday at 6pm", message.MessageFound(when=_iso(at)))
    assert flow.current_field(creation) == "finish"
    creation = flow.finish(creation, publish=True)
    row = _row(creation)
    assert (row.status, row.scheduled_at) == ("scheduled", at)
    fanout.assert_not_called()  # the per-minute dispatcher sends it when due, not before
    assert not Announcement.objects.filter(status="scheduled", scheduled_at__lte=timezone.now()).exists()
    assert _closing(creation) == f"Scheduled for {_said(at)}."
    # Her time passes while she is at the finish step: never sent at once, and she is told where to send it.
    creation = _at_review(owner)
    creation.answers = {**creation.answers, "review": "ok", "when": _iso(_local(-1, 9))}
    creation.save()
    assert message.not_ready(_row(creation)) == message.PASSED
    asked = flow.state(creation)["question"]
    assert [o["value"] for o in asked["options"]] == ["draft"]
    assert asked["why"].startswith("That time has passed. Keep it as a draft and send it from Messages.")
    assert asked["specialist"] == "community"  # who writes it says what it needs


def test_a_time_already_past_or_impossible_is_asked_again(owner, students):
    creation = _at_review(owner)
    creation.answers = {**creation.answers, "review": "ok"}
    creation.save()
    for when in (_iso(_local(0, 0) - timedelta(minutes=1)), "2026-11-31T10:00", "2026-13-01T10:00"):
        creation = _typed_at(creation, "when", "today at midnight", message.MessageFound(when=when))
        assert "when" not in creation.answers, when
        assert flow.state(creation)["question"]["field"] == "when"  # a 500 never: asked again
    # A model-written clarify option with an impossible day is no answer either.
    assert message.apply_clarified(creation, "when", "2026-02-30T10:00") is False
    assert "when" not in creation.answers
    creation = _typed_at(creation, "when", "Friday at 6pm", message.MessageFound(when=_iso(_local(2, 18))))
    assert flow.current_field(creation) == "finish"


def test_an_empty_message_is_never_sent(owner, students, fanout):
    creation = _at_review(owner, written=False)  # the copy is still being written
    creation.answers = {**creation.answers, "review": "ok", "when": "now"}
    creation.save()
    assert message.not_ready(_row(creation)) == "Your message is still being written"
    assert [o["value"] for o in flow.state(creation)["question"]["options"]] == ["draft"]
    creation = flow.finish(creation, publish=True)  # Send from a stale screen: the run is stopped, nothing written
    assert (creation.answers["finish"], _row(creation).status) == ("draft", "draft")
    fanout.assert_not_called()
    # A body with no words (the run wrote none, or she cleared it): Keep only.
    creation = _at_finish(owner)
    Announcement.objects.filter(pk=creation.record_id).update(body="<p> &nbsp;</p>")
    assert message.not_ready(_row(creation)) == "Write your message first"
    assert [o["value"] for o in flow.state(creation)["question"]["options"]] == ["draft"]


def test_the_next_ten_oclock_is_reckoned_at_her_send_tap(owner, students, fanout):
    creation = flow.finish(_at_finish(owner, when="next"), publish=True)
    row = _row(creation)
    assert row.status == "scheduled"
    assert row.scheduled_at == next_send_time(timezone.now(), ZoneInfo(ZONE))
    fanout.assert_not_called()


def test_a_link_she_named_points_at_that_course(owner, students):
    course = _course(owner)
    found = message.MessageFound(topic="new lessons are up", link_to="desk yoga")
    creation = _typed(owner, "Tell them new lessons are up in desk yoga, link it", found)
    row = _row(creation)
    assert row.link == f"/courses/{course.slug}"
    assert message.copy_facts(creation, row)["link_to"] == "Desk Yoga"
    # Her own link is never replaced by a later answer.
    Announcement.objects.filter(pk=row.pk).update(link="https://example.com/mine")
    _course(owner, "Chair Yoga")
    message.apply_found(creation, message.MessageFound(link_to="Chair Yoga"))
    assert _row(creation).link == "https://example.com/mine"
    # A title that is none of hers links nothing.
    other = _typed(owner, "Tell them hi, link the retreat", message.MessageFound(topic="hi", link_to="The retreat"))
    assert _row(other).link == ""


def test_keep_as_a_draft_never_sends(owner, students, fanout):
    creation = flow.finish(_at_finish(owner, when="next"), publish=False, announce=True)
    row = _row(creation)
    assert (row.status, row.scheduled_at, row.also_email) == ("draft", None, False)
    fanout.assert_not_called()
    assert (creation.status, creation.answers["finish"]) == ("done", "draft")
    assert _closing(creation) == "Saved as a draft in Messages."


# ── Who gets it (G14) ───────────────────────────────────────────────────────


def test_the_audience_tiles_show_how_many_students(owner, students):
    free = _course(owner)  # free: every student can see it
    paid = _course(owner, "Advanced", paid=True)
    bundle = Bundle.objects.create(name="Everything", price=Decimal("99"))
    creation = flow.start(owner, "message", value=TOPIC)
    asked = flow.state(creation)["question"]
    assert (asked["field"], asked["can_delegate"]) == ("audience", True)
    assert asked["options"] == [
        {"value": "all", "label": "All my students (3 students)", "hint": ""},
        {"value": f"course:{paid.pk}", "label": "Students of Advanced", "hint": "0 students"},
        {"value": f"course:{free.pk}", "label": "Students of Desk Yoga", "hint": "3 students"},
        {"value": f"bundle:{bundle.pk}", "label": "Students of Everything", "hint": "0 students"},
    ]
    flow.answer(creation, "audience", value="course:999999")  # none of hers: asked again
    creation.refresh_from_db()
    assert flow.current_field(creation) == "audience"
    creation = flow.answer(creation, "audience", value=f"bundle:{bundle.pk}")
    assert {"field": "audience", "label": "Students of Everything"} in flow.state(creation)["answered"]
    # "You decide" is all of them.
    decided = flow.answer(flow.start(owner, "message", value=TOPIC), "audience", delegate=True)
    _write(decided)
    decided.answers = {**decided.answers, "review": "ok", "when": "now"}
    decided.save()
    with mock.patch("apps.notifications.tasks.fanout_announcement.delay"):
        flow.finish(decided, publish=True)
    assert (_row(decided).status, _row(decided).filters_json) == ("scheduled", {})


def test_students_of_one_course_get_it(owner, students, fanout):
    course = _course(owner)
    creation = flow.finish(_at_finish(owner, f"course:{course.pk}"), publish=True, announce=False)
    row = _row(creation)
    assert row.filters_json == {"content_type": "course", "content_id": course.pk}
    assert row.also_email is False


# ── Carried over from earlier reviews ───────────────────────────────────────


def test_the_models_body_is_escaped_and_sanitized_before_the_event_and_the_row(owner, students):
    creation = _at_review(owner, written=False)
    body = (
        'Hi all.<script>alert(1)</script> &lt;img src=x onerror=alert(2)&gt;\n\nSee <img src=x onerror="alert(3)"> you'
    )
    _write(creation, body=body)
    stored = _row(creation).body
    events = [e.data for e in CopilotRun.objects.get(pk=creation.runs["copy"]).events.filter(type="field")]
    assert {e["record"] for e in events} == {f"message:{creation.record_id}"}
    sent = {e["name"]: e["value"] for e in events}
    assert sent["body"] == stored  # what the page types in is what is kept
    assert stored.startswith("<p>Hi all.") and stored.count("<p>") == 2
    for markup in ("<script", "<img"):
        assert markup not in stored
    assert sent["title"] == _row(creation).title == "Class moves to 7pm"


def test_a_price_in_her_words_never_lands_on_a_message(owner, students):
    found = message.MessageFound(topic="the workshop is on", price="49")
    creation = _typed(owner, "Tell them the workshop is on, 49 lira", found)
    assert "price" not in creation.answers and "access" not in creation.answers
    assert all(a["field"] != "price" for a in flow.state(creation)["answered"])
    flow._set_price(creation, "49")  # any other way in: nothing, and no crash
    assert "price" not in creation.answers


def test_form_timing_checks_who_wrote_the_message(owner):
    from apps.tenant_config.models import FocusCreation

    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=owner)
    url = "/api/v1/admin/focus/form-timing/"
    mine = Announcement.objects.create(title="Hi", status="draft", created_by=owner)
    other = User.objects.create_user(email="other@x.com", name="O", password="x", role="owner")  # noqa: S106
    theirs = Announcement.objects.create(title="Hi", status="draft", created_by=other)
    assert client.post(url, {"kind": "message", "record_id": mine.pk, "active_ms": 9}, format="json").status_code == 201
    assert FocusCreation.objects.get(mode="form").kind == "message"
    assert client.post(url, {"kind": "message", "record_id": theirs.pk}, format="json").status_code == 404


def test_a_message_always_starts_from_her_words(owner):
    for answer in ({"delegate": True}, {"rest": True}):
        with pytest.raises(flow.FlowError, match="no_answer"):
            flow.start(owner, "message", **answer)
    assert not Announcement.objects.exists()


def test_no_designer_follow_up_after_the_review(owner, students):
    creation = _at_review(owner)
    with (
        mock.patch("apps.core.focus.flow.followup_allowed", return_value=True),
        mock.patch("apps.core.focus.followup.start") as start,
    ):
        creation = flow.answer(creation, "review", value="ok")
    start.assert_not_called()  # no cover to ask about
    assert flow.current_field(creation) == "when"


def test_the_finish_response_says_when_it_goes_out(owner, students, fanout):
    """The guide's toast after Send: "Sent." or when it is scheduled for, never "Published"."""
    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=owner)

    def send(creation):
        return client.post(f"/api/v1/admin/focus/{creation.pk}/finish/", {"publish": True}, format="json").json()

    assert send(_at_finish(owner))["closing"] == "Sent."
    later = _at_finish(owner, when="next")
    at = next_send_time(timezone.now(), ZoneInfo(ZONE))
    assert send(later)["closing"] == f"Scheduled for {_said(at)}."
