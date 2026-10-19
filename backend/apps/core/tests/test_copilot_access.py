"""What the assistant sees of access: each item's ways in plain words, and her subscriptions."""

from decimal import Decimal
from unittest import mock

import pytest

from apps.accounts.models import User
from apps.billing.models import SubscriptionPlan
from apps.billing.ways import set_ways, ways_of
from apps.core.copilot import content, engine
from apps.core.copilot import context as page_context
from apps.courses.models import Course

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def euro(tenant_ctx):
    """The tenant charges in EUR, so prices read "€49"."""
    was = tenant_ctx.billing_currency
    tenant_ctx.billing_currency = "EUR"
    yield
    tenant_ctx.billing_currency = was


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@copilot-access.test", name="Owner", password="secret123", role="owner")


@pytest.fixture()
def course(tenant_ctx, owner):
    return Course.objects.create(
        title="Open Course", slug="open-course", instructor=owner, pricing_type="paid", price=Decimal("49.00")
    )


@pytest.fixture()
def gold(tenant_ctx):
    return SubscriptionPlan.objects.create(name="Gold", price=Decimal("29.00"), currency="EUR")


def _user_turn(tenant, context=None):
    answer = engine.CopilotTurn.model_validate({"kind": "answer", "text": "ok"})
    with mock.patch.object(engine.core_ai, "structured", return_value=(answer, Decimal("0"), "m")) as structured:
        engine.run_turn(tenant, [], [], "hi", None, context)
    return structured.call_args.kwargs["user"]


def test_no_subscriptions_yet(tenant_ctx):
    assert "Subscriptions: (none yet)" in _user_turn(tenant_ctx)


def test_the_user_turn_lists_her_subscriptions(tenant_ctx, course, gold):
    set_ways(course, {"buy": {"price": "49.00", "window": {"closes_after_days": 365}}, "plans": [{"plan_id": gold.pk}]})
    user = _user_turn(tenant_ctx)
    assert "Subscriptions (id | name | price | cycle | on sale | items):" in user
    assert f"  {gold.pk} | Gold | 29.00 | monthly | on sale | 1" in user
    gold.is_active = False
    gold.billing_interval_months = 3
    gold.save()
    assert f"  {gold.pk} | Gold | 29.00 | every 3 months | off sale | 1" in _user_turn(tenant_ctx)


def test_an_open_course_shows_its_ways_in_plain_words(tenant_ctx, course, gold):
    set_ways(course, {"buy": {"price": "49.00", "window": {"closes_after_days": 365}}, "plans": [{"plan_id": gold.pk}]})
    expected = "€49 once with 1 year of access; in Gold."
    context = page_context.clean(tenant_ctx, {"path": f"/admin/courses/{course.slug}"})
    assert f"(draft, access: {expected})" in context["record"]
    assert f"| {expected} |" in engine._courses_digest(tenant_ctx)


def _action(course, ways, reason="Members should get it too."):
    return engine.SetAccessAction(kind="set_access", item_kind="course", item_id=course.pk, ways=ways, reason=reason)


def _ways_with(gold):
    buy = {"price": "49.00", "window": {"closes_after_days": 365}}
    return {"buy": buy, "plans": [{"plan_id": gold.pk, "window": {"opens_after_days": 30}}]}


@pytest.fixture()
def euro_sign():
    """An API request loads the tenant afresh (currency is immutable once set), so pin the sign it prints."""
    with mock.patch("apps.tenant_config.interview_brief.currency_sign", return_value="€"):
        yield


def _api(user):
    from rest_framework.test import APIClient

    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=user)
    return client


def test_a_set_access_card_says_the_setup_and_why(tenant_ctx, course, gold):
    card = engine._card(tenant_ctx, _action(course, _ways_with(gold)))
    assert card["kind"] == "set_access"
    assert card["title"] == "Set access for Open Course"
    assert card["detail"] == "€49 once with 1 year of access; in Gold after 1 month of membership."
    assert card["why"] == "Members should get it too."
    assert ways_of(course)["plans"] == []  # the card writes nothing


def test_a_bundle_card_names_the_bundle(tenant_ctx, owner):
    from apps.billing.models import Bundle

    bundle = Bundle.objects.create(name="Starter Pack", price=Decimal("30.00"))
    action = engine.SetAccessAction(
        kind="set_access",
        item_kind="bundle",
        item_id=bundle.pk,
        ways={"buy": {"price": "59.00", "window": {"closes_after_days": 90}}},
    )
    card = engine._card(tenant_ctx, action)
    assert card["title"] == "Set access for Starter Pack"
    assert card["detail"] == "€59 once with 3 months of access."
    coach = User.objects.create_user(
        email="coach@copilot-access.test", name="Coach", password="secret123", role="coach"
    )
    with pytest.raises(content.ContentOpError, match="owner"):
        engine._card(tenant_ctx, action, actor=coach)


def test_applying_it_sets_the_ways(tenant_ctx, euro_sign, owner, course, gold):
    card = engine._card(tenant_ctx, _action(course, _ways_with(gold)))
    resp = _api(owner).post("/api/v1/admin/copilot/execute/", {"token": card["token"]}, format="json")
    assert resp.status_code == 200, resp.content
    assert resp.json()["result"]["title"] == "Open Course"
    assert resp.json()["result"]["describe"] == card["detail"]
    assert ways_of(Course.objects.get(pk=course.pk))["plans"] == [
        {"plan_id": gold.pk, "window": {"opens_after_days": 30}}
    ]


def test_undo_puts_the_old_ways_back(tenant_ctx, euro_sign, owner, course, gold):
    from apps.tenant_config.models import CopilotAudit

    before = ways_of(course)
    card = engine._card(tenant_ctx, _action(course, _ways_with(gold)))
    client = _api(owner)
    audit_id = client.post("/api/v1/admin/copilot/execute/", {"token": card["token"]}, format="json").json()["audit_id"]
    row = CopilotAudit.objects.get(pk=audit_id)
    assert row.summary == f"Set access for Open Course: {card['detail']}"
    assert row.inverse["kind"] == "restore_ways"
    undo = client.post("/api/v1/admin/copilot/undo/", {"audit_id": audit_id}, format="json")
    assert undo.status_code == 200, undo.content
    assert ways_of(Course.objects.get(pk=course.pk)) == before


def test_a_coach_cannot_change_plans_through_the_assistant(tenant_ctx, course, gold):
    coach = User.objects.create_user(
        email="coach@copilot-access.test", name="Coach", password="secret123", role="coach"
    )
    with pytest.raises(content.ContentOpError, match="owner"):
        engine._card(tenant_ctx, _action(course, _ways_with(gold)), actor=coach)
    # the system (no actor) may
    assert engine._card(tenant_ctx, _action(course, _ways_with(gold)))["kind"] == "set_access"
    # and the turn hands the asker to the card, so she is told why instead
    turn = engine.CopilotTurn(kind="actions", text="Done", actions=[_action(course, _ways_with(gold))])
    with mock.patch.object(engine.core_ai, "structured", return_value=(turn, Decimal("0"), "m")):
        payload, _ = engine.run_turn(tenant_ctx, [], [], "hi", actor=coach)
    assert payload["kind"] == "answer"
    assert "owner" in payload["text"]


def test_a_price_edit_on_a_members_only_course_keeps_its_plans(tenant_ctx, owner, gold):
    members_only = Course.objects.create(
        title="Members Course", slug="members-course", instructor=owner, pricing_type="subscription"
    )
    set_ways(members_only, {"plans": [{"plan_id": gold.pk}]})
    result = content.edit_course(members_only.pk, {"price": 39}, user=owner)
    assert ways_of(Course.objects.get(pk=members_only.pk)) == {
        "free": None,
        "buy": {"price": "39.00", "window": None},
        "plans": [{"plan_id": gold.pk, "window": None}],
    }
    assert result["changes"] == [{"field": "price", "old": "0.00", "new": "39.00"}]
    content.edit_course(members_only.pk, {"price": 0}, user=owner)
    ways = ways_of(Course.objects.get(pk=members_only.pk))
    assert ways["buy"] is None
    assert [p["plan_id"] for p in ways["plans"]] == [gold.pk]


def test_create_course_with_access_sets_the_ways(tenant_ctx, owner, gold):
    access = {"buy": {"price": "49.00", "window": {"closes_after_days": 365}}, "plans": [{"plan_id": gold.pk}]}
    result = content.create_course(owner, {"title": "Fresh Course", "access": access}, cover=False)
    assert ways_of(Course.objects.get(pk=result["id"])) == {
        "free": None,
        "buy": {"price": "49.00", "window": {"closes_after_days": 365}},
        "plans": [{"plan_id": gold.pk, "window": None}],
    }


def test_a_create_card_with_access_says_it_and_carries_it(tenant_ctx, gold):
    from apps.core.copilot import tokens

    access = {"plans": [{"plan_id": gold.pk}]}
    card = engine._card(tenant_ctx, engine.CreateCourseAction(kind="create_course", title="Members", access=access))
    assert card["detail"] == "In Gold."
    assert tokens.take_action(card["token"], tenant_ctx.schema_name)["params"]["access"] == access
    coach = User.objects.create_user(
        email="coach2@copilot-access.test", name="Coach", password="secret123", role="coach"
    )
    with pytest.raises(content.ContentOpError, match="owner"):
        engine._card(tenant_ctx, engine.CreateCourseAction(kind="create_course", title="M", access=access), actor=coach)
