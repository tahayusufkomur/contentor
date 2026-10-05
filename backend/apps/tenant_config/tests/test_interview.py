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
            {"field": "teaches", "value": "Yoga"},
            {"field": "audience", "value": "Desk workers"},
            {"field": "made_up", "value": "x"},
        ],
        ack="Yoga for desk workers, lovely.",
        next_field="outcome",
        question="What changes for them after a month with you?",
        options=["Less back pain", "Better sleep"],
    )
    body = client.post(URL, {"message": "I teach yoga to desk workers"}, format="json").json()
    assert _answers(tenant_ctx)["teaches"] == "Yoga" and _answers(tenant_ctx)["audience"] == "Desk workers"
    assert "made_up" not in _answers(tenant_ctx)
    assert body["guide"]["field"] == "outcome"
    assert body["guide"]["question"] == "What changes for them after a month with you?"
    assert body["guide"]["can_delegate"] is True
    assert body["state"]["interview"]["remaining"] > 0


def test_ai_asking_a_known_field_falls_back_to_priority(client, quiet):
    quiet.reply = interview.InterviewTurn(
        facts=[{"field": "teaches", "value": "Yoga"}], ack="Nice.", next_field="teaches", question="What do you teach?"
    )
    body = client.post(URL, {"message": "Yoga"}, format="json").json()
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
    client.post(URL, {"message": "Yoga"}, format="json")
    client.post(URL, {"message": "Busy parents"}, format="json")
    assert _answers(tenant_ctx)["audience"] == "Busy parents"


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
    assert turns[0] == {"role": "coach", "text": "I teach vinyasa yoga"}
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


def test_card_fields_are_asked_by_code_not_ai(client, tenant_ctx, quiet):
    answers = {
        "teaches": "Yoga",
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
    assert '"course_price"' in sent and '"live_when"' in sent


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
