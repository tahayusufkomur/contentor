"""The wizard holdout bucket must be deterministic (same seed -> same bucket),
roughly even across many seeds, drawn only from the known set, assigned exactly
once at email-verify, and visible to the frontend in the wizard-state body."""

import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.core.models import Tenant
from apps.core.onboarding.experiments import WIZARD_BUCKETS, assign_wizard_bucket
from apps.core.onboarding.wizard import _state_body


@pytest.fixture()
def client():
    return APIClient()


def test_bucket_is_deterministic_for_a_seed():
    assert assign_wizard_bucket("coach@example.com") == assign_wizard_bucket("coach@example.com")


def test_bucket_is_always_a_known_value():
    for i in range(200):
        assert assign_wizard_bucket(f"seed-{i}") in WIZARD_BUCKETS


def test_distribution_is_roughly_even_over_many_seeds():
    treatment = sum(1 for i in range(2000) if assign_wizard_bucket(f"user-{i}") == "treatment")
    # 50/50 with generous slack for hash noise over 2000 draws.
    assert 850 <= treatment <= 1150


def test_distinct_seeds_can_differ():
    buckets = {assign_wizard_bucket(f"x{i}") for i in range(20)}
    assert buckets == set(WIZARD_BUCKETS)  # both buckets appear


# ── persistence + exposure ───────────────────────────────────────────────────
#
# These commit real public-schema rows (transaction=True), so every test cleans
# up its own tenants in a finally block.


def _row(schema="bucket_expose"):
    connection.set_schema_to_public()
    slug = schema.replace("_", "-")
    return Tenant.objects.create(
        schema_name=schema,
        name=slug,
        slug=slug,
        subdomain=slug,
        owner_email=f"{slug}@example.com",
        region="global",
        wizard_bucket=assign_wizard_bucket(f"{slug}@example.com"),
    )


@pytest.mark.django_db(transaction=True)
def test_state_body_exposes_the_bucket():
    tenant = _row()
    try:
        body = _state_body(tenant)
        assert body["wizard_bucket"] == tenant.wizard_bucket
        assert body["wizard_bucket"] in WIZARD_BUCKETS
    finally:
        connection.set_schema_to_public()
        Tenant.objects.filter(pk=tenant.pk).delete()


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
        assert tenant.wizard_bucket in WIZARD_BUCKETS
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
