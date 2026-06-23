from __future__ import annotations

from typing import TYPE_CHECKING

from django.conf import settings

if TYPE_CHECKING:
    from .base import Cloudflare


def get_cloudflare() -> Cloudflare:
    if settings.DOMAINS_BYPASS_ENABLED:
        from .fake import FakeCloudflare

        return FakeCloudflare()
    from .client import CloudflareClient

    return CloudflareClient()
