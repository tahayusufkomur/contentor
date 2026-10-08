"""The /setup interview turn: extraction, the code safety net, fallback,
spoken-text correction, edit requests, and the read model."""

from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import Tenant
from apps.tenant_config import interview
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db
URL = "/api/v1/admin/setup-flow/turn/"


@pytest.fixture()
def config(tenant_ctx):
    Tenant.objects.filter(pk=tenant_ctx.pk).update(wizard_state={"flow": "interview", "answers": {}})
    tenant_ctx.refresh_from_db()
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Glow")
    cfg.setup_flow = {
        "status": "active",
        "interview": {"turns": [], "fired": []},
        "draft_status": {},
        "page_builds": {},
    }
    cfg.save()
    return cfg


@pytest.fixture()
def client(tenant_ctx, config):
    coach = User.objects.create_user(email="c@iv.test", name="C", password="x", role="owner", is_staff=True)  # noqa: S106
    c = APIClient(HTTP_HOST="shared-test.localhost")
    c.force_authenticate(user=coach)
    return c


@pytest.fixture()
def quiet():
    """No milestones side effects; AI available with a scripted reply."""
    holder = SimpleNamespace(reply=None, error=None, calls=[])

    def fake(**kwargs):
        holder.calls.append(kwargs)
        if holder.error:
            raise holder.error
        return holder.reply, Decimal("0"), "m"

    with (
        mock.patch("apps.tenant_config.interview_milestones.fire", return_value=[]),
        mock.patch("apps.tenant_config.interview_milestones.cards_for", return_value=None),
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.onboarding.ai_compose.record_spend"),
        mock.patch("apps.core.ai.structured", side_effect=fake),
    ):
        yield holder


def _answers(tenant):
    return Tenant.objects.get(pk=tenant.pk).wizard_state["answers"]


def test_extracts_several_facts_and_follows_the_ai_question(client, tenant_ctx, quiet):
    quiet.reply = interview.InterviewTurn(
        facts=[
            {"field": "teaches", "value": "Pottery"},
            {"field": "audience", "value": "Desk workers"},
            {"field": "made_up", "value": "x"},
        ],
        ack="Yoga for desk workers, lovely.",
        next_field="outcome",
        question="What changes for them after a month with you?",
        options=["Less back pain", "Better sleep"],
    )
    body = client.post(URL, {"message": "I teach yoga to desk workers"}, format="json").json()
    assert _answers(tenant_ctx)["teaches"] == "Pottery" and _answers(tenant_ctx)["audience"] == "Desk workers"
    assert "made_up" not in _answers(tenant_ctx)
    assert body["guide"]["field"] == "outcome"
    assert body["guide"]["question"] == "What changes for them after a month with you?"
    assert body["guide"]["can_delegate"] is False  # only the coach knows what students get
    assert body["state"]["interview"]["remaining"] > 0


def test_ai_asking_a_known_field_falls_back_to_priority(client, quiet):
    quiet.reply = interview.InterviewTurn(
        facts=[{"field": "teaches", "value": "Pottery"}],
        ack="Nice.",
        next_field="teaches",
        question="What do you teach?",
    )
    body = client.post(URL, {"message": "Pottery"}, format="json").json()
    assert body["guide"]["field"] == "audience"
    assert body["guide"]["question"] == "Who are the students you love teaching most?"
    assert body["guide"]["ack"] == "Nice."


def test_first_message_without_ai_fills_opening_field(client, tenant_ctx, quiet):
    """Review focus 4."""
    from apps.core import ai as core_ai

    quiet.error = core_ai.AiError("down")
    body = client.post(URL, {"message": "Pilates for runners"}, format="json").json()
    assert _answers(tenant_ctx)["teaches"] == "Pilates for runners"
    assert _answers(tenant_ctx)["niche"] == "pilates"
    assert body["guide"]["field"] == "audience"


def test_fallback_answer_goes_to_the_asked_field(client, tenant_ctx, quiet, config):
    from apps.core import ai as core_ai

    quiet.error = core_ai.AiError("down")
    client.post(URL, {"message": "Pottery"}, format="json")
    client.post(URL, {"message": "Busy parents"}, format="json")
    assert _answers(tenant_ctx)["audience"] == "Busy parents"


def test_going_back_answers_the_earlier_question(client, tenant_ctx, quiet):
    from apps.core import ai as core_ai

    quiet.error = core_ai.AiError("down")
    client.post(URL, {"message": "Pottery"}, format="json")
    client.post(URL, {"message": "Busy parents"}, format="json")
    client.post(URL, {"message": "Pilates", "field": "teaches"}, format="json")  # back to question 1
    answers = _answers(tenant_ctx)
    assert answers["teaches"] == "Pilates" and answers["audience"] == "Busy parents"
    turns = TenantConfig.objects.first().setup_flow["interview"]["turns"]
    assert [t["field"] for t in turns if t["role"] == "coach"] == ["teaches", "audience", "teaches"]

    quiet.error = None
    quiet.reply = interview.InterviewTurn(next_field="outcome", question="q")
    client.post(URL, {"message": "Desk workers", "field": "audience"}, format="json")
    assert '"answering": "audience"' in quiet.calls[-1]["user"]


def test_spoken_text_is_corrected_and_stored(client, tenant_ctx, quiet):
    quiet.reply = interview.InterviewTurn(
        heard="I teach vinyasa yoga",
        facts=[{"field": "teaches", "value": "Vinyasa yoga"}],
        next_field="audience",
        question="Who for?",
    )
    body = client.post(URL, {"message": "I teach Vince's yoga", "spoken": True}, format="json").json()
    assert body["coach_text"] == "I teach vinyasa yoga"
    turns = TenantConfig.objects.first().setup_flow["interview"]["turns"]
    assert turns[0]["role"] == "guide" and turns[0]["ack"] == interview.OPENING_ACK  # the opening question is kept
    assert turns[1] == {"role": "coach", "text": "I teach vinyasa yoga", "field": "teaches"}
    assert '"spoken": true' in quiet.calls[0]["user"]


def test_delegate_choice(client, tenant_ctx, quiet):
    quiet.reply = interview.InterviewTurn(next_field="audience", question="Who?")
    client.post(
        URL, {"message": "You decide for me.", "choice": {"field": "teaches", "value": "__delegate__"}}, format="json"
    )
    assert "teaches" in _answers(tenant_ctx)["delegated"]


def test_bad_choice_is_400(client, quiet):
    resp = client.post(URL, {"message": "x", "choice": {"field": "site_style", "value": "nope"}}, format="json")
    assert resp.status_code == 400 and resp.json()["detail"] == "unknown_style"


def test_edit_request_reaches_the_copilot(client, quiet):
    quiet.reply = interview.InterviewTurn(
        edit_request="Make the home headline warmer", next_field="teaches", question="q"
    )
    payload = {
        "kind": "actions",
        "text": "Done",
        "actions": [{"kind": "edit_pages", "title": "Warmer headline", "token": "t"}],
    }
    with mock.patch("apps.core.copilot.engine.run_turn", return_value=(payload, Decimal("0"))) as run:
        body = client.post(URL, {"message": "make the headline warmer"}, format="json").json()
    run.assert_called_once()
    assert body["edit"] == payload


def test_a_turn_that_starts_work_says_so(client, tenant_ctx, quiet):
    quiet.reply = interview.InterviewTurn(ack="Got it.", next_field="audience", question="Who?")
    fired = ["style:auto", "page:home", "rank:logos", "draft:course"]
    with mock.patch("apps.tenant_config.interview_milestones.fire", return_value=fired):
        body = client.post(URL, {"message": "Yoga"}, format="json").json()
    status = body["guide"]["status"]
    assert "your home page and a first draft of your course now" in status and "Bear with me" in status
    flow = TenantConfig.objects.first().setup_flow
    assert flow["interview"]["turns"][-1]["status"] == status
    assert "status" not in interview.interview_state(tenant_ctx, flow)["guide"]  # a reload never re-announces it

    body = client.post(URL, {"message": "Beginners"}, format="json").json()
    assert "status" not in body["guide"]  # nothing started
    assert interview.started_note(["page:about"]) == "I'm starting on your About page now."
    assert interview.started_note(["style:auto", "rank:logos"]) == ""


def test_card_fields_are_asked_by_code_not_ai(client, tenant_ctx, quiet):
    answers = {
        "teaches": "Pottery",
        "audience": "a",
        "outcome": "o",
        "offers": ["course"],
        "pitch": "p",
        "difference": "d",
    }
    Tenant.objects.filter(pk=tenant_ctx.pk).update(wizard_state={"flow": "interview", "answers": answers})
    quiet.reply = interview.InterviewTurn(next_field="story", question="Tell me your story?")
    body = client.post(URL, {"message": "ok"}, format="json").json()
    assert body["guide"]["field"] == "site_style"


def test_state_opening_and_phase(client, tenant_ctx):
    with mock.patch("apps.tenant_config.interview_milestones.cards_for", return_value=None):
        state = client.get("/api/v1/admin/setup-flow/").json()["interview"]
    assert state["guide"]["field"] == "teaches"
    assert state["guide"]["ack"] == interview.OPENING_ACK
    assert state["phase"] == "interview" and state["turns"] == []


def test_look_questions_behind_the_coach_get_fresh_cards(tenant_ctx, config):
    config.setup_flow = {
        **config.setup_flow,
        "interview": {
            "turns": [
                {"role": "guide", "field": "site_style", "question": "Which look?"},
                {"role": "coach", "text": "Quiet Journal", "field": "site_style"},
                {"role": "guide", "field": "story", "question": "Your story?"},
            ],
            "fired": [],
        },
    }
    config.save()
    with mock.patch("apps.tenant_config.interview_milestones.cards_for", return_value={"kind": "style"}) as cards_for:
        state = interview.interview_state(tenant_ctx, config.setup_flow)
    assert state["cards"] == {"site_style": {"kind": "style"}}
    assert {c.args[2] for c in cards_for.call_args_list} == {"story", "site_style"}  # live guide + the past look


def test_phase_is_golive_when_nothing_is_missing(tenant_ctx, config):
    from apps.tenant_config import interview_brief as brief

    answers = {"delegated": [f.id for f in brief.FIELDS]}
    Tenant.objects.filter(pk=tenant_ctx.pk).update(wizard_state={"flow": "interview", "answers": answers})
    tenant_ctx.refresh_from_db()
    state = interview.interview_state(tenant_ctx, TenantConfig.objects.first().setup_flow)
    assert state["phase"] == "golive" and state["guide"]["field"] is None


def test_turn_is_coach_only(tenant_ctx, config):
    student = User.objects.create_user(email="s@iv.test", name="S", password="x", role="student")  # noqa: S106
    c = APIClient(HTTP_HOST="shared-test.localhost")
    c.force_authenticate(user=student)
    assert c.post(URL, {"message": "hi"}, format="json").status_code == 403


def test_model_may_fill_fields_not_yet_required(client, quiet):
    """A price said before 'sells' is known must still be extractable."""
    quiet.reply = interview.InterviewTurn(next_field="audience", question="q")
    client.post(URL, {"message": "Yoga, my course is 49"}, format="json")
    sent = quiet.calls[0]["user"]
    # Every field id is offered, not just the missing ones: in the cached system prompt.
    assert '"course_price"' in quiet.calls[0]["system"] and '"live_when"' in quiet.calls[0]["system"]
    assert '{"id": "outcome", "means": "What students get", "several": true}' in sent  # multi-pick questions are marked


def test_a_tapped_choice_never_becomes_a_site_edit(client, quiet):
    """The pick is applied by code; the model must not also 'edit' it."""
    quiet.reply = interview.InterviewTurn(edit_request="Use the Quiet Journal style", next_field="story", question="q")
    with (
        mock.patch("apps.tenant_config.interview_milestones.choose"),
        mock.patch("apps.core.copilot.engine.run_turn") as run,
    ):
        body = client.post(
            URL, {"message": "Quiet Journal", "choice": {"field": "site_style", "value": "journal"}}, format="json"
        ).json()
    run.assert_not_called()
    assert body["edit"] is None


def test_opening_setup_counts_as_activity(client, tenant_ctx):
    """Review finding 1: a coach on /setup (or go-live) is not idle."""
    Tenant.objects.filter(pk=tenant_ctx.pk).update(
        wizard_state={"flow": "interview", "answers": {}, "interview_last_at": "2020-01-01T00:00:00+00:00"}
    )
    with mock.patch("apps.tenant_config.interview_milestones.cards_for", return_value=None):
        client.get("/api/v1/admin/setup-flow/")
    assert Tenant.objects.get(pk=tenant_ctx.pk).wizard_state["interview_last_at"] > "2026-01-01"


def test_interview_and_edit_calls_are_capped_under_the_proxy_timeout(client, quiet):
    """Review finding 2: Cloudflare cuts requests at ~100s."""
    quiet.reply = interview.InterviewTurn(edit_request="Warmer headline", next_field="audience", question="q")
    with mock.patch("apps.core.copilot.engine.run_turn", return_value=({"kind": "answer", "text": "ok"}, 0)) as run:
        client.post(URL, {"message": "Yoga, and make the headline warmer"}, format="json")
    ai_cap = quiet.calls[0]["timeout_seconds"]
    edit_cap = run.call_args.kwargs["timeout_seconds"]
    assert ai_cap + edit_cap <= 85


def test_interview_throttle_is_per_tenant():
    """Review finding 5: tenant user ids collide across schemas (owner = pk 1
    everywhere); the bucket must not be shared between coaches."""
    from apps.core.throttling import SetupInterviewThrottle

    throttle = SetupInterviewThrottle()
    user = SimpleNamespace(is_authenticated=True, pk=1)
    with mock.patch("apps.core.throttling.connection") as conn:
        conn.schema_name = "yoga_a"
        key_a = throttle.get_cache_key(SimpleNamespace(user=user), None)
        conn.schema_name = "chess_b"
        key_b = throttle.get_cache_key(SimpleNamespace(user=user), None)
    assert key_a != key_b


def test_offers_guide_is_multi_with_the_full_offer_list():
    from apps.tenant_config import interview_brief as brief

    guide = interview.guide_for(brief.FIELD_BY_ID["offers"], options=["AI made-up"])
    assert guide["multi"] is True
    assert len(guide["options"]) == 5
    assert brief.parse_offers(", ".join(guide["options"])) == list(brief.OFFERS)
    assert interview.guide_for(brief.FIELD_BY_ID["outcome"])["multi"] is True  # several outcomes can apply
    assert interview.guide_for(brief.FIELD_BY_ID["pitch"])["multi"] is False
    many = interview.guide_for(brief.FIELD_BY_ID["pitch"], options=[str(n) for n in range(20)])["options"]
    assert len(many) == interview.MAX_OPTIONS


def test_fixed_options_carry_icons_and_hints(client, tenant_ctx):
    from apps.tenant_config import interview_brief as brief

    with mock.patch("apps.tenant_config.interview_milestones.cards_for", return_value=None):
        guide = client.get("/api/v1/admin/setup-flow/").json()["interview"]["guide"]
    assert guide["icons"]["Yoga"] == "flower-2" and len(guide["icons"]) == len(guide["options"])
    assert guide["hints"] == {}
    tone = interview.guide_for(brief.FIELD_BY_ID["tone"])
    assert tone["icons"]["Warm"] == "heart" and tone["hints"]["Warm"].startswith("Come as you are")
    offers = interview.guide_for(brief.FIELD_BY_ID["offers"], options=["AI made-up"], icons=["star"])
    assert offers["icons"]["Digital Courses"] == "book-open"  # the fixed offer list keeps its own icons
    assert interview.guide_for(None)["icons"] == {} and interview.guide_for(None)["hints"] == {}


def test_hinted_fields_keep_their_own_options_and_hints_over_ai_ones(client, tenant_ctx, quiet):
    from apps.tenant_config import interview_brief as brief

    tone = brief.FIELD_BY_ID["tone"]
    quiet.reply = interview.InterviewTurn(
        next_field="tone", question="How should it sound?", options=["Chatty", "Bossy"], icons=["smile", "zap"]
    )
    guide = client.post(URL, {"message": "Yoga"}, format="json").json()["guide"]
    assert guide["options"] == list(tone.options)
    assert guide["hints"]["Warm"].startswith("Come as you are") and guide["icons"]["Warm"] == "heart"
    assert '"fixed_options"' in quiet.calls[0]["user"]


def test_ai_icons_are_matched_to_options_and_filtered(client, tenant_ctx, quiet):
    """Review focus 3: fewer or bogus icons never break the guide."""
    quiet.reply = interview.InterviewTurn(
        next_field="audience",
        question="Who?",
        options=["Parents", "Runners", "Desk workers"],
        icons=["baby", "not-an-icon"],
    )
    guide = client.post(URL, {"message": "Yoga"}, format="json").json()["guide"]
    assert guide["icons"] == {"Parents": "baby"} and guide["hints"] == {}
    assert "Icon ids: activity," in quiet.calls[0]["system"]  # the allowlist is in the cached system prompt
    flow = TenantConfig.objects.first().setup_flow
    assert interview.interview_state(tenant_ctx, flow)["guide"]["icons"] == {"Parents": "baby"}  # survives a reload


BEFORE_COURSE = {
    "teaches": "Boxing",
    "audience": "Beginners",
    "outcome": "Fitter",
    "offers": ["course"],
    "pitch": "Boxing for beginners",
    "difference": "Technique first",
    "site_style": "journal",
    "story": "Fought for ten years",
    "credentials": "Coach level 2",
    "tone": "energetic",
    "site_logo": "wordmark",
    "payments": ["course"],
}


def _set_answers(tenant, answers):
    Tenant.objects.filter(pk=tenant.pk).update(wizard_state={"flow": "interview", "answers": answers})
    tenant.refresh_from_db()


def test_a_section_is_asked_in_order_whatever_the_ai_prefers(client, tenant_ctx, quiet):
    _set_answers(tenant_ctx, dict(BEFORE_COURSE))
    quiet.reply = interview.InterviewTurn(ack="Ok.", next_field="contact", question="How do they reach you?")
    guide = client.post(URL, {"message": "fine"}, format="json").json()["guide"]
    assert guide["field"] == "course_topic"
    assert guide["skip"] == "No course for now"


def test_words_on_a_review_screen_redraft_without_an_ai_turn(client, tenant_ctx, quiet):
    _set_answers(tenant_ctx, {**BEFORE_COURSE, "course_topic": "Footwork", "course_price": 49.0})
    with mock.patch("apps.tenant_config.interview_milestones.redraft") as redraft:
        body = client.post(URL, {"message": "Make it six weeks", "field": "course_review"}, format="json").json()
    assert quiet.calls == []
    assert redraft.call_args.args[2:] == ("course", "Make it six weeks")
    assert body["guide"]["field"] == "course_review"
    assert body["guide"]["ack"] == interview.REDRAFT_ACK
    assert body["guide"]["can_delegate"] is False


def test_a_started_section_finishes_before_other_questions(client, tenant_ctx, quiet):
    answers = {**BEFORE_COURSE, "payments": ["course", "membership"], "course_topic": "Footwork"}
    _set_answers(tenant_ctx, answers)
    quiet.reply = interview.InterviewTurn(
        facts=[{"field": "course_price", "value": "49"}],
        ack="Ok.",
        next_field="memberships",
        question="Which memberships?",
    )
    guide = client.post(URL, {"message": "49", "field": "course_price"}, format="json").json()["guide"]
    assert guide["field"] == "course_review"


def test_guide_carries_details_builder_and_schedule():
    from apps.tenant_config import interview_brief as brief

    offers = interview.guide_for(brief.FIELD_BY_ID["offers"])
    assert offers["details"]["Digital Courses"].startswith("Pre-recorded")
    assert offers["can_delegate"] is False and offers["builder"] is None and offers["schedule"] is False
    when = interview.guide_for(brief.FIELD_BY_ID["live_when"])
    assert when["schedule"] is True and when["options"] == ["Recurring", "One-time"] and when["builder"] == "event"
    assert when["hints"]["Recurring"].startswith("Set days") and when["can_delegate"] is True
    tiers = interview.guide_for(
        brief.FIELD_BY_ID["memberships"], options=["AI made-up"], answers={"offers": ["course", "onsite"]}
    )
    assert tiers["options"] == ["Digital membership", "Studio membership", "All-access"]
    assert tiers["hints"]["Digital membership"] == "$9 a month" and tiers["builder"] == "membership"
    assert tiers["multi"] is True and tiers["details"]["All-access"] == "One membership for all of it."
    assert interview.guide_for(brief.FIELD_BY_ID["course_topic"])["builder"] == "course"
    assert interview.guide_for(brief.FIELD_BY_ID["course_review"])["builder"] is None
    assert interview.guide_for(None)["details"] == {} and interview.guide_for(None)["builder"] is None


def test_a_schedule_pick_is_applied_by_code_and_the_model_never_overrides_it(client, tenant_ctx, quiet):
    _set_answers(tenant_ctx, {**BEFORE_COURSE, "offers": ["course", "live"], "live_topic": "Pads"})
    quiet.reply = interview.InterviewTurn(
        facts=[{"field": "live_when", "value": "whenever suits"}],
        ack="Ok.",
        next_field="event_price",
        question="Price?",
        options=["10"],
    )
    body = client.post(
        URL,
        {
            "message": "Tuesday 8 Jan 2030 at 6:30 PM",
            "choice": {"field": "live_when", "value": '{"mode": "once", "at": "2030-01-08T18:30"}'},
        },
        format="json",
    ).json()
    answers = _answers(tenant_ctx)
    assert answers["live_when"] == "Tuesday 8 Jan 2030 at 6:30 PM"
    assert answers["live_schedule"] == {"mode": "once", "at": "2030-01-08T18:30"}
    assert body["guide"]["field"]  # the interview went on (the course section comes first)
    bad = client.post(
        URL, {"message": "x", "choice": {"field": "live_when", "value": '{"mode": "once"}'}}, format="json"
    )
    assert bad.status_code == 400


def test_the_model_cannot_start_a_section_before_its_turn(client, tenant_ctx, quiet):
    """The course draft needs the home facts and the payments answer; a
    review screen reached before them would wait for a draft that never
    fires (seen in e2e: teaches → outcome → offers → course_topic)."""
    _set_answers(tenant_ctx, {"teaches": "Pottery", "outcome": "Less back pain"})
    quiet.reply = interview.InterviewTurn(
        facts=[{"field": "offers", "value": "Digital Courses"}],
        ack="Ok.",
        next_field="course_topic",
        question="What should your first course teach?",
        options=["Neck release"],
    )
    guide = client.post(URL, {"message": "Digital Courses", "field": "offers"}, format="json").json()["guide"]
    assert guide["field"] == "audience"  # the next open question in order, not the course section
