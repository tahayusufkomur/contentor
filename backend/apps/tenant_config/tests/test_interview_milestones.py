"""Interview milestones fire once, when their facts are settled; look picks
apply immediately; drafts fall back so go-live is never blocked."""

from decimal import Decimal
from unittest import mock

import pytest

from apps.accounts.models import User
from apps.courses.models import Course
from apps.tenant_config import interview_brief as brief
from apps.tenant_config import interview_milestones as ms
from apps.tenant_config import setup_flow
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db

HOME = {
    "teaches": "Yoga",
    "audience": "Desk workers",
    "outcome": "No back pain",
    "offers": ["course"],
    "pitch": "Yoga for desks",
}


@pytest.fixture()
def config(tenant_ctx):
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Glow")
    cfg.setup_flow = {
        "status": "active",
        "interview": {"turns": [], "fired": []},
        "draft_status": {},
        "page_builds": {},
    }
    cfg.style = "journal"
    cfg.save()
    return cfg


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@iv.test", name="O", password="x", role="owner", is_staff=True)  # noqa: S106


@pytest.fixture()
def side_effects():
    with (
        mock.patch("apps.tenant_config.setup_flow.start_page_build") as build,
        mock.patch("apps.core.tasks.interview_draft_task.delay") as draft,
        mock.patch("apps.core.tasks.rank_curated_logos.delay") as rank,
        mock.patch("apps.tenant_config.interview_milestones.apply_style") as style,
    ):
        yield {"build": build, "draft": draft, "rank": rank, "style": style}


def _fired():
    return TenantConfig.objects.first().setup_flow["interview"]["fired"]


def test_nothing_fires_before_home_facts(tenant_ctx, config, side_effects):
    assert ms.fire(tenant_ctx, {"teaches": "Yoga"}) == []
    side_effects["build"].assert_not_called()


def test_home_fires_style_build_and_logo_rank(tenant_ctx, config, side_effects, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        fired = ms.fire(tenant_ctx, dict(HOME))
    assert fired[:3] == ["style:auto", "page:home", "rank:logos"]
    side_effects["build"].assert_called_once_with(tenant_ctx, "home")
    side_effects["rank"].assert_called_once_with(tenant_ctx.id)
    side_effects["style"].assert_called_once()


def test_fire_is_exactly_once(tenant_ctx, config, side_effects):
    ms.fire(tenant_ctx, dict(HOME))
    assert ms.fire(tenant_ctx, dict(HOME)) == []
    assert _fired().count("page:home") == 1
    side_effects["build"].assert_called_once()


def test_delegated_facts_count_as_settled(tenant_ctx, config, side_effects):
    answers = {**HOME, "delegated": ["story", "credentials", "tone"]}
    assert "page:about" in ms.fire(tenant_ctx, answers)


def test_course_draft_fires_with_its_prompt(tenant_ctx, config, side_effects, django_capture_on_commit_callbacks):
    answers = {
        **HOME,
        "course_topic": "Morning mobility",
        "payments": ["free"],
    }
    with django_capture_on_commit_callbacks(execute=True):
        assert "draft:course" in ms.fire(tenant_ctx, answers)
    _tenant_id, kind, prompt = side_effects["draft"].call_args.args
    assert kind == "course" and "Morning mobility" in prompt and "free" in prompt
    assert TenantConfig.objects.first().setup_flow["draft_status"]["course"] == "building"


def test_a_class_is_drafted_on_any_plan(tenant_ctx, config, side_effects, django_capture_on_commit_callbacks):
    answers = {
        **HOME,
        "offers": ["course", "live"],
        "payments": ["free"],
        "live_topic": "Slow flow",
        "live_when": "Sunday 9am",
    }
    with django_capture_on_commit_callbacks(execute=True):
        assert "draft:event" in ms.fire(tenant_ctx, answers)  # go-live offers the plan that runs it
    assert ms.review_card(tenant_ctx, "event")["status"] == "building"


def test_choose_style_validates_and_applies(tenant_ctx, config):
    answers = {}
    with pytest.raises(ms.ChoiceError):
        ms.choose(tenant_ctx, answers, "site_style", "no-such-style")
    ms.choose(tenant_ctx, answers, "site_style", "grid")
    cfg = TenantConfig.objects.first()
    assert cfg.style == "grid" and answers["site_style"] == "grid" and answers["style"] == "grid"
    assert cfg.setup_progress["look_edited"] is True
    ms.choose(tenant_ctx, answers, "site_style", "journal:sage")
    cfg = TenantConfig.objects.first()
    assert (cfg.style, cfg.palette) == ("journal", "sage")
    assert (answers["site_style"], answers["style"], answers["palette"]) == ("journal:sage", "journal", "sage")
    with pytest.raises(ms.ChoiceError):
        ms.choose(tenant_ctx, answers, "site_style", "journal:mint")
    ms.choose(tenant_ctx, answers, "site_style", "grid")
    assert TenantConfig.objects.first().palette == "" and answers["palette"] == ""


def test_choose_wordmark_and_delegate(tenant_ctx, config):
    answers = {}
    ms.choose(tenant_ctx, answers, "site_logo", "wordmark")
    assert answers["logo"] == {"mode": "wordmark", "curated_id": None}
    with pytest.raises(ms.ChoiceError):
        ms.choose(tenant_ctx, answers, "site_logo", "999999")
    ms.choose(tenant_ctx, answers, "tone", "__delegate__")
    assert "tone" in answers["delegated"]


def test_choose_text_field_goes_through_coercion(tenant_ctx, config):
    answers = {}
    ms.choose(tenant_ctx, answers, "payments", "One-time course purchases")
    assert answers["payments"] == ["course"] and answers["sells"] == "paid"
    with pytest.raises(ms.ChoiceError):
        ms.choose(tenant_ctx, answers, "course_price", "no idea")


def test_style_cards_offer_each_style_once_with_its_colourways_and_the_niche_style_first():
    from apps.tenant_config import sections

    cards = ms.style_cards({"niche": "fitness"})
    enabled = sections.enabled_styles()
    assert cards["kind"] == "style"
    assert [o["style"] for o in cards["options"]][0] == "kinetic"
    assert {o["style"] for o in cards["options"]} == set(enabled)
    assert len(cards["options"]) == len(enabled)
    first = cards["options"][0]
    assert first["value"] == "kinetic" and first["recommended"] is True
    assert [p["id"] for p in first["palettes"]] == ["", "ocean", "ember"]
    assert all("recommended" not in o for o in cards["options"][1:])


def test_style_cards_rank_by_niche_then_tone_and_say_why():
    from apps.tenant_config import sections

    # Same niche, different tone: the tone asked for breaks the tie.
    assert sections.rank_styles("fitness", ["energetic"])[0]["id"] == "kinetic"
    ranked = [s["id"] for s in sections.rank_styles("general", ["expert"])]
    assert ranked.index("ledger") < ranked.index("journal")  # both list general; ledger sounds expert
    cards = ms.style_cards({"niche": "fitness", "teaches": "boxing", "tone": "Energetic, Warm"})
    first = cards["options"][0]
    assert first["recommended"] and first["style"] == "kinetic"
    assert first["reason"] == "Made for boxing coaches, and it sounds energetic."
    assert sections.tones_of("Warm, Calm") == ["warm", "calm"]


def test_free_plan_coach_who_sells_gets_a_paid_course_draft(tenant_ctx, config, owner):
    """Review focus 2: never silently turn a priced course free."""
    from apps.core.models import Tenant

    Tenant.objects.filter(pk=tenant_ctx.pk).update(wizard_state={"flow": "interview", "answers": {"sells": "paid"}})
    tenant_ctx.refresh_from_db()
    reply = setup_flow.CourseDraft(
        title="Desk Yoga", description="d", modules=[{"title": "W1", "lessons": ["a"]}], pricing_type="paid", price=49
    )
    with (
        mock.patch("apps.tenant_config.setup_flow.is_paid_active", return_value=False),
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.onboarding.ai_compose.record_spend"),
        mock.patch("apps.core.copilot.content._give_cover"),
        mock.patch("apps.core.ai.structured", return_value=(reply, Decimal("0"), "m")),
    ):
        setup_flow.create_draft(tenant_ctx, owner, "course", "Desk yoga, 49")
    course = Course.objects.get()
    assert course.pricing_type == "paid" and course.price == Decimal("49.00")


def test_run_draft_falls_back_when_ai_fails(tenant_ctx, config, owner):
    from apps.core import ai as core_ai
    from apps.core.models import Tenant

    Tenant.objects.filter(pk=tenant_ctx.pk).update(
        wizard_state={
            "flow": "interview",
            "answers": {"teaches": "Yoga", "course_topic": "Morning mobility", "sells": "free"},
        }
    )
    tenant_ctx.refresh_from_db()
    with (
        mock.patch("apps.tenant_config.setup_flow.create_draft", side_effect=core_ai.AiError("down")),
        mock.patch("apps.core.copilot.content._give_cover"),
        mock.patch("apps.tenant_config.setup_flow.start_page_build") as build,
    ):
        ms.run_draft(tenant_ctx, "course", "prompt")
    assert Course.objects.get().title == "Morning mobility"
    flow = TenantConfig.objects.first().setup_flow
    assert flow["draft_status"]["course"] == "ready" and flow["drafts"]["course"]
    build.assert_called_once_with(tenant_ctx, "courses")


def test_page_finishing_after_style_switch_lands_in_new_style(tenant_ctx, config):
    """Review focus 1: a build started under 'journal' that saves after the
    coach picked 'grid' is restyled on save."""
    from apps.core.onboarding import site_composer
    from apps.tenant_config import sections

    blocks = sections.restyle_pages({"home": {"blocks": []}}, "journal")["home"]["blocks"]
    cfg = TenantConfig.objects.first()
    cfg.style = "grid"
    cfg.save(update_fields=["style"])
    with mock.patch("apps.tenant_config.sections.restyle_pages", wraps=sections.restyle_pages) as restyle:
        site_composer._save_page(tenant_ctx, "home", blocks, built_style="journal")
    restyle.assert_called_with(mock.ANY, "grid")


def test_interview_background_ai_runs_behind_the_coach(tenant_ctx, config, owner):
    """Drafts started by the interview must not take an interactive hub slot
    from the coach's next question."""
    from apps.core.models import Tenant

    Tenant.objects.filter(pk=tenant_ctx.pk).update(wizard_state={"flow": "interview", "answers": {}})
    tenant_ctx.refresh_from_db()
    with (
        mock.patch("apps.tenant_config.setup_flow.create_draft") as create,
        mock.patch("apps.tenant_config.setup_flow.start_page_build"),
    ):
        ms.run_draft(tenant_ctx, "course", "prompt")
    assert create.call_args.kwargs["label"].startswith("contentor:compose")


def _sells(tenant_ctx, **answers):
    from apps.core.models import Tenant

    Tenant.objects.filter(pk=tenant_ctx.pk).update(wizard_state={"flow": "interview", "answers": answers})
    tenant_ctx.refresh_from_db()


def test_brief_price_wins_over_a_free_model_answer(tenant_ctx, config, owner):
    """Review finding 3: the coach said 49; the model said free."""
    _sells(tenant_ctx, sells="paid", course_price=49.0)
    reply = setup_flow.CourseDraft(
        title="Desk Yoga", description="d", modules=[{"title": "W1", "lessons": ["a"]}], pricing_type="free", price=0
    )
    with (
        mock.patch("apps.tenant_config.setup_flow.is_paid_active", return_value=False),
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.onboarding.ai_compose.record_spend"),
        mock.patch("apps.core.copilot.content._give_cover"),
        mock.patch("apps.core.ai.structured", return_value=(reply, Decimal("0"), "m")),
    ):
        setup_flow.create_draft(tenant_ctx, owner, "course", "Desk yoga")
    course = Course.objects.get()
    assert course.pricing_type == "paid" and course.price == Decimal("49.00")


def test_delegated_price_for_a_selling_coach_is_not_free(tenant_ctx, config, owner):
    _sells(tenant_ctx, sells="paid", delegated=["course_price"])
    with mock.patch("apps.core.copilot.content._give_cover"):
        setup_flow.create_fallback_draft(tenant_ctx, owner, "course", {"sells": "paid", "delegated": ["course_price"]})
    course = Course.objects.get()
    assert course.pricing_type == "paid" and course.price > 0


def test_brief_price_follows_how_students_pay():
    assert setup_flow.brief_price({"payments": ["course"], "course_price": 29.0}, "course") == 29.0
    assert setup_flow.brief_price({"payments": ["course"]}, "course") == setup_flow.DEFAULT_COURSE_PRICE
    assert setup_flow.brief_price({"payments": ["membership"]}, "course") == 0.0  # it's in the membership
    assert setup_flow.brief_price({"payments": ["event"], "event_price": 12.0}, "event") == 12.0
    assert setup_flow.brief_price({"sells": "paid"}, "course") == setup_flow.DEFAULT_COURSE_PRICE  # before payments
    assert setup_flow.brief_price({}, "course") is None


def test_membership_plans_are_created_once_per_tier_with_the_course_in_them(tenant_ctx, config, owner, side_effects):
    from apps.billing.models import SubscriptionPlan, SubscriptionPlanAccess

    with mock.patch("apps.core.copilot.content._give_cover"):
        setup_flow.create_fallback_draft(tenant_ctx, owner, "course", {"payments": ["membership"]})
    answers = {
        **HOME,
        "offers": ["course", "community"],
        "payments": ["membership"],
        "memberships": ["digital", "community"],
    }
    assert "plan:membership" in ms.fire(tenant_ctx, answers)
    assert ms.fire(tenant_ctx, answers) == []
    plans = {p.name: p for p in SubscriptionPlan.objects.all()}
    assert set(plans) == {"Digital membership", "Community membership"}
    digital = plans["Digital membership"]
    assert digital.price == Decimal("9.00") and digital.billing_interval_months == 1
    assert plans["Community membership"].price == Decimal("5.00")
    course = Course.objects.get()
    assert course.pricing_type == "free"  # members get it; not sold on its own
    # Only the tiers that include courses point at it.
    assert [(a.plan_id, a.object_id) for a in SubscriptionPlanAccess.objects.all()] == [(digital.pk, course.pk)]
    side_effects["build"].assert_any_call(tenant_ctx, "pricing")


def test_a_delegated_membership_pick_gets_the_digital_tier(tenant_ctx, config, side_effects):
    from apps.billing.models import SubscriptionPlan

    answers = {**HOME, "payments": ["membership"], "delegated": ["memberships"]}
    assert "plan:membership" in ms.fire(tenant_ctx, answers)
    assert SubscriptionPlan.objects.get().name == "Digital membership"


def test_skip_drops_the_draft_and_its_publish_blocker(tenant_ctx, config, owner):
    from apps.tenant_config.setup_items import publish_blockers

    with mock.patch("apps.core.copilot.content._give_cover"):
        setup_flow.create_fallback_draft(tenant_ctx, owner, "course", {})
    answers = {**HOME}
    ms.choose(tenant_ctx, answers, "course_topic", "__skip__")
    assert answers["skipped"] == ["course"]
    assert not Course.objects.exists()
    cfg = TenantConfig.objects.first()
    assert "course" not in cfg.setup_flow["drafts"] and "course" in cfg.setup_flow["skipped"]
    assert "first_course" not in publish_blockers(cfg, tenant_ctx)
    with pytest.raises(ms.ChoiceError):
        ms.choose(tenant_ctx, answers, "story", "__skip__")


def test_review_card_shows_the_real_draft(tenant_ctx, config, owner):
    assert ms.review_card(tenant_ctx, "course") == {"kind": "course", "status": "building", "item": None}
    with mock.patch("apps.core.copilot.content._give_cover"):
        setup_flow.create_fallback_draft(tenant_ctx, owner, "course", {"course_topic": "Morning mobility"})
    ms._set_draft_status(tenant_ctx, "course", "ready")
    from apps.core.curated_images import client as curated_client

    with mock.patch("apps.core.curated_images.client.search", return_value=curated_client.SearchPage([], 1, False)):
        card = ms.review_card(tenant_ctx, "course")
    assert card["status"] == "ready"
    assert card["item"]["title"] == "Morning mobility"
    assert card["item"]["modules"][0]["lessons"] == ["Welcome", "Your first practice"]
    assert card["item"]["price"] == ""  # free
    answers = {}
    ms.choose(tenant_ctx, answers, "course_review", "ok")
    assert answers["course_review"] == "approved"
    with pytest.raises(ms.ChoiceError):
        ms.choose(tenant_ctx, answers, "course_review", "maybe")
    with pytest.raises(ms.ChoiceError):
        ms.set_cover(tenant_ctx, "course", "not-offered")


def test_review_card_is_building_until_the_draft_lands(tenant_ctx, config):
    assert ms.review_card(tenant_ctx, "event")["status"] == "building"


def test_choose_schedule_validates_and_sets_the_summary(tenant_ctx, config):
    answers = {"delegated": ["live_when"]}
    with pytest.raises(ms.ChoiceError):
        ms.choose(tenant_ctx, answers, "live_when", '{"mode": "recurring", "start": "2026-10-12", "days": [9]}')
    ms.choose(
        tenant_ctx,
        answers,
        "live_when",
        '{"mode": "recurring", "start": "2026-10-12", "end": "2026-12-07", "days": [4, 2], "times": ["18:30"]}',
    )
    assert answers["live_when"] == "Tuesdays and Thursdays at 6:30 PM, from 12 Oct to 7 Dec 2026"
    assert answers["live_schedule"]["slots"] == [{"days": [2, 4], "times": ["18:30"]}]
    assert answers["delegated"] == []
    prompt = ms.draft_prompt({**answers, "offers": ["course", "live"], "live_topic": "Pads"}, "event")
    assert "the first one on 2026-10-13T18:30" in prompt


def test_a_schedule_timezone_becomes_the_site_timezone(tenant_ctx, config):
    answers = {"delegated": ["live_when"]}
    ms.choose(
        tenant_ctx,
        answers,
        "live_when",
        '{"mode": "recurring", "start": "2026-10-12", "days": [2], "times": ["18:30"], "tz": "Europe/Istanbul"}',
    )
    assert TenantConfig.objects.first().timezone == "Europe/Istanbul"


def test_a_weekly_schedule_dates_the_draft_and_expands_at_go_live(tenant_ctx, config, owner):
    from apps.core.models import Tenant
    from apps.live.models import LiveClass

    answers = {
        **HOME,
        "offers": ["course", "live"],
        "live_topic": "Pads",
        "live_when": "Tuesdays and Thursdays at 6:30 PM",
        # 7 Jan 2030 is a Monday: Tue 8, Thu 10, Tue 15, Thu 17 (the 21st ends it).
        "live_schedule": {
            "mode": "recurring",
            "start": "2030-01-07",
            "end": "2030-01-21",
            "days": [2, 4],
            "times": ["18:30"],
        },
    }
    Tenant.objects.filter(pk=tenant_ctx.pk).update(wizard_state={"flow": "interview", "answers": answers})
    tenant_ctx.refresh_from_db()
    with mock.patch("apps.core.copilot.content._give_cover"):
        setup_flow.create_fallback_draft(tenant_ctx, owner, "event", answers)
    ms.apply_schedule(tenant_ctx)
    first = LiveClass.objects.get()
    assert first.scheduled_at.isoformat() == "2030-01-08T18:30:00+00:00"
    assert ms.expand_class_series(tenant_ctx) == 3
    assert ms.expand_class_series(tenant_ctx) == 0  # once
    rows = list(LiveClass.objects.order_by("scheduled_at"))
    assert [r.scheduled_at.isoformat()[:16] for r in rows] == [
        "2030-01-08T18:30",
        "2030-01-10T18:30",
        "2030-01-15T18:30",
        "2030-01-17T18:30",
    ]
    assert {r.title for r in rows} == {first.title} and len({r.room_name for r in rows}) == 4


def test_look_photos_are_the_web_rendition_not_the_thumbnail(tenant_ctx):
    from apps.core.curated_images.client import RemoteImage, SearchPage

    image = RemoteImage(
        asset_id="a1",
        title="Yoga class",
        description="",
        tags=["yoga"],
        width=2560,
        height=1429,
        preview_url="https://img.test/a1/thumbnail.webp",
        web_url="https://img.test/a1/web.webp",
    )
    with mock.patch("apps.core.curated_images.client.search", return_value=SearchPage([image], 1, False)):
        photos = ms._look_photos(tenant_ctx, {"niche": "yoga", "teaches": "Yoga"})
    # The previews show a full-width hero: the 640 px thumbnail looked soft there.
    assert photos == ["https://img.test/a1/web.webp"]


def test_style_cards_carry_a_preview_of_the_coach_in_the_look(tenant_ctx, config):
    answers = {
        **HOME,
        "difference": "No ego, beginner-friendly gym",
        "outcome": "Real fitness and stamina, Weight loss that lasts, Confidence, Fundamentals, Extra",
    }
    with mock.patch("apps.tenant_config.interview_milestones._look_photos", return_value=[]):
        cards = ms.style_cards(answers, tenant_ctx)
    assert cards["preview"] == {
        "subject": "yoga",
        "body": (
            "No ego, beginner-friendly gym. "
            "Real fitness and stamina, weight loss that lasts, confidence and fundamentals."
        ),
        "copy": None,  # no model here: the looks keep their own sample words
    }
    with (
        mock.patch("apps.tenant_config.interview_milestones._look_photos", return_value=[]),
        mock.patch("apps.tenant_config.look_copy.for_tenant", return_value={"hero": {"headline": "Box"}}),
    ):
        assert ms.style_cards(answers, tenant_ctx)["preview"]["copy"] == {"hero": {"headline": "Box"}}


@pytest.mark.parametrize(
    "request_text, scope",
    [
        ("Change the photo", "photo"),
        ("Use another picture, please", "photo"),
        ("Make it six weeks", "words"),
        ("Rewrite the description", "words"),
        ("Change the photo and the title", "all"),
        ("Start over, change everything", "all"),
    ],
)
def test_a_review_change_is_scoped_to_what_it_names(request_text, scope):
    assert ms.redraft_scope(request_text) == scope


def test_classes_turn_on_live_add_events_and_pricing_links(tenant_ctx, config, side_effects):
    cfg = TenantConfig.objects.first()
    cfg.navbar_config = {"links": [{"label": "Courses", "href": "/courses"}, {"label": "About", "href": "/about"}]}
    cfg.enabled_modules = ["courses", "pages"]
    cfg.save()
    answers = {
        **HOME,
        "offers": ["course", "live"],
        "goals": ["run_live_classes", "sell_courses"],
        "payments": ["membership"],
        "live_topic": "Pads",
        "live_when": "Tuesday",
    }
    assert "page:events" in ms.fire(tenant_ctx, answers)
    cfg = TenantConfig.objects.first()
    assert [link["href"] for link in cfg.navbar_config["links"]] == ["/courses", "/events", "/plans", "/about"]
    assert "live" in cfg.enabled_modules and "courses" in cfg.enabled_modules
    ms.sync_site(tenant_ctx, answers)  # idempotent
    assert len(TenantConfig.objects.first().navbar_config["links"]) == 4


def test_calendar_and_social_answers_reach_the_navbar(tenant_ctx, config):
    cfg = TenantConfig.objects.first()
    cfg.navbar_config = {"links": [{"label": "Courses", "href": "/courses"}]}
    cfg.save()
    answers = {"offers": ["course", "live"], "calendar_nav": "yes", "calendar_view": "agenda"}
    ms.choose(tenant_ctx, answers, "socials", '{"Instagram": "@maya", "YouTube": "https://youtube.com/@mayaflow"}')
    assert answers["socials"] == "Instagram: https://instagram.com/maya; YouTube: https://youtube.com/@mayaflow"
    ms.sync_site(tenant_ctx, answers)
    cfg = TenantConfig.objects.first()
    assert [link["href"] for link in cfg.navbar_config["links"]] == ["/courses", "/events", "/calendar"]
    assert cfg.navbar_config["calendar_view"] == "agenda" and cfg.navbar_config["show_social"] is True
    assert cfg.social_links == {"instagram": "https://instagram.com/maya", "youtube": "https://youtube.com/@mayaflow"}
    ms.sync_site(tenant_ctx, answers)  # idempotent
    assert len(TenantConfig.objects.first().navbar_config["links"]) == 3


def test_calendar_and_social_choices_are_validated(tenant_ctx, config):
    answers = {}
    ms.choose(tenant_ctx, answers, "calendar_view", "month")
    assert answers["calendar_view"] == "month"
    with pytest.raises(ms.ChoiceError):
        ms.choose(tenant_ctx, answers, "calendar_view", "year")
    ms.choose(tenant_ctx, answers, "socials", "{}")
    assert answers["socials"] == brief.NO_SOCIALS
    with pytest.raises(ms.ChoiceError):
        ms.choose(tenant_ctx, answers, "socials", '{"Instagram": "not a handle!!"}')
    assert ms.calendar_cards()["options"][0]["value"] == "month"
