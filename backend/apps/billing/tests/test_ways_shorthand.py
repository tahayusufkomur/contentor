"""The item endpoints' pricing_type / price shorthand writes through the ways, and the one-off data migration."""

from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import SubscriptionPlan, SubscriptionPlanAccess
from apps.billing.ways import link_unlinked_members_only, ways_of
from apps.courses.models import Course
from apps.downloads.models import DownloadFile

pytestmark = pytest.mark.django_db(transaction=True)


def make_client(user):
    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=user)
    return client


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@shorthand.test", name="Owner", password="secret123", role="owner")


@pytest.fixture()
def gold(tenant_ctx):
    return SubscriptionPlan.objects.create(name="Gold", price=Decimal("29.00"), currency="EUR")


def test_posting_a_paid_course_goes_through_the_writer(owner):
    resp = make_client(owner).post(
        "/api/v1/courses/", {"title": "Paid", "pricing_type": "paid", "price": "49"}, format="json"
    )
    assert resp.status_code == 201, resp.content
    ways = ways_of(Course.objects.get(title="Paid"))
    assert ways["buy"] == {"price": "49.00", "window": None}
    assert ways["free"] is None


def test_a_price_put_on_a_members_only_course_keeps_its_plans(owner, gold):
    course = Course.objects.create(title="Members", slug="members", instructor=owner, pricing_type="subscription")
    SubscriptionPlanAccess.objects.create(plan=gold, content_object=course)
    resp = make_client(owner).put(f"/api/v1/courses/{course.slug}/", {"price": "25"}, format="json")
    assert resp.status_code == 200, resp.content
    ways = ways_of(Course.objects.get(pk=course.pk))
    assert ways["buy"]["price"] == "25.00"
    assert [p["plan_id"] for p in ways["plans"]] == [gold.pk]


def test_a_members_only_download_without_a_plan_is_refused_and_not_created(owner):
    resp = make_client(owner).post(
        "/api/v1/downloads/", {"title": "Guide", "file_url": "", "pricing_type": "subscription"}, format="json"
    )
    assert resp.status_code == 400, resp.content
    assert "pricing_type" in resp.json()
    assert not DownloadFile.objects.filter(title="Guide").exists()


def test_an_unlinked_members_only_item_gets_every_active_plan(owner, gold):
    silver = SubscriptionPlan.objects.create(name="Silver", price=Decimal("19.00"), currency="EUR")
    SubscriptionPlan.objects.create(name="Old", price=Decimal("9.00"), currency="EUR", is_active=False)
    loose = Course.objects.create(title="Loose", slug="loose", instructor=owner, pricing_type="subscription")
    named = Course.objects.create(title="Named", slug="named", instructor=owner, pricing_type="subscription")
    SubscriptionPlanAccess.objects.create(plan=gold, content_object=named)

    assert link_unlinked_members_only() == 1

    assert {p["plan_id"] for p in ways_of(loose)["plans"]} == {gold.pk, silver.pk}
    assert [p["plan_id"] for p in ways_of(named)["plans"]] == [gold.pk]
    assert link_unlinked_members_only() == 0
