"""The /setup interview brief: coercion, legacy-key sync, what is missing."""

import pytest

from apps.core.constants import CURRENCY_CHOICES
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


def test_offers_are_what_the_coach_picked():
    """Audit R5: courses were forced on a coach who teaches live only."""
    answers = {}
    brief.apply_fact(answers, "offers", "live classes and articles")
    assert answers["offers"] == ["live", "articles"]
    assert answers["goals"] == ["run_live_classes", "write_blog"]


def test_a_coach_who_teaches_live_only_is_never_asked_about_a_course():
    answers = {"offers": ["live", "community"], "payments": ["membership", "event"]}
    assert not {f.id for f in brief.required(answers)} & {"course_topic", "course_price", "course_review"}
    payments = brief.FIELD_BY_ID["payments"]
    assert "One-time course purchases" not in brief.options_for(payments, answers)[0]
    assert "One-time course purchases" in brief.options_for(payments, {"offers": ["course"]})[0]


def test_memberships_promise_only_what_the_coach_offers():
    answers = {"offers": ["live", "community"]}
    tiers = brief.tiers_for(answers)
    assert [t["id"] for t in tiers] == ["online", "community", "all"]
    assert not any("course" in " ".join([t["blurb"], *t["perks"]]).lower() for t in tiers)
    assert "course" not in brief.details_for(brief.FIELD_BY_ID["memberships"], answers)["Online membership"].lower()
    assert brief.default_tier(answers) == "online"
    # Nothing to bundle into a membership: it isn't offered as a way to pay.
    articles = {"offers": ["articles"]}
    assert brief.tiers_for(articles) == []
    assert "Monthly membership" not in brief.options_for(brief.FIELD_BY_ID["payments"], articles)[0]


def test_unknown_field_and_blank_text_are_rejected():
    answers = {}
    assert not brief.apply_fact(answers, "favourite_colour", "blue")
    assert not brief.apply_fact(answers, "story", "   ")
    assert answers == {}


def test_required_follows_offers_and_selling():
    ids = lambda a: [f.id for f in brief.required(a)]  # noqa: E731
    base = ids({})
    assert "live_topic" not in base and "article_topic" not in base and "location" not in base
    assert "course_topic" not in base  # only for a coach who offers courses
    assert {"course_topic", "course_review"} <= set(ids({"offers": ["course"]}))
    assert "course_price" not in ids({"offers": ["course"]})  # only when selling courses one by one
    assert "course_price" not in ids({"offers": ["course"], "payments": ["membership"]})
    assert "memberships" in ids({"payments": ["membership"]})
    assert "course_price" in ids({"offers": ["course"], "payments": ["course"]})
    # Each kind of session asks its own questions.
    assert {"onsite_topic", "onsite_when", "location", "onsite_review"} <= set(ids({"offers": ["course", "onsite"]}))
    assert not {"live_topic", "live_when", "event_review"} & set(ids({"offers": ["course", "onsite"]}))
    assert {"live_topic", "live_when", "event_review"} <= set(ids({"offers": ["course", "live"]}))
    assert not {"onsite_topic", "onsite_when", "onsite_review"} & set(ids({"offers": ["course", "live"]}))


def test_missing_skips_answered_and_delegated_in_priority_order():
    answers = {"teaches": "Pottery", "delegated": ["audience"]}
    assert [f.id for f in brief.missing(answers)][:3] == ["photos", "outcome", "offers"]


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
    assert {"q": "Who they work with", "a": "Desk workers"} in facts
    assert {"q": "How they work", "a": "course, live"} in facts
    assert {"q": "How students pay", "a": "course"} in facts
    assert {"q": "First course price", "a": "49"} in facts
    assert not any(f["q"] == "What they offer" for f in facts)  # rides in description


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
        ("Boxing for kids", "fitness"),
        ("Karate for kids", "martial_arts"),
        ("Brazilian jiu-jitsu", "martial_arts"),
        ("Hip hop and latin dance", "dance"),
        ("Python for data analysis", "tech"),
        ("Parenting toddlers", "family"),
        ("Astrology and tarot readings", "spiritual"),
        ("Skincare routines that work", "beauty"),
        ("Hair styling at home", "beauty"),
        ("Pottery and ceramics", "crafts"),
        ("Creative writing for novelists", "writing"),
        ("Something else entirely", "general"),
    ],
)
def test_niche_for_maps_the_styled_niches(teaches, niche):
    assert brief.niche_for(teaches) == niche


def test_her_membership_prices_show_on_the_tiles_and_in_the_facts():
    answers = {"offers": ["course"], "memberships": ["digital"], "membership_prices": {"digital": 12.0}}
    _, _, hints = brief.options_for(brief.FIELD_BY_ID["memberships"], answers)
    assert hints == ("$12 a month",)
    assert {"q": "Memberships offered", "a": "Digital membership ($12 a month)"} in brief.composer_facts(answers)
    assert brief.membership_prices(answers) == {"Digital membership": 12.0}
    assert brief.membership_prices({"offers": ["course"]}) == {"Digital membership": 9}


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
        "calendar_view",
        "email_style",
        "navbar_layout",
        "footer_layout",
        "tone",
        "memberships",
        "course_topic",
        "course_price",
        "course_access",
        "live_topic",
        "live_when",
        "event_price",
        "event_access",
        "onsite_topic",
        "onsite_when",
        "onsite_price",
        "onsite_access",
        "article_topic",
    }
    assert len(brief.FIELD_BY_ID["teaches"].options) == 8
    assert brief.FIELD_BY_ID["location"].kind == "address" and brief.FIELD_BY_ID["live_when"].kind == "schedule"
    assert brief.details_for(brief.FIELD_BY_ID["offers"], {})["Articles"].startswith("A blog")
    assert brief.parse_offers("Digital Courses, Community") == ["course", "community"]


def test_a_broad_niche_asks_its_kinds_and_the_studio_name_opens_on_them():
    from apps.tenant_config.interview import default_question, guide_for

    answers = {}
    brief.apply_fact(answers, "teaches", "Dance")
    assert brief.missing(answers)[0].id == "specialty"
    kinds = brief.options_for(brief.FIELD_BY_ID["specialty"], answers)[0]
    assert "Belly dance" in kinds and "Hip hop" in kinds
    assert default_question(brief.FIELD_BY_ID["specialty"], answers) == "Which kinds of dance do you offer?"
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
    assert opening["question"].endswith("Which kinds of dance do you offer?")
    picked = {}
    brief.apply_fact(picked, "teaches", "Belly dance, Ballet")
    assert picked["teaches"] == "Dance" and picked["specialty"] == "Belly dance, Ballet"
    assert brief.missing(picked)[0].id != "specialty"
    # A name with no niche in it keeps the broad tiles: several, and her own beside them.
    plain = guide_for(brief.FIELD_BY_ID["teaches"], answers={}, brand="Studio Nova")
    assert plain["multi"] and plain["custom"] and "Dance" in plain["options"]
    # Free-form several picks take the coach's own options; fixed lists never do.
    assert guide_for(brief.FIELD_BY_ID["specialty"], answers={"teaches": "Dance"})["custom"]
    assert not guide_for(brief.FIELD_BY_ID["offers"], answers={})["custom"]


def test_a_studio_named_after_one_kind_asks_only_whether_there_is_more():
    from apps.tenant_config.interview import guide_for

    brand = "Görkem's Face Yoga Studio"
    opening = guide_for(brief.FIELD_BY_ID["teaches"], answers={}, brand=brand)
    assert opening["question"].endswith("Do you only offer face yoga?")
    assert opening["options"] == ["Only face yoga", "Face yoga and more"] and not opening["multi"]

    only = {}
    brief.apply_fact(only, "teaches", "Only face yoga")
    assert (only["teaches"], only["specialty"], only["niche"]) == ("Yoga", "Face yoga", "face_yoga")
    assert brief.missing(only)[0].id != "specialty"

    more = {}
    brief.apply_fact(more, "teaches", "Face yoga and more")
    assert more["teaches"] == "Yoga" and brief.missing(more)[0].id == "specialty"
    step = guide_for(brief.FIELD_BY_ID["specialty"], answers=more)
    assert step["question"] == "What else do you offer besides face yoga?"
    assert "Face yoga" not in step["options"] and "Yin yoga" in step["options"]
    brief.apply_fact(more, "specialty", "Yin yoga, Hatha yoga")
    assert more["specialty"] == "Face yoga, Yin yoga, Hatha yoga" and more["niche"] == "face_yoga"


def test_socials_are_read_from_the_coachs_words():
    assert brief.parse_socials("Instagram: @maya and https://www.youtube.com/@mayaflow") == {
        "instagram": "https://instagram.com/maya",
        "youtube": "https://www.youtube.com/@mayaflow",
    }
    assert brief.parse_socials("javascript:alert(1)") == {}
    assert brief.coerce("socials", "none yet") == brief.NO_SOCIALS
    assert brief.coerce("socials", "just my cat") is None


def test_the_calendar_layout_is_asked_only_of_a_coach_who_runs_classes_after_the_first_class():
    ids = lambda answers: [f.id for f in brief.required(answers)]  # noqa: E731
    for offers, review in ((["live"], "event_review"), (["onsite"], "onsite_review")):
        order = ids({"offers": offers})
        assert order.index("calendar_view") == order.index(review) + 1
    assert "calendar_view" not in ids({"offers": ["course"]})
    # The calendar goes only when every kind of session she runs is skipped.
    answers = {"offers": ["live", "onsite"]}
    assert brief.skip(answers, "event")
    assert "calendar_view" in ids(answers)
    assert brief.skip(answers, "onsite")
    assert "calendar_view" not in ids(answers)
    # The Calendar link is on by default; that one is never asked.
    assert "calendar_nav" not in brief.FIELD_BY_ID


def test_the_header_and_footer_layouts_close_the_interview_once_every_page_is_known():
    for answers in ({"offers": ["course"]}, {"offers": ["live", "onsite", "articles"], "payments": ["membership"]}):
        order = [f.id for f in brief.required(answers)]
        assert order[-2:] == ["navbar_layout", "footer_layout"]
    # Cards: the model never fills them from the coach's words.
    assert brief.coerce("navbar_layout", "the pill one") is None
    assert brief.FIELD_BY_ID["navbar_layout"].kind in brief.CARD_KINDS


def test_tone_hints_follow_the_niche_and_the_model_when_it_wrote_them():
    # A yoga-family coach gets yoga lines, never another niche's, and the model's own lines win.
    assert brief.tone_hints_for({"teaches": "face yoga"})[0].startswith("Come as you are")
    assert "sock" not in " ".join(brief.tone_hints_for({"teaches": "face yoga"})).lower()
    assert brief.tone_hints_for({"teaches": "Dance"}) != brief.tone_hints_for({"teaches": "Yoga"})
    written = tuple("abcdefgh")
    assert brief.tone_hints_for({"teaches": "Dance", "tone_hints": list(written)}) == written
    assert brief.tone_hints_for({"teaches": "Dance", "tone_hints": ["only", "two"]}) == brief.tone_hints_for(
        {"teaches": "Dance"}
    )


def test_every_tone_has_a_tile_an_icon_and_a_line_on_every_niche():
    """The sexy, confident and sensual moods were missing from the tone question."""
    tone = brief.FIELD_BY_ID["tone"]
    assert brief.coerce("tone", "Confident, Sensual and Sexy") == "confident, sensual, sexy"
    assert brief.coerce("tone", "sultry, feminine") == "sensual, sexy"  # synonyms land on the eight tones
    assert brief.coerce("tone", "glam and fun") == "playful, confident"
    assert len(tone.options) == len(tone.icons) == len(brief.TONES) == 8
    assert all(len(hints) == len(brief.TONES) for hints in brief.TONE_HINTS.values())
    assert all(icon in brief.ICONS for icon in tone.icons)


@pytest.mark.parametrize(
    ("raw", "price"),
    [
        ("29", 29.0),
        ("$15", 15.0),
        ("Free first class, then $15", 15.0),  # audit G1: was saved as free
        ("free", 0.0),
        ("Free for now", 0.0),
        ("Pay what you can", None),
        ("12,50", 12.5),
    ],
)
def test_parse_price_takes_the_number_over_free(raw, price):
    assert brief.parse_price(raw) == price


@pytest.mark.parametrize(
    ("network", "raw", "ok"),
    [
        ("instagram", "@mira.yoga", True),
        ("instagram", "mira yoga house", False),
        ("instagram", "https://www.instagram.com/mira.yoga/?hl=en", True),
        ("youtube", "youtu.be/abc", True),
        ("x", "twitter.com/mira", True),
        ("tiktok", "", False),
        ("instagram", "mira.yoga.", True),
        # A link has to be on the network's own site, with a profile after it.
        ("instagram", "instagram.com/mira.yoga", True),
        ("instagram", "facebook.com/mira", False),
        ("instagram", "https://tiktok.com/@mira", False),
        ("instagram", "instagram.com", False),
        ("instagram", "www.facebook.com", False),
    ],
)
def test_social_url_table_the_browser_mirrors(network, raw, ok):
    """Review focus 5: lib/interview.ts socialOk runs the same table."""
    assert (brief.social_url(network, raw) is not None) is ok


def test_time_zone_and_currency_are_read_from_a_pick_or_the_coachs_words():
    assert brief.coerce("timezone", "Europe/Berlin") == "Europe/Berlin"
    assert brief.coerce("timezone", "new york") == "America/New_York"
    assert brief.coerce("timezone", "somewhere warm") is None
    assert brief.coerce("currency", "Euro (€)") == "EUR"
    assert brief.coerce("currency", "US Dollar ($)") == "USD"
    assert brief.coerce("currency", "dollars please") == "USD"
    assert brief.coerce("currency", "gold") is None
    # Both are asked of every coach, right before how students pay.
    ids = [f.id for f in brief.required({})]
    assert ids[ids.index("payments") - 2 : ids.index("payments")] == ["timezone", "currency"]
    assert {"timezone", "currency"} <= set(brief.FIXED_KINDS)
    assert set(brief.CURRENCIES) == {code for code, _ in CURRENCY_CHOICES}


def test_the_address_is_asked_in_the_class_section_for_in_person_coaches():
    answers = {"offers": ["onsite"], "payments": ["free"]}
    ids = [f.id for f in brief.required(answers)]
    assert ids.index("onsite_when") < ids.index("location") < ids.index("onsite_review")
    assert "location" not in [f.id for f in brief.required({"offers": ["live"], "payments": ["free"]})]
    # Skipping the in-person event skips its address; skipping the online class does not.
    assert "location" not in [f.id for f in brief.required({**answers, "skipped": ["onsite"]})]
    assert "location" in [f.id for f in brief.required({**answers, "skipped": ["event"]})]


def test_the_model_cannot_fill_the_address():
    answers = {"offers": ["onsite"]}
    assert brief.apply_fact(answers, "location", "My studio in Kreuzberg") is False
    assert "location" not in answers


def test_online_and_in_person_sessions_are_separate_sections_each_with_a_review():
    both = [f.id for f in brief.required({"offers": ["live", "onsite"], "payments": ["free"]})]
    # The online section, then the in-person one, then the calendar question that closes them.
    assert both.index("event_review") < both.index("onsite_topic")
    assert both.index("onsite_review") == both.index("calendar_view") - 1
    # Each is skipped on its own.
    assert {brief.FIELD_BY_ID[i].group for i in ("live_topic", "onsite_topic")} == {"event", "onsite"}
    assert set(brief.SKIP_LABELS) >= {"event", "onsite"}


def test_a_bio_opens_on_what_it_says_and_asks_about_a_studio_name_that_disagrees():
    from apps.tenant_config.interview import guide_for

    bio = {"bio_teaches": ["Face yoga", "Yoga"]}
    # A bio on face yoga under "Polly Dance Studio": the bio's subjects first, the name's beside them.
    opening = guide_for(brief.FIELD_BY_ID["teaches"], answers=bio, brand="GS Polly Dance Studio")
    assert opening["options"][:3] == ["Face yoga", "Yoga", "Dance"] and len(opening["options"]) == 8
    assert opening["multi"] and opening["custom"] and opening["icons"]["Face yoga"] == "flower-2"
    assert opening["question"] == (
        "Your bio is about face yoga and yoga, but your studio name says dance. What do you offer?"
    )
    # A name that agrees with the bio, or says nothing, is no conflict (a one-kind name included).
    for brand in ("Zen Yoga Studio", "Görkem's Face Yoga Studio", "Studio Nova"):
        same = guide_for(brief.FIELD_BY_ID["teaches"], answers=bio, brand=brand)
        assert same["question"].endswith("I ticked what your bio says.") and same["multi"]
    # Her picks stand as she said them: no follow-up on kinds.
    picked = {}
    brief.apply_fact(picked, "teaches", "Face yoga, Yoga")
    assert picked["niche"] == "face_yoga" and "specialty" not in [f.id for f in brief.required(picked)]


def test_several_broad_tiles_ask_the_kinds_of_each():
    from apps.tenant_config.interview import default_question

    answers = {}
    brief.apply_fact(answers, "teaches", "Yoga, Dance")
    assert brief.missing(answers)[0].id == "specialty"
    field = brief.FIELD_BY_ID["specialty"]
    kinds, icons, _ = brief.options_for(field, answers)
    assert kinds[:4] == ("Vinyasa yoga", "Belly dance", "Hatha yoga", "Hip hop")
    assert icons[:2] == ("flower-2", "music")
    assert default_question(field, answers) == "Which kinds of yoga and dance do you offer?"


@pytest.mark.django_db
def test_price_tiles_and_their_note_are_in_the_currency_she_picked(tenant_ctx):
    from apps.tenant_config.interview import guide_for

    was = tenant_ctx.billing_currency
    tenant_ctx.billing_currency = "EUR"  # only the in-memory tenant: nothing is saved
    try:
        step = guide_for(brief.FIELD_BY_ID["course_price"], answers={})
        assert step["options"][:2] == ["€19", "€29"]
        assert step["why"] == "Prices are in EUR (€), the currency you picked."
        answers = {}
        brief.apply_fact(answers, "course_price", "€29")
        assert answers["course_price"] == 29
    finally:
        tenant_ctx.billing_currency = was


# ── who can open it: the ways into what a coach makes ───────────────────────

FACE_AND_VINYASA = {
    "teaches": "Yoga",
    "specialty": "Face yoga, Vinyasa yoga",
    "offers": ["course", "live"],
    "payments": ["course", "membership"],
}


def test_a_coach_who_teaches_several_things_is_offered_a_membership_for_each():
    tiles = brief.options_for(brief.FIELD_BY_ID["memberships"], FACE_AND_VINYASA)
    assert tiles[0][:2] == ("Weekly face yoga classes", "Weekly vinyasa yoga classes")
    assert tiles[0][2:] == ("Digital membership", "Online membership", "All-access")
    assert tiles[2][0] == "$19 a month"
    assert brief.membership_prices(FACE_AND_VINYASA)["Weekly face yoga classes"] == 19
    # One subject, or no classes to hold weekly: only the tiers.
    assert brief.suggested_memberships({**FACE_AND_VINYASA, "specialty": "Face yoga"}) == []
    assert brief.suggested_memberships({**FACE_AND_VINYASA, "offers": ["course"]}) == []
    assert brief.suggested_memberships({"teaches": "HIIT, Boxing", "offers": ["onsite"]}) == [
        "Weekly HIIT classes",
        "Weekly boxing classes",
    ]


def test_a_membership_of_her_own_is_its_name():
    answers = {**FACE_AND_VINYASA, "memberships": ["Weekly face yoga classes", "digital", "VIP circle"]}
    assert [m["label"] for m in brief.memberships_of(answers)] == [
        "Weekly face yoga classes",
        "Digital membership",
        "VIP circle",
    ]
    # Hers stays on the tiles when she goes back, after the ones offered.
    assert brief.options_for(brief.FIELD_BY_ID["memberships"], answers)[0][-1] == "VIP circle"
    assert brief.membership_of(answers, "VIP circle")["blurb"] == "One monthly price for VIP circle."
    assert brief.membership_of(answers, "Weekly face yoga classes")["blurb"] == (
        "One monthly price for weekly face yoga classes."
    )
    assert brief.tier_price({**answers, "membership_prices": {"VIP circle": 40}}, "VIP circle") == 40
    assert brief.memberships_of({**answers, "payments": ["course"]}) == []
    tapped = dict(FACE_AND_VINYASA)
    assert brief.apply_fact(tapped, "memberships", "Weekly face yoga classes, Online membership")
    assert tapped["memberships"] == ["Weekly face yoga classes", "online"]
    assert brief.composer_facts({**FACE_AND_VINYASA, "memberships": ["Weekly face yoga classes"]})[-1] == {
        "q": "Memberships offered",
        "a": "Weekly face yoga classes ($19 a month)",
    }


def _required(answers):
    return {f.id for f in brief.required(answers)}


def test_the_ways_in_are_asked_of_every_coach_who_takes_payments_before_any_price():
    asked = {"course_access", "event_access"}
    assert asked <= _required(FACE_AND_VINYASA)
    # Selling courses alone is still a choice: bought, or free.
    assert "course_access" in _required({**FACE_AND_VINYASA, "payments": ["course"]})
    assert not asked & _required({**FACE_AND_VINYASA, "payments": ["free"]})
    assert "onsite_access" not in _required(FACE_AND_VINYASA)  # no in-person events
    order = [f.id for f in brief.FIELDS]
    for section in ("course", "event", "onsite"):
        assert order.index(f"{section}_access") < order.index(f"{section}_price") < order.index(f"{section}_review")


def test_a_price_is_asked_only_for_what_is_sold_on_its_own():
    from apps.tenant_config.setup_flow import brief_price

    # Before she answers, it is sold the way a "pick for me" sets it: its price is still to come.
    assert "course_price" in _required(FACE_AND_VINYASA)
    members_only = {**FACE_AND_VINYASA, "memberships": ["digital"], "course_access": ["digital"], "course_price": 49}
    assert "course_price" not in _required(members_only)
    assert brief_price(members_only, "course") == 0.0
    free = {**FACE_AND_VINYASA, "payments": ["course"], "course_access": ["free"]}
    assert "course_price" not in _required(free) and brief_price(free, "course") == 0.0
    both = {**members_only, "course_access": ["buy", "digital"]}
    assert "course_price" in _required(both) and brief_price(both, "course") == 49.0
    # An interview from before the payments question keeps its price.
    assert brief_price({"sells": "paid", "course_price": 49}, "course") == 49.0


def test_the_ways_in_are_buying_it_each_membership_or_free():
    answers = {**FACE_AND_VINYASA, "memberships": ["Weekly face yoga classes", "digital", "online"], "course_price": 49}
    course = brief.options_for(brief.FIELD_BY_ID["course_access"], answers)
    assert course[0] == (
        "Anyone who buys the course",
        "Weekly face yoga classes",
        "Digital membership",
        "Online membership",
        "Free for everyone",
    )
    assert course[2][0] == "$49 paid once" and course[2][1] == "Included for members, $19 a month"
    # Asked before the price: buying it says the price comes next.
    assert brief.options_for(brief.FIELD_BY_ID["course_access"], FACE_AND_VINYASA)[2][0] == "You set the price next"
    # Each way in says what it means: the access settings, taught on the tiles.
    details = brief.details_for(brief.FIELD_BY_ID["course_access"], answers)
    assert details["Anyone who buys the course"] == brief.BUY_DETAIL
    assert details["Online membership"] == brief.MEMBER_DETAIL and details["Free for everyone"] == brief.FREE_DETAIL
    # She does not sell single classes: no way to buy one.
    assert brief.options_for(brief.FIELD_BY_ID["event_access"], answers)[0][0] == "Weekly face yoga classes"


def test_a_pick_for_me_opens_it_the_way_each_membership_promises():
    answers = {
        **FACE_AND_VINYASA,
        "memberships": ["Weekly face yoga classes", "Weekly vinyasa yoga classes", "digital", "online"],
        "live_topic": "Morning face yoga for a lifted jawline",
    }
    assert brief.default_access(answers, "course") == ["buy", "digital", "online"]
    # The class goes to the tier that promises classes, and to the one of hers named after its subject.
    assert brief.default_access(answers, "event") == ["online", "Weekly face yoga classes"]
    # A topic that names none of them: every one of her own takes it.
    assert brief.default_access({**answers, "live_topic": "Breath"}, "event")[1:] == answers["memberships"][:2]
    assert brief.default_access({"payments": ["free"]}, "course") == ["free"]


def test_the_ways_in_are_read_from_tiles_and_from_her_own_words():
    answers = {**FACE_AND_VINYASA, "memberships": ["digital", "online"]}
    assert brief.apply_fact(answers, "course_access", "Anyone who buys the course, Online membership")
    assert answers["course_access"] == ["buy", "online"]
    assert brief.parse_access("only my members", answers, "course") == ["digital", "online"]
    assert brief.parse_access("free for everyone", answers, "course") == ["free"]
    assert brief.parse_access("Free for everyone, Digital membership", answers, "course") == ["digital"]
    assert brief.parse_access("people pay for it", answers, "course") == ["buy"]
    assert not brief.apply_fact(answers, "course_access", "hmm")
    # A membership she dropped since falls out of the answer; with none left, the default stands.
    assert brief.access_of({**answers, "memberships": ["digital"]}, "course") == ["buy"]
    assert brief.access_of({**answers, "memberships": ["digital"], "course_access": ["online"]}, "course") == [
        "buy",
        "digital",
    ]
    assert brief.composer_facts(answers)[-1] == {
        "q": "Who can take the first course",
        "a": "Anyone who buys the course, Online membership",
    }


@pytest.mark.parametrize(
    ("said", "stored", "speaker"),
    [
        ("Just me", "solo", "I"),
        ("Just me for now, more teachers later", "solo_for_now", "I"),
        ("Several teachers", "several", "we"),
        ("solo_for_now", "solo_for_now", "I"),  # the id the model gives
        ("My sister and I run it together, we are a team", "several", "we"),
    ],
)
def test_who_students_learn_from_sets_i_or_we(said, stored, speaker):
    answers = {}
    assert brief.apply_fact(answers, "teachers", said)
    assert answers["teachers"] == stored
    assert brief.speaker_of(answers) == speaker
    tile = brief.TEACHERS[stored][0]
    assert {"q": "Who students learn from", "a": tile} in brief.composer_facts(answers)


def test_who_students_learn_from_is_asked_before_the_pitch_and_unanswered_has_no_speaker():
    assert brief.speaker_of({}) is None
    assert brief.coerce("teachers", "somewhere warm") is None
    ids = [f.id for f in brief.required({})]
    assert ids[ids.index("offers") + 1 : ids.index("offers") + 3] == ["teachers", "pitch"]
    assert "teachers" in brief.FIXED_KINDS
    assert brief.FIELD_BY_ID["teachers"].options == tuple(tile for tile, _ in brief.TEACHERS.values())
