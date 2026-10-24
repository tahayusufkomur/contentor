"""Storage for access windows: one window per way on an item, window fields on plan links."""

from decimal import Decimal

import pytest
from django.contrib.contenttypes.models import ContentType
from django.db import IntegrityError, transaction

from apps.accounts.models import User
from apps.billing.models import AccessWindow, SubscriptionPlan, SubscriptionPlanAccess
from apps.courses.models import Course
from apps.live.models import LiveStream

pytestmark = pytest.mark.django_db(transaction=True)


def ct(obj):
    return ContentType.objects.get_for_model(obj)


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@ways.test", name="Owner", password="secret123", role="owner")


@pytest.fixture()
def course(tenant_ctx, owner):
    return Course.objects.create(
        title="Ways Course", slug="ways-course", instructor=owner, pricing_type="paid", price=Decimal("50.00")
    )


@pytest.fixture()
def plan(tenant_ctx):
    return SubscriptionPlan.objects.create(name="Basic", price=Decimal("29.99"), currency="USD")


def test_an_item_has_at_most_one_window_per_way(tenant_ctx, course):
    AccessWindow.objects.create(content_type=ct(course), object_id=course.pk, way="buy", closes_after_days=365)
    with pytest.raises(IntegrityError), transaction.atomic():
        AccessWindow.objects.create(content_type=ct(course), object_id=course.pk, way="buy")
    # A different way on the same item is a separate window.
    AccessWindow.objects.create(content_type=ct(course), object_id=course.pk, way="free")


def test_plan_links_and_purchases_carry_window_fields(tenant_ctx, course, plan):
    link = SubscriptionPlanAccess.objects.create(
        plan=plan, content_type=ct(course), object_id=course.pk, opens_after_days=30
    )
    assert link.closes_on is None and link.opens_after_days == 30


def test_a_live_stream_can_be_members_only(tenant_ctx, owner):
    stream = LiveStream.objects.create(title="S", instructor=owner, pricing_type="subscription")
    stream.full_clean(exclude=["room_name"])
