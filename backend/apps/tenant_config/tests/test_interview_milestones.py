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


def test_choose_an_uploaded_logo(tenant_ctx, config):
    """Audit G4: a coach with a logo of her own had no way to use it here."""
    import uuid

    from apps.media.models import Photo

    photo = Photo.objects.create(s3_key="uploads/logo.png", title="logo")
    # A generated logo picked before leaves its favicon, recipe and hidden name.
    TenantConfig.objects.update(
        icon=Photo.objects.create(s3_key="gen/icon.png"),
        logo_recipe={"version": 3},
        navbar_config={"show_brand_name": False, "logo_size": "lg"},
    )
    answers = {}
    ms.choose(tenant_ctx, answers, "site_logo", f"upload:{photo.pk}")
    assert answers["logo"] == {"mode": "upload", "photo_id": str(photo.pk)}
    cfg = TenantConfig.objects.first()
    assert cfg.logo_id == photo.pk and cfg.icon_id is None and cfg.logo_recipe == {}
    assert cfg.navbar_config.get("show_brand_name") is True and "logo_size" not in cfg.navbar_config
    for bad in (f"upload:{uuid.uuid4()}", "upload:nope"):
        with pytest.raises(ms.ChoiceError):
            ms.choose(tenant_ctx, answers, "site_logo", bad)


def test_logo_cards_carry_the_brand_name_for_the_lockup(tenant_ctx, config):
    tenant_ctx.name = "Mira Yoga House"
    with mock.patch("apps.core.onboarding.ai_curate.shortlist", return_value=[]):
        assert ms.logo_cards(tenant_ctx, {})["brand"] == "Mira Yoga House"


# ── logo marks from the remote catalog (LOGO_SOURCE=pix4less) ────────────────


def test_logo_cards_come_from_the_catalog_when_it_is_the_logo_source(tenant_ctx, config, settings):
    from apps.core.curated_images import fake

    settings.LOGO_SOURCE = "pix4less"
    yoga = next(e for e in fake.entries("logo") if "yoga" in e["tags"])
    cards = ms.logo_cards(tenant_ctx, {"niche": "yoga", "teaches": "yoga"})
    assert cards["kind"] == "logo" and cards["more"] is False
    # The catalog ranks: the yoga mark comes first for a yoga coach.
    first = cards["options"][0]
    assert first["value"] == f"p4l:{yoga['asset_id']}"
    assert first["label"] == yoga["title"] and first["image_url"] and first["mark"] is None
    assert first["tint"] >= 1  # a flat mark of a few inks takes the look's colour
    # A coach who has not said what she teaches still gets marks to choose from.
    assert len(ms.logo_cards(tenant_ctx, {})["options"]) == len(fake.entries("logo"))


def test_a_flat_mark_is_tinted_by_its_darkest_ink_and_a_painted_one_is_not():
    assert ms._tint_gain(("#000000",)) == 1.0  # black ink is already full strength
    assert ms._tint_gain(("#808080", "#ffffff")) == 2.01  # mid-grey ink is doubled
    assert ms._tint_gain(("#111111", "#555555", "#999999", "#dddddd")) == 1.07  # four greys are one ink
    assert ms._tint_gain(("#0a3d1c", "#1f7a3a", "#4caf6a", "#a5d6b0")) is not None  # shades of green
    assert ms._tint_gain(("#c32f45", "#2a6ea0", "#face2c", "#99bf5e")) is None  # painted in many hues
    assert ms._tint_gain(("#f01010", "#e8103a", "#f0102a", "#ff1040")) is not None  # reds across the wheel's seam
    assert ms._tint_gain(("#fff8e0",)) is None  # too pale to carry a colour
    assert ms._tint_gain(()) is None and ms._tint_gain(("nope",)) is None


def test_catalog_logo_cards_page_in_fourteens_over_pages_of_twelve(tenant_ctx, config, settings, monkeypatch):
    from apps.core.curated_images import client

    settings.LOGO_SOURCE = "pix4less"
    marks = [
        client.RemoteImage(
            asset_id=f"{n:08d}-0000-4000-8000-000000000000",
            title=f"Mark {n}",
            description="",
            tags=[],
            width=64,
            height=64,
            preview_url=f"/p/{n}",
            web_url=f"/w/{n}",
            colors=("#000000",),
        )
        for n in range(30)
    ]

    def search(query="", *, kind, page=1, **_):
        assert kind == client.LOGO
        chunk = marks[(page - 1) * 12 : page * 12]
        return client.SearchPage(results=chunk, page=page, has_next=len(marks) > page * 12)

    monkeypatch.setattr(client, "search", search)
    pages = [ms.logo_cards(tenant_ctx, {}, page) for page in range(3)]
    assert [[int(o["value"][4:12]) for o in p["options"]] for p in pages] == [
        list(range(14)),
        list(range(14, 28)),
        [28, 29],
    ]
    assert [p["more"] for p in pages] == [True, True, False]


def test_logo_cards_fall_back_to_the_local_library_when_the_catalog_is_down(tenant_ctx, config, settings, monkeypatch):
    from apps.core.curated_images import client

    settings.LOGO_SOURCE = "pix4less"

    def down(*_args, **_kwargs):
        raise client.CuratedImageError(client.UNAVAILABLE)

    monkeypatch.setattr(client, "search", down)
    cards = ms.logo_cards(tenant_ctx, {"teaches": "yoga"})
    assert cards["kind"] == "logo"
    assert not any(str(o["value"]).startswith("p4l:") for o in cards["options"])


def test_choose_a_catalog_logo_copies_it_into_the_tenant(tenant_ctx, config, settings, curated_image_uploads):
    import uuid

    from apps.core.curated_images import fake

    settings.LOGO_SOURCE = "pix4less"
    asset_id = fake.entries("logo")[0]["asset_id"]
    answers = {}
    ms.choose(tenant_ctx, answers, "site_logo", f"p4l:{asset_id}")
    assert answers["logo"] == {"mode": "curated", "asset_id": asset_id}
    cfg = TenantConfig.objects.select_related("logo").first()
    assert cfg.logo.s3_key.endswith(f"/curated/{asset_id}.webp")
    assert cfg.logo.s3_key in curated_image_uploads  # her own copy, not a link to the catalog
    assert cfg.navbar_config["show_brand_name"] is True and cfg.navbar_config["logo_size"] == "lg"
    # Picking it again reuses the copy; a mark the catalog does not have is refused.
    ms.choose(tenant_ctx, answers, "site_logo", f"p4l:{asset_id}")
    assert len(curated_image_uploads) == 1
    for bad in (f"p4l:{uuid.uuid4()}", "p4l:nope"):
        with pytest.raises(ms.ChoiceError):
            ms.choose(tenant_ctx, answers, "site_logo", bad)


def test_the_catalog_ranks_so_the_local_rank_task_is_not_fired(
    tenant_ctx, config, side_effects, settings, django_capture_on_commit_callbacks
):
    settings.LOGO_SOURCE = "pix4less"
    with django_capture_on_commit_callbacks(execute=True):
        assert "rank:logos" in ms.fire(tenant_ctx, dict(HOME))
    side_effects["rank"].assert_not_called()


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


def test_membership_prices_are_hers_to_set(tenant_ctx, config, side_effects):
    """Audit G5: the tiers' prices were fixed; now each ticked tier takes hers."""
    import json

    from apps.billing.models import SubscriptionPlan

    answers = {**HOME, "offers": ["course", "community"], "payments": ["membership"], "delegated": ["memberships"]}
    ms.choose(tenant_ctx, answers, "memberships", json.dumps({"Digital membership": 12, "Community membership": "4.5"}))
    assert answers["memberships"] == ["digital", "community"] and "memberships" not in answers["delegated"]
    assert answers["membership_prices"] == {"digital": 12.0, "community": 4.5}
    ms.fire(tenant_ctx, answers)
    assert {p.name: p.price for p in SubscriptionPlan.objects.all()} == {
        "Digital membership": Decimal("12.00"),
        "Community membership": Decimal("4.50"),
    }
    # Going back to change a price changes the plan already made.
    ms.choose(tenant_ctx, answers, "memberships", json.dumps({"Digital membership": 15, "Community membership": 4.5}))
    assert SubscriptionPlan.objects.get(name="Digital membership").price == Decimal("15.00")
    for bad in ({"Digital membership": 0}, {"Digital membership": "lots"}, {"Nope": 5}, {}):
        with pytest.raises(ms.ChoiceError):
            ms.choose(tenant_ctx, answers, "memberships", json.dumps(bad))


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


def test_review_card_cover_url_is_stable_between_polls(tenant_ctx, config, owner):
    from apps.core.curated_images import client as curated_client
    from apps.media.models import Photo

    with mock.patch("apps.core.copilot.content._give_cover"):
        setup_flow.create_fallback_draft(tenant_ctx, owner, "course", {"course_topic": "Morning mobility"})
    ms._set_draft_status(tenant_ctx, "course", "ready")
    course = Course.objects.get()
    course.thumbnail = Photo.objects.create(s3_key="stable-cover-test/cover.jpg", title="c")
    course.save()
    signed = iter(f"https://s3/cover.jpg?sig={n}" for n in range(10))
    with (
        mock.patch("apps.core.storage.generate_presigned_download_url", side_effect=lambda key: next(signed)),
        mock.patch("apps.core.curated_images.client.search", return_value=curated_client.SearchPage([], 1, False)),
    ):
        first = ms.review_card(tenant_ctx, "course")["item"]["cover_url"]
        second = ms.review_card(tenant_ctx, "course")["item"]["cover_url"]
    assert first and first == second


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


def test_the_time_zone_answer_is_the_sites_and_a_schedule_never_carries_its_own(tenant_ctx, config):
    answers = {"delegated": []}
    ms.choose(tenant_ctx, answers, "timezone", "Europe/Istanbul")
    ms.choose(
        tenant_ctx,
        answers,
        "live_when",
        '{"mode": "recurring", "start": "2026-10-12", "days": [2], "times": ["18:30"], "tz": "America/Lima"}',
    )
    ms.sync_site(tenant_ctx, answers)
    assert answers["timezone"] == "Europe/Istanbul"
    assert "tz" not in answers["live_schedule"]
    assert TenantConfig.objects.first().timezone == "Europe/Istanbul"
    assert ms.first_class_at(answers).isoformat() == "2026-10-13T18:30:00+03:00"
    with pytest.raises(ms.ChoiceError):
        ms.choose(tenant_ctx, answers, "timezone", "Mars/Olympus")


def test_the_currency_answer_is_what_the_coach_charges_in_until_money_moves(tenant_ctx, config, owner):
    from apps.billing.models import Payment, SubscriptionPlan
    from apps.core.models import Tenant

    was = tenant_ctx.billing_currency
    plan = SubscriptionPlan.objects.create(name="Digital", price=Decimal("9.00"), stripe_price_id="price_usd")
    try:
        ms.sync_site(tenant_ctx, {"currency": "EUR"})
        assert Tenant.objects.get(pk=tenant_ctx.pk).billing_currency == "EUR"
        plan.refresh_from_db()
        assert (plan.currency, plan.stripe_price_id) == ("EUR", "")
        assert brief.money(9) == "€9"
        # A student has paid in euros: the currency stays.
        Payment.objects.create(
            student=owner,
            payment_type="one_time",
            status="completed",
            amount=Decimal("9.00"),
            platform_fee=Decimal("0"),
            submerchant_payout=Decimal("9.00"),
            currency="EUR",
            provider="bypass",
        )
        assert ms.apply_currency(tenant_ctx, "USD") is False
        assert Tenant.objects.get(pk=tenant_ctx.pk).billing_currency == "EUR"
    finally:
        tenant_ctx.billing_currency = was  # the row rolls back; the shared object would not


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
    links = [link["href"] for link in cfg.navbar_config["links"]]
    assert links == ["/courses", "/events", "/calendar", "/plans", "/about"]
    assert "live" in cfg.enabled_modules and "courses" in cfg.enabled_modules
    ms.sync_site(tenant_ctx, answers)  # idempotent
    assert len(TenantConfig.objects.first().navbar_config["links"]) == 5


def test_a_coach_who_runs_classes_gets_the_calendar_link_by_default(tenant_ctx, config):
    """Audit F2: no calendar questions; the link is on unless an earlier interview said no."""
    ms.sync_site(tenant_ctx, {"offers": ["live"]})
    assert "/calendar" in [link["href"] for link in TenantConfig.objects.first().navbar_config["links"]]
    cfg = TenantConfig.objects.first()
    cfg.navbar_config = {"links": []}
    cfg.save()
    ms.sync_site(tenant_ctx, {"offers": ["live"], "calendar_nav": "no"})
    assert "/calendar" not in [link["href"] for link in TenantConfig.objects.first().navbar_config["links"]]


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


def test_leaving_the_calendar_layout_to_the_guide_picks_the_month_grid(tenant_ctx):
    answers = {"offers": ["live"]}
    ms.choose(tenant_ctx, answers, "calendar_view", brief.DELEGATE)
    assert answers["calendar_view"] == "month" and "calendar_view" in answers["delegated"]


def test_calendar_and_social_choices_are_validated(tenant_ctx, config):
    answers = {}
    ms.choose(tenant_ctx, answers, "calendar_view", "month")
    assert answers["calendar_view"] == "month"
    with pytest.raises(ms.ChoiceError):
        ms.choose(tenant_ctx, answers, "calendar_view", "year")
    ms.choose(tenant_ctx, answers, "socials", "{}")
    assert answers["socials"] == brief.NO_SOCIALS
    with pytest.raises(ms.ChoiceError, match="invalid_handle"):
        ms.choose(tenant_ctx, answers, "socials", '{"Instagram": "not a handle!!"}')
    with pytest.raises(ms.ChoiceError, match="invalid_handle"):
        ms.choose(tenant_ctx, answers, "socials", '{"Instagram": "mira yoga house"}')  # audit R2
    with pytest.raises(ms.ChoiceError, match="invalid_handle"):  # one bad handle is never dropped silently
        ms.choose(tenant_ctx, answers, "socials", '{"Instagram": "mira yoga house", "YouTube": "@mira"}')
    assert ms.calendar_cards()["options"][0]["value"] == "month"


def test_a_crash_while_drafting_marks_the_draft_failed(tenant_ctx, config, owner):
    """Audit R1: any error, not only AI and content ones, ends the spinner."""
    with (
        mock.patch("apps.tenant_config.setup_flow.create_draft", side_effect=KeyError("days")),
        pytest.raises(KeyError),
    ):
        ms.run_draft(tenant_ctx, "event", "prompt")
    assert TenantConfig.objects.first().setup_flow["draft_status"]["event"] == "failed"


def test_a_crash_after_the_draft_exists_keeps_it_ready(tenant_ctx, config, owner):
    """Review focus 3: the draft is there (the stale-worker KeyError hit in
    apply_schedule), so the coach reviews it instead of a failure."""
    with (
        mock.patch("apps.tenant_config.setup_flow.create_draft"),
        mock.patch.object(ms, "apply_schedule", side_effect=KeyError("days")),
        pytest.raises(KeyError),
    ):
        ms.run_draft(tenant_ctx, "event", "prompt")
    assert TenantConfig.objects.first().setup_flow["draft_status"]["event"] == "ready"


def test_a_coach_who_offers_no_course_gets_no_course_draft(tenant_ctx, config):
    """Audit R5: removing the forced course must not draft one anyway."""
    answers = {**HOME, "offers": ["live", "community"], "payments": ["membership"], "memberships": ["online"]}
    assert "draft:course" not in ms._due(tenant_ctx, answers)
    course = {**HOME, "payments": ["membership"], "memberships": ["digital"], "course_topic": "Desk mobility"}
    assert "draft:course" in ms._due(tenant_ctx, course)


def test_a_delegated_membership_pick_follows_the_offers(tenant_ctx, config, side_effects):
    from apps.billing.models import SubscriptionPlan

    answers = {**HOME, "offers": ["live"], "payments": ["membership"], "delegated": ["memberships"]}
    assert "plan:membership" in ms.fire(tenant_ctx, answers)
    plan = SubscriptionPlan.objects.get()
    assert plan.name == "Online membership" and "course" not in plan.description.lower()


def test_a_weekly_class_review_says_it_repeats(tenant_ctx, config, owner):
    """Audit G6: the review showed only the first date of a Tue/Thu weekly series."""
    from apps.core.curated_images import client as curated_client
    from apps.core.models import Tenant

    weekly = {"mode": "recurring", "start": "2026-10-13", "slots": [{"days": [2, 4], "times": ["19:00"]}]}
    answers = {"offers": ["live"], "live_topic": "Desk reset", "live_schedule": weekly}
    Tenant.objects.filter(pk=tenant_ctx.pk).update(wizard_state={"flow": "interview", "answers": answers})
    tenant_ctx.refresh_from_db()
    with mock.patch("apps.core.copilot.content._give_cover"):
        setup_flow.create_fallback_draft(tenant_ctx, owner, "event", answers)
    ms._set_draft_status(tenant_ctx, "event", "ready")
    with mock.patch("apps.core.curated_images.client.search", return_value=curated_client.SearchPage([], 1, False)):
        item = ms.review_card(tenant_ctx, "event")["item"]
    assert "Tuesdays and Thursdays" in item["repeats"]


def test_contact_picks_carry_their_details(tenant_ctx, config):
    """Audit G2: picking WhatsApp never asked for the number."""
    answers = {}
    ms.choose(
        tenant_ctx,
        answers,
        "contact",
        '{"Email": "mira@example.com", "WhatsApp": "+49 170 1234567", "Contact form": ""}',
    )
    assert answers["contact"] == "Email: mira@example.com; WhatsApp: +49 170 1234567; Contact form"
    with pytest.raises(ms.ChoiceError, match="invalid_phone"):
        ms.choose(tenant_ctx, answers, "contact", '{"WhatsApp": "call me"}')
    with pytest.raises(ms.ChoiceError, match="invalid_email"):
        ms.choose(tenant_ctx, answers, "contact", '{"Email": "mira at example"}')


def test_the_look_preview_line_reads_as_a_sentence():
    """Audit V2: the body was raw tiles joined by commas ("…lunch breaks, Anatomy-focused…")."""
    line = ms.hero_line(
        {
            "difference": "Stretches during lunch breaks, Anatomy-focused alignment cueing",
            "outcome": "Less back pain, Better posture",
        }
    )
    assert line == "Stretches during lunch breaks, anatomy-focused alignment cueing. Less back pain and better posture."
    assert ms.hero_line({"difference": "Desk yoga, AI-free and simple"}) == "Desk yoga, AI-free and simple."


def test_the_look_copy_is_written_once_not_on_every_later_answer(tenant_ctx, config):
    """Phase 2A walk: every turn after the look re-served its card, and the copy
    was cached per ALL answers, so each new answer cost a fresh AI call (6-10 s)."""
    from django.core.cache import cache

    from apps.tenant_config import look_copy

    cache.clear()
    calls = []

    def fake(**kwargs):
        calls.append(kwargs)
        return look_copy.LookCopy(), Decimal("0"), "m"

    early = {"teaches": "Yoga", "audience": "Desk workers", "pitch": "Yoga for desks", "offers": ["live"]}
    with (
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.onboarding.ai_compose.record_spend"),
        mock.patch("apps.core.ai.structured", side_effect=fake),
    ):
        look_copy.for_tenant(tenant_ctx, early)
        look_copy.for_tenant(tenant_ctx, {**early, "story": "Back pain", "payments": ["membership"]})
        assert len(calls) == 1  # later answers don't touch the sample copy
        look_copy.for_tenant(tenant_ctx, {**early, "audience": "Remote workers"})
        assert len(calls) == 2  # an answer the copy is written from does


def test_the_look_copy_has_one_writer_at_a_time(tenant_ctx, config):
    """2026-10-12: the card was served again while the first call was still out,
    and each time started a run of its own (five stacked on the hub)."""
    from django.core.cache import cache

    from apps.tenant_config import look_copy

    cache.clear()
    early = {"teaches": "Yoga", "audience": "Desk workers"}
    calls = []

    def slow(**kwargs):
        calls.append(kwargs)
        assert look_copy.for_tenant(tenant_ctx, early) is None  # served again meanwhile: no second run
        return look_copy.LookCopy(), Decimal("0"), "m"

    with (
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.onboarding.ai_compose.record_spend"),
        mock.patch("apps.core.ai.structured", side_effect=slow),
    ):
        assert look_copy.for_tenant(tenant_ctx, early) is not None
        assert look_copy.for_tenant(tenant_ctx, early) is not None  # written: served from the cache
    assert len(calls) == 1


def test_the_header_button_follows_what_the_coach_offers(tenant_ctx, config):
    """Phase 2 walk: a live-only coach's "Get Started" still led to /courses."""
    cfg = TenantConfig.objects.first()
    cfg.navbar_config = {"links": [], "cta": {"text": "Get Started", "href": "/courses"}}
    cfg.save()
    ms.sync_site(tenant_ctx, {"offers": ["live", "community"]})
    assert TenantConfig.objects.first().navbar_config["cta"] == {"text": "Get Started", "href": "/events"}
    ms.sync_site(tenant_ctx, {"offers": ["community"]})  # no classes either: her story
    cfg = TenantConfig.objects.first()
    cfg.navbar_config = {"links": [], "cta": {"text": "Get Started", "href": "/courses"}}
    cfg.save()
    ms.sync_site(tenant_ctx, {"offers": ["community"]})
    assert TenantConfig.objects.first().navbar_config["cta"]["href"] == "/about"
    # A coach who offers courses, or set her own button, keeps it.
    cfg.navbar_config = {"links": [], "cta": {"text": "Book", "href": "/contact"}}
    cfg.save()
    ms.sync_site(tenant_ctx, {"offers": ["live"]})
    assert TenantConfig.objects.first().navbar_config["cta"]["href"] == "/contact"


CLASSES = {**HOME, "payments": ["free"], "live_topic": "Slow flow", "live_when": "Sunday 9am"}
IN_PERSON = {**CLASSES, "offers": ["course", "onsite"], "location": "Studio 4", "address": "Hauptstr. 12"}
ADDRESS = '{"Place": "Studio 4", "Address": "Hauptstr. 12, 10827 Berlin"}'


def test_an_in_person_class_is_drafted_beside_an_online_one(
    tenant_ctx, config, side_effects, django_capture_on_commit_callbacks
):
    with django_capture_on_commit_callbacks(execute=True):
        fired = ms.fire(tenant_ctx, {**IN_PERSON, "offers": ["course", "live", "onsite"]})
    assert {"draft:event", "draft:onsite"} <= set(fired)
    prompts = {call.args[1]: call.args[2] for call in side_effects["draft"].call_args_list}
    assert "online class" in prompts["event"] and "in person class" in prompts["onsite"]


def test_an_in_person_class_alone_is_the_first_class(
    tenant_ctx, config, side_effects, django_capture_on_commit_callbacks
):
    with django_capture_on_commit_callbacks(execute=True):
        fired = ms.fire(tenant_ctx, dict(IN_PERSON))
    assert "draft:event" in fired and "draft:onsite" not in fired


def test_skipping_classes_skips_the_in_person_one_too(
    tenant_ctx, config, side_effects, django_capture_on_commit_callbacks
):
    answers = {**IN_PERSON, "offers": ["course", "live", "onsite"], "skipped": ["event"]}
    with django_capture_on_commit_callbacks(execute=True):
        fired = ms.fire(tenant_ctx, answers)
    assert not {"draft:event", "draft:onsite"} & set(fired)


def test_the_in_person_class_prompt_names_its_place(tenant_ctx, config):
    answers = {**HOME, "offers": ["course", "live", "onsite"], "live_topic": "Pads", "location": "Studio 4"}
    assert "online class" in ms.draft_prompt(answers, "event")
    in_person = ms.draft_prompt(answers, "onsite")
    assert "in person class" in in_person and "Where: Studio 4." in in_person


def test_a_sexy_tone_ranks_the_looks_tagged_for_it():
    from apps.tenant_config import sections

    # No niche here, so the tone alone decides the order.
    assert "sexy" in sections.tones_of_style(sections.rank_styles("no-such-niche", ["sexy"])[0])


def test_a_mood_tag_outweighs_a_niche_made_for_another_tone():
    """ "Sexy and sensual" once gave a pole coach the joyful zine, a sensual yoga coach the quiet journal."""
    from apps.tenant_config import sections

    def first(niche, tones):
        return sections.rank_styles(niche, tones)[0]["id"]

    assert first("pole_dance", ["sexy", "sensual"]) == "velvet"  # the boudoir look; studiofloor is the neon one
    assert first("belly_dance", ["sexy", "sensual"]) == "velvet"
    assert first("dance", ["sexy", "sensual"]) == "studiofloor"  # a plain dance coach: the dance look
    # ...but it never leads for a coach who did not ask for it.
    assert first("pole_dance", ["warm", "calm"]) != "velvet"
    assert first("pole_dance", []) != "velvet"
    assert first("belly_dance", []) != "velvet"
    assert first("yoga", ["sensual"]) == "nocturne"
    assert first("yoga", ["warm", "calm"]) in {"journal", "nocturne"}  # regression: still a yoga-made look
    assert first("general", []) == "grid"  # no tone, no change
    # The cards (and the default pick, which ranks the same way) follow.
    cards = ms.style_cards({"niche": "dance", "teaches": "pole", "tone": "Sexy, Sensual"})
    assert cards["options"][0]["style"] == "studiofloor"
    cards = ms.style_cards({"niche": "belly_dance", "teaches": "belly dance", "tone": "Sexy, Sensual"})
    assert cards["options"][0]["style"] == "velvet"


def test_the_in_person_draft_falls_back_to_an_in_person_class(tenant_ctx, config, owner):
    from apps.live.models import OnsiteEvent

    answers = {
        "teaches": "Yoga",
        "offers": ["course", "live", "onsite"],
        "live_topic": "Slow flow",
        "location": "Studio 4",
    }
    with mock.patch("apps.core.copilot.content._give_cover"):
        setup_flow.create_fallback_draft(tenant_ctx, owner, "onsite", answers)
    row = OnsiteEvent.objects.get()
    assert (row.title, row.location) == ("Slow flow", "Studio 4")
    assert TenantConfig.objects.first().setup_flow["drafts"]["onsite"] == {"kind": "onsite", "id": row.id}


def test_the_class_draft_waits_for_the_address(tenant_ctx, config, side_effects, django_capture_on_commit_callbacks):
    asked = {k: v for k, v in IN_PERSON.items() if k not in ("location", "address")}
    with django_capture_on_commit_callbacks(execute=True):
        assert "draft:event" not in ms.fire(tenant_ctx, asked)
        fired = ms.fire(tenant_ctx, dict(IN_PERSON))
    assert "draft:event" in fired


def test_the_address_pick_needs_both_boxes(tenant_ctx, config):
    answers = {"offers": ["onsite"]}
    ms.choose(tenant_ctx, answers, "location", ADDRESS)
    assert (answers["location"], answers["address"]) == ("Studio 4", "Hauptstr. 12, 10827 Berlin")
    with pytest.raises(ms.ChoiceError, match="invalid_address"):
        ms.choose(tenant_ctx, {"offers": ["onsite"]}, "location", '{"Place": "Studio 4", "Address": " "}')


def test_the_in_person_class_carries_the_address_and_follows_a_change(tenant_ctx, config, owner):
    from apps.live.models import OnsiteEvent

    brief.save_answers(tenant_ctx, dict(IN_PERSON))
    with mock.patch("apps.core.copilot.content._give_cover"):
        setup_flow.create_fallback_draft(tenant_ctx, owner, "event", dict(IN_PERSON))
    row = OnsiteEvent.objects.get()
    assert (row.location, row.address) == ("Studio 4", "Hauptstr. 12")
    # She goes back and moves it: the drafted class moves too.
    ms.choose(tenant_ctx, dict(IN_PERSON), "location", '{"Place": "The Loft", "Address": "Kanalstr. 3"}')
    row.refresh_from_db()
    assert (row.location, row.address) == ("The Loft", "Kanalstr. 3")


def test_each_class_is_reviewed_as_its_own_draft(tenant_ctx, config, owner):
    answers = {**IN_PERSON, "offers": ["course", "live", "onsite"]}
    brief.save_answers(tenant_ctx, answers)
    with mock.patch("apps.core.copilot.content._give_cover"):
        setup_flow.create_fallback_draft(tenant_ctx, owner, "event", answers)
        setup_flow.create_fallback_draft(tenant_ctx, owner, "onsite", answers)
    for kind in ("event", "onsite"):
        ms._set_draft_status(tenant_ctx, kind, "ready")
    with mock.patch("apps.tenant_config.interview_milestones._cover_images", return_value=[]):
        online = ms.cards_for(tenant_ctx, answers, "event_review")
        in_person = ms.cards_for(tenant_ctx, answers, "onsite_review")
    assert (online["kind"], online["item"]["event_kind"], online["item"]["address"]) == ("event", "live", "")
    assert (in_person["kind"], in_person["status"]) == ("onsite", "ready")
    assert (in_person["item"]["event_kind"], in_person["item"]["address"]) == ("onsite", "Hauptstr. 12")
    # Approving it is its own answer, apart from the online class's.
    ms.choose(tenant_ctx, answers, "onsite_review", "ok")
    assert answers["onsite_review"] == "approved" and "event_review" not in answers
