from __future__ import annotations

import requests
from django.conf import settings

from .base import Cloudflare, CloudflareError

_BASE = "https://api.cloudflare.com/client/v4"


class CloudflareClient(Cloudflare):
    def __init__(self) -> None:
        self._headers = {
            "Authorization": f"Bearer {settings.CLOUDFLARE_API_TOKEN}",
            "Content-Type": "application/json",
        }
        self._account_id = settings.CLOUDFLARE_ACCOUNT_ID

    def _post(self, path: str, payload: dict) -> dict:
        resp = requests.post(f"{_BASE}{path}", json=payload, headers=self._headers, timeout=30)
        data = resp.json()
        if not data.get("success"):
            raise CloudflareError(str(data.get("errors")), code="CLOUDFLARE_ERROR")
        return data["result"]

    def _get(self, path: str) -> dict:
        resp = requests.get(f"{_BASE}{path}", headers=self._headers, timeout=30)
        data = resp.json()
        if not data.get("success"):
            raise CloudflareError(str(data.get("errors")), code="CLOUDFLARE_ERROR")
        return data["result"]

    def create_zone(self, domain: str) -> dict:
        result = self._post("/zones", {"name": domain, "account": {"id": self._account_id}, "type": "full"})
        return {"zone_id": result["id"], "name_servers": result.get("name_servers", [])}

    def upsert_dns_record(self, *, zone_id: str, type: str, name: str, content: str, proxied: bool = True) -> str:
        result = self._post(
            f"/zones/{zone_id}/dns_records",
            {"type": type, "name": name, "content": content, "proxied": proxied},
        )
        return result["id"]

    def enable_email_routing(self, *, zone_id: str, forward_to: str) -> None:
        self._post(f"/zones/{zone_id}/email/routing/enable", {})
        # Catch-all rule -> forward to the coach's address.
        self._post(
            f"/zones/{zone_id}/email/routing/rules/catch_all",
            {
                "enabled": True,
                "actions": [{"type": "forward", "value": [forward_to]}],
                "matchers": [{"type": "all"}],
            },
        )

    def get_ssl_status(self, *, zone_id: str) -> str:
        result = self._get(f"/zones/{zone_id}/ssl/universal/settings")
        return "active" if result.get("enabled") else "pending"
