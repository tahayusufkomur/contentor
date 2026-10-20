"""The /setup interview turn: extraction, the code safety net, fallback,
spoken-text correction, edit requests, and the read model."""

import json
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


# The photos question, asked right after what she teaches, is answered before
# these tests start: its own tests are in test_interview_photos.py.
PHOTOS = {"photos": "stock"}


@pytest.fixture()
def config(tenant_ctx):
    Tenant.objects.filter(pk=tenant_ctx.pk).update(wizard_state={"flow": "interview", "answers": dict(PHOTOS)})
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
    assert body["guide"]["question"] == "Who are the students you love working with most?"
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
    coach = turns[1]
    assert {k: coach[k] for k in ("role", "text", "field")} == {
        "role": "coach",
        "text": "I teach vinyasa yoga",
        "field": "teaches",
    }
    # Stamped for the funnel (manage.py setup_funnel).
    assert coach["how"] == "spoken" and coach["at"] and turns[2]["at"] >= coach["at"]  # answered, then replied
    assert isinstance(turns[2]["ms"], int)
    assert '"spoken": true' in quiet.calls[0]["user"]


def test_delegate_choice(client, tenant_ctx, quiet):
    quiet.reply = interview.InterviewTurn(next_field="audience", question="Who?")
    client.post(
        URL, {"message": "You decide for me.", "choice": {"field": "teaches", "value": "__delegate__"}}, format="json"
    )
    assert "teaches" in _answers(tenant_ctx)["delegated"]
    assert TenantConfig.objects.first().setup_flow["interview"]["turns"][-2]["how"] == "delegate"


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


def test_a_change_asked_on_a_page_under_review_goes_to_that_page(client, tenant_ctx, quiet):
    _only_missing(tenant_ctx, ())
    payload = {"kind": "answer", "text": "Done"}
    with mock.patch("apps.core.copilot.engine.run_turn", return_value=(payload, Decimal("0"))) as run:
        body = client.post(URL, {"message": "a calmer photo", "page": "about"}, format="json").json()
    assert quiet.calls == []  # straight to the copilot: no interview turn first
    assert run.call_args.args[3] == 'On the "about" page (/about) only: a calmer photo'
    assert body["edit"] == payload


def test_a_part_of_the_page_she_tapped_scopes_the_change(client, tenant_ctx, quiet):
    """The review preview lets her tap a section: the copilot gets it as a
    selection, and the request names its block."""
    _only_missing(tenant_ctx, ())
    payload = {"kind": "answer", "text": "Done"}
    tapped = {"path": "/about", "block_id": "blk_1", "tag": "h2", "text": "My story", "context": "", "junk": 1}
    with mock.patch("apps.core.copilot.engine.run_turn", return_value=(payload, Decimal("0"))) as run:
        client.post(URL, {"message": "shorter", "page": "about", "selection": tapped}, format="json").json()
    assert run.call_args.args[2] == [{k: v for k, v in tapped.items() if k != "junk"}]
    assert run.call_args.args[3] == (
        'On the "about" page (/about) only, in the section she tapped (block blk_1): shorter'
    )


def test_a_bio_read_once_is_not_asked_for_again(client, tenant_ctx, quiet):
    flow = {}
    assert interview.interview_state(tenant_ctx, flow)["bio_read"] is False
    Tenant.objects.filter(pk=tenant_ctx.pk).update(wizard_state={"about_prefills": {"teaches": "Yoga"}})
    tenant_ctx.refresh_from_db()
    assert interview.interview_state(tenant_ctx, flow)["bio_read"] is True
    Tenant.objects.filter(pk=tenant_ctx.pk).update(wizard_state={})
    tenant_ctx.refresh_from_db()
    shared = {"interview": {"turns": [{"role": "coach", "text": interview.IMPORT_TURN_TEXT, "how": "import"}]}}
    assert interview.interview_state(tenant_ctx, shared)["bio_read"] is True


def test_a_turn_that_starts_work_says_so(client, tenant_ctx, quiet):
    quiet.reply = interview.InterviewTurn(ack="Got it.", next_field="audience", question="Who?")
    fired = ["style:auto", "page:home", "rank:logos", "draft:course"]
    with mock.patch("apps.tenant_config.interview_milestones.fire", return_value=fired):
        body = client.post(URL, {"message": "Yoga"}, format="json").json()
    status = body["guide"]["status"]
    assert status.startswith(
        "I have enough to start building, so your team is on it: your Designer on your home page"
        " and your Content Creating Specialist on a first draft of your course."
    )
    assert "Bear with me" in status and body["guide"]["status_by"] is None
    flow = TenantConfig.objects.first().setup_flow
    assert flow["interview"]["turns"][-1]["status"] == status
    assert "status" not in interview.interview_state(tenant_ctx, flow)["guide"]  # a reload never re-announces it

    body = client.post(URL, {"message": "Beginners"}, format="json").json()
    assert "status" not in body["guide"]  # nothing started
    with mock.patch("apps.tenant_config.interview_milestones.fire", return_value=["page:about"]):
        body = client.post(URL, {"message": "Busy mums"}, format="json").json()
    assert body["guide"]["status_by"] == "designer"  # a pages-only turn
    assert interview.started_note(["page:about"]) == ("Your Designer is starting on your About page now.", "designer")
    assert interview.started_note(["style:auto", "rank:logos"]) == ("", None)
    text, by = interview.started_note(["style:auto", "page:home", "rank:logos", "draft:course"])
    assert text.startswith(
        "I have enough to start building, so your team is on it: your Designer on your home page"
        " and your Content Creating Specialist on a first draft of your course."
    )
    assert by is None
    assert interview.started_note(["draft:post"]) == (
        "Your Marketing Specialist is starting on your first article now.",
        "marketing",
    )
    assert interview.started_note(["page:about", "draft:post"])[0] == (
        "Your team is starting now: your Designer on your About page"
        " and your Marketing Specialist on your first article."
    )


def test_card_fields_are_asked_by_code_not_ai(client, tenant_ctx, quiet):
    answers = {
        **PHOTOS,
        "teaches": "Pottery",
        "audience": "a",
        "outcome": "o",
        "offers": ["course"],
        "pitch": "p",
        "difference": "d",
        "tone": "warm",
    }
    Tenant.objects.filter(pk=tenant_ctx.pk).update(wizard_state={"flow": "interview", "answers": answers})
    quiet.reply = interview.InterviewTurn(next_field="story", question="Tell me your story?")
    body = client.post(URL, {"message": "ok"}, format="json").json()
    assert body["guide"]["field"] == "site_style"


def test_the_tone_is_asked_before_the_look_so_it_can_rank_the_looks(client, tenant_ctx, quiet):
    answers = {
        **PHOTOS,
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
    assert body["guide"]["field"] == "tone"


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


def test_a_question_added_after_go_live_was_reached_is_asked(tenant_ctx, config):
    from apps.tenant_config import interview_brief as brief

    answers = {"delegated": [f.id for f in brief.FIELDS if f.id != "timezone"]}
    Tenant.objects.filter(pk=tenant_ctx.pk).update(wizard_state={"flow": "interview", "answers": answers})
    tenant_ctx.refresh_from_db()
    config.setup_flow = {
        **config.setup_flow,
        "interview": {"turns": [{"role": "guide", **interview.guide_for(None)}], "fired": []},
    }
    config.save()
    guide = interview.interview_state(tenant_ctx, config.setup_flow)["guide"]
    assert (guide["field"], guide["timezone"]) == ("timezone", True)


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


def test_model_written_questions_still_show_tiles_when_the_ai_is_down():
    from apps.tenant_config import interview_brief as brief

    for field_id in ("outcome", "difference", "story", "credentials"):
        guide = interview.guide_for(brief.FIELD_BY_ID[field_id])  # no turn: the pre-written question
        assert 4 <= len(guide["options"]) <= interview.MAX_OPTIONS and guide["icons"], field_id
    # ...and a turn that did come back still wins.
    assert interview.guide_for(brief.FIELD_BY_ID["outcome"], options=["Sleep better"])["options"] == ["Sleep better"]


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
    guide = client.post(URL, {"message": "Pottery"}, format="json").json()["guide"]
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
    guide = client.post(URL, {"message": "Pottery"}, format="json").json()["guide"]
    assert guide["icons"] == {"Parents": "baby"} and guide["hints"] == {}
    assert "Icon ids: activity," in quiet.calls[0]["system"]  # the allowlist is in the cached system prompt
    flow = TenantConfig.objects.first().setup_flow
    assert interview.interview_state(tenant_ctx, flow)["guide"]["icons"] == {"Parents": "baby"}  # survives a reload


BEFORE_COURSE = {
    **PHOTOS,
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
    "timezone": "Europe/Berlin",
    "currency": "USD",
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
    answers = {**BEFORE_COURSE, "course_topic": "Footwork", "course_access": ["buy"], "course_price": 49.0}
    _set_answers(tenant_ctx, answers)
    with mock.patch("apps.tenant_config.interview_milestones.redraft") as redraft:
        body = client.post(URL, {"message": "Make it six weeks", "field": "course_review"}, format="json").json()
    assert quiet.calls == []
    assert redraft.call_args.args[2:] == ("course", "Make it six weeks")
    assert body["guide"]["field"] == "course_review"
    assert body["guide"]["ack"] == interview.REDRAFT_ACK
    assert body["guide"]["can_delegate"] is False


def test_a_started_section_finishes_before_other_questions(client, tenant_ctx, quiet):
    _set_answers(tenant_ctx, {**BEFORE_COURSE, "payments": ["course", "membership"]})
    quiet.reply = interview.InterviewTurn(
        facts=[{"field": "course_topic", "value": "Footwork"}],
        ack="Ok.",
        next_field="memberships",
        question="Which memberships?",
    )
    guide = client.post(URL, {"message": "Footwork", "field": "course_topic"}, format="json").json()["guide"]
    # Who can open it is asked before any price: members only needs none.
    assert guide["field"] == "course_access"
    assert guide["options"] == ["Anyone who buys the course", "Digital membership", "Free for everyone"]
    assert guide["hints"]["Anyone who buys the course"] == "You set the price next"
    assert guide["hints"]["Digital membership"] == "Included for members, $9 a month"
    assert guide["details"]["Digital membership"].startswith("Members get it")
    assert guide["multi"] is True and guide["alone"] == "Free for everyone" and guide["can_delegate"] is True
    # What a "pick for me" would set starts ticked: one tap to agree.
    assert guide["prefill_options"] == ["Anyone who buys the course", "Digital membership"]
    guide = client.post(URL, {"message": "Digital membership", "field": "course_access"}, format="json").json()["guide"]
    assert quiet.calls[1:] == []  # tiles of code's own: no model turn
    assert _answers(tenant_ctx)["course_access"] == ["digital"]
    assert guide["field"] == "course_review"


def test_selling_it_on_its_own_asks_its_price_next(client, tenant_ctx, quiet):
    _set_answers(tenant_ctx, {**BEFORE_COURSE, "course_topic": "Footwork"})
    guide = client.post(URL, {"message": "Anyone who buys the course", "field": "course_access"}, format="json")
    assert guide.json()["guide"]["field"] == "course_price"
    assert _answers(tenant_ctx)["course_access"] == ["buy"]


def test_a_course_given_free_is_never_priced(client, tenant_ctx, quiet):
    """A coach who sells courses can still give this one away: no price asked."""
    _set_answers(tenant_ctx, {**BEFORE_COURSE, "course_topic": "Footwork"})
    guide = client.post(URL, {"message": "Free for everyone", "field": "course_access"}, format="json").json()["guide"]
    assert quiet.calls == []
    assert guide["field"] == "course_review"


def test_leaving_the_ways_in_to_the_guide_says_what_it_opened(client, tenant_ctx, quiet):
    _only_missing(tenant_ctx, ("course_access", "socials"), offers=["course"], payments=["course", "membership"])
    body = client.post(
        URL,
        {"message": "You decide for me.", "choice": {"field": "course_access", "value": "__delegate__"}},
        format="json",
    ).json()
    assert "Anyone who buys the course, Digital membership" in body["guide"]["ack"]


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
    _set_answers(tenant_ctx, {**PHOTOS, "teaches": "Pottery", "outcome": "Less back pain"})
    quiet.reply = interview.InterviewTurn(
        facts=[{"field": "offers", "value": "Digital Courses"}],
        ack="Ok.",
        next_field="course_topic",
        question="What should your first course teach?",
        options=["Neck release"],
    )
    guide = client.post(URL, {"message": "Digital Courses", "field": "offers"}, format="json").json()["guide"]
    assert guide["field"] == "audience"  # the next open question in order, not the course section


def test_a_tapped_niche_tile_is_applied_by_code(client, tenant_ctx, config, quiet):
    config.brand_name = "Görkem's Face Yoga Studio"
    config.save()
    # The model paraphrases the tile; code's reading of it wins.
    quiet.reply = interview.InterviewTurn(
        facts=[{"field": "teaches", "value": "face yoga"}], ack="Got it.", next_field="specialty", question="More?"
    )
    body = client.post(URL, {"message": "Face yoga and more"}, format="json").json()
    answers = _answers(tenant_ctx)
    assert answers["teaches"] == "Yoga" and answers["specialty_base"] == "Face yoga" and "specialty" not in answers
    assert body["guide"]["field"] == "specialty" and "Face yoga" not in body["guide"]["options"]


def test_prices_and_contact_keep_their_own_options_over_ai_ones():
    """Audit G1: the model offered "Free first class, then $15" and "Website live chat"."""
    from apps.tenant_config import interview_brief as brief

    answers = {"offers": ["course", "live"], "payments": ["course", "event"]}
    for field_id, junk in (
        ("contact", ["Website live chat", "Book a short video call"]),
        ("course_price", ["Free first class, then $15", "Pay what you can"]),
        ("event_price", ["Free first class, then $15", "Pay what you can"]),
    ):
        guide = interview.guide_for(brief.FIELD_BY_ID[field_id], "", "Q?", junk, ["mail", "coins"], answers)
        assert guide["options"] == list(brief.options_for(brief.FIELD_BY_ID[field_id], answers)[0])


def test_a_membership_she_names_starts_at_the_own_price():
    """The tiles carry her prices; a membership typed on the question has none
    yet, so the step says what it starts at and "Select all" goes through."""
    from apps.tenant_config import interview_brief as brief

    step = interview.membership_prices("memberships", {"offers": ["course"], "payments": ["membership"]})
    assert step["prices"] == {"Digital membership": 9}
    assert step["own_price"] == brief.OWN_MEMBERSHIP_PRICE
    assert interview.membership_prices("contact", {}) == {"prices": {}, "sign": ""}


def test_story_and_credentials_offer_starters_not_claims():
    """Audit G1: one tap put an invented backstory on the About page."""
    from apps.tenant_config import interview_brief as brief

    assert interview.guide_for(brief.FIELD_BY_ID["story"], options=["I found yoga when…"], icons=[])["starter"]
    assert interview.guide_for(brief.FIELD_BY_ID["credentials"], options=["I trained in…"], icons=[])["starter"]
    assert interview.guide_for(brief.FIELD_BY_ID["pitch"], options=["Yoga for desks"], icons=[])["starter"] is False
    # Picked as cards, several at once, and she can add a sentence of her own.
    for field_id in ("story", "credentials"):
        guide = interview.guide_for(brief.FIELD_BY_ID[field_id], options=["I found yoga when…"], icons=[])
        assert guide["multi"] and guide["custom"]
    assert "starter" in interview.GUIDE_KEYS
    assert "sentence starters" in interview.SYSTEM


def test_offers_and_payments_say_why_they_matter():
    """Audit E1: the offers question decides about 10 later questions and nothing said so."""
    from apps.tenant_config import interview_brief as brief

    assert "pages" in interview.guide_for(brief.FIELD_BY_ID["offers"])["why"]
    assert interview.guide_for(brief.FIELD_BY_ID["payments"])["why"]
    assert interview.guide_for(brief.FIELD_BY_ID["pitch"], options=["x"], icons=[])["why"] == ""
    assert "why" in interview.GUIDE_KEYS


def test_only_the_last_turns_ride_along(tenant_ctx, config):
    """Audit F1: turns slowed from ~7 s to ~15 s as all 80 turns rode every call."""
    turns = [{"role": "coach", "text": f"m{i}"} for i in range(40)]
    recent = json.loads(interview._user_turn(tenant_ctx, {}, turns, "hi", False))["recent"]
    assert len(recent) == interview.CONTEXT_TURNS < 40
    assert recent[-1]["text"] == "m39"


def test_a_tapped_niche_tile_with_a_note_is_still_applied_by_code(client, tenant_ctx, config, quiet):
    """Review: Continue sends the tiles, then the note on the next line; the
    tiles are still read by code, not by the model's paraphrase."""
    config.brand_name = "Görkem's Face Yoga Studio"
    config.save()
    quiet.reply = interview.InterviewTurn(
        facts=[{"field": "teaches", "value": "face yoga for desk workers"}], ack="Got it.", next_field="specialty"
    )
    client.post(URL, {"message": "Face yoga and more\nmostly for desk workers"}, format="json")
    answers = _answers(tenant_ctx)
    assert answers["teaches"] == "Yoga" and answers["specialty_base"] == "Face yoga"


def test_without_ai_a_fixed_answer_reads_its_tiles_not_the_note(client, tenant_ctx, quiet):
    """Review: "Free for now" with a note about a membership later stays free."""
    from apps.core import ai as core_ai

    quiet.error = core_ai.AiError("down")
    client.post(URL, {"message": "Free for now\nmaybe a membership later", "field": "payments"}, format="json")
    assert _answers(tenant_ctx)["payments"] == ["free"]


def _only_missing(tenant_ctx, keep, **answers):
    """Every field settled (left to the guide) except ``keep``."""
    from apps.tenant_config import interview_brief as brief

    answers["delegated"] = [f.id for f in brief.FIELDS if f.id not in keep]
    Tenant.objects.filter(pk=tenant_ctx.pk).update(wizard_state={"flow": "interview", "answers": answers})
    tenant_ctx.refresh_from_db()


def test_a_tap_whose_next_question_is_code_owned_skips_the_model(client, tenant_ctx, quiet):
    """Phase 2A: a tapped fixed tile leading to a code-owned question needs no AI turn."""
    _only_missing(tenant_ctx, ("payments", "memberships"), offers=["live"])
    body = client.post(URL, {"message": "Monthly membership", "field": "payments"}, format="json").json()
    assert quiet.calls == []
    assert _answers(tenant_ctx)["payments"] == ["membership"]
    assert body["guide"]["field"] == "memberships" and body["guide"]["options"]


def test_a_card_pick_whose_next_question_is_code_owned_skips_the_model(client, tenant_ctx, quiet):
    _only_missing(tenant_ctx, ("site_logo", "payments"))
    body = client.post(
        URL, {"message": "Just my name", "choice": {"field": "site_logo", "value": "wordmark"}}, format="json"
    ).json()
    assert quiet.calls == []
    assert body["guide"]["field"] == "payments"


def test_the_calendar_layout_is_asked_after_the_first_class_and_left_to_the_guide_it_is_month(
    client, tenant_ctx, quiet
):
    _only_missing(tenant_ctx, ("event_review", "calendar_view"), offers=["live"])
    body = client.post(
        URL, {"message": "Looks good", "choice": {"field": "event_review", "value": "ok"}}, format="json"
    ).json()
    assert quiet.calls == []
    assert body["guide"]["field"] == "calendar_view" and body["guide"]["skip"] is None
    body = client.post(
        URL, {"message": "Pick for me", "choice": {"field": "calendar_view", "value": "__delegate__"}}, format="json"
    ).json()
    assert quiet.calls == []  # code-owned: no AI turn
    assert _answers(tenant_ctx)["calendar_view"] == "month"
    assert "month grid" in body["guide"]["ack"]


def test_a_coach_who_skipped_classes_or_has_none_is_never_asked_the_calendar_layout(client, tenant_ctx, quiet):
    from apps.tenant_config import interview_brief as brief

    for answers in ({"offers": ["course"]}, {"offers": ["live"], "skipped": ["event"]}):
        assert "calendar_view" not in {f.id for f in brief.missing(answers)}


def test_an_earlier_calendar_layout_answer_stands(tenant_ctx):
    from apps.tenant_config import interview_brief as brief

    assert "calendar_view" not in {f.id for f in brief.missing({"offers": ["live"], "calendar_view": "agenda"})}


def test_a_tap_whose_next_question_needs_the_model_still_asks_it(client, tenant_ctx, quiet):
    """The next question's tiles are written for this coach, so the model runs; its
    reading of the tapped tiles never overrides code's."""
    _only_missing(tenant_ctx, ("offers", "pitch"))
    quiet.reply = interview.InterviewTurn(
        facts=[{"field": "offers", "value": "course"}], next_field="pitch", question="Your promise?", options=["A"]
    )
    body = client.post(URL, {"message": "Community", "field": "offers"}, format="json").json()
    assert len(quiet.calls) == 1
    assert "community" in _answers(tenant_ctx)["offers"]
    assert body["guide"]["field"] == "pitch" and body["guide"]["question"] == "Your promise?"


def test_a_tap_with_a_note_still_asks_the_model(client, tenant_ctx, quiet):
    _only_missing(tenant_ctx, ("payments", "memberships"), offers=["live"])
    client.post(URL, {"message": "Monthly membership\nmostly for regulars", "field": "payments"}, format="json")
    assert len(quiet.calls) == 1


def test_leaving_a_wording_question_to_the_guide_still_asks_the_model(client, tenant_ctx, quiet):
    """The guide writes the pitch itself, so "You decide" there needs the model."""
    _only_missing(tenant_ctx, ("pitch", "tone"))
    client.post(
        URL, {"message": "You decide for me.", "choice": {"field": "pitch", "value": "__delegate__"}}, format="json"
    )
    assert len(quiet.calls) == 1


def test_leaving_the_look_to_the_guide_says_which_look_it_picked(client, tenant_ctx, quiet):
    """Audit E2: the next reply says what was picked."""
    from apps.tenant_config import sections

    _only_missing(tenant_ctx, ("site_style", "credentials"), niche="yoga")
    body = client.post(
        URL,
        {"message": "You decide for me.", "choice": {"field": "site_style", "value": "__delegate__"}},
        format="json",
    ).json()
    label = sections.style(TenantConfig.objects.first().style)["label"]
    assert label in body["guide"]["ack"] and "change it any time" in body["guide"]["ack"]


def test_leaving_memberships_to_the_guide_names_the_one_it_set_up(client, tenant_ctx, quiet):
    _only_missing(tenant_ctx, ("memberships", "socials"), payments=["membership"])
    body = client.post(
        URL,
        {"message": "You decide for me.", "choice": {"field": "memberships", "value": "__delegate__"}},
        format="json",
    ).json()
    assert "Digital membership" in body["guide"]["ack"]


def test_a_typed_answer_that_fills_other_questions_says_so(client, tenant_ctx, quiet):
    """Audit E3: the story also filled the credentials, and the reply only mentioned the story."""
    _only_missing(tenant_ctx, ("story", "credentials", "contact"))
    quiet.reply = interview.InterviewTurn(
        facts=[
            {"field": "story", "value": "Back pain at my desk job led me to yoga."},
            {"field": "credentials", "value": "200-hour training, about 20 years of practice"},
        ],
        next_field="contact",
        question="How should students reach you?",
    )
    guide = client.post(
        URL, {"message": "Back pain at my desk job led me to yoga, 200-hour training", "field": "story"}, format="json"
    ).json()["guide"]
    assert guide["noted"] == ["your training"]  # the question on screen is not repeated back


def test_the_contact_question_prefills_the_signup_email(client, tenant_ctx, quiet):
    _only_missing(tenant_ctx, ("socials", "contact"))
    guide = client.post(
        URL, {"message": "No social accounts yet", "choice": {"field": "socials", "value": "{}"}}, format="json"
    ).json()["guide"]
    assert guide["field"] == "contact" and guide["contact"] is True
    assert guide["prefill"] == {"Email": "c@iv.test"}  # the coach's own signup email


def test_socials_and_contact_picks_skip_the_model(client, tenant_ctx, quiet):
    """Phase 2A walk: these taps lead to code-owned questions (contact, go-live)."""
    _only_missing(tenant_ctx, ("socials", "contact"))
    body = client.post(
        URL, {"message": "No social accounts yet", "choice": {"field": "socials", "value": "{}"}}, format="json"
    ).json()
    assert body["guide"]["field"] == "contact"
    body = client.post(
        URL,
        {"message": "Email", "choice": {"field": "contact", "value": '{"Email": "c@iv.test"}'}},
        format="json",
    ).json()
    assert body["guide"]["field"] is None
    assert quiet.calls == []


def test_a_question_stored_before_own_options_still_gets_its_blank_tile(tenant_ctx):
    """A question on screen came from a transcript written before the "custom" key."""
    flow = {
        "interview": {"turns": [{"role": "guide", "field": "specialty", "question": "Which kinds?", "options": []}]}
    }
    guide = interview.interview_state(tenant_ctx, flow)["guide"]
    assert guide["field"] == "specialty" and guide["custom"] is True


def test_the_address_question_is_two_boxes_and_opens_on_what_she_gave():
    from apps.tenant_config import interview_brief as brief

    guide = interview.guide_for(brief.FIELD_BY_ID["location"], answers={"offers": ["onsite"]})
    assert guide["address"] is True and guide["options"] == [] and guide["can_delegate"] is False
    assert interview.prefill_for("location", {"location": "Studio 4", "address": "Hauptstr. 12"}) == {
        "Place": "Studio 4",
        "Address": "Hauptstr. 12",
    }
    # Her address is never a thing the model is asked to fill. Each kind of session can be
    # skipped on its own, on its review screen too.
    assert "location" not in interview.SYSTEM
    assert guide["builder"] == "onsite"
    review = interview.guide_for(brief.FIELD_BY_ID["onsite_review"], answers={"offers": ["live", "onsite"]})
    assert review["skip"] == "No in-person event for now" and review["builder"] is None
    assert interview.guide_for(brief.FIELD_BY_ID["event_review"])["skip"] == "No online class for now"


def test_an_address_pick_skips_the_model_and_asks_the_next_question(client, tenant_ctx, quiet):
    _only_missing(tenant_ctx, ("location", "onsite_price"), offers=["onsite"], payments=["event"])
    value = json.dumps({"Place": "Studio 4", "Address": "Hauptstr. 12"})
    body = client.post(
        URL, {"message": "Studio 4, Hauptstr. 12", "choice": {"field": "location", "value": value}}, format="json"
    ).json()
    answers = _answers(tenant_ctx)
    assert quiet.calls == []
    assert (answers["location"], answers["address"]) == ("Studio 4", "Hauptstr. 12")
    # Back on that question, both boxes start with what she gave.
    assert interview.prefill_for("location", answers) == {"Place": "Studio 4", "Address": "Hauptstr. 12"}
    assert body["guide"]["field"] == "onsite_price"


# ── a shared document (bio, CV, old About page) ──────────────────────────────

IMPORT_URL = "/api/v1/admin/setup-flow/import/"
BIO = "Mira Voss. I teach Pottery to desk workers. Trained with the Ceramics Guild, 500 hours, in 2016."


def _import_reply(**kwargs):
    return interview.InterviewTurn(
        facts=[
            {"field": "teaches", "value": "Pottery"},
            {"field": "audience", "value": "Desk workers"},
            {"field": "credentials", "value": "I trained with the Ceramics Guild, 500 hours, in 2016."},
            {"field": "story", "value": "I found clay after years at a desk."},
        ],
        ack="Thanks for the document.",
        next_field="outcome",
        question="What do students walk away with?",
        **kwargs,
    )


def _bio_file(text=BIO):
    from django.core.files.uploadedfile import SimpleUploadedFile

    return SimpleUploadedFile("bio.txt", text.encode())


def test_a_shared_file_fills_several_questions_and_says_so(client, tenant_ctx, quiet):
    quiet.reply = _import_reply()
    body = client.post(IMPORT_URL, {"file": _bio_file()}, format="multipart").json()
    answers = _answers(tenant_ctx)
    assert answers["teaches"] == "Pottery" and answers["audience"] == "Desk workers"
    assert answers["credentials"].startswith("I trained") and answers["story"].startswith("I found")
    assert body["guide"]["ack"] == (
        "From your file I filled in: what you offer, who you work with, your story, your training."
        " You can change any of them."
    )
    assert body["guide"]["noted"] == ["who you work with", "your story", "your training"]  # not the question on screen
    assert body["guide"]["field"] == "outcome"
    user = json.loads(quiet.calls[0]["user"])
    assert user["document"] is True and user["message"] == BIO and user["answering"] is None
    assert body["coach_text"] == interview.IMPORT_TURN_TEXT  # the transcript never holds the document
    turns = TenantConfig.objects.first().setup_flow["interview"]["turns"]
    assert [t for t in turns if t["role"] == "coach"][0]["how"] == "import"


def test_pasted_text_works_and_may_be_longer_than_a_chat_message(client, quiet):
    quiet.reply = _import_reply()
    long = BIO + " " + "More about me. " * 300
    assert len(long) > interview.MESSAGE_MAX
    assert client.post(IMPORT_URL, {"text": long}, format="json").status_code == 200
    assert len(json.loads(quiet.calls[0]["user"])["message"]) == len(long.strip())


def test_a_shared_file_never_overwrites_what_she_already_answered(client, tenant_ctx, quiet):
    _set_answers(tenant_ctx, {"teaches": "Pottery", "delegated": ["story"]})
    quiet.reply = _import_reply()
    client.post(IMPORT_URL, {"text": BIO}, format="json")
    answers = _answers(tenant_ctx)
    assert answers["teaches"] == "Pottery"
    assert "story" not in answers  # left to the guide: settled
    assert answers["audience"] == "Desk workers"


def test_a_shared_file_is_never_a_site_edit_or_a_redraft(client, tenant_ctx, quiet):
    _set_answers(tenant_ctx, {**BEFORE_COURSE, "course_topic": "Footwork", "course_price": 49.0})
    quiet.reply = _import_reply(edit_request="Change my headline")
    with (
        mock.patch("apps.core.copilot.engine.run_turn") as run,
        mock.patch("apps.tenant_config.interview_milestones.redraft") as redraft,
    ):
        body = client.post(IMPORT_URL, {"text": BIO, "field": "course_review"}, format="json").json()
    run.assert_not_called()
    redraft.assert_not_called()
    assert body["edit"] is None


def test_when_the_ai_fails_nothing_is_applied(client, tenant_ctx, quiet):
    from apps.core import ai as core_ai

    quiet.error = core_ai.AiError("down")
    response = client.post(IMPORT_URL, {"text": BIO}, format="json")
    assert response.status_code == 503 and response.json()["detail"] == "ai_unavailable"
    assert _answers(tenant_ctx) == PHOTOS
    assert TenantConfig.objects.first().setup_flow["interview"]["turns"] == []


def test_a_file_that_cannot_be_read_is_a_plain_400(client, quiet):
    from django.core.files.uploadedfile import SimpleUploadedFile

    response = client.post(IMPORT_URL, {"file": SimpleUploadedFile("cv.pdf", b"plain text")}, format="multipart")
    assert response.status_code == 400 and "couldn't read that file" in response.json()["detail"]
    assert client.post(IMPORT_URL, {"text": "  "}, format="json").status_code == 400
    assert quiet.calls == []


def test_a_shared_file_after_setup_finished_is_refused(client, config, quiet):
    config.setup_flow = {**config.setup_flow, "status": "done"}
    config.save()
    assert client.post(IMPORT_URL, {"text": BIO}, format="json").status_code == 409
    assert quiet.calls == []


def test_about_prefills_populate_guide_without_skipping_steps(tenant_ctx, config):
    tenant_ctx.wizard_state = {
        "flow": "interview",
        "answers": {},
        "about_prefills": {
            "teaches": "Face yoga and yoga",
            "audience": "A community of women",
            "story": "I found face yoga after my PhD.",
            "location": "Studio 4",
        },
    }
    tenant_ctx.save(update_fields=["wizard_state"])

    state = interview.interview_state(tenant_ctx, config.setup_flow)
    assert state["guide"]["field"] == "teaches"
    assert any("yoga" in opt.lower() for opt in state["guide"]["prefill_options"])
    assert state["remaining"] > 0
    assert tenant_ctx.wizard_state["answers"] == {}


def test_the_bio_opens_the_first_question_and_rides_every_ai_turn(tenant_ctx, config):
    from apps.tenant_config import interview_brief as brief

    tenant_ctx.wizard_state = {"flow": "interview", "answers": {}}
    tenant_ctx.save(update_fields=["wizard_state"])
    facts = [
        {"field": "teaches", "value": "Face yoga and yoga", "items": ["Face yoga", "Yoga"]},
        {"field": "offers", "value": "Online classes", "items": ["Live online classes"]},
    ]
    with mock.patch("apps.core.onboarding.about_check.analyze", return_value={"facts": facts}):
        assert interview.apply_initial_about(tenant_ctx, "I teach face yoga and yoga online.")

    guide = interview.interview_state(tenant_ctx, config.setup_flow)["guide"]
    assert guide["field"] == "teaches" and guide["options"][:2] == ["Face yoga", "Yoga"]
    assert guide["prefill_options"] == ["Face yoga", "Yoga"]
    # Nothing is settled by the bio: she confirms each answer.
    answers = brief.answers_of(tenant_ctx)
    assert not brief.is_settled(answers, "teaches")
    turn = json.loads(interview._user_turn(tenant_ctx, answers, [], "hi", False))
    assert turn["from_bio"] == {"teaches": "Face yoga and yoga", "offers": "Online classes"}
    # How she teaches, as her bio says it, is ticked on its question.
    offers = {"options": list(brief.FIELD_BY_ID["offers"].options)}
    interview._apply_prefills_to_guide(offers, brief.FIELD_BY_ID["offers"], tenant_ctx, answers)
    assert offers["prefill_options"] == ["Live online classes"]


def test_about_items_become_ticked_tiles(tenant_ctx):
    from apps.tenant_config import interview_brief as brief

    tenant_ctx.wizard_state = {
        "about_prefills": {"audience": "Beginners and women over 50", "credentials": "Certified", "tone": "Warm"},
        "about_items": {
            "audience": ["complete beginners", "Women over 50"],
            "credentials": ["Certified face yoga method instructor since 2021.", "BBM Level 1."],
            "tone": ["Warm", "Elegant"],
        },
    }

    def guide_for(field_id, options):
        guide = {"options": options}
        interview._apply_prefills_to_guide(guide, brief.FIELD_BY_ID[field_id], tenant_ctx, {})
        return guide

    # A tile she is shown is ticked as shown; what no tile says becomes her own tile.
    audience = guide_for("audience", ["Complete beginners", "Parents"])
    assert audience["prefill_options"] == ["Complete beginners", "Women over 50"]
    # A starter question: each point is a finished sentence, never the whole text in the box.
    credentials = guide_for("credentials", ["I trained in…"])
    assert credentials["prefill_options"] == ["Certified face yoga method instructor since 2021.", "BBM Level 1."]
    assert credentials.get("prefill_text") is None
    # A fixed list takes only its own tiles.
    assert guide_for("tone", list(brief.FIELD_BY_ID["tone"].options))["prefill_options"] == ["Warm"]


def test_picking_euro_in_setup_prices_events_and_courses_in_euro(client, tenant_ctx, config, quiet):
    was = tenant_ctx.billing_currency
    try:
        _only_missing(
            tenant_ctx,
            ("currency", "event_price"),
            offers=["live"],
            payments=["event"],
            live_topic="Flow",
            live_when="Mondays at 6:00 PM",
        )
        # Even if a prior transcript turn had USD options, interview_state and the turn refresh it to EUR.
        config.setup_flow = {
            **config.setup_flow,
            "interview": {
                "turns": [
                    {
                        "role": "guide",
                        "field": "course_price",
                        "question": "What should the course cost?",
                        "options": ["$19", "$29"],
                        "why": "Prices are in USD ($), the currency you picked.",
                    },
                    {"role": "coach", "field": "course_price", "text": "$29"},
                ],
                "asked": "currency",
                "fired": [],
            },
        }
        config.save()
        _set_answers(tenant_ctx, {**_answers(tenant_ctx), "course_price": 29.0})
        body = client.post(URL, {"message": "Euro (€)", "field": "currency"}, format="json").json()
        assert Tenant.objects.get(pk=tenant_ctx.pk).billing_currency == "EUR"
        guide = body["guide"]
        assert guide["field"] == "event_price"
        assert guide["options"] == ["€5", "€10", "€15", "€20", "€25", "€35", "€50", "€75"]
        assert guide["why"] == "Prices are in EUR (€), the currency you picked."
        turns = body["state"]["interview"]["turns"]
        course_turn = next(t for t in turns if t.get("role") == "guide" and t.get("field") == "course_price")
        coach_turn = next(t for t in turns if t.get("role") == "coach" and t.get("field") == "course_price")
        assert course_turn["options"][0] == "€19"
        assert "EUR (€)" in course_turn["why"]
        assert coach_turn["text"] == "€29"
    finally:
        Tenant.objects.filter(pk=tenant_ctx.pk).update(billing_currency=was)
        tenant_ctx.billing_currency = was
