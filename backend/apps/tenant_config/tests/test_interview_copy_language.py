"""The setup interview's fixed copy follows the creator's language (Task 4.4a): questions, tiles, hints, help,
acks and labels reach a Turkish creator in Turkish; tapped tiles still apply by their English identity."""

import json
from unittest import mock

import pytest
from django.utils.translation import override

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


def _answers(**more):
    return {"photos": "stock", "teaches": "Pottery", **more}


def test_the_contact_question_takes_the_turkish_labels_and_details(setup_running, owner):
    """The ways are ticked by their Turkish labels: the details are stored under the English ways."""
    from apps.tenant_config import interview_brief

    email, phone = translated("Email"), translated("Phone")
    response = creator_client(setup_running, owner).post(
        "/api/v1/admin/setup-flow/turn/",
        {
            "message": "",
            "choice": {
                "field": "contact",
                "value": json.dumps({email: "maya@example.com", phone: "+49 170 1234567"}),
            },
        },
        content_type="application/json",
        HTTP_HOST=HOST,
    )

    assert response.status_code == 200, response.content
    stored = Tenant.objects.get(pk=setup_running.pk).wizard_state["answers"]["contact"]
    assert stored == "Email: maya@example.com; Phone: +49 170 1234567"
    # ...and the signup email is prefilled under the label the screen shows.
    with override("tr"):
        assert list(interview.prefill_for("contact", {})) == [interview_brief.tx("Email")]


def test_a_german_pick_of_tiles_with_commas_maps_back(setup_running, owner):
    """ "Jeder, der den Kurs kauft" holds a comma: buy and a membership both reach the answers."""
    answers = _answers(offers=["course"], payments=["course", "membership"], memberships=["digital"])
    Tenant.objects.filter(pk=setup_running.pk).update(wizard_state={"flow": "interview", "answers": answers})
    field = brief.FIELD_BY_ID["course_access"]
    with override("de"):
        buy, member = brief.tx("Anyone who buys the course"), brief.tx("Digital membership")
        assert "," in buy  # (the reason for this test)
        assert (
            brief.english_picks(f"{buy}, {member}", field, answers) == "Anyone who buys the course, Digital membership"
        )

    response = creator_client(setup_running, owner, "de").post(
        "/api/v1/admin/setup-flow/turn/",
        {"message": f"{buy}, {member}", "field": "course_access"},
        content_type="application/json",
        HTTP_HOST=HOST,
    )

    assert response.status_code == 200, response.content
    assert Tenant.objects.get(pk=setup_running.pk).wizard_state["answers"]["course_access"] == ["buy", "digital"]


def test_names_in_sentences_keep_german_nouns_and_turkish_acronyms():
    with override("de"):
        assert brief.name_shown("dance") == "Tanz"
    with override("tr"):
        assert brief.name_shown("hiit") == "HIIT"
        assert brief.name_shown("yoga") == "yoga"
    assert brief.name_shown("dance") == "dance"


def test_bio_ticks_the_translated_tiles(setup_running):
    """The bio import names English tiles; a Turkish creator sees them ticked as Turkish tiles, her own words kept."""
    Tenant.objects.filter(pk=setup_running.pk).update(
        wizard_state={
            "flow": "interview",
            "answers": _answers(),
            "about_prefills": {"offers": "Digital content", "audience": "Complete beginners, Night owls"},
            "about_items": {"audience": ["Complete beginners", "Night owls"]},
        }
    )
    setup_running.refresh_from_db()
    with override("tr"):
        offers = interview.guide_for(brief.FIELD_BY_ID["offers"], answers=_answers())
        interview._apply_prefills_to_guide(offers, brief.FIELD_BY_ID["offers"], setup_running, _answers())
        audience = interview.guide_for(brief.FIELD_BY_ID["audience"], answers=_answers())
        interview._apply_prefills_to_guide(audience, brief.FIELD_BY_ID["audience"], setup_running, _answers())

    assert offers["prefill_options"] == [translated("Digital content")]
    assert audience["prefill_options"] == [translated("Complete beginners"), "Night owls"]


def test_a_weekly_membership_tile_and_the_team_names_are_translated():
    with override("tr"):
        tile = brief.tx("Weekly face yoga classes")
        note, _owner = interview.started_note(["draft:course"])
    assert tile != "Weekly face yoga classes" and "face yoga" not in tile.lower().replace("yoga", "")
    assert "Content Creating Specialist" not in note and "İçerik Üretim Uzmanı" in note


def test_the_summary_keeps_each_sentence_whole(setup_running):
    """ "%(when)s, members only" is one sentence in the catalog, not a suffix glued on."""
    assert translated("%(when)s, members only")
    assert translated("%(when)s, %(price)s each")


def test_a_turkish_label_with_a_dotted_capital_maps_back_in_a_multi_pick():
    """ "İ" lowers to two characters in Python: the pick still maps, wherever the label stands."""
    field = brief.FIELD_BY_ID["contact"]
    with override("tr"):
        form = brief.tx("Contact form")
        assert form.startswith("İ")
        assert brief.english_picks(f"{form}, WhatsApp", field, {}) == "Contact form, WhatsApp"
        assert brief.english_picks(f"WhatsApp, {form}", field, {}) == "WhatsApp, Contact form"
        assert brief.english_picks(f"{form}, my own way", field, {}) == "Contact form, my own way"


def test_her_own_words_with_a_dotted_capital_keep_their_letters_in_any_language():
    """A Turkish name typed in an en/de/pl UI: the tile still maps, her words are kept exactly as typed."""
    field = brief.FIELD_BY_ID["contact"]
    for lang in ("en", "de", "pl", "tr"):
        with override(lang):
            email = brief.tx("Email")
            assert brief.english_picks(f"{email}, İstanbul Yoga Studio", field, {}) == "Email, İstanbul Yoga Studio"
            assert brief.english_picks("İstanbul Yoga Studio, IŞIK", field, {}) == "İstanbul Yoga Studio, IŞIK"


def test_english_names_in_sentences_are_left_as_written():
    """Only our own tile names are lower-cased mid-sentence; hers and proper names keep their case."""
    assert brief.tx("Mostly Pottery") == "Mostly Pottery"
    assert brief.name_shown("Pottery") == "Pottery"
    assert brief.name_shown("Face yoga") == "face yoga"


def test_a_turn_stored_without_ids_gets_them(setup_running):
    """A transcript turn from before the guide sent ids: they are read off its tiles."""
    turn = {"role": "guide", "field": "contact", "options": ["E-posta", "Telefon", "Foo"]}
    with override("tr"):
        fresh = interview._refresh_turn(turn, {}, "Glow")
    assert fresh["ids"] == ["Email", "Phone", "Foo"]
