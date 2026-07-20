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
            ts=BASE + timedelta(seconds=i),
            container=container,
            level=level,
            tenant=tenant,
            user_label=user,
            message=msg,
            line_hash=line_digest(msg + str(i)),
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
        LogEntry.objects.create(
            ts=BASE + timedelta(seconds=i), container="django", level="INFO", message=msg, line_hash=line_digest(msg)
        )
    page1 = client.get("/api/v1/platform/logs/").json()
    assert len(page1["results"]) == 100 and page1["next_cursor"]
    page2 = client.get("/api/v1/platform/logs/", {"cursor": page1["next_cursor"]}).json()
    assert len(page2["results"]) == 50 and page2["next_cursor"] is None
    ids = [r["id"] for r in page1["results"] + page2["results"]]
    assert len(ids) == len(set(ids))


def test_facets_respect_other_filters_but_not_own(client, rows):
    body = client.get("/api/v1/platform/logs/facets/", {"level": "ERROR"}).json()
    containers = {f["value"]: f["count"] for f in body["containers"]}
    assert containers == {"django": 1, "celery-worker": 1}  # caddy vanished (no ERROR rows)
    levels = {f["value"] for f in body["levels"]}
    assert "INFO" in levels  # own dimension NOT self-filtered
    tenants = {f["value"]: f["count"] for f in body["tenants"]}
    assert tenants == {"yoga": 1, "pilates": 1}  # blank tenants omitted


def test_facets_zero_options_omitted(client, rows):
    body = client.get("/api/v1/platform/logs/facets/", {"container": "caddy"}).json()
    assert {f["value"] for f in body["levels"]} == {"WARNING"}
    assert body["users"] == []


def test_invalid_since_or_until_400(client, rows):
    for url in ("/api/v1/platform/logs/", "/api/v1/platform/logs/facets/"):
        resp = client.get(url, {"since": "garbage"})
        assert resp.status_code == 400
        assert resp.json() == {"detail": "invalid 'since' timestamp"}
        resp = client.get(url, {"until": "garbage"})
        assert resp.status_code == 400
        assert resp.json() == {"detail": "invalid 'until' timestamp"}


def test_invalid_cursor_400(client, rows):
    for bad in ("garbage", "2026-01-01T00:00:00+00:00|notanid"):
        resp = client.get("/api/v1/platform/logs/", {"cursor": bad})
        assert resp.status_code == 400
        assert resp.json() == {"detail": "invalid cursor"}


def test_keyset_tiebreak_equal_ts(client, restore_public):
    ids = sorted(
        LogEntry.objects.create(
            ts=BASE, container="django", level="INFO", message=f"same-ts {i}", line_hash=line_digest(f"same-ts {i}")
        ).id
        for i in range(3)
    )
    body = client.get("/api/v1/platform/logs/", {"cursor": f"{BASE.isoformat()}|{ids[1]}"}).json()
    assert [r["id"] for r in body["results"]] == [ids[0]]
    assert body["next_cursor"] is None


def test_multi_filter_tolerates_whitespace(client, rows):
    body = client.get("/api/v1/platform/logs/", {"level": "ERROR, WARNING"}).json()
    assert len(body["results"]) == 3  # rows 1 + 3 (ERROR) and 4 (WARNING)
