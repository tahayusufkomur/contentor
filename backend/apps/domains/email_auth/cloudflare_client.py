from __future__ import annotations

import requests
from django.conf import settings

from . import ResendError

_BASE = "https://api.cloudflare.com/client/v4"


class CloudflareEmailDomainsClient:
    """Cloudflare Email Sending as the sender-auth provider.

    Every coach custom domain is a zone in our own Cloudflare account (created
    by provisioning `_step_dns_zone`), so onboarding it to Email Sending is
    `POST /zones/{zone_id}/email/sending/subdomains` — Cloudflare writes the
    DKIM/SPF records into the zone itself, hence ``records`` is always empty.
    The subdomain id is stored in ``CustomDomain.resend_domain_id`` (field name
    kept to avoid a migration).
    """

    def __init__(self) -> None:
        self._headers = {"Authorization": f"Bearer {settings.CLOUDFLARE_API_TOKEN}"}

    def create_domain(self, domain: str, *, zone_id: str = "") -> dict:
        if not zone_id:
            raise ResendError(
                "CloudflareEmailDomainsClient requires the domain's zone_id.",
                code="CF_EMAIL_NO_ZONE",
            )
        resp = requests.post(
            f"{_BASE}/zones/{zone_id}/email/sending/subdomains",
            json={"name": domain},
            headers=self._headers,
            timeout=30,
        )
        data = resp.json() if resp.content else {}
        if resp.status_code >= 400 or not data.get("success"):
            # Re-running provisioning after a partial failure: reuse the
            # already-onboarded subdomain instead of erroring.
            existing = self._find_existing(zone_id, domain)
            if existing:
                return {"resend_domain_id": existing, "records": []}
            raise ResendError(str(data.get("errors") or resp.text), code="CF_EMAIL_ERROR")
        return {"resend_domain_id": data["result"]["id"], "records": []}

    def get_status(self, *, resend_domain_id: str, zone_id: str = "") -> str:
        if not zone_id:
            raise ResendError(
                "CloudflareEmailDomainsClient requires the domain's zone_id.",
                code="CF_EMAIL_NO_ZONE",
            )
        resp = requests.get(
            f"{_BASE}/zones/{zone_id}/email/sending/subdomains/{resend_domain_id}",
            headers=self._headers,
            timeout=30,
        )
        data = resp.json() if resp.content else {}
        if resp.status_code >= 400 or not data.get("success"):
            raise ResendError(str(data.get("errors") or resp.text), code="CF_EMAIL_ERROR")
        return "verified" if (data.get("result") or {}).get("enabled") else "pending"

    def _find_existing(self, zone_id: str, domain: str) -> str:
        resp = requests.get(
            f"{_BASE}/zones/{zone_id}/email/sending/subdomains",
            headers=self._headers,
            timeout=30,
        )
        if resp.status_code >= 400:
            return ""
        data = resp.json()
        for sub in data.get("result") or []:
            if sub.get("name") == domain:
                return sub.get("id", "")
        return ""
