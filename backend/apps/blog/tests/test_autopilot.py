"""Exactly-once claim, draft-vs-publish, out-of-credit skip notice (once per
month), empty-queue refill. Mirrors test_recurring_dispatch.py structure —
call the per-tenant functions directly inside the tenant schema; mock ai.*
and the push service."""

from datetime import timedelta
from decimal import Decimal
from unittest import mock

import pytest
from django.utils import timezone
from django_tenants.utils import schema_context

from apps.accounts.models import User
from apps.blog import ai, tasks
from apps.blog.models import BlogAutopilot, BlogPost, BlogTopicIdea
from apps.core.models import PlatformPlan, PlatformSubscription

pytestmark = pytest.mark.django_db(transaction=True)

SHARED_SCHEMA = "shared_test"


@pytest.fixture()
def paid_tenant(tenant_ctx):
    with schema_context("public"):
        plan = PlatformPlan.objects.create(
            name="Blog Autopilot Test Paid", price_monthly=19, transaction_fee_pct=5, max_ai_blog_posts=5
        )
        owner = User.objects.create_user(
            email="blogautopilot-owner@x.com",
            name="Owner",
            password="x",  # noqa: S106
            role="owner",
        )
        PlatformSubscription.objects.create(
            tenant=tenant_ctx, user=owner, plan=plan, status=PlatformSubscription.STATUS_ACTIVE, provider="manual"
        )
    tenant_ctx.refresh_from_db()
    return tenant_ctx


@pytest.fixture(autouse=True)
def _clean_shared():
    def _scrub():
        with schema_context(SHARED_SCHEMA):
            PlatformSubscription.objects.all().delete()
            PlatformPlan.objects.filter(name="Blog Autopilot Test Paid").delete()
            User.objects.filter(email="blogautopilot-owner@x.com").delete()

    _scrub()
    yield
    _scrub()


def _due_rule(**kw):
    rule = BlogAutopilot.load()
    rule.is_enabled = True
    rule.frequency = "weekly"
    rule.weekday = 0
    rule.next_run_at = timezone.now() - timedelta(minutes=5)
    for k, v in kw.items():
        setattr(rule, k, v)
    rule.save()
    return rule


def _draft_result():
    return ai.DraftResult(
        {"title": "T", "body_html": "<p>b</p>", "excerpt": "e", "meta_description": "m", "tags": [], "ai_model": "x"},
        Decimal("0.03"),
    )


def test_claim_advances_next_run_exactly_once(paid_tenant):
    rule = _due_rule()
    old = rule.next_run_at
    with mock.patch.object(tasks.generate_autopilot_post, "delay") as spawn:
        tasks._dispatch_for_current_tenant(paid_tenant.schema_name)
        tasks._dispatch_for_current_tenant(paid_tenant.schema_name)  # second run: not due anymore
    rule.refresh_from_db()
    assert rule.next_run_at > old
    assert spawn.call_count == 1


def test_generate_creates_draft_and_notifies(paid_tenant, settings):
    settings.ANTHROPIC_API_KEY = "test-key"
    _due_rule(auto_publish=False)
    BlogTopicIdea.objects.create(title="Sleep myths", angle="")
    with (
        mock.patch.object(ai, "generate_post", return_value=_draft_result()),
        mock.patch.object(tasks, "_notify_coach") as notify,
    ):
        tasks._generate_for_current_tenant(paid_tenant)
    post = BlogPost.objects.get()
    assert post.status == "draft" and post.source == "autopilot" and post.created_by is None
    assert BlogTopicIdea.objects.get().status == "used"
    notify.assert_called_once()


def test_generate_auto_publish(paid_tenant, settings):
    settings.ANTHROPIC_API_KEY = "test-key"
    _due_rule(auto_publish=True)
    BlogTopicIdea.objects.create(title="x", angle="")
    with (
        mock.patch.object(ai, "generate_post", return_value=_draft_result()),
        mock.patch.object(tasks, "_notify_coach"),
    ):
        tasks._generate_for_current_tenant(paid_tenant)
    post = BlogPost.objects.get()
    assert post.status == "published" and post.published_at is not None


def test_out_of_credits_notifies_once_per_month(paid_tenant):
    rule = _due_rule()
    fake_status = {"reason": "quota_exhausted", "remaining": 0, "limit": 5, "enabled": True, "eligible": True}
    with (
        mock.patch.object(ai, "availability", return_value=fake_status),
        mock.patch.object(tasks, "_notify_coach") as notify,
    ):
        tasks._generate_for_current_tenant(paid_tenant)
        tasks._generate_for_current_tenant(paid_tenant)
    assert notify.call_count == 1
    rule.refresh_from_db()
    assert rule.last_skip_notice_month == ai.current_month()
    assert BlogPost.objects.count() == 0


def test_empty_queue_triggers_refill(paid_tenant, settings):
    settings.ANTHROPIC_API_KEY = "test-key"
    _due_rule()
    with (
        mock.patch.object(ai, "generate_post", return_value=_draft_result()),
        mock.patch.object(
            ai, "generate_topics", return_value=([{"title": "fresh", "angle": ""}], Decimal("0.004"))
        ) as refill,
        mock.patch.object(tasks, "_notify_coach"),
    ):
        tasks._generate_for_current_tenant(paid_tenant)
    refill.assert_called_once()
    assert BlogPost.objects.get().title == "T"


def test_autopilot_offers_and_materializes_curated_photos(paid_tenant, settings):
    from apps.core.models import CuratedPhoto
    from apps.media.models import Photo

    settings.ANTHROPIC_API_KEY = "test-key"
    _due_rule(auto_publish=False)
    BlogTopicIdea.objects.create(title="Morning habits", angle="beginner")
    with schema_context("public"):
        row = CuratedPhoto.objects.create(
            title="Morning light",
            tags="morning, habits",
            kind="hero",
            image_key="platform/curated-photos/morning.png",
        )
    draft = ai.DraftResult(
        {
            "title": "T",
            "body_html": "<p>b</p>",
            "excerpt": "e",
            "meta_description": "m",
            "tags": ["t"],
            "ai_model": "x",
            "cover_photo_id": f"curated:{row.pk}",
            "image_placements": [],
        },
        Decimal("0.03"),
    )
    with (
        mock.patch.object(ai, "generate_post", return_value=draft) as gen,
        mock.patch.object(tasks, "_notify_coach"),
    ):
        tasks._generate_for_current_tenant(paid_tenant)
    post = BlogPost.objects.latest("created_at")
    photo = Photo.objects.get(s3_key="platform/curated-photos/morning.png")
    assert post.cover_photo_id == photo.id
    offered_ids = [str(p.id) for p in gen.call_args.kwargs["photos"]]
    assert f"curated:{row.pk}" in offered_ids
    with schema_context("public"):
        CuratedPhoto.objects.all().delete()
