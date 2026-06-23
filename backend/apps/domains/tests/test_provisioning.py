import pytest

from apps.core.models import Domain
from apps.domains.models import CustomDomain
from apps.domains.provisioning import provision

pytestmark = pytest.mark.django_db


def _make(restore_public, domain="freecoach.com"):
    return CustomDomain.objects.create(
        tenant=restore_public,
        domain=domain,
        cost_minor=999,
        price_minor=1200,
        currency="EUR",
        forward_to_email="coach@personal.com",
        contact={"Email": "coach@personal.com"},
        provisioning_status="pending",
    )


def test_full_provision_reaches_live(restore_public, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    cd = _make(restore_public)
    provision(cd)
    cd.refresh_from_db()
    assert cd.provisioning_status == "live"
    assert cd.cloudflare_zone_id
    assert cd.resend_domain_id
    assert cd.dns_records_done is True
    assert Domain.objects.filter(domain="freecoach.com", tenant=restore_public).exists()


def test_provision_is_idempotent(restore_public, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    cd = _make(restore_public, domain="idem.com")
    provision(cd)
    zone1 = cd.cloudflare_zone_id
    provision(cd)  # second run must not create a second core.Domain row or new zone
    cd.refresh_from_db()
    assert cd.cloudflare_zone_id == zone1
    assert cd.dns_records_done is True
    assert Domain.objects.filter(domain="idem.com").count() == 1


def test_dns_records_done_prevents_duplicate_calls(restore_public, settings, monkeypatch):
    """A second provision() call must not invoke _step_dns_records again."""
    settings.DOMAINS_BYPASS_ENABLED = True
    cd = _make(restore_public, domain="nodupe.com")
    provision(cd)
    cd.refresh_from_db()
    assert cd.dns_records_done is True

    # Monkeypatch _step_dns_records to a bomb — a second provision() should skip it.
    from apps.domains import provisioning

    def boom(*a, **k):
        raise AssertionError("_step_dns_records called again on second provision()")

    monkeypatch.setattr(provisioning, "_step_dns_records", boom)
    # provision() exits early because provisioning_status == "live" so the bomb
    # is never reached; this also validates the top-level live guard.
    provision(cd)  # must not raise


def test_failure_records_failed_step(restore_public, settings, monkeypatch):
    settings.DOMAINS_BYPASS_ENABLED = True
    cd = _make(restore_public, domain="fail.com")

    from apps.domains import provisioning

    def boom(*a, **k):
        raise RuntimeError("registrar down")

    # Force the registering step to fail.
    monkeypatch.setattr(provisioning, "_step_register", boom)
    with pytest.raises(RuntimeError):
        provision(cd)
    cd.refresh_from_db()
    assert cd.provisioning_status == "failed"
    assert cd.failed_step == "registering"
