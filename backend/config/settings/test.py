"""
Test settings — dev settings plus test-only speedups.

- MD5 password hashing: PBKDF2 costs ~90ms per hash and the suite creates
  users in almost every test's setup. MD5 is effectively free and still
  round-trips set_password/check_password.
- Per-xdist-worker Redis DB: parallel workers share one Redis, and the
  tenant rate limiter keys on schema_name — identical (shared_test) in
  every worker — so without isolation workers would trip each other's
  rate limits and cache keys. Workers map to Redis DBs 2-15 (0 = dev
  cache, 1 = celery broker).
- AI_PROVIDER pinned to "anthropic": tests must be hermetic regardless of
  the developer's local .env choice (dev commonly runs AI_PROVIDER=cli on
  the subscription). Without this, every AI test that doesn't explicitly
  override the setting would silently fire real `claude` CLI subprocesses.
  Tests that specifically exercise the cli path set settings.AI_PROVIDER
  themselves via the pytest-django `settings` fixture.
"""

import os
import re

from .dev import *  # noqa: F401, F403

# Drop the debug cursor wrapper (per-query logging). The only DEBUG-dependent
# test (test_issue_login_token) toggles DEBUG itself via the settings fixture.
DEBUG = False

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

AI_PROVIDER = "anthropic"

# Same reasoning: a dev .env pointing at a running LiveCraft must not make
# tests create real rooms. Tests of the HTTP client turn the fake off themselves.
LIVECRAFT_FAKE = True

# Undo dev's raised e2e ceiling: the middleware tests assert the prod
# thresholds (TenantRateLimitMiddleware.DEFAULT_RATE / UPLOAD_RATE).
TENANT_RATE_LIMIT_DEFAULT = 100
TENANT_RATE_LIMIT_UPLOAD = 10

# New tenant schemas are cloned (structure only) from the session's shared_test
# schema instead of replaying every tenant migration: ~70 tests provision a
# real tenant and paid 5-7s each for it. shared_test itself is still built by
# real migrations, so those stay covered; when it doesn't exist yet,
# django-tenants falls back to migrating. conftest sets Tenant.clone_mode.
TENANT_CREATION_FAKES_MIGRATIONS = True
TENANT_BASE_SCHEMA = "shared_test"

_worker = os.environ.get("PYTEST_XDIST_WORKER")  # e.g. "gw0"
if _worker:
    _redis_db = 2 + (int(_worker.removeprefix("gw")) % 14)
    _location = CACHES["default"]["LOCATION"]  # noqa: F405
    if re.search(r"/\d+$", _location):
        _location = re.sub(r"/\d+$", f"/{_redis_db}", _location)
    else:
        _location = f"{_location}/{_redis_db}"
    CACHES["default"]["LOCATION"] = _location  # noqa: F405

# Tests run the composer sequentially: worker threads can't see a test's transaction.
SITE_COMPOSE_CONCURRENCY = 1
