"""Go-live: plan and payouts only when selling, publish, and the free way out."""

from decimal import Decimal
from unittest import mock

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import Tenant
from apps.courses.models import Course
from apps.tenant_config import interview_brief as brief
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db
URL = "/api/v1/admin/setup-flow/golive/"
DONE = {"delegated": [f.id for f in brief.FIELDS]}


@pytest.fixture()
def config(tenant_ctx):
    Tenant.objects.filter(pk=tenant_ctx.pk).update(
        wizard_state={"flow": "interview", "answers": dict(DONE)}, is_published=False
    )
    tenant_ctx.refresh_from_db()
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Glow")
    cfg.setup_flow = {
        "status": "active",
        "interview": {"turns": [], "fired": ["page:home"]},
        "draft_status": {},
        "page_builds": {"home": {"status": "ready"}},
    }
    cfg.setup_progress = {"look_edited": True}
    cfg.save()
    return cfg


@pytest.fixture()
def client(tenant_ctx, config):
    owner = User.objects.create_user(email="o@gl.test", name="O", password="x", role="owner", is_staff=True)  # noqa: S106
    c = APIClient(HTTP_HOST="shared-test.localhost")
    c.force_authenticate(user=owner)
    return c


def _course(paid=True, published=False):
    return Course.objects.create(
        title="Desk Yoga",
        instructor=User.objects.filter(role="owner").first(),
        pricing_type="paid" if paid else "free",
        price=Decimal("49") if paid else 0,
        is_published=published,
    )


def test_free_content_needs_neither_plan_nor_payouts(client):
    _course(paid=False)
    with mock.patch("apps.tenant_config.interview_golive.fire"):
        body = client.get(URL).json()
    assert body["ready"] is True and body["needs_plan"] is False and body["needs_payouts"] is False


def test_paid_course_on_free_plan_needs_plan(client):
    """Review focus 2."""
    _course(paid=True)
    with (
        mock.patch("apps.tenant_config.interview_golive.is_paid_active", return_value=False),
        mock.patch("apps.tenant_config.interview_golive.fire"),
    ):
        body = client.get(URL).json()
    assert body["needs_plan"] is True and body["needs_payouts"] is False


def test_paid_plan_without_stripe_needs_payouts(client):
    _course(paid=True)
    with (
        mock.patch("apps.tenant_config.interview_golive.is_paid_active", return_value=True),
        mock.patch("apps.tenant_config.interview_golive.can_monetize", return_value=False),
        mock.patch("apps.tenant_config.interview_golive.fire"),
    ):
        body = client.get(URL).json()
    assert body["needs_plan"] is False and body["needs_payouts"] is True


def test_building_pages_are_not_ready(client, config):
    config.setup_flow = {**config.setup_flow, "page_builds": {"home": {"status": "building"}}}
    config.save()
    with mock.patch("apps.tenant_config.interview_golive.fire"):
        assert client.get(URL).json()["ready"] is False


def test_make_free_clears_plan_and_payouts_needs(client, tenant_ctx):
    """Review focus 5."""
    _course(paid=True)
    answers = {**DONE, "sells": "paid", "course_price": 49.0, "offers": ["course", "live"]}
    Tenant.objects.filter(pk=tenant_ctx.pk).update(wizard_state={"flow": "interview", "answers": answers})
    with (
        mock.patch("apps.tenant_config.interview_golive.is_paid_active", return_value=False),
        mock.patch("apps.tenant_config.interview_golive.fire"),
    ):
        body = client.post(URL, {"action": "make_free"}, format="json").json()
    assert body["needs_plan"] is False and body["needs_payouts"] is False
    assert Course.objects.get().pricing_type == "free"
    saved = Tenant.objects.get(pk=tenant_ctx.pk).wizard_state["answers"]
    assert saved["sells"] == "free" and saved["offers"] == ["course"]


def test_publish_publishes_the_draft_and_the_site(client, tenant_ctx, config):
    course = _course(paid=False)
    config.setup_flow = {**config.setup_flow, "drafts": {"course": course.id}}
    config.save()
    with mock.patch("apps.tenant_config.interview_golive.fire"):
        resp = client.post(URL, {"action": "publish"}, format="json")
    assert resp.status_code == 200
    assert Course.objects.get().is_published is True
    assert Tenant.objects.get(pk=tenant_ctx.pk).is_published is True
    assert TenantConfig.objects.first().setup_flow["status"] == "done"


def test_publish_blocked_returns_blockers(client):
    with mock.patch("apps.tenant_config.interview_golive.fire"):
        resp = client.post(URL, {"action": "publish"}, format="json")
    assert resp.status_code == 400 and "first_course" in resp.json()["blockers"]


def test_unknown_action_is_400(client):
    assert client.post(URL, {"action": "nope"}, format="json").status_code == 400


def test_blockers_that_go_live_resolves_itself_are_hidden(client, config):
    course = _course(paid=False)
    config.setup_flow = {**config.setup_flow, "drafts": {"course": course.id}}
    config.save()
    with mock.patch("apps.tenant_config.interview_golive.fire"):
        assert "first_course" not in client.get(URL).json()["blockers"]
