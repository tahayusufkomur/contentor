import pytest

from apps.domains.models import CustomDomain
from apps.domains.tasks import provision_domain

pytestmark = pytest.mark.django_db


def test_provision_domain_task_runs_orchestrator(restore_public, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    cd = CustomDomain.objects.create(
        tenant=restore_public, domain="taskcoach.com", cost_minor=999, price_minor=1200,
        currency="EUR", contact={"Email": "c@x.com"}, provisioning_status="pending",
    )
    provision_domain(cd.id)  # call synchronously
    cd.refresh_from_db()
    assert cd.provisioning_status == "live"
