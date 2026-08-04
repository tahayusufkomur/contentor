"""The copilot endpoint pair: converse streams the turn, execute runs exactly
one confirmed action. Coach JWT auth, no metering anywhere."""

import json
from decimal import Decimal
from unittest import mock

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.copilot import tokens as copilot_tokens

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="copilot-coach@x.com",
        name="Coach",
        password="x",
        role="owner",
        is_staff=True,  # noqa: S106
    )


@pytest.fixture()
def client(coach):
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=coach)
    return c


def _frames(resp):
    body = b"".join(resp.streaming_content).decode()
    return [json.loads(line[len("data: ") :]) for line in body.splitlines() if line.startswith("data: ")]


def test_converse_streams_phase_then_done_and_records_spend(client):
    with (
        mock.patch("apps.core.copilot.views.ai_compose.compose_available", return_value=True),
        mock.patch(
            "apps.core.copilot.views.engine.run_turn", return_value=({"kind": "answer", "text": "hi"}, Decimal("0.02"))
        ),
        mock.patch("apps.core.copilot.views.ai_compose.record_spend") as spend,
    ):
        resp = client.post(
            "/api/v1/admin/copilot/converse/",
            {"message": "hello", "transcript": [], "selections": []},
            format="json",
            HTTP_ACCEPT="text/event-stream",
        )
        assert resp.status_code == 200
        frames = _frames(resp)
    assert frames[0] == {"type": "phase", "phase": "thinking"}
    assert frames[-1] == {"type": "done", "kind": "answer", "text": "hi"}
    spend.assert_called_once_with("shared_test", Decimal("0.02"))


def test_converse_refuses_plain_json_when_kill_switch_tripped(client):
    with mock.patch("apps.core.copilot.views.ai_compose.compose_available", return_value=False):
        resp = client.post("/api/v1/admin/copilot/converse/", {"message": "hi"}, format="json")
    assert resp.status_code == 200
    assert resp.json() == {"kind": "unavailable"}


def test_execute_add_block_mutates_pages(client):
    from apps.tenant_config.models import TenantConfig

    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    cfg.pages = {"home": [{"id": "blk_hero", "type": "hero", "enabled": True, "heading": "Hi"}]}
    cfg.save(update_fields=["pages"])
    token = copilot_tokens.stash_action(
        "shared_test",
        {
            "kind": "add_block",
            "page": "home",
            "block": {"id": "blk_new1234", "type": "cta", "enabled": True, "heading": "Join"},
            "after_block_id": "blk_hero",
        },
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    cfg.refresh_from_db()
    assert [b["id"] for b in cfg.pages["home"]] == ["blk_hero", "blk_new1234"]


def test_execute_edit_pages_applies_and_reports_changes(client):
    token = copilot_tokens.stash_action(
        "shared_test", {"kind": "edit_pages", "pages": {"home": []}, "extras": {}, "changes_count": 3}
    )
    with mock.patch("apps.core.copilot.views.site_ai.apply_edit") as apply_edit:
        resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200
    assert resp.json()["result"]["changes_count"] == 3
    apply_edit.assert_called_once()


def test_execute_refuses_replay_and_garbage(client):
    token = copilot_tokens.stash_action("shared_test", {"kind": "remove_block", "page": "home", "block_id": "blk_x"})
    copilot_tokens.take_action(token, "shared_test")  # consume
    assert client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json").status_code == 403
    assert client.post("/api/v1/admin/copilot/execute/", {"token": "junk"}, format="json").status_code == 403


def test_endpoints_reject_anonymous_callers(tenant_ctx):
    anon = APIClient(HTTP_HOST=HOST)
    assert anon.post("/api/v1/admin/copilot/converse/", {}, format="json").status_code in (401, 403)
    assert anon.post("/api/v1/admin/copilot/execute/", {}, format="json").status_code in (401, 403)
