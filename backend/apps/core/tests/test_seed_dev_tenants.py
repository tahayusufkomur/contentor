import pytest
from django.core.management import call_command
from django_tenants.utils import tenant_context

from apps.core.models import Tenant

DEV_TENANTS = {
    "demo-fitness": ("free", "fitness"),
    "demo-pilates": ("starter", "pilates"),
    "demo-yoga": ("pro", "yoga"),
}


@pytest.mark.django_db
def test_seed_dev_tenants_creates_three_published_tenants_on_correct_plans():
    call_command("seed_dev_tenants")
    for slug, (plan_name, niche) in DEV_TENANTS.items():
        t = Tenant.objects.get(slug=slug)
        if plan_name == "free":
            # The canonical free plan is NOT named "free" — it's named
            # settings.BILLING_FREE_PLAN_NAME (default "Free"), seeded by
            # seed_plans / migration 0005_backfill_free_plan. seed_dev_tenants
            # must reuse that exact row rather than create a duplicate
            # lowercase "free" plan.
            assert t.plan.is_free is True
        else:
            assert t.plan.name == plan_name
        assert t.is_published is True  # publish gate: no is_demo crutch anymore
        assert t.template_niche == niche  # serializer "niche" derives from this now
        assert not hasattr(t, "is_demo")  # field is gone


@pytest.mark.django_db
def test_free_tenant_has_no_live_classes():
    call_command("seed_dev_tenants")
    from apps.live.models import LiveClass

    t = Tenant.objects.get(slug="demo-fitness")
    with tenant_context(t):
        assert LiveClass.objects.count() == 0


@pytest.mark.django_db
def test_each_tenant_has_owner_and_student_logins():
    call_command("seed_dev_tenants")
    from apps.accounts.models import User

    for slug in DEV_TENANTS:
        t = Tenant.objects.get(slug=slug)
        with tenant_context(t):
            # issue_login_token resolves these two filters — keep them seedable.
            assert User.objects.filter(role="owner", is_staff=True).exists()
            assert User.objects.filter(role="student").exists()


@pytest.mark.django_db
def test_pro_tenant_has_mailbox_conversations_with_messages_and_attachment():
    call_command("seed_dev_tenants")
    from apps.mailbox.models import Conversation, Message, MessageAttachment

    t = Tenant.objects.get(slug="demo-yoga")
    with tenant_context(t):
        assert Conversation.objects.count() >= 2
        assert Message.objects.count() >= Conversation.objects.count()
        assert MessageAttachment.objects.exclude(message=None).exists()


@pytest.mark.django_db
def test_free_tenant_has_no_mailbox_conversations():
    call_command("seed_dev_tenants")
    from apps.mailbox.models import Conversation

    t = Tenant.objects.get(slug="demo-fitness")
    with tenant_context(t):
        assert Conversation.objects.count() == 0


@pytest.mark.django_db
def test_pro_tenant_has_community_enabled_with_posts():
    call_command("seed_dev_tenants")
    from apps.community.models import CommunitySettings, Post

    t = Tenant.objects.get(slug="demo-yoga")
    with tenant_context(t):
        assert CommunitySettings.load().is_enabled is True
        assert Post.objects.count() >= 3


@pytest.mark.django_db
def test_free_tenant_has_community_disabled_with_no_members_or_posts():
    call_command("seed_dev_tenants")
    from apps.community.models import CommunityMember, CommunitySettings, Post

    t = Tenant.objects.get(slug="demo-fitness")
    with tenant_context(t):
        # seed_community is never called for the free tier (community=0), so
        # CommunitySettings is left at its model default (is_enabled=False) —
        # it may not even exist yet (the app never lazily created it).
        settings_obj = CommunitySettings.objects.first()
        if settings_obj is not None:
            assert settings_obj.is_enabled is False
        assert CommunityMember.objects.count() == 0
        assert Post.objects.count() == 0


@pytest.mark.django_db
def test_pro_tenant_has_full_notifications():
    call_command("seed_dev_tenants")
    from apps.notifications.models import (
        Announcement,
        AnnouncementRecipient,
        AnnouncementTemplate,
        EmailOptOut,
        PushSubscription,
        RecurringAnnouncement,
    )

    t = Tenant.objects.get(slug="demo-yoga")
    with tenant_context(t):
        assert Announcement.objects.count() >= 1
        assert AnnouncementTemplate.objects.count() >= 1
        # "full" tier extras: recurring schedule, opt-out, push subscription.
        assert RecurringAnnouncement.objects.count() >= 1
        assert EmailOptOut.objects.count() == 1
        assert PushSubscription.objects.count() == 1
        # Read/unread mix so both inbox states render.
        recipients = AnnouncementRecipient.objects.all()
        assert recipients.filter(read_at__isnull=False).exists()
        assert recipients.filter(read_at__isnull=True).exists()


@pytest.mark.django_db
def test_starter_tenant_has_light_notifications_only():
    call_command("seed_dev_tenants")
    from apps.notifications.models import (
        Announcement,
        AnnouncementTemplate,
        EmailOptOut,
        PushSubscription,
        RecurringAnnouncement,
    )

    t = Tenant.objects.get(slug="demo-pilates")
    with tenant_context(t):
        assert Announcement.objects.count() >= 1
        assert AnnouncementTemplate.objects.count() >= 1
        # "light" tier skips the recurring/opt-out/push-subscription extras.
        assert RecurringAnnouncement.objects.count() == 0
        assert EmailOptOut.objects.count() == 0
        assert PushSubscription.objects.count() == 0


@pytest.mark.django_db
def test_free_tenant_has_no_notifications():
    call_command("seed_dev_tenants")
    from apps.notifications.models import Announcement, AnnouncementTemplate

    t = Tenant.objects.get(slug="demo-fitness")
    with tenant_context(t):
        assert Announcement.objects.count() == 0
        assert AnnouncementTemplate.objects.count() == 0


@pytest.mark.django_db
def test_pro_tenant_has_usage_events_spanning_multiple_days():
    call_command("seed_dev_tenants")
    from apps.usage.models import UsageEvent

    t = Tenant.objects.get(slug="demo-yoga")
    with tenant_context(t):
        # No plan-tier gate for usage analytics (unlike mailbox/community/
        # notifications) — the brief's hard requirement is >=5 distinct days
        # so a time-series dashboard has real variation to render.
        assert UsageEvent.objects.dates("day", "day").count() >= 5


@pytest.mark.django_db
def test_free_tenant_also_has_usage_events():
    call_command("seed_dev_tenants")
    from apps.usage.models import UsageEvent

    t = Tenant.objects.get(slug="demo-fitness")
    with tenant_context(t):
        # Usage analytics is called unconditionally for all three tiers.
        assert UsageEvent.objects.exists()


@pytest.mark.django_db
def test_pro_tenant_has_filters_and_tags_assigned():
    call_command("seed_dev_tenants")
    from apps.courses.models import Course
    from apps.filters.models import FilterGroup
    from apps.tags.models import Tag

    t = Tenant.objects.get(slug="demo-yoga")
    with tenant_context(t):
        # seed_filters: >=1 FilterGroup with options assigned to >=1 course.
        assert FilterGroup.objects.count() >= 1
        assert Course.objects.filter(filter_options__isnull=False).exists()

        # seed_tags: >=1 Tag assigned to at least one of the seeded content
        # types (courses/videos/photos/downloads).
        from apps.courses.models import Video
        from apps.downloads.models import DownloadFile
        from apps.media.models import Photo

        assert Tag.objects.count() >= 1
        tagged_course = Course.objects.filter(tags__isnull=False).exists()
        tagged_video = Video.objects.filter(tags__isnull=False).exists()
        tagged_photo = Photo.objects.filter(tags__isnull=False).exists()
        tagged_download = DownloadFile.objects.filter(tags__isnull=False).exists()
        assert tagged_course or tagged_video or tagged_photo or tagged_download


@pytest.mark.django_db
def test_free_tenant_also_has_filters_and_tags():
    call_command("seed_dev_tenants")
    from apps.filters.models import FilterGroup
    from apps.tags.models import Tag

    t = Tenant.objects.get(slug="demo-fitness")
    with tenant_context(t):
        # Filters/tags have no plan-tier gate — seeded identically everywhere.
        assert FilterGroup.objects.count() >= 1
        assert Tag.objects.count() >= 1


@pytest.mark.django_db
def test_pro_tenant_has_enabled_assistant_with_knowledge_entries():
    call_command("seed_dev_tenants")
    from apps.tenant_config.models import AssistantConfig, AssistantKnowledgeEntry, AssistantLink

    t = Tenant.objects.get(slug="demo-yoga")
    with tenant_context(t):
        config = AssistantConfig.load()
        assert config.enabled is True
        assert AssistantKnowledgeEntry.objects.count() >= 2
        assert AssistantLink.objects.count() >= 1


@pytest.mark.django_db
def test_free_tenant_has_no_assistant():
    call_command("seed_dev_tenants")
    from apps.tenant_config.models import AssistantConfig, AssistantKnowledgeEntry, AssistantLink

    t = Tenant.objects.get(slug="demo-fitness")
    with tenant_context(t):
        # seed_assistant is never called for the free tier (assistant=0), so
        # AssistantConfig is left at its model default (enabled=False) — it
        # may not even exist yet (the app never lazily created it).
        config = AssistantConfig.objects.first()
        if config is not None:
            assert config.enabled is False
        assert AssistantKnowledgeEntry.objects.count() == 0
        assert AssistantLink.objects.count() == 0


@pytest.mark.django_db
def test_pro_tenant_has_blog_topic_queue_and_enabled_autopilot():
    call_command("seed_dev_tenants")
    from apps.blog.models import BlogAutopilot, BlogTopicIdea

    t = Tenant.objects.get(slug="demo-yoga")
    with tenant_context(t):
        assert BlogTopicIdea.objects.count() >= 3
        autopilot = BlogAutopilot.load()
        assert autopilot.is_enabled is True


@pytest.mark.django_db
def test_starter_tenant_has_no_blog_topic_queue_or_autopilot():
    call_command("seed_dev_tenants")
    from apps.blog.models import BlogAutopilot, BlogTopicIdea

    t = Tenant.objects.get(slug="demo-pilates")
    with tenant_context(t):
        # seed_blog_extras is pro-only (blog_extras=0 on starter too — a
        # stricter gate than assistant/mailbox/community's starter+pro
        # 2-way gate), so starter gets neither topic ideas nor an enabled
        # autopilot, even though it does get the base BlogPosts.
        assert BlogTopicIdea.objects.count() == 0
        autopilot = BlogAutopilot.objects.first()
        if autopilot is not None:
            assert autopilot.is_enabled is False


@pytest.mark.django_db
def test_pro_tenant_has_refunded_payment_and_non_active_subscription():
    call_command("seed_dev_tenants")
    from apps.billing.models import Payment, Subscription

    t = Tenant.objects.get(slug="demo-yoga")
    with tenant_context(t):
        # pro_edge_cases (D8) is pro-only — demo-yoga must show at least one
        # refunded Payment and one non-active (past_due) Subscription so the
        # billing UI's edge states have something real to render.
        assert Payment.objects.filter(status="refunded").exists()
        assert Subscription.objects.exclude(status="active").exists()


@pytest.mark.django_db
def test_starter_and_free_tenants_have_no_billing_edge_cases():
    call_command("seed_dev_tenants")
    from apps.billing.models import Payment, Subscription

    for slug in ("demo-fitness", "demo-pilates"):
        t = Tenant.objects.get(slug=slug)
        with tenant_context(t):
            # pro_edge_cases defaults to False for free/starter — no refunded
            # payments and no non-active subscriptions should appear.
            assert not Payment.objects.filter(status="refunded").exists()
            assert not Subscription.objects.exclude(status="active").exists()


@pytest.mark.django_db
def test_starter_and_pro_tenants_have_active_platform_subscription():
    """Regression guard for the has_paid_platform_plan gap.

    Tenant.has_paid_platform_plan does NOT read Tenant.plan directly — it
    checks for an actual PlatformSubscription row via is_subscription_active.
    Without one, every paid-tier feature gated on has_paid_platform_plan
    (site assistant, mailbox identity, logo studio, quotas, blog AI) silently
    reads as free/locked even though Tenant.plan says starter/pro.
    """
    call_command("seed_dev_tenants")

    for slug in ("demo-pilates", "demo-yoga"):
        t = Tenant.objects.get(slug=slug)
        assert t.has_paid_platform_plan is True
        assert t.platform_subscription.status == "active"
        assert t.platform_subscription.provider == "manual"
        assert t.platform_subscription.plan_id == t.plan_id


@pytest.mark.django_db
def test_free_tenant_has_no_platform_subscription_row():
    """Free tier must NOT get a PlatformSubscription — that's the deliberate,
    documented free-tier state (is_subscription_active's own docstring)."""
    call_command("seed_dev_tenants")
    from apps.core.models import PlatformSubscription

    t = Tenant.objects.get(slug="demo-fitness")
    assert t.has_paid_platform_plan is False
    assert not PlatformSubscription.objects.filter(tenant=t).exists()


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
