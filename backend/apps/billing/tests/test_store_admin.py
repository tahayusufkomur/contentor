"""The coach's Store: memberships she creates and edits herself, and the list
of what students paid her.

  - POST  /api/v1/billing/plans/        (owner)
  - PATCH /api/v1/billing/plans/{id}/   (owner)
  - GET   /api/v1/billing/plans/?all=1  (switched-off plans, owner only)
  - GET   /api/v1/billing/sales/        (owner)
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import Payment, SubscriptionPlan

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
        email="owner@store.test",
        name="Owner",
        password="secret123",  # noqa: S106
        role="owner",
    )


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(
        email="student@store.test",
        name="Sam Student",
        password="secret123",  # noqa: S106
        role="student",
    )


def _plan(**kwargs):
    defaults = {"name": "Monthly", "price": Decimal("19.00"), "currency": "USD"}
    return SubscriptionPlan.objects.create(**{**defaults, **kwargs})


def _payment(student, **kwargs):
    defaults = {
        "student": student,
        "payment_type": "one_time",
        "status": "completed",
        "amount": Decimal("30.00"),
        "platform_fee": Decimal("1.00"),
        "submerchant_payout": Decimal("29.00"),
        "currency": "USD",
        "provider": "stripe",
    }
    return Payment.objects.create(**{**defaults, **kwargs})


# ── Memberships ──────────────────────────────────────────────────────────────


def test_owner_creates_a_plan_in_the_tenants_currency(owner):
    resp = _client(owner).post(
        "/api/v1/billing/plans/",
        {"name": "Studio pass", "price": "25.00", "billing_interval_months": 12, "currency": "JPY"},
        format="json",
    )
    assert resp.status_code == 201, resp.content
    plan = SubscriptionPlan.objects.get(pk=resp.json()["id"])
    assert plan.name == "Studio pass"
    assert plan.billing_interval_months == 12
    # The charge currency belongs to the tenant; the body cannot pick one.
    assert plan.currency == "USD"
    assert plan.is_active is True


@pytest.mark.parametrize(
    "body",
    [
        {"name": "Free", "price": "0"},
        {"name": "Too long", "price": "10", "billing_interval_months": 37},
        {"name": "", "price": "10"},
    ],
)
def test_a_plan_needs_a_name_a_price_and_a_cycle_stripe_accepts(owner, body):
    resp = _client(owner).post("/api/v1/billing/plans/", body, format="json")
    assert resp.status_code == 400, resp.content
    assert not SubscriptionPlan.objects.exists()


def test_a_student_cannot_create_or_edit_a_plan(owner, student):
    plan = _plan()
    client = _client(student)
    assert client.post("/api/v1/billing/plans/", {"name": "X", "price": "5"}, format="json").status_code == 403
    assert client.patch(f"/api/v1/billing/plans/{plan.pk}/", {"price": "1"}, format="json").status_code == 403
    assert _client().post("/api/v1/billing/plans/", {"name": "X", "price": "5"}, format="json").status_code in (
        401,
        403,
    )
    plan.refresh_from_db()
    assert plan.price == Decimal("19.00")


def test_owner_edits_a_plan_and_switches_it_off(owner):
    plan = _plan()
    resp = _client(owner).patch(
        f"/api/v1/billing/plans/{plan.pk}/",
        {"price": "24.00", "is_active": False, "currency": "JPY"},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    plan.refresh_from_db()
    assert plan.price == Decimal("24.00")
    assert plan.is_active is False
    assert plan.currency == "USD"


def test_switched_off_plans_show_to_the_owner_only_when_she_asks(owner, student):
    on = _plan(name="On")
    off = _plan(name="Off", is_active=False)

    def names(client, query=""):
        return [p["name"] for p in client.get(f"/api/v1/billing/plans/{query}").json()]

    # The public pricing page is the same call without ?all: unchanged, even
    # for the owner browsing her own site.
    assert names(_client(owner)) == ["On"]
    assert names(_client(owner), "?all=1") == ["On", "Off"]
    assert names(_client(student), "?all=1") == ["On"]
    assert names(_client(), "?all=1") == ["On"]

    assert _client(owner).get(f"/api/v1/billing/plans/{off.pk}/").status_code == 200
    assert _client(student).get(f"/api/v1/billing/plans/{off.pk}/").status_code == 404
    assert _client(student).get(f"/api/v1/billing/plans/{on.pk}/").status_code == 200


# ── Payments ─────────────────────────────────────────────────────────────────


def test_sales_lists_what_students_paid_newest_first(owner, student):
    first = _payment(student)
    second = _payment(student, payment_type="subscription", amount=Decimal("19.00"))
    # Not sales: a refund row (its sale carries the refunded status) and the
    # coach's own Contentor charge.
    _payment(student, payment_type="refund")
    _payment(owner, platform_subscription_id=999)

    resp = _client(owner).get("/api/v1/billing/sales/")
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["count"] == 2
    assert [row["id"] for row in body["results"]] == [second.pk, first.pk]
    row = body["results"][0]
    assert row["student"] == {"id": student.pk, "name": "Sam Student", "email": "student@store.test"}
    assert row["amount"] == "19.00"
    assert row["items"] == []


def test_sales_pages(owner, student):
    for _ in range(3):
        _payment(student)
    body = _client(owner).get("/api/v1/billing/sales/?limit=2").json()
    assert body["count"] == 3
    assert len(body["results"]) == 2
    assert body["next"]


def test_sales_is_for_the_owner(owner, student):
    assert _client(student).get("/api/v1/billing/sales/").status_code == 403
    assert _client().get("/api/v1/billing/sales/").status_code in (401, 403)
