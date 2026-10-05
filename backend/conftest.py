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
from django.conf import settings
from django.core.management.color import no_style
from django.db import connection, connections
from django.test import TransactionTestCase
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
from apps.blog.models import BlogAutopilot, BlogPost, BlogTopicIdea
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
from apps.core.models import Domain, PlatformPlan, Tenant
from apps.courses.models import Course, Enrollment, Lesson, Module, Progress, Video
from apps.downloads.models import DownloadFile
from apps.email_campaigns.models import CampaignRecipient, EmailCampaign
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
from apps.tenant_config.models import AssistantConfig, AssistantKnowledgeEntry

SHARED_SCHEMA = "shared_test"
SHARED_DOMAIN = "shared-test.localhost"

# Tenants created by tests clone shared_test's structure without its rows (see
# TENANT_CREATION_FAKES_MIGRATIONS in settings/test.py): a mid-test copy of
# another test's data would be worse than an empty schema.
Tenant.clone_mode = "NODATA"

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


def _fast_fixture_teardown(self):
    """TransactionTestCase teardown without the post_migrate round trip.

    Django's flush truncates every table and then re-emits post_migrate to
    rebuild the content types and permissions it just wiped: ~200 queries and
    ~0.1s after each of the ~1000 transaction=True tests. Truncating everything
    *except* those migration-seeded tables leaves the same end state for free.
    No app here has its own post_migrate receiver.
    """
    for db_name in self._databases_names(include_mirrors=False):
        conn = connections[db_name]
        tables = [
            table
            for table in conn.introspection.django_table_names(only_existing=True, include_views=False)
            if table not in MIGRATION_SEEDED_TABLES
        ]
        conn.ops.execute_sql_flush(conn.ops.sql_flush(no_style(), tables, reset_sequences=False, allow_cascade=False))


TransactionTestCase._fixture_teardown = _fast_fixture_teardown


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
                "provisioning_status": "ready",
            },
        )
        # Reused rows from a prior --reuse-db session predate this field
        # being stamped, or were left "pending" — force it: this tenant's
        # schema is always fully migrated by the time tests run, and tasks
        # that fan out over tenants filter on provisioning_status="ready".
        if tenant.provisioning_status != "ready":
            tenant.provisioning_status = "ready"
            tenant.save(update_fields=["provisioning_status"])
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
                    "provisioning_status": "ready",
                },
            )
        finally:
            Tenant.auto_create_schema = original
        tenant = Tenant.objects.get(schema_name=SHARED_SCHEMA)
        if tenant.provisioning_status != "ready":
            tenant.provisioning_status = "ready"
            tenant.save(update_fields=["provisioning_status"])
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

    ``*ai-answer*``/``*ai-sess*`` are the same problem for the assistants'
    first-turn answer cache and per-session daily cap (apps.core.assistant):
    without purging, one test's cached/capped answer bleeds into another
    test (or, under pytest-xdist, another worker) that happens to ask the
    same first-turn question or reuses a session id.
    """
    try:
        redis = get_redis_connection("default")
        for pattern in ("ratelimit:*", "*throttle*", "*logo-ai*", "*ai-answer*", "*ai-sess*"):
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


@pytest.fixture(autouse=True)
def _no_real_provisioning(monkeypatch):
    """Signup verify enqueues provision_tenant on commit. Tests share the dev
    stack's Redis broker, so a real .delay() would make the dev Celery worker
    provision whatever DEV tenant shares the test tenant's id. Tests that care
    patch .delay themselves (mock.patch nests over this)."""
    from unittest import mock

    from apps.core import tasks

    monkeypatch.setattr(tasks.provision_tenant, "delay", mock.Mock(name="provision_tenant.delay"))


@pytest.fixture(autouse=True)
def _curated_mirror_off(settings):
    """The dev container exports CURATED_LOGO_SYNC_DIR (repo bind mount) — force
    the CuratedLogo mirror OFF for every test so suites never write into the
    repo or touch MinIO. Mirror tests re-enable it against tmp_path."""
    settings.CURATED_LOGO_SYNC_DIR = ""


@pytest.fixture(autouse=True)
def curated_image_uploads(settings, monkeypatch):
    """Keep the remote curated catalog offline for every test.

    Fake mode forces the committed fixture catalog, so no suite can reach the
    curated-image-api service even when the dev container exports a real URL and
    key. Copy-on-use still runs its full path — download, key derivation, Photo
    row — with only the S3 PUT captured here; yields {key: bytes} so a test can
    assert what would have been stored.
    """
    settings.CURATED_IMAGE_API_FAKE = True
    stored: dict[str, bytes] = {}

    def _capture(key, fileobj, content_type):
        stored[key] = fileobj.read()

    monkeypatch.setattr("apps.core.platform.uploads._store_object", _capture)
    return stored


_FREE_PLAN_DEFAULTS = {
    "price_monthly": 0,
    "transaction_fee_pct": 0,
    "max_students": 10,
    "max_storage_gb": 1,
    "max_streaming_hours": 2,
    "max_campaign_emails": 100,
    "stripe_price_id": "",
    "prices": {},
    "is_live_enabled": False,
}


@pytest.fixture(autouse=True)
def _ensure_free_plan(request, django_db_blocker):
    """Guarantee the canonical "Free" PlatformPlan row exists before every db test.

    `django_db(transaction=True)` tests run as a `TransactionTestCase`, whose
    teardown flushes the whole public schema — including rows seeded by data
    migrations, e.g. the "Free" PlatformPlan backfilled by
    `0005_backfill_free_plan.py`. Nothing recreates it afterward, and
    `--reuse-db` never reruns migrations on later invocations, so the first
    such test to run in a session permanently deletes it from that worker's
    reused test database — surfacing later as an unrelated
    `PlatformPlan.DoesNotExist` in whatever test happens to need it next (see
    `apps/core/tests/test_seed_dev_tenants.py`, which resolves it by name via
    `seed_dev_tenants._resolve_plan`). Re-`get_or_create`ing it before every
    db test, the same defensive pattern `restore_public` already uses for
    Tenant/Domain, sidesteps the underlying flush entirely rather than
    depending on Django's `serialized_rollback` (which collides with
    already-present ContentType rows on a fresh/reused db and is not safe to
    enable blindly — see git history on this fixture for the reverted attempt).
    """
    if request.node.get_closest_marker("django_db") is None:
        yield
        return
    with django_db_blocker.unblock():
        free_name = getattr(settings, "BILLING_FREE_PLAN_NAME", "Free")
        PlatformPlan.objects.get_or_create(name=free_name, defaults=_FREE_PLAN_DEFAULTS)
    yield


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
    CampaignRecipient,
    EmailCampaign,
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
    AssistantKnowledgeEntry,
    AssistantConfig,
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
        # A regular (non-transactional) test runs inside an atomic block that
        # is rolled back right after this, so deleting its rows here is pure
        # waste (~80ms of cascade queries per test). Only transaction=True
        # tests commit and need the explicit cleanup.
        if not connection.in_atomic_block:
            _clean_tenant_tables()
