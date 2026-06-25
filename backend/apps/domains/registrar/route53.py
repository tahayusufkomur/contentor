from __future__ import annotations

import boto3
from django.conf import settings

from .base import Registrar
from .types import DomainAvailability, DomainPrice, RegisterResult, RegistrarError


def _tld(domain: str) -> str:
    return domain.split(".", 1)[1] if "." in domain else domain


class Route53Registrar(Registrar):
    name = "route53"

    def __init__(self) -> None:
        self._client = None

    @property
    def client(self):
        if self._client is None:
            try:
                self._client = boto3.client(
                    "route53domains",
                    region_name=settings.AWS_ROUTE53_REGION or "us-east-1",
                    aws_access_key_id=settings.AWS_ROUTE53_ACCESS_KEY_ID or None,
                    aws_secret_access_key=settings.AWS_ROUTE53_SECRET_ACCESS_KEY or None,
                )
            except Exception as exc:  # noqa: BLE001 — partial/invalid creds, bad region, etc.
                # Surface as a clean registrar error (→ 502) instead of an opaque
                # 500: client creation happens here, outside _wrap. A common cause
                # is AWS_ROUTE53_ACCESS_KEY_ID set without AWS_ROUTE53_SECRET_ACCESS_KEY.
                raise RegistrarError(
                    f"Route 53 client init failed (check AWS_ROUTE53_* credentials): {exc}",
                    code="REGISTRAR_MISCONFIGURED",
                ) from exc
        return self._client

    def _wrap(self, fn, *args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except RegistrarError:
            raise
        except Exception as exc:  # noqa: BLE001 — translate any SDK failure
            raise RegistrarError(str(exc), code="REGISTRAR_ERROR") from exc

    def check_availability(self, domain: str) -> DomainAvailability:
        resp = self._wrap(self.client.check_domain_availability, DomainName=domain)
        return DomainAvailability(domain=domain, available=resp.get("Availability") == "AVAILABLE")

    def suggest(self, domain: str, limit: int = 5) -> list[DomainAvailability]:
        resp = self._wrap(
            self.client.get_domain_suggestions,
            DomainName=domain,
            SuggestionCount=limit,
            OnlyAvailable=True,
        )
        return [
            DomainAvailability(domain=s["DomainName"], available=s.get("Availability") == "AVAILABLE")
            for s in resp.get("SuggestionsList", [])
        ]

    def get_price(self, domain: str) -> DomainPrice:
        resp = self._wrap(self.client.list_prices, Tld=_tld(domain))
        prices = resp.get("Prices", [])
        if not prices:
            raise RegistrarError(f"No price for {domain}", code="PRICE_NOT_AVAILABLE")
        reg_price = prices[0]["RegistrationPrice"]
        return DomainPrice(
            domain=domain,
            cost_minor=round(float(reg_price["Price"]) * 100),
            currency=reg_price.get("Currency", "USD"),
        )

    def register(self, *, domain: str, contact: dict, nameservers: list[str]) -> RegisterResult:
        kwargs = {
            "DomainName": domain,
            "DurationInYears": 1,
            "AutoRenew": False,  # we control renewal via Stripe webhooks
            "AdminContact": contact,
            "RegistrantContact": contact,
            "TechContact": contact,
        }
        if nameservers:
            kwargs["Nameservers"] = [{"Name": ns} for ns in nameservers]
        resp = self._wrap(self.client.register_domain, **kwargs)
        return RegisterResult(domain=domain, operation_id=resp["OperationId"])

    def set_nameservers(self, *, domain: str, nameservers: list[str]) -> None:
        self._wrap(
            self.client.update_domain_nameservers,
            DomainName=domain,
            Nameservers=[{"Name": ns} for ns in nameservers],
        )

    def renew(self, *, domain: str) -> RegisterResult:
        detail = self._wrap(self.client.get_domain_detail, DomainName=domain)
        # ExpirationDate is a timezone-aware datetime; RenewDomain needs the year.
        current_expiry_year = detail["ExpirationDate"].year
        resp = self._wrap(
            self.client.renew_domain,
            DomainName=domain,
            DurationInYears=1,
            CurrentExpiryYear=current_expiry_year,
        )
        return RegisterResult(domain=domain, operation_id=resp["OperationId"])
