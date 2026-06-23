from __future__ import annotations

import uuid

from .base import Registrar
from .types import DomainAvailability, DomainPrice, RegisterResult, RegistrarError

# Deterministic: a domain is "taken" iff its name contains this marker.
_TAKEN_MARKER = "taken"
_FIXED_COST_MINOR = 999  # $9.99


class BypassRegistrar(Registrar):
    name = "bypass"

    def _available(self, domain: str) -> bool:
        return _TAKEN_MARKER not in domain.lower()

    def check_availability(self, domain: str) -> DomainAvailability:
        return DomainAvailability(domain=domain, available=self._available(domain))

    def suggest(self, domain: str, limit: int = 5) -> list[DomainAvailability]:
        stem = domain.split(".")[0]
        cands = [f"{stem}{i}.com" for i in range(1, limit + 1)]
        return [DomainAvailability(domain=d, available=self._available(d)) for d in cands]

    def get_price(self, domain: str) -> DomainPrice:
        return DomainPrice(domain=domain, cost_minor=_FIXED_COST_MINOR, currency="USD")

    def register(self, *, domain: str, contact: dict, nameservers: list[str]) -> RegisterResult:
        if not self._available(domain):
            raise RegistrarError(f"{domain} is unavailable", code="UNAVAILABLE")
        return RegisterResult(domain=domain, operation_id=f"bypass-op-{uuid.uuid4().hex[:12]}")

    def set_nameservers(self, *, domain: str, nameservers: list[str]) -> None:
        return None

    def renew(self, *, domain: str) -> RegisterResult:
        return RegisterResult(domain=domain, operation_id=f"bypass-renew-{uuid.uuid4().hex[:12]}")
