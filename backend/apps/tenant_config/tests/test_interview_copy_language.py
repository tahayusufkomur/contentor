"""The setup interview's fixed copy follows the creator's language (Task 4.4a): questions, tiles, hints, help,
acks and labels reach a Turkish creator in Turkish; tapped tiles still apply by their English identity."""

from unittest import mock

import pytest

from apps.accounts.models import User
from apps.core.models import Tenant
from apps.core.tests.i18n_utils import creator_client, gettext_in, translated
from apps.tenant_config import interview
from apps.tenant_config import interview_brief as brief
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)
HOST = "shared-test.localhost"


@pytest.fixture()
def setup_running(tenant_ctx):
    Tenant.objects.filter(pk=tenant_ctx.pk).update(wizard_state={"flow": "interview", "answers": {"photos": "stock"}})
    tenant_ctx.refresh_from_db()
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Glow")
    cfg.setup_flow = {
        "status": "active",
        "interview": {"turns": [], "fired": []},
        "draft_status": {},
        "page_builds": {},
    }
    cfg.save()
    return tenant_ctx


@pytest.fixture(autouse=True)
def _quiet():
    """No site builds or AI; the interview answers by code."""
    with (
        mock.patch("apps.tenant_config.interview_milestones.fire", return_value=[]),
        mock.patch("apps.tenant_config.interview_milestones.cards_for", return_value=None),
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=False),
    ):
        yield


@pytest.fixture()
def owner(setup_running):
    return User.objects.create_user(email="o@copylang.test", name="O", password="x", role="owner", is_staff=True)  # noqa: S106


def _state(tenant_ctx, owner, locale="tr"):
    response = creator_client(tenant_ctx, owner, locale).get("/api/v1/admin/setup-flow/", HTTP_HOST=HOST)
    assert response.status_code == 200
    return response.json()["interview"]


def test_the_state_api_asks_in_the_creator_language(setup_running, owner):
    """Teaches comes first (bio and name are skipped for a named site): question, why, tiles, help, all Turkish."""
    guide = _state(setup_running, owner)["guide"]
    field = brief.FIELD_BY_ID[guide["field"]]

    assert guide["question"] == translated(field.question)
    assert guide["options"] == [gettext_in(o, "tr") for o in field.options]  # (Yoga is Yoga in Turkish too)
    assert translated("Nutrition") in guide["options"]
    assert guide["ack"] == translated(interview.OPENING_ACK)
    if field.why:
        assert guide["why"] == translated(field.why)
    if field.help and field.help.term:
        assert guide["help"]["term"] == translated(field.help.term)


def test_english_creator_still_reads_english(setup_running, owner):
    guide = _state(setup_running, owner, "en")["guide"]
    assert guide["question"] == brief.FIELD_BY_ID[guide["field"]].question


def test_tapped_tiles_apply_by_their_english_identity(setup_running, owner):
    """A Turkish creator taps the Turkish tiles of "How will you work with your students?": the offers are stored."""
    Tenant.objects.filter(pk=setup_running.pk).update(
        wizard_state={"flow": "interview", "answers": {"photos": "stock", "teaches": "Pottery"}}
    )
    offers = brief.FIELD_BY_ID["offers"]
    picks = f"{translated(offers.options[0])}, {translated(offers.options[1])}"

    response = creator_client(setup_running, owner).post(
        "/api/v1/admin/setup-flow/turn/",
        {"message": picks, "field": "offers"},
        content_type="application/json",
        HTTP_HOST=HOST,
    )

    assert response.status_code == 200, response.content
    assert Tenant.objects.get(pk=setup_running.pk).wizard_state["answers"]["offers"] == ["course", "live"]
    # ...and the next question comes back in Turkish too: its tiles and its question.
    guide = response.json()["guide"]
    assert guide["field"] == "audience"
    assert guide["question"] == translated(brief.FIELD_BY_ID["audience"].question)
    assert guide["options"][0] == translated("Complete beginners")


def test_fixed_labels_follow_the_creator_language(setup_running):
    """Step titles, email styles, go-live pages and the hand-off lines are read in the creator's language."""
    from django.utils.translation import override

    from apps.notifications.transactional import STYLES
    from apps.tenant_config import interview_golive, interview_team, setup_flow

    flow = TenantConfig.objects.first().setup_flow
    with override("tr"):
        title = setup_flow.applicable_steps(setup_running)[0]["title"]
        style = str(STYLES[0][1])
        page = str(interview_golive._PAGE_LABELS["home"])
        lines = interview_team.handoff(setup_running, {}, flow)

    assert title == translated("Your first course")
    assert style == translated("Letter")
    assert page == translated("Home")
    assert lines[0]["next"] == translated("Ask me to change any page, any time.")
    assert lines[-1]["did"] == translated("Ran your setup.")
