"""Payment provider abstraction.

Defines the ABC, two concrete adapters (Bypass, Stripe), and a
`get_provider()` factory that picks an adapter based on the
`BILLING_BYPASS_ENABLED` setting.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

from django.conf import settings

from .types import CheckoutSession, InvalidWebhookSignature, ProviderError

if TYPE_CHECKING:
    from apps.core.models import PlatformPlan, Tenant


class PaymentProvider(ABC):
    """Abstract base for payment providers (Stripe, Bypass).

    Implementations should be stateless — they receive everything they need
    via arguments.
    """

    name: str = ""

    @abstractmethod
    def create_checkout_session(
        self,
        *,
        tenant: Tenant,
        user: Any,
        plan: PlatformPlan,
        success_url: str,
        cancel_url: str,
        locale: str = "en",
    ) -> CheckoutSession:
        """Open a hosted checkout session and return a value object."""


def get_provider() -> PaymentProvider:
    """Return the active PaymentProvider: bypass when
    `BILLING_BYPASS_ENABLED=true`, else Stripe."""
    if getattr(settings, "BILLING_BYPASS_ENABLED", False):
        from .bypass_provider import BypassProvider

        return BypassProvider()
    from .stripe_provider import StripeProvider

    return StripeProvider()


__all__ = [
    "CheckoutSession",
    "InvalidWebhookSignature",
    "PaymentProvider",
    "ProviderError",
    "get_provider",
]
