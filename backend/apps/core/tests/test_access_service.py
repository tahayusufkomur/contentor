from datetime import timedelta
from decimal import Decimal

import pytest
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone

from apps.accounts.models import User
from apps.billing.models import (
    Bundle,
    BundleItem,
    Payment,
    PaymentItem,
    Subscription,
    SubscriptionPlan,
    SubscriptionPlanAccess,
)
from apps.core.access import ContentAccessService
from apps.courses.models import Course


@pytest.fixture()
def service():
    return ContentAccessService()


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(email="coach@test.com", name="Coach", password="test1234", role="owner")


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(email="student@test.com", name="Student", password="test1234", role="student")


@pytest.fixture()
def free_course(tenant_ctx, coach):
    return Course.objects.create(
        title="Free Course",
        slug="free-course",
        instructor=coach,
        pricing_type="free",
        price=Decimal("0.00"),
    )


@pytest.fixture()
def paid_course(tenant_ctx, coach):
    return Course.objects.create(
        title="Paid Course",
        slug="paid-course",
        instructor=coach,
        pricing_type="paid",
        price=Decimal("99.90"),
    )


@pytest.fixture()
def subscription_course(tenant_ctx, coach):
    """A paid course that is also linked to a subscription plan."""
    return Course.objects.create(
        title="Sub Course",
        slug="sub-course",
        instructor=coach,
        pricing_type="paid",
        price=Decimal("49.90"),
    )


@pytest.fixture()
def subscription_course_with_plan(subscription_course, tenant_ctx):
    """subscription_course linked to an active plan via SubscriptionPlanAccess."""
    ct = ContentType.objects.get_for_model(Course)
    plan = SubscriptionPlan.objects.create(name="Auto Plan", price=Decimal("49.90"), currency="TRY")
    SubscriptionPlanAccess.objects.create(plan=plan, content_type=ct, object_id=subscription_course.pk)
    return subscription_course, plan


# ---------------------------------------------------------------------------
# Owner / Coach access
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestCheckAccessOwnerCoach:
    def test_owner_always_has_access_to_paid(self, service, coach, paid_course):
        info = service.get_access_info(coach, paid_course)
        assert info.has_access is True
        assert info.access_reason == "owner"

    def test_owner_always_has_access_to_free(self, service, coach, free_course):
        info = service.get_access_info(coach, free_course)
        assert info.has_access is True
        assert info.access_reason == "owner"

    def test_owner_always_has_access_to_subscription(self, service, coach, subscription_course):
        info = service.get_access_info(coach, subscription_course)
        assert info.has_access is True
        assert info.access_reason == "owner"

    def test_check_access_shortcut(self, service, coach, paid_course):
        assert service.check_access(coach, paid_course) is True


# ---------------------------------------------------------------------------
# Free content
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestCheckAccessFreeContent:
    def test_student_accesses_free_content(self, service, student, free_course):
        info = service.get_access_info(student, free_course)
        assert info.has_access is True
        assert info.access_reason == "free"

    def test_free_content_pricing_type(self, service, student, free_course):
        info = service.get_access_info(student, free_course)
        assert info.pricing_type == "free"


# ---------------------------------------------------------------------------
# Paid content (direct purchase)
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestCheckAccessPaidContent:
    def test_denied_without_payment(self, service, student, paid_course):
        info = service.get_access_info(student, paid_course)
        assert info.has_access is False
        assert "purchase" in info.unlock_methods
        assert info.price == Decimal("99.90")

    def test_access_with_payment_item(self, service, student, paid_course):
        ct = ContentType.objects.get_for_model(Course)
        payment = Payment.objects.create(
            student=student,
            payment_type="one_time",
            status="completed",
            amount=Decimal("99.90"),
            platform_fee=Decimal("9.99"),
            submerchant_payout=Decimal("89.91"),
            currency="TRY",
            provider="iyzico",
        )
        PaymentItem.objects.create(
            payment=payment,
            content_type=ct,
            object_id=paid_course.pk,
            item_price=Decimal("99.90"),
            submerchant_payout=Decimal("89.91"),
        )
        info = service.get_access_info(student, paid_course)
        assert info.has_access is True
        assert info.access_reason == "purchased"

    def test_refunded_item_denies_access(self, service, student, paid_course):
        ct = ContentType.objects.get_for_model(Course)
        payment = Payment.objects.create(
            student=student,
            payment_type="one_time",
            status="completed",
            amount=Decimal("99.90"),
            platform_fee=Decimal("9.99"),
            submerchant_payout=Decimal("89.91"),
            currency="TRY",
            provider="iyzico",
        )
        PaymentItem.objects.create(
            payment=payment,
            content_type=ct,
            object_id=paid_course.pk,
            item_price=Decimal("99.90"),
            submerchant_payout=Decimal("89.91"),
            is_refunded=True,
        )
        info = service.get_access_info(student, paid_course)
        assert info.has_access is False


# ---------------------------------------------------------------------------
# Bundle purchase
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestCheckAccessBundlePurchase:
    def test_bundle_grants_access(self, service, student, paid_course):
        ct = ContentType.objects.get_for_model(Course)
        bundle = Bundle.objects.create(name="Test Bundle", price=Decimal("149.90"), currency="TRY")
        BundleItem.objects.create(bundle=bundle, content_type=ct, object_id=paid_course.pk)

        bundle_ct = ContentType.objects.get_for_model(Bundle)
        payment = Payment.objects.create(
            student=student,
            payment_type="one_time",
            status="completed",
            amount=Decimal("149.90"),
            platform_fee=Decimal("14.99"),
            submerchant_payout=Decimal("134.91"),
            currency="TRY",
            provider="iyzico",
        )
        PaymentItem.objects.create(
            payment=payment,
            content_type=bundle_ct,
            object_id=bundle.pk,
            item_price=Decimal("149.90"),
            submerchant_payout=Decimal("134.91"),
        )
        info = service.get_access_info(student, paid_course)
        assert info.has_access is True
        assert info.access_reason == "bundle"


# ---------------------------------------------------------------------------
# Subscription access
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestCheckAccessSubscription:
    def test_active_subscription_grants_access(self, service, student, subscription_course):
        ct = ContentType.objects.get_for_model(Course)
        plan = SubscriptionPlan.objects.create(name="Monthly", price=Decimal("49.90"), currency="TRY")
        SubscriptionPlanAccess.objects.create(plan=plan, content_type=ct, object_id=subscription_course.pk)
        now = timezone.now()
        Subscription.objects.create(
            student=student,
            plan=plan,
            billing_amount=Decimal("49.90"),
            billing_currency="TRY",
            status="active",
            current_period_start=now - timedelta(days=1),
            current_period_end=now + timedelta(days=29),
        )
        info = service.get_access_info(student, subscription_course)
        assert info.has_access is True
        assert info.access_reason == "subscription"

    def test_expired_subscription_denies_access(self, service, student, subscription_course):
        ct = ContentType.objects.get_for_model(Course)
        plan = SubscriptionPlan.objects.create(name="Monthly Expired", price=Decimal("49.90"), currency="TRY")
        SubscriptionPlanAccess.objects.create(plan=plan, content_type=ct, object_id=subscription_course.pk)
        now = timezone.now()
        Subscription.objects.create(
            student=student,
            plan=plan,
            billing_amount=Decimal("49.90"),
            billing_currency="TRY",
            status="active",
            current_period_start=now - timedelta(days=31),
            current_period_end=now - timedelta(days=1),
        )
        info = service.get_access_info(student, subscription_course)
        assert info.has_access is False

    def test_subscription_without_plan_access_denies(self, service, student, subscription_course):
        plan = SubscriptionPlan.objects.create(name="Monthly No Access", price=Decimal("49.90"), currency="TRY")
        # No SubscriptionPlanAccess linking to subscription_course
        now = timezone.now()
        Subscription.objects.create(
            student=student,
            plan=plan,
            billing_amount=Decimal("49.90"),
            billing_currency="TRY",
            status="active",
            current_period_start=now - timedelta(days=1),
            current_period_end=now + timedelta(days=29),
        )
        info = service.get_access_info(student, subscription_course)
        assert info.has_access is False


# ---------------------------------------------------------------------------
# Dual access: paid + subscription unlock_methods
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestCheckAccessDualUnlock:
    def test_paid_with_plan_returns_both_unlock_methods(self, service, student, subscription_course_with_plan):
        course, plan = subscription_course_with_plan
        info = service.get_access_info(student, course)
        assert info.has_access is False
        assert "purchase" in info.unlock_methods
        assert "subscribe" in info.unlock_methods

    def test_paid_without_plan_returns_purchase_only(self, service, student, paid_course):
        info = service.get_access_info(student, paid_course)
        assert info.has_access is False
        assert info.unlock_methods == ["purchase"]


# ---------------------------------------------------------------------------
# Bulk check access
# ---------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
class TestBulkCheckAccess:
    def test_empty_list(self, service, student):
        result = service.bulk_check_access(student, [])
        assert result == {}

    def test_owner_gets_all(self, service, coach, free_course, paid_course, subscription_course):
        courses = [free_course, paid_course, subscription_course]
        result = service.bulk_check_access(coach, courses)
        assert len(result) == 3
        for pk, info in result.items():
            assert info.has_access is True
            assert info.access_reason == "owner"

    def test_student_mixed_access(self, service, student, free_course, paid_course, subscription_course_with_plan):
        subscription_course, plan = subscription_course_with_plan
        ct = ContentType.objects.get_for_model(Course)

        # Purchase the paid course
        payment = Payment.objects.create(
            student=student,
            payment_type="one_time",
            status="completed",
            amount=Decimal("99.90"),
            platform_fee=Decimal("9.99"),
            submerchant_payout=Decimal("89.91"),
            currency="TRY",
            provider="iyzico",
        )
        PaymentItem.objects.create(
            payment=payment,
            content_type=ct,
            object_id=paid_course.pk,
            item_price=Decimal("99.90"),
            submerchant_payout=Decimal("89.91"),
        )

        courses = [free_course, paid_course, subscription_course]
        result = service.bulk_check_access(student, courses)
        assert result[free_course.pk].has_access is True
        assert result[free_course.pk].access_reason == "free"
        assert result[paid_course.pk].has_access is True
        assert result[paid_course.pk].access_reason == "purchased"
        assert result[subscription_course.pk].has_access is False
        assert "purchase" in result[subscription_course.pk].unlock_methods
        assert "subscribe" in result[subscription_course.pk].unlock_methods

    def test_unauthenticated_user(self, service, free_course, paid_course, subscription_course_with_plan):
        subscription_course, plan = subscription_course_with_plan

        class AnonUser:
            pk = None
            is_authenticated = False

        anon = AnonUser()
        courses = [free_course, paid_course, subscription_course]
        result = service.bulk_check_access(anon, courses)
        assert result[free_course.pk].has_access is True
        assert result[free_course.pk].access_reason == "free"
        assert result[paid_course.pk].has_access is False
        assert result[paid_course.pk].unlock_methods == ["purchase"]
        assert result[subscription_course.pk].has_access is False
        assert "purchase" in result[subscription_course.pk].unlock_methods
        assert "subscribe" in result[subscription_course.pk].unlock_methods
