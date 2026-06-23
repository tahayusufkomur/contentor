from __future__ import annotations

from typing import TYPE_CHECKING

from django.conf import settings

if TYPE_CHECKING:
    from .base import ResendDomains


def get_resend_domains() -> ResendDomains:
    if settings.DOMAINS_BYPASS_ENABLED:
        from .fake import FakeResendDomains

        return FakeResendDomains()
    from .client import ResendDomainsClient

    return ResendDomainsClient()
