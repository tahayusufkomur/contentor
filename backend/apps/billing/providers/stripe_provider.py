"""Stripe payment provider — Phase 1 implementation.

Wraps `stripe.checkout.Session.create`, `stripe.Webhook.construct_event`, and
related calls. Customer Portal, cancel, invoice list land in Phase 2.

The Stripe API key is set lazily inside `_client()` so import order (settings
not yet loaded, etc.) cannot break the module-load and so per-test settings
overrides take effect.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

import stripe
from django.conf import settings

from . import PaymentProvider
from .types import CheckoutSession, InvalidWebhookSignature, ProviderError

if TYPE_CHECKING:
    from apps.core.models import PlatformPlan, Tenant


# Stripe officially supports "tr" as a locale value. Everything else we send is
# limited to "en" — keep this set small so we never send a string Stripe will
# reject.
_SUPPORTED_STRIPE_LOCALES = {"en", "tr"}


def _client() -> Any:
    """Return the stripe module with `api_key` set from settings.

    Reading the key every call keeps test `override_settings(...)` working.
    """
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


class StripeProvider(PaymentProvider):
    """Production-mode adapter."""

    name = "stripe"

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
        client = _client()

        currency = tenant.billing_currency or ""
        price_entry = plan.prices.get(currency, {}) if isinstance(plan.prices, dict) else {}
        stripe_price_id = (price_entry or {}).get("stripe_price_id", "")
        if not stripe_price_id:
            raise ProviderError(
                f"No Stripe price configured for plan={plan.name} currency={currency}",
                code="PRICE_NOT_AVAILABLE",
            )

        normalized_locale = locale if locale in _SUPPORTED_STRIPE_LOCALES else "en"

        metadata = {
            "tenant_id": str(tenant.pk),
            "plan_id": str(plan.pk),
            "region": tenant.region,
            "user_id": str(getattr(user, "pk", "")),
        }

        # Stripe replaces `{CHECKOUT_SESSION_ID}` with the real session id when
        # redirecting back to success_url.
        success_with_token = f"{success_url}{'&' if '?' in success_url else '?'}session_id={{CHECKOUT_SESSION_ID}}"

        try:
            session = client.checkout.Session.create(
                mode="subscription",
                line_items=[{"price": stripe_price_id, "quantity": 1}],
                customer_email=getattr(user, "email", None),
                locale=normalized_locale,
                metadata=metadata,
                subscription_data={"metadata": metadata},
                success_url=success_with_token,
                cancel_url=cancel_url,
            )
        except stripe.error.StripeError as exc:
            raise ProviderError(str(exc), code="PROVIDER_ERROR") from exc

        return CheckoutSession(
            url=session.url,
            expires_at=datetime.fromtimestamp(session.expires_at, tz=UTC),
            provider_session_id=session.id,
        )

    def create_customer_portal_session(
        self,
        *,
        provider_customer_id: str,
        return_url: str,
    ) -> str:
        raise NotImplementedError("Phase 2")

    def cancel_subscription(self, *, provider_subscription_id: str) -> None:
        raise NotImplementedError("Phase 2")

    def parse_webhook(self, *, body: bytes, signature: str) -> dict | None:
        # Kept for ABC compatibility; the dedicated webhook view uses
        # `verify_webhook_signature` directly so it can return the typed Event.
        event = self.verify_webhook_signature(body, signature)
        return dict(event)

    def verify_webhook_signature(self, payload: bytes, sig_header: str) -> Any:
        """Verify the Stripe-Signature header and return the parsed Event.

        Raises `InvalidWebhookSignature` on any failure — bad signature, expired
        timestamp, malformed payload, missing secret.
        """
        client = _client()
        secret = settings.STRIPE_WEBHOOK_SECRET
        if not secret:
            raise InvalidWebhookSignature("STRIPE_WEBHOOK_SECRET not configured")
        try:
            return client.Webhook.construct_event(payload, sig_header, secret)
        except (stripe.error.SignatureVerificationError, ValueError) as exc:
            raise InvalidWebhookSignature(str(exc)) from exc
