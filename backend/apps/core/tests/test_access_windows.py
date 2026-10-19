"""The paywall honours each way's window: purchases keep their stamps, plans and free are live."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

import pytest
from django.contrib.auth.models import AnonymousUser
from django.contrib.contenttypes.models import ContentType
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.accounts.models import User
from apps.billing.models import (
    AccessWindow,
    Bundle,
    BundleItem,
    Payment,
    PaymentItem,
    Subscription,
    SubscriptionPlan,
    SubscriptionPlanAccess,
)
from apps.billing.ways import set_ways
from apps.core.access import ContentAccessService
from apps.courses.models import Course, Enrollment
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)

NOW = datetime(2026, 10, 19, 12, 0, tzinfo=UTC)


@pytest.fixture()
def service():
    return ContentAccessService()


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@win.test", name="Owner", password="secret123", role="owner")


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(email="student@win.test", name="Student", password="secret123", role="student")


@pytest.fixture()
def course(tenant_ctx, owner):
    return Course.objects.create(
        title="Window Course", slug="window-course", instructor=owner, pricing_type="paid", price=Decimal("49.00")
    )


@pytest.fixture()
def gold(tenant_ctx):
    return SubscriptionPlan.objects.create(name="Gold", price=Decimal("29.00"), currency="EUR")


@pytest.fixture()
def zone(tenant_ctx):
    """Set the creator's time zone for the test and put it back after."""
    config = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Windows")
    was = config.timezone

    def use(name):
        config.timezone = name
        config.save(update_fields=["timezone"])

    yield use
    config.timezone = was
    config.save(update_fields=["timezone"])


def at(moment):
    return mock.patch("django.utils.timezone.now", return_value=moment)


def joined(student, when):
    """date_joined is auto_now_add: set it after creating, and hand back a fresh user."""
    User.objects.filter(pk=student.pk).update(date_joined=when)
    return User.objects.get(pk=student.pk)


def link(plan, item, **window):
    return SubscriptionPlanAccess.objects.create(
        plan=plan, content_type=ContentType.objects.get_for_model(item), object_id=item.pk, **window
    )


def subscribe(student, plan, began):
    sub = Subscription.objects.create(
        student=student,
        plan=plan,
        billing_amount=plan.price,
        billing_currency="EUR",
        status="active",
        current_period_start=began,
        current_period_end=NOW + timedelta(days=60),
    )
    Subscription.objects.filter(pk=sub.pk).update(created_at=began)
    return sub


def buy(student, item, starts=None, ends=None):
    payment = Payment.objects.create(
        student=student,
        payment_type="one_time",
        status="completed",
        amount=Decimal("49.00"),
        platform_fee=Decimal("2.00"),
        submerchant_payout=Decimal("47.00"),
        currency="EUR",
        provider="stripe",
    )
    return PaymentItem.objects.create(
        payment=payment,
        content_type=ContentType.objects.get_for_model(item),
        object_id=item.pk,
        item_price=Decimal("49.00"),
        submerchant_payout=Decimal("47.00"),
        access_starts_at=starts,
        access_ends_at=ends,
    )


def free_window(course, window):
    set_ways(
        course,
        {"free": {"window": window}, "buy": {"price": "49", "window": None}, "plans": []},
    )


def test_a_gold_member_waits_until_their_window_opens(service, student, course, gold):
    link(gold, course, opens_after_days=30)
    subscribe(student, gold, datetime(2026, 10, 9, 9, 0, tzinfo=UTC))
    with at(NOW):
        info = service.get_access_info(student, course)
    assert not info.has_access
    assert info.opens_at.date() == date(2026, 11, 8)
    assert "purchase" in info.unlock_methods  # a waiting member can still buy it


def test_items_reached_through_a_bundle_follow_the_bundles_window(service, student, course):
    bundle = Bundle.objects.create(name="Pack", price=Decimal("99.00"), currency="EUR")
    BundleItem.objects.create(
        bundle=bundle, content_type=ContentType.objects.get_for_model(Course), object_id=course.pk
    )
    stamp = buy(student, bundle, NOW - timedelta(days=40), NOW - timedelta(days=1))
    with at(NOW):
        assert not service.get_access_info(student, course).has_access  # the bundle's stamp has ended
    PaymentItem.objects.filter(pk=stamp.pk).update(access_ends_at=NOW + timedelta(days=5))
    with at(NOW):
        info = service.get_access_info(student, course)
    assert (info.has_access, info.access_reason, info.access_ends_at) == (True, "bundle", NOW + timedelta(days=5))


def test_a_gold_member_after_the_wait_is_in(service, student, course, gold):
    link(gold, course, opens_after_days=30)
    subscribe(student, gold, datetime(2026, 9, 4, 9, 0, tzinfo=UTC))
    with at(NOW):
        info = service.get_access_info(student, course)
    assert info.has_access
    assert info.access_reason == "subscription"


def test_a_purchase_ends_with_its_stamp(service, student, course):
    buy(student, course, NOW - timedelta(days=400), NOW - timedelta(days=35))
    with at(NOW):
        info = service.get_access_info(student, course)
    assert not info.has_access
    assert info.unlock_methods == ["purchase"]


def test_a_buyer_sees_when_their_access_ends(service, student, course):
    ends = NOW + timedelta(days=20)
    buy(student, course, NOW - timedelta(days=10), ends)
    with at(NOW):
        info = service.get_access_info(student, course)
    assert (info.has_access, info.access_reason, info.access_ends_at) == (True, "purchased", ends)


def test_a_free_window_opens_it_to_everyone_until_it_closes(service, student, course, zone):
    zone("UTC")
    free_window(course, {"closes_on": "2026-10-26"})
    visitor = AnonymousUser()
    with at(datetime(2026, 10, 26, 23, 59, 59, tzinfo=UTC)):
        assert service.get_access_info(visitor, course).has_access
        assert service.get_access_info(student, course).access_reason == "free"
    with at(datetime(2026, 10, 27, 0, 0, 0, tzinfo=UTC)):
        info = service.get_access_info(visitor, course)
        assert not info.has_access
        assert info.unlock_methods == ["purchase"]


def test_first_days_after_joining_is_free_for_new_students(service, student, course):
    free_window(course, {"closes_after_days": 7})
    newcomer = joined(student, datetime(2026, 10, 15, 8, 0, tzinfo=UTC))
    with at(NOW):
        info = service.get_access_info(newcomer, course)
        assert (info.has_access, info.access_reason) == (True, "free")
        assert info.access_ends_at == datetime(2026, 10, 22, 8, 0, tzinfo=UTC)
        assert not service.get_access_info(AnonymousUser(), course).has_access  # no joining date
    veteran = joined(student, datetime(2026, 9, 1, 8, 0, tzinfo=UTC))
    with at(NOW):
        assert not service.get_access_info(veteran, course).has_access


def test_a_calendar_close_ends_at_the_end_of_that_day_in_the_creators_zone(service, student, course, zone):
    zone("Europe/Istanbul")  # UTC+3: 23:59:59 on the 26th is 20:59:59 UTC
    free_window(course, {"closes_on": "2026-10-26"})
    with at(datetime(2026, 10, 26, 20, 59, 59, tzinfo=UTC)):
        assert service.get_access_info(student, course).has_access
    with at(datetime(2026, 10, 26, 21, 0, 0, tzinfo=UTC)):
        assert not service.get_access_info(student, course).has_access


def test_members_of_an_off_sale_plan_keep_access_but_visitors_are_not_offered_it(service, student, owner, course, gold):
    link(gold, course)
    SubscriptionPlan.objects.filter(pk=gold.pk).update(is_active=False)
    subscribe(student, gold, NOW - timedelta(days=3))
    visitor = User.objects.create_user(email="visitor@win.test", name="V", password="secret123", role="student")
    with at(NOW):
        assert service.get_access_info(student, course).access_reason == "subscription"
        info = service.get_access_info(visitor, course)
    assert info.unlock_methods == ["purchase"]
    assert "plans" not in service.get_unlock_options(course)
    # a members-only item whose only plan is off sale offers visitors nothing to subscribe to
    members_only = Course.objects.create(title="Members", slug="members", instructor=owner, pricing_type="subscription")
    link(gold, members_only)
    with at(NOW):
        assert service.get_access_info(student, members_only).access_reason == "subscription"
        assert service.get_access_info(visitor, members_only).unlock_methods is None
    SubscriptionPlan.objects.filter(pk=gold.pk).update(is_active=True)
    with at(NOW):
        assert service.get_access_info(visitor, members_only).unlock_methods == ["subscribe"]


def test_a_forever_purchase_beside_a_dated_free_window_is_the_way_that_opened_it(service, student, course, zone):
    zone("UTC")
    free_window(course, {"closes_on": "2026-10-26"})
    buy(student, course, NOW - timedelta(days=1), None)
    with at(NOW):
        info = service.get_access_info(student, course)
    assert (info.access_reason, info.access_ends_at) == ("purchased", None)


def test_of_two_dated_ways_the_one_that_ends_last_is_the_way_that_opened_it(service, student, course, gold):
    buy(student, course, NOW - timedelta(days=1), datetime(2026, 11, 1, tzinfo=UTC))
    link(gold, course, closes_after_days=60)
    subscribe(student, gold, datetime(2026, 10, 1, 9, 0, tzinfo=UTC))  # closes 2026-11-30 09:00
    with at(NOW):
        info = service.get_access_info(student, course)
    assert (info.access_reason, info.access_ends_at) == ("subscription", datetime(2026, 11, 30, 9, 0, tzinfo=UTC))


def test_a_list_of_windowed_items_costs_the_same_queries_as_one(service, student, owner, gold, zone):
    zone("Europe/Istanbul")
    subscribe(student, gold, datetime(2026, 9, 4, 9, 0, tzinfo=UTC))
    courses = []
    for n in range(6):
        c = Course.objects.create(
            title=f"W{n}", slug=f"w{n}", instructor=owner, pricing_type="subscription", price=Decimal("0")
        )
        link(gold, c, opens_after_days=30, closes_on=date(2027, 1, 1))
        AccessWindow.objects.create(
            content_type=ContentType.objects.get_for_model(c), object_id=c.pk, way="free", closes_on=date(2026, 12, 1)
        )
        courses.append(c)

    def count(items):
        with at(NOW), CaptureQueriesContext(connection) as ctx:
            service.bulk_check_access(student, items)
        return len(ctx)

    count(courses[:1])  # warm the content-type cache
    assert count(courses) == count(courses[:1])


def test_a_granted_course_honours_its_window(service, student, course):
    enrollment = Enrollment.objects.create(user=student, course=course, granted=True)
    Enrollment.objects.filter(pk=enrollment.pk).update(access_ends_at=NOW - timedelta(days=1))
    with at(NOW):
        assert not service.get_access_info(student, course).has_access
    Enrollment.objects.filter(pk=enrollment.pk).update(access_ends_at=None)  # no stamp: theirs for good
    with at(NOW):
        info = service.get_access_info(student, course)
    assert (info.has_access, info.access_reason, info.access_ends_at) == (True, "granted", None)


def test_unlock_options_carry_each_ways_window(service, student, course, gold):
    set_ways(
        course,
        {
            "free": {"window": {"closes_on": "2026-12-01"}},
            "buy": {"price": "49", "window": {"closes_after_days": 365}},
            "plans": [{"plan_id": gold.pk, "window": {"opens_after_days": 30}}],
        },
    )
    options = service.get_unlock_options(course)
    assert options["purchase"]["window"] == {"closes_after_days": 365}
    assert options["plans"][0]["window"] == {"opens_after_days": 30}
    assert options["free"] == {"window": {"closes_on": "2026-12-01"}}


# --- bulk answers exactly what the single check does, for every setup -------------------


def _plan_wait(ctx):
    link(ctx.gold, ctx.course, opens_after_days=30)
    subscribe(ctx.student, ctx.gold, datetime(2026, 10, 9, 9, 0, tzinfo=UTC))


def _plan_in(ctx):
    link(ctx.gold, ctx.course, opens_after_days=30)
    subscribe(ctx.student, ctx.gold, datetime(2026, 9, 4, 9, 0, tzinfo=UTC))


def _plan_off_sale(ctx):
    link(ctx.gold, ctx.course)
    SubscriptionPlan.objects.filter(pk=ctx.gold.pk).update(is_active=False)
    subscribe(ctx.student, ctx.gold, NOW - timedelta(days=3))


def _plan_not_included(ctx):
    subscribe(ctx.student, ctx.gold, NOW - timedelta(days=3))


def _bought_open(ctx):
    buy(ctx.student, ctx.course, NOW - timedelta(days=1), NOW + timedelta(days=9))


def _bought_ended(ctx):
    buy(ctx.student, ctx.course, NOW - timedelta(days=40), NOW - timedelta(days=1))


def _bought_not_yet(ctx):
    buy(ctx.student, ctx.course, NOW + timedelta(days=3), None)


def _bought_unstamped(ctx):
    buy(ctx.student, ctx.course)


def _bundle_open(ctx):
    bundle = Bundle.objects.create(name="Pack", price=Decimal("99.00"), currency="EUR")
    BundleItem.objects.create(
        bundle=bundle, content_type=ContentType.objects.get_for_model(Course), object_id=ctx.course.pk
    )
    buy(ctx.student, bundle, NOW - timedelta(days=1), NOW + timedelta(days=30))


def _granted_ended(ctx):
    Enrollment.objects.create(user=ctx.student, course=ctx.course, granted=True, access_ends_at=NOW - timedelta(days=1))


def _free_for_a_week(ctx):
    free_window(ctx.course, {"closes_after_days": 7})
    ctx.student = joined(ctx.student, datetime(2026, 10, 15, 8, 0, tzinfo=UTC))


def _free_calendar(ctx):
    free_window(ctx.course, {"opens_on": "2026-11-01", "closes_on": "2026-11-30"})


def _everything_at_once(ctx):
    _plan_in(ctx)
    _bought_open(ctx)
    _free_calendar(ctx)


def _nothing(ctx):
    pass


def _visitor(ctx):
    free_window(ctx.course, {"closes_on": "2026-10-26"})
    ctx.student = AnonymousUser()


SETUPS = [
    _plan_wait,
    _plan_in,
    _plan_off_sale,
    _plan_not_included,
    _bought_open,
    _bought_ended,
    _bought_not_yet,
    _bought_unstamped,
    _bundle_open,
    _granted_ended,
    _free_for_a_week,
    _free_calendar,
    _everything_at_once,
    _nothing,
    _visitor,
]


@pytest.mark.parametrize("setup", SETUPS, ids=lambda f: f.__name__.strip("_"))
def test_bulk_matches_single_for_every_setup(setup, service, student, owner, course, gold, zone):
    zone("UTC")
    ctx = SimpleNamespace(student=student, course=course, gold=gold)
    setup(ctx)
    other = Course.objects.create(title="Other", slug="other", instructor=owner, pricing_type="free")
    with at(NOW):
        single = service.get_access_info(ctx.student, ctx.course)
        bulk = service.bulk_check_access(ctx.student, [ctx.course, other])[ctx.course.pk]
    assert bulk == single
