"""The store and a plan's page show the kept cover of a course or an event: `cover_design` on their items."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.contrib.contenttypes.models import ContentType
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import Bundle, SubscriptionPlan, SubscriptionPlanAccess
from apps.courses.models import Course
from apps.downloads.models import DownloadFile
from apps.live.models import LiveClass, LiveStream, OnsiteEvent
from apps.media import designs
from apps.media.models import Photo

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"
STORE = "/api/v1/billing/store/"
PRODUCTS = "/api/v1/billing/products/"


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="billing-cover-owner@x.com", name="Owner", password="x", role="owner", is_staff=True
    )


def client(user=None):
    c = APIClient(HTTP_HOST=HOST)
    if user is not None:
        c.force_authenticate(user=user)
    return c


def photo(name):
    # "demo/" is a shared prefix every tenant may be handed a link to.
    return Photo.objects.create(s3_key=f"demo/{name}.jpg", title=name)


def paid(owner, number=0):
    """One paid course and one paid event of each kind, numbered; returns each with its design kind and key."""
    soon = timezone.now() + timedelta(days=3 + number)
    event = {"instructor": owner, "pricing_type": "paid", "price": Decimal("20.00"), "scheduled_at": soon}
    course = Course.objects.create(
        title=f"Course {number}", instructor=owner, pricing_type="paid", price=Decimal("99.00"), is_published=True
    )
    return [
        (course, "course", str(course.pk)),
        (LiveClass.objects.create(title=f"Class {number}", **event), "live", f"Class {number}"),
        (LiveStream.objects.create(title=f"Stream {number}", **event), "stream", f"Stream {number}"),
        (
            OnsiteEvent.objects.create(title=f"Retreat {number}", status="scheduled", **event),
            "onsite",
            f"Retreat {number}",
        ),
    ]


def kept(kind, key, picture):
    draft = designs.open_draft(kind, key, recipe={"photo": {"id": str(picture.pk)}})
    designs.keep(draft)
    return draft


def link(plan, obj):
    return SubscriptionPlanAccess.objects.create(
        plan=plan, content_type=ContentType.objects.get_for_model(type(obj)), object_id=obj.pk
    )


def design_reads(captured):
    """How often a request read the kept designs."""
    return sum('"media_design"' in query["sql"] for query in captured.captured_queries)


def test_store_items_carry_the_cover_design(owner):
    content = paid(owner)
    DownloadFile.objects.create(title="Guide", pricing_type="paid", price=Decimal("5.00"))
    Bundle.objects.create(name="Bundle", price=Decimal("50.00"), currency="USD", is_active=True)

    def covers(path, user=None):
        response = client(user).get(path)
        assert response.status_code == 200, response.content
        return {item["title"]: item["cover_design"] for item in response.json()}

    titles = {obj.title for obj, _kind, _key in content} | {"Guide", "Bundle"}
    assert covers(STORE) == dict.fromkeys(titles)  # no design yet: the plain photo

    made = {obj.title: kept(kind, key, photo(obj.title)) for obj, kind, key in content}

    for got in (covers(STORE), covers(PRODUCTS, owner)):
        assert {title: got[title]["id"] for title in made} == {title: str(d.pk) for title, d in made.items()}
        assert set(got["Course 0"]) == {"id", "recipe", "photos", "logo_url", "look"}
        assert (got["Guide"], got["Bundle"]) == (None, None)  # nothing to design a cover for


def test_plan_items_carry_the_cover_design(owner):
    content = paid(owner)
    download = DownloadFile.objects.create(title="Guide", pricing_type="subscription")
    plan = SubscriptionPlan.objects.create(name="Basic", price=Decimal("29.99"), currency="USD", is_active=True)
    for obj in [*(obj for obj, _kind, _key in content), download]:
        link(plan, obj)

    def covers():
        response = client().get(f"/api/v1/billing/plans/{plan.pk}/")
        assert response.status_code == 200, response.content
        return {item["title"]: item.get("cover_design") for item in response.json()["items"]}

    assert covers() == dict.fromkeys([*(obj.title for obj, _kind, _key in content), "Guide"])

    made = {obj.title: kept(kind, key, photo(obj.title)) for obj, kind, key in content}

    got = covers()
    assert {title: got[title]["id"] for title in made} == {title: str(d.pk) for title, d in made.items()}
    assert got["Guide"] is None


def test_items_carry_the_date_their_cover_badge_reads(owner):
    """A cover's badge follows its item: "New" by when a course was made, the date by when an event starts."""
    content = paid(owner)
    download = DownloadFile.objects.create(title="Guide", pricing_type="paid", price=Decimal("5.00"))
    Bundle.objects.create(name="Bundle", price=Decimal("50.00"), currency="USD", is_active=True)
    plan = SubscriptionPlan.objects.create(name="Basic", price=Decimal("29.99"), currency="USD", is_active=True)
    for obj in [*(obj for obj, _kind, _key in content), download]:
        link(plan, obj)

    def when(value):
        return parse_datetime(value) if value else None

    def dates(path, user=None):
        response = client(user).get(path)
        assert response.status_code == 200, response.content
        items = response.json()
        items = items["items"] if isinstance(items, dict) else items  # a plan's page, or a list
        return {item["title"]: (when(item.get("created_at")), when(item.get("scheduled_at"))) for item in items}

    course = content[0][0]
    expected = {
        obj.title: (obj.created_at, None) if obj is course else (None, obj.scheduled_at) for obj, _kind, _key in content
    }
    for got in (dates(STORE), dates(PRODUCTS, owner), dates(f"/api/v1/billing/plans/{plan.pk}/")):
        assert {title: got[title] for title in expected} == expected
        assert got["Guide"] == (None, None)  # nothing to design a cover for
    assert dates(STORE)["Bundle"] == (None, None)
    # The course was made today, so its cover would read "New" (the badge counts 30 days).
    assert timezone.now() - dates(STORE)[course.title][0] < timedelta(days=1)


def test_cover_reads_do_not_grow_with_items(owner):
    plan = SubscriptionPlan.objects.create(name="Basic", price=Decimal("29.99"), currency="USD", is_active=True)

    def add(count, start):
        for number in range(start, start + count):
            for obj, kind, key in paid(owner, number):
                kept(kind, key, photo(obj.title))
                link(plan, obj)

    def reads(path):
        with CaptureQueriesContext(connection) as captured:
            assert client(owner).get(path).status_code == 200
        return design_reads(captured)

    def every_page():
        return [reads(path) for path in (STORE, PRODUCTS, f"/api/v1/billing/plans/{plan.pk}/")]

    add(2, 0)
    few = every_page()
    add(3, 2)

    assert all(few)  # the designs are read at all,
    assert every_page() == few  # and once per request, however many items it lists
