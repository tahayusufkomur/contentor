"""The slide catalogue: which slides are due before a question, and how a slide
renders with the coach's examples or the field-neutral fallback. Pure functions."""

import importlib
import re

import pytest
from django.apps import apps as django_apps

from apps.tenant_config import interview
from apps.tenant_config import interview_brief as brief
from apps.tenant_config import interview_slides as slides
from apps.tenant_config.interview_slides import END, SLIDE_BY_KEY
from apps.tenant_config.models import TenantConfig
from apps.tenant_config.tests.test_interview import client, config, quiet  # noqa: F401  (fixtures)

STATE_URL = "/api/v1/admin/setup-flow/"
SLIDE_URL = "/api/v1/admin/setup-flow/slide/"
TURN_URL = "/api/v1/admin/setup-flow/turn/"

PLAUSIBLE = {
    "offers": ["course"],
    "payments": ["course"],
    "course_price": 29,
    "event_price": 29,
    "onsite_price": 29,
    "photos": "stock",
}


def _settled_through(field_id, **over) -> dict:
    """Every field before ``field_id`` (brief.FIELDS order) answered; ``over`` replaces or adds keys."""
    answers = {}
    for f in brief.FIELDS:
        if f.id == field_id:
            break
        answers[f.id] = PLAUSIBLE.get(f.id, "x")
    return {**answers, **over}


def keys_due_at(field_id, answers, record=None) -> list[str]:
    return [s.key for s in slides.due(field_id, answers, record or {}, None)]


def test_opening_slide_is_due_before_the_first_question():
    assert [s.key for s in slides.due("teaches", {}, {}, None)] == ["team"]


def test_recorded_slides_never_come_back():
    assert slides.due("teaches", {}, {"team": "skipped"}, None) == []


def test_slide_for_a_field_answered_in_passing_shows_before_the_next_question():
    # One sentence at the first question settled offers and audience, so offers is never asked.
    answers = {"teaches": "Yoga", "photos": "stock", "audience": "Parents", "offers": ["course", "live"]}
    record = {"team": "seen", "site": "seen"}
    # the model moved on to a later question: the ways slide still shows first, the unsettled pitch's does not
    assert [s.key for s in slides.due("difference", answers, record, None)] == ["ways"]
    # in order, the next question is the pitch: both slides show, ways first
    assert [s.key for s in slides.due("pitch", answers, record, None)] == ["ways", "reach"]


def test_a_slide_waits_for_its_own_question_when_the_model_reorders():
    # pitch not settled; the model asked story first: the reach slide is not due yet
    answers = {"teaches": "Yoga", "photos": "stock", "audience": "Parents", "outcome": "Calm", "offers": ["course"]}
    record = {"team": "seen", "site": "seen", "ways": "seen"}
    assert "reach" not in [s.key for s in slides.due("story", answers, record, None)]


def test_conditional_slides_follow_what_was_picked():
    base = _settled_through("memberships")
    assert "membership" not in keys_due_at("memberships", base)  # not required without a membership
    assert "access" in keys_due_at("course_access", {**base, "course_topic": "Reset"})
    assert "live" not in keys_due_at("course_topic", base)
    with_membership = _settled_through("memberships", payments=["course", "membership"])
    assert "membership" in keys_due_at("memberships", with_membership)


def test_skipped_section_takes_its_slides():
    answers = _settled_through("article_topic", offers=["course"], skipped=["course"])
    assert not {"course", "access"} & set(keys_due_at("article_topic", answers))


def test_slides_from_hides_slides_behind_it():
    answers = _settled_through("pitch")
    assert [s.key for s in slides.due("pitch", answers, {}, "pitch")] == ["reach"]
    assert slides.due(None, answers, {}, slides.END) == []


def test_no_slides_at_go_live():
    assert slides.due(None, {"teaches": "Yoga"}, {}, None) == []


def test_first_is_true_only_on_a_presenters_first_slide():
    rendered = slides.render([SLIDE_BY_KEY["pay"], SLIDE_BY_KEY["membership"]], {}, None, {}, "Glow")
    assert [r["first"] for r in rendered] == [True, False]
    rendered = slides.render([SLIDE_BY_KEY["membership"]], {}, None, {"pay": "seen"}, "Glow")
    assert rendered[0]["first"] is False


def test_fallback_render_names_the_brand_and_has_a_picture():
    team = slides.render([SLIDE_BY_KEY["team"]], {}, None, {}, "Glow Face Yoga")[0]
    assert team["body"].startswith("Glow Face Yoga comes with a team.")
    pay = slides.render([SLIDE_BY_KEY["pay"]], {}, None, {}, "Glow")[0]
    assert len(pay["picture"]["students"]) == 3


def test_pictures_use_the_coachs_examples_and_fall_back_per_piece():
    examples = {
        "course_title": "Face yoga reset",
        "course_price": 59,
        "class_price": 12,
        "memberships": [{"name": "Glow Club", "price": 25, "covers": "Every class"}],  # one short of two
        "students": [{"name": "Mia", "about": "Mum of two"}] * 3,
    }
    pay = slides.render([SLIDE_BY_KEY["pay"]], {}, examples, {}, "Glow")[0]["picture"]["students"]
    assert [s["name"] for s in pay] == ["Mia"] * 3
    assert pay[0]["months"] == [brief.money(59), None, None]
    assert pay[1]["months"] == [brief.money(25)] * 3
    assert pay[2]["months"] == [brief.money(12), None, brief.money(12)]
    plans = slides.render([SLIDE_BY_KEY["membership"]], {}, examples, {}, "Glow")[0]["picture"]["plans"]
    assert [p["name"] for p in plans] == ["The Club", "Course library"]  # too few: whole list falls back
    course = slides.render([SLIDE_BY_KEY["course"]], {}, examples, {}, "Glow")[0]["picture"]
    assert course["title"] == "Face yoga reset"
    assert course["modules"] == slides.FALLBACK["modules"]


def test_malformed_examples_fall_back_without_crashing():
    junk = {"students": [{"name": "Mia"}], "memberships": "no", "course_price": "free", "lessons": "many"}
    for slide in slides.SLIDES:
        rendered = slides.render([slide], {}, junk, {}, "Glow")[0]
        assert rendered["picture"] == slides.render([slide], {}, None, {}, "Glow")[0]["picture"]


def test_copy_keeps_the_words_rule():
    for s in slides.SLIDES:
        text = f"{s.title} {s.body}".lower()
        assert not re.search(r"\b(teach|teacher|teaching|coach|instructor)\b", text), s.key


def test_opening_ack_says_eighteen_minutes():
    assert "about 18 minutes" in interview.OPENING_ACK


@pytest.mark.django_db
def test_state_opens_on_the_team_slide(client, tenant_ctx):  # noqa: F811
    guide = client.get(STATE_URL).json()["interview"]["guide"]
    assert [s["key"] for s in guide["slides"]] == ["team"] and guide["slides"][0]["by"] == "assistant"


@pytest.mark.django_db
def test_state_serves_only_unrecorded_slides(client, tenant_ctx):  # noqa: F811
    assert client.post(SLIDE_URL, {"key": "team", "skipped": True}, format="json").status_code == 204
    guide = client.get(STATE_URL).json()["interview"]["guide"]
    assert guide["slides"] == []
    assert TenantConfig.objects.first().setup_flow["interview"]["slides"] == {"team": "skipped"}


@pytest.mark.django_db
def test_seen_is_recorded_beside_earlier_slides(client, tenant_ctx):  # noqa: F811
    client.post(SLIDE_URL, {"key": "team", "skipped": True}, format="json")
    client.post(SLIDE_URL, {"key": "site"}, format="json")
    assert TenantConfig.objects.first().setup_flow["interview"]["slides"] == {"team": "skipped", "site": "seen"}


@pytest.mark.django_db
def test_unknown_slide_is_400(client):  # noqa: F811
    resp = client.post(SLIDE_URL, {"key": "nope"}, format="json")
    assert resp.status_code == 400 and resp.json() == {"detail": "unknown slide"}


@pytest.mark.django_db
def test_slide_is_refused_once_setup_is_over(client, tenant_ctx, config):  # noqa: F811
    config.setup_flow = {**config.setup_flow, "status": "done"}
    config.save()
    assert client.post(SLIDE_URL, {"key": "team"}, format="json").status_code == 409


@pytest.mark.django_db
def test_turn_attaches_slides_without_storing_them(client, tenant_ctx, quiet):  # noqa: F811
    quiet.reply = interview.InterviewTurn(facts=[{"field": "teaches", "value": "Yoga"}], question="", options=[])
    body = client.post(TURN_URL, {"message": "Yoga"}, format="json").json()
    assert "slides" in body["guide"]
    turns = TenantConfig.objects.first().setup_flow["interview"]["turns"]
    assert all("slides" not in t for t in turns)


@pytest.mark.django_db
def test_baseline_migration_skips_slides_behind_the_asked_field(tenant_ctx, config):  # noqa: F811
    migration = importlib.import_module("apps.tenant_config.migrations.0036_setup_slides_baseline")

    def run(interview_data):
        config.setup_flow = {"status": "active", "interview": interview_data}
        config.save()
        migration.baseline(django_apps, None)
        return TenantConfig.objects.first().setup_flow["interview"]

    turn = [{"role": "guide", "field": "pitch"}]
    assert run({"turns": turn, "asked": "pitch"})["slides_from"] == "pitch"
    assert "slides_from" not in run({"turns": []})
    assert run({"turns": turn, "asked": None})["slides_from"] == END
    untouched = run({"turns": turn, "asked": "pitch", "slides": {"team": "seen"}})
    assert "slides_from" not in untouched and untouched["slides"] == {"team": "seen"}
