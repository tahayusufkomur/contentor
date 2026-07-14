"""Wizard Funnel superadmin registration, through the adminkit HTTP contract."""

import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import Tenant

pytestmark = pytest.mark.django_db(transaction=True)

SHARED_DOMAIN = "shared-test.localhost"
LIST_URL = "/api/v1/platform-admin/wizard-funnel/"

STATE = {
    "version": 1,
    "current_step": "look.theme",
    "answers": {"niche": "yoga", "theme": "forest"},
    "step_timestamps": {
        "niche": "2026-07-14T09:00:00+00:00",
        "theme": "2026-07-14T09:05:00+00:00",
    },
}


def _client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


@pytest.fixture()
def superuser(restore_public):
    user, _ = User.objects.get_or_create(
        email="root@funnel.test",
        region="global",
        defaults={"role": "owner", "is_staff": True, "is_superuser": True},
    )
    return user


@pytest.fixture()
def tenants(restore_public):
    connection.set_schema_to_public()
    original = Tenant.auto_create_schema
    Tenant.auto_create_schema = False
    made = []
    try:
        for schema, slug, state in [
            ("funnel_a", "funnel-a", STATE),
            ("funnel_b", "funnel-b", {}),  # pre-wizard tenant: excluded
        ]:
            t, _ = Tenant.objects.get_or_create(
                schema_name=schema,
                defaults={"name": slug, "slug": slug, "subdomain": slug, "owner_email": "f@x.com"},
            )
            t.wizard_state = state
            t.save(update_fields=["wizard_state"])
            made.append(t)
    finally:
        Tenant.auto_create_schema = original
    yield made
    connection.set_schema_to_public()
    Tenant.objects.filter(schema_name__in=["funnel_a", "funnel_b"]).delete()


def test_funnel_lists_wizard_tenants_with_computed_columns(superuser, tenants):
    resp = _client(superuser).get(LIST_URL, {"q": "funnel-"})
    assert resp.status_code == 200, resp.content
    rows = {r["slug"]: r for r in resp.json()["results"]}
    assert "funnel-a" in rows
    assert "funnel-b" not in rows  # empty wizard_state -> not in the funnel
    row = rows["funnel-a"]
    assert row["current_step"] == "look.theme"
    assert row["answered"] == 2
    assert row["last_activity"] == "2026-07-14T09:05:00+00:00"


def test_funnel_is_read_only(superuser, tenants):
    client = _client(superuser)
    pk = tenants[0].pk
    assert client.post(LIST_URL, {"name": "X"}, format="json").status_code == 405
    assert client.patch(f"{LIST_URL}{pk}/", {"name": "X"}, format="json").status_code == 405
    assert client.delete(f"{LIST_URL}{pk}/").status_code == 405


def test_funnel_requires_superuser(tenants, restore_public):
    coach = User.objects.create_user(email="coach@funnel.test", region="global", role="coach")
    assert _client(coach).get(LIST_URL).status_code == 403
    assert _client().get(LIST_URL).status_code in (401, 403)


def test_funnel_registered_in_meta(superuser):
    body = _client(superuser).get("/api/v1/platform-admin/meta/").json()
    assert any(m["key"] == "wizard-funnel" for m in body["models"])
