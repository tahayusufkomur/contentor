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
