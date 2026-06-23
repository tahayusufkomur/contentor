from __future__ import annotations

from abc import ABC, abstractmethod


class ResendError(Exception):
    def __init__(self, message: str, *, code: str = "RESEND_ERROR") -> None:
        super().__init__(message)
        self.code = code


class ResendDomains(ABC):
    @abstractmethod
    def create_domain(self, domain: str) -> dict: ...

    @abstractmethod
    def get_status(self, *, resend_domain_id: str) -> str: ...
