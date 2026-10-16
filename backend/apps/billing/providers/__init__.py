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
        trial_days: int = 0,
    ) -> CheckoutSession:
        """Open a hosted checkout session and return a value object.
        `trial_days` > 0 starts the plan as a trial: the card is taken now
        and first charged when the trial ends."""

    @abstractmethod
    def update_subscription(self, sub: Any, action: str) -> dict | None:
        """Apply a coach's plan action: "start_now" ends a trial today (the
        first charge runs now), "cancel" ends the plan when its period (or
        trial) ends, "resume" takes a pending cancel back. Returns the
        provider's subscription object to sync from, or None when the local
        row was updated directly."""


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
