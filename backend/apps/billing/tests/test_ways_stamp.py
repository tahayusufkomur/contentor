"""A purchase keeps the window it was bought with: stamped when the payment completes."""

from datetime import UTC, datetime
from decimal import Decimal
from unittest import mock

import pytest
from django.contrib.contenttypes.models import ContentType

from apps.accounts.models import User
from apps.billing.models import Bundle, BundleItem, Payment, PaymentItem
from apps.billing.views.payments import grant_access_for_payment
from apps.billing.ways import set_ways
from apps.courses.models import Course
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@stamp.test", name="Owner", password="secret123", role="owner")


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(email="student@stamp.test", name="Student", password="secret123", role="student")


@pytest.fixture()
def course(tenant_ctx, owner):
    return Course.objects.create(
        title="Stamp Course", slug="stamp-course", instructor=owner, pricing_type="paid", price=Decimal("49.00")
    )


@pytest.fixture()
def bundle(tenant_ctx, course):
    bundle = Bundle.objects.create(name="Pack", price=Decimal("99.00"), currency="EUR")
    BundleItem.objects.create(
        bundle=bundle, content_type=ContentType.objects.get_for_model(Course), object_id=course.pk
    )
    return bundle


@pytest.fixture()
def zone(tenant_ctx):
    """Set the creator's time zone for the test and put it back after."""
    config = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Stamp")
    was = config.timezone

    def use(name):
        config.timezone = name
        config.save(update_fields=["timezone"])

    yield use
    config.timezone = was
    config.save(update_fields=["timezone"])


def buy_with(window, price="49"):
    return {"free": None, "buy": {"price": price, "window": window}, "plans": []}


def grant(payment, paid_at):
    with mock.patch("django.utils.timezone.now", return_value=paid_at):
        grant_access_for_payment(payment)


def purchase(student, item, paid_at):
    """A completed payment for one item, granted at ``paid_at``; returns its PaymentItem."""
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
    row = PaymentItem.objects.create(
        payment=payment,
        content_type=ContentType.objects.get_for_model(item),
        object_id=item.pk,
        item_price=Decimal("49.00"),
        submerchant_payout=Decimal("47.00"),
    )
    grant(payment, paid_at)
    row.refresh_from_db()
    return row


def test_a_years_access_ends_a_year_after_payment(course, student):
    set_ways(course, buy_with({"closes_after_days": 365}))
    paid = datetime(2026, 7, 19, 12, 0, tzinfo=UTC)

    row = purchase(student, course, paid)

    assert row.access_starts_at == paid
    assert row.access_ends_at == datetime(2027, 7, 19, 12, 0, tzinfo=UTC)


def test_a_calendar_close_ends_at_the_end_of_that_day(course, student, zone):
    zone("Europe/Istanbul")
    set_ways(course, buy_with({"closes_on": "2026-12-31"}))

    row = purchase(student, course, datetime(2026, 10, 19, 9, 0, tzinfo=UTC))

    assert row.access_ends_at == datetime(2026, 12, 31, 20, 59, 59, tzinfo=UTC)  # 23:59:59 Istanbul (UTC+3)


def test_a_presale_opens_on_its_date(course, student, zone):
    zone("Europe/Istanbul")
    set_ways(course, buy_with({"opens_on": "2026-11-01"}))

    row = purchase(student, course, datetime(2026, 10, 19, 9, 0, tzinfo=UTC))

    assert row.access_starts_at == datetime(2026, 10, 31, 21, 0, tzinfo=UTC)  # 00:00 on 1 Nov, Istanbul
    assert row.access_ends_at is None


def test_editing_the_item_later_leaves_the_purchase_as_bought(course, student):
    set_ways(course, buy_with({"closes_after_days": 365}))
    row = purchase(student, course, datetime(2026, 7, 19, 12, 0, tzinfo=UTC))
    before = (row.access_starts_at, row.access_ends_at)

    set_ways(course, buy_with({"closes_after_days": 30}))
    row.refresh_from_db()

    assert (row.access_starts_at, row.access_ends_at) == before


def test_a_bundle_purchase_is_stamped_from_the_bundles_window(bundle, student):
    set_ways(bundle, buy_with({"closes_after_days": 90}, price="99"))
    paid = datetime(2026, 7, 19, 12, 0, tzinfo=UTC)

    row = purchase(student, bundle, paid)

    assert row.access_starts_at == paid
    assert row.access_ends_at == datetime(2026, 10, 17, 12, 0, tzinfo=UTC)


def test_replaying_the_webhook_keeps_the_first_stamp(course, student):
    set_ways(course, buy_with({"closes_after_days": 365}))
    first = datetime(2026, 7, 19, 12, 0, tzinfo=UTC)
    row = purchase(student, course, first)

    grant(row.payment, datetime(2026, 8, 1, 8, 0, tzinfo=UTC))
    row.refresh_from_db()

    assert row.access_starts_at == first
    assert row.access_ends_at == datetime(2027, 7, 19, 12, 0, tzinfo=UTC)
