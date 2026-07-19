import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.tokens import create_signup_token, create_wizard_token
from apps.core.models import Tenant

pytestmark = pytest.mark.django_db(transaction=True)

SHARED_DOMAIN = "shared-test.localhost"


def _client():
    return APIClient(HTTP_HOST=SHARED_DOMAIN)


def _token(email="coach@x.com", brand="Wiz Studio"):
    return create_wizard_token(email, "Coach", brand)


@pytest.fixture()
def tenant(restore_public):
    # Row-only tenant (no schema): wizard endpoints never enter the tenant
    # schema. Mirrors apps/core/tests/test_onboarding_handoff.py.
    connection.set_schema_to_public()
    original = Tenant.auto_create_schema
    Tenant.auto_create_schema = False
    try:
        t, _ = Tenant.objects.get_or_create(
            schema_name="wiz_studio",
            defaults={
                "name": "Wiz Studio",
                "slug": "wiz-studio",
                "subdomain": "wiz-studio",
                "owner_email": "coach@x.com",
            },
        )
        t.provisioning_status = "pending"
        t.template_seed_status = "pending"
        t.wizard_state = {}
        t.save(update_fields=["provisioning_status", "template_seed_status", "wizard_state"])
    finally:
        Tenant.auto_create_schema = original
    yield t
    connection.set_schema_to_public()
    Tenant.objects.filter(schema_name="wiz_studio").delete()


def test_wizard_state_defaults_to_empty_dict(tenant):
    tenant.refresh_from_db()
    assert tenant.wizard_state == {}


def _read(token):
    return _client().post("/api/v1/onboarding/wizard/state/", {"token": token}, format="json")


def _patch(token, **body):
    return _client().patch("/api/v1/onboarding/wizard/state/", {"token": token, **body}, format="json")


def test_read_state_empty(tenant):
    resp = _read(_token())
    assert resp.status_code == 200, resp.content
    data = resp.json()
    assert data["slug"] == "wiz-studio"
    assert data["state"] == {}
    assert data["has_paid_platform_plan"] is False


def test_patch_merges_answers_and_stamps(tenant):
    resp = _patch(_token(), answers={"niche": "yoga"}, current_step="business.describe")
    assert resp.status_code == 200, resp.content
    resp2 = _patch(_token(), answers={"theme": "forest"})
    state = resp2.json()["state"]
    assert state["answers"] == {"niche": "yoga", "theme": "forest"}
    assert state["current_step"] == "business.describe"
    assert set(state["step_timestamps"]) == {"niche", "theme"}
    tenant.refresh_from_db()
    assert tenant.wizard_state["answers"]["niche"] == "yoga"


def test_patch_rejects_invalid_answers(tenant):
    resp = _patch(_token(), answers={"theme": "neon"})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "invalid_answers"
    tenant.refresh_from_db()
    assert tenant.wizard_state == {}


def test_patch_rejects_unknown_key(tenant):
    assert _patch(_token(), answers={"evil": 1}).status_code == 400


def test_patch_409_once_seeding(tenant):
    tenant.template_seed_status = "seeding"
    tenant.save(update_fields=["template_seed_status"])
    resp = _patch(_token(), answers={"theme": "forest"})
    assert resp.status_code == 409
    assert _read(_token()).status_code == 200  # reads still fine


def test_signup_token_accepted(tenant):
    signup = create_signup_token("coach@x.com", "Coach", "Wiz Studio")
    assert _read(signup).status_code == 200


def test_bad_token_rejected(tenant):
    assert _read("garbage").status_code == 400


def test_verify_response_includes_wizard_token(restore_public):
    from apps.accounts.tokens import verify_wizard_token

    connection.set_schema_to_public()
    signup = create_signup_token("new@x.com", "Coach", "Fresh Studio")
    resp = _client().post("/api/v1/onboarding/signup/verify/", {"token": signup}, format="json")
    assert resp.status_code in (200, 201), resp.content
    wizard_token = resp.json()["wizard_token"]
    assert verify_wizard_token(wizard_token)["purpose"] == "wizard"
    Tenant.objects.filter(slug="fresh-studio").delete()


def test_business_chapter_patch_enqueues_logo_rank(tenant, monkeypatch):
    from apps.core import tasks as core_tasks

    calls = []
    monkeypatch.setattr(core_tasks.rank_curated_logos, "delay", lambda tenant_id: calls.append(tenant_id))

    _patch(_token(), answers={"niche": "yoga"})
    assert calls == []  # description not yet present
    _patch(_token(), answers={"description": "Vinyasa for busy professionals"})
    assert calls == [tenant.id]


def test_theme_patch_does_not_enqueue_logo_rank(tenant, monkeypatch):
    from apps.core import tasks as core_tasks

    calls = []
    monkeypatch.setattr(core_tasks.rank_curated_logos, "delay", lambda tenant_id: calls.append(tenant_id))
    _patch(_token(), answers={"niche": "yoga"})
    _patch(_token(), answers={"theme": "forest"})
    assert calls == []
