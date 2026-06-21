from unittest.mock import patch

import pytest

from apps.accounts.models import User
from apps.notifications.audience import audience_counts, resolve_audience
from apps.notifications.models import PushSubscription

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def students(tenant_ctx):
    pwa_ios = User.objects.create_user(
        email="a@m.com",
        name="A",
        password="x",  # noqa: S106
        role="student",
        last_display_mode="pwa",
        last_platform="ios",
    )
    web_android = User.objects.create_user(
        email="b@m.com",
        name="B",
        password="x",  # noqa: S106
        role="student",
        last_display_mode="browser",
        last_platform="android",
    )
    PushSubscription.objects.create(user=pwa_ios, endpoint="https://p/1", p256dh="p", auth="a")
    return pwa_ios, web_android


def test_empty_filters_returns_all_students(students):
    assert resolve_audience({}).count() == 2


def test_app_type_filter(students):
    pwa_ios, _ = students
    qs = resolve_audience({"app_type": "pwa"})
    assert list(qs.values_list("id", flat=True)) == [pwa_ios.id]


def test_platform_filter_multi(students):
    qs = resolve_audience({"platform": ["ios", "desktop"]})
    assert qs.count() == 1


def test_push_enabled_filter(students):
    pwa_ios, _ = students
    qs = resolve_audience({"push_enabled": True})
    assert list(qs.values_list("id", flat=True)) == [pwa_ios.id]


def test_counts(students):
    counts = audience_counts({})
    assert counts == {"audience": 2, "push_reachable": 1}


def test_content_access_filter(tenant_ctx):
    """resolve_audience with content_type/content_id only returns students
    for whom ContentAccessService.check_access returns True."""
    allowed = User.objects.create_user(email="allowed@m.com", name="A", password="x", role="student")  # noqa: S106
    denied = User.objects.create_user(email="denied@m.com", name="D", password="x", role="student")  # noqa: S106

    # Stub content object — just needs to be truthy; _load_content is also patched.
    fake_content = object()

    def _fake_load(content_type, content_id):
        return fake_content

    def _fake_check_access(user, content):
        return user.email == "allowed@m.com"

    with (
        patch("apps.notifications.audience._load_content", side_effect=_fake_load),
        patch("apps.core.access.ContentAccessService.check_access", side_effect=_fake_check_access),
    ):
        qs = resolve_audience({"content_type": "course", "content_id": 1})

    ids = list(qs.values_list("id", flat=True))
    assert allowed.id in ids
    assert denied.id not in ids
