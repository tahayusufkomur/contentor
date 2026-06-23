from __future__ import annotations

from typing import TYPE_CHECKING

from django.conf import settings

if TYPE_CHECKING:
    from .base import Registrar


def get_registrar() -> Registrar:
    if settings.DOMAINS_BYPASS_ENABLED:
        from .bypass import BypassRegistrar

        return BypassRegistrar()
    from .route53 import Route53Registrar

    return Route53Registrar()
