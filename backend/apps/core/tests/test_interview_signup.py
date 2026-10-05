"""Email verify creates AND provisions the site; interview tenants never get
an up-front whole-site compose (pages build per interview milestone)."""

from unittest import mock

import pytest
from rest_framework.test import APIClient

from apps.accounts.tokens import create_signup_token
from apps.core.models import Tenant

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def _cleanup():
    yield
    for tenant in Tenant.objects.filter(slug__in=["iv-studio-test", "iv-again-test"]):
        tenant.delete(force_drop=True)


def _verify(brand):
    token = create_signup_token("iv@test.dev", "Iv", brand, "global")
    client = APIClient(HTTP_HOST="localhost")
    with mock.patch("apps.core.tasks.provision_tenant.delay") as delay:
        resp = client.post("/api/v1/onboarding/signup/verify/", {"token": token}, format="json")
    return resp, delay


def test_verify_marks_interview_and_enqueues_provisioning():
    resp, delay = _verify("Iv Studio Test")
    assert resp.status_code == 201, resp.content
    tenant = Tenant.objects.get(slug="iv-studio-test")
    assert tenant.wizard_state["flow"] == "interview"
    assert tenant.wizard_state["answers"]["goals"] == []
    assert tenant.wizard_state["answers"]["style"]
    delay.assert_called_once_with(tenant.id, "iv@test.dev", "Iv", "general")


def test_reverify_does_not_enqueue_twice():
    _verify("Iv Again Test")
    resp, delay = _verify("Iv Again Test")
    assert resp.status_code == 200
    delay.assert_not_called()


def test_provision_skips_whole_site_compose_for_interview_tenants():
    from apps.core import tasks

    assert tasks._should_compose_site(mock.Mock(wizard_state={"flow": "interview"})) is False
    assert tasks._should_compose_site(mock.Mock(wizard_state={})) is True


def test_suite_never_enqueues_real_provisioning():
    """Verify enqueues provisioning on commit; under pytest that must never
    reach the dev stack's real Celery broker (it would provision whatever dev
    tenant shares the test tenant's id)."""
    from apps.core import tasks

    assert isinstance(tasks.provision_tenant.delay, mock.Mock)
