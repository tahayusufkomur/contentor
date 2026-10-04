"""Guided onboarding (/setup): step computation, transitions, skip rules, the
finish/publish gate, page-build kickoff, AI drafts and permissions."""

import sys
import types
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.blog.models import BlogPost
from apps.core.models import Tenant
from apps.courses.models import Course
from apps.live.models import LiveClass
from apps.tenant_config import setup_flow
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db

HOST = "shared-test.localhost"
URL = "/api/v1/admin/setup-flow/"
BASE_PAGES = ["page:home", "page:about", "page:courses", "page:faq", "page:contact"]


def _ns(goals=(), live=False):
    return SimpleNamespace(
        wizard_state={"answers": {"goals": list(goals)}},
        platform_subscription=SimpleNamespace(plan=SimpleNamespace(is_live_enabled=live)),
    )


def _ids(tenant, paid=False, paid_content=False):
    with (
        mock.patch("apps.tenant_config.setup_flow.is_paid_active", return_value=paid),
        mock.patch("apps.tenant_config.setup_flow._has_paid_content", return_value=paid_content),
    ):
        return [s["id"] for s in setup_flow.applicable_steps(tenant)]


# ── step computation ─────────────────────────────────────────────────────────


def test_minimal_steps(tenant_ctx):
    assert _ids(_ns()) == ["course", *BASE_PAGES, "launch"]


def test_event_needs_goal_and_live_entitlement(tenant_ctx):
    assert "event" not in _ids(_ns(goals=["run_live_classes"], live=False))
    assert "event" not in _ids(_ns(live=True))
    assert _ids(_ns(goals=["in_person_events"], live=True))[:2] == ["course", "event"]


def test_post_follows_the_blog_goal(tenant_ctx):
    assert _ids(_ns(goals=["write_blog"]))[:2] == ["course", "post"]


def test_pricing_page_only_with_subscription_plans(tenant_ctx):
    from apps.billing.models import SubscriptionPlan

    SubscriptionPlan.objects.create(name="Monthly", price=Decimal("10"))
    ids = _ids(_ns())
    assert ids[ids.index("page:courses") + 1] == "page:pricing"


def test_payouts_shows_whenever_paid_content_exists(tenant_ctx):
    """Paid plan → payouts to connect; free plan → `payouts` blocks publishing,
    so the step must still be there to explain the upgrade."""
    assert "payouts" not in _ids(_ns(), paid=True, paid_content=False)
    assert _ids(_ns(), paid=False, paid_content=True)[-2:] == ["payouts", "launch"]
    assert _ids(_ns(), paid=True, paid_content=True)[-2:] == ["payouts", "launch"]


def test_every_publish_blocker_has_a_step(client, coach, tenant_ctx):
    """A free-plan coach with a paid course: `payouts` blocks publishing and the
    payouts step is listed so the flow can explain it."""
    _set_wizard_state(tenant_ctx, answers={"goals": ["write_blog"]})
    Course.objects.create(
        title="Paid", slug="c-paid", description="d", price=Decimal("20"), pricing_type="paid", instructor=coach
    )
    body = client.get(URL).json()
    ids = {s["id"] for s in body["steps"]}
    fixers = {"first_course": "course", "payouts": "payouts", "first_blog_post": "post", "look": "page:home"}
    assert "payouts" in body["publish_blockers"]
    assert all(fixers[b] in ids for b in body["publish_blockers"])


def test_optional_flags(tenant_ctx):
    with (
        mock.patch("apps.tenant_config.setup_flow.is_paid_active", return_value=True),
        mock.patch("apps.tenant_config.setup_flow._has_paid_content", return_value=True),
    ):
        steps = setup_flow.applicable_steps(_ns(goals=["run_live_classes", "write_blog"], live=True))
    optional = {s["id"] for s in steps if s["optional"]}
    assert optional == {"event", "post", "payouts"}


# ── endpoints ────────────────────────────────────────────────────────────────


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="coach@setup-flow.test",
        name="Coach",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture()
def config(tenant_ctx):
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Glow")
    cfg.setup_flow = {"status": "active", "step": "course", "done": [], "skipped": []}
    cfg.setup_progress = {"look_edited": True}
    cfg.save()
    return cfg


@pytest.fixture()
def client(coach, config):
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=coach)
    return c


@pytest.fixture()
def builds():
    with mock.patch("apps.tenant_config.setup_flow.start_page_build") as start:
        yield start


def _set_wizard_state(tenant, **state):
    Tenant.objects.filter(pk=tenant.pk).update(wizard_state=state)


def _flow():
    return TenantConfig.objects.first().setup_flow


def test_get_returns_the_contract_body(client, tenant_ctx):
    _set_wizard_state(
        tenant_ctx,
        answers={"goals": []},
        site_plan={"course_ideas": ["Morning flow", {"title": "Hip openers"}], "post_ideas": []},
    )
    body = client.get(URL).json()
    assert body["status"] == "active"
    assert body["step"] == "course"
    assert [s["id"] for s in body["steps"]] == ["course", *BASE_PAGES, "launch"]
    course = body["steps"][0]
    assert course | {"subtitle": ""} == {
        "id": "course",
        "kind": "content",
        "title": "Your first course",
        "subtitle": "",
        "optional": False,
        "state": "active",
        "preview_path": None,
    }
    home = body["steps"][1]
    assert home["page_key"] == "home" and home["preview_path"] == "/" and home["state"] == "todo"
    assert body["steps"][-1]["preview_path"] == "/"
    assert body["page_builds"]["home"] == {"status": "idle"}
    assert body["content"] == {"course": None, "event": None, "post": None}
    assert body["suggestions"] == {"course": ["Morning flow", "Hip openers"], "event": [], "post": []}
    assert body["slug"] == "shared-test"
    assert "first_course" in body["publish_blockers"]
    assert body["is_published"] is False
    assert {"style", "brand_name"} <= body.keys()


def test_existing_tenant_without_flow_reads_done(client, config):
    config.setup_flow = {}
    config.save()
    assert client.get(URL).json()["status"] == "done"


def test_complete_course_publishes_the_draft_and_advances(client, coach, config, builds):
    course = Course.objects.create(title="C", slug="c-flow", description="d", price=0, instructor=coach)
    config.setup_flow = {**config.setup_flow, "drafts": {"course": course.id}}
    config.save()
    cache.set("tenant:shared_test:config", "stale")

    body = client.post(URL, {"action": "complete", "step": "course"}, format="json").json()

    course.refresh_from_db()
    assert course.is_published is True
    assert body["step"] == "page:home"
    assert body["steps"][0]["state"] == "done"
    assert body["content"]["course"]["is_published"] is True
    assert "first_course" not in body["publish_blockers"]
    assert cache.get("tenant:shared_test:config") is None
    # Landing on a page step builds it and prefetches the next page step.
    assert [c.args[1] for c in builds.call_args_list] == ["home", "about"]


def test_complete_page_step_marks_page_edited(client, config, builds):
    client.post(URL, {"action": "goto", "step": "page:about"}, format="json")
    body = client.post(URL, {"action": "complete"}, format="json").json()
    assert body["step"] == "page:courses"
    assert "about" in TenantConfig.objects.first().setup_progress["pages_edited"]
    assert "page:about" in _flow()["done"]


def test_complete_home_clears_the_look_blocker(client, config, builds):
    config.setup_progress = {}
    config.save()
    assert "look" in client.get(URL).json()["publish_blockers"]
    body = client.post(URL, {"action": "complete", "step": "page:home"}, format="json").json()
    assert "look" not in body["publish_blockers"]


def test_goto_skips_builds_already_running(client, config, builds):
    config.setup_flow = {**config.setup_flow, "page_builds": {"home": {"status": "building"}}}
    config.save()
    client.post(URL, {"action": "goto", "step": "page:home"}, format="json")
    assert [c.args[1] for c in builds.call_args_list] == ["about"]


def test_goto_content_step_queues_nothing(client, builds):
    assert client.post(URL, {"action": "goto", "step": "launch"}, format="json").json()["step"] == "launch"
    builds.assert_not_called()


def test_get_never_builds(client, config, builds):
    config.setup_flow = {**config.setup_flow, "step": "page:home"}
    config.save()
    client.get(URL)
    builds.assert_not_called()


def test_unknown_step_and_action_are_400(client):
    assert client.post(URL, {"action": "goto", "step": "nope"}, format="json").status_code == 400
    assert client.post(URL, {"action": "dance"}, format="json").status_code == 400


def test_skip_requires_an_optional_step(client, builds):
    resp = client.post(URL, {"action": "skip", "step": "course"}, format="json")
    assert resp.status_code == 400
    assert resp.json()["detail"] == "step_not_optional"


def test_skipping_post_drops_its_publish_blocker(client, tenant_ctx, builds):
    _set_wizard_state(tenant_ctx, answers={"goals": ["write_blog"]})
    assert "first_blog_post" in client.get(URL).json()["publish_blockers"]
    body = client.post(URL, {"action": "skip", "step": "post"}, format="json").json()
    assert body["steps"][1] | {"subtitle": "", "title": ""} == {
        "id": "post",
        "kind": "content",
        "title": "",
        "subtitle": "",
        "optional": True,
        "state": "skipped",
        "preview_path": None,
    }
    assert body["step"] == "page:home"
    assert "first_blog_post" not in body["publish_blockers"]


def test_skipped_event_is_not_a_publish_blocker(config, coach):
    from apps.tenant_config.setup_items import publish_blockers

    Course.objects.create(title="C", slug="c-ev", description="d", price=0, is_published=True, instructor=coach)
    tenant = SimpleNamespace(**vars(_ns(goals=["run_live_classes"], live=True)), template_seed_status="")
    with mock.patch("apps.tenant_config.setup_items.can_monetize", return_value=True):
        assert "first_event" in publish_blockers(config, tenant)
        config.setup_flow = {"skipped": ["event"]}
        assert publish_blockers(config, tenant) == []


def test_finish_with_publish_is_gated(client, tenant_ctx):
    resp = client.post(URL, {"action": "finish", "publish": True}, format="json")
    assert resp.status_code == 400
    assert resp.json()["detail"] == "publish_requirements_unmet"
    assert "first_course" in resp.json()["blockers"]
    assert _flow()["status"] == "active"
    assert Tenant.objects.get(pk=tenant_ctx.pk).is_published is False


def test_finish_publishes_when_ready(client, coach, tenant_ctx):
    Course.objects.create(title="C", slug="c-fin", description="d", price=0, is_published=True, instructor=coach)
    body = client.post(URL, {"action": "finish", "publish": True}, format="json").json()
    assert body["status"] == "done"
    assert body["is_published"] is True
    assert Tenant.objects.get(pk=tenant_ctx.pk).is_published is True
    flow = _flow()
    assert flow["published"] is True and flow["completed_at"]


def test_finish_without_publish_just_ends_the_flow(client, tenant_ctx):
    body = client.post(URL, {"action": "finish"}, format="json").json()
    assert body["status"] == "done"
    assert _flow()["published"] is False
    assert Tenant.objects.get(pk=tenant_ctx.pk).is_published is False


def test_config_serializer_exposes_setup_flow_active(config):
    from apps.tenant_config.serializers import TenantConfigSerializer

    assert TenantConfigSerializer(config).data["setup_flow_active"] is True
    config.setup_flow = {"status": "done"}
    assert TenantConfigSerializer(config).data["setup_flow_active"] is False


# ── build-page ───────────────────────────────────────────────────────────────


def test_build_page_enqueues_and_is_idempotent_while_building(client, config, builds):
    resp = client.post(f"{URL}build-page/", {"page": "faq"}, format="json")
    assert resp.status_code == 202 and resp.json() == {"status": "building"}
    assert builds.call_count == 1

    config.setup_flow = {**config.setup_flow, "page_builds": {"faq": {"status": "building"}}}
    config.save()
    client.post(f"{URL}build-page/", {"page": "faq"}, format="json")
    assert builds.call_count == 1
    client.post(f"{URL}build-page/", {"page": "faq", "force": True}, format="json")
    assert builds.call_count == 2
    assert client.post(f"{URL}build-page/", {"page": "blog"}, format="json").status_code == 400


def test_start_page_build_marks_building_then_enqueues(tenant_ctx):
    composer = types.ModuleType("apps.core.onboarding.site_composer")
    composer.set_build_status = mock.Mock()
    task = mock.Mock()
    with (
        mock.patch.dict(sys.modules, {"apps.core.onboarding.site_composer": composer}),
        mock.patch("apps.core.tasks.compose_page_task", task, create=True),
    ):
        setup_flow.start_page_build(tenant_ctx, "home")
    composer.set_build_status.assert_called_once_with(tenant_ctx, "home", "building")
    task.delay.assert_called_once_with(tenant_ctx.id, "home")


# ── drafts ───────────────────────────────────────────────────────────────────


@pytest.fixture()
def ai():
    """compose available, no cover lookups, structured() returns ``ai.reply``."""
    holder = SimpleNamespace(reply=None, calls=[])

    def fake(**kwargs):
        holder.calls.append(kwargs)
        return holder.reply, Decimal("0.01"), "m"

    with (
        mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.onboarding.ai_compose.record_spend"),
        mock.patch("apps.core.copilot.content._give_cover"),
        mock.patch("apps.core.ai.structured", side_effect=fake),
    ):
        yield holder


def _course_reply(title="Morning Yoga Basics", pricing_type="paid", price=49):
    return setup_flow.CourseDraft(
        title=title,
        description="Gentle mornings.",
        modules=[{"title": f"Week {i}", "lessons": ["Breath", "Flow"]} for i in range(1, 4)],
        pricing_type=pricing_type,
        price=price,
    )


def test_course_draft_is_created_and_redraft_replaces_it(client, ai):
    ai.reply = _course_reply()
    resp = client.post(f"{URL}draft/", {"kind": "course", "prompt": "beginner yoga"}, format="json")
    assert resp.status_code == 201, resp.content
    first = resp.json()
    course = Course.objects.get(pk=first["id"])
    assert first["preview_path"] == f"/courses/{course.slug}" and first["slug"] == course.slug
    # Free plan → free course even though the model said paid.
    assert course.pricing_type == "free" and course.price == 0
    assert course.modules.count() == 3 and course.is_published is False
    call = ai.calls[0]
    assert call["label"] == "contentor:setup-draft"
    assert '"coach_request": "beginner yoga"' in call["user"]
    assert "beginner yoga" not in call["system"]  # coach text never in the cached system prompt

    ai.reply = _course_reply(title="Evening Yoga")
    second = client.post(f"{URL}draft/", {"kind": "course", "prompt": "evenings"}, format="json").json()
    assert not Course.objects.filter(pk=first["id"]).exists()
    assert _flow()["drafts"]["course"] == second["id"]
    assert client.get(URL).json()["content"]["course"]["title"] == "Evening Yoga"


def test_paid_plan_gets_a_paid_course(client, ai):
    ai.reply = _course_reply(price=49)
    with mock.patch("apps.tenant_config.setup_flow.is_paid_active", return_value=True):
        resp = client.post(f"{URL}draft/", {"kind": "course", "prompt": "x"}, format="json")
    course = Course.objects.get(pk=resp.json()["id"])
    assert course.pricing_type == "paid" and course.price == Decimal("49.00")


def test_event_draft_is_at_least_two_days_out(client, ai):
    ai.reply = setup_flow.EventDraft(
        title="Live Q&A", description="Bring questions.", scheduled_at=timezone.now() - timedelta(days=1)
    )
    resp = client.post(f"{URL}draft/", {"kind": "event", "prompt": "a q&a"}, format="json")
    assert resp.status_code == 201, resp.content
    event = LiveClass.objects.get(pk=resp.json()["id"])
    assert event.scheduled_at >= timezone.now() + timedelta(days=2) - timedelta(minutes=1)
    assert resp.json()["preview_path"] == f"/calendar/live_class/{event.id}"
    assert _flow()["drafts"]["event"] == {"kind": "live", "id": event.id}


def test_post_draft(client, ai):
    ai.reply = setup_flow.PostDraft(title="Why I teach", excerpt="A short why.", body_html="<p>Hi.</p>")
    resp = client.post(f"{URL}draft/", {"kind": "post", "prompt": "my why"}, format="json")
    assert resp.status_code == 201, resp.content
    post = BlogPost.objects.get(pk=resp.json()["id"])
    assert post.status == "draft"
    assert resp.json()["preview_path"] == f"/blog/{post.slug}"


def test_draft_unknown_kind_is_400(client, ai):
    assert client.post(f"{URL}draft/", {"kind": "poem", "prompt": "x"}, format="json").status_code == 400


def test_draft_ai_unavailable_is_503(client):
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=False):
        resp = client.post(f"{URL}draft/", {"kind": "course", "prompt": "x"}, format="json")
    assert resp.status_code == 503 and resp.json() == {"detail": "ai_unavailable"}


# ── permissions ──────────────────────────────────────────────────────────────


def test_student_is_forbidden(config):
    student = User.objects.create_user(
        email="student@setup-flow.test",
        name="S",
        password="x",  # noqa: S106
        role="student",
    )
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=student)
    assert c.get(URL).status_code == 403
    assert c.post(f"{URL}draft/", {"kind": "course"}, format="json").status_code == 403


def test_anonymous_is_rejected(config):
    # TenantJWTAuthentication has no authenticate_header, so DRF answers 403.
    assert APIClient(HTTP_HOST=HOST).get(URL).status_code in (401, 403)
