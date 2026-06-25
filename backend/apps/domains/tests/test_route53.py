from datetime import UTC
from unittest.mock import MagicMock, patch

import pytest
from botocore.exceptions import PartialCredentialsError

from apps.domains.registrar.route53 import Route53Registrar
from apps.domains.registrar.types import DomainAvailability, RegistrarError


def _registrar_with_client(client):
    reg = Route53Registrar()
    reg._client = client  # inject mock
    return reg


def test_client_pinned_to_us_east_1():
    """Route 53 Domains has only a us-east-1 endpoint; the client must pin it."""
    reg = Route53Registrar()
    with patch("apps.domains.registrar.route53.boto3.client") as mock_client:
        _ = reg.client
    assert mock_client.call_args.kwargs["region_name"] == "us-east-1"


def test_client_init_failure_wrapped_as_registrar_error():
    """A partial/invalid AWS cred must surface as RegistrarError (502), not 500."""
    reg = Route53Registrar()  # no injected client → exercises the lazy boto3.client()
    with (
        patch(
            "apps.domains.registrar.route53.boto3.client",
            side_effect=PartialCredentialsError(provider="explicit", cred_var="aws_secret_access_key"),
        ),
        pytest.raises(RegistrarError) as exc,
    ):
        reg.check_availability("gorkemhanci.com")
    assert exc.value.code == "REGISTRAR_MISCONFIGURED"


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
    with pytest.raises(RegistrarError) as exc_info:
        reg.check_availability("x.com")
    assert exc_info.value.code == "REGISTRAR_ERROR"


def test_renew_passes_current_expiry_year():
    from datetime import datetime

    client = MagicMock()
    client.get_domain_detail.return_value = {"ExpirationDate": datetime(2026, 6, 23, tzinfo=UTC)}
    client.renew_domain.return_value = {"OperationId": "op-renew-1"}
    reg = _registrar_with_client(client)
    out = reg.renew(domain="freecoach.com")
    assert out.operation_id == "op-renew-1"
    assert client.renew_domain.call_args.kwargs["CurrentExpiryYear"] == 2026
    assert client.renew_domain.call_args.kwargs["DurationInYears"] == 1
