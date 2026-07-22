"""Demo blog posts + email campaigns for the coach content calendar.

seed_demo_tenant already seeds Live events; these two helpers add the other two
calendar lanes so /admin/calendar shows a realistic Live + Blog + Email mix.
Both are idempotent (get_or_create keyed on title/subject) so the standalone
``backfill_demo_calendar`` command can safely run against already-seeded demos.
"""

from datetime import timedelta

from django.utils import timezone

# 6 published + 2 drafts. Wellness-flavoured but niche-agnostic so every demo
# tenant reads plausibly.
PUBLISHED_BLOG_TITLES = [
    "5 Tips for Better Posture",
    "How to Build a Routine That Sticks",
    "The Science of Rest and Recovery",
    "Beginner Mistakes (and How to Avoid Them)",
    "Nutrition Basics for an Active Life",
    "Finding Motivation That Lasts",
]
DRAFT_BLOG_TITLES = [
    "Planning Your Next Season",
    "A Short Note on Consistency",
]

SENT_EMAIL_SUBJECTS = [
    "Welcome to the Community",
    "This Month's Highlights",
    "New Content Just Dropped",
]
SCHEDULED_EMAIL_SUBJECTS = [
    "Weekend Workshop Reminder",
    "Your Weekly Inspiration",
]


def seed_blog_posts(owner, now=None):
    """Create demo blog posts (idempotent). Returns the posts touched."""
    from apps.blog.models import BlogPost, unique_slug

    now = now or timezone.now()
    posts = []

    for i, title in enumerate(PUBLISHED_BLOG_TITLES):
        post, _ = BlogPost.objects.get_or_create(
            title=title,
            defaults={
                "slug": unique_slug(title),
                "status": "published",
                # Spread backwards ~5 days apart so a month view shows several.
                "published_at": now - timedelta(days=(i + 1) * 5),
                "created_by": owner,
                "excerpt": f"{title} — a quick read for your students.",
                "meta_description": title,
                "body_html": f"<p>{title}. This is demo content for the coach blog.</p>",
                "source": "manual",
            },
        )
        posts.append(post)

    for title in DRAFT_BLOG_TITLES:
        post, _ = BlogPost.objects.get_or_create(
            title=title,
            defaults={
                "slug": unique_slug(title),
                "status": "draft",
                "published_at": None,
                "created_by": owner,
                "excerpt": f"{title} — draft.",
                "body_html": f"<p>{title}. Draft in progress.</p>",
                "source": "manual",
            },
        )
        posts.append(post)

    return posts


def seed_email_campaigns(owner, now=None):
    """Create demo email campaigns (idempotent). Returns the campaigns touched."""
    from apps.email_campaigns.models import CampaignStatus, EmailCampaign

    now = now or timezone.now()
    campaigns = []

    for i, subject in enumerate(SENT_EMAIL_SUBJECTS):
        recipients = 120 + i * 25
        campaign, _ = EmailCampaign.objects.get_or_create(
            subject=subject,
            defaults={
                "template_id": f"demo-tpl-sent-{i}",
                "template_name": "Demo Template",
                "sender": owner,
                "recipient_filter": {"type": "all"},
                "recipient_count": recipients,
                "success_count": recipients,
                "status": CampaignStatus.SENT,
                # Spread backwards ~1 week apart.
                "sent_at": now - timedelta(days=(i + 1) * 7),
                "recipient_summary": "All students",
            },
        )
        campaigns.append(campaign)

    for i, subject in enumerate(SCHEDULED_EMAIL_SUBJECTS):
        campaign, _ = EmailCampaign.objects.get_or_create(
            subject=subject,
            defaults={
                "template_id": f"demo-tpl-scheduled-{i}",
                "template_name": "Demo Template",
                "sender": owner,
                "recipient_filter": {"type": "all"},
                "recipient_count": 0,
                "status": CampaignStatus.SCHEDULED,
                # Upcoming, a few days out.
                "scheduled_at": now + timedelta(days=(i + 1) * 4),
                "recipient_summary": "All students",
            },
        )
        campaigns.append(campaign)

    return campaigns
