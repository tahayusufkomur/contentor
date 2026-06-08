"""Phase E — real Stripe refunds (D8), coach earnings, student order history.

`connect.refund_payment` is mocked. Covers: a Stripe refund hits the connected
account for the item amount and reverses access; a failed refund leaves access
intact; earnings aggregate payouts/refunds; orders + per-student history resolve
with receipt links.
"""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

import pytest
from django.contrib.contenttypes.models import ContentType
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import Payment, PaymentItem
from apps.billing.providers.types import ProviderError
from apps.core.models import Tenant
from apps.courses.models import Course, Enrollment

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db(transaction=True)


def _client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@re.test",
        name="Owner",
        password="secret123",
        role="owner",  # noqa: S106
    )


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(
        email="student@re.test",
        name="Student",
        password="secret123",
        role="student",  # noqa: S106
    )


@pytest.fixture()
def paid_course(tenant_ctx, owner):
    return Course.objects.create(
        title="RE Course",
        slug="re-course",
        instructor=owner,
        pricing_type="paid",
        price=Decimal("99.00"),
        is_published=True,
    )


def _stripe_payment(student, course, *, provider_payment_id="pi_re"):
    payment = Payment.objects.create(
        student=student,
        payment_type="one_time",
        status="completed",
        amount=Decimal("99.00"),
        platform_fee=Decimal("4.00"),
        submerchant_payout=Decimal("95.00"),
        currency="USD",
        provider="stripe",
        provider_payment_id=provider_payment_id,
    )
    PaymentItem.objects.create(
        payment=payment,
        content_type=ContentType.objects.get_for_model(Course),
        object_id=course.pk,
        item_price=Decimal("99.00"),
        submerchant_payout=Decimal("95.00"),
    )
    Enrollment.objects.get_or_create(user=student, course=course)
    return payment


def test_stripe_refund_hits_connected_account_and_reverses_access(restore_public, owner, student, paid_course):
    Tenant.objects.filter(pk=restore_public.pk).update(stripe_account_id="acct_re")
    payment = _stripe_payment(student, paid_course)
    item = payment.items.first()

    with patch("apps.billing.providers.connect.refund_payment", return_value="re_123") as mk:
        resp = _client(owner).post(f"/api/v1/billing/payments/{payment.pk}/items/{item.pk}/refund/")

    assert resp.status_code == 200, resp.content
    kwargs = mk.call_args.kwargs
    assert kwargs["account_id"] == "acct_re"
    assert kwargs["payment_intent_id"] == "pi_re"
    assert kwargs["amount_cents"] == 9900  # item amount only

    item.refresh_from_db()
    assert item.is_refunded is True
    # Access reversed: enrollment deactivated.
    assert Enrollment.objects.get(user=student, course=paid_course).is_active is False
    # Refund record carries the Stripe refund id.
    refund = Payment.objects.get(payment_type="refund", original_payment=payment)
    assert refund.provider_payment_id == "re_123"


def test_stripe_refund_failure_leaves_access_intact(restore_public, owner, student, paid_course):
    Tenant.objects.filter(pk=restore_public.pk).update(stripe_account_id="acct_re")
    payment = _stripe_payment(student, paid_course, provider_payment_id="pi_fail")
    item = payment.items.first()

    with patch(
        "apps.billing.providers.connect.refund_payment",
        side_effect=ProviderError("card_error", code="PROVIDER_ERROR"),
    ):
        resp = _client(owner).post(f"/api/v1/billing/payments/{payment.pk}/items/{item.pk}/refund/")

    assert resp.status_code == 400, resp.content
    item.refresh_from_db()
    assert item.is_refunded is False  # not marked refunded
    payment.refresh_from_db()
    assert payment.status == "completed"  # unchanged
    assert not Payment.objects.filter(payment_type="refund", original_payment=payment).exists()


def test_earnings_aggregates_payouts_and_refunds(restore_public, owner, student, paid_course):
    _stripe_payment(student, paid_course)  # payout 95.00
    Payment.objects.create(
        student=student,
        payment_type="subscription",
        status="completed",
        amount=Decimal("20.00"),
        platform_fee=Decimal("1.00"),
        submerchant_payout=Decimal("19.00"),
        currency="USD",
        provider="stripe",
    )
    Payment.objects.create(
        student=student,
        payment_type="refund",
        status="completed",
        amount=Decimal("99.00"),
        platform_fee=Decimal("0.00"),
        submerchant_payout=Decimal("0.00"),
        currency="USD",
        provider="stripe",
    )

    resp = _client(owner).get("/api/v1/billing/earnings/")
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["net_payout"] == "114.00"  # 95 + 19
    assert body["sales_count"] == 2
    assert body["refunded_total"] == "99.00"
    assert body["refunded_count"] == 1


def test_my_orders_returns_receipts_and_excludes_refunds(restore_public, owner, student, paid_course):
    p = _stripe_payment(student, paid_course)
    p.metadata = {"receipt_url": "https://pay.stripe.com/receipts/abc"}
    p.save(update_fields=["metadata"])
    Payment.objects.create(
        student=student,
        payment_type="refund",
        status="completed",
        amount=Decimal("99.00"),
        platform_fee=Decimal("0.00"),
        submerchant_payout=Decimal("0.00"),
        currency="USD",
        provider="stripe",
    )

    resp = _client(student).get("/api/v1/billing/orders/")
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert len(body) == 1  # refund excluded
    assert body[0]["receipt_url"] == "https://pay.stripe.com/receipts/abc"
    assert body[0]["items"][0]["title"] == "RE Course"


def test_student_payments_coach_view(restore_public, owner, student, paid_course):
    _stripe_payment(student, paid_course)
    resp = _client(owner).get(f"/api/v1/billing/students/{student.pk}/payments/")
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert len(body) == 1
    assert body[0]["items"][0]["title"] == "RE Course"
    assert body[0]["status"] == "completed"


def test_student_payments_forbidden_for_non_owner(restore_public, student, paid_course):
    resp = _client(student).get(f"/api/v1/billing/students/{student.pk}/payments/")
    assert resp.status_code == 403
