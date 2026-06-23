from __future__ import annotations

import requests
from django.conf import settings

from .base import ResendDomains, ResendError

_BASE = "https://api.resend.com"


class ResendDomainsClient(ResendDomains):
    def __init__(self) -> None:
        self._headers = {"Authorization": f"Bearer {settings.RESEND_API_KEY}"}

    def create_domain(self, domain: str) -> dict:
        resp = requests.post(f"{_BASE}/domains", json={"name": domain}, headers=self._headers, timeout=30)
        if resp.status_code >= 400:
            raise ResendError(resp.text, code="RESEND_ERROR")
        data = resp.json()
        records = [
            {"type": r.get("type", "TXT"), "name": r.get("name", ""), "value": r.get("value", "")}
            for r in data.get("records", [])
        ]
        return {"resend_domain_id": data["id"], "records": records}

    def get_status(self, *, resend_domain_id: str) -> str:
        resp = requests.get(f"{_BASE}/domains/{resend_domain_id}", headers=self._headers, timeout=30)
        if resp.status_code >= 400:
            raise ResendError(resp.text, code="RESEND_ERROR")
        return "verified" if resp.json().get("status") == "verified" else "pending"
