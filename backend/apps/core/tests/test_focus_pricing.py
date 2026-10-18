"""The Financial Strategist's suggested price (apps.core.focus.pricing): code
only, from her own numbers (spec F13). The access step that shows it is
tested in test_focus_flow.py."""

from decimal import Decimal

import pytest

from apps.accounts.models import User
from apps.core.focus import pricing
from apps.courses.models import Course, Enrollment, Module

pytestmark = pytest.mark.django_db


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="pricing-coach@x.com",
        name="Coach",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


def _course(coach, title, price=0, *, published=True, pricing_type=None, modules=0):
    course = Course.objects.create(
        title=title,
        slug=title.lower().replace(" ", "-"),
        instructor=coach,
        price=Decimal(price),
        pricing_type=pricing_type or ("paid" if price else "free"),
        is_published=published,
    )
    for i in range(modules):
        Module.objects.create(course=course, title=f"Module {i + 1}", order=i + 1)
    return course


@pytest.fixture()
def new_course(coach):
    return _course(coach, "Desk yoga", published=False)


@pytest.fixture()
def paid_courses(coach):
    return [_course(coach, "Morning flow", 29), _course(coach, "Strong back", 49)]


def test_the_suggestion_uses_her_other_courses(paid_courses, new_course):
    s = pricing.suggest(new_course)
    assert s.amount == Decimal("39")
    assert s.reason == "Your other courses sell for $29–$49"


def test_one_other_course_is_named_and_her_best_seller_counts_its_students(coach, new_course):
    other = _course(coach, "Morning flow", "29.50")
    for i in range(3):
        student = User.objects.create_user(email=f"s{i}@x.com", name="S", password="x", role="student")  # noqa: S106
        Enrollment.objects.create(user=student, course=other)
    s = pricing.suggest(new_course)
    assert s.amount == Decimal("30")  # whole units
    assert s.reason == "Morning flow sells for $29.50; Morning flow has 3 students"


def test_free_unpublished_and_this_course_never_count(coach):
    _course(coach, "Free intro")
    _course(coach, "Draft", 99, published=False)
    _course(coach, "In the membership", 59, pricing_type="subscription")
    this = _course(coach, "Desk yoga", 49)  # her own draft's price is not a reason for itself
    assert pricing.suggest(this).reason == pricing.FALLBACK


def test_the_price_she_gave_at_setup(new_course, tenant_ctx, monkeypatch):
    monkeypatch.setattr(tenant_ctx, "wizard_state", {"flow": "interview", "answers": {"course_price": "59"}})
    s = pricing.suggest(new_course)
    assert (s.amount, s.reason) == (Decimal("59"), "The price you gave when you set up your site")


def test_a_delegated_setup_price_is_not_hers(new_course, tenant_ctx, monkeypatch):
    monkeypatch.setattr(tenant_ctx, "wizard_state", {"flow": "interview", "answers": {"course_price": "__delegate__"}})
    assert pricing.suggest(new_course).reason == pricing.FALLBACK


def test_with_no_numbers_it_says_so_plainly(coach, new_course):
    assert pricing.suggest(new_course) == pricing.Suggestion(
        Decimal("19"), "A common place to start; change it any time"
    )
    assert pricing.suggest(_course(coach, "Three", modules=3)).amount == Decimal("39")
    assert pricing.suggest(_course(coach, "Four", modules=4)).amount == Decimal("69")
