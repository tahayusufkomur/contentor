"""LiveCraft opens a room in the joiner's language: a host's own, everyone else's the site's.

`requests.request` is mocked, so the body Contentor posts to LiveCraft's join API is what is checked.
"""

from unittest.mock import MagicMock, patch

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.live.models import LiveClass, LiveStream
from apps.tenant_config.models import TenantConfig

LIVE = {"LIVECRAFT_FAKE": False, "LIVECRAFT_URL": "http://livecraft:7800", "LIVECRAFT_API_KEY": "k1"}
HOST = "shared-test.localhost"

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def _live(settings, tenant_ctx):
    for name, value in LIVE.items():
        setattr(settings, name, value)
    TenantConfig.objects.all().delete()
    TenantConfig.objects.create(brand_name="Studio", default_locale="tr")


def _join(user, event, path):
    client = APIClient(HTTP_HOST=HOST)
    client.force_authenticate(user=user)
    ok = MagicMock(ok=True, status_code=200, json=lambda: {"join_url": "http://lc/room#token=t"}, text="")
    with patch("apps.live.livecraft.requests.request", return_value=ok) as req:
        response = client.post(f"/api/v1/{path}/{event.pk}/token/")
    assert response.status_code == 200, response.content
    return req.call_args.kwargs["json"]


def _owner(locale):
    return User.objects.create_user(email="owner@join-lang.test", name="Owner", role="owner", preferred_locale=locale)


def _student(locale="en"):
    return User.objects.create_user(email="s@join-lang.test", name="Student", role="student", preferred_locale=locale)


def _class(owner):
    return LiveClass.objects.create(title="C", instructor=owner, status="live", pricing_type="free")


def test_a_student_joins_in_the_sites_language():
    body = _join(_student(), _class(_owner("en")), "live")
    assert body["role"] == "participant"
    assert body["lang"] == "tr"


def test_a_students_own_preference_does_not_override_the_site():
    assert _join(_student("de"), _class(_owner("en")), "live")["lang"] == "tr"


def test_a_host_joins_in_the_creators_language():
    owner = _owner("de")
    body = _join(owner, _class(owner), "live")
    assert body["role"] == "host"
    assert body["lang"] == "de"


def test_a_stream_viewer_gets_the_site_language_and_its_host_the_creators():
    owner = _owner("pl")
    stream = LiveStream.objects.create(title="S", instructor=owner, status="live", pricing_type="free")
    assert _join(_student(), stream, "live-streams")["lang"] == "tr"
    assert _join(owner, stream, "live-streams")["lang"] == "pl"
