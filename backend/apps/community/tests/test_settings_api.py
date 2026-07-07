import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.community.models import CommunitySettings

pytestmark = pytest.mark.django_db(transaction=True)
HOST = "shared-test.localhost"


def make_client(role="student", is_staff=False, email="u@x.com"):
    user = User.objects.create_user(
        email=email, name="U", password="pw123456", role=role, is_staff=is_staff
    )
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=user)
    return c, user


def test_settings_get_default_disabled(tenant_ctx):
    client, _ = make_client()
    resp = client.get("/api/v1/community/settings/")
    assert resp.status_code == 200
    assert resp.json() == {"is_enabled": False, "welcome_message": ""}


def test_settings_patch_requires_moderator(tenant_ctx):
    client, _ = make_client()
    resp = client.patch("/api/v1/community/settings/", {"is_enabled": True}, format="json")
    assert resp.status_code == 403


def test_settings_patch_enables_while_disabled(tenant_ctx):
    client, _ = make_client(role="owner", is_staff=True, email="c@x.com")
    resp = client.patch(
        "/api/v1/community/settings/",
        {"is_enabled": True, "welcome_message": "Welcome!"},
        format="json",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_enabled"] is True
    assert body["welcome_message"] == "Welcome!"
    assert body["notify_on_coach_post"] is True
    assert CommunitySettings.load().is_enabled is True


def test_settings_get_includes_notify_flag_for_moderator(tenant_ctx):
    client, _ = make_client(role="coach", email="co@x.com")
    resp = client.get("/api/v1/community/settings/")
    assert resp.status_code == 200
    assert "notify_on_coach_post" in resp.json()


def test_access_gate_unit(tenant_ctx):
    """get_member_or_deny: disabled→NotFound, banned→PermissionDenied, muted write→PermissionDenied."""
    from django.utils import timezone
    from rest_framework.exceptions import NotFound, PermissionDenied

    from apps.community.access import get_member_or_deny

    class FakeRequest:
        def __init__(self, user):
            self.user = user

    user = User.objects.create_user(email="s@x.com", name="S", password="pw123456")
    with pytest.raises(NotFound):
        get_member_or_deny(FakeRequest(user))

    settings_obj = CommunitySettings.load()
    settings_obj.is_enabled = True
    settings_obj.save()

    member = get_member_or_deny(FakeRequest(user))
    assert member.display_name == "S"

    member.is_banned = True
    member.save()
    with pytest.raises(PermissionDenied):
        get_member_or_deny(FakeRequest(user))

    member.is_banned = False
    member.muted_until = timezone.now() + timezone.timedelta(hours=1)
    member.save()
    assert get_member_or_deny(FakeRequest(user)) is not None  # reads OK
    with pytest.raises(PermissionDenied):
        get_member_or_deny(FakeRequest(user), write=True)
