import re

import pytest
from django.core.cache import cache
from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts import login_code
from apps.core.models import DevOutboundEmail

# Shared-test domain/host from conftest — tenant middleware resolves to shared_test schema.
_HOST = "shared-test.localhost"


class LoginCodeTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_issue_returns_6_digits_and_check_consumes(self):
        code = login_code.issue("t1", "a@example.com")
        assert code and len(code) == 6 and code.isdigit()
        assert login_code.check("t1", "a@example.com", code) is True
        # single-use: second check fails
        assert login_code.check("t1", "a@example.com", code) is False

    def test_wrong_code_five_attempts_then_locked(self):
        code = login_code.issue("t1", "a@example.com")
        for _ in range(5):
            assert login_code.check("t1", "a@example.com", "000000") is False
        # even the right code is now dead (key deleted on 5th failure)
        assert login_code.check("t1", "a@example.com", code) is False

    def test_new_request_overwrites_old_code(self):
        old = login_code.issue("t1", "a@example.com")
        new = login_code.issue("t1", "a@example.com")
        assert login_code.check("t1", "a@example.com", old) is False or old == new
        # old attempt consumed nothing; new still works if codes differ
        if old != new:
            assert login_code.check("t1", "a@example.com", new) is True

    def test_tenant_scoping(self):
        code = login_code.issue("t1", "a@example.com")
        assert login_code.check("OTHER", "a@example.com", code) is False


@pytest.mark.django_db
@override_settings(EMAIL_SINK_ENABLED=True)
def test_magic_link_email_contains_code(shared_tenant):
    """Magic-link email for a non-demo tenant must include the 6-digit code."""
    res = APIClient().post(
        "/api/v1/auth/magic-link/",
        {"email": "pin@example.com"},
        format="json",
        HTTP_HOST=_HOST,
    )
    assert res.status_code == 200, res.content
    row = DevOutboundEmail.objects.filter(to="pin@example.com").first()
    assert row and re.search(r"\d{3} \d{3}", row.html)
