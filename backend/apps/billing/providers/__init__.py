"""Payment provider abstraction.

Phase 0: defines the ABC, two concrete adapters (Bypass, Stripe), and a
`get_provider(tenant)` factory that picks an adapter based on the
`BILLING_BYPASS_ENABLED` setting.

The Stripe adapter is a skeleton in Phase 0 — every method raises
`NotImplementedError`. Phase 1 fills them in.
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
    via arguments. Phase 0 only requires `create_checkout_session`; the other
    methods are declared so the contract is visible from the start.
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

    @abstractmethod
    def create_customer_portal_session(
        self,
        *,
        provider_customer_id: str,
        return_url: str,
    ) -> str:
        """Return a URL to the provider's customer portal."""

    @abstractmethod
    def cancel_subscription(self, *, provider_subscription_id: str) -> None:
        """Cancel a subscription at period end (provider-specific behavior)."""

    @abstractmethod
    def parse_webhook(self, *, body: bytes, signature: str) -> dict | None:
        """Verify and parse a webhook payload. Returns the event dict or None."""


def get_provider(tenant: Tenant | None = None) -> PaymentProvider:
    """Return the active PaymentProvider implementation.

    Phase 0: bypass when `BILLING_BYPASS_ENABLED=true`, else Stripe (whose
    methods raise NotImplementedError until Phase 1).

    The `tenant` argument is reserved for future per-tenant routing (e.g. M2
    marketplace iyzico for TR coaches) and is intentionally unused in M1.
    """
    del tenant  # reserved for future use
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
