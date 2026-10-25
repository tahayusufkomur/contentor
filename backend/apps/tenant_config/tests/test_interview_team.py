"""The hand-off lines at go-live: one per specialist, code-owned."""

from decimal import Decimal
from unittest import mock

import pytest

from apps.accounts.models import User
from apps.billing.models import SubscriptionPlan
from apps.core.copilot import team
from apps.core.models import Tenant
from apps.courses.models import Course
from apps.tenant_config import interview_brief as brief
from apps.tenant_config.interview_golive import golive_state
from apps.tenant_config.interview_team import handoff
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db


@pytest.fixture()
def config(tenant_ctx):
    return TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Glow")


def _lines(tenant, answers, flow, **kw):
    return {line["key"]: line for line in handoff(tenant, answers, flow, **kw)}


def test_a_finished_flow_gives_each_specialist_its_lines(tenant_ctx):
    owner = User.objects.create_user(email="o@t.test", name="O", password="x", role="owner")  # noqa: S106
    course = Course.objects.create(title="Desk Yoga", instructor=owner, pricing_type="paid", price=Decimal("49"))
    plan = SubscriptionPlan.objects.create(name="Online membership", price=Decimal("19"), billing_interval_months=1)
    flow = {
        "drafts": {"course": course.id, "plans": {"online": plan.pk}},
        "page_builds": {"home": {"status": "ready"}, "about": {"status": "ready"}, "contact": {"status": "ready"}},
    }
    answers = {"site_style": "calm:sage", "contact": "Email: a@b.co; Instagram; Contact form"}
    with mock.patch("apps.tenant_config.interview_team.can_monetize", return_value=False):
        lines = _lines(tenant_ctx, answers, flow, sells=True)

    assert list(lines) == list(team.KEYS)
    assert lines["designer"]["did"] == "Built your Home, About and Contact pages and your look."
    assert lines["designer"]["next"] == "Ask me to change any page, any time."
    assert lines["content"]["did"] == "Drafted Desk Yoga."
    assert lines["content"]["next"] == "Next: record the first lesson of Desk Yoga."
    assert lines["finance"]["did"] == "Set up Online membership."
    assert lines["finance"]["next"] == "Next: connect payouts so you can get paid."
    assert lines["marketing"]["did"] == "Ready to help new students find you."
    assert lines["marketing"]["next"] == "Next: share your site where your students are."
    assert lines["community"]["did"] == "Set up how students reach you: email, Instagram and contact form."
    assert lines["community"]["next"] == "Messages from students land in your inbox."
    assert lines["assistant"] == {"key": "assistant", "did": "Ran your setup.", "next": "Not sure who to ask? Ask me."}


def test_an_empty_flow_gives_the_fallback_lines(tenant_ctx):
    lines = _lines(tenant_ctx, {}, {})
    assert list(lines) == list(team.KEYS)
    assert lines["designer"]["did"] == "Looks after your site."
    assert lines["content"] == {
        "key": "content",
        "did": "Ready when you want to make your first course or session.",
        "next": "Tell me what you'd like to make first.",
    }
    assert lines["finance"]["did"] == "Kept everything free for now."
    assert lines["finance"]["next"] == "You can change any price in its Access section."
    assert lines["community"]["did"] == "Looks after how students reach you."


def test_a_paid_site_without_memberships_sets_prices_and_a_look_alone_is_named(tenant_ctx):
    lines = _lines(
        tenant_ctx, {"delegated": ["site_style"]}, {"page_builds": {"home": {"status": "ready"}}}, sells=True
    )
    assert lines["finance"]["did"] == "Set your first prices."
    assert lines["designer"]["did"] == "Built your Home page and your look."
    assert (
        _lines(tenant_ctx, {}, {"page_builds": {"home": {"status": "ready"}}})["designer"]["did"]
        == "Built your Home page."
    )


def test_golive_state_carries_the_team(tenant_ctx, config):
    Tenant.objects.filter(pk=tenant_ctx.pk).update(
        wizard_state={"flow": "interview", "answers": {"delegated": [f.id for f in brief.FIELDS]}}
    )
    tenant_ctx.refresh_from_db()
    config.setup_flow = {"status": "active", "interview": {"turns": [], "fired": []}, "page_builds": {}}
    config.save()
    with mock.patch("apps.tenant_config.interview_golive.fire"):
        body = golive_state(tenant_ctx)
    assert [line["key"] for line in body["team"]] == list(team.KEYS)
    assert all(set(line) == {"key", "did", "next"} for line in body["team"])


def test_a_published_article_is_shared_not_published_again(tenant_ctx):
    from apps.blog.models import BlogPost

    post = BlogPost.objects.create(title="Why face yoga", slug="why-face-yoga", status="published")
    marketing = _lines(tenant_ctx, {}, {"drafts": {"post": post.id}})["marketing"]
    assert marketing["did"] == "Wrote your first article, Why face yoga."
    assert marketing["next"] == "Next: share Why face yoga with your students."

    BlogPost.objects.filter(pk=post.pk).update(status="draft")
    marketing = _lines(tenant_ctx, {}, {"drafts": {"post": post.id}})["marketing"]
    assert marketing["did"] == "Drafted your first article, Why face yoga."
    assert marketing["next"] == "Next: publish Why face yoga when you're happy with it."


def test_only_finished_pages_are_claimed_as_built(tenant_ctx):
    builds = {"home": {"status": "ready"}, "about": {"status": "failed"}, "faq": {"status": "building"}, "contact": {}}
    assert _lines(tenant_ctx, {}, {"page_builds": builds})["designer"]["did"] == "Built your Home page."
    assert _lines(tenant_ctx, {}, {"page_builds": {"home": {"status": "failed"}}})["designer"]["did"] == (
        "Looks after your site."
    )
