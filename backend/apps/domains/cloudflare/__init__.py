from __future__ import annotations

from django.conf import settings


def get_cloudflare():
    if settings.DOMAINS_BYPASS_ENABLED:
        from .fake import FakeCloudflare

        return FakeCloudflare()
    from .client import CloudflareClient

    return CloudflareClient()
