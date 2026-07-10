"""Admin-kit framework tests: registries, metadata, CRUD, permissions, actions.

Covers both sites — `platform-admin` (superadmin, shared models) and
`studio-admin` (coach, tenant models) — through the public HTTP contract.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone
from django_tenants.utils import schema_context
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import Payment, Subscription, SubscriptionPlan
from apps.core.currency import tenant_charge_currency
from apps.core.models import Domain, PlatformPlan, Tenant, WebhookEvent
from apps.courses.models import Course

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db


def make_client(user=None, host=SHARED_DOMAIN):
    client = APIClient(HTTP_HOST=host)
    if user is not None:
        client.force_authenticate(user=user)
    return client


# ---------------------------------------------------------------------------
# Studio site (coach admin, tenant schema)
# ---------------------------------------------------------------------------


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@adminkit.test", name="Owner", role="owner")


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(email="coach@adminkit.test", name="Coach", role="coach")


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(email="student@adminkit.test", name="Student", role="student")


@pytest.fixture()
def plans(tenant_ctx):
    gold = SubscriptionPlan.objects.create(name="Gold", price="49.90", currency="USD", billing_interval_months=1)
    silver = SubscriptionPlan.objects.create(
        name="Silver", price="19.90", currency="USD", billing_interval_months=12, is_active=False, sort_order=1
    )
    return gold, silver


def test_studio_site_meta_lists_models_per_role(owner, coach, student):
    body = make_client(owner).get("/api/v1/studio-admin/meta/").json()
    assert {m["key"] for m in body["models"]} == {
        "courses",
        "subscription-plans",
        "bundles",
        "payments",
        "users",
        "community-posts",
        "community-comments",
        "community-reports",
        "community-members",
    }

    # Billing admins require the owner role; a coach sees courses + users
    # (users carries the "log in as student" action, open to coaches) plus the
    # community moderation panels, which are IsCoachOrOwner like day-to-day
    # moderation at /admin/community. Filters are managed inline on the
    # course/event forms, not in the schema admin.
    body = make_client(coach).get("/api/v1/studio-admin/meta/").json()
    assert {m["key"] for m in body["models"]} == {
        "courses",
        "users",
        "community-posts",
        "community-comments",
        "community-reports",
        "community-members",
    }

    assert make_client(student).get("/api/v1/studio-admin/meta/").status_code == 403


def test_studio_model_meta_contract(owner):
    body = make_client(owner).get("/api/v1/studio-admin/subscription-plans/meta/").json()
    fields = {f["name"]: f for f in body["form_fields"]}
    assert fields["billing_interval_months"]["min_value"] == 1
    assert fields["billing_interval_months"]["max_value"] == 36
    assert fields["currency"]["read_only"] is True
    assert fields["price"]["type"] == "decimal"
    # Model-level defaults must surface so auto-forms start from them.
    assert fields["is_active"]["default"] is True
    assert fields["billing_interval_months"]["default"] == 1
    assert {a["name"] for a in body["actions"]} == {"activate", "deactivate"}
    assert body["can_create"] is True
    assert body["search_enabled"] is True


def test_plan_create_forces_tenant_currency(owner):
    resp = make_client(owner).post(
        "/api/v1/studio-admin/subscription-plans/",
        {"name": "Quarterly", "price": "99.00", "billing_interval_months": 3, "currency": "EUR"},
        format="json",
    )
    assert resp.status_code == 201, resp.content
    plan = SubscriptionPlan.objects.get(name="Quarterly")
    assert plan.billing_interval_months == 3
    assert plan.currency == tenant_charge_currency()  # user-supplied EUR ignored


def test_plan_list_search_filter_ordering_pagination(owner, plans):
    client = make_client(owner)

    rows = client.get("/api/v1/studio-admin/subscription-plans/", {"q": "gold"}).json()
    assert [r["name"] for r in rows["results"]] == ["Gold"]

    rows = client.get("/api/v1/studio-admin/subscription-plans/", {"is_active": "false"}).json()
    assert [r["name"] for r in rows["results"]] == ["Silver"]

    rows = client.get("/api/v1/studio-admin/subscription-plans/", {"ordering": "-price"}).json()
    assert [r["name"] for r in rows["results"]] == ["Gold", "Silver"]

    rows = client.get("/api/v1/studio-admin/subscription-plans/", {"page_size": 1}).json()
    assert rows["count"] == 2
    assert len(rows["results"]) == 1


def test_plan_update_respects_readonly_fields(owner, plans):
    gold = plans[0]
    resp = make_client(owner).patch(
        f"/api/v1/studio-admin/subscription-plans/{gold.pk}/",
        {"price": "59.90", "currency": "EUR", "stripe_price_id": "price_hack"},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    gold.refresh_from_db()
    assert str(gold.price) == "59.90"
    assert gold.currency == "USD"
    assert gold.stripe_price_id == ""


def test_plan_delete_blocked_while_subscribed(owner, student, plans):
    gold = plans[0]
    Subscription.objects.create(
        student=student,
        plan=gold,
        billing_amount=gold.price,
        billing_currency=gold.currency,
        current_period_start=timezone.now(),
        current_period_end=timezone.now() + timedelta(days=30),
    )
    resp = make_client(owner).delete(f"/api/v1/studio-admin/subscription-plans/{gold.pk}/")
    assert resp.status_code == 409

    silver = plans[1]
    assert make_client(owner).delete(f"/api/v1/studio-admin/subscription-plans/{silver.pk}/").status_code == 204


def test_plan_bulk_action(owner, plans):
    client = make_client(owner)
    resp = client.post(
        "/api/v1/studio-admin/subscription-plans/actions/deactivate/",
        {"ids": [p.pk for p in plans]},
        format="json",
    )
    assert resp.status_code == 200
    assert "2" in resp.json()["detail"]
    assert not SubscriptionPlan.objects.filter(is_active=True).exists()

    base = "/api/v1/studio-admin/subscription-plans/actions"
    assert client.post(f"{base}/deactivate/", {"ids": []}, format="json").status_code == 400
    assert client.post(f"{base}/nope/", {"ids": [1]}, format="json").status_code == 404


def test_billing_admins_require_owner_role(coach, plans):
    assert make_client(coach).get("/api/v1/studio-admin/subscription-plans/").status_code == 403


def test_course_admin_capabilities(owner, coach):
    course = Course.objects.create(title="Yoga Basics", slug="yoga-basics", instructor=owner)
    client = make_client(coach)  # courses allow coaches too

    assert client.post("/api/v1/studio-admin/courses/", {"title": "X"}, format="json").status_code == 405
    assert client.delete(f"/api/v1/studio-admin/courses/{course.pk}/").status_code == 405

    resp = client.post("/api/v1/studio-admin/courses/actions/publish/", {"ids": [course.pk]}, format="json")
    assert resp.status_code == 200
    course.refresh_from_db()
    assert course.is_published is True

    resp = client.patch(f"/api/v1/studio-admin/courses/{course.pk}/", {"title": "Yoga Fundamentals"}, format="json")
    assert resp.status_code == 200
    course.refresh_from_db()
    assert course.title == "Yoga Fundamentals"


def test_payments_are_read_only(owner, student):
    payment = Payment.objects.create(
        student=student,
        payment_type="one_time",
        status="completed",
        amount="10.00",
        platform_fee="1.00",
        submerchant_payout="9.00",
        currency="USD",
        provider="bypass",
    )
    client = make_client(owner)
    rows = client.get("/api/v1/studio-admin/payments/").json()
    assert rows["count"] == 1
    assert rows["results"][0]["student"]["label"]  # labeled FK

    assert client.post("/api/v1/studio-admin/payments/", {}, format="json").status_code == 405
    detail_url = f"/api/v1/studio-admin/payments/{payment.pk}/"
    assert client.patch(detail_url, {"status": "failed"}, format="json").status_code == 405
    assert client.delete(detail_url).status_code == 405


def test_studio_site_404_on_public_schema_host(restore_public):
    """The studio site must not resolve where tenant tables don't exist."""
    with schema_context("public"):
        public, _ = Tenant.objects.get_or_create(
            schema_name="public",
            defaults={"name": "Public", "slug": "public", "owner_email": "root@x.test", "subdomain": "public"},
        )
        Domain.objects.get_or_create(domain="public-host.localhost", defaults={"tenant": public, "is_primary": True})
    # Unsaved user: the schema guard must fire before any tenant-schema query.
    phantom = User(email="phantom@adminkit.test", role="owner")
    resp = make_client(phantom, host="public-host.localhost").get("/api/v1/studio-admin/meta/")
    assert resp.status_code == 404
    resp = make_client(phantom, host="public-host.localhost").get("/api/v1/studio-admin/subscription-plans/")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Platform site (superadmin, shared models)
# ---------------------------------------------------------------------------


@pytest.fixture()
def superuser(restore_public):
    return User.objects.create(
        email="root@adminkit.test", region="global", role="owner", is_staff=True, is_superuser=True
    )


def test_platform_site_requires_superuser(superuser, coach):
    assert make_client(coach).get("/api/v1/platform-admin/meta/").status_code == 403
    body = make_client(superuser).get("/api/v1/platform-admin/meta/").json()
    assert {m["key"] for m in body["models"]} == {
        "platform-plans",
        "tenants",
        "users",
        "platform-subscriptions",
        "webhook-events",
        "custom-domains",
        "domain-subscriptions",
        "platform-blog-posts",
        "platform-kb",
        "ai-transcripts",
        "help-bot-usage",
        "student-bot-usage",
        "blog-ai-usage",
        "logo-ai-usage",
    }


def test_platform_plan_crud_and_actions(superuser):
    client = make_client(superuser)
    resp = client.post(
        "/api/v1/platform-admin/platform-plans/",
        {"name": "kit-pro", "price_monthly": "29.00", "transaction_fee_pct": "5.00"},
        format="json",
    )
    assert resp.status_code == 201, resp.content
    plan_id = resp.json()["id"]

    resp = client.post("/api/v1/platform-admin/platform-plans/actions/archive/", {"ids": [plan_id]}, format="json")
    assert resp.status_code == 200
    assert PlatformPlan.objects.get(pk=plan_id).is_active is False

    assert client.delete(f"/api/v1/platform-admin/platform-plans/{plan_id}/").status_code == 405


def test_tenant_admin_excludes_public_and_labels_fk(superuser, restore_public):
    plan = PlatformPlan.objects.create(name="kit-starter", price_monthly="9.00", transaction_fee_pct="8.00")
    Tenant.objects.filter(pk=restore_public.pk).update(plan=plan)
    Tenant.objects.get_or_create(
        schema_name="public",
        defaults={"name": "Public", "slug": "public", "owner_email": "root@x.test", "subdomain": "public"},
    )

    client = make_client(superuser)
    rows = client.get("/api/v1/platform-admin/tenants/").json()
    slugs = [r["slug"] for r in rows["results"]]
    assert "public" not in slugs
    row = next(r for r in rows["results"] if r["slug"] == restore_public.slug)
    assert row["plan"] == {"value": plan.pk, "label": "kit-starter"}

    # Writable: plan. Readonly: slug.
    resp = client.patch(
        f"/api/v1/platform-admin/tenants/{restore_public.pk}/", {"plan": None, "slug": "hacked"}, format="json"
    )
    assert resp.status_code == 200, resp.content
    restore_public.refresh_from_db()
    assert restore_public.plan is None
    assert restore_public.slug == "shared-test"

    options = client.get("/api/v1/platform-admin/tenants/autocomplete/plan/", {"q": "kit-"}).json()["results"]
    assert {o["label"] for o in options} >= {"kit-starter"}


def test_webhook_admin_computed_state(superuser):
    WebhookEvent.objects.create(
        provider="stripe", provider_event_id="evt_kit_1", event_type="invoice.paid", processing_error="boom"
    )
    client = make_client(superuser)
    rows = client.get("/api/v1/platform-admin/webhook-events/", {"q": "evt_kit_1"}).json()
    assert rows["results"][0]["state"] == "failed"
    detail_url = f"/api/v1/platform-admin/webhook-events/{rows['results'][0]['id']}/"
    assert client.patch(detail_url, {"event_type": "x"}, format="json").status_code == 405
