import json
from unittest.mock import patch

import pytest
from pywebpush import WebPushException

from apps.accounts.models import User
from apps.notifications import services
from apps.notifications.models import PushSubscription

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(
        email="student@servicestest.com",
        name="Student",
        password="secret123",
        role="student",
    )


def _make_sub(user, endpoint="https://push/1"):
    return PushSubscription.objects.create(user=user, endpoint=endpoint, p256dh="p", auth="a")


def test_send_success_passes_payload(student):
    sub = _make_sub(student)
    with patch.object(services, "webpush") as mock:
        ok = services.send_to_subscription(sub, {"title": "Hi", "body": "There"})
    assert ok is True
    sent = json.loads(mock.call_args.kwargs["data"])
    assert sent["title"] == "Hi"


def test_send_410_deletes_subscription(student):
    sub = _make_sub(student)

    class _Resp:
        status_code = 410

    with patch.object(
        services,
        "webpush",
        side_effect=WebPushException("gone", response=_Resp()),
    ):
        ok = services.send_to_subscription(sub, {"title": "x"})

    assert ok is False
    assert not PushSubscription.objects.filter(pk=sub.pk).exists()
