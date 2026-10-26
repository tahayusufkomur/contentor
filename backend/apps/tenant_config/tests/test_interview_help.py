"""A question explains itself in place: its example, its ⓘ and its drawing come with the question
(``interview_brief.Help``). The concept slides that once taught this are gone."""

import re

import pytest

from apps.tenant_config import interview
from apps.tenant_config import interview_brief as brief
from apps.tenant_config import interview_milestones as ms
from apps.tenant_config.models import TenantConfig
from apps.tenant_config.tests.test_interview import client, config, quiet  # noqa: F401  (fixtures)

STATE_URL = "/api/v1/admin/setup-flow/"
TURN_URL = "/api/v1/admin/setup-flow/turn/"

# The drawings frontend-customer/src/components/setup-flow/help-pictures.tsx has.
PICTURES = {"team", "site", "look", "pay", "membership", "access", "course", "live", "inbox"}
# Every concept the old slides taught, and the question that now carries it.
CONCEPTS = {
    "team": "teaches",
    "site": "photos",
    "look": "site_style",
    "pay": "payments",
    "membership": "memberships",
    "access": "course_access",
    "course": "course_topic",
    "live": "live_topic",
    "inbox": "contact",
}


def test_every_concept_lands_on_its_question_with_its_drawing():
    for picture, field_id in CONCEPTS.items():
        assert brief.FIELD_BY_ID[field_id].help.picture == picture, field_id
    assert {f.help.picture for f in brief.FIELDS if f.help and f.help.picture} == PICTURES


def test_every_help_reads_in_plain_words():
    for field in brief.FIELDS:
        if field.help is None:
            continue
        assert field.help.tip or field.help.picture or field.help.example, field.id
        if field.help.tip or field.help.picture:
            assert field.help.term, field.id  # the button needs words
        text = f"{field.why} {field.help.term} {field.help.tip} {field.help.example}".lower()
        assert not re.search(r"\b(teach|teacher|teaching|coach|instructor)\b", text), field.id


def test_the_example_speaks_her_currency_and_her_studio():
    plans = brief.help_of(brief.FIELD_BY_ID["memberships"], "Glow")
    assert plans["sign"] in "$€" and plans["example"].startswith(f"The Club, {plans['sign']}19")
    assert brief.help_of(brief.FIELD_BY_ID["pitch"], "Glow")["example"].startswith("Glow: ")
    assert brief.help_of(brief.FIELD_BY_ID["pitch"])["example"].startswith("Your studio: ")
    assert brief.help_of(brief.FIELD_BY_ID["audience"]) is None


def test_the_opening_ack_says_eighteen_minutes():
    assert "about 18 minutes" in interview.OPENING_ACK


@pytest.mark.django_db
def test_the_opening_question_carries_its_help_and_no_slides(client, tenant_ctx):  # noqa: F811
    guide = client.get(STATE_URL).json()["interview"]["guide"]
    assert guide["field"] == "teaches"
    assert guide["help"]["picture"] == "team" and guide["help"]["term"]
    assert "slides" not in guide


@pytest.mark.django_db
def test_a_transcript_written_before_help_existed_still_gets_it(client, tenant_ctx, config):  # noqa: F811
    old = {"role": "guide", "field": "payments", "question": "How will students pay you?", "options": ["Free for now"]}
    config.setup_flow = {**config.setup_flow, "interview": {"turns": [old], "fired": [], "asked": "payments"}}
    config.save()
    body = client.get(STATE_URL).json()["interview"]
    assert body["turns"][0]["help"]["picture"] == "pay"
    assert body["turns"][0]["why"] == brief.FIELD_BY_ID["payments"].why


@pytest.mark.django_db
def test_a_turn_serves_the_help_of_the_next_question_without_storing_slides(client, tenant_ctx, quiet):  # noqa: F811
    quiet.reply = interview.InterviewTurn(facts=[{"field": "teaches", "value": "Yoga"}], question="", options=[])
    guide = client.post(TURN_URL, {"message": "Yoga"}, format="json").json()["guide"]
    assert "slides" not in guide and "help" in guide
    turns = TenantConfig.objects.first().setup_flow["interview"]["turns"]
    assert all("slides" not in t for t in turns)


@pytest.mark.django_db
def test_a_setup_that_recorded_slides_before_still_loads(client, tenant_ctx, config):  # noqa: F811
    config.setup_flow = {
        **config.setup_flow,
        "interview": {
            "turns": [],
            "fired": ["slides:examples"],
            "slides": {"team": "skipped", "site": "seen"},
            "slides_from": "audience",
            "slide_examples": {"course_title": "The 6-week program"},
        },
    }
    config.save()
    resp = client.get(STATE_URL)
    assert resp.status_code == 200 and "slides" not in resp.json()["interview"]["guide"]


@pytest.mark.django_db
def test_the_slide_endpoint_is_gone(client):  # noqa: F811
    assert client.post(f"{STATE_URL}slide/", {"key": "team"}, format="json").status_code == 404


@pytest.mark.django_db
def test_nothing_writes_slide_examples_any_more(tenant_ctx):
    due = ms._due(tenant_ctx, {"teaches": "Yoga", "audience": "Parents"})
    assert not [k for k in due if k.startswith("slides")]
