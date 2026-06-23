import pytest

from apps.domains.registrar import get_registrar
from apps.domains.registrar.bypass import BypassRegistrar
from apps.domains.registrar.types import DomainAvailability, RegistrarError


@pytest.fixture()
def reg():
    return BypassRegistrar()


def test_factory_returns_bypass_when_enabled(settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    assert isinstance(get_registrar(), BypassRegistrar)


def test_available_domain(reg):
    res = reg.check_availability("freecoach.com")
    assert isinstance(res, DomainAvailability)
    assert res.available is True


def test_taken_domain(reg):
    # Bypass treats anything containing "taken" as unavailable (deterministic).
    res = reg.check_availability("taken-domain.com")
    assert res.available is False


def test_price_is_usd_minor_units(reg):
    price = reg.get_price("freecoach.com")
    assert price.currency == "USD"
    assert price.cost_minor == 999  # fixed bypass price $9.99


def test_register_returns_operation(reg):
    out = reg.register(domain="freecoach.com", contact={"email": "c@x.com"}, nameservers=["a.ns", "b.ns"])
    assert out.domain == "freecoach.com"
    assert out.operation_id


def test_register_taken_raises(reg):
    with pytest.raises(RegistrarError) as exc:
        reg.register(domain="taken-domain.com", contact={}, nameservers=[])
    assert exc.value.code == "UNAVAILABLE"
