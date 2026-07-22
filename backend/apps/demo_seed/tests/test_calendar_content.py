"""Demo calendar content: blog posts + email campaigns so /admin/calendar shows
a realistic mix (live events are already seeded by seed_demo_tenant). Helpers are
idempotent so a backfill can run against an already-seeded demo tenant."""

import pytest

from apps.accounts.models import User
from apps.blog.models import BlogPost
from apps.demo_seed.calendar_content import seed_blog_posts, seed_email_campaigns
from apps.email_campaigns.models import CampaignStatus, EmailCampaign

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@democal.com",
        name="Demo Owner",
        password="secret123",  # noqa: S106  # pragma: allowlist secret
        role="owner",
    )


class TestSeedBlogPosts:
    def test_creates_published_and_draft_posts(self, tenant_ctx, owner):
        posts = seed_blog_posts(owner)
        assert len(posts) >= 5
        published = BlogPost.objects.filter(status="published")
        drafts = BlogPost.objects.filter(status="draft")
        assert published.exists() and drafts.exists()
        # Published posts must carry a publish date (the calendar places them there).
        assert all(p.published_at is not None for p in published)
        assert all(p.published_at is None for p in drafts)

    def test_is_idempotent(self, tenant_ctx, owner):
        seed_blog_posts(owner)
        first = BlogPost.objects.count()
        seed_blog_posts(owner)
        assert BlogPost.objects.count() == first


class TestSeedEmailCampaigns:
    def test_creates_sent_and_scheduled_campaigns(self, tenant_ctx, owner):
        campaigns = seed_email_campaigns(owner)
        assert len(campaigns) >= 3
        sent = EmailCampaign.objects.filter(status=CampaignStatus.SENT)
        scheduled = EmailCampaign.objects.filter(status=CampaignStatus.SCHEDULED)
        assert sent.exists() and scheduled.exists()
        assert all(c.sent_at is not None for c in sent)
        # Scheduled demo campaigns must be dated in the future.
        from django.utils import timezone

        assert all(c.scheduled_at and c.scheduled_at > timezone.now() for c in scheduled)

    def test_is_idempotent(self, tenant_ctx, owner):
        seed_email_campaigns(owner)
        first = EmailCampaign.objects.count()
        seed_email_campaigns(owner)
        assert EmailCampaign.objects.count() == first
