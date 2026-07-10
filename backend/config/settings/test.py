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

_worker = os.environ.get("PYTEST_XDIST_WORKER")  # e.g. "gw0"
if _worker:
    _redis_db = 2 + (int(_worker.removeprefix("gw")) % 14)
    _location = CACHES["default"]["LOCATION"]  # noqa: F405
    if re.search(r"/\d+$", _location):
        _location = re.sub(r"/\d+$", f"/{_redis_db}", _location)
    else:
        _location = f"{_location}/{_redis_db}"
    CACHES["default"]["LOCATION"] = _location  # noqa: F405
