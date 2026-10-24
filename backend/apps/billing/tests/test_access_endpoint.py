"""The access endpoint: one URL the Access section loads and saves an item's ways in through."""

from decimal import Decimal

import pytest
from django.contrib.contenttypes.models import ContentType
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import Bundle, BundleItem, SubscriptionPlan
from apps.billing.ways import ways_of
from apps.core.models import Tenant
from apps.courses.models import Course

pytestmark = pytest.mark.django_db(transaction=True)

SHARED_DOMAIN = "shared-test.localhost"


def make_client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


@pytest.fixture(autouse=True)
def euro(tenant_ctx):
    """The tenant charges in EUR. Saved, because a request loads the tenant afresh from its host."""
    was = tenant_ctx.billing_currency
    Tenant.objects.filter(pk=tenant_ctx.pk).update(billing_currency="EUR")
    tenant_ctx.billing_currency = "EUR"
    yield
    Tenant.objects.filter(pk=tenant_ctx.pk).update(billing_currency=was)
    tenant_ctx.billing_currency = was


def _user(role):
    return User.objects.create_user(email=f"{role}@access.test", name=role, password="secret123", role=role)


@pytest.fixture()
def owner(tenant_ctx):
    return _user("owner")


@pytest.fixture()
def coach(tenant_ctx):
    return _user("coach")


@pytest.fixture()
def student(tenant_ctx):
    return _user("student")


@pytest.fixture()
def course(tenant_ctx, owner):
    return Course.objects.create(
        title="Access Course", slug="access-course", instructor=owner, pricing_type="paid", price=Decimal("49.00")
    )


@pytest.fixture()
def gold(tenant_ctx):
    return SubscriptionPlan.objects.create(name="Gold", price=Decimal("19.00"), currency="EUR")


def url(kind, pk):
    return f"/api/v1/admin/access/{kind}/{pk}/"


def test_get_returns_the_ways_and_the_choices(owner, course, gold):
    off_sale = SubscriptionPlan.objects.create(name="Old", price=Decimal("9.00"), currency="EUR", is_active=False)
    pack = Bundle.objects.create(name="Starter pack", price=Decimal("79.00"), currency="EUR")
    BundleItem.objects.create(bundle=pack, content_type=ContentType.objects.get_for_model(course), object_id=course.pk)

    resp = make_client(owner).get(url("course", course.pk))

    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["kind"] == "course" and body["id"] == course.pk
    assert body["ways"] == {"free": None, "buy": {"price": "49.00", "window": None}, "plans": []}
    assert body["describe"] == "€49 once, theirs to keep."
    assert body["currency"] == "EUR"
    assert body["allowed"] == ["free", "buy", "plans"]
    assert body["can_edit_plans"] is True
    assert {p["id"]: p for p in body["plans"]} == {
        gold.pk: {
            "id": gold.pk,
            "name": "Gold",
            "price": "19.00",
            "billing_interval_months": gold.billing_interval_months,
            "is_active": True,
        },
        off_sale.pk: {
            "id": off_sale.pk,
            "name": "Old",
            "price": "9.00",
            "billing_interval_months": off_sale.billing_interval_months,
            "is_active": False,
        },
    }
    assert body["bundles"] == [{"id": pack.pk, "name": "Starter pack", "price": "79.00"}]


def test_choices_for_a_new_item(owner, gold):
    client = make_client(owner)

    resp = client.get(url("course", 0) + "?choices=1")

    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["id"] is None and body["kind"] == "course"
    assert body["describe"] == ""
    assert body["ways"] == {"free": {"window": None}, "buy": None, "plans": []}
    assert body["bundles"] == []
    assert [p["id"] for p in body["plans"]] == [gold.pk]
    assert client.get(url("course", 0)).status_code == 404


def test_put_saves_and_answers_with_plain_words(owner, course, gold):
    ways = {
        "free": None,
        "buy": {"price": "59", "window": {"closes_after_days": 365}},
        "plans": [{"plan_id": gold.pk, "window": None}],
    }

    resp = make_client(owner).put(url("course", course.pk), {"ways": ways}, format="json")

    assert resp.status_code == 200, resp.content
    body = resp.json()
    course.refresh_from_db()
    assert body["describe"] == "€59 once with 1 year of access; in Gold."
    assert (
        body["ways"]
        == ways_of(course)
        == {
            "free": None,
            "buy": {"price": "59.00", "window": {"closes_after_days": 365}},
            "plans": [{"plan_id": gold.pk, "window": None}],
        }
    )
    assert course.price == Decimal("59.00")


def test_a_coach_gets_can_edit_plans_false_and_cannot_change_them(coach, course, gold):
    client = make_client(coach)
    assert client.get(url("course", course.pk)).json()["can_edit_plans"] is False

    ways = {"free": None, "buy": {"price": "49", "window": None}, "plans": [{"plan_id": gold.pk, "window": None}]}
    resp = client.put(url("course", course.pk), {"ways": ways}, format="json")

    assert resp.status_code == 400
    assert resp.json()["code"] == "owner_only"
    assert ways_of(course)["plans"] == []


def test_a_student_is_refused(student, course):
    client = make_client(student)
    assert client.get(url("course", course.pk)).status_code == 403
    assert client.put(url("course", course.pk), {"ways": {}}, format="json").status_code == 403


def test_an_unknown_kind_is_a_404(owner, course):
    client = make_client(owner)
    assert client.get(url("nonsense", course.pk)).status_code == 404
    assert client.get(url("course", course.pk + 999)).status_code == 404
    assert client.put(url("nonsense", 1), {"ways": {}}, format="json").status_code == 404


def test_a_bad_window_is_a_400_with_its_sentence(owner, course):
    client = make_client(owner)
    ways = {"free": None, "buy": {"price": "49", "window": {"closes_after_days": 0}}, "plans": []}

    resp = client.put(url("course", course.pk), {"ways": ways}, format="json")

    assert resp.status_code == 400
    assert resp.json() == {
        "code": "window",
        "detail": "The dates for the one-time sale are not valid. Use whole days from 1 to 3650, or a calendar date.",
    }
    missing = client.put(url("course", course.pk), {}, format="json")
    assert missing.status_code == 400 and missing.json()["code"] == "ways"
