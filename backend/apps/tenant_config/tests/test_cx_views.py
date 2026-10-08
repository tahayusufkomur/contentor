"""Coach endpoints for AI sections: thin wiring to the service."""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.tenant_config.cx import compose

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"
COMPOSE = "/api/v1/admin/cx/compose/"
REFINE = "/api/v1/admin/cx/refine/"
COMPONENTS = "/api/v1/admin/cx/components/"
EMPTY = {"block": None, "source": "error", "remaining": 0, "missing": []}


def _client(role, email):
    user = User.objects.create_user(email=email, name=role, password="x", role=role, is_staff=role == "owner")  # noqa: S106
    client = APIClient(HTTP_HOST=HOST)
    client.force_authenticate(user=user)
    return client


@pytest.fixture()
def coach_client(tenant_ctx):
    return _client("owner", "coach@cxviews.com")


@pytest.fixture()
def student_client(tenant_ctx):
    return _client("student", "student@cxviews.com")


def test_compose_hands_the_request_to_the_service(coach_client, monkeypatch):
    seen = {}

    def fake(tenant, prompt, page):
        seen.update(schema=tenant.schema_name, prompt=prompt, page=page)
        return EMPTY

    monkeypatch.setattr(compose, "compose", fake)
    res = coach_client.post(COMPOSE, {"prompt": "A retreat timeline", "page": "about"}, format="json")
    assert res.status_code == 200 and res.json() == EMPTY
    assert seen == {"schema": "shared_test", "prompt": "A retreat timeline", "page": "about"}


def test_refine_hands_block_and_instruction(coach_client, monkeypatch):
    seen = {}

    def fake(tenant, block, instruction):
        seen.update(block=block, instruction=instruction)
        return EMPTY

    monkeypatch.setattr(compose, "refine", fake)
    res = coach_client.post(REFINE, {"block": {"type": "cx"}, "instruction": "Warmer"}, format="json")
    assert res.status_code == 200
    assert seen == {"block": {"type": "cx"}, "instruction": "Warmer"}


def test_components_lists_the_coachs_sections(coach_client, monkeypatch):
    monkeypatch.setattr(compose, "my_components", lambda tenant: {"components": []})
    res = coach_client.get(COMPONENTS)
    assert res.status_code == 200 and res.json() == {"components": []}


def test_students_are_refused(student_client):
    assert student_client.post(COMPOSE, {}, format="json").status_code == 403
    assert student_client.post(REFINE, {}, format="json").status_code == 403
    assert student_client.get(COMPONENTS).status_code == 403
