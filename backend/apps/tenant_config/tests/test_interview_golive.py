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


def test_make_free_clears_plan_and_payouts_needs(client, tenant_ctx, config):
    """Review focus 5."""
    draft = _course(paid=True)
    config.setup_flow = {**config.setup_flow, "drafts": {"course": draft.id}}
    config.save()
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
    assert saved["sells"] == "free" and saved["offers"] == ["course"]  # live dropped, the course stays


def _make_free(client, tenant_ctx, **answers):
    Tenant.objects.filter(pk=tenant_ctx.pk).update(
        wizard_state={"flow": "interview", "answers": {**DONE, "sells": "paid", **answers}}
    )
    with (
        mock.patch("apps.tenant_config.interview_golive.is_paid_active", return_value=False),
        mock.patch("apps.tenant_config.interview_golive.fire"),
    ):
        client.post(URL, {"action": "make_free"}, format="json")
    return Tenant.objects.get(pk=tenant_ctx.pk).wizard_state["answers"]


def test_making_it_free_never_invents_an_offer(client, tenant_ctx, config):
    """A live-only coach who declines the plan was given courses she never offered."""
    assert _make_free(client, tenant_ctx, offers=["live", "community"])["offers"] == ["community"]
    # Nothing left to offer: the site goes live with its pages.
    saved = _make_free(client, tenant_ctx, offers=["live"])
    assert saved["offers"] == [] and not brief.missing(saved)


def test_go_live_says_what_making_it_free_will_change(client, tenant_ctx, config):
    """Audit R6: it switched off memberships and dropped live classes without a word."""
    from apps.billing.models import SubscriptionPlan

    draft = _course(paid=True)
    plan = SubscriptionPlan.objects.create(name="Online membership", price=Decimal("19"), billing_interval_months=1)
    config.setup_flow = {**config.setup_flow, "drafts": {"course": draft.id, "plans": {"online": plan.pk}}}
    config.save()
    answers = {**DONE, "sells": "paid", "offers": ["course", "live"]}
    Tenant.objects.filter(pk=tenant_ctx.pk).update(wizard_state={"flow": "interview", "answers": answers})
    with (
        mock.patch("apps.tenant_config.interview_golive.is_paid_active", return_value=False),
        mock.patch("apps.tenant_config.interview_golive.fire"),
    ):
        effects = " ".join(client.get(URL).json()["free_effects"])
    assert "Desk Yoga" in effects and "free" in effects
    assert "Online membership" in effects and "switched off" in effects
    assert "Live classes" in effects
    assert SubscriptionPlan.objects.get().is_active  # reading it changes nothing


def test_go_live_lists_the_steps_left_and_what_was_built(client, tenant_ctx, config):
    """Audit P2: plan, payouts and publish appeared one card at a time, with no summary."""
    from apps.billing.models import SubscriptionPlan

    plan = SubscriptionPlan.objects.create(name="Online membership", price=Decimal("19"), billing_interval_months=1)
    config.setup_flow = {**config.setup_flow, "drafts": {"plans": {"online": plan.pk}}}
    config.save()
    answers = {
        **DONE,
        "sells": "paid",
        "offers": ["live", "onsite"],
        "live_when": "Tuesdays at 7:00 PM",
        "onsite_when": "Saturdays at 10:00 AM",
    }
    Tenant.objects.filter(pk=tenant_ctx.pk).update(wizard_state={"flow": "interview", "answers": answers})
    with (
        mock.patch("apps.tenant_config.interview_golive.is_paid_active", return_value=False),
        mock.patch("apps.tenant_config.interview_golive.fire"),
    ):
        body = client.get(URL).json()
    assert [s["id"] for s in body["steps"]] == ["plan", "payouts", "publish"]
    assert all(s["minutes"] for s in body["steps"])
    summary = {line["label"]: line["value"] for line in body["summary"]}
    assert "Online membership" in summary["Memberships"] and "Tuesdays at 7:00 PM" in summary["Online classes"]
    assert "Saturdays at 10:00 AM" in summary["In-person events"]
    assert summary["Pages"].startswith("Home")


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


def test_selling_coach_on_free_plan_is_offered_the_plan(client, tenant_ctx):
    """Review finding 3: selling is known from the brief, even before a paid
    course exists."""
    Tenant.objects.filter(pk=tenant_ctx.pk).update(
        wizard_state={"flow": "interview", "answers": {**DONE, "sells": "paid"}}
    )
    _course(paid=False)
    with (
        mock.patch("apps.tenant_config.interview_golive.is_paid_active", return_value=False),
        mock.patch("apps.tenant_config.interview_golive.fire"),
    ):
        assert client.get(URL).json()["needs_plan"] is True


def test_make_free_only_touches_the_interviews_draft(client, config):
    """Review finding 8: other paid courses are not the interview's to change."""
    draft = _course(paid=True)
    other = _course(paid=True)
    config.setup_flow = {**config.setup_flow, "drafts": {"course": draft.id}}
    config.save()
    with (
        mock.patch("apps.tenant_config.interview_golive.is_paid_active", return_value=False),
        mock.patch("apps.tenant_config.interview_golive.fire"),
    ):
        client.post(URL, {"action": "make_free"}, format="json")
    assert Course.objects.get(pk=draft.pk).pricing_type == "free"
    assert Course.objects.get(pk=other.pk).pricing_type == "paid"


def test_finished_setup_refuses_interview_endpoints(client, config):
    config.setup_flow = {**config.setup_flow, "status": "done"}
    config.save()
    assert client.post(URL, {"action": "make_free"}, format="json").status_code == 409
    assert client.post("/api/v1/admin/setup-flow/turn/", {"message": "hi"}, format="json").status_code == 409


def test_paid_choices_show_the_plan_before_go_live(tenant_ctx, config):
    """Audit Top 3: the $19.90 plan first appeared at go-live."""
    from apps.core.models import PlatformPlan
    from apps.tenant_config import interview_golive

    PlatformPlan.objects.update(is_active=False)
    PlatformPlan.objects.create(
        name="audit-starter", price_monthly="19.90", transaction_fee_pct="0", prices={"USD": {"amount_cents": 1990}}
    )
    with mock.patch("apps.tenant_config.interview_golive.is_paid_active", return_value=False):
        badge = interview_golive.plan_badge(tenant_ctx, "payments")
    assert badge["name"] == "audit-starter" and badge["amount_cents"] == 1990 and badge["currency"] == "USD"
    assert "Monthly membership" in badge["options"] and "Free for now" not in badge["options"]
    # Review focus 4: a coach on a paid plan sees no badge.
    with mock.patch("apps.tenant_config.interview_golive.is_paid_active", return_value=True):
        assert interview_golive.plan_badge(tenant_ctx, "payments") is None
    assert interview_golive.plan_badge(tenant_ctx, "audience") is None
    # The badge labels are the tiles' own labels.
    for field_id, labels in interview_golive.PLAN_CHOICES.items():
        assert set(labels) <= set(brief.FIELD_BY_ID[field_id].options)


def test_a_coach_who_offers_no_course_is_not_blocked_by_a_first_course(client, tenant_ctx):
    """Audit R5: "Publish your first course" stood between a live-only coach and going live."""
    state = tenant_ctx.wizard_state
    Tenant.objects.filter(pk=tenant_ctx.pk).update(
        wizard_state={**state, "answers": {**state["answers"], "offers": ["live", "community"]}}
    )
    with mock.patch("apps.tenant_config.interview_golive.fire"):
        assert "first_course" not in client.get(URL).json()["blockers"]


def _sell_later(client, tenant_ctx, config, *, paid=False, monetize=False):
    """A selling coach with a paid course, a membership and a drafted class takes "go live now, sell later"."""
    from apps.billing.models import SubscriptionPlan
    from apps.live.models import LiveClass

    course = _course(paid=True)
    plan = SubscriptionPlan.objects.create(name="Online membership", price=Decimal("19"), billing_interval_months=1)
    owner = User.objects.filter(role="owner").first()
    live = LiveClass.objects.create(title="Desk Flow", instructor=owner, status="scheduled")
    config.setup_flow = {
        **config.setup_flow,
        "drafts": {"course": course.id, "plans": {"online": plan.pk}, "event": {"id": live.id, "kind": "live"}},
    }
    config.save()
    answers = {**DONE, "sells": "paid", "course_price": 49.0, "offers": ["course", "live"]}
    Tenant.objects.filter(pk=tenant_ctx.pk).update(wizard_state={"flow": "interview", "answers": answers})
    with (
        mock.patch("apps.tenant_config.interview_golive.is_paid_active", return_value=paid),
        mock.patch("apps.tenant_config.interview_golive.can_monetize", return_value=monetize),
        mock.patch("apps.tenant_config.interview_golive.fire"),
    ):
        body = client.post(URL, {"action": "sell_later"}, format="json").json()
    return body, course, plan, live


def test_sell_later_goes_live_with_paid_items_held_and_prices_kept(client, tenant_ctx, config):
    """Publish now, sell later: making it free threw her prices away."""
    body, course, plan, live = _sell_later(client, tenant_ctx, config)
    assert body["needs_plan"] is False and body["needs_payouts"] is False
    assert [s["id"] for s in body["steps"]] == ["publish"]
    held = " ".join(body["held"])
    assert "Desk Yoga" in held and "Online membership" in held and "classes" in held
    course.refresh_from_db(), plan.refresh_from_db(), live.refresh_from_db()
    assert (course.pricing_type, course.is_published) == ("paid", False)
    assert plan.is_active is False and live.status == "draft"
    assert Tenant.objects.get(pk=tenant_ctx.pk).wizard_state["answers"]["course_price"] == 49.0

    with mock.patch("apps.tenant_config.interview_golive.fire"):
        resp = client.post(URL, {"action": "publish"}, format="json")
    assert resp.status_code == 200, resp.json()  # a held paid course blocks neither first_course nor payouts
    assert Tenant.objects.get(pk=tenant_ctx.pk).is_published is True
    course.refresh_from_db()
    assert course.is_published is False


def test_held_items_go_on_sale_once_she_can_take_payments(client, tenant_ctx, config):
    _, course, plan, live = _sell_later(client, tenant_ctx, config)
    status_url = "/api/v1/admin/setup-status/"
    with mock.patch("apps.tenant_config.interview_golive.can_monetize", return_value=False):
        keys = [i["key"] for i in client.get(status_url).json()["items"]]
    assert "start_selling" in keys
    course.refresh_from_db()
    assert course.is_published is False  # not yet: no payouts

    with (
        mock.patch("apps.tenant_config.interview_golive.can_monetize", return_value=True),
        mock.patch("apps.tenant_config.interview_golive._live_entitled", return_value=True),
    ):
        keys = [i["key"] for i in client.get(status_url).json()["items"]]
    assert "start_selling" not in keys
    course.refresh_from_db(), plan.refresh_from_db(), live.refresh_from_db()
    assert course.is_published is True and plan.is_active is True and live.status == "scheduled"
    assert "held" not in TenantConfig.objects.first().setup_flow


def test_what_is_held_follows_the_drafts_as_they_are_when_she_goes_live(client, tenant_ctx, config):
    """A redraft after "sell later" replaced the held course: the coach was stuck
    at go-live (payouts blocked publish, and no way out was offered)."""
    from apps.billing.models import SubscriptionPlan
    from apps.live.models import LiveClass

    _, course, plan, live = _sell_later(client, tenant_ctx, config)
    # A second click (another tab) keeps the class's own status to go back to.
    with mock.patch("apps.tenant_config.interview_golive.fire"):
        client.post(URL, {"action": "sell_later"}, format="json")
    # She went back and redrafted: a new paid course, a new scheduled class,
    # and a membership added since.
    new_course = _course(paid=True)
    owner = User.objects.filter(role="owner").first()
    new_live = LiveClass.objects.create(title="Desk Flow II", instructor=owner, status="scheduled")
    extra = SubscriptionPlan.objects.create(name="Community membership", price=Decimal("5"), billing_interval_months=1)
    course.delete(), live.delete()
    config.refresh_from_db()
    drafts = config.setup_flow["drafts"]
    drafts.update(course=new_course.id, event={"id": new_live.id, "kind": "live"})
    drafts["plans"] = {"online": plan.pk, "community": extra.pk}
    config.save()
    with mock.patch("apps.tenant_config.interview_golive.fire"):
        body = client.get(URL).json()
        assert "Desk Yoga" in " ".join(body["held"])
        resp = client.post(URL, {"action": "publish"}, format="json")
    assert resp.status_code == 200, resp.json()
    new_course.refresh_from_db(), new_live.refresh_from_db(), extra.refresh_from_db()
    assert new_course.is_published is False and new_live.status == "draft" and extra.is_active is False

    with (
        mock.patch("apps.tenant_config.interview_golive.can_monetize", return_value=True),
        mock.patch("apps.tenant_config.interview_golive._live_entitled", return_value=True),
    ):
        client.get("/api/v1/admin/setup-status/")
    new_course.refresh_from_db(), new_live.refresh_from_db(), extra.refresh_from_db()
    assert new_course.is_published is True and extra.is_active is True
    assert new_live.status == "scheduled"  # not "draft": the second click didn't overwrite it
