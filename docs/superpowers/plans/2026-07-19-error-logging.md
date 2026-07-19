# Error Logging, Log Viewer & Activity Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `apps.logbook` — a Vector→Django→Postgres log pipeline with a superadmin `/admin/logs` viewer (dynamic facets, search), per-user activity/pageview tracking, 14-day retention and daily S3 archives.

**Architecture:** All containers keep logging to stdout/json-file; a new Vector service streams them via the Docker socket to a token-authed ingest endpoint that parses lines into `LogEntry` (app/infra logs) and `RequestEvent` (API activity + page views, emitted as structured JSON log lines by a middleware and a beacon endpoint). Celery-beat archives full days to S3 and purges after 14 days. A custom superadmin page queries list+facets endpoints where every facet respects all *other* active filters.

**Tech Stack:** Django 5.1/DRF (function views + `IsSuperUser`), Postgres 17 (`pg_trgm`), Vector (timberio/vector), boto3 via `apps.core.storage.get_s3_client`, Next.js 14 App Router (frontend-main admin SPA), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-07-19-error-logging-design.md`

## Global Constraints

- The dev stack must be running for backend tests: `make dev` (all backend test commands execute inside the django container).
- Backend tests: `make test-app APP=logbook` or `docker compose exec -T django pytest apps/logbook/tests/... -v`. After adding the new app's migration, the FIRST test run needs `--create-db` (pyproject uses `--reuse-db`).
- Retention values (verbatim from spec): hot retention **14 days**, hard purge cap **21 days**, level floors **INFO+ for `django`/`celery-worker`/`celery-beat`, WARNING+ for everything else**.
- Public (unauthenticated) endpoints MUST set `@authentication_classes([])` (repo auth rule); the ingest endpoint uses this + constant-time `X-Logs-Token` check.
- `hashlib.md5(..., usedforsecurity=False)` everywhere (bandit gate in pre-commit; `make lint` must pass with zero warnings).
- Do NOT add `Meta.ordering` to any logbook model — it would leak into facet `GROUP BY`s. Order explicitly in queries.
- Never edit `.env` / `.env.prod` in git (gitignored); committed templates are `.env.example` / `.env.prod.example`.
- Frontend checks: `make typecheck` (both apps), `make test-frontend` (vitest, frontend-customer only — shared-package tests live there).
- Commit after every task (plan-approved exception to the no-commit default), message prefix `feat(logbook):` unless stated otherwise.

## File Map

**Create (backend):** `backend/apps/logbook/{__init__,apps,models,context,parsing,activity,archive,tasks}.py`, `backend/apps/logbook/views/{__init__,ingest,track,panel}.py`, `backend/apps/logbook/{urls_platform,urls_track}.py`, `backend/apps/logbook/migrations/{__init__,0001_initial}.py`, `backend/apps/logbook/tests/*`.
**Modify (backend):** `backend/config/settings/base.py` (SHARED_APPS, MIDDLEWARE, LOGGING, logbook settings, throttle rate), `backend/config/urls.py`, `backend/config/celery.py`, `backend/apps/accounts/authentication.py`, `backend/apps/core/middleware/demo_readonly.py`.
**Create (infra):** `monitoring/vector/vector.yaml`. **Modify:** `docker-compose.yml`, `docker-compose.prod.yml`, `.env.example`, `.env.prod.example`.
**Create (frontend):** `packages/shared/src/tracking/{session.ts,track-page-view.tsx}`, `frontend-main/src/lib/platform-logs-api.ts`, `frontend-main/src/app/admin/logs/{page.tsx,filters.tsx,logs-table.tsx,activity-table.tsx}`, `frontend-customer/src/lib/__tests__/tracking-session.test.ts`.
**Modify (frontend):** `frontend-main/src/app/layout.tsx`, `frontend-main/src/app/admin/admin-shell.tsx`, `frontend-customer/src/app/layout.tsx`, `frontend-customer/src/lib/api-client.ts`.
**Create (e2e):** `e2e/specs/24-admin-logs.spec.ts`. **Modify:** `e2e/impact-map.json`.

---

### Task 1: `apps.logbook` skeleton, models, migration

**Files:**
- Create: `backend/apps/logbook/__init__.py` (empty), `backend/apps/logbook/apps.py`, `backend/apps/logbook/models.py`, `backend/apps/logbook/migrations/__init__.py` (empty), `backend/apps/logbook/tests/__init__.py` (empty)
- Modify: `backend/config/settings/base.py` (SHARED_APPS, after `"apps.demo_seed",`)
- Test: `backend/apps/logbook/tests/test_models.py`

**Interfaces:**
- Produces: models `LogEntry(ts, container, stream, level, logger_name, tenant, user_label, message, line_hash)`, `RequestEvent(ts, kind, tenant, user_label, ip, session_id, method, path, status, duration_ms, referrer, user_agent, line_hash)`, `LogArchiveDay(date, kind, object_key, line_count, created_at)`; helper `line_digest(text: str) -> str` (32-char md5 hex). Field is `logger_name` (NOT `logger` — avoids shadowing stdlib naming conventions in queries); `LEVEL_CHOICES` values are `DEBUG/INFO/WARNING/ERROR/CRITICAL`; `RequestEvent.KIND_API = "api"`, `KIND_PAGEVIEW = "pageview"`.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/logbook/tests/test_models.py
"""Logbook models: dedupe constraints and the trigram search index."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from django.db import connection

from apps.logbook.models import LogArchiveDay, LogEntry, RequestEvent, line_digest

pytestmark = pytest.mark.django_db

TS = datetime(2026, 7, 19, 12, 0, 0, tzinfo=UTC)


def test_line_digest_is_stable_32_hex():
    d = line_digest("hello world")
    assert len(d) == 32
    assert d == line_digest("hello world")
    assert d != line_digest("hello worlds")


def test_logentry_dedupe_ignores_conflicts():
    row = {"ts": TS, "container": "django", "level": "ERROR", "message": "boom", "line_hash": line_digest("boom")}
    LogEntry.objects.create(**row)
    LogEntry.objects.bulk_create([LogEntry(**row)], ignore_conflicts=True)
    assert LogEntry.objects.count() == 1


def test_requestevent_dedupe_ignores_conflicts():
    row = {"ts": TS, "kind": RequestEvent.KIND_API, "path": "/api/v1/courses/", "line_hash": line_digest("x")}
    RequestEvent.objects.create(**row)
    RequestEvent.objects.bulk_create([RequestEvent(**row)], ignore_conflicts=True)
    assert RequestEvent.objects.count() == 1


def test_archive_day_unique_per_kind():
    LogArchiveDay.objects.create(date=TS.date(), kind="logs", object_key="logs/archive/2026/07/19.ndjson.gz")
    LogArchiveDay.objects.create(date=TS.date(), kind="activity", object_key="activity/archive/2026/07/19.ndjson.gz")
    assert LogArchiveDay.objects.count() == 2
    with pytest.raises(Exception):  # noqa: B017 — IntegrityError via constraint
        LogArchiveDay.objects.create(date=TS.date(), kind="logs", object_key="dup")


def test_trigram_index_exists():
    with connection.cursor() as cur:
        cur.execute("SELECT indexname FROM pg_indexes WHERE tablename = 'logbook_logentry'")
        names = {r[0] for r in cur.fetchall()}
    assert "logbook_msg_trgm" in names
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T django pytest apps/logbook/tests/test_models.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'apps.logbook'`

- [ ] **Step 3: Write the app + models**

```python
# backend/apps/logbook/apps.py
from django.apps import AppConfig


class LogbookConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.logbook"
```

```python
# backend/apps/logbook/models.py
"""Public-schema log store: raw container log lines (LogEntry), the per-request
activity/pageview trail (RequestEvent), and the S3 archive ledger
(LogArchiveDay). No Meta.ordering anywhere — it would pollute the facet
GROUP BYs; every query orders explicitly."""

from __future__ import annotations

import hashlib

from django.contrib.postgres.indexes import GinIndex
from django.db import models

LEVEL_CHOICES = [(x, x) for x in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")]


def line_digest(text: str) -> str:
    return hashlib.md5(text.encode("utf-8", "replace"), usedforsecurity=False).hexdigest()


class LogEntry(models.Model):
    ts = models.DateTimeField()
    container = models.CharField(max_length=64)
    stream = models.CharField(max_length=8, default="stdout")
    level = models.CharField(max_length=10, choices=LEVEL_CHOICES, default="INFO")
    logger_name = models.CharField(max_length=128, blank=True, default="")
    tenant = models.CharField(max_length=63, blank=True, default="")
    user_label = models.CharField(max_length=254, blank=True, default="")
    message = models.TextField()
    line_hash = models.CharField(max_length=32)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["container", "ts", "line_hash"], name="logbook_logentry_dedupe"),
        ]
        indexes = [
            models.Index(fields=["level", "ts"], name="logbook_le_level_ts"),
            models.Index(fields=["container", "ts"], name="logbook_le_container_ts"),
            models.Index(fields=["tenant", "ts"], name="logbook_le_tenant_ts"),
            models.Index(fields=["user_label", "ts"], name="logbook_le_user_ts"),
            models.Index(fields=["ts"], name="logbook_le_ts"),
            GinIndex(fields=["message"], name="logbook_msg_trgm", opclasses=["gin_trgm_ops"]),
        ]

    def __str__(self):
        return f"{self.ts:%Y-%m-%dT%H:%M:%S} {self.level} {self.container}"


class RequestEvent(models.Model):
    KIND_API = "api"
    KIND_PAGEVIEW = "pageview"
    KIND_CHOICES = [(KIND_API, KIND_API), (KIND_PAGEVIEW, KIND_PAGEVIEW)]

    ts = models.DateTimeField()
    kind = models.CharField(max_length=10, choices=KIND_CHOICES, default=KIND_API)
    tenant = models.CharField(max_length=63, blank=True, default="")
    user_label = models.CharField(max_length=254, blank=True, default="")
    ip = models.GenericIPAddressField(null=True, blank=True)
    session_id = models.CharField(max_length=36, blank=True, default="")
    method = models.CharField(max_length=8, blank=True, default="")
    path = models.CharField(max_length=512, blank=True, default="")
    status = models.PositiveSmallIntegerField(null=True, blank=True)
    duration_ms = models.PositiveIntegerField(null=True, blank=True)
    referrer = models.CharField(max_length=512, blank=True, default="")
    user_agent = models.CharField(max_length=256, blank=True, default="")
    line_hash = models.CharField(max_length=32)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["kind", "ts", "line_hash"], name="logbook_requestevent_dedupe"),
        ]
        indexes = [
            models.Index(fields=["kind", "ts"], name="logbook_re_kind_ts"),
            models.Index(fields=["tenant", "ts"], name="logbook_re_tenant_ts"),
            models.Index(fields=["user_label", "ts"], name="logbook_re_user_ts"),
            models.Index(fields=["session_id", "ts"], name="logbook_re_session_ts"),
            models.Index(fields=["ip", "ts"], name="logbook_re_ip_ts"),
            models.Index(fields=["ts"], name="logbook_re_ts"),
        ]

    def __str__(self):
        return f"{self.ts:%Y-%m-%dT%H:%M:%S} {self.kind} {self.path}"


class LogArchiveDay(models.Model):
    KIND_CHOICES = [("logs", "logs"), ("activity", "activity")]

    date = models.DateField()
    kind = models.CharField(max_length=10, choices=KIND_CHOICES)
    object_key = models.CharField(max_length=256, blank=True, default="")
    line_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["date", "kind"], name="logbook_archiveday_unique")]

    def __str__(self):
        return f"{self.date} {self.kind} ({self.line_count})"
```

- [ ] **Step 4: Register the app**

In `backend/config/settings/base.py`, SHARED_APPS list, after `"apps.demo_seed",` add:

```python
    # Platform log store + activity trail (superadmin log viewer).
    "apps.logbook",
```

- [ ] **Step 5: Generate the migration, then add the trigram extension**

Run: `docker compose exec -T django python manage.py makemigrations logbook`
Expected: `0001_initial.py` created with the three models + indexes.

Edit `backend/apps/logbook/migrations/0001_initial.py`: add the import and make `TrigramExtension()` the FIRST operation (the GIN index needs `gin_trgm_ops`):

```python
from django.contrib.postgres.operations import TrigramExtension

class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        TrigramExtension(),
        # ... generated CreateModel/AddIndex/AddConstraint operations stay below ...
    ]
```

- [ ] **Step 6: Migrate dev DB and run tests**

Run: `make migrate-shared`
Expected: `Applying logbook.0001_initial... OK` (public schema).

Run: `docker compose exec -T django pytest apps/logbook/tests/test_models.py -v --create-db`
Expected: 5 PASS. (`--create-db` once; later runs use the cached reuse-db.)

- [ ] **Step 7: Commit**

```bash
git add backend/apps/logbook backend/config/settings/base.py
git commit -m "feat(logbook): LogEntry/RequestEvent/LogArchiveDay models with trigram index"
```

---

### Task 2: user contextvar — stamp `[user=…]` on every log line

**Files:**
- Create: `backend/apps/logbook/context.py`
- Modify: `backend/apps/accounts/authentication.py` (inside `authenticate()`), `backend/config/settings/base.py` (LOGGING + MIDDLEWARE)
- Test: `backend/apps/logbook/tests/test_context.py`

**Interfaces:**
- Produces: `set_current_user(label: str)`, `get_current_user() -> str` (returns `"-"` when unset), `reset_current_user()`, `UserContextFilter` (sets `record.user`), `UserContextMiddleware` (resets the var after every request). Console log format becomes `... [tenant=%(tenant)s] [user=%(user)s] %(message)s`.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/logbook/tests/test_context.py
"""User contextvar: stamped by TenantJWTAuthentication, read by the log
filter, cleared by the middleware."""

from __future__ import annotations

import logging

import jwt as pyjwt
import pytest
from django.conf import settings
from django.test import RequestFactory

from apps.logbook.context import (
    UserContextFilter,
    UserContextMiddleware,
    get_current_user,
    reset_current_user,
    set_current_user,
)

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _clean_context():
    reset_current_user()
    yield
    reset_current_user()


def test_default_is_dash():
    assert get_current_user() == "-"


def test_filter_stamps_record():
    set_current_user("a@b.co")
    record = logging.LogRecord("apps.x", logging.INFO, __file__, 1, "hi", (), None)
    assert UserContextFilter().filter(record) is True
    assert record.user == "a@b.co"


def test_middleware_resets_after_response():
    def view(request):
        set_current_user("leak@example.com")
        return "ok"

    mw = UserContextMiddleware(view)
    assert mw(RequestFactory().get("/")) == "ok"
    assert get_current_user() == "-"


def test_jwt_auth_sets_context(restore_public):
    from apps.accounts.models import User
    from apps.accounts.authentication import TenantJWTAuthentication

    user = User.objects.create(email="ctx@test.io", region="global", role="owner")
    token = pyjwt.encode(
        {"user_id": user.id, "tenant_id": "public", "role": "owner"},
        settings.SECRET_KEY,
        algorithm="HS256",
    )
    request = RequestFactory().get("/")
    request.COOKIES["contentor_access_token"] = token
    result = TenantJWTAuthentication().authenticate(request)
    assert result is not None and result[0] == user
    assert get_current_user() == "ctx@test.io"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T django pytest apps/logbook/tests/test_context.py -v`
Expected: FAIL — `No module named 'apps.logbook.context'`

- [ ] **Step 3: Implement `context.py`**

```python
# backend/apps/logbook/context.py
"""Who caused this log line?

`TenantJWTAuthentication` calls `set_current_user()` on success (DRF resolves
the JWT at view level, so middleware alone can never see it), the logging
filter stamps every record, and `UserContextMiddleware` resets the var when
the request ends — gthread workers reuse threads, so without the reset a
line logged between requests would carry the previous user."""

from __future__ import annotations

import logging
from contextvars import ContextVar

_current_user: ContextVar[str] = ContextVar("logbook_user", default="-")


def set_current_user(label: str) -> None:
    _current_user.set(label or "-")


def get_current_user() -> str:
    return _current_user.get()


def reset_current_user() -> None:
    _current_user.set("-")


class UserContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            record.user = get_current_user()
        except Exception:  # noqa: BLE001 — never let logging raise
            record.user = "-"
        return True


class UserContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            return self.get_response(request)
        finally:
            reset_current_user()
```

- [ ] **Step 4: Hook into `TenantJWTAuthentication`**

In `backend/apps/accounts/authentication.py`, in `authenticate()`, replace the final `return (user, payload)` with:

```python
        from apps.logbook.context import set_current_user

        set_current_user(user.email)
        return (user, payload)
```

- [ ] **Step 5: Wire filter + middleware + format into settings**

In `backend/config/settings/base.py`:

1. MIDDLEWARE — insert directly after `"apps.core.middleware.demo_readonly.DemoReadOnlyMiddleware",`:

```python
    "apps.logbook.context.UserContextMiddleware",
```

2. LOGGING `filters` dict — add:

```python
        "user_context": {"()": "apps.logbook.context.UserContextFilter"},
```

3. LOGGING console formatter `format` — replace with:

```python
            "format": "%(asctime)s %(levelname)-7s %(name)s [tenant=%(tenant)s] [user=%(user)s] %(message)s",
```

4. LOGGING console handler `filters` — replace with:

```python
            "filters": ["tenant_context", "user_context"],
```

- [ ] **Step 6: Run tests**

Run: `docker compose exec -T django pytest apps/logbook/tests/test_context.py -v`
Expected: 4 PASS.

Run: `make test-app APP=accounts`
Expected: PASS (auth behavior unchanged for existing tests).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/logbook/context.py backend/apps/logbook/tests/test_context.py backend/apps/accounts/authentication.py backend/config/settings/base.py
git commit -m "feat(logbook): stamp [user=email] on every log line via auth contextvar"
```

---

### Task 3: parsers — container families → ParsedEvent

**Files:**
- Create: `backend/apps/logbook/parsing.py`
- Modify: `backend/config/settings/base.py` (logbook settings block)
- Test: `backend/apps/logbook/tests/test_parsing.py`

**Interfaces:**
- Consumes: nothing new (pure functions + settings).
- Produces: `ACTIVITY_LOGGER = "apps.logbook.activity"`; `@dataclass ParsedEvent(ts, container, stream, level, logger_name, tenant, user_label, message, activity: dict | None)`; `service_from_container(name: str) -> str`; `parse_event(raw: dict) -> ParsedEvent | None` (raw = Vector event with keys `timestamp`, `container_name`, `stream`, `message`); `passes_floor(container: str, level: str) -> bool`; `parse_ts(value: str | None) -> datetime`. `MESSAGE_MAX = 16384`.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/logbook/tests/test_parsing.py
"""Per-container-family parsing: level/logger/tenant/user extraction, service
name normalization, floors, activity JSON routing, nanosecond timestamps."""

from __future__ import annotations

import json

from django.test import override_settings

from apps.logbook.parsing import (
    ACTIVITY_LOGGER,
    MESSAGE_MAX,
    parse_event,
    parse_ts,
    passes_floor,
    service_from_container,
)


def _raw(container, message, ts="2026-07-19T12:00:00.123456789Z", stream="stdout"):
    return {"timestamp": ts, "container_name": container, "stream": stream, "message": message}


# --- service names -----------------------------------------------------------

def test_service_from_container_variants():
    assert service_from_container("contentor-django") == "django"           # prod
    assert service_from_container("contentor-django-1") == "django"         # dev
    assert service_from_container("contentor-celery-worker-1") == "celery-worker"
    assert service_from_container("contentor-caddy-dev") == "caddy"
    assert service_from_container("/contentor-redis-1") == "redis"
    assert service_from_container("unrelated") == "unrelated"


# --- timestamps ---------------------------------------------------------------

def test_parse_ts_truncates_nanoseconds():
    ts = parse_ts("2026-07-19T12:00:00.123456789Z")
    assert ts.microsecond == 123456
    assert ts.tzinfo is not None


# --- django/celery family -----------------------------------------------------

DJANGO_LINE = "2026-07-19T12:00:01+0000 ERROR   apps.blog.tasks [tenant=yoga] [user=a@b.co] generation failed"
DJANGO_LINE_NO_USER = "2026-07-19T12:00:01+0000 INFO    apps.core.tasks [tenant=-] Tenant x provisioned successfully"


def test_django_line_parses_fields():
    ev = parse_event(_raw("contentor-django-1", DJANGO_LINE))
    assert ev.level == "ERROR"
    assert ev.logger_name == "apps.blog.tasks"
    assert ev.tenant == "yoga"
    assert ev.user_label == "a@b.co"
    assert ev.message == "generation failed"
    assert ev.container == "django"
    assert ev.activity is None


def test_django_line_without_user_bracket_still_parses():
    ev = parse_event(_raw("contentor-celery-worker-1", DJANGO_LINE_NO_USER))
    assert ev.level == "INFO"
    assert ev.tenant == ""          # "-" normalizes to empty
    assert ev.user_label == ""


def test_multiline_traceback_stays_one_event():
    line = DJANGO_LINE + "\nTraceback (most recent call last):\n  File x\nValueError: boom"
    ev = parse_event(_raw("contentor-django-1", line))
    assert ev.level == "ERROR"
    assert "ValueError: boom" in ev.message


def test_activity_json_line_routes_to_activity():
    payload = {"kind": "api", "path": "/api/v1/courses/", "status": 200}
    line = f"2026-07-19T12:00:01+0000 INFO    {ACTIVITY_LOGGER} [tenant=yoga] [user=a@b.co] " + json.dumps(payload)
    ev = parse_event(_raw("contentor-django-1", line))
    assert ev.activity == payload


def test_gunicorn_line():
    ev = parse_event(_raw("contentor-django-1", "[2026-07-19 10:00:00 +0000] [7] [CRITICAL] WORKER TIMEOUT (pid:12)"))
    assert ev.level == "CRITICAL"
    assert "WORKER TIMEOUT" in ev.message


# --- infra families -----------------------------------------------------------

def test_caddy_json_line():
    line = json.dumps({"level": "error", "msg": "dial tcp: connection refused", "logger": "http.log"})
    ev = parse_event(_raw("contentor-caddy", line))
    assert ev.level == "ERROR"
    assert "connection refused" in ev.message


def test_postgres_levels():
    assert parse_event(_raw("contentor-postgres-1", "2026-07-19 12:00:00.000 UTC [56] WARNING:  terminating connection")).level == "WARNING"
    assert parse_event(_raw("contentor-postgres-1", "2026-07-19 12:00:00.000 UTC [1] LOG:  checkpoint starting")).level == "INFO"
    assert parse_event(_raw("contentor-postgres-1", "2026-07-19 12:00:00.000 UTC [9] FATAL:  out of memory")).level == "CRITICAL"


def test_redis_levels():
    assert parse_event(_raw("contentor-redis-1", "1:M 19 Jul 2026 12:00:00.000 # Warning: overcommit disabled")).level == "WARNING"
    assert parse_event(_raw("contentor-redis-1", "1:M 19 Jul 2026 12:00:00.000 * Ready to accept connections")).level == "INFO"


def test_nextjs_heuristic_and_fallback():
    assert parse_event(_raw("contentor-nextjs-main-1", " ⨯ Error: boom at page.tsx")).level == "ERROR"
    assert parse_event(_raw("contentor-nextjs-customer-1", "compiled client successfully")).level == "INFO"
    ev = parse_event(_raw("contentor-minio-1", "some unparseable noise"))
    assert ev.level == "INFO"       # unparseable lines are kept, never dropped


def test_empty_message_returns_none():
    assert parse_event(_raw("contentor-django-1", "   ")) is None


def test_message_truncated_at_cap():
    ev = parse_event(_raw("contentor-django-1", "x" * (MESSAGE_MAX + 500)))
    assert len(ev.message) == MESSAGE_MAX


# --- floors --------------------------------------------------------------------

def test_floors_default():
    assert passes_floor("django", "INFO") is True
    assert passes_floor("celery-worker", "INFO") is True
    assert passes_floor("caddy", "INFO") is False
    assert passes_floor("caddy", "WARNING") is True
    assert passes_floor("postgres", "ERROR") is True


@override_settings(LOGBOOK_LEVEL_FLOORS={"*": "ERROR"})
def test_floors_overridable():
    assert passes_floor("django", "WARNING") is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T django pytest apps/logbook/tests/test_parsing.py -v`
Expected: FAIL — `No module named 'apps.logbook.parsing'`

- [ ] **Step 3: Add the logbook settings block**

In `backend/config/settings/base.py`, directly after the `CELERY_WORKER_HIJACK_ROOT_LOGGER = False` line:

```python
# --- Logbook: log pipeline + activity trail (apps.logbook) --------------------
# Vector ships container stdout to /api/v1/platform/logs/ingest/ guarded by
# this shared secret; empty token = ingest disabled (503).
LOGS_INGEST_TOKEN = os.environ.get("LOGS_INGEST_TOKEN", "")
LOGBOOK_RETENTION_DAYS = 14
LOGBOOK_HARD_CAP_DAYS = 21  # purge even unarchived rows past this; logs ERROR
# Minimum stored level per compose service; "*" is the fallback for the rest.
LOGBOOK_LEVEL_FLOORS = {
    "django": "INFO",
    "celery-worker": "INFO",
    "celery-beat": "INFO",
    "*": "WARNING",
}
# Requests that must not generate RequestEvents (health probes flood, the
# panel/track/ingest endpoints would self-amplify, dev sink is noise).
LOGBOOK_ACTIVITY_EXCLUDE_PREFIXES = (
    "/api/health/",
    "/static/",
    "/api/v1/platform/logs/",
    "/api/v1/platform/activity/",
    "/api/v1/track/",
    "/api/v1/dev/",
)
# Query params whose values are replaced with "redacted" before storage
# (magic-link tokens and friends must never sit in a 14-day table or S3).
LOGBOOK_REDACT_PARAMS = ("token", "key", "code", "signature", "session", "password")
LOGBOOK_ARCHIVE_PREFIXES = {"logs": "logs/archive/", "activity": "activity/archive/"}
```

- [ ] **Step 4: Implement `parsing.py`**

```python
# backend/apps/logbook/parsing.py
"""Turn raw Vector events into typed ParsedEvents.

All knowledge about each container family's line format lives here (Vector is
a dumb transport). Unparseable lines are kept as INFO with the raw line as the
message — a parser bug must never silently drop logs."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime

from django.conf import settings
from django.utils import timezone

ACTIVITY_LOGGER = "apps.logbook.activity"
MESSAGE_MAX = 16384

LEVEL_ORDER = {"DEBUG": 10, "INFO": 20, "WARNING": 30, "ERROR": 40, "CRITICAL": 50}
_LEVEL_ALIASES = {
    "WARN": "WARNING", "FATAL": "CRITICAL", "PANIC": "CRITICAL",
    "LOG": "INFO", "NOTICE": "INFO", "TRACE": "DEBUG", "DBG": "DEBUG",
}

_CONTAINER_RE = re.compile(r"^/?(?:contentor[-_])?(?P<svc>.+?)(?:[-_]dev)?(?:[-_]\d+)?$")
_DJANGO_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4}\s+"
    r"(?P<level>[A-Z]+)\s+(?P<logger>\S+)\s+\[tenant=(?P<tenant>[^\]]*)\]\s+"
    r"(?:\[user=(?P<user>[^\]]*)\]\s+)?(?P<message>.*)$",
    re.DOTALL,
)
_GUNICORN_RE = re.compile(r"^\[\d{4}-\d{2}-\d{2} [^\]]+\] \[\d+\] \[(?P<level>[A-Z]+)\] (?P<message>.*)$", re.DOTALL)
_POSTGRES_RE = re.compile(
    r"^(?:\d{4}-\d{2}-\d{2} [\d:.]+ \S+ \[\d+\] )?(?P<level>LOG|WARNING|ERROR|FATAL|PANIC|STATEMENT|DETAIL|HINT):\s+(?P<message>.*)$",
    re.DOTALL,
)
_REDIS_RE = re.compile(r"^\d+:[A-Z] \d{1,2} \w{3} \d{4} [\d:.]+ (?P<mark>[.\-*#]) (?P<message>.*)$", re.DOTALL)
_TS_NANO_RE = re.compile(r"^(.*\.\d{6})\d*([+-]\d{2}:\d{2})$")

_APP_SERVICES = ("django", "celery-worker", "celery-beat")


@dataclass
class ParsedEvent:
    ts: datetime
    container: str
    stream: str
    level: str
    logger_name: str
    tenant: str
    user_label: str
    message: str
    activity: dict | None = None


def service_from_container(name: str) -> str:
    m = _CONTAINER_RE.match((name or "").strip())
    return (m.group("svc") if m else name or "unknown")[:64]


def parse_ts(value: str | None) -> datetime:
    if not value:
        return timezone.now()
    v = value.strip().replace("Z", "+00:00")
    m = _TS_NANO_RE.match(v)
    if m:
        v = m.group(1) + m.group(2)
    try:
        return datetime.fromisoformat(v)
    except ValueError:
        return timezone.now()


def _norm_level(raw: str) -> str:
    level = (raw or "").upper()
    level = _LEVEL_ALIASES.get(level, level)
    return level if level in LEVEL_ORDER else "INFO"


def passes_floor(container: str, level: str) -> bool:
    floors = settings.LOGBOOK_LEVEL_FLOORS
    floor = floors.get(container) or floors.get("*", "WARNING")
    return LEVEL_ORDER.get(level, 20) >= LEVEL_ORDER.get(floor, 30)


def _heuristic_level(line: str) -> str:
    lowered = line.lower()
    if "⨯" in line or re.search(r"\berror\b", lowered):
        return "ERROR"
    if re.search(r"\bwarn(ing)?\b", lowered):
        return "WARNING"
    return "INFO"


def _parse_app_line(message: str) -> tuple[str, str, str, str, str, dict | None]:
    """Returns (level, logger_name, tenant, user, message, activity)."""
    m = _DJANGO_RE.match(message)
    if m:
        tenant = m.group("tenant")
        user = m.group("user") or "-"
        body = m.group("message")
        logger_name = m.group("logger")
        activity = None
        if logger_name == ACTIVITY_LOGGER:
            try:
                activity = json.loads(body)
            except ValueError:
                activity = None
        return (
            _norm_level(m.group("level")),
            logger_name,
            "" if tenant == "-" else tenant,
            "" if user == "-" else user,
            body,
            activity if isinstance(activity, dict) else None,
        )
    g = _GUNICORN_RE.match(message)
    if g:
        return _norm_level(g.group("level")), "gunicorn", "", "", g.group("message"), None
    return _heuristic_level(message), "", "", "", message, None


def parse_event(raw: dict) -> ParsedEvent | None:
    message = (raw.get("message") or "").rstrip()
    if not message.strip():
        return None
    container = service_from_container(raw.get("container_name") or "")
    ev = ParsedEvent(
        ts=parse_ts(raw.get("timestamp")),
        container=container,
        stream=(raw.get("stream") or "stdout")[:8],
        level="INFO",
        logger_name="",
        tenant="",
        user_label="",
        message=message[:MESSAGE_MAX],
    )
    if container in _APP_SERVICES:
        level, logger_name, tenant, user, body, activity = _parse_app_line(ev.message)
        ev.level, ev.logger_name, ev.tenant, ev.user_label = level, logger_name[:128], tenant[:63], user[:254]
        ev.message, ev.activity = body[:MESSAGE_MAX], activity
    elif container == "caddy" and message.startswith("{"):
        try:
            data = json.loads(message)
            ev.level = _norm_level(str(data.get("level", "info")))
        except ValueError:
            ev.level = _heuristic_level(message)
    elif container == "postgres":
        m = _POSTGRES_RE.match(message)
        ev.level = _norm_level(m.group("level")) if m else "INFO"
    elif container == "redis":
        m = _REDIS_RE.match(message)
        ev.level = "WARNING" if (m and m.group("mark") == "#") else "INFO"
    else:
        ev.level = _heuristic_level(message)
    return ev
```

- [ ] **Step 5: Run tests**

Run: `docker compose exec -T django pytest apps/logbook/tests/test_parsing.py -v`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/logbook/parsing.py backend/apps/logbook/tests/test_parsing.py backend/config/settings/base.py
git commit -m "feat(logbook): per-container-family log parsers with floors and activity routing"
```

---

### Task 4: ingest endpoint

**Files:**
- Create: `backend/apps/logbook/views/__init__.py` (empty), `backend/apps/logbook/views/ingest.py`, `backend/apps/logbook/urls_platform.py`
- Modify: `backend/config/urls.py`
- Test: `backend/apps/logbook/tests/test_ingest.py`

**Interfaces:**
- Consumes: `parse_event`, `passes_floor`, `line_digest`, models (Tasks 1+3).
- Produces: `POST /api/v1/platform/logs/ingest/` accepting a JSON array of Vector events, header `X-Logs-Token`; responds `{"accepted": N, "logs": N, "activity": N}`. RequestEvent rows built from `ParsedEvent.activity` dict keys: `kind, tenant, user, ip, session_id, method, path, status, duration_ms, referrer, user_agent` (missing keys default to blank/None).

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/logbook/tests/test_ingest.py
"""Ingest endpoint: token auth, floors, dedupe, LogEntry vs RequestEvent routing."""

from __future__ import annotations

import json

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.logbook.models import LogEntry, RequestEvent
from apps.logbook.parsing import ACTIVITY_LOGGER

pytestmark = pytest.mark.django_db

URL = "/api/v1/platform/logs/ingest/"
TOKEN = "test-logs-token"  # noqa: S105 — test fixture value


def _event(message, container="contentor-django-1", ts="2026-07-19T12:00:00.000000001Z"):
    return {"timestamp": ts, "container_name": container, "stream": "stdout", "message": message}


def _post(events, token=TOKEN):
    client = APIClient(HTTP_HOST="shared-test.localhost")
    headers = {"HTTP_X_LOGS_TOKEN": token} if token is not None else {}
    return client.post(URL, data=json.dumps(events), content_type="application/json", **headers)


@override_settings(LOGS_INGEST_TOKEN="")
def test_unconfigured_token_gives_503():
    assert _post([]).status_code == 503


@override_settings(LOGS_INGEST_TOKEN=TOKEN)
def test_wrong_token_403():
    assert _post([], token="nope").status_code == 403
    assert _post([], token=None).status_code == 403


@override_settings(LOGS_INGEST_TOKEN=TOKEN)
def test_ingest_stores_and_floors():
    events = [
        _event("2026-07-19T12:00:01+0000 ERROR   apps.blog [tenant=yoga] [user=a@b.co] boom"),
        _event("2026-07-19T12:00:02+0000 INFO    apps.blog [tenant=yoga] [user=-] fine"),
        _event('{"level":"info","msg":"routine"}', container="contentor-caddy"),   # floored out (WARN+ infra)
        _event('{"level":"error","msg":"upstream dead"}', container="contentor-caddy"),
    ]
    resp = _post(events)
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"accepted": 4, "logs": 3, "activity": 0}
    assert LogEntry.objects.filter(container="caddy").count() == 1
    row = LogEntry.objects.get(level="ERROR", container="django")
    assert row.tenant == "yoga" and row.user_label == "a@b.co" and row.message == "boom"


@override_settings(LOGS_INGEST_TOKEN=TOKEN)
def test_ingest_is_idempotent_on_retry():
    events = [_event("2026-07-19T12:00:01+0000 ERROR   apps.blog [tenant=-] dup")]
    assert _post(events).status_code == 200
    assert _post(events).status_code == 200          # Vector retry of same batch
    assert LogEntry.objects.filter(message="dup").count() == 1


@override_settings(LOGS_INGEST_TOKEN=TOKEN)
def test_activity_lines_become_request_events():
    payload = {
        "kind": "api", "tenant": "yoga", "user": "s@t.io", "ip": "203.0.113.9",
        "session_id": "11111111-1111-1111-1111-111111111111", "method": "GET",
        "path": "/api/v1/courses/", "status": 200, "duration_ms": 45,
        "user_agent": "Mozilla/5.0",
    }
    line = f"2026-07-19T12:00:03+0000 INFO    {ACTIVITY_LOGGER} [tenant=yoga] [user=s@t.io] " + json.dumps(payload)
    resp = _post([_event(line)])
    assert resp.json() == {"accepted": 1, "logs": 0, "activity": 1}
    ev = RequestEvent.objects.get()
    assert ev.kind == "api" and ev.path == "/api/v1/courses/" and ev.status == 200
    assert ev.user_label == "s@t.io" and ev.ip == "203.0.113.9" and ev.duration_ms == 45


@override_settings(LOGS_INGEST_TOKEN=TOKEN)
def test_oversized_batch_rejected():
    events = [_event(f"line {i}") for i in range(501)]
    assert _post(events).status_code == 413
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T django pytest apps/logbook/tests/test_ingest.py -v`
Expected: FAIL — 404s (route not mounted).

- [ ] **Step 3: Implement the view + urls**

```python
# backend/apps/logbook/views/ingest.py
"""Vector → Postgres. Public URL, guarded by a shared-secret header; Vector
reaches Django on the compose-internal network but the token guards the
endpoint regardless of exposure."""

from __future__ import annotations

import hmac

from django.conf import settings
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from ..models import LogEntry, RequestEvent, line_digest
from ..parsing import parse_event, passes_floor

MAX_BATCH = 500


def _request_event(parsed):
    a = parsed.activity
    status = a.get("status")
    duration = a.get("duration_ms")
    return RequestEvent(
        ts=parsed.ts,
        kind=a.get("kind") or RequestEvent.KIND_API,
        tenant=str(a.get("tenant") or "")[:63],
        user_label=str(a.get("user") or "")[:254],
        ip=a.get("ip") or None,
        session_id=str(a.get("session_id") or "")[:36],
        method=str(a.get("method") or "")[:8],
        path=str(a.get("path") or "")[:512],
        status=int(status) if isinstance(status, int) else None,
        duration_ms=int(duration) if isinstance(duration, int) else None,
        referrer=str(a.get("referrer") or "")[:512],
        user_agent=str(a.get("user_agent") or "")[:256],
        line_hash=line_digest(parsed.message),
    )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def logs_ingest(request):
    token = settings.LOGS_INGEST_TOKEN
    if not token:
        return Response({"detail": "ingest disabled"}, status=503)
    provided = request.headers.get("X-Logs-Token", "")
    if not hmac.compare_digest(provided.encode(), token.encode()):
        return Response(status=403)
    events = request.data if isinstance(request.data, list) else []
    if len(events) > MAX_BATCH:
        return Response({"detail": f"batch exceeds {MAX_BATCH} events"}, status=413)

    log_rows, activity_rows = [], []
    for raw in events:
        if not isinstance(raw, dict):
            continue
        parsed = parse_event(raw)
        if parsed is None:
            continue
        if parsed.activity is not None:
            activity_rows.append(_request_event(parsed))
        elif passes_floor(parsed.container, parsed.level):
            log_rows.append(
                LogEntry(
                    ts=parsed.ts,
                    container=parsed.container,
                    stream=parsed.stream,
                    level=parsed.level,
                    logger_name=parsed.logger_name,
                    tenant=parsed.tenant,
                    user_label=parsed.user_label,
                    message=parsed.message,
                    line_hash=line_digest(parsed.message),
                )
            )
    LogEntry.objects.bulk_create(log_rows, ignore_conflicts=True, batch_size=500)
    RequestEvent.objects.bulk_create(activity_rows, ignore_conflicts=True, batch_size=500)
    return Response({"accepted": len(events), "logs": len(log_rows), "activity": len(activity_rows)})
```

```python
# backend/apps/logbook/urls_platform.py
from django.urls import path

from .views import ingest

urlpatterns = [
    path("logs/ingest/", ingest.logs_ingest, name="logbook-ingest"),
]
```

In `backend/config/urls.py`, directly BEFORE the line `path("api/v1/platform/", include("apps.core.platform.urls")),` add:

```python
    # Log pipeline + viewer endpoints — declared before the broader
    # /platform/ include so logs/activity resolve here.
    path("api/v1/platform/", include("apps.logbook.urls_platform")),
```

- [ ] **Step 4: Run tests**

Run: `docker compose exec -T django pytest apps/logbook/tests/test_ingest.py -v`
Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/logbook/views backend/apps/logbook/urls_platform.py backend/apps/logbook/tests/test_ingest.py backend/config/urls.py
git commit -m "feat(logbook): token-authed Vector ingest endpoint routing logs vs activity"
```

---

### Task 5: Vector collector in the dev stack

**Files:**
- Create: `monitoring/vector/vector.yaml`
- Modify: `docker-compose.yml` (new `vector` service after `celery-beat`), `.env.example`

**Interfaces:**
- Consumes: ingest endpoint (Task 4).
- Produces: running `vector` service shipping every compose container's stdout to ingest. Dev default token `dev-logs-token` (compose-level fallback on BOTH the vector and django services, so a stale `.env` without the key still works out of the box).

- [ ] **Step 1: Write the Vector config**

```yaml
# monitoring/vector/vector.yaml
# Ships every compose container's stdout/stderr to Django's logbook ingest.
# Socket-based (docker_logs) so the same config works on Docker Desktop (dev)
# and Linux (prod). Parsing/level-floors happen in Django — Vector is dumb
# transport. The vector container itself is excluded (no feedback loop).
api:
  enabled: false

sources:
  app_logs: # django + celery: multiline so tracebacks stay one event
    type: docker_logs
    include_containers: ["contentor-django", "contentor-celery"]
    exclude_containers: ["contentor-vector"]
    multiline:
      start_pattern: '^\d{4}-\d{2}-\d{2}T'
      mode: halt_before
      condition_pattern: '^\d{4}-\d{2}-\d{2}T'
      timeout_ms: 1000
  infra_logs:
    type: docker_logs
    include_containers:
      - contentor-caddy
      - contentor-postgres
      - contentor-redis
      - contentor-nextjs
      - contentor-minio
    exclude_containers: ["contentor-vector"]

transforms:
  shaped:
    type: remap
    inputs: [app_logs, infra_logs]
    source: |
      . = {
        "timestamp": format_timestamp!(.timestamp, format: "%+"),
        "container_name": .container_name,
        "stream": .stream,
        "message": .message
      }

sinks:
  logbook:
    type: http
    inputs: [shaped]
    uri: http://django:8000/api/v1/platform/logs/ingest/
    method: post
    encoding:
      codec: json
    batch:
      max_events: 400
      timeout_secs: 2
    request:
      headers:
        X-Logs-Token: "${LOGS_INGEST_TOKEN}"
    buffer:
      type: disk
      max_size: 268435488 # 256MiB (vector's disk-buffer minimum)
      when_full: drop_newest
```

- [ ] **Step 2: Add the dev compose service**

In `docker-compose.yml`, after the `celery-beat` service (before the `prometheus` block), add:

```yaml
  vector:
    image: timberio/vector:0.46.1-alpine
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./monitoring/vector/vector.yaml:/etc/vector/vector.yaml:ro
      - vector_data:/var/lib/vector
    command: --config /etc/vector/vector.yaml
    environment:
      - LOGS_INGEST_TOKEN=${LOGS_INGEST_TOKEN:-dev-logs-token}
    depends_on:
      django:
        condition: service_healthy
```

Add `vector_data:` to the top-level `volumes:` section, and add the same token default to the **django** service's `environment:` block:

```yaml
      LOGS_INGEST_TOKEN: ${LOGS_INGEST_TOKEN:-dev-logs-token}
```

(The django service currently sets `CURATED_LOGO_SYNC_DIR`/`CURATED_PHOTO_SYNC_DIR` there — append this key. `.env` values still win when present.)

- [ ] **Step 3: Document the env key**

In `.env.example`, after the AWS block, add:

```bash
# Log pipeline (apps.logbook). Vector authenticates to the ingest endpoint
# with this shared secret; compose defaults it in dev, prod requires a real one.
LOGS_INGEST_TOKEN=dev-logs-token
```

- [ ] **Step 4: Boot and verify end-to-end**

```bash
make dev
```

Wait for healthy, then generate a log line **from the gunicorn process itself** and check it landed. (Do NOT use `docker compose exec python -c ...` for this — exec output goes to the exec session's tty, never to the container's stdout, so Vector cannot see it. A 404 makes the running server emit a `django.request` WARNING, which passes the django INFO floor.)

```bash
curl -s http://localhost/api/v1/logbook-smoke-404/ > /dev/null
sleep 8   # vector batch flush (2s) + ingest
docker compose exec -T django python manage.py shell -c "
from apps.logbook.models import LogEntry
print('total', LogEntry.objects.count())
print('smoke', LogEntry.objects.filter(message__icontains='logbook-smoke-404').count())
"
```

Expected: `total` > 0 and `smoke` ≥ 1. If 0: `docker compose logs vector --tail 50` — auth failures show as 403s, config errors abort at boot.

- [ ] **Step 5: Commit**

```bash
git add monitoring/vector/vector.yaml docker-compose.yml .env.example
git commit -m "feat(logbook): Vector collector service shipping container logs to ingest (dev)"
```

---

### Task 6: request-activity middleware

**Files:**
- Create: `backend/apps/logbook/activity.py`, `backend/apps/logbook/tests/conftest.py`
- Modify: `backend/config/settings/base.py` (MIDDLEWARE, last entry), `backend/apps/core/middleware/demo_readonly.py` (exempt `/api/v1/track/`)
- Test: `backend/apps/logbook/tests/test_activity.py`

> **Why not caplog:** the `apps` logger is configured with `propagate: False`
> (base LOGGING), so records from `apps.logbook.*` never reach the root logger
> where pytest's caplog listens — caplog would capture nothing and the
> "nothing emitted" assertions would pass vacuously. The conftest fixture
> below attaches a capture handler DIRECTLY to the emitting logger instead.

**Interfaces:**
- Consumes: `ACTIVITY_LOGGER` (Task 3).
- Produces: `RequestActivityMiddleware` (emits one JSON line per non-excluded request on logger `apps.logbook.activity`); helpers `client_ip(request) -> str | None` (CF-Connecting-IP → first X-Forwarded-For hop → REMOTE_ADDR) and `redact_path(full_path: str) -> str` — both reused by Task 7.

- [ ] **Step 1: Write the shared capture fixture + the failing test**

```python
# backend/apps/logbook/tests/conftest.py
"""Log-capture fixtures. caplog cannot be used for apps.logbook.* loggers:
the `apps` logger has propagate=False, so records never reach the root
logger where caplog listens. These fixtures attach a handler directly to
the emitting logger."""

from __future__ import annotations

import logging

import pytest


class CaptureHandler(logging.Handler):
    def __init__(self):
        super().__init__(level=logging.DEBUG)
        self.messages: list[str] = []
        self.records: list[logging.LogRecord] = []

    def emit(self, record):
        self.records.append(record)
        self.messages.append(record.getMessage())


def _capture(logger_name):
    handler = CaptureHandler()
    logger = logging.getLogger(logger_name)
    old_level = logger.level
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)
    try:
        yield handler
    finally:
        logger.removeHandler(handler)
        logger.setLevel(old_level)


@pytest.fixture()
def activity_capture():
    yield from _capture("apps.logbook.activity")


@pytest.fixture()
def tasks_capture():
    yield from _capture("apps.logbook.tasks")
```

```python
# backend/apps/logbook/tests/test_activity.py
"""Activity middleware: emits one structured JSON line per request, with
exclusions, IP extraction, redaction, and session/user attribution."""

from __future__ import annotations

import json

import pytest
from django.http import HttpResponse
from django.test import RequestFactory

from apps.logbook.activity import RequestActivityMiddleware, client_ip, redact_path

pytestmark = pytest.mark.django_db


def _run(path, method="GET", status=200, headers=None, user=None):
    mw = RequestActivityMiddleware(lambda r: HttpResponse(status=status))
    factory = RequestFactory()
    request = getattr(factory, method.lower())(path, **(headers or {}))
    if user is not None:
        request.user = user
    return mw(request)


def _emitted(capture):
    return [json.loads(m) for m in capture.messages]


def test_emits_api_event(activity_capture):
    _run("/api/v1/courses/?page=2", headers={"HTTP_X_SESSION_ID": "abc-123", "HTTP_USER_AGENT": "UA/1.0"})
    (event,) = _emitted(activity_capture)
    assert event["kind"] == "api"
    assert event["method"] == "GET"
    assert event["path"] == "/api/v1/courses/?page=2"
    assert event["status"] == 200
    assert event["session_id"] == "abc-123"
    assert event["user_agent"] == "UA/1.0"
    assert isinstance(event["duration_ms"], int)


def test_excluded_paths_and_options_are_silent(activity_capture):
    _run("/api/health/")
    _run("/api/v1/platform/logs/")
    _run("/api/v1/track/pageview/", method="POST")
    _run("/api/v1/courses/", method="OPTIONS")
    assert _emitted(activity_capture) == []


def test_sensitive_params_redacted(activity_capture):
    _run("/api/v1/auth/magic/?token=SECRET123&next=/dashboard")
    (event,) = _emitted(activity_capture)
    assert "SECRET123" not in event["path"]
    assert "next=%2Fdashboard" in event["path"] or "next=/dashboard" in event["path"]


def test_client_ip_priority():
    factory = RequestFactory()
    r = factory.get("/", HTTP_CF_CONNECTING_IP="198.51.100.7", HTTP_X_FORWARDED_FOR="203.0.113.5, 10.0.0.1")
    assert client_ip(r) == "198.51.100.7"
    r = factory.get("/", HTTP_X_FORWARDED_FOR="203.0.113.5, 10.0.0.1")
    assert client_ip(r) == "203.0.113.5"
    assert client_ip(factory.get("/")) == "127.0.0.1"


def test_redact_path_caps_length():
    assert len(redact_path("/x?" + "a=b&" * 400)) <= 512


def test_authenticated_user_labelled(activity_capture, restore_public):
    from apps.accounts.models import User

    user = User.objects.create(email="act@test.io", region="global", role="owner")
    _run("/api/v1/courses/", user=user)
    (event,) = _emitted(activity_capture)
    assert event["user"] == "act@test.io"


def test_middleware_never_breaks_response(monkeypatch):
    monkeypatch.setattr(
        "apps.logbook.activity.RequestActivityMiddleware._record",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")),
    )
    resp = _run("/api/v1/courses/")
    assert resp.status_code == 200
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T django pytest apps/logbook/tests/test_activity.py -v`
Expected: FAIL — `No module named 'apps.logbook.activity'`

- [ ] **Step 3: Implement `activity.py`**

```python
# backend/apps/logbook/activity.py
"""One structured JSON log line per request → RequestEvent (via the pipeline).

Zero DB writes on the request path: the line rides stdout → Vector → ingest,
which routes ACTIVITY_LOGGER lines into RequestEvent. Registered LAST in
MIDDLEWARE so process_response runs first on the way out — after DRF set
request.user (its Request.user setter propagates to the underlying request)."""

from __future__ import annotations

import json
import logging
import time
from urllib.parse import parse_qsl, urlencode

from django.conf import settings
from django.db import connection

logger = logging.getLogger("apps.logbook.activity")


def client_ip(request) -> str | None:
    cf = request.META.get("HTTP_CF_CONNECTING_IP", "").strip()
    if cf:
        return cf
    xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR") or None


def redact_path(full_path: str) -> str:
    if "?" not in full_path:
        return full_path[:512]
    base, qs = full_path.split("?", 1)
    redact = {p.lower() for p in settings.LOGBOOK_REDACT_PARAMS}
    pairs = [(k, "redacted" if k.lower() in redact else v) for k, v in parse_qsl(qs, keep_blank_values=True)]
    return (base + "?" + urlencode(pairs))[:512]


class RequestActivityMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start = time.monotonic()
        response = self.get_response(request)
        try:
            self._record(request, response, start)
        except Exception:  # noqa: BLE001 — activity capture must never break a response
            pass
        return response

    def _record(self, request, response, start):
        path = request.path
        if request.method == "OPTIONS":
            return
        if any(path.startswith(p) for p in settings.LOGBOOK_ACTIVITY_EXCLUDE_PREFIXES):
            return
        user = getattr(request, "user", None)
        tenant = getattr(connection, "tenant", None)
        payload = {
            "kind": "api",
            "tenant": getattr(tenant, "schema_name", "") or "",
            "user": user.email if getattr(user, "is_authenticated", False) else "",
            "ip": client_ip(request),
            "session_id": request.headers.get("X-Session-Id", "")[:36],
            "method": request.method,
            "path": redact_path(request.get_full_path()),
            "status": response.status_code,
            "duration_ms": int((time.monotonic() - start) * 1000),
            "user_agent": request.META.get("HTTP_USER_AGENT", "")[:256],
        }
        logger.info(json.dumps(payload, ensure_ascii=False))
```

- [ ] **Step 4: Register middleware + demo exemption**

1. `backend/config/settings/base.py` — append as the LAST entry of MIDDLEWARE (after `TenantRateLimitMiddleware`):

```python
    "apps.logbook.activity.RequestActivityMiddleware",
```

2. `backend/apps/core/middleware/demo_readonly.py` — add to `DEMO_EXEMPT_PATH_PREFIXES` (with the existing comment style):

```python
    # Pageview beacons must work on demo tenants — demo visitors are exactly
    # the prospects worth watching in the activity trail.
    "/api/v1/track/",
```

- [ ] **Step 5: Run tests**

Run: `docker compose exec -T django pytest apps/logbook/tests/test_activity.py apps/core/tests/test_middleware.py -v`
Expected: PASS (both new and existing middleware tests).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/logbook/activity.py backend/apps/logbook/tests/test_activity.py backend/config/settings/base.py backend/apps/core/middleware/demo_readonly.py
git commit -m "feat(logbook): request-activity middleware emitting structured JSON lines"
```

---

### Task 7: pageview beacon endpoint

**Files:**
- Create: `backend/apps/logbook/views/track.py`, `backend/apps/logbook/urls_track.py`
- Modify: `backend/config/urls.py`, `backend/config/settings/base.py` (REST_FRAMEWORK throttle rate)
- Test: `backend/apps/logbook/tests/test_track.py`

**Interfaces:**
- Consumes: `client_ip`, `redact_path` (Task 6), `ACTIVITY_LOGGER` (Task 3).
- Produces: `POST /api/v1/track/pageview/` — body `{"path": "/courses", "referrer": "/"}`, optional auth (cookie/Bearer), optional `X-Session-Id`; emits a `kind=pageview` activity line; returns 202. Throttled per real client IP at `LOGBOOK_PAGEVIEW_RATE` (default 60/min).

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/logbook/tests/test_track.py
"""Pageview beacon: anonymous + authenticated attribution, throttle, validation.

Uses the activity_capture fixture from tests/conftest.py (caplog can't see
apps.logbook.* — propagate=False)."""

from __future__ import annotations

import json

import jwt as pyjwt
import pytest
from django.conf import settings
from django.test import override_settings
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

URL = "/api/v1/track/pageview/"
HOST = "shared-test.localhost"


def _emitted(capture):
    return [json.loads(m) for m in capture.messages]


def _post(client, body=None, **extra):
    return client.post(URL, data=body or {"path": "/courses", "referrer": "/"}, format="json", **extra)


def test_anonymous_pageview_accepted(activity_capture):
    client = APIClient(HTTP_HOST=HOST)
    resp = _post(client, HTTP_X_SESSION_ID="s-1", HTTP_CF_CONNECTING_IP="198.51.100.7")
    assert resp.status_code == 202
    (event,) = _emitted(activity_capture)
    assert event["kind"] == "pageview"
    assert event["path"] == "/courses"
    assert event["referrer"] == "/"
    assert event["session_id"] == "s-1"
    assert event["ip"] == "198.51.100.7"
    assert event["user"] == ""


def test_authenticated_pageview_labels_user(activity_capture, restore_public):
    from apps.accounts.models import User

    user = User.objects.create(email="pv@test.io", region="global", role="owner")
    token = pyjwt.encode(
        {"user_id": user.id, "tenant_id": "public", "role": "owner"}, settings.SECRET_KEY, algorithm="HS256"
    )
    client = APIClient(HTTP_HOST=HOST)
    client.cookies["contentor_access_token"] = token
    assert _post(client).status_code == 202
    (event,) = _emitted(activity_capture)
    assert event["user"] == "pv@test.io"


def test_invalid_path_rejected():
    client = APIClient(HTTP_HOST=HOST)
    assert _post(client, body={"path": "not-a-path"}).status_code == 400
    assert _post(client, body={}).status_code == 400


@override_settings(LOGBOOK_PAGEVIEW_RATE="3/min")
def test_throttle_kicks_in():
    client = APIClient(HTTP_HOST=HOST)
    codes = [_post(client, HTTP_CF_CONNECTING_IP="203.0.113.99").status_code for _ in range(4)]
    assert codes[:3] == [202, 202, 202]
    assert codes[3] == 429
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T django pytest apps/logbook/tests/test_track.py -v`
Expected: FAIL — 404 (route not mounted).

- [ ] **Step 3: Implement view + urls + rate setting**

```python
# backend/apps/logbook/views/track.py
"""Public page-view beacon. Auth is optional: TenantJWTAuthentication resolves
the cookie when present (invalid tokens fall back to anonymous by returning
None). Throttled per REAL client IP — DRF's default ident would be Caddy's
address for every anonymous visitor behind the proxy."""

from __future__ import annotations

import json
import logging

from django.conf import settings
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from apps.accounts.authentication import TenantJWTAuthentication

from ..activity import client_ip, redact_path

logger = logging.getLogger("apps.logbook.activity")


class PageViewThrottle(SimpleRateThrottle):
    scope = "logbook_pageview"

    def get_rate(self):
        return getattr(settings, "LOGBOOK_PAGEVIEW_RATE", "60/min")

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": client_ip(request) or "unknown"}


class PageViewTrackView(APIView):
    authentication_classes = [TenantJWTAuthentication]
    permission_classes = [AllowAny]
    throttle_classes = [PageViewThrottle]

    def post(self, request):
        from django.db import connection

        data = request.data if isinstance(request.data, dict) else {}
        path = str(data.get("path") or "")
        if not path.startswith("/"):
            return Response({"detail": "path must start with /"}, status=400)
        user = getattr(request, "user", None)
        tenant = getattr(connection, "tenant", None)
        payload = {
            "kind": "pageview",
            "tenant": getattr(tenant, "schema_name", "") or "",
            "user": user.email if getattr(user, "is_authenticated", False) else "",
            "ip": client_ip(request),
            "session_id": request.headers.get("X-Session-Id", "")[:36],
            "method": "",
            "path": redact_path(path),
            "status": None,
            "duration_ms": None,
            "referrer": redact_path(str(data.get("referrer") or ""))[:512],
            "user_agent": request.META.get("HTTP_USER_AGENT", "")[:256],
        }
        logger.info(json.dumps(payload, ensure_ascii=False))
        return Response(status=202)
```

```python
# backend/apps/logbook/urls_track.py
from django.urls import path

from .views.track import PageViewTrackView

urlpatterns = [
    path("pageview/", PageViewTrackView.as_view(), name="logbook-track-pageview"),
]
```

In `backend/config/urls.py`, after the `path("api/v1/platform/", include("apps.logbook.urls_platform")),` line added in Task 4:

```python
    path("api/v1/track/", include("apps.logbook.urls_track")),
```

In `backend/config/settings/base.py`, in the logbook settings block (Task 3), add:

```python
LOGBOOK_PAGEVIEW_RATE = "60/min"  # per client IP; PageViewThrottle reads this
```

- [ ] **Step 4: Run tests**

Run: `docker compose exec -T django pytest apps/logbook/tests/test_track.py -v`
Expected: 4 PASS. (conftest's autouse `_clear_rate_limits` purges throttle keys between tests.)

- [ ] **Step 5: Commit**

```bash
git add backend/apps/logbook/views/track.py backend/apps/logbook/urls_track.py backend/apps/logbook/tests/test_track.py backend/config/urls.py backend/config/settings/base.py
git commit -m "feat(logbook): public pageview beacon endpoint with per-IP throttle"
```

---

### Task 8: S3 archive + retention purge tasks

**Files:**
- Create: `backend/apps/logbook/archive.py`, `backend/apps/logbook/tasks.py`
- Modify: `backend/config/celery.py` (beat schedule)
- Test: `backend/apps/logbook/tests/test_tasks.py`

**Interfaces:**
- Consumes: models (Task 1), `apps.core.storage.get_s3_client` (existing: `get_s3_client(external=False)` → boto3 client; bucket = `settings.AWS_BUCKET_NAME`).
- Produces: `archive.archive_day(day: date, kind: str) -> LogArchiveDay` (idempotent; uploads `<prefix>YYYY/MM/DD.ndjson.gz`, records the ledger row; empty days get a row with `object_key=""` and no upload); celery tasks `apps.logbook.tasks.archive_logbook_days` (beat 03:40 UTC) and `apps.logbook.tasks.purge_logbook` (beat 04:20 UTC).

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/logbook/tests/test_tasks.py
"""Archive: gzip NDJSON per (day, kind), idempotent ledger. Purge: archived
days past 14d, hard cap at 21d with an ERROR breadcrumb."""

from __future__ import annotations

import gzip
import json
from datetime import UTC, datetime, timedelta

import pytest
from django.utils import timezone

from apps.logbook import archive, tasks
from apps.logbook.models import LogArchiveDay, LogEntry, RequestEvent, line_digest

pytestmark = pytest.mark.django_db


class FakeS3:
    def __init__(self):
        self.objects = {}

    def put_object(self, Bucket, Key, Body, ContentType):  # noqa: N803 — boto3 arg names
        self.objects[Key] = Body


@pytest.fixture()
def fake_s3(monkeypatch):
    fake = FakeS3()
    monkeypatch.setattr("apps.logbook.archive.get_s3_client", lambda: fake)
    return fake


def _entry(ts, msg):
    return LogEntry.objects.create(ts=ts, container="django", level="ERROR", message=msg, line_hash=line_digest(msg))


def test_archive_day_uploads_gzip_ndjson(fake_s3):
    day = datetime(2026, 7, 1, tzinfo=UTC)
    _entry(day + timedelta(hours=1), "first")
    _entry(day + timedelta(hours=2), "second")
    row = archive.archive_day(day.date(), "logs")
    assert row.line_count == 2
    assert row.object_key == "logs/archive/2026/07/01.ndjson.gz"
    lines = gzip.decompress(fake_s3.objects[row.object_key]).decode().strip().split("\n")
    assert [json.loads(x)["message"] for x in lines] == ["first", "second"]


def test_archive_day_is_idempotent(fake_s3):
    day = datetime(2026, 7, 1, tzinfo=UTC)
    _entry(day + timedelta(hours=1), "once")
    first = archive.archive_day(day.date(), "logs")
    again = archive.archive_day(day.date(), "logs")
    assert first.pk == again.pk
    assert LogArchiveDay.objects.count() == 1


def test_archive_task_covers_elapsed_days(fake_s3):
    yesterday = timezone.now() - timedelta(days=1)
    _entry(yesterday, "y-log")
    RequestEvent.objects.create(ts=yesterday, kind="api", path="/x", line_hash=line_digest("x"))
    tasks.archive_logbook_days()
    assert LogArchiveDay.objects.filter(kind="logs").count() == 1
    assert LogArchiveDay.objects.filter(kind="activity").count() == 1
    # today is never archived
    assert not LogArchiveDay.objects.filter(date=timezone.now().date()).exists()


def test_purge_deletes_archived_days_after_retention(fake_s3):
    old = timezone.now() - timedelta(days=15)
    _entry(old, "old-archived")
    archive.archive_day(old.date(), "logs")
    fresh = _entry(timezone.now() - timedelta(days=2), "fresh")
    tasks.purge_logbook()
    assert not LogEntry.objects.filter(message="old-archived").exists()
    assert LogEntry.objects.filter(pk=fresh.pk).exists()


def test_purge_keeps_unarchived_until_hard_cap(fake_s3, tasks_capture):
    unarchived_15d = _entry(timezone.now() - timedelta(days=15), "unarchived-young")
    _entry(timezone.now() - timedelta(days=22), "unarchived-ancient")
    tasks.purge_logbook()
    assert LogEntry.objects.filter(pk=unarchived_15d.pk).exists()          # inside hard cap, not archived → kept
    assert not LogEntry.objects.filter(message="unarchived-ancient").exists()  # past hard cap → deleted
    errors = [r for r in tasks_capture.records if r.levelname == "ERROR"]
    assert any("hard cap" in r.getMessage() for r in errors)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T django pytest apps/logbook/tests/test_tasks.py -v`
Expected: FAIL — `cannot import name 'archive'`

- [ ] **Step 3: Implement `archive.py` and `tasks.py`**

```python
# backend/apps/logbook/archive.py
"""Daily gzip NDJSON exports to object storage (MinIO dev / Hetzner prod).

Archives are the long-term record ("zcat | grep" when needed); the ledger row
in LogArchiveDay is what allows the purge to delete the hot rows."""

from __future__ import annotations

import gzip
import io
import json
from datetime import date, datetime, time, timedelta

from django.conf import settings
from django.utils.timezone import make_aware

from apps.core.storage import get_s3_client

from .models import LogArchiveDay, LogEntry, RequestEvent

ARCHIVE_MODELS = {"logs": LogEntry, "activity": RequestEvent}

_LOG_FIELDS = ("ts", "container", "stream", "level", "logger_name", "tenant", "user_label", "message")
_ACTIVITY_FIELDS = (
    "ts", "kind", "tenant", "user_label", "ip", "session_id",
    "method", "path", "status", "duration_ms", "referrer", "user_agent",
)


def _serialize(obj, fields) -> str:
    row = {}
    for f in fields:
        value = getattr(obj, f)
        row[f] = value.isoformat() if hasattr(value, "isoformat") else value
    return json.dumps(row, ensure_ascii=False)


def archive_day(day: date, kind: str) -> LogArchiveDay:
    existing = LogArchiveDay.objects.filter(date=day, kind=kind).first()
    if existing:
        return existing
    model = ARCHIVE_MODELS[kind]
    fields = _LOG_FIELDS if kind == "logs" else _ACTIVITY_FIELDS
    start = make_aware(datetime.combine(day, time.min))
    end = start + timedelta(days=1)
    qs = model.objects.filter(ts__gte=start, ts__lt=end).order_by("ts", "id")

    buf = io.BytesIO()
    count = 0
    with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
        for obj in qs.iterator(chunk_size=2000):
            gz.write((_serialize(obj, fields) + "\n").encode("utf-8"))
            count += 1

    object_key = ""
    if count:
        prefix = settings.LOGBOOK_ARCHIVE_PREFIXES[kind]
        object_key = f"{prefix}{day:%Y/%m/%d}.ndjson.gz"
        get_s3_client().put_object(
            Bucket=settings.AWS_BUCKET_NAME,
            Key=object_key,
            Body=buf.getvalue(),
            ContentType="application/gzip",
        )
    return LogArchiveDay.objects.create(date=day, kind=kind, object_key=object_key, line_count=count)
```

```python
# backend/apps/logbook/tasks.py
"""Beat tasks: archive elapsed days to S3, purge the hot store."""

from __future__ import annotations

import logging
from datetime import datetime, time, timedelta

from celery import shared_task
from django.conf import settings
from django.utils import timezone
from django.utils.timezone import make_aware

from .archive import ARCHIVE_MODELS, archive_day
from .models import LogArchiveDay

logger = logging.getLogger(__name__)


def _day_range(model):
    first_ts = model.objects.order_by("ts").values_list("ts", flat=True).first()
    if first_ts is None:
        return []
    today = timezone.now().date()
    start = max(first_ts.date(), today - timedelta(days=settings.LOGBOOK_HARD_CAP_DAYS))
    return [start + timedelta(days=i) for i in range((today - start).days)]  # excludes today


@shared_task
def archive_logbook_days():
    for kind, model in ARCHIVE_MODELS.items():
        done = set(LogArchiveDay.objects.filter(kind=kind).values_list("date", flat=True))
        for day in _day_range(model):
            if day in done:
                continue
            try:
                row = archive_day(day, kind)
                logger.info("logbook archive: %s %s -> %s (%s lines)", kind, day, row.object_key or "(empty)", row.line_count)
            except Exception:
                logger.exception("logbook archive failed for %s %s; will retry tomorrow", kind, day)


def _delete_day(model, day):
    start = make_aware(datetime.combine(day, time.min))
    deleted, _ = model.objects.filter(ts__gte=start, ts__lt=start + timedelta(days=1)).delete()
    return deleted


@shared_task
def purge_logbook():
    today = timezone.now().date()
    retention_cutoff = today - timedelta(days=settings.LOGBOOK_RETENTION_DAYS)
    hard_cutoff = make_aware(datetime.combine(today - timedelta(days=settings.LOGBOOK_HARD_CAP_DAYS), time.min))
    for kind, model in ARCHIVE_MODELS.items():
        # Hard cap: anything older than 21d goes regardless — a persistently
        # failing archive must not grow the table forever. The ERROR below
        # surfaces in the panel itself.
        stale = model.objects.filter(ts__lt=hard_cutoff)
        if stale.exists():
            deleted, _ = stale.delete()
            logger.error("logbook purge: deleted %s unarchived %s rows past the 21d hard cap", deleted, kind)
        archived = set(
            LogArchiveDay.objects.filter(kind=kind, date__lt=retention_cutoff).values_list("date", flat=True)
        )
        for day in sorted(archived):
            deleted = _delete_day(model, day)
            if deleted:
                logger.info("logbook purge: %s %s -> deleted %s rows", kind, day, deleted)
```

- [ ] **Step 4: Beat schedule**

In `backend/config/celery.py`, add to `app.conf.beat_schedule` (after `"send-wizard-recovery-emails"`):

```python
    "logbook-archive": {
        "task": "apps.logbook.tasks.archive_logbook_days",
        "schedule": crontab(hour="3", minute="40"),
    },
    "logbook-purge": {
        "task": "apps.logbook.tasks.purge_logbook",
        "schedule": crontab(hour="4", minute="20"),
    },
```

- [ ] **Step 5: Run tests**

Run: `docker compose exec -T django pytest apps/logbook/tests/test_tasks.py -v`
Expected: 6 PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/logbook/archive.py backend/apps/logbook/tasks.py backend/apps/logbook/tests/test_tasks.py backend/config/celery.py
git commit -m "feat(logbook): daily S3 archive + 14d purge with 21d hard cap"
```

---

### Task 9: panel API — logs list + dynamic facets

**Files:**
- Create: `backend/apps/logbook/views/panel.py`
- Modify: `backend/apps/logbook/urls_platform.py`
- Test: `backend/apps/logbook/tests/test_panel_logs.py`

**Interfaces:**
- Consumes: models, `IsSuperUser` (`apps.core.permissions`).
- Produces:
  - `GET /api/v1/platform/logs/` — params `level`, `container`, `tenant`, `user` (each comma-separated multi), `q`, `since`, `until` (ISO), `cursor` → `{"results": [{id, ts, container, stream, level, logger_name, tenant, user_label, message}], "next_cursor": str|null}`, newest first, 100/page. Cursor format `"<ts.isoformat()>|<id>"`.
  - `GET /api/v1/platform/logs/facets/` — same filter params → `{"levels"|"containers"|"tenants"|"users": [{"value": str, "count": int}]}` where each dimension is computed with all OTHER filters applied, zero-count omitted, tenants/users capped at 20 by count (`users_q` narrows users). Shared helpers `apply_common_filters(qs, params, dimension_skip)` reused by Task 10.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/logbook/tests/test_panel_logs.py
"""Logs panel API: filtering, keyset pagination, faceted-search semantics."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.logbook.models import LogEntry, line_digest

pytestmark = pytest.mark.django_db

BASE = datetime(2026, 7, 19, 12, 0, 0, tzinfo=UTC)


@pytest.fixture()
def superuser(restore_public):
    return User.objects.create(
        email="logs-admin@contentor.app", region="global", role="owner", is_staff=True, is_superuser=True
    )


@pytest.fixture()
def client(superuser):
    c = APIClient(HTTP_HOST="shared-test.localhost")
    c.force_authenticate(user=superuser)
    return c


@pytest.fixture()
def rows(restore_public):
    def make(i, container, level, tenant="", user="", message=None):
        msg = message or f"line {i} from {container}"
        return LogEntry.objects.create(
            ts=BASE + timedelta(seconds=i), container=container, level=level,
            tenant=tenant, user_label=user, message=msg, line_hash=line_digest(msg + str(i)),
        )

    make(1, "django", "ERROR", tenant="yoga", user="a@b.co", message="database exploded")
    make(2, "django", "INFO", tenant="yoga")
    make(3, "celery-worker", "ERROR", tenant="pilates")
    make(4, "caddy", "WARNING")
    make(5, "django", "INFO", tenant="pilates")
    return LogEntry.objects.all()


def test_requires_superuser(restore_public):
    coach = User.objects.create(email="c@x.io", region="global", role="owner")
    c = APIClient(HTTP_HOST="shared-test.localhost")
    c.force_authenticate(user=coach)
    assert c.get("/api/v1/platform/logs/").status_code == 403


def test_list_newest_first_with_filters(client, rows):
    body = client.get("/api/v1/platform/logs/", {"level": "ERROR"}).json()
    assert [r["message"] for r in body["results"]] == ["line 3 from celery-worker", "database exploded"]
    body = client.get("/api/v1/platform/logs/", {"level": "ERROR,WARNING", "container": "caddy"}).json()
    assert len(body["results"]) == 1


def test_search_and_time_window(client, rows):
    body = client.get("/api/v1/platform/logs/", {"q": "exploded"}).json()
    assert len(body["results"]) == 1
    since = (BASE + timedelta(seconds=4, milliseconds=500)).isoformat()
    body = client.get("/api/v1/platform/logs/", {"since": since}).json()
    assert [r["message"] for r in body["results"]] == ["line 5 from django"]


def test_keyset_pagination_no_duplicates(client, restore_public):
    for i in range(150):
        msg = f"bulk {i}"
        LogEntry.objects.create(ts=BASE + timedelta(seconds=i), container="django", level="INFO",
                                message=msg, line_hash=line_digest(msg))
    page1 = client.get("/api/v1/platform/logs/").json()
    assert len(page1["results"]) == 100 and page1["next_cursor"]
    page2 = client.get("/api/v1/platform/logs/", {"cursor": page1["next_cursor"]}).json()
    assert len(page2["results"]) == 50 and page2["next_cursor"] is None
    ids = [r["id"] for r in page1["results"] + page2["results"]]
    assert len(ids) == len(set(ids))


def test_facets_respect_other_filters_but_not_own(client, rows):
    body = client.get("/api/v1/platform/logs/facets/", {"level": "ERROR"}).json()
    containers = {f["value"]: f["count"] for f in body["containers"]}
    assert containers == {"django": 1, "celery-worker": 1}       # caddy vanished (no ERROR rows)
    levels = {f["value"] for f in body["levels"]}
    assert "INFO" in levels                                       # own dimension NOT self-filtered
    tenants = {f["value"]: f["count"] for f in body["tenants"]}
    assert tenants == {"yoga": 1, "pilates": 1}                   # blank tenants omitted


def test_facets_zero_options_omitted(client, rows):
    body = client.get("/api/v1/platform/logs/facets/", {"container": "caddy"}).json()
    assert {f["value"] for f in body["levels"]} == {"WARNING"}
    assert body["users"] == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T django pytest apps/logbook/tests/test_panel_logs.py -v`
Expected: FAIL — 404s.

- [ ] **Step 3: Implement `panel.py` (logs half) + routes**

```python
# backend/apps/logbook/views/panel.py
"""Superadmin list + facet endpoints for the /admin/logs page.

Faceted-search semantics: each facet dimension is counted under every OTHER
active filter (plus q/since/until) but never its own — picking level=ERROR
narrows the container options to containers that HAVE errors, while the level
facet itself keeps showing the alternatives. Zero-count options are omitted."""

from __future__ import annotations

from datetime import datetime

from django.db.models import Count, Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsSuperUser

from ..models import LogEntry, RequestEvent

PAGE_SIZE = 100
FACET_LIMIT = 20

LOG_FIELDS = ("id", "ts", "container", "stream", "level", "logger_name", "tenant", "user_label", "message")
ACTIVITY_FIELDS = (
    "id", "ts", "kind", "tenant", "user_label", "ip", "session_id",
    "method", "path", "status", "duration_ms", "referrer", "user_agent",
)


def _multi(params, name):
    raw = (params.get(name) or "").strip()
    return [v for v in raw.split(",") if v] if raw else []


def _parse_dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _apply_time_and_q(qs, params, q_field):
    since, until = _parse_dt(params.get("since")), _parse_dt(params.get("until"))
    if since:
        qs = qs.filter(ts__gte=since)
    if until:
        qs = qs.filter(ts__lt=until)
    q = (params.get("q") or "").strip()
    if q:
        qs = qs.filter(**{f"{q_field}__icontains": q})
    return qs


def _log_filters(params, skip=""):
    """Field filters for LogEntry; `skip` omits one dimension (facet self)."""
    spec = {"level": "level", "container": "container", "tenant": "tenant", "user": "user_label"}
    filters = Q()
    for param, field in spec.items():
        if param == skip:
            continue
        values = _multi(params, param)
        if values:
            filters &= Q(**{f"{field}__in": values})
    return filters


def _log_queryset(params, skip=""):
    qs = LogEntry.objects.filter(_log_filters(params, skip=skip))
    return _apply_time_and_q(qs, params, "message")


def _paginate(qs, params, fields):
    cursor = params.get("cursor") or ""
    if "|" in cursor:
        ts_raw, _, id_raw = cursor.partition("|")
        cts, cid = _parse_dt(ts_raw), int(id_raw) if id_raw.isdigit() else 0
        if cts:
            qs = qs.filter(Q(ts__lt=cts) | (Q(ts=cts) & Q(id__lt=cid)))
    rows = list(qs.order_by("-ts", "-id").values(*fields)[: PAGE_SIZE + 1])
    next_cursor = None
    if len(rows) > PAGE_SIZE:
        rows = rows[:PAGE_SIZE]
        last = rows[-1]
        next_cursor = f"{last['ts'].isoformat()}|{last['id']}"
    for r in rows:
        r["ts"] = r["ts"].isoformat()
    return {"results": rows, "next_cursor": next_cursor}


def _facet(build_qs, params, param_name, field, limit=None, extra_q=None):
    qs = build_qs(params, skip=param_name)
    if extra_q:
        qs = qs.filter(extra_q)
    counts = (
        qs.exclude(**{field: ""})
        .values(field)
        .annotate(count=Count("id"))
        .order_by("-count", field)
    )
    if limit:
        counts = counts[:limit]
    return [{"value": row[field], "count": row["count"]} for row in counts]


@api_view(["GET"])
@permission_classes([IsSuperUser])
def platform_logs(request):
    return Response(_paginate(_log_queryset(request.query_params), request.query_params, LOG_FIELDS))


@api_view(["GET"])
@permission_classes([IsSuperUser])
def platform_logs_facets(request):
    params = request.query_params
    users_q = (params.get("users_q") or "").strip()
    users_extra = Q(user_label__icontains=users_q) if users_q else None
    return Response(
        {
            "levels": _facet(_log_queryset, params, "level", "level"),
            "containers": _facet(_log_queryset, params, "container", "container"),
            "tenants": _facet(_log_queryset, params, "tenant", "tenant", limit=FACET_LIMIT),
            "users": _facet(_log_queryset, params, "user", "user_label", limit=FACET_LIMIT, extra_q=users_extra),
        }
    )
```

Replace `backend/apps/logbook/urls_platform.py` with:

```python
from django.urls import path

from .views import ingest, panel

urlpatterns = [
    path("logs/ingest/", ingest.logs_ingest, name="logbook-ingest"),
    path("logs/facets/", panel.platform_logs_facets, name="logbook-logs-facets"),
    path("logs/", panel.platform_logs, name="logbook-logs"),
]
```

- [ ] **Step 4: Run tests**

Run: `docker compose exec -T django pytest apps/logbook/tests/test_panel_logs.py -v`
Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/logbook/views/panel.py backend/apps/logbook/urls_platform.py backend/apps/logbook/tests/test_panel_logs.py
git commit -m "feat(logbook): logs list + dynamic facets panel API"
```

---

### Task 10: panel API — activity list + facets

**Files:**
- Modify: `backend/apps/logbook/views/panel.py`, `backend/apps/logbook/urls_platform.py`
- Test: `backend/apps/logbook/tests/test_panel_activity.py`

**Interfaces:**
- Consumes: helpers from Task 9 (`_multi`, `_apply_time_and_q`, `_paginate`, `_facet`).
- Produces: `GET /api/v1/platform/activity/` — params `kind`, `method`, `status_class` (comma multi of `2xx|3xx|4xx|5xx`), `tenant`, `user`, `ip`, `session`, `q` (path icontains), `since`, `until`, `cursor` → same page shape with ACTIVITY_FIELDS; `GET /api/v1/platform/activity/facets/` → `{"kinds", "methods", "status_classes", "tenants", "users"}`.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/logbook/tests/test_panel_activity.py
"""Activity panel API: kind/status-class filters, session drill-down, facets."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.logbook.models import RequestEvent, line_digest

pytestmark = pytest.mark.django_db

BASE = datetime(2026, 7, 19, 12, 0, 0, tzinfo=UTC)


@pytest.fixture()
def client(restore_public):
    admin = User.objects.create(
        email="act-admin@contentor.app", region="global", role="owner", is_staff=True, is_superuser=True
    )
    c = APIClient(HTTP_HOST="shared-test.localhost")
    c.force_authenticate(user=admin)
    return c


@pytest.fixture()
def rows(restore_public):
    def make(i, **kw):
        defaults = {"ts": BASE + timedelta(seconds=i), "kind": "api", "path": f"/p/{i}", "line_hash": line_digest(str(i))}
        defaults.update(kw)
        return RequestEvent.objects.create(**defaults)

    make(1, kind="pageview", tenant="yoga", user_label="s@t.io", session_id="sess-1", path="/courses")
    make(2, kind="api", tenant="yoga", user_label="s@t.io", session_id="sess-1", method="GET", status=200)
    make(3, kind="api", tenant="yoga", user_label="s@t.io", session_id="sess-1", method="POST", status=500)
    make(4, kind="api", tenant="pilates", user_label="o@t.io", session_id="sess-2", method="GET", status=404)
    return RequestEvent.objects.all()


def test_kind_and_status_class_filters(client, rows):
    body = client.get("/api/v1/platform/activity/", {"kind": "pageview"}).json()
    assert [r["path"] for r in body["results"]] == ["/courses"]
    body = client.get("/api/v1/platform/activity/", {"status_class": "5xx"}).json()
    assert [r["status"] for r in body["results"]] == [500]
    body = client.get("/api/v1/platform/activity/", {"status_class": "4xx,5xx"}).json()
    assert len(body["results"]) == 2


def test_session_drilldown_is_chronological_page(client, rows):
    body = client.get("/api/v1/platform/activity/", {"session": "sess-1"}).json()
    assert len(body["results"]) == 3
    assert {r["session_id"] for r in body["results"]} == {"sess-1"}


def test_activity_facets(client, rows):
    body = client.get("/api/v1/platform/activity/facets/", {"tenant": "yoga"}).json()
    assert {f["value"]: f["count"] for f in body["kinds"]} == {"api": 2, "pageview": 1}
    assert {f["value"] for f in body["methods"]} == {"GET", "POST"}
    assert {f["value"]: f["count"] for f in body["status_classes"]} == {"2xx": 1, "5xx": 1}
    # own-dimension rule: tenant facet still shows pilates
    assert {f["value"] for f in body["tenants"]} == {"yoga", "pilates"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T django pytest apps/logbook/tests/test_panel_activity.py -v`
Expected: FAIL — 404s.

- [ ] **Step 3: Extend `panel.py`**

Append to `backend/apps/logbook/views/panel.py`:

```python
_STATUS_CLASSES = {"2xx": (200, 300), "3xx": (300, 400), "4xx": (400, 500), "5xx": (500, 600)}


def _status_class_q(values):
    q = Q()
    for v in values:
        bounds = _STATUS_CLASSES.get(v)
        if bounds:
            q |= Q(status__gte=bounds[0], status__lt=bounds[1])
    return q


def _activity_queryset(params, skip=""):
    spec = {"kind": "kind", "method": "method", "tenant": "tenant", "user": "user_label", "session": "session_id"}
    filters = Q()
    for param, field in spec.items():
        if param == skip:
            continue
        values = _multi(params, param)
        if values:
            filters &= Q(**{f"{field}__in": values})
    if skip != "status_class":
        classes = _multi(params, "status_class")
        if classes:
            filters &= _status_class_q(classes)
    if skip != "ip":
        ip = (params.get("ip") or "").strip()
        if ip:
            filters &= Q(ip=ip)
    qs = RequestEvent.objects.filter(filters)
    return _apply_time_and_q(qs, params, "path")


@api_view(["GET"])
@permission_classes([IsSuperUser])
def platform_activity(request):
    return Response(_paginate(_activity_queryset(request.query_params), request.query_params, ACTIVITY_FIELDS))


@api_view(["GET"])
@permission_classes([IsSuperUser])
def platform_activity_facets(request):
    params = request.query_params
    status_counts = []
    base = _activity_queryset(params, skip="status_class")
    for name, (lo, hi) in _STATUS_CLASSES.items():
        count = base.filter(status__gte=lo, status__lt=hi).count()
        if count:
            status_counts.append({"value": name, "count": count})
    return Response(
        {
            "kinds": _facet(_activity_queryset, params, "kind", "kind"),
            "methods": _facet(_activity_queryset, params, "method", "method"),
            "status_classes": status_counts,
            "tenants": _facet(_activity_queryset, params, "tenant", "tenant", limit=FACET_LIMIT),
            "users": _facet(_activity_queryset, params, "user", "user_label", limit=FACET_LIMIT),
        }
    )
```

Add to `urls_platform.py` urlpatterns:

```python
    path("activity/facets/", panel.platform_activity_facets, name="logbook-activity-facets"),
    path("activity/", panel.platform_activity, name="logbook-activity"),
]
```

- [ ] **Step 4: Run tests + full app suite**

Run: `make test-app APP=logbook`
Expected: all logbook tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/logbook/views/panel.py backend/apps/logbook/urls_platform.py backend/apps/logbook/tests/test_panel_activity.py
git commit -m "feat(logbook): activity list + facets panel API"
```

---

### Task 11: shared tracking — session id, beacon component, client header

**Files:**
- Create: `packages/shared/src/tracking/session.ts`, `packages/shared/src/tracking/track-page-view.tsx`
- Modify: `frontend-customer/src/lib/api-client.ts`, `frontend-customer/src/app/layout.tsx`, `frontend-main/src/app/layout.tsx`
- Test: `frontend-customer/src/lib/__tests__/tracking-session.test.ts`

**Interfaces:**
- Produces: `getSessionId(): string` (per-tab UUID in sessionStorage key `ct_sid`, `""` on server/failure), `SESSION_HEADER = "X-Session-Id"`, `shouldTrack(prev, path, now): boolean` (pure, 1s same-path dedupe), `<TrackPageView />` (client component, pathname-only — deliberately no `useSearchParams`, which would force Suspense boundaries and static-render bailouts in the marketing layout; query strings on the server side are captured by the activity middleware).
- Known deviation from spec: frontend-main has no central fetch wrapper, so its *API calls* don't carry `X-Session-Id` in v1 — its page views do, and frontend-customer carries the header on every API call via `clientFetch`.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend-customer/src/lib/__tests__/tracking-session.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSessionId, shouldTrack, SESSION_HEADER } from "@shared/tracking/session";

describe("shouldTrack", () => {
  it("fires on first navigation", () => {
    expect(shouldTrack(null, "/courses", 1000)).toBe(true);
  });
  it("dedupes same path within 1s", () => {
    expect(shouldTrack({ path: "/courses", t: 1000 }, "/courses", 1500)).toBe(false);
    expect(shouldTrack({ path: "/courses", t: 1000 }, "/courses", 2100)).toBe(true);
  });
  it("fires immediately on a different path", () => {
    expect(shouldTrack({ path: "/courses", t: 1000 }, "/about", 1001)).toBe(true);
  });
});

describe("getSessionId", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    });
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-1111-1111-111111111111" });
  });

  it("mints once and is stable per tab", () => {
    const first = getSessionId();
    expect(first).toBe("11111111-1111-1111-1111-111111111111");
    expect(getSessionId()).toBe(first);
  });

  it("exports the header name", () => {
    expect(SESSION_HEADER).toBe("X-Session-Id");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend-customer && npm run test`
Expected: FAIL — cannot resolve `@shared/tracking/session`.

- [ ] **Step 3: Implement the shared module**

```typescript
// packages/shared/src/tracking/session.ts
// Per-tab session identity for journey stitching. sessionStorage-scoped by
// design: no persistent identifier for anonymous visitors (privacy stance in
// the logbook spec).

export const SESSION_HEADER = "X-Session-Id";
const KEY = "ct_sid";

export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let sid = window.sessionStorage.getItem(KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      window.sessionStorage.setItem(KEY, sid);
    }
    return sid;
  } catch {
    return ""; // storage blocked (private mode) — track without stitching
  }
}

export function shouldTrack(
  prev: { path: string; t: number } | null,
  path: string,
  now: number,
): boolean {
  return !prev || prev.path !== path || now - prev.t > 1000;
}
```

```tsx
// packages/shared/src/tracking/track-page-view.tsx
"use client";

// Fire-and-forget page-view beacon. Mounted once per app in the root layout.
// pathname-only on purpose: useSearchParams would force a Suspense boundary
// and CSR bailout in the static marketing layout; server-side query strings
// are captured (redacted) by the activity middleware instead.

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { getSessionId, SESSION_HEADER, shouldTrack } from "./session";

export function TrackPageView() {
  const pathname = usePathname();
  const lastRef = useRef<{ path: string; t: number } | null>(null);
  const prevPathRef = useRef<string>("");

  useEffect(() => {
    if (!pathname) return;
    const now = Date.now();
    if (!shouldTrack(lastRef.current, pathname, now)) return;
    const referrer = prevPathRef.current || (typeof document !== "undefined" ? document.referrer : "");
    lastRef.current = { path: pathname, t: now };
    prevPathRef.current = pathname;
    const sid = getSessionId();
    void fetch("/api/v1/track/pageview/", {
      method: "POST",
      keepalive: true,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(sid ? { [SESSION_HEADER]: sid } : {}),
      },
      body: JSON.stringify({ path: pathname, referrer }),
    }).catch(() => {});
  }, [pathname]);

  return null;
}
```

- [ ] **Step 4: Mount in both layouts + customer client header**

1. `frontend-main/src/app/layout.tsx` — import `import { TrackPageView } from "@shared/tracking/track-page-view";` and render `<TrackPageView />` directly after `<HelpBubble />`.

2. `frontend-customer/src/app/layout.tsx` — import the same; render `<TrackPageView />` directly after `<TenantThemeEnforcer />` (NOT inside the `gated ? ... : ...` fragment — gated/preview visits should still track; the early "Site not found" return stays untouched).

3. `frontend-customer/src/lib/api-client.ts` — in `clientFetch`, attach the session header. Add the import and change the headers object:

```typescript
import { getSessionId, SESSION_HEADER } from "@shared/tracking/session";
```

```typescript
  const sid = getSessionId();
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(sid ? { [SESSION_HEADER]: sid } : {}),
      ...options?.headers,
    },
    credentials: "same-origin",
  });
```

- [ ] **Step 5: Run tests + typecheck**

Run: `cd frontend-customer && npm run test` → PASS.
Run: `make typecheck` → no new errors in either app.

- [ ] **Step 6: Verify live in dev**

With `make dev` running: open `http://demo-yoga.localhost` in a browser, navigate 2–3 pages, then:

```bash
docker compose exec -T django python manage.py shell -c "
from apps.logbook.models import RequestEvent
print(list(RequestEvent.objects.filter(kind='pageview').order_by('-ts').values('path','tenant','session_id')[:5]))
"
```

Expected: pageview rows for the demo tenant with a stable session_id (allow ~5–10s pipeline latency).

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/tracking frontend-customer/src/lib/__tests__/tracking-session.test.ts frontend-customer/src/lib/api-client.ts frontend-customer/src/app/layout.tsx frontend-main/src/app/layout.tsx
git commit -m "feat(logbook): pageview beacon + per-tab session stitching in both frontends"
```

---

### Task 12: `/admin/logs` page — API client, filters, Logs tab

**Files:**
- Create: `frontend-main/src/lib/platform-logs-api.ts`, `frontend-main/src/app/admin/logs/page.tsx`, `frontend-main/src/app/admin/logs/filters.tsx`, `frontend-main/src/app/admin/logs/logs-table.tsx`, `frontend-main/src/app/admin/logs/activity-table.tsx` (stub — Task 13 replaces it)
- Modify: `frontend-main/src/app/admin/admin-shell.tsx` (nav entry)

**Interfaces:**
- Consumes: Task 9 endpoints.
- Produces: `platform-logs-api.ts` exports `LogRow`, `ActivityRow`, `Facet {value, count}`, `LogsFilters`, `fetchLogs`, `fetchLogFacets`, `fetchActivity`, `fetchActivityFacets`, `sinceForRange(range: TimeRange): string`; `filters.tsx` exports `TimeRange`, `TIME_RANGES`, `FacetChips`, `FacetSelect`, `SearchBox`. Filter state lives in URL search params (`useSearchParams` + `router.replace`) so the Activity tab (Task 13) and cross-links share it.

- [ ] **Step 1: API client**

```typescript
// frontend-main/src/lib/platform-logs-api.ts
// Superadmin log/activity viewer client — same-origin cookie auth like
// platform-email-api.ts.

async function clientFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error((data && data.detail) || `Request failed (${res.status})`);
  }
  return res.json();
}

export interface LogRow {
  id: number;
  ts: string;
  container: string;
  stream: string;
  level: "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  logger_name: string;
  tenant: string;
  user_label: string;
  message: string;
}

export interface ActivityRow {
  id: number;
  ts: string;
  kind: "api" | "pageview";
  tenant: string;
  user_label: string;
  ip: string | null;
  session_id: string;
  method: string;
  path: string;
  status: number | null;
  duration_ms: number | null;
  referrer: string;
  user_agent: string;
}

export interface Facet {
  value: string;
  count: number;
}

export interface Page<T> {
  results: T[];
  next_cursor: string | null;
}

export type LogsFilters = Record<string, string>; // param name -> comma-joined values

function qs(filters: LogsFilters, cursor?: string | null): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) search.set(key, value);
  }
  if (cursor) search.set("cursor", cursor);
  const s = search.toString();
  return s ? `?${s}` : "";
}

export const fetchLogs = (f: LogsFilters, cursor?: string | null) =>
  clientFetch<Page<LogRow>>(`/api/v1/platform/logs/${qs(f, cursor)}`);
export const fetchLogFacets = (f: LogsFilters) =>
  clientFetch<{ levels: Facet[]; containers: Facet[]; tenants: Facet[]; users: Facet[] }>(
    `/api/v1/platform/logs/facets/${qs(f)}`,
  );
export const fetchActivity = (f: LogsFilters, cursor?: string | null) =>
  clientFetch<Page<ActivityRow>>(`/api/v1/platform/activity/${qs(f, cursor)}`);
export const fetchActivityFacets = (f: LogsFilters) =>
  clientFetch<{ kinds: Facet[]; methods: Facet[]; status_classes: Facet[]; tenants: Facet[]; users: Facet[] }>(
    `/api/v1/platform/activity/facets/${qs(f)}`,
  );

export type TimeRange = "15m" | "1h" | "6h" | "24h" | "7d" | "14d";

const RANGE_MS: Record<TimeRange, number> = {
  "15m": 15 * 60_000,
  "1h": 3_600_000,
  "6h": 6 * 3_600_000,
  "24h": 24 * 3_600_000,
  "7d": 7 * 86_400_000,
  "14d": 14 * 86_400_000,
};

export function sinceForRange(range: TimeRange): string {
  return new Date(Date.now() - RANGE_MS[range]).toISOString();
}
```

- [ ] **Step 2: Filter primitives**

```tsx
// frontend-main/src/app/admin/logs/filters.tsx
"use client";

import type { Facet, TimeRange } from "@/lib/platform-logs-api";

export const TIME_RANGES: TimeRange[] = ["15m", "1h", "6h", "24h", "7d", "14d"];

function toggle(csv: string, value: string): string {
  const parts = csv ? csv.split(",") : [];
  const next = parts.includes(value) ? parts.filter((p) => p !== value) : [...parts, value];
  return next.join(",");
}

/** Multi-select chips fed by live facet counts. Zero-count options are absent
 * from `facets`; active selections stay rendered so they can be unselected. */
export function FacetChips({
  label,
  facets,
  selected,
  onChange,
}: {
  label: string;
  facets: Facet[];
  selected: string; // comma-joined
  onChange: (next: string) => void;
}) {
  const active = selected ? selected.split(",") : [];
  const known = new Set(facets.map((f) => f.value));
  const stale = active.filter((v) => !known.has(v));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {facets.map((f) => (
        <button
          key={f.value}
          onClick={() => onChange(toggle(selected, f.value))}
          className={`rounded-full border px-2.5 py-0.5 text-xs ${
            active.includes(f.value)
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-background hover:bg-muted"
          }`}
        >
          {f.value} <span className="opacity-70">{f.count}</span>
        </button>
      ))}
      {stale.map((v) => (
        <button
          key={v}
          onClick={() => onChange(toggle(selected, v))}
          className="rounded-full border border-primary bg-primary px-2.5 py-0.5 text-xs text-primary-foreground opacity-60"
        >
          {v} <span className="opacity-70">0</span>
        </button>
      ))}
    </div>
  );
}

/** Single-value select for high-cardinality dimensions (tenant, user). */
export function FacetSelect({
  label,
  facets,
  selected,
  onChange,
}: {
  label: string;
  facets: Facet[];
  selected: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border bg-background px-2 py-1 text-xs text-foreground"
      >
        <option value="">all</option>
        {selected && !facets.some((f) => f.value === selected) && (
          <option value={selected}>{selected} (0)</option>
        )}
        {facets.map((f) => (
          <option key={f.value} value={f.value}>
            {f.value} ({f.count})
          </option>
        ))}
      </select>
    </label>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="text"
      defaultValue={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-64 rounded-md border bg-background px-3 py-1.5 text-sm"
    />
  );
}

/** Typeahead combobox for the high-cardinality user dimension: native
 * datalist over the facet top-20, but free typing lets you filter on any
 * email (the backend filter is exact-match on the param, facet presence not
 * required). Commits on change/blur/Enter. */
export function UserCombobox({
  facets,
  selected,
  onChange,
}: {
  facets: Facet[];
  selected: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      User
      <input
        type="text"
        list="logbook-user-options"
        defaultValue={selected}
        key={selected} /* re-mount when cross-links set the filter */
        placeholder="any"
        onBlur={(e) => onChange(e.target.value.trim())}
        onKeyDown={(e) => {
          if (e.key === "Enter") onChange((e.target as HTMLInputElement).value.trim());
        }}
        className="w-52 rounded-md border bg-background px-2 py-1 text-xs text-foreground"
      />
      <datalist id="logbook-user-options">
        {facets.map((f) => (
          <option key={f.value} value={f.value}>
            {f.count}
          </option>
        ))}
      </datalist>
    </label>
  );
}
```

- [ ] **Step 3: Logs table**

```tsx
// frontend-main/src/app/admin/logs/logs-table.tsx
"use client";

import { useState } from "react";

import type { LogRow } from "@/lib/platform-logs-api";

const LEVEL_STYLE: Record<string, string> = {
  CRITICAL: "bg-red-600 text-white",
  ERROR: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  WARNING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  INFO: "bg-muted text-muted-foreground",
  DEBUG: "bg-muted text-muted-foreground",
};

export function LogsTable({ rows, onUserClick }: { rows: LogRow[]; onUserClick: (user: string) => void }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  if (rows.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">No log lines match the current filters.</p>;
  }
  return (
    <table className="w-full table-fixed text-sm">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="w-44 pb-2 font-medium">Time</th>
          <th className="w-24 pb-2 font-medium">Level</th>
          <th className="w-32 pb-2 font-medium">Container</th>
          <th className="w-28 pb-2 font-medium">Tenant</th>
          <th className="w-44 pb-2 font-medium">User</th>
          <th className="pb-2 font-medium">Message</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.id}
            onClick={() => setExpanded(expanded === r.id ? null : r.id)}
            className="cursor-pointer border-b align-top hover:bg-muted/50"
          >
            <td className="py-2 pr-2 font-mono text-xs text-muted-foreground">
              {new Date(r.ts).toLocaleString(undefined, {
                month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
                fractionalSecondDigits: 3,
              })}
            </td>
            <td className="py-2 pr-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_STYLE[r.level] ?? ""}`}>
                {r.level}
              </span>
            </td>
            <td className="py-2 pr-2 text-xs">{r.container}</td>
            <td className="py-2 pr-2 text-xs">{r.tenant || "—"}</td>
            <td className="py-2 pr-2 text-xs">
              {r.user_label ? (
                <button
                  className="text-primary underline-offset-2 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUserClick(r.user_label);
                  }}
                >
                  {r.user_label}
                </button>
              ) : (
                "—"
              )}
            </td>
            <td className="py-2 font-mono text-xs">
              {expanded === r.id ? (
                <pre className="whitespace-pre-wrap break-all">{r.message}</pre>
              ) : (
                <span className="block truncate">{r.message}</span>
              )}
              {expanded === r.id && r.logger_name && (
                <span className="mt-1 block text-muted-foreground">logger: {r.logger_name}</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: The page (tabs shell + Logs tab wiring)**

```tsx
// frontend-main/src/app/admin/logs/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchActivity,
  fetchActivityFacets,
  fetchLogFacets,
  fetchLogs,
  sinceForRange,
  type ActivityRow,
  type Facet,
  type LogRow,
  type LogsFilters,
  type TimeRange,
} from "@/lib/platform-logs-api";

import { ActivityTable } from "./activity-table";
import { FacetChips, FacetSelect, SearchBox, TIME_RANGES, UserCombobox } from "./filters";
import { LogsTable } from "./logs-table";

type Tab = "logs" | "activity";
const PARAM_KEYS = ["level", "container", "kind", "method", "status_class", "tenant", "user", "ip", "session", "q"] as const;

export default function AdminLogsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tab = (searchParams.get("tab") as Tab) || "logs";
  const range = (searchParams.get("range") as TimeRange) || "24h";
  const params = useMemo(() => {
    const out: LogsFilters = {};
    for (const key of PARAM_KEYS) {
      const v = searchParams.get(key);
      if (v) out[key] = v;
    }
    return out;
  }, [searchParams]);

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      router.replace(`/admin/logs?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const filters = useMemo<LogsFilters>(() => ({ ...params, since: sinceForRange(range) }), [params, range]);

  const [rows, setRows] = useState<LogRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [facets, setFacets] = useState<Record<string, Facet[]>>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      if (tab === "logs") {
        const [page, f] = await Promise.all([fetchLogs(filters), fetchLogFacets(filters)]);
        setRows(page.results);
        setCursor(page.next_cursor);
        setFacets(f as unknown as Record<string, Facet[]>);
      } else {
        const [page, f] = await Promise.all([fetchActivity(filters), fetchActivityFacets(filters)]);
        setActivity(page.results);
        setCursor(page.next_cursor);
        setFacets(f as unknown as Record<string, Facet[]>);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, [tab, filters]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => void load(), 5000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  const loadMore = async () => {
    if (!cursor) return;
    if (tab === "logs") {
      const page = await fetchLogs(filters, cursor);
      setRows((prev) => [...prev, ...page.results]);
      setCursor(page.next_cursor);
    } else {
      const page = await fetchActivity(filters, cursor);
      setActivity((prev) => [...prev, ...page.results]);
      setCursor(page.next_cursor);
    }
  };

  const onSearch = (value: string) => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => setParam("q", value), 300);
  };

  const switchTab = (next: Tab) => {
    // Keep shared dimensions (tenant/user/range), drop tab-specific ones.
    const keep = new URLSearchParams();
    keep.set("tab", next);
    keep.set("range", range);
    for (const key of ["tenant", "user"]) {
      const v = searchParams.get(key);
      if (v) keep.set(key, v);
    }
    router.replace(`/admin/logs?${keep.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Logs</h1>
          <p className="text-sm text-muted-foreground">Container logs and user activity across the platform.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-refresh 5s
          </label>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex gap-1 border-b">
        {(["logs", "activity"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize ${
              tab === t ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="sticky top-0 z-10 space-y-2 border-b bg-background/95 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Range
            <select
              value={range}
              onChange={(e) => setParam("range", e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-xs text-foreground"
            >
              {TIME_RANGES.map((r) => (
                <option key={r} value={r}>
                  last {r}
                </option>
              ))}
            </select>
          </label>
          <SearchBox
            value={params.q ?? ""}
            onChange={onSearch}
            placeholder={tab === "logs" ? "Search messages…" : "Search paths…"}
          />
          <FacetSelect label="Tenant" facets={facets.tenants ?? []} selected={params.tenant ?? ""} onChange={(v) => setParam("tenant", v)} />
          <UserCombobox facets={facets.users ?? []} selected={params.user ?? ""} onChange={(v) => setParam("user", v)} />
          {params.ip && (
            <button
              onClick={() => setParam("ip", "")}
              className="rounded-full border border-primary bg-primary px-2.5 py-0.5 text-xs text-primary-foreground"
              title="Clear IP filter"
            >
              ip: {params.ip} ✕
            </button>
          )}
        </div>
        {tab === "logs" ? (
          <div className="flex flex-wrap gap-4">
            <FacetChips label="Level" facets={facets.levels ?? []} selected={params.level ?? ""} onChange={(v) => setParam("level", v)} />
            <FacetChips label="Container" facets={facets.containers ?? []} selected={params.container ?? ""} onChange={(v) => setParam("container", v)} />
          </div>
        ) : (
          <div className="flex flex-wrap gap-4">
            <FacetChips label="Kind" facets={facets.kinds ?? []} selected={params.kind ?? ""} onChange={(v) => setParam("kind", v)} />
            <FacetChips label="Method" facets={facets.methods ?? []} selected={params.method ?? ""} onChange={(v) => setParam("method", v)} />
            <FacetChips label="Status" facets={facets.status_classes ?? []} selected={params.status_class ?? ""} onChange={(v) => setParam("status_class", v)} />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : tab === "logs" ? (
        <LogsTable rows={rows} onUserClick={(u) => setParam("user", u)} />
      ) : (
        <ActivityTable
          rows={activity}
          onUserClick={(u) => setParam("user", u)}
          onIpClick={(ip) => setParam("ip", ip)}
          onSessionClick={(s) => setParam("session", s)}
          onViewLogs={(user) => {
            const next = new URLSearchParams({ tab: "logs", range, ...(user ? { user } : {}) });
            router.replace(`/admin/logs?${next.toString()}`, { scroll: false });
          }}
        />
      )}

      {cursor && !loading && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => void loadMore()}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
```

Note: `useSearchParams` inside `/admin/*` is safe — the admin layout is `force-dynamic`. Create `frontend-main/src/app/admin/logs/activity-table.tsx` as a stub so the page compiles before Task 13:

```tsx
// frontend-main/src/app/admin/logs/activity-table.tsx
"use client";

import type { ActivityRow } from "@/lib/platform-logs-api";

export function ActivityTable(_props: {
  rows: ActivityRow[];
  onUserClick: (user: string) => void;
  onIpClick: (ip: string) => void;
  onSessionClick: (session: string) => void;
  onViewLogs: (user: string) => void;
}) {
  return <p className="py-12 text-center text-sm text-muted-foreground">Activity view lands in the next task.</p>;
}
```

- [ ] **Step 5: Nav entry**

In `frontend-main/src/app/admin/admin-shell.tsx`: add `ScrollText` to the lucide-react import, and insert into the `SYSTEM` array before the Health entry:

```tsx
  { label: "Logs", href: "/admin/logs", icon: ScrollText, group: "System" },
```

- [ ] **Step 6: Verify**

Run: `make typecheck` → clean.
With the dev stack up: open `http://localhost/admin/logs` as superadmin (`make seed` creates superusers). Expected: log rows render; clicking the `ERROR` level chip narrows the Container chips to containers that actually have errors; search filters; Load more pages.

- [ ] **Step 7: Commit**

```bash
git add frontend-main/src/lib/platform-logs-api.ts frontend-main/src/app/admin/logs frontend-main/src/app/admin/admin-shell.tsx
git commit -m "feat(logbook): /admin/logs page with dynamic facets (Logs tab)"
```

---

### Task 13: Activity tab — table, session drill-down, cross-links

**Files:**
- Modify: `frontend-main/src/app/admin/logs/activity-table.tsx` (replace stub)

**Interfaces:**
- Consumes: `ActivityRow`, callbacks wired by Task 12 (`onUserClick`, `onSessionClick`, `onViewLogs`).

- [ ] **Step 1: Implement the table**

```tsx
// frontend-main/src/app/admin/logs/activity-table.tsx
"use client";

import type { ActivityRow } from "@/lib/platform-logs-api";

const STATUS_STYLE = (status: number | null) => {
  if (status == null) return "bg-muted text-muted-foreground";
  if (status >= 500) return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
  if (status >= 400) return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
  return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
};

export function ActivityTable({
  rows,
  onUserClick,
  onIpClick,
  onSessionClick,
  onViewLogs,
}: {
  rows: ActivityRow[];
  onUserClick: (user: string) => void;
  onIpClick: (ip: string) => void;
  onSessionClick: (session: string) => void;
  onViewLogs: (user: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">No activity matches the current filters.</p>;
  }
  return (
    <table className="w-full table-fixed text-sm">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="w-40 pb-2 font-medium">Time</th>
          <th className="w-24 pb-2 font-medium">Kind</th>
          <th className="w-48 pb-2 font-medium">Who</th>
          <th className="w-28 pb-2 font-medium">Tenant</th>
          <th className="pb-2 font-medium">Request</th>
          <th className="w-20 pb-2 font-medium">Status</th>
          <th className="w-24 pb-2 font-medium">Session</th>
          <th className="w-20 pb-2 font-medium"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b align-top hover:bg-muted/50">
            <td className="py-2 pr-2 font-mono text-xs text-muted-foreground">
              {new Date(r.ts).toLocaleString(undefined, {
                month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
              })}
            </td>
            <td className="py-2 pr-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.kind === "pageview" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" : "bg-muted text-muted-foreground"}`}>
                {r.kind}
              </span>
            </td>
            <td className="py-2 pr-2 text-xs">
              {r.user_label ? (
                <button className="text-primary underline-offset-2 hover:underline" onClick={() => onUserClick(r.user_label)}>
                  {r.user_label}
                </button>
              ) : r.ip ? (
                <button
                  className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  title="Filter by this IP"
                  onClick={() => onIpClick(r.ip as string)}
                >
                  {r.ip}
                </button>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </td>
            <td className="py-2 pr-2 text-xs">{r.tenant || "—"}</td>
            <td className="py-2 pr-2 font-mono text-xs">
              <span className="block truncate">
                {r.kind === "api" ? `${r.method} ${r.path}` : r.path}
                {r.duration_ms != null && <span className="text-muted-foreground"> · {r.duration_ms}ms</span>}
              </span>
            </td>
            <td className="py-2 pr-2">
              {r.status != null && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE(r.status)}`}>{r.status}</span>
              )}
            </td>
            <td className="py-2 pr-2 text-xs">
              {r.session_id ? (
                <button
                  className="font-mono text-primary underline-offset-2 hover:underline"
                  title={r.session_id}
                  onClick={() => onSessionClick(r.session_id)}
                >
                  {r.session_id.slice(0, 8)}
                </button>
              ) : (
                "—"
              )}
            </td>
            <td className="py-2 text-xs">
              {r.user_label && (
                <button className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" onClick={() => onViewLogs(r.user_label)}>
                  logs →
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Verify in dev**

`make typecheck` → clean. In the browser: Activity tab shows API calls + pageviews from your own browsing; clicking a session id filters to that session's chronological journey; "logs →" jumps to the Logs tab pre-filtered to that user.

- [ ] **Step 3: Commit**

```bash
git add frontend-main/src/app/admin/logs/activity-table.tsx
git commit -m "feat(logbook): activity tab with session drill-down and cross-links"
```

---

### Task 14: e2e spec + impact map + OpenAPI regen + full gates

**Files:**
- Create: `e2e/specs/24-admin-logs.spec.ts`
- Modify: `e2e/impact-map.json`, `frontend-customer/src/types/api-generated.ts` (regenerated)

- [ ] **Step 1: Write the spec**

```typescript
// e2e/specs/24-admin-logs.spec.ts
// Superadmin log viewer: ingest → panel rows, dynamic facet narrowing, and
// the pageview pipeline end-to-end (browser → beacon → Vector-less direct
// ingest is NOT used here — the beacon line rides the real Vector pipeline,
// so assertions poll with generous timeouts).
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { MAIN, superadminContext, TENANT } from "../helpers/auth";
import { REPO_ROOT } from "../helpers/compose";

function ingestToken(): string {
  try {
    const env = fs.readFileSync(path.join(REPO_ROOT, ".env"), "utf8");
    const m = env.match(/^LOGS_INGEST_TOKEN=(.*)$/m);
    if (m && m[1].trim()) return m[1].trim();
  } catch {
    /* fall through */
  }
  return "dev-logs-token";
}

const STAMP = `e2e-logbook-${Date.now()}`;

test("ingest → panel rows with dynamic facets", async ({ browser, request }) => {
  const now = new Date().toISOString();
  const events = [
    {
      timestamp: now,
      container_name: "contentor-django-1",
      stream: "stdout",
      message: `2026-01-01T00:00:00+0000 ERROR   apps.e2e [tenant=demo-yoga] [user=e2e@test.io] ${STAMP} exploded`,
    },
    {
      timestamp: now,
      container_name: "contentor-caddy-dev",
      stream: "stdout",
      message: JSON.stringify({ level: "warn", msg: `${STAMP} upstream slow` }),
    },
  ];
  // The stored ts comes from the envelope `timestamp` (= now), so the rows
  // land inside the panel's default 24h range; the in-line timestamps above
  // are cosmetic.

  const resp = await request.post("http://localhost/api/v1/platform/logs/ingest/", {
    headers: { "X-Logs-Token": ingestToken(), "Content-Type": "application/json" },
    data: events,
  });
  expect(resp.ok()).toBeTruthy();

  const admin = await superadminContext(browser);
  const page = await admin.newPage();
  await page.goto(`${MAIN}/admin/logs`);

  // Search for our stamp — both rows visible.
  await page.getByPlaceholder("Search messages…").fill(STAMP);
  await expect(page.getByText(`${STAMP} exploded`)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(`${STAMP} upstream slow`)).toBeVisible();

  // Dynamic facets: picking ERROR removes caddy (whose only stamped row is a
  // WARNING) from the container chips.
  await page.getByRole("button", { name: /^ERROR \d+$/ }).click();
  await expect(page.getByText(`${STAMP} exploded`)).toBeVisible();
  await expect(page.getByText(`${STAMP} upstream slow`)).not.toBeVisible();
  await expect(page.getByRole("button", { name: /^caddy \d+$/ })).toHaveCount(0, { timeout: 10_000 });

  await admin.close();
});

test("browsing a tenant page produces a pageview with a session", async ({ browser }) => {
  const visitor = await browser.newContext();
  const page = await visitor.newPage();
  await page.goto(`${TENANT}/`);
  await page.waitForTimeout(1500); // beacon fires post-hydration
  await visitor.close();

  const admin = await superadminContext(browser);
  const adminPage = await admin.newPage();
  // The beacon line travels stdout → Vector (2s flush) → ingest; poll the API.
  await expect
    .poll(
      async () => {
        const res = await adminPage.request.get(
          `${MAIN}/api/v1/platform/activity/?kind=pageview&tenant=demo-yoga`,
        );
        if (!res.ok()) return 0;
        const body = await res.json();
        return body.results.filter((r: { session_id: string }) => r.session_id).length;
      },
      { timeout: 30_000, intervals: [2_000] },
    )
    .toBeGreaterThan(0);
  await admin.close();
});
```

- [ ] **Step 2: Register in the impact map**

In `e2e/impact-map.json`: add a `"logbook": ["24-admin-logs"]` key alongside the other backend-app keys, and append `"24-admin-logs"` to the `"frontend-main"` array.

- [ ] **Step 3: Run the spec**

Run: `make e2e-spec SPEC=24-admin-logs`
Expected: 2 passed. (Requires the dev stack up with the vector service from Task 5.)

- [ ] **Step 4: OpenAPI regen + full gates**

```bash
cd frontend-customer && npm run gen:api && cd ..
git diff --stat frontend-customer/src/types/api-generated.ts   # expect only additive /platform/logs|activity|track paths
make lint          # includes the e2e selector self-test — must pass with the new spec mapped
make test          # full backend suite
make test-frontend
make typecheck
```

Expected: all green; the api-generated diff shows only the new endpoints.

- [ ] **Step 5: Commit**

```bash
git add e2e/specs/24-admin-logs.spec.ts e2e/impact-map.json frontend-customer/src/types/api-generated.ts
git commit -m "feat(logbook): e2e coverage for log viewer + pageview pipeline"
```

---

### Task 15: prod rollout artifacts

**Files:**
- Modify: `docker-compose.prod.yml` (vector service), `.env.prod.example` (token key)

- [ ] **Step 1: Prod compose service**

In `docker-compose.prod.yml`, after the `celery-beat` service, add (fleet conventions: container_name, mem cap, log cap, restart policy, internal network):

```yaml
  vector:
    image: timberio/vector:0.46.1-alpine
    container_name: contentor-vector
    restart: unless-stopped
    mem_limit: 128m
    logging: *logging
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./monitoring/vector/vector.yaml:/etc/vector/vector.yaml:ro
      - vector_data:/var/lib/vector
    command: --config /etc/vector/vector.yaml
    environment:
      - LOGS_INGEST_TOKEN=${LOGS_INGEST_TOKEN:?LOGS_INGEST_TOKEN required in .env.prod}
    networks:
      - internal
    depends_on:
      django:
        condition: service_healthy
```

Add `vector_data:` to the prod `volumes:` section.

- [ ] **Step 2: Env template**

In `.env.prod.example`, after the object-storage block:

```bash
# --- Log pipeline (apps.logbook) ---------------------------------------------
# Shared secret between the vector container and Django's ingest endpoint.
# Generate: openssl rand -hex 32
LOGS_INGEST_TOKEN=
```

- [ ] **Step 3: Verify config parses (without deploying)**

Run: `docker compose -f docker-compose.prod.yml config --quiet && echo OK` (with a dummy `LOGS_INGEST_TOKEN=x` env var exported if needed)
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.prod.yml .env.prod.example
git commit -m "feat(logbook): vector service + ingest token in prod stack"
```

- [ ] **Step 5: Deploy checklist (operator runs when ready — NOT part of this task's automation)**

1. Add a real `LOGS_INGEST_TOKEN` (openssl rand -hex 32) to `.env.prod` on the Mac.
2. `make deploy` (runs the backend suite first; entrypoint applies the logbook migration).
3. On the box: `docker logs contentor-vector --tail 20` (no auth errors), then verify rows: `docker exec contentor-django python manage.py shell -c "from apps.logbook.models import LogEntry; print(LogEntry.objects.count())"`.
4. Open `https://contentor.app/admin/logs` — rows visible, facets narrow.
5. Next morning: check `LogArchiveDay` has day-1 rows and the archive objects exist in the Hetzner bucket under `logs/archive/` / `activity/archive/`.
6. Watch RAM: `docker stats --no-stream` — vector should sit well under its 128m cap.

---

## Self-Review Notes (kept for the executor)

- **Spec coverage:** ingest/parsing/floors (T3-T5), user stamping (T2), activity+beacon (T6-T7, T11), retention/archive (T8), panel APIs with faceted semantics (T9-T10), UI (T12-T13), e2e+gates (T14), prod (T15). Spec deviation (documented in T11): frontend-main API calls don't carry X-Session-Id (no central fetch wrapper exists); its page views do.
- **Type consistency:** the model field is `logger_name` everywhere (models, LOG_FIELDS, serializers, LogRow); activity payload keys are the `_request_event()` contract; cursor format `ts.isoformat()|id` produced and parsed only in `panel.py`.
- **Ordering pitfall:** no logbook model defines `Meta.ordering` (facet GROUP BY correctness depends on it).
