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
        defaults = {
            "ts": BASE + timedelta(seconds=i),
            "kind": "api",
            "path": f"/p/{i}",
            "line_hash": line_digest(str(i)),
        }
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


def test_activity_requires_superuser(restore_public):
    coach = User.objects.create(email="act-coach@x.io", region="global", role="owner")
    c = APIClient(HTTP_HOST="shared-test.localhost")
    c.force_authenticate(user=coach)
    assert c.get("/api/v1/platform/activity/").status_code == 403
    assert c.get("/api/v1/platform/activity/facets/").status_code == 403


def test_invalid_status_class_400(client, rows):
    for url in ("/api/v1/platform/activity/", "/api/v1/platform/activity/facets/"):
        resp = client.get(url, {"status_class": "bogus"})
        assert resp.status_code == 400
        assert resp.json() == {"detail": "invalid 'status_class' value"}
        # one bad value poisons the whole param even when mixed with valid ones
        assert client.get(url, {"status_class": "2xx,bogus"}).status_code == 400


def test_invalid_ip_400(client, rows):
    for url in ("/api/v1/platform/activity/", "/api/v1/platform/activity/facets/"):
        resp = client.get(url, {"ip": "not-an-ip"})
        assert resp.status_code == 400
        assert resp.json() == {"detail": "invalid 'ip' address"}
    # a well-formed ip still filters normally (no rows carry one → empty page)
    ok = client.get("/api/v1/platform/activity/", {"ip": "203.0.113.9"})
    assert ok.status_code == 200
    assert ok.json()["results"] == []
