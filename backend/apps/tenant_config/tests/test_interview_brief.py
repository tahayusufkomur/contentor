"""The /setup interview brief: coercion, legacy-key sync, what is missing."""

import pytest

from apps.core.models import Tenant
from apps.tenant_config import interview_brief as brief


def test_offers_parse_from_words_and_ids():
    assert brief.coerce("offers", "A course and live online classes") == ["course", "live"]
    assert brief.coerce("offers", "course, articles") == ["course", "articles"]
    assert brief.coerce("offers", "In-person sessions at my studio") == ["onsite"]
    assert brief.coerce("offers", "nothing") is None


def test_payments_price_and_tone():
    assert brief.coerce("payments", "One-time course purchases, Monthly membership") == ["course", "membership"]
    assert brief.coerce("payments", "Pay per class or event") == ["event"]
    assert brief.coerce("payments", "Free for now") == ["free"]
    assert brief.coerce("payments", "free trial, then a monthly membership") == ["membership"]
    assert brief.coerce("payments", "they pay") == ["course"]
    assert brief.coerce("payments", "no idea") is None
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


def test_payments_sync_sells():
    answers = {}
    brief.apply_fact(answers, "payments", "Monthly membership")
    assert answers["sells"] == "paid"
    brief.apply_fact(answers, "payments", "Free for now")
    assert answers["sells"] == "free"


def test_memberships_are_a_payment_not_a_way_to_teach():
    assert "memberships" not in brief.OFFERS
    assert "Memberships" not in brief.FIELD_BY_ID["offers"].options
    assert "Monthly membership" in brief.FIELD_BY_ID["payments"].options


def test_paying_per_class_is_offered_only_to_coaches_who_run_classes():
    field = brief.FIELD_BY_ID["payments"]
    options, icons, hints = brief.options_for(field, {"offers": ["course"]})
    assert "Pay per class or event" not in options and len(options) == len(icons) == len(hints) == 3
    assert "Pay per class or event" in brief.options_for(field, {"offers": ["course", "onsite"]})[0]


def test_skipping_a_section_drops_its_questions():
    answers = {"offers": ["course", "live", "articles"], "payments": ["course", "event"]}
    ids = lambda: {f.id for f in brief.required(answers)}  # noqa: E731
    assert {"course_topic", "course_price", "course_review", "live_topic", "event_review", "article_topic"} <= ids()
    assert brief.skip(answers, "course") and brief.skip(answers, "post")
    assert not ids() & {"course_topic", "course_price", "course_review", "article_topic"}
    assert {"live_topic", "event_price", "event_review"} <= ids()
    assert not brief.skip(answers, "story")


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
    assert "course_price" not in base  # only when selling courses one by one
    assert "course_price" not in ids({"payments": ["membership"]})
    assert "memberships" in ids({"payments": ["membership"]})
    assert "course_price" in ids({"payments": ["course"]})
    assert {"live_topic", "live_when", "location"} <= set(ids({"offers": ["course", "onsite"]}))


def test_missing_skips_answered_and_delegated_in_priority_order():
    answers = {"teaches": "Pottery", "delegated": ["audience"]}
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
            "payments": ["course"],
            "course_price": 49.0,
        }
    )
    assert {"q": "Who they teach", "a": "Desk workers"} in facts
    assert {"q": "How they teach", "a": "course, live"} in facts
    assert {"q": "How students pay", "a": "course"} in facts
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


@pytest.mark.parametrize(
    ("teaches", "niche"),
    [
        ("Business coaching for owners of small service firms", "business"),
        ("Career change coaching for mid-career professionals", "business"),
        ("Natural-light portrait photography", "creative"),
        ("Loose watercolour landscapes", "creative"),
        ("Sleep and stress programmes", "wellness"),
        ("Conversational Spanish for adults", "learning"),
        ("Chess for club players", "learning"),
        ("Weeknight cooking for busy parents", "cooking"),
        ("Piano for adult beginners", "music"),
        ("First-marathon running coaching", "outdoors"),
        ("Strength training for adults over 40", "fitness"),
        ("Yoga for runners", "yoga"),
        ("Something else entirely", "general"),
    ],
)
def test_niche_for_maps_the_styled_niches(teaches, niche):
    assert brief.niche_for(teaches) == niche


def test_memberships_follow_the_offers_and_parse_from_labels():
    assert [t["id"] for t in brief.tiers_for({"offers": ["course"]})] == ["digital"]
    assert [t["id"] for t in brief.tiers_for({"offers": ["course", "live", "community"]})] == [
        "digital",
        "online",
        "community",
        "all",
    ]
    assert brief.coerce("memberships", "Studio membership, Digital membership") == ["digital", "studio"]
    assert brief.coerce("memberships", "none of those") is None
    assert brief.details_for(brief.FIELD_BY_ID["memberships"], {"offers": ["course"]}) == {
        "Digital membership": "All the pre-recorded content, watched any time."
    }
    assert brief.composer_facts({"memberships": ["digital"]}) == [
        {"q": "Memberships offered", "a": "Digital membership ($9 a month)"}
    ]


def test_only_the_guides_own_calls_can_be_left_to_it():
    delegable = {f.id for f in brief.FIELDS if f.delegable}
    assert delegable == {
        "site_style",
        "site_logo",
        "tone",
        "memberships",
        "course_topic",
        "course_price",
        "live_topic",
        "live_when",
        "event_price",
        "article_topic",
    }
    assert len(brief.FIELD_BY_ID["teaches"].options) == 8
    assert brief.FIELD_BY_ID["location"].multi and brief.FIELD_BY_ID["live_when"].kind == "schedule"
    assert brief.details_for(brief.FIELD_BY_ID["offers"], {})["Articles"].startswith("A blog")
    assert brief.parse_offers("Digital Courses, Community") == ["course", "community"]


def test_a_broad_niche_asks_its_kinds_and_the_studio_name_opens_on_them():
    from apps.tenant_config.interview import default_question, guide_for

    answers = {}
    brief.apply_fact(answers, "teaches", "Dance")
    assert brief.missing(answers)[0].id == "specialty"
    kinds = brief.options_for(brief.FIELD_BY_ID["specialty"], answers)[0]
    assert "Belly dance" in kinds and "Hip hop" in kinds
    assert default_question(brief.FIELD_BY_ID["specialty"], answers) == "Which kinds of dance do you teach?"
    brief.apply_fact(answers, "specialty", "Belly dance, Hip hop")
    assert answers["niche"] == "belly_dance" and brief.subject_of(answers) == "belly dance"
    assert "specialty" not in [f.id for f in brief.missing(answers)]

    # A specific answer needs no follow-up, and drops a stale specialty.
    brief.apply_fact(answers, "teaches", "Sourdough baking")
    assert "specialty" not in answers and "specialty" not in [f.id for f in brief.required(answers)]

    # "Bella Belly Dance" opens on the kinds of dance, several at once;
    # picking them fills the broad answer and the specialty together.
    opening = guide_for(brief.FIELD_BY_ID["teaches"], answers={}, brand="Bella Dance Academy")
    assert opening["multi"] and "Salsa & bachata" in opening["options"]
    assert opening["question"].endswith("Which kinds of dance do you teach?")
    picked = {}
    brief.apply_fact(picked, "teaches", "Belly dance, Ballet")
    assert picked["teaches"] == "Dance" and picked["specialty"] == "Belly dance, Ballet"
    assert brief.missing(picked)[0].id != "specialty"
    # A name with no niche in it keeps the broad tiles.
    plain = guide_for(brief.FIELD_BY_ID["teaches"], answers={}, brand="Studio Nova")
    assert not plain["multi"] and "Dance" in plain["options"]


def test_a_studio_named_after_one_kind_asks_only_whether_there_is_more():
    from apps.tenant_config.interview import guide_for

    brand = "Görkem's Face Yoga Studio"
    opening = guide_for(brief.FIELD_BY_ID["teaches"], answers={}, brand=brand)
    assert opening["question"].endswith("Are you only teaching face yoga?")
    assert opening["options"] == ["Only face yoga", "Face yoga and more"] and not opening["multi"]

    only = {}
    brief.apply_fact(only, "teaches", "Only face yoga")
    assert (only["teaches"], only["specialty"], only["niche"]) == ("Yoga", "Face yoga", "face_yoga")
    assert brief.missing(only)[0].id != "specialty"

    more = {}
    brief.apply_fact(more, "teaches", "Face yoga and more")
    assert more["teaches"] == "Yoga" and brief.missing(more)[0].id == "specialty"
    step = guide_for(brief.FIELD_BY_ID["specialty"], answers=more)
    assert step["question"] == "What else do you teach besides face yoga?"
    assert "Face yoga" not in step["options"] and "Yin yoga" in step["options"]
    brief.apply_fact(more, "specialty", "Yin yoga, Hatha yoga")
    assert more["specialty"] == "Face yoga, Yin yoga, Hatha yoga" and more["niche"] == "face_yoga"
