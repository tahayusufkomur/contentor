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


def test_activity_logger_pinned_to_info_in_logging_config():
    """Guards against DJANGO_LOG_LEVEL=WARNING silently killing the trail."""
    from django.conf import settings

    logger_cfg = settings.LOGGING["loggers"]["apps.logbook.activity"]
    assert logger_cfg["level"] == "INFO"
    assert logger_cfg["propagate"] is False
