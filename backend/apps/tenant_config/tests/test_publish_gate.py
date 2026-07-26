"""publish_blockers must never gate a coach on content their goals didn't ask
for or their plan doesn't entitle them to (the free plan has is_live_enabled
False and max_ai_blog_posts 0)."""

from types import SimpleNamespace
from unittest.mock import patch

import pytest

from apps.accounts.models import User
from apps.blog.models import BlogPost
from apps.courses.models import Course
from apps.tenant_config.models import TenantConfig
from apps.tenant_config.setup_items import publish_blockers

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="coach@publish-gate.test",
        name="Coach",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture()
def config(tenant_ctx):
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    cfg.setup_progress = {"look_edited": True}
    cfg.save()
    return cfg


def _tenant(goals=(), live_enabled=False):
    """A stand-in for the public-schema Tenant row. publish_blockers only does
    attribute access, so a namespace is enough and keeps the test fast."""
    return SimpleNamespace(
        wizard_state={"answers": {"goals": list(goals)}},
        platform_subscription=SimpleNamespace(plan=SimpleNamespace(is_live_enabled=live_enabled)),
        template_seed_status="",
        is_published=False,
    )


def _published_course(coach):
    return Course.objects.create(
        title="C", slug="c-publish-gate", description="d", price=0, is_published=True, instructor=coach
    )


def test_no_event_or_blog_blocker_when_goals_do_not_ask(config, coach):
    _published_course(coach)
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=True):
        blockers = publish_blockers(config, _tenant(goals=["sell_downloads"]))
    assert "first_event" not in blockers
    assert "first_blog_post" not in blockers
    assert blockers == []


def test_free_plan_is_never_gated_on_an_event_it_cannot_create(config, coach):
    """Goal asks for live classes but the plan's live entitlement is off —
    the coach could never satisfy this blocker, so it must not be applied."""
    _published_course(coach)
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=True):
        blockers = publish_blockers(config, _tenant(goals=["run_live_classes"], live_enabled=False))
    assert "first_event" not in blockers


def test_event_blocker_when_goal_and_entitlement_both_present(config, coach):
    _published_course(coach)
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=True):
        blockers = publish_blockers(config, _tenant(goals=["run_live_classes"], live_enabled=True))
    assert "first_event" in blockers


def test_blog_blocker_applies_on_goal_and_clears_when_published(config, coach):
    _published_course(coach)
    tenant = _tenant(goals=["write_blog"])
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=True):
        assert "first_blog_post" in publish_blockers(config, tenant)

    BlogPost.objects.create(title="P", slug="p", status="published")
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=True):
        assert "first_blog_post" not in publish_blockers(config, tenant)


def test_draft_blog_post_does_not_satisfy_the_blocker(config, coach):
    _published_course(coach)
    BlogPost.objects.create(title="D", slug="d", status="draft")
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=True):
        assert "first_blog_post" in publish_blockers(config, _tenant(goals=["write_blog"]))


def test_unpublished_course_does_not_satisfy_the_product_blocker(config, coach):
    Course.objects.create(
        title="Draft", slug="draft-publish-gate", description="d", price=0, is_published=False, instructor=coach
    )
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=True):
        assert "first_course" in publish_blockers(config, _tenant())


def test_manual_tick_never_satisfies_a_blocker(config):
    config.setup_progress = {"look_edited": True, "manual": {"first_course": True}}
    config.save()
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=True):
        assert "first_course" in publish_blockers(config, _tenant())


def test_seeded_content_does_not_block_publishing(config, coach):
    """Seeded AI starter content registers SeededObject rows; that must NOT
    reintroduce a demo_cleanup publish blocker (Plan 4 — AI seeding)."""
    from apps.blog.models import BlogPost
    from apps.tenant_config.seeding import register_seeded

    _published_course(coach)  # satisfies first_course
    seeded = BlogPost.objects.create(title="Seeded", slug="seeded", status="draft", source="ai", noindex=True)
    register_seeded([seeded], niche="general")
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=True):
        blockers = publish_blockers(config, _tenant(goals=["sell_courses"]))
    assert "demo_cleanup" not in blockers
