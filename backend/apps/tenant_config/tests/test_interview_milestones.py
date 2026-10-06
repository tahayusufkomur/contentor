"""Interview milestones fire once, when their facts are settled; look picks
apply immediately; drafts fall back so go-live is never blocked."""

from decimal import Decimal
from unittest import mock

import pytest

from apps.accounts.models import User
from apps.courses.models import Course
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
        "course_format": "4 weeks",
        "course_level": "Beginners",
        "sells": "free",
    }
    with django_capture_on_commit_callbacks(execute=True):
        assert "draft:course" in ms.fire(tenant_ctx, answers)
    _tenant_id, kind, prompt = side_effects["draft"].call_args.args
    assert kind == "course" and "Morning mobility" in prompt and "free" in prompt
    assert TenantConfig.objects.first().setup_flow["draft_status"]["course"] == "building"


def test_event_waits_for_live_entitlement(tenant_ctx, config, side_effects):
    answers = {**HOME, "offers": ["course", "live"], "live_topic": "Slow flow", "live_when": "Sunday 9am"}
    with mock.patch("apps.tenant_config.interview_milestones._live_entitled", return_value=False):
        assert "draft:event" not in ms.fire(tenant_ctx, answers)
    with mock.patch("apps.tenant_config.interview_milestones._live_entitled", return_value=True):
        assert "draft:event" in ms.fire(tenant_ctx, answers)


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
    ms.choose(tenant_ctx, answers, "sells", "Students pay")
    assert answers["sells"] == "paid"
    with pytest.raises(ms.ChoiceError):
        ms.choose(tenant_ctx, answers, "course_price", "no idea")


def test_style_cards_offer_every_look_with_the_niche_style_first():
    cards = ms.style_cards({"niche": "fitness"})
    assert cards["kind"] == "style" and len(cards["options"]) == 12
    assert [o["style"] for o in cards["options"][:3]] == ["kinetic"] * 3
    assert cards["options"][0]["value"] == "kinetic" and cards["options"][0]["recommended"] is True
    assert cards["options"][1]["value"] == "kinetic:ocean" and "recommended" not in cards["options"][1]
    assert all({"value", "style", "palette", "label", "detail"} <= set(o) for o in cards["options"])


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
