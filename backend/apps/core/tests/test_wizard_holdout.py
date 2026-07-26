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
