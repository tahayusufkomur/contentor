import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.tokens import create_wizard_token
from apps.core.models import Tenant

pytestmark = pytest.mark.django_db(transaction=True)

SHARED_DOMAIN = "shared-test.localhost"


def _client():
    return APIClient(HTTP_HOST=SHARED_DOMAIN)


def _token():
    return create_wizard_token("coach@x.com", "Coach", "Fin Studio")


@pytest.fixture()
def tenant(restore_public):
    connection.set_schema_to_public()
    original = Tenant.auto_create_schema
    Tenant.auto_create_schema = False
    try:
        t, _ = Tenant.objects.get_or_create(
            schema_name="fin_studio",
            defaults={
                "name": "Fin Studio",
                "slug": "fin-studio",
                "subdomain": "fin-studio",
                "owner_email": "coach@x.com",
            },
        )
        t.provisioning_status = "pending"
        t.template_seed_status = "pending"
        t.wizard_state = {}
        t.template_niche = ""
        t.template_goals = []
        t.save()
    finally:
        Tenant.auto_create_schema = original
    yield t
    connection.set_schema_to_public()
    Tenant.objects.filter(schema_name="fin_studio").delete()


@pytest.fixture()
def delay(monkeypatch):
    calls = []
    monkeypatch.setattr(
        "apps.core.tasks.provision_tenant.delay",
        lambda *args, **kwargs: calls.append(args),
    )
    return calls


def _finalize():
    return _client().post("/api/v1/onboarding/wizard/finalize/", {"token": _token()}, format="json")


def test_finalize_fills_defaults_and_enqueues(tenant, delay):
    tenant.wizard_state = {"answers": {"niche": "yoga", "theme": "slate"}}
    tenant.save(update_fields=["wizard_state"])

    resp = _finalize()
    assert resp.status_code == 202, resp.content

    tenant.refresh_from_db()
    answers = tenant.wizard_state["answers"]
    assert answers["theme"] == "slate"  # explicit answer preserved
    assert answers["font_family"] == "Nunito"  # yoga recommendation filled
    assert set(answers["page_layouts"]) == {"home", "about", "courses", "pricing", "faq", "contact"}
    assert answers["logo"]["mode"] == "wordmark"
    assert tenant.template_niche == "yoga"
    assert tenant.template_goals == ["sell_courses"]
    assert tenant.template_seed_status == "seeding"
    assert len(delay) == 1
    assert delay[0][0] == tenant.id
    assert delay[0][3] == "yoga"


def test_finalize_without_answers_uses_general(tenant, delay):
    resp = _finalize()
    assert resp.status_code == 202
    tenant.refresh_from_db()
    assert tenant.template_niche == "general"
    assert delay[0][3] == "general"


def test_finalize_idempotent(tenant, delay):
    assert _finalize().status_code == 202
    resp2 = _finalize()
    assert resp2.status_code == 200
    assert resp2.json()["template_status"] == "seeding"
    assert len(delay) == 1
