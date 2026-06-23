from unittest.mock import MagicMock, patch

from apps.domains.registrar.route53 import Route53Registrar
from apps.domains.registrar.types import DomainAvailability, RegistrarError


def _registrar_with_client(client):
    reg = Route53Registrar()
    reg._client = client  # inject mock
    return reg


def test_check_availability_available():
    client = MagicMock()
    client.check_domain_availability.return_value = {"Availability": "AVAILABLE"}
    reg = _registrar_with_client(client)
    out = reg.check_availability("freecoach.com")
    assert out == DomainAvailability(domain="freecoach.com", available=True)
    client.check_domain_availability.assert_called_once_with(DomainName="freecoach.com")


def test_check_availability_taken():
    client = MagicMock()
    client.check_domain_availability.return_value = {"Availability": "UNAVAILABLE"}
    reg = _registrar_with_client(client)
    assert reg.check_availability("x.com").available is False


def test_get_price_returns_usd_minor():
    client = MagicMock()
    client.list_prices.return_value = {
        "Prices": [{"Name": "com", "RegistrationPrice": {"Price": 9.99, "Currency": "USD"}}]
    }
    reg = _registrar_with_client(client)
    price = reg.get_price("freecoach.com")
    assert price.cost_minor == 999
    assert price.currency == "USD"


def test_register_calls_aws():
    client = MagicMock()
    client.register_domain.return_value = {"OperationId": "op-123"}
    reg = _registrar_with_client(client)
    out = reg.register(
        domain="freecoach.com",
        contact={"FirstName": "A", "LastName": "B", "Email": "c@x.com"},
        nameservers=["a.ns.cloudflare.com", "b.ns.cloudflare.com"],
    )
    assert out.operation_id == "op-123"
    kwargs = client.register_domain.call_args.kwargs
    assert kwargs["DomainName"] == "freecoach.com"
    assert kwargs["DurationInYears"] == 1


def test_aws_error_wrapped():
    client = MagicMock()
    client.check_domain_availability.side_effect = Exception("boom")
    reg = _registrar_with_client(client)
    try:
        reg.check_availability("x.com")
        assert False, "expected RegistrarError"
    except RegistrarError as exc:
        assert exc.code == "REGISTRAR_ERROR"
