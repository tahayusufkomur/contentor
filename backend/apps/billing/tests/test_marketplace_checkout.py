"""Phase C — real one-time student→coach checkout via Stripe Connect direct charges.

`connect.create_marketplace_checkout` and webhook signature verification are
mocked so no live Stripe is needed. Covers: the initialize view creating a
pending Payment + hosted-checkout URL with the right fee split, the monetization
gate, and the connected-account `checkout.session.completed` webhook completing
the Payment and granting access (course Enrollment) inside the tenant schema.
"""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

import pytest
from django.contrib.contenttypes.models import ContentType
from django.test import override_settings
from django_tenants.utils import tenant_context
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import Bundle, BundleItem, Payment, PaymentItem
from apps.billing.providers.connect import MarketplaceCheckout
from apps.core.models import PlatformPlan, Tenant
from apps.courses.models import Course, Enrollment

SHARED_DOMAIN = "shared-test.localhost"
INIT_URL = "/api/v1/billing/payments/initialize/"

pytestmark = pytest.mark.django_db


def _client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@mk.test",
        name="Owner",
        password="secret123",
        role="owner",  # noqa: S106
    )


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(
        email="student@mk.test",
        name="Student",
        password="secret123",
        role="student",  # noqa: S106
    )


@pytest.fixture()
def paid_course(tenant_ctx, owner):
    return Course.objects.create(
        title="MK Paid Course",
        slug="mk-paid-course",
        instructor=owner,
        pricing_type="paid",
        price=Decimal("100.00"),
        is_published=True,
    )


@override_settings(BILLING_BYPASS_ENABLED=False)
def test_initialize_creates_stripe_checkout(restore_public, owner, student, paid_course):
    tenant = restore_public
    plan, _ = PlatformPlan.objects.update_or_create(
        name="mk-pro", defaults={"price_monthly": 49, "transaction_fee_pct": 4}
    )
    Tenant.objects.filter(pk=tenant.pk).update(stripe_account_id="acct_mk", plan=plan)

    checkout = MarketplaceCheckout(url="https://checkout.stripe.com/c/pay/cs_mk", session_id="cs_mk")
    with (
        patch("apps.billing.views.payments.can_monetize", return_value=True),
        patch("apps.billing.providers.connect.create_marketplace_checkout", return_value=checkout) as mk,
    ):
        resp = _client(student).post(
            INIT_URL,
            {"items": [{"content_type": "course", "object_id": paid_course.pk}]},
            format="json",
        )

    assert resp.status_code == 201, resp.content
    body = resp.json()
    assert body["status"] == "pending"
    assert body["checkout_url"].startswith("https://checkout.stripe.com/")

    payment = Payment.objects.get(pk=body["payment_id"])
    assert payment.status == "pending"
    assert payment.provider == "stripe"
    # No access granted yet — that waits for the webhook.
    assert not Enrollment.objects.filter(user=student, course=paid_course).exists()

    kwargs = mk.call_args.kwargs
    assert kwargs["account_id"] == "acct_mk"
    # fee = 4% of $100.00 = $4.00 -> 400 cents.
    assert kwargs["application_fee_cents"] == 400
    assert kwargs["line_items"][0]["price_data"]["unit_amount"] == 10000
    # Charge currency follows the tenant (global → USD), not a content default.
    assert kwargs["line_items"][0]["price_data"]["currency"] == "usd"
    assert kwargs["metadata"]["payment_id"] == str(payment.pk)


@override_settings(BILLING_BYPASS_ENABLED=False)
def test_initialize_blocked_when_coach_cannot_monetize(restore_public, student, paid_course):
    # can_monetize=False (Free / not onboarded) must not reach Stripe.
    with (
        patch("apps.billing.views.payments.can_monetize", return_value=False),
        patch("apps.billing.providers.connect.create_marketplace_checkout") as mk,
    ):
        resp = _client(student).post(
            INIT_URL,
            {"items": [{"content_type": "course", "object_id": paid_course.pk}]},
            format="json",
        )

    assert resp.status_code == 409, resp.content
    assert resp.json()["error"] == "COACH_CANNOT_ACCEPT_PAYMENTS"
    mk.assert_not_called()


class _FakeEvent:
    def __init__(self, body):
        self._body = body

    def __getitem__(self, key):
        return self._body[key]

    def get(self, key, default=None):
        return self._body.get(key, default)

    def to_dict(self):
        return self._body


@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_WEBHOOK_SECRET="whsec_mk")  # noqa: S106
def test_webhook_completes_payment_and_grants_access(restore_public):
    # Self-contained (no tenant_ctx): the webhook view leaves the connection on
    # the public schema, which would break tenant_ctx's teardown. Plain
    # django_db rollback cleans up both schemas at the end.
    tenant = restore_public
    Tenant.objects.filter(pk=tenant.pk).update(stripe_account_id="acct_mk_wh")

    # Seed users + a pending Stripe payment in the tenant schema (where the
    # tenant-scoped FKs — Course.instructor, Payment.student — resolve).
    with tenant_context(tenant):
        owner = User.objects.create_user(
            email="owner@mkwh.test",
            name="Owner",
            password="secret123",
            role="owner",  # noqa: S106
        )
        student = User.objects.create_user(
            email="student@mkwh.test",
            name="Student",
            password="secret123",
            role="student",  # noqa: S106
        )
        course = Course.objects.create(
            title="WH Course",
            slug="wh-course",
            instructor=owner,
            pricing_type="paid",
            price=Decimal("50.00"),
            is_published=True,
        )
        payment = Payment.objects.create(
            student=student,
            payment_type="one_time",
            status="pending",
            amount=Decimal("50.00"),
            platform_fee=Decimal("2.00"),
            submerchant_payout=Decimal("48.00"),
            currency="USD",
            provider="stripe",
        )
        PaymentItem.objects.create(
            payment=payment,
            content_type=ContentType.objects.get_for_model(Course),
            object_id=course.pk,
            item_price=Decimal("50.00"),
            submerchant_payout=Decimal("48.00"),
        )
        payment_id, course_id, student_id = payment.pk, course.pk, student.pk

    event = _FakeEvent(
        {
            "id": "evt_mk_wh",
            "type": "checkout.session.completed",
            "account": "acct_mk_wh",
            "data": {
                "object": {
                    "id": "cs_mk_wh",
                    "payment_intent": "pi_mk_wh",
                    "metadata": {
                        "payment_id": str(payment_id),
                        "tenant_id": str(tenant.pk),
                        "user_id": str(student.pk),
                    },
                }
            },
        }
    )

    with patch("stripe.Webhook.construct_event", return_value=event):
        resp = APIClient().post(
            "/api/webhooks/stripe/",
            data="{}",
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="t=1,v1=fake",
        )
    assert resp.status_code == 200, resp.content
    assert resp.json()["handled"] is True

    with tenant_context(tenant):
        payment = Payment.objects.get(pk=payment_id)
        assert payment.status == "completed"
        assert payment.provider_payment_id == "pi_mk_wh"
        assert Enrollment.objects.filter(user_id=student_id, course_id=course_id).exists()


@override_settings(BILLING_BYPASS_ENABLED=True)
def test_grant_access_expands_bundle_courses(restore_public, owner, student):
    """A bundle purchase enrolls every course inside it (bypass path)."""
    tenant = restore_public
    with tenant_context(tenant):
        course = Course.objects.create(
            title="Bundle Course",
            slug="mk-bundle-course",
            instructor=owner,
            pricing_type="paid",
            price=Decimal("30.00"),
            is_published=True,
        )
        bundle = Bundle.objects.create(name="MK Bundle", price=Decimal("30.00"), currency="USD")
        BundleItem.objects.create(
            bundle=bundle,
            content_type=ContentType.objects.get_for_model(Course),
            object_id=course.pk,
        )
        course_id, bundle_id = course.pk, bundle.pk

    resp = _client(student).post(
        INIT_URL,
        {"items": [{"content_type": "bundle", "object_id": bundle_id}]},
        format="json",
    )
    assert resp.status_code == 201, resp.content
    assert resp.json()["status"] == "completed"
    with tenant_context(tenant):
        assert Enrollment.objects.filter(user=student, course_id=course_id).exists()
