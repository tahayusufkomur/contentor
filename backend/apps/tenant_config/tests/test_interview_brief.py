"""The /setup interview brief: coercion, legacy-key sync, what is missing."""

import pytest

from apps.core.models import Tenant
from apps.tenant_config import interview_brief as brief


def test_offers_parse_from_words_and_ids():
    assert brief.coerce("offers", "A course and live online classes") == ["course", "live"]
    assert brief.coerce("offers", "course, articles") == ["course", "articles"]
    assert brief.coerce("offers", "In-person sessions at my studio") == ["onsite"]
    assert brief.coerce("offers", "nothing") is None


def test_sells_price_and_tone():
    assert brief.coerce("sells", "Free to start") == "free"
    assert brief.coerce("sells", "Students pay") == "paid"
    assert brief.coerce("course_price", "49 dollars") == 49.0
    assert brief.coerce("course_price", "free") == 0.0
    assert brief.coerce("course_price", "no idea") is None
    assert brief.coerce("tone", "Calm, please") == "calm"
    assert brief.coerce("tone", "Warm, Calm") == "warm, calm"  # several tones can be ticked


def test_card_fields_are_never_set_by_text():
    assert brief.coerce("site_style", "journal") is None
    assert brief.coerce("site_logo", "12") is None


def test_teaches_syncs_niche_and_description():
    answers = {}
    assert brief.apply_fact(answers, "teaches", "Face yoga for women over 40")
    assert answers["niche"] == "face_yoga"
    assert answers["description"] == "Face yoga for women over 40"
    brief.apply_fact(answers, "pitch", "I help desk workers move without pain")
    assert answers["description"] == "I help desk workers move without pain"


def test_offers_sync_goals_and_course_is_always_a_goal():
    answers = {}
    brief.apply_fact(answers, "offers", "live classes and articles")
    assert answers["offers"] == ["course", "live", "articles"]
    assert answers["goals"] == ["run_live_classes", "sell_courses", "write_blog"]


def test_unknown_field_and_blank_text_are_rejected():
    answers = {}
    assert not brief.apply_fact(answers, "favourite_colour", "blue")
    assert not brief.apply_fact(answers, "story", "   ")
    assert answers == {}


def test_required_follows_offers_and_selling():
    ids = lambda a: [f.id for f in brief.required(a)]  # noqa: E731
    base = ids({})
    assert "live_topic" not in base and "article_topic" not in base and "location" not in base
    assert "course_topic" in base  # a first course is always needed to publish
    assert "course_price" not in base  # only when selling
    assert "course_price" in ids({"sells": "paid"})
    assert {"live_topic", "live_when", "location"} <= set(ids({"offers": ["course", "onsite"]}))


def test_missing_skips_answered_and_delegated_in_priority_order():
    answers = {"teaches": "Yoga", "delegated": ["audience"]}
    assert [f.id for f in brief.missing(answers)][:2] == ["outcome", "offers"]


def test_delegate_then_answer_clears_delegation():
    answers = {}
    assert brief.delegate(answers, "tone")
    assert brief.is_settled(answers, "tone")
    brief.apply_fact(answers, "tone", "warm")
    assert answers["delegated"] == []
    assert not brief.delegate(answers, "nope")


def test_settled_ignores_fields_that_are_not_required():
    assert brief.settled({"offers": ["course"]}, ("offers", "live_when"))


def test_composer_facts_label_values():
    facts = brief.composer_facts(
        {
            "teaches": "Yoga",
            "audience": "Desk workers",
            "offers": ["course", "live"],
            "sells": "paid",
            "course_price": 49.0,
        }
    )
    assert {"q": "Who they teach", "a": "Desk workers"} in facts
    assert {"q": "What they offer", "a": "course, live"} in facts
    assert {"q": "First course price", "a": "49"} in facts
    assert not any(f["q"] == "What they teach" for f in facts)  # rides in description


def test_migrate_legacy_prefills_once():
    old = {
        "niche": "pilates",
        "description": "Reformer for runners",
        "goals": ["sell_courses", "write_blog"],
        "style": "grid",
        "logo": {"mode": "curated", "curated_id": 7},
    }
    out = brief.migrate_legacy(old)
    assert out["teaches"] == "pilates"
    assert out["pitch"] == "Reformer for runners"
    assert out["offers"] == ["course", "articles"]
    assert out["site_style"] == "grid"
    assert out["site_logo"] == "7"
    assert brief.migrate_legacy({**old, "teaches": "Mat pilates"})["teaches"] == "Mat pilates"


@pytest.mark.django_db
def test_answers_round_trip_and_interview_tenants_skip_migration(tenant_ctx):
    Tenant.objects.filter(pk=tenant_ctx.pk).update(
        wizard_state={"flow": "interview", "answers": {"style": "journal"}, "site_plan": {"x": 1}}
    )
    tenant_ctx.refresh_from_db()
    answers = brief.answers_of(tenant_ctx)
    assert "site_style" not in answers  # new-flow tenants answer style by card
    answers["teaches"] = "Yoga"
    brief.save_answers(tenant_ctx, answers)
    state = Tenant.objects.get(pk=tenant_ctx.pk).wizard_state
    assert state["answers"]["teaches"] == "Yoga"
    assert state["site_plan"] == {"x": 1}  # other keys survive
    assert state["interview_last_at"]


@pytest.mark.django_db
def test_save_merges_only_this_turns_changes(tenant_ctx):
    """Review finding 4: two tabs must not wipe each other's answers."""
    Tenant.objects.filter(pk=tenant_ctx.pk).update(wizard_state={"flow": "interview", "answers": {"teaches": "Yoga"}})
    tenant_ctx.refresh_from_db()
    base = brief.answers_of(tenant_ctx)
    mine = dict(base)
    mine["audience"] = "Desk workers"
    # Meanwhile another tab picked a style and corrected `teaches`.
    Tenant.objects.filter(pk=tenant_ctx.pk).update(
        wizard_state={"flow": "interview", "answers": {"teaches": "Pilates", "site_style": "grid"}}
    )
    brief.save_answers(tenant_ctx, mine, base=base)
    saved = Tenant.objects.get(pk=tenant_ctx.pk).wizard_state["answers"]
    assert saved == {"teaches": "Pilates", "site_style": "grid", "audience": "Desk workers"}
    assert tenant_ctx.wizard_state["answers"] == saved


def test_field_icons_and_hints_line_up_with_options():
    for f in brief.FIELDS:
        assert len(f.icons) in (0, len(f.options)), f.id
        assert len(f.hints) in (0, len(f.options)), f.id
        assert set(f.icons) <= set(brief.ICONS), f.id
    assert brief.FIELD_BY_ID["teaches"].icons[0] == "flower-2"
    assert brief.FIELD_BY_ID["tone"].hints[0].startswith("Come as you are")
    assert len(set(brief.ICONS)) == len(brief.ICONS)  # no duplicates
