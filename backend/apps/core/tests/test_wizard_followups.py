"""describe-followups: wizard-token AI endpoint that turns the coach's
description into <=2 follow-up questions; fail-soft [] on any AI problem."""

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
    return create_wizard_token("coach@x.com", "Coach", "Followups Studio")


@pytest.fixture()
def tenant(restore_public):
    connection.set_schema_to_public()
    t, _ = Tenant.objects.get_or_create(
        schema_name="followups_studio",
        defaults={
            "name": "Followups Studio",
            "slug": "followups-studio",
            "subdomain": "followups-studio",
            "owner_email": "coach@x.com",
        },
    )
    t.provisioning_status = "pending"
    t.save(update_fields=["provisioning_status"])
    yield t
    connection.set_schema_to_public()
    Tenant.objects.filter(schema_name="followups_studio").delete()


def _post(description):
    return _client().post(
        "/api/v1/onboarding/wizard/describe-followups/",
        {"token": _token(), "description": description},
        format="json",
    )


def test_missing_token_400(tenant):
    resp = _client().post("/api/v1/onboarding/wizard/describe-followups/", {"description": "x"}, format="json")
    assert resp.status_code == 400


def test_empty_description_returns_no_questions(tenant):
    resp = _post("   ")
    assert resp.status_code == 200
    assert resp.json() == {"questions": []}


def test_ai_unavailable_returns_no_questions(tenant, monkeypatch):
    from apps.core.onboarding import wizard_followups

    monkeypatch.setattr(wizard_followups.ai_compose, "compose_available", lambda: False)
    resp = _post("Calm vinyasa for busy parents.")
    assert resp.status_code == 200
    assert resp.json() == {"questions": []}


def test_questions_generated_capped_and_spend_recorded(tenant, monkeypatch):
    from apps.core.onboarding import wizard_followups

    monkeypatch.setattr(wizard_followups.ai_compose, "compose_available", lambda: True)
    spends = []
    monkeypatch.setattr(wizard_followups.ai_compose, "record_spend", lambda schema, usd: spends.append((schema, usd)))

    def fake_structured(**kwargs):
        return (
            wizard_followups._Followups(
                questions=["Who are your students?", "  What makes you different?  ", "Three?"]
            ),
            0.01,
            "m",
        )

    monkeypatch.setattr(wizard_followups.core_ai, "structured", fake_structured)
    resp = _post("Calm vinyasa for busy parents.")
    assert resp.status_code == 200
    assert resp.json()["questions"] == ["Who are your students?", "What makes you different?"]
    assert spends == [("followups_studio", 0.01)]


def test_provider_failure_returns_empty_and_records_spend(tenant, monkeypatch):
    from apps.core.onboarding import wizard_followups

    monkeypatch.setattr(wizard_followups.ai_compose, "compose_available", lambda: True)
    spends = []
    monkeypatch.setattr(wizard_followups.ai_compose, "record_spend", lambda schema, usd: spends.append(usd))

    def boom(**kwargs):
        raise wizard_followups.core_ai.AiError("provider down")

    monkeypatch.setattr(wizard_followups.core_ai, "structured", boom)
    resp = _post("Calm vinyasa.")
    assert resp.status_code == 200
    assert resp.json() == {"questions": []}
    assert spends == [0.0]
