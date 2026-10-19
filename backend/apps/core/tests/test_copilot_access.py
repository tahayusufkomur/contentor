"""What the assistant sees of access: each item's ways in plain words, and her subscriptions."""

from decimal import Decimal
from unittest import mock

import pytest

from apps.accounts.models import User
from apps.billing.models import SubscriptionPlan
from apps.billing.ways import set_ways
from apps.core.copilot import context as page_context
from apps.core.copilot import engine
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
