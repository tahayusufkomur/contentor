"""
Unit tests for permission classes in apps.core.permissions.

Pure unit tests — no database access needed. All request/user objects
are mocked.
"""

from unittest.mock import Mock

from apps.core.permissions import IsCoachOrOwner, IsOwner, IsSuperUser


def _make_request(is_authenticated=True, role="student", is_superuser=False):
    """Build a mock request with a mock user."""
    request = Mock()
    user = Mock()
    user.is_authenticated = is_authenticated
    user.role = role
    user.is_superuser = is_superuser
    request.user = user
    return request


# ---------------------------------------------------------------------------
# IsOwner
# ---------------------------------------------------------------------------


class TestIsOwner:
    permission = IsOwner()

    def test_owner_allowed(self):
        request = _make_request(role="owner")
        assert self.permission.has_permission(request, view=None) is True

    def test_coach_denied(self):
        request = _make_request(role="coach")
        assert self.permission.has_permission(request, view=None) is False

    def test_student_denied(self):
        request = _make_request(role="student")
        assert self.permission.has_permission(request, view=None) is False

    def test_unauthenticated_denied(self):
        request = _make_request(is_authenticated=False, role="owner")
        assert self.permission.has_permission(request, view=None) is False


# ---------------------------------------------------------------------------
# IsCoachOrOwner
# ---------------------------------------------------------------------------


class TestIsCoachOrOwner:
    permission = IsCoachOrOwner()

    def test_owner_allowed(self):
        request = _make_request(role="owner")
        assert self.permission.has_permission(request, view=None) is True

    def test_coach_allowed(self):
        request = _make_request(role="coach")
        assert self.permission.has_permission(request, view=None) is True

    def test_student_denied(self):
        request = _make_request(role="student")
        assert self.permission.has_permission(request, view=None) is False

    def test_unauthenticated_denied(self):
        request = _make_request(is_authenticated=False, role="owner")
        assert self.permission.has_permission(request, view=None) is False


# ---------------------------------------------------------------------------
# IsSuperUser
# ---------------------------------------------------------------------------


class TestIsSuperUser:
    permission = IsSuperUser()

    def test_superuser_allowed(self):
        request = _make_request(is_superuser=True)
        assert self.permission.has_permission(request, view=None) is True

    def test_non_superuser_denied(self):
        request = _make_request(is_superuser=False)
        assert self.permission.has_permission(request, view=None) is False

    def test_unauthenticated_denied(self):
        request = _make_request(is_authenticated=False, is_superuser=True)
        assert self.permission.has_permission(request, view=None) is False
