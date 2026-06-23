from __future__ import annotations

from abc import ABC, abstractmethod


class CloudflareError(Exception):
    def __init__(self, message: str, *, code: str = "CLOUDFLARE_ERROR") -> None:
        super().__init__(message)
        self.code = code


class Cloudflare(ABC):
    @abstractmethod
    def create_zone(self, domain: str) -> dict: ...

    @abstractmethod
    def upsert_dns_record(self, *, zone_id: str, type: str, name: str, content: str, proxied: bool = True) -> str: ...

    @abstractmethod
    def enable_email_routing(self, *, zone_id: str, forward_to: str) -> None: ...

    @abstractmethod
    def get_ssl_status(self, *, zone_id: str) -> str: ...
