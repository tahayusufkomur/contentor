"""
Shared pytest configuration for the Contentor backend test suite.

Provides a single session-scoped tenant so that each test module does NOT need
to create its own PostgreSQL schema + run migrations.  This cuts total test
runtime roughly in half because `create_schema(sync_schema=True)` is the most
expensive operation in the suite.

Individual test files should import the fixtures they need:
    - shared_tenant       (session) – the Tenant object
    - restore_public      (function) – re-inserts tenant/domain rows after flush
    - tenant_ctx          (function) – activates tenant context + cleans up data
"""

import pytest
from django.db import connection
from django_redis import get_redis_connection
from django_tenants.utils import tenant_context

from apps.accounts.models import User
from apps.billing.models import (
    Bundle,
    BundleItem,
    Payment,
    PaymentItem,
    Subscription,
    SubscriptionPlan,
    SubscriptionPlanAccess,
)
from apps.core.models import Domain, Tenant
from apps.courses.models import Course, Enrollment, Lesson, Module, Progress, Video
from apps.downloads.models import DownloadFile
from apps.live.models import LiveClass, LiveStream
from apps.mailbox.models import Conversation, Message
from apps.media.models import Photo
from apps.notifications.models import Announcement, AnnouncementRecipient, LiveReminderLog, PushSubscription

SHARED_SCHEMA = "shared_test"
SHARED_DOMAIN = "shared-test.localhost"


@pytest.fixture(scope="session")
def shared_tenant(django_db_setup, django_db_blocker):
    """Create a single tenant + domain once for the entire test session."""
    with django_db_blocker.unblock():
        tenant, _ = Tenant.objects.get_or_create(
            schema_name=SHARED_SCHEMA,
            defaults={
                "name": "Shared Test Tenant",
                "slug": "shared-test",
                "owner_email": "owner@sharedtest.com",
                "subdomain": "shared-test",
            },
        )
        tenant.create_schema(check_if_exists=True, sync_schema=True)
        Domain.objects.get_or_create(
            domain=SHARED_DOMAIN,
            defaults={"tenant": tenant, "is_primary": True},
        )
        yield tenant
        with django_db_blocker.unblock():
            tenant.delete(force_drop=True)


@pytest.fixture()
def restore_public(shared_tenant, django_db_blocker):
    """Re-insert shared tenant+domain into public schema after flush."""
    with django_db_blocker.unblock():
        connection.set_schema_to_public()
        original = Tenant.auto_create_schema
        Tenant.auto_create_schema = False
        try:
            Tenant.objects.get_or_create(
                schema_name=SHARED_SCHEMA,
                defaults={
                    "name": "Shared Test Tenant",
                    "slug": "shared-test",
                    "owner_email": "owner@sharedtest.com",
                    "subdomain": "shared-test",
                },
            )
        finally:
            Tenant.auto_create_schema = original
        tenant = Tenant.objects.get(schema_name=SHARED_SCHEMA)
        Domain.objects.get_or_create(
            domain=SHARED_DOMAIN,
            defaults={"tenant": tenant, "is_primary": True},
        )
    return tenant


@pytest.fixture(autouse=True)
def _clear_rate_limits():
    """Clear rate-limit keys between tests so shared tenant doesn't hit limits."""
    yield
    try:
        redis = get_redis_connection("default")
        for key in redis.keys("ratelimit:*"):
            redis.delete(key)
    except Exception:  # noqa: S110
        pass


@pytest.fixture()
def tenant_ctx(restore_public):
    """Activate tenant context and clean ALL tenant-scoped data after test."""
    tenant = restore_public
    with tenant_context(tenant):
        yield tenant
        # Clean up in dependency order
        Progress.objects.all().delete()
        Enrollment.objects.all().delete()
        Lesson.objects.all().delete()
        Module.objects.all().delete()
        Video.objects.all().delete()
        PaymentItem.objects.all().delete()
        Payment.objects.all().delete()
        SubscriptionPlanAccess.objects.all().delete()
        Subscription.objects.all().delete()
        SubscriptionPlan.objects.all().delete()
        BundleItem.objects.all().delete()
        Bundle.objects.all().delete()
        LiveStream.objects.all().delete()
        LiveClass.objects.all().delete()
        DownloadFile.objects.all().delete()
        Photo.objects.all().delete()
        Course.objects.all().delete()
        AnnouncementRecipient.objects.all().delete()
        Announcement.objects.all().delete()
        PushSubscription.objects.all().delete()
        LiveReminderLog.objects.all().delete()
        Message.objects.all().delete()
        Conversation.objects.all().delete()
        User.objects.all().delete()
