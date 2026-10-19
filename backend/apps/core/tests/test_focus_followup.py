"""Follow-ups (spec §5 Follow-ups, F4): between the must-ask questions the
specialist may ask one question specific to her course, only when the next
draft would otherwise have to guess. A model job decides and writes it; the
caps live in code (flow.followup_allowed). The model call is patched and the
outline job stubbed; the job runs in the test."""

import json
from decimal import Decimal
from unittest import mock

import pytest
from django.db import connection

from apps.accounts.models import User
from apps.core import ai as core_ai
from apps.core import tasks
from apps.core.copilot import runs
from apps.core.focus import covers, flow, followup, jobs, outline
from apps.core.focus.kinds.course import CourseFound
from apps.courses.models import Course
from apps.tenant_config.models import CopilotRun

pytestmark = pytest.mark.django_db(transaction=True)

SCHEMA = "shared_test"
WHERE = followup.FollowUp(needed=True, question="Where do your students practise?", options=["Office", "Home", "Both"])
NONE = followup.FollowUp(needed=False)


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="followup-owner@x.com",
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
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.onboarding.ai_compose.record_spend"),
    ):
        yield


@pytest.fixture(autouse=True)
def outline_start():
    def fake(creation, instruction=""):
        run = CopilotRun.objects.create(actor=creation.actor, chat=creation.chat, specialist="content")
        creation.outline_run = run
        creation.save(update_fields=["outline_run"])
        return run

    with mock.patch("apps.core.focus.outline.start", side_effect=fake) as stub:
        yield stub


def _model(*found, side_effect=None):
    """The follow-up model, answering ``found`` in turn."""
    effect = side_effect or [(f, Decimal("0"), "x") for f in found]
    return mock.patch("apps.core.focus.followup.core_ai.structured", side_effect=effect)


def _asked(owner):
    """Topic, level and size tapped: the outline waits on a follow-up job."""
    creation = flow.answer(flow.start(owner, "course", value="Desk yoga"), "level", value="beginners")
    return flow.answer(creation, "size", value="short")


def _run(creation):
    jobs.execute(SCHEMA, creation.runs["followup"])
    creation.refresh_from_db()
    return creation


def test_no_follow_up_when_it_is_not_needed(owner, outline_start):
    creation = _asked(owner)
    assert outline_start.call_count == 0
    body = flow.state(creation)
    assert body["question"] is None
    assert body["thinking"]["status"] == "building" and body["thinking"]["run"] == creation.runs["followup"]
    assert CopilotRun.objects.get(pk=creation.runs["followup"]).specialist == "content"
    assert flow.answer(creation, "outline_review", value="ok").answers.get("outline_review") is None
    with _model(NONE):
        creation = _run(creation)
    assert outline_start.call_count == 1
    assert flow.current_field(creation) == "outline_review"
    assert flow.state(creation)["thinking"] is None
    assert not creation.brief.get("followups")


def test_an_outline_shaping_follow_up_comes_before_the_outline(owner, outline_start):
    creation = _asked(owner)
    with _model(WHERE) as model:
        creation = _run(creation)
    assert model.call_args.kwargs["label"] == "contentor:copilot"
    assert outline_start.call_count == 0
    assert flow.current_field(creation) == "followup"
    assert flow.state(creation)["question"] == {
        "field": "followup",
        "kind": "choice",
        "question": "Where do your students practise?",
        "why": "",
        "options": [{"value": o, "label": o, "hint": ""} for o in ("Office", "Home", "Both")],
        "starter": None,
        "can_delegate": True,
        "specialist": "content",
    }
    assert flow.answer(creation, "followup", value="Garden").brief.get("followups") is None  # not one of hers
    creation = flow.answer(creation, "followup", value="Office")
    assert creation.brief["followups"] == [
        {"question": "Where do your students practise?", "answer": "Office", "slot": "outline"}
    ]
    assert not creation.brief.get("followup")
    assert outline_start.call_count == 0  # a second may still be asked
    with _model(NONE):
        creation = _run(creation)
    assert outline_start.call_count == 1
    creation.chat.refresh_from_db()
    assert {"role": "coach", "text": "Office"} in creation.chat.entries


def test_typed_words_or_you_decide_answer_it_without_an_analysis(owner, outline_start):
    creation = _asked(owner)
    with _model(WHERE):
        creation = _run(creation)
    creation = flow.answer(creation, "followup", text="At the office desk, mostly")
    assert creation.brief["followups"][0]["answer"] == "At the office desk, mostly"
    assert not creation.pending and "analysis" not in creation.runs
    with _model(WHERE):
        creation = _run(creation)
    creation = flow.answer(creation, "followup", delegate=True)
    assert creation.brief["followups"][1]["answer"] == "You decide"
    assert outline_start.call_count == 1  # two asked: the outline starts


def test_at_most_two_before_the_outline_and_four_in_all(owner, outline_start):
    creation = _asked(owner)
    for answer in ("Office", "Home"):
        with _model(WHERE):
            creation = _run(creation)
        creation = flow.answer(creation, "followup", value=answer)
    assert outline_start.call_count == 1
    assert len(creation.brief["followups"]) == 2
    assert not flow.followup_allowed(creation, "outline")
    assert flow.followup_allowed(creation, "later")
    entry = {"question": "q", "answer": "a", "slot": "later"}
    creation.brief = {**creation.brief, "followups": [creation.brief["followups"][0], entry, entry, entry]}
    assert not flow.followup_allowed(creation, "later") and not flow.followup_allowed(creation, "outline")


def test_a_later_follow_up_comes_between_the_review_and_the_cover(owner, outline_start):
    creation = _asked(owner)
    with _model(NONE):
        creation = _run(creation)
    creation = flow.answer(creation, "outline_review", value="ok")
    assert flow.current_field(creation) is None
    assert CopilotRun.objects.get(pk=creation.runs["followup"]).specialist == "designer"
    later = followup.FollowUp(needed=True, question="Calm or energetic?", options=["Calm", "Energetic"])
    with _model(later):
        creation = _run(creation)
    assert flow.state(creation)["question"]["specialist"] == "designer"
    creation = flow.answer(creation, "followup", value="Calm")
    assert flow.current_field(creation) == "cover"
    assert outline_start.call_count == 1  # never a redraft
    assert creation.brief["followups"][-1]["slot"] == "later"


def _reviewing(owner):
    """No follow-up before the outline; the outline started, at its review."""
    creation = _asked(owner)
    with _model(NONE):
        return _run(creation)


LATER = followup.FollowUp(needed=True, question="Calm or energetic?", options=["Calm", "Energetic"])


def test_a_typed_answer_that_settles_the_rest_gets_its_follow_up_after_the_reading(owner, outline_start):
    found = CourseFound(topic="desk yoga", level="beginners", modules=4, lessons=3)
    with _model(found, WHERE):
        creation = flow.start(owner, "course", text="Desk yoga for complete beginners, 4 modules of 3 lessons")
        jobs.execute(SCHEMA, creation.runs["analysis"])
        creation.refresh_from_db()
        assert "followup" in creation.runs and outline_start.call_count == 0
        creation = _run(creation)
    assert flow.current_field(creation) == "followup"


def test_a_failed_or_stopped_later_follow_up_moves_on_to_the_cover(owner, outline_start):
    creation = flow.answer(_reviewing(owner), "outline_review", value="ok")
    with _model(side_effect=core_ai.AiError("down")):
        creation = _run(creation)
    assert flow.current_field(creation) == "cover"

    other = flow.answer(_reviewing(owner), "outline_review", value="ok")
    runs.stop(other.runs["followup"])
    assert flow.state(other)["question"]["field"] == "cover"
    assert outline_start.call_count == 2  # one outline each, never a second


def test_a_pruned_outline_run_is_never_drafted_again(owner, outline_start):
    creation = _reviewing(owner)
    CopilotRun.objects.filter(pk=creation.outline_run_id).delete()  # pruned after 14 days
    creation.refresh_from_db()
    assert creation.outline_run_id is None
    creation.drafted = {"modules": [{"id": 1}]}
    creation.save()
    creation = flow.answer(creation, "outline_review", value="ok")
    with _model(NONE):
        creation = _run(creation)
    assert flow.current_field(creation) == "cover"
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=False):
        creation = flow.answer(creation, "cover", text="hands on a keyboard")  # read at once: apply()
    assert creation.covers["query"] == "hands on a keyboard"
    assert outline_start.call_count == 1


def _at_later(owner):
    """At the Designer's follow-up, with a round of covers drafted ahead."""
    creation = _reviewing(owner)
    ahead = covers.start(creation, ahead=True)
    creation = flow.answer(creation, "outline_review", value="ok")
    with _model(LATER):
        creation = _run(creation)
    assert flow.current_field(creation) == "followup"
    return creation, ahead


def test_a_later_answer_draws_a_fresh_cover_round_that_reads_it(owner, outline_start):
    creation, ahead = _at_later(owner)
    creation = flow.answer(creation, "followup", value="Calm")
    ahead.refresh_from_db()
    assert ahead.status == "stopped"
    fresh = CopilotRun.objects.get(pk=creation.runs["covers"])
    assert fresh.pk != ahead.pk and fresh.request["ahead"] is False
    plan = covers.CoverPlan(photo_query="desk", styles=[])
    with mock.patch("apps.core.focus.covers.core_ai.structured", return_value=(plan, Decimal("0"), "x")) as model:
        covers._plan(connection.tenant, creation, Course.objects.get(pk=creation.record_id), [], "contentor:copilot")
    turn = json.loads(model.call_args.kwargs["user"])
    assert turn["followups"][-1] == {"question": "Calm or energetic?", "answer": "Calm", "slot": "later"}


def test_you_decide_at_a_later_follow_up_keeps_the_round_drafted_ahead(owner, outline_start):
    creation, ahead = _at_later(owner)
    creation = flow.answer(creation, "followup", delegate=True)
    assert creation.runs["covers"] == ahead.pk
    ahead.refresh_from_db()
    assert ahead.status == "queued"
    assert flow.current_field(creation) == "cover"


def test_just_draft_it_skips_the_follow_ups(owner, outline_start):
    creation = flow.answer(flow.start(owner, "course", value="Desk yoga"), "level", rest=True)
    assert outline_start.call_count == 1 and "followup" not in (creation.runs or {})
    creation = flow.answer(creation, "outline_review", value="ok")
    assert "followup" not in (creation.runs or {})
    assert flow.current_field(creation) == "cover"


def test_a_failed_follow_up_is_dropped_and_the_flow_goes_on(owner, outline_start):
    creation = _asked(owner)
    with _model(side_effect=core_ai.AiError("down")):
        creation = _run(creation)
    assert outline_start.call_count == 1
    assert flow.current_field(creation) == "outline_review"
    assert CopilotRun.objects.get(pk=creation.runs["followup"]).status == "failed"


def test_a_stopped_follow_up_settles_on_the_next_read(owner, outline_start):
    creation = _asked(owner)
    runs.stop(creation.runs["followup"])
    assert flow.state(creation)["question"]["field"] == "outline_review"
    assert outline_start.call_count == 1


def test_no_model_no_follow_up(owner, outline_start):
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=False):
        creation = _asked(owner)
    assert outline_start.call_count == 1 and "followup" not in (creation.runs or {})


def test_her_follow_up_answers_reach_the_outline_prompt(owner):
    creation = flow.start(owner, "course", value="Desk yoga")
    asked = [{"question": "Where do your students practise?", "answer": "Office", "slot": "outline"}]
    turn = json.loads(
        outline._user_turn(
            connection.tenant, creation.answers, Course.objects.get(pk=creation.record_id), "", [], {"followups": asked}
        )
    )
    assert turn["followups"] == asked
