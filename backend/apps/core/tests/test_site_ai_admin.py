"""The admin Site AI trio: coach-JWT auth, monthly quota enforcement, and a
soft 402 that never blocks manual editing."""

from unittest import mock

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="siteai-coach@x.com",
        name="Coach",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture()
def client(coach):
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=coach)
    return c


def test_status_reports_availability(client):
    with mock.patch(
        "apps.core.site_ai_admin.site_ai.availability",
        return_value={"enabled": True, "remaining": 2, "limit": 3, "reason": None},
    ):
        resp = client.get("/api/v1/admin/site-ai/status/")
    assert resp.status_code == 200
    assert resp.json()["remaining"] == 2


def test_apply_consumes_one_unit_and_reports_remaining(client):
    with (
        mock.patch(
            "apps.core.site_ai_admin.site_ai.availability",
            return_value={"enabled": True, "remaining": 3, "limit": 3, "reason": None},
        ),
        mock.patch("apps.core.site_ai_admin.site_ai.apply_edit") as apply_edit,
        mock.patch("apps.core.site_ai_admin.site_ai.record_update") as record_update,
    ):
        resp = client.post(
            "/api/v1/admin/site-ai/apply/",
            {"pages": {"home": {"blocks": []}}},
            format="json",
        )
    assert resp.status_code == 200
    assert resp.json()["remaining"] == 2  # 3 - 1
    apply_edit.assert_called_once()
    record_update.assert_called_once()


def test_apply_is_refused_when_no_allowance_remains(client):
    with (
        mock.patch(
            "apps.core.site_ai_admin.site_ai.availability",
            return_value={"enabled": False, "remaining": 0, "limit": 0, "reason": "upgrade_required"},
        ),
        mock.patch("apps.core.site_ai_admin.site_ai.apply_edit") as apply_edit,
        mock.patch("apps.core.site_ai_admin.site_ai.record_update") as record_update,
    ):
        resp = client.post(
            "/api/v1/admin/site-ai/apply/",
            {"pages": {"home": {"blocks": []}}},
            format="json",
        )
    assert resp.status_code == 402
    assert resp.json()["reason"] == "upgrade_required"
    apply_edit.assert_not_called()  # nothing is persisted when refused
    record_update.assert_not_called()  # and no credit is spent either


def test_endpoints_reject_anonymous_callers(tenant_ctx):
    # tenant_ctx (not just django_db) is required here even though this
    # request carries no auth: HeaderAwareTenantMiddleware resolves the tenant
    # from the Host header via a Domain row *before* any view or permission
    # class runs, and neither SHOW_PUBLIC_IF_NO_TENANT_FOUND nor
    # DEFAULT_NOT_FOUND_TENANT_VIEW is set — so without it, an unresolved
    # Host 404s at the middleware (django_tenants.TenantMainMiddleware
    # .no_tenant_found) rather than exercising IsCoachOrOwner at all. Mirrors
    # apps/live/tests/test_content_calendar.py::test_anonymous_denied.
    anon = APIClient(HTTP_HOST=HOST)
    assert anon.get("/api/v1/admin/site-ai/status/").status_code in (401, 403)
    assert anon.post("/api/v1/admin/site-ai/apply/", {}, format="json").status_code in (401, 403)


def test_preview_done_frame_carries_a_change_summary(client, tenant_ctx):
    """The done frame includes field-level `changes` (diffed against the
    tenant's CURRENT pages) so the panel can show before → after rows
    instead of asking for a blind Apply."""
    import json
    from decimal import Decimal

    from apps.tenant_config.models import TenantConfig

    old = {"home": [{"id": "blk_hero", "type": "hero", "heading": "Old headline"}]}
    new = {"home": [{"id": "blk_hero", "type": "hero", "heading": "New headline"}]}
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    cfg.pages = old
    cfg.save(update_fields=["pages"])

    with (
        mock.patch("apps.core.site_ai_admin.ai_compose.compose_available", return_value=True),
        mock.patch(
            "apps.core.site_ai_admin.site_ai.preview_edit",
            return_value=(new, {}, Decimal("0")),
        ),
    ):
        resp = client.post(
            "/api/v1/admin/site-ai/preview/",
            {"instruction": "warmer"},
            format="json",
            HTTP_ACCEPT="text/event-stream",
        )
        assert resp.status_code == 200
        body = b"".join(resp.streaming_content).decode()
    frames = [json.loads(line[len("data: ") :]) for line in body.splitlines() if line.startswith("data: ")]
    assert frames[-1]["type"] == "done"
    assert frames[-1]["pages"] == new
    assert frames[-1]["changes"] == [
        {"page": "home", "block_type": "hero", "field": "heading", "old": "Old headline", "new": "New headline"}
    ]
