from __future__ import annotations

from django.conf import settings


class ResendError(Exception):
    def __init__(self, message: str, *, code: str = "RESEND_ERROR") -> None:
        super().__init__(message)
        self.code = code


def get_resend_domains():
    if settings.DOMAINS_BYPASS_ENABLED:
        from .fake import FakeResendDomains

        return FakeResendDomains()
    if settings.EMAIL_AUTH_PROVIDER == "cloudflare":
        from .cloudflare_client import CloudflareEmailDomainsClient

        return CloudflareEmailDomainsClient()
    from .client import ResendDomainsClient

    return ResendDomainsClient()
