import pytest
from django.core.management import call_command
from django.db import connection
from django_tenants.utils import tenant_context

from apps.core.models import Tenant


@pytest.mark.django_db
def test_seed_dev_tenants_creates_one_published_pro_tenant():
    call_command("seed_dev_tenants")
    t = Tenant.objects.get(slug="demo-yoga")
    assert t.plan.name == "pro"
    assert t.is_published is True  # publish gate: no is_demo crutch anymore
    assert t.template_niche == "yoga"  # serializer "niche" derives from this now
    assert not hasattr(t, "is_demo")  # field is gone
    assert not Tenant.objects.filter(slug__in=["demo-fitness", "demo-pilates"]).exists()


@pytest.mark.django_db
def test_tenant_has_one_owner_and_one_student_login():
    call_command("seed_dev_tenants")
    from apps.accounts.models import User

    t = Tenant.objects.get(slug="demo-yoga")
    with tenant_context(t):
        # issue_login_token resolves these two filters — keep them seedable.
        assert User.objects.filter(role="owner", is_staff=True).count() == 1
        assert list(User.objects.filter(role="student").values_list("email", flat=True)) == ["priya@demo.test"]


@pytest.mark.django_db
def test_student_has_full_access_without_billing_edge_cases():
    """The one student is the tester's login: she owns a course, an active
    subscription and progress — none of it refunded or past_due."""
    call_command("seed_dev_tenants")
    from apps.billing.models import Payment, Subscription

    t = Tenant.objects.get(slug="demo-yoga")
    with tenant_context(t):
        assert Payment.objects.exists()
        assert not Payment.objects.filter(status="refunded").exists()
        assert Subscription.objects.filter(status="active").exists()
        assert not Subscription.objects.exclude(status="active").exists()


@pytest.mark.django_db
def test_tenant_has_live_classes():
    call_command("seed_dev_tenants")
    from apps.live.models import LiveClass

    t = Tenant.objects.get(slug="demo-yoga")
    with tenant_context(t):
        assert LiveClass.objects.exists()


@pytest.mark.django_db
def test_tenant_has_mailbox_conversation_with_messages_and_attachment():
    call_command("seed_dev_tenants")
    from apps.mailbox.models import Conversation, Message, MessageAttachment

    t = Tenant.objects.get(slug="demo-yoga")
    with tenant_context(t):
        assert Conversation.objects.count() >= 1
        assert Message.objects.count() >= Conversation.objects.count()
        assert MessageAttachment.objects.exclude(message=None).exists()


@pytest.mark.django_db
def test_tenant_has_community_enabled_with_posts():
    call_command("seed_dev_tenants")
    from apps.community.models import CommunitySettings, Post

    t = Tenant.objects.get(slug="demo-yoga")
    with tenant_context(t):
        assert CommunitySettings.load().is_enabled is True
        assert Post.objects.count() >= 3


@pytest.mark.django_db
def test_tenant_has_full_notifications():
    call_command("seed_dev_tenants")
    from apps.notifications.models import (
        Announcement,
        AnnouncementTemplate,
        EmailOptOut,
        PushSubscription,
        RecurringAnnouncement,
    )

    t = Tenant.objects.get(slug="demo-yoga")
    with tenant_context(t):
        assert Announcement.objects.count() >= 1
        assert AnnouncementTemplate.objects.count() >= 1
        # "full" extras: recurring schedule, opt-out, push subscription.
        assert RecurringAnnouncement.objects.count() >= 1
        assert EmailOptOut.objects.count() == 1
        assert PushSubscription.objects.count() == 1


@pytest.mark.django_db
def test_tenant_has_usage_events_spanning_multiple_days():
    call_command("seed_dev_tenants")
    from apps.usage.models import UsageEvent

    t = Tenant.objects.get(slug="demo-yoga")
    with tenant_context(t):
        # >=5 distinct days so a time-series dashboard has real variation.
        assert UsageEvent.objects.dates("day", "day").count() >= 5


@pytest.mark.django_db
def test_tenant_has_filters_and_tags_assigned():
    call_command("seed_dev_tenants")
    from apps.courses.models import Course, Video
    from apps.downloads.models import DownloadFile
    from apps.filters.models import FilterGroup
    from apps.media.models import Photo
    from apps.tags.models import Tag

    t = Tenant.objects.get(slug="demo-yoga")
    with tenant_context(t):
        assert FilterGroup.objects.count() >= 1
        assert Course.objects.filter(filter_options__isnull=False).exists()
        assert Tag.objects.count() >= 1
        assert (
            Course.objects.filter(tags__isnull=False).exists()
            or Video.objects.filter(tags__isnull=False).exists()
            or Photo.objects.filter(tags__isnull=False).exists()
            or DownloadFile.objects.filter(tags__isnull=False).exists()
        )


@pytest.mark.django_db
def test_tenant_has_enabled_assistant_with_knowledge_entries():
    call_command("seed_dev_tenants")
    from apps.tenant_config.models import AssistantConfig, AssistantKnowledgeEntry, AssistantLink

    t = Tenant.objects.get(slug="demo-yoga")
    with tenant_context(t):
        assert AssistantConfig.load().enabled is True
        assert AssistantKnowledgeEntry.objects.count() >= 2
        assert AssistantLink.objects.count() >= 1


@pytest.mark.django_db
def test_tenant_has_blog_topic_queue_and_enabled_autopilot():
    call_command("seed_dev_tenants")
    from apps.blog.models import BlogAutopilot, BlogTopicIdea

    t = Tenant.objects.get(slug="demo-yoga")
    with tenant_context(t):
        assert BlogTopicIdea.objects.count() >= 3
        assert BlogAutopilot.load().is_enabled is True


@pytest.mark.django_db
def test_tenant_has_active_platform_subscription():
    """Regression guard for the has_paid_platform_plan gap.

    Tenant.has_paid_platform_plan does NOT read Tenant.plan directly — it
    checks for an actual PlatformSubscription row via is_subscription_active.
    Without one, every paid-tier feature gated on has_paid_platform_plan
    (site assistant, mailbox identity, logo studio, quotas, blog AI) silently
    reads as free/locked even though Tenant.plan says pro.
    """
    call_command("seed_dev_tenants")

    t = Tenant.objects.get(slug="demo-yoga")
    assert t.has_paid_platform_plan is True
    assert t.platform_subscription.status == "active"
    assert t.platform_subscription.provider == "manual"
    assert t.platform_subscription.plan_id == t.plan_id


@pytest.mark.django_db
def test_paid_tenant_coach_user_exists_in_public_schema():
    """PlatformSubscription.user needs a public-schema coach User row (distinct
    from the tenant-schema owner) — mirrors real signup provisioning."""
    from apps.accounts.models import User

    call_command("seed_dev_tenants")
    t = Tenant.objects.get(slug="demo-yoga")
    # No tenant_context here — this must resolve against the public schema.
    assert User.objects.filter(email__iexact=t.owner_email, role="coach").exists()


@pytest.mark.django_db(transaction=True)
def test_force_reseed_does_not_error_on_platform_subscription_cascade():
    """PlatformSubscription.tenant is on_delete=CASCADE — --force's teardown
    (which deletes the Tenant row) must not error, and the recreated tenant
    must end up with exactly one fresh subscription.

    Needs transaction=True (not plain django_db) — this test does two full
    CREATE SCHEMA / DROP SCHEMA CASCADE cycles, and plain django_db wraps the
    test body in an uncommitted savepoint-based transaction where deferred
    trigger events from the first cycle's inserts never actually fire,
    causing the second cycle's DROP SCHEMA CASCADE to fail with
    "cannot DROP TABLE ... because it has pending trigger events" — a test-
    isolation artifact, not a real bug (same reason test_provision_tenant.py /
    test_wizard_provision.py etc. also use transaction=True for schema-
    lifecycle tests)."""
    from apps.core.models import PlatformSubscription

    call_command("seed_dev_tenants")
    call_command("seed_dev_tenants", "--force")

    t = Tenant.objects.get(slug="demo-yoga")
    assert PlatformSubscription.objects.filter(tenant=t).count() == 1
    assert t.has_paid_platform_plan is True


@pytest.mark.django_db(transaction=True)
def test_reset_deletes_every_other_tenant():
    """--reset leaves demo-yoga as the only tenant: other rows, domains and
    schemas are gone (transaction=True for the same schema-lifecycle reason
    as the --force test above)."""
    from apps.core.models import Domain

    # Hyphenated, like signup-created schemas: the DROP must quote it.
    other = Tenant.objects.create(name="Old", slug="old-coach", subdomain="old-coach", schema_name="old-coach")
    Domain.objects.create(domain="old-coach.localhost", tenant=other, is_primary=True)

    call_command("seed_dev_tenants", "--reset")

    assert list(Tenant.objects.exclude(schema_name="public").values_list("slug", flat=True)) == ["demo-yoga"]
    assert not Domain.objects.filter(domain="old-coach.localhost").exists()
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1 FROM information_schema.schemata WHERE schema_name = 'old-coach'")
        assert cursor.fetchone() is None
