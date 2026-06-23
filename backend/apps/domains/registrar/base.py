from __future__ import annotations

from abc import ABC, abstractmethod

from .types import DomainAvailability, DomainPrice, RegisterResult


class Registrar(ABC):
    name: str = ""

    @abstractmethod
    def check_availability(self, domain: str) -> DomainAvailability: ...

    @abstractmethod
    def suggest(self, domain: str, limit: int = 5) -> list[DomainAvailability]: ...

    @abstractmethod
    def get_price(self, domain: str) -> DomainPrice: ...

    @abstractmethod
    def register(self, *, domain: str, contact: dict, nameservers: list[str]) -> RegisterResult: ...

    @abstractmethod
    def set_nameservers(self, *, domain: str, nameservers: list[str]) -> None: ...

    @abstractmethod
    def renew(self, *, domain: str) -> RegisterResult: ...
