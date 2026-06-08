"""
Payment and Subscription API tests.

Tests for:
  - POST /api/v1/billing/payments/initialize/
  - POST /api/v1/billing/payments/<id>/items/<id>/refund/
  - POST /api/v1/billing/subscribe/

Uses shared tenant fixtures from conftest.py.
"""

from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import (
    Bundle,
    BundleItem,
    Payment,
    PaymentItem,
    Subscription,
    SubscriptionPlan,
)
from apps.courses.models import Course, Enrollment

SHARED_DOMAIN = "shared-test.localhost"


# ---------------------------------------------------------------------------
# User fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@paymenttest.com", name="Owner", password="secret123", role="owner")


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(
        email="student@paymenttest.com",
        name="Student",
        password="secret123",
        role="student",
    )


# ---------------------------------------------------------------------------
# Content fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def paid_course(tenant_ctx, owner):
    return Course.objects.create(
        title="Paid Course",
        slug="paid-course-payment",
        instructor=owner,
        pricing_type="paid",
        price=Decimal("99.00"),
        is_published=True,
    )


@pytest.fixture()
def free_course(tenant_ctx, owner):
    return Course.objects.create(
        title="Free Course",
        slug="free-course-payment",
        instructor=owner,
        pricing_type="free",
        price=Decimal("0.00"),
        is_published=True,
    )


@pytest.fixture()
def paid_bundle(tenant_ctx, paid_course):
    from django.contrib.contenttypes.models import ContentType

    b = Bundle.objects.create(
        name="Paid Bundle",
        description="A bundle for payment testing",
        price=Decimal("149.00"),
        currency="TRY",
        is_active=True,
    )
    ct = ContentType.objects.get_for_model(Course)
    BundleItem.objects.create(bundle=b, content_type=ct, object_id=paid_course.pk)
    return b


@pytest.fixture()
def active_plan(tenant_ctx):
    return SubscriptionPlan.objects.create(
        name="Basic Plan",
        description="Basic subscription plan",
        price=Decimal("29.99"),
        currency="TRY",
        is_active=True,
    )


@pytest.fixture()
def inactive_plan(tenant_ctx):
    return SubscriptionPlan.objects.create(
        name="Inactive Plan",
        description="An inactive plan",
        price=Decimal("49.99"),
        currency="TRY",
        is_active=False,
    )


def make_client(user=None):
    """Return an APIClient routing requests to the test tenant."""
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


# ===========================================================================
# Tests: Payment Initialize
# ===========================================================================


@pytest.mark.django_db(transaction=True)
class TestPaymentInitialize:
    """Exercises the bypass adapter (instant completed payment + access)."""

    @pytest.fixture(autouse=True)
    def _force_bypass(self, settings):
        settings.BILLING_BYPASS_ENABLED = True

    def test_purchase_paid_course(self, student, paid_course):
        """Purchase a paid course: 201, payment created, enrollment created."""
        client = make_client(student)
        payload = {
            "items": [{"content_type": "course", "object_id": paid_course.pk}],
        }
        response = client.post("/api/v1/billing/payments/initialize/", data=payload, format="json")
        assert response.status_code == 201, response.content
        data = response.json()
        assert data["status"] == "completed"
        assert data["item_count"] == 1

        # Verify payment record
        payment = Payment.objects.get(pk=data["payment_id"])
        assert payment.student == student
        assert payment.payment_type == "one_time"

        # Verify enrollment was created
        assert Enrollment.objects.filter(user=student, course=paid_course).exists()

    def test_purchase_bundle(self, student, paid_bundle, paid_course):
        """Purchase a bundle: 201, bundle courses enrolled."""
        client = make_client(student)
        payload = {
            "items": [{"content_type": "bundle", "object_id": paid_bundle.pk}],
        }
        response = client.post("/api/v1/billing/payments/initialize/", data=payload, format="json")
        assert response.status_code == 201, response.content
        data = response.json()
        assert data["status"] == "completed"

        # Verify the course inside the bundle was enrolled
        assert Enrollment.objects.filter(user=student, course=paid_course).exists()

    def test_purchase_free_course_returns_400(self, student, free_course):
        """Purchasing a free course returns 400 (not purchasable)."""
        client = make_client(student)
        payload = {
            "items": [{"content_type": "course", "object_id": free_course.pk}],
        }
        response = client.post("/api/v1/billing/payments/initialize/", data=payload, format="json")
        assert response.status_code == 400, response.content

    def test_purchase_already_owned_course_returns_400(self, student, paid_course):
        """Purchasing an already-owned course returns 400."""
        # First purchase
        client = make_client(student)
        payload = {
            "items": [{"content_type": "course", "object_id": paid_course.pk}],
        }
        resp1 = client.post("/api/v1/billing/payments/initialize/", data=payload, format="json")
        assert resp1.status_code == 201, resp1.content

        # Second purchase should fail
        resp2 = client.post("/api/v1/billing/payments/initialize/", data=payload, format="json")
        assert resp2.status_code == 400, resp2.content

    def test_unauthenticated_returns_401(self, paid_course):
        """Unauthenticated user gets 401."""
        client = make_client()
        payload = {
            "items": [{"content_type": "course", "object_id": paid_course.pk}],
        }
        response = client.post("/api/v1/billing/payments/initialize/", data=payload, format="json")
        assert response.status_code in (401, 403), response.content


# ===========================================================================
# Tests: Payment Item Refund
# ===========================================================================


@pytest.mark.django_db(transaction=True)
class TestPaymentItemRefund:
    def _create_payment(self, student, paid_course, extra_course=None):
        """Helper: create a completed payment with one or two items."""
        from django.contrib.contenttypes.models import ContentType

        ct = ContentType.objects.get_for_model(Course)
        payment = Payment.objects.create(
            student=student,
            payment_type="one_time",
            status="completed",
            amount=paid_course.price,
            platform_fee=Decimal("9.90"),
            submerchant_payout=Decimal("89.10"),
            currency="TRY",
            provider="bypass",
        )
        item1 = PaymentItem.objects.create(
            payment=payment,
            content_type=ct,
            object_id=paid_course.pk,
            item_price=paid_course.price,
            submerchant_payout=Decimal("89.10"),
        )
        Enrollment.objects.get_or_create(user=student, course=paid_course)

        item2 = None
        if extra_course:
            item2 = PaymentItem.objects.create(
                payment=payment,
                content_type=ct,
                object_id=extra_course.pk,
                item_price=extra_course.price,
                submerchant_payout=Decimal("45.00"),
            )
            payment.amount += extra_course.price
            payment.save(update_fields=["amount"])
            Enrollment.objects.get_or_create(user=student, course=extra_course)

        return payment, item1, item2

    def test_owner_refunds_item(self, owner, student, paid_course):
        """Owner can refund a payment item."""
        payment, item, _ = self._create_payment(student, paid_course)
        client = make_client(owner)
        response = client.post(f"/api/v1/billing/payments/{payment.pk}/items/{item.pk}/refund/")
        assert response.status_code == 200, response.content
        data = response.json()
        assert data["payment_status"] == "refunded"
        assert "refund_payment_id" in data

        # Verify item is marked refunded
        item.refresh_from_db()
        assert item.is_refunded is True

        # Verify enrollment deactivated
        enrollment = Enrollment.objects.get(user=student, course=paid_course)
        assert enrollment.is_active is False

    def test_already_refunded_returns_400(self, owner, student, paid_course):
        """Refunding an already-refunded item returns 400."""
        payment, item, _ = self._create_payment(student, paid_course)
        client = make_client(owner)
        # First refund
        resp1 = client.post(f"/api/v1/billing/payments/{payment.pk}/items/{item.pk}/refund/")
        assert resp1.status_code == 200, resp1.content

        # Second refund should fail
        resp2 = client.post(f"/api/v1/billing/payments/{payment.pk}/items/{item.pk}/refund/")
        assert resp2.status_code == 400, resp2.content

    def test_student_cannot_refund(self, student, paid_course):
        """Student gets 403 when trying to refund."""
        payment, item, _ = self._create_payment(student, paid_course)
        client = make_client(student)
        response = client.post(f"/api/v1/billing/payments/{payment.pk}/items/{item.pk}/refund/")
        assert response.status_code == 403, response.content

    def test_partial_refund(self, owner, student, paid_course):
        """Refunding one of two items results in partially_refunded status."""
        extra_course = Course.objects.create(
            title="Extra Course",
            slug="extra-course-payment",
            instructor=owner,
            pricing_type="paid",
            price=Decimal("50.00"),
            is_published=True,
        )
        payment, item1, item2 = self._create_payment(student, paid_course, extra_course=extra_course)
        client = make_client(owner)
        response = client.post(f"/api/v1/billing/payments/{payment.pk}/items/{item1.pk}/refund/")
        assert response.status_code == 200, response.content
        data = response.json()
        assert data["payment_status"] == "partially_refunded"

    def test_all_items_refunded(self, owner, student, paid_course):
        """Refunding all items results in refunded status."""
        extra_course = Course.objects.create(
            title="Extra Course",
            slug="extra-course-payment-2",
            instructor=owner,
            pricing_type="paid",
            price=Decimal("50.00"),
            is_published=True,
        )
        payment, item1, item2 = self._create_payment(student, paid_course, extra_course=extra_course)
        client = make_client(owner)

        # Refund first item
        resp1 = client.post(f"/api/v1/billing/payments/{payment.pk}/items/{item1.pk}/refund/")
        assert resp1.status_code == 200, resp1.content
        assert resp1.json()["payment_status"] == "partially_refunded"

        # Refund second item
        resp2 = client.post(f"/api/v1/billing/payments/{payment.pk}/items/{item2.pk}/refund/")
        assert resp2.status_code == 200, resp2.content
        assert resp2.json()["payment_status"] == "refunded"


# ===========================================================================
# Tests: Subscribe
# ===========================================================================


@pytest.mark.django_db(transaction=True)
class TestSubscribe:
    """Exercises the bypass adapter (instant active subscription)."""

    @pytest.fixture(autouse=True)
    def _force_bypass(self, settings):
        settings.BILLING_BYPASS_ENABLED = True

    def test_subscribe_to_active_plan(self, student, active_plan):
        """Subscribe to an active plan: 201, subscription + payment created."""
        client = make_client(student)
        payload = {"plan_id": active_plan.pk}
        response = client.post("/api/v1/billing/subscribe/", data=payload, format="json")
        assert response.status_code == 201, response.content
        data = response.json()
        assert data["status"] == "active"
        assert data["plan"] == active_plan.name

        # Verify subscription and payment exist
        sub = Subscription.objects.get(pk=data["subscription_id"])
        assert sub.student == student
        assert sub.plan == active_plan
        assert Payment.objects.filter(subscription=sub, payment_type="subscription").exists()

    def test_already_subscribed_returns_400(self, student, active_plan):
        """Subscribing again to the same plan returns 400."""
        client = make_client(student)
        payload = {"plan_id": active_plan.pk}
        resp1 = client.post("/api/v1/billing/subscribe/", data=payload, format="json")
        assert resp1.status_code == 201, resp1.content

        resp2 = client.post("/api/v1/billing/subscribe/", data=payload, format="json")
        assert resp2.status_code == 400, resp2.content

    def test_missing_plan_id_returns_400(self, student, tenant_ctx):
        """Missing plan_id returns 400."""
        client = make_client(student)
        response = client.post("/api/v1/billing/subscribe/", data={}, format="json")
        assert response.status_code == 400, response.content

    def test_inactive_plan_returns_404(self, student, inactive_plan):
        """Subscribing to an inactive plan returns 404."""
        client = make_client(student)
        payload = {"plan_id": inactive_plan.pk}
        response = client.post("/api/v1/billing/subscribe/", data=payload, format="json")
        assert response.status_code == 404, response.content
