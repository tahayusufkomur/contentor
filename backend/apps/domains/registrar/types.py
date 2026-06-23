from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DomainAvailability:
    domain: str
    available: bool


@dataclass(frozen=True)
class DomainPrice:
    domain: str
    cost_minor: int  # registrar wholesale cost, USD minor units
    currency: str


@dataclass(frozen=True)
class RegisterResult:
    domain: str
    operation_id: str


class RegistrarError(Exception):
    def __init__(self, message: str, *, code: str = "REGISTRAR_ERROR") -> None:
        super().__init__(message)
        self.code = code
