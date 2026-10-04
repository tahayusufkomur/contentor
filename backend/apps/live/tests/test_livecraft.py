"""LiveCraft client (real-HTTP mode, requests mocked) and its recording callback."""

import hashlib
import hmac
import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django.db import connection
from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.live import livecraft
from apps.live.models import LiveClass

LIVE = {"LIVECRAFT_FAKE": False, "LIVECRAFT_URL": "http://livecraft:7800/", "LIVECRAFT_API_KEY": "k1"}
USER = SimpleNamespace(id=7, name="Ada", email="ada@example.com")


def _ok(payload=None, status=200):
    return MagicMock(ok=status < 400, status_code=status, json=lambda: payload, text="")


@override_settings(**LIVE)
class ClientTests(SimpleTestCase):
    @patch("apps.live.livecraft.requests.request", return_value=_ok({"join_url": "http://lc/room/r#token=t"}))
    def test_join_sends_identity_role_and_key(self, req):
        assert livecraft.join_url("r", USER, role="participant") == "http://lc/room/r#token=t"
        method, url = req.call_args.args
        assert (method, url) == ("POST", "http://livecraft:7800/api/v1/rooms/r/join")
        assert req.call_args.kwargs["json"] == {"identity": "u7", "name": "Ada", "role": "participant"}
        assert req.call_args.kwargs["headers"] == {"X-API-Key": "k1"}

    @patch("apps.live.livecraft.requests.request", return_value=_ok(status=403))
    def test_blocked_join_raises_with_status(self, _):
        with self.assertRaises(livecraft.LiveCraftError) as ctx:
            livecraft.join_url("r", USER, role="participant")
        assert ctx.exception.status == 403

    @patch("apps.live.livecraft.requests.request", return_value=_ok(status=502))
    def test_end_room_never_raises(self, _):
        livecraft.end_room("r")


@override_settings(LIVECRAFT_FAKE=True)
class FakeTests(SimpleTestCase):
    @patch("apps.live.livecraft.requests.request")
    def test_fake_makes_no_requests(self, req):
        livecraft.create_room("r", title="t", layout="meeting")
        assert livecraft.join_url("r", USER, role="host").endswith("/r/u7/host")
        req.assert_not_called()


def _signed(body: dict, key="k1"):
    raw = json.dumps(body).encode()
    return raw, "sha256=" + hmac.new(key.encode(), raw, hashlib.sha256).hexdigest()


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@livecraft.test", name="Owner", role="owner")


@pytest.mark.django_db(transaction=True)
class TestRecordingCallback:
    @pytest.fixture(autouse=True)
    def _live(self, settings):
        for name, value in LIVE.items():
            setattr(settings, name, value)

    def _post(self, tenant, raw, sig):
        resp = APIClient().post(
            "/api/webhooks/livecraft/", raw, content_type="application/json", HTTP_X_LIVECRAFT_SIGNATURE=sig
        )
        connection.set_tenant(tenant)  # webhook requests run on (and leave us on) public
        return resp

    def test_stores_the_key_on_the_session(self, tenant_ctx, owner):
        lc = LiveClass.objects.create(title="L", instructor=owner, status="live", scheduled_at=timezone.now())
        raw, sig = _signed({"event": "recording.ready", "room": lc.room_name, "key": "recordings/live/x.mp4"})
        assert self._post(tenant_ctx, raw, sig).status_code == 204
        lc.refresh_from_db()
        assert lc.recording_url == "recordings/live/x.mp4"

    def test_rejects_a_bad_signature(self, tenant_ctx, owner):
        lc = LiveClass.objects.create(title="L", instructor=owner, status="live", scheduled_at=timezone.now())
        raw, sig = _signed({"event": "recording.ready", "room": lc.room_name, "key": "k"}, key="wrong")
        assert self._post(tenant_ctx, raw, sig).status_code == 401
        lc.refresh_from_db()
        assert lc.recording_url == ""
