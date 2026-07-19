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
    from apps.accounts.authentication import TenantJWTAuthentication
    from apps.accounts.models import User

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
