"""Value objects and exceptions for the PaymentProvider abstraction."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from datetime import datetime


@dataclass(frozen=True)
class CheckoutSession:
    """Return value of `PaymentProvider.create_checkout_session`.

    Fields:
        url: Hosted checkout URL the user should be redirected to.
        expires_at: When the hosted session expires (UTC).
        provider_session_id: Provider-specific session ID (Stripe `cs_*`).
    """

    url: str
    expires_at: datetime
    provider_session_id: str


class ProviderError(Exception):
    """Raised when a provider SDK call fails for a reason the view should
    translate into a 4xx/5xx with a friendly error code.

    The view layer converts this into a JSON response with
    `{"error": "PROVIDER_ERROR", "detail": str(exc)}`.
    """

    def __init__(self, message: str, *, code: str = "PROVIDER_ERROR") -> None:
        super().__init__(message)
        self.code = code


class InvalidWebhookSignature(Exception):  # noqa: N818 — domain term, not an Error suffix
    """Raised when webhook signature verification fails.

    The webhook view converts this into a 400 with `{"error": "BAD_SIGNATURE"}`.
    """
