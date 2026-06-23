from __future__ import annotations

import uuid

from .base import ResendDomains


class FakeResendDomains(ResendDomains):
    def create_domain(self, domain: str) -> dict:
        return {
            "resend_domain_id": f"resend-{uuid.uuid4().hex[:12]}",
            "records": [
                {"type": "TXT", "name": domain, "value": "v=spf1 include:resend.com ~all"},
                {"type": "TXT", "name": f"resend._domainkey.{domain}", "value": "p=FAKEDKIM"},
                {"type": "MX", "name": f"send.{domain}", "value": "feedback-smtp.resend.com"},
            ],
        }

    def get_status(self, *, resend_domain_id: str) -> str:
        return "verified"
