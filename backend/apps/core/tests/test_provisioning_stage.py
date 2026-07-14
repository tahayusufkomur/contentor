import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.core.models import Tenant

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def tenant(restore_public):
    connection.set_schema_to_public()
    t, _ = Tenant.objects.get_or_create(
        schema_name="stage_studio",
        defaults={
            "name": "Stage Studio",
            "slug": "stage-studio",
            "subdomain": "stage-studio",
            "owner_email": "coach@x.com",
        },
    )
    t.provisioning_status = "provisioning"
    t.wizard_state = {"provisioning_stage": "ai_copy"}
    t.save(update_fields=["provisioning_status", "wizard_state"])
    yield t
    connection.set_schema_to_public()
    Tenant.objects.filter(schema_name="stage_studio").delete()


def test_status_endpoint_exposes_stage(tenant):
    resp = APIClient(HTTP_HOST="shared-test.localhost").get("/api/v1/onboarding/status/", {"slug": "stage-studio"})
    assert resp.status_code == 200
    assert resp.json()["stage"] == "ai_copy"


def test_status_endpoint_stage_null_without_wizard(tenant):
    tenant.wizard_state = {}
    tenant.save(update_fields=["wizard_state"])
    resp = APIClient(HTTP_HOST="shared-test.localhost").get("/api/v1/onboarding/status/", {"slug": "stage-studio"})
    assert resp.json()["stage"] is None


def test_set_stage_helper_preserves_other_state():
    from apps.core.tasks import _set_provisioning_stage

    connection.set_schema_to_public()
    t = Tenant.objects.create(
        schema_name="stage_h",
        name="H",
        slug="stage-h",
        subdomain="stage-h",
        owner_email="h@x.com",
        wizard_state={"answers": {"niche": "yoga"}},
    )
    try:
        _set_provisioning_stage(t, "seed")
        t.refresh_from_db()
        assert t.wizard_state["provisioning_stage"] == "seed"
        assert t.wizard_state["answers"] == {"niche": "yoga"}
    finally:
        Tenant.objects.filter(schema_name="stage_h").delete()
