"""
Shared pytest configuration for the Contentor backend test suite.

Provides a single session-scoped tenant so that each test module does NOT need
to create its own PostgreSQL schema + run migrations.  This cuts total test
runtime roughly in half because `create_schema(sync_schema=True)` is the most
expensive operation in the suite.

The tenant schema is intentionally NOT dropped at session end: together with
`--reuse-db` (set in pyproject addopts) the next run finds both the test DB
and the shared_test schema already migrated and starts in a couple of seconds.
After adding new migrations, rebuild everything with `make test-fresh`
(`pytest --create-db`).

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
from apps.blog.models import BlogAutopilot, BlogPost, BlogTopicIdea
from apps.billing.models import (
    Bundle,
    BundleItem,
    Payment,
    PaymentItem,
    Subscription,
    SubscriptionPlan,
    SubscriptionPlanAccess,
)
from apps.community.models import (
    Comment as CommunityComment,
)
from apps.community.models import (
    CommunityMember,
    CommunitySettings,
)
from apps.community.models import (
    Post as CommunityPost,
)
from apps.community.models import (
    Reaction as CommunityReaction,
)
from apps.community.models import (
    Report as CommunityReport,
)
from apps.core.models import Domain, Tenant
from apps.courses.models import Course, Enrollment, Lesson, Module, Progress, Video
from apps.downloads.models import DownloadFile
from apps.live.models import LiveClass, LiveStream
from apps.mailbox.models import Conversation, Message
from apps.media.models import Photo
from apps.notifications.models import (
    Announcement,
    AnnouncementRecipient,
    EmailOptOut,
    LiveReminderLog,
    PushSubscription,
)

SHARED_SCHEMA = "shared_test"
SHARED_DOMAIN = "shared-test.localhost"

# Tables whose rows come from migrations, not tests — never truncate.
MIGRATION_SEEDED_TABLES = frozenset(
    {
        "django_migrations",
        "django_content_type",
        "auth_permission",
        "auth_group",
        "auth_group_permissions",
    }
)


def _truncate_stale_tenant_data():
    """Wipe rows a previous --reuse-db session left in the shared schema.

    transaction=True tests commit for real, and any model missing from the
    tenant_ctx cleanup list survives into the next session's reused DB. A
    one-shot TRUNCATE at session start is equivalent to the fresh schema a
    --create-db run would give (all RunPython migrations are backfills that
    are no-ops on empty tables) without paying for migrations.
    """
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT tablename FROM pg_tables WHERE schemaname = %s",
            [SHARED_SCHEMA],
        )
        tables = [row[0] for row in cursor.fetchall() if row[0] not in MIGRATION_SEEDED_TABLES]
        if tables:
            quoted = ", ".join(f'"{SHARED_SCHEMA}"."{table}"' for table in tables)
            cursor.execute(f"TRUNCATE {quoted} CASCADE")  # noqa: S608


@pytest.fixture(scope="session")
def shared_tenant(django_db_setup, django_db_blocker):
    """Create (or reuse) a single tenant + domain once for the entire session."""
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
        _truncate_stale_tenant_data()
        Domain.objects.get_or_create(
            domain=SHARED_DOMAIN,
            defaults={"tenant": tenant, "is_primary": True},
        )
    # No teardown: the schema is kept so --reuse-db skips migrations next run.
    yield tenant


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


def _purge_rate_limit_keys():
    """Delete middleware rate-limit, DRF throttle, and Logo Studio AI Brand
    Pack result-cache counters.

    DRF's AnonRateThrottle (e.g. the contact form's 5/min) keys on client IP,
    which is always 127.0.0.1 for APIClient — without purging, >5 requests
    within 60s across tests (or across back-to-back runs) return 429.

    ``*logo-ai*`` covers the Brand Pack 30-day result cache
    (``logo-ai:pack:*``) — without purging, a cache entry written by one
    test run persists in Redis and a later run with the same brief/theme
    inputs sees a stale "cache" hit instead of exercising the real AI path.
    Written via ``django.core.cache.cache`` (not a raw redis client like the
    rate limiter above), so Django's default key function wraps it in a
    ``:<version>:`` prefix — a leading wildcard is required, same as
    ``*throttle*``.
    """
    try:
        redis = get_redis_connection("default")
        for pattern in ("ratelimit:*", "*throttle*", "*logo-ai*"):
            for key in redis.keys(pattern):
                redis.delete(key)
    except Exception:  # noqa: S110
        pass


@pytest.fixture(autouse=True)
def _clear_rate_limits():
    """Clear rate-limit keys around each test so tests never hit limits."""
    _purge_rate_limit_keys()
    yield
    _purge_rate_limit_keys()


# Cleanup targets in dependency order (children before parents).
TENANT_CLEANUP_MODELS = [
    BlogTopicIdea,
    BlogAutopilot,
    BlogPost,
    CommunityReaction,
    CommunityReport,
    CommunityComment,
    CommunityPost,
    CommunityMember,
    CommunitySettings,
    Progress,
    Enrollment,
    Lesson,
    Module,
    Video,
    PaymentItem,
    Payment,
    SubscriptionPlanAccess,
    Subscription,
    SubscriptionPlan,
    BundleItem,
    Bundle,
    LiveStream,
    LiveClass,
    DownloadFile,
    Photo,
    Course,
    AnnouncementRecipient,
    Announcement,
    EmailOptOut,
    PushSubscription,
    LiveReminderLog,
    Message,
    Conversation,
    User,
]

# One round trip telling us which cleanup tables actually contain rows.
# Unqualified table names resolve through the tenant search_path, matching
# what the ORM deletes would target inside tenant_context.
_NONEMPTY_TABLES_SQL = " UNION ALL ".join(
    f'SELECT {i} WHERE EXISTS (SELECT 1 FROM "{model._meta.db_table}")'  # noqa: S608
    for i, model in enumerate(TENANT_CLEANUP_MODELS)
)


def _clean_tenant_tables():
    """Delete all rows from the cleanup tables (must run inside tenant_context).

    A typical test populates only a handful of the ~25 cleanup tables, so
    probe which ones have rows first and ORM-delete (with full cascade
    semantics) just those, instead of paying ~2 queries per model.
    """
    with connection.cursor() as cursor:
        cursor.execute(_NONEMPTY_TABLES_SQL)
        nonempty = {row[0] for row in cursor.fetchall()}
    for index, model in enumerate(TENANT_CLEANUP_MODELS):
        if index in nonempty:
            model.objects.all().delete()


@pytest.fixture()
def tenant_ctx(restore_public):
    """Activate tenant context with clean tenant tables; clean again after.

    Cleaning BEFORE the test matters under pytest-xdist: transaction=True
    tests commit for real, and load-balancing makes test order nondeterministic,
    so a test may follow one that left committed rows behind.
    """
    tenant = restore_public
    with tenant_context(tenant):
        _clean_tenant_tables()
        yield tenant
        _clean_tenant_tables()
