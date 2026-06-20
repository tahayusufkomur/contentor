"""Event ↔ filter_options round-trip + calendar feed exposure."""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.filters.models import FilterGroup, FilterOption
from apps.live.models import LiveClass

SHARED_DOMAIN = "shared-test.localhost"


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@eventfilter.com", name="Owner", password="secret123", role="owner"
    )


def make_client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


@pytest.fixture()
def option(tenant_ctx):
    g = FilterGroup.objects.create(name="Format", applies_to="event")
    return FilterOption.objects.create(group=g, name="Workshop")


@pytest.mark.django_db(transaction=True)
class TestEventFilterOptions:
    def test_live_class_create_round_trips_filter_option_ids(self, tenant_ctx, owner, option):
        resp = make_client(owner).post(
            "/api/v1/live/",
            {"title": "Morning Flow", "filter_option_ids": [option.pk]},
            format="json",
        )
        assert resp.status_code == 201, resp.content
        assert {o["id"] for o in resp.json()["filter_options"]} == {option.pk}

    def test_calendar_feed_includes_filter_options(self, tenant_ctx, owner, option):
        when = timezone.now() + timedelta(days=2)
        lc = LiveClass.objects.create(
            title="Scheduled Class", instructor=owner, pricing_type="free", scheduled_at=when
        )
        lc.filter_options.add(option)
        frm = (when - timedelta(days=1)).date().isoformat()
        to = (when + timedelta(days=1)).date().isoformat()
        resp = make_client(owner).get(f"/api/v1/calendar/?from={frm}&to={to}")
        assert resp.status_code == 200, resp.content
        event = next(e for e in resp.json() if e["title"] == "Scheduled Class")
        assert [o["name"] for o in event["filter_options"]] == ["Workshop"]
