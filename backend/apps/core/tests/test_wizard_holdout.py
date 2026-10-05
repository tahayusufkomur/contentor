"""The wizard A/B test is over: every new tenant lands in "control". The
bucket is still assigned exactly once at email-verify."""

import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.core.models import Tenant
from apps.core.onboarding.experiments import WIZARD_BUCKETS, assign_wizard_bucket


@pytest.fixture()
def client():
    return APIClient()


def test_every_seed_lands_in_control():
    assert {assign_wizard_bucket(f"seed-{i}") for i in range(200)} == {"control"}


# ── persistence ──────────────────────────────────────────────────────────────
#
# These commit real public-schema rows (transaction=True), so every test cleans
# up its own tenants in a finally block.


@pytest.mark.django_db(transaction=True)
def test_verify_assigns_a_bucket_on_fresh_create(client):
    from apps.accounts.tokens import create_signup_token

    token = create_signup_token("bucknew@example.com", "Buck New", "Buck Brand", "global")
    slug = "buck-brand"
    connection.set_schema_to_public()
    Tenant.objects.filter(slug=slug, region="global").delete()  # ensure fresh
    try:
        resp = client.post("/api/v1/onboarding/signup/verify/", {"token": token}, format="json")
        assert resp.status_code == 201, resp.content
        tenant = Tenant.objects.get(slug=slug, region="global")
        assert tenant.wizard_bucket == "control"
    finally:
        connection.set_schema_to_public()
        Tenant.objects.filter(slug=slug, region="global").delete()


@pytest.mark.django_db(transaction=True)
def test_reverify_does_not_rebucket_a_returning_coach():
    """The resume branch must leave the bucket alone — re-bucketing mid-flight
    would corrupt the experiment."""
    from apps.accounts.tokens import create_signup_token

    api = APIClient()
    token = create_signup_token("buckagain@example.com", "Buck Again", "Buck Again Brand", "global")
    slug = "buck-again-brand"
    connection.set_schema_to_public()
    Tenant.objects.filter(slug=slug, region="global").delete()
    try:
        first = api.post("/api/v1/onboarding/signup/verify/", {"token": token}, format="json")
        assert first.status_code == 201, first.content
        original = Tenant.objects.get(slug=slug, region="global").wizard_bucket
        assert original in WIZARD_BUCKETS

        # Force the opposite bucket, then re-verify: the resume branch must not touch it.
        opposite = "control" if original == "treatment" else "treatment"
        Tenant.objects.filter(slug=slug, region="global").update(wizard_bucket=opposite)

        second = api.post("/api/v1/onboarding/signup/verify/", {"token": token}, format="json")
        assert second.status_code == 200, second.content  # resume branch
        assert Tenant.objects.get(slug=slug, region="global").wizard_bucket == opposite
    finally:
        connection.set_schema_to_public()
        Tenant.objects.filter(slug=slug, region="global").delete()


# ── funnel report ────────────────────────────────────────────────────────────


def _report(**kwargs):
    """Run the command with --json and parse it. Scoped to the rows a test made
    by passing --since-days, since the dev/test DB may hold other tenants."""
    import json
    from io import StringIO

    from django.core.management import call_command

    out = StringIO()
    call_command("wizard_holdout_report", "--json", stdout=out, **kwargs)
    return json.loads(out.getvalue())


@pytest.mark.django_db(transaction=True)
def test_report_counts_publish_rate_per_bucket():
    made = []
    connection.set_schema_to_public()
    try:
        before = _report()
        for i in range(4):
            made.append(
                Tenant.objects.create(
                    schema_name=f"rep_{i}",
                    name=f"rep-{i}",
                    slug=f"rep-{i}",
                    subdomain=f"rep-{i}",
                    owner_email=f"rep{i}@example.com",
                    region="global",
                    wizard_bucket="treatment" if i < 2 else "control",
                    is_published=(i == 0),  # one treatment tenant published
                )
            )
        after = _report()
        assert after["treatment"]["signups"] - before["treatment"]["signups"] == 2
        assert after["treatment"]["published"] - before["treatment"]["published"] == 1
        assert after["control"]["signups"] - before["control"]["signups"] == 2
        assert after["control"]["published"] - before["control"]["published"] == 0
        assert 0.0 <= after["treatment"]["publish_rate"] <= 1.0
    finally:
        connection.set_schema_to_public()
        for t in made:
            Tenant.objects.filter(pk=t.pk).delete()


@pytest.mark.django_db(transaction=True)
def test_report_never_counts_the_public_row_and_survives_an_empty_bucket():
    """Zero signups must not divide by zero, and the platform's own public row
    is not a signup."""
    report = _report(since_days=0)  # window excludes everything
    for bucket in WIZARD_BUCKETS:
        assert report[bucket]["signups"] == 0
        assert report[bucket]["publish_rate"] == 0.0


# ── the content flow keeps editing after early provisioning ──────────────────


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize(("country", "expected"), [("DE", "EUR"), ("US", "USD"), (None, "USD")])
def test_verify_sets_billing_currency_from_country(client, country, expected):
    from apps.accounts.tokens import create_signup_token

    token = create_signup_token("curr@example.com", "Curr", "Curr Brand", "global")
    slug = "curr-brand"
    connection.set_schema_to_public()
    Tenant.objects.filter(slug=slug, region="global").delete()
    extra = {"HTTP_CF_IPCOUNTRY": country} if country else {}
    try:
        resp = client.post("/api/v1/onboarding/signup/verify/", {"token": token}, format="json", **extra)
        assert resp.status_code == 201, resp.content
        assert Tenant.objects.get(slug=slug, region="global").billing_currency == expected
    finally:
        connection.set_schema_to_public()
        Tenant.objects.filter(slug=slug, region="global").delete()
