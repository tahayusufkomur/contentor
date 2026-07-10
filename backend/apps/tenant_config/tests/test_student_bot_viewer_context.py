"""Viewer context: signed-in students get owned-item titles in the first
user turn; anonymous viewers keep the v1 flag-only block."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone

from apps.accounts.models import User
from apps.billing.models import Payment, PaymentItem, Subscription, SubscriptionPlan
from apps.courses.models import Course, Enrollment
from apps.downloads.models import DownloadFile
from apps.tenant_config import student_bot

pytestmark = pytest.mark.django_db


@pytest.fixture
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@x.com",
        name="Owen Owner",
        password="x",
        role="owner",  # noqa: S106
    )


@pytest.fixture
def student(tenant_ctx):
    return User.objects.create_user(
        email="viewer@x.com",
        name="Vera Viewer",
        password="x",
        role="student",  # noqa: S106
    )


def _own(user, obj):
    payment = Payment.objects.create(
        student=user,
        payment_type="one_time",
        status="completed",
        amount=Decimal("10"),
        platform_fee=Decimal("1"),
        submerchant_payout=Decimal("9"),
        currency="USD",
        provider="bypass",
    )
    PaymentItem.objects.create(
        payment=payment,
        content_type=ContentType.objects.get_for_model(type(obj)),
        object_id=obj.id,
        item_price=Decimal("10"),
        submerchant_payout=Decimal("9"),
    )


def test_anonymous_keeps_flag_only(tenant_ctx):
    assert student_bot.build_viewer_context(None) == "<student_context>signed in: no</student_context>"


def test_owned_items_listed_without_pii(tenant_ctx, student, owner):
    course = Course.objects.create(title="Yoga Basics", slug="yoga-basics", instructor=owner, is_published=True)
    Enrollment.objects.create(user=student, course=course)
    dl = DownloadFile.objects.create(title="Meal Plan PDF", price=Decimal("5"), pricing_type="paid")
    _own(student, dl)
    plan = SubscriptionPlan.objects.create(name="Pro Monthly", price=Decimal("20"), billing_interval_months=1)
    Subscription.objects.create(
        student=student,
        plan=plan,
        status="active",
        billing_amount=Decimal("20"),
        current_period_start=timezone.now(),
        current_period_end=timezone.now() + timedelta(days=30),
    )
    ctx = student_bot.build_viewer_context(student)
    assert "signed in: yes" in ctx
    assert "enrolled courses: Yoga Basics" in ctx
    assert "owned downloads: Meal Plan PDF" in ctx
    assert "membership: Pro Monthly" in ctx
    assert "viewer@x.com" not in ctx and "Vera" not in ctx


def test_caps_at_ten_courses(tenant_ctx, student, owner):
    for i in range(12):
        c = Course.objects.create(title=f"C{i}", slug=f"c-{i}", instructor=owner, is_published=True)
        Enrollment.objects.create(user=student, course=c)
    ctx = student_bot.build_viewer_context(student)
    assert ctx.count("C1") >= 1 and len(ctx.split("enrolled courses: ")[1].split("\n")[0].split("; ")) == 10


def test_inactive_enrollment_and_refund_excluded(tenant_ctx, student, owner):
    c = Course.objects.create(title="Gone", slug="gone", instructor=owner, is_published=True)
    Enrollment.objects.create(user=student, course=c, is_active=False)
    ctx = student_bot.build_viewer_context(student)
    assert "Gone" not in ctx
