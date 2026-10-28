"""Stripe payment provider — Phase 1 implementation.

Wraps `stripe.checkout.Session.create`, `stripe.Webhook.construct_event`, and
related calls.

The Stripe API key is set lazily inside `_client()` so import order (settings
not yet loaded, etc.) cannot break the module-load and so per-test settings
overrides take effect.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

import stripe
from django.conf import settings

from apps.core import languages

from . import PaymentProvider
from .types import CheckoutSession, InvalidWebhookSignature, ProviderError

if TYPE_CHECKING:
    from apps.core.models import PlatformPlan, Tenant


# Only locales we ship; anything else (e.g. a stale user row) falls back to "en"
# so we never send a string Stripe will reject.
_SUPPORTED_STRIPE_LOCALES = {languages.info(code)["stripe"] for code in languages.CODES}


def _client() -> Any:
    """Return the stripe module with `api_key` set from settings.

    Reading the key every call keeps test `override_settings(...)` working.
    """
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


def checkout_ui(return_url: str, cancel_url: str) -> dict[str, str]:
    """Embedded Checkout (Stripe's form inside our page, beside our panel) once
    the browser has a publishable key to mount it with; the hosted page until
    then. An embedded session has no cancel URL: closing our overlay is the
    way back."""
    if settings.STRIPE_PUBLISHABLE_KEY:
        return {"ui_mode": "embedded", "return_url": return_url}
    return {"success_url": return_url, "cancel_url": cancel_url}


def embedded_fields(client_secret: str, stripe_account: str = "") -> dict[str, str]:
    """What the browser needs to mount an embedded session; nothing for a
    hosted one. A direct charge's session lives on the coach's account, so
    Stripe.js loads on that account too."""
    if not client_secret:
        return {}
    fields = {"client_secret": client_secret, "publishable_key": settings.STRIPE_PUBLISHABLE_KEY}
    if stripe_account:
        fields["stripe_account"] = stripe_account
    return fields


def retrieve_checkout_session(session_id: str) -> Any:
    """Fetch a Checkout Session with its subscription expanded.

    Used by the return-from-checkout sync path (webhooks'
    sync_platform_checkout_session) so callers outside this module never
    touch the stripe SDK directly. Raises ProviderError on Stripe failure.
    """
    try:
        return _client().checkout.Session.retrieve(session_id, expand=["subscription"])
    except stripe.error.StripeError as exc:
        raise ProviderError(str(exc), code="PROVIDER_ERROR") from exc


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
        trial_days: int = 0,
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
        subscription_data: dict[str, Any] = {"metadata": metadata}
        if trial_days:
            # Subscription mode collects the card even when nothing is due today.
            subscription_data["trial_period_days"] = trial_days

        try:
            session = client.checkout.Session.create(
                mode="subscription",
                line_items=[{"price": stripe_price_id, "quantity": 1}],
                customer_email=getattr(user, "email", None),
                locale=normalized_locale,
                metadata=metadata,
                subscription_data=subscription_data,
                **checkout_ui(success_with_token, cancel_url),
            )
        except stripe.error.StripeError as exc:
            raise ProviderError(str(exc), code="PROVIDER_ERROR") from exc

        return CheckoutSession(
            url=session.url or "",
            expires_at=datetime.fromtimestamp(session.expires_at, tz=UTC),
            provider_session_id=session.id,
            client_secret=getattr(session, "client_secret", None) or "",
        )

    def update_subscription(self, sub: Any, action: str) -> dict | None:
        changes = {
            "start_now": {"trial_end": "now"},
            "cancel": {"cancel_at_period_end": True},
            "resume": {"cancel_at_period_end": False},
        }[action]
        try:
            return _client().Subscription.modify(sub.provider_subscription_id, **changes)
        except stripe.error.StripeError as exc:
            raise ProviderError(str(exc), code="PROVIDER_ERROR") from exc

    def verify_webhook_signature(self, payload: bytes, sig_header: str) -> Any:
        """Verify the Stripe-Signature header and return the parsed Event.

        Raises `InvalidWebhookSignature` on any failure — bad signature, expired
        timestamp, malformed payload, missing secret.
        """
        client = _client()
        secret = _get_webhook_secret()
        if not secret:
            raise InvalidWebhookSignature("STRIPE_WEBHOOK_SECRET not configured")
        try:
            return client.Webhook.construct_event(payload, sig_header, secret)
        except (stripe.error.SignatureVerificationError, ValueError) as exc:
            raise InvalidWebhookSignature(str(exc)) from exc


def _get_webhook_secret() -> str:
    secret = getattr(settings, "STRIPE_WEBHOOK_SECRET", "")
    if settings.DEBUG:
        # In dev, attempt to dynamically read fresh secret from .stripe_whsec or .env if updated by stripe-listen
        env_paths = [
            os.path.join(settings.BASE_DIR, ".stripe_whsec"),
            os.path.join(settings.BASE_DIR, "..", ".env"),
            os.path.join(settings.BASE_DIR, ".env"),
            "/app/.env",
        ]
        for env_path in env_paths:
            if os.path.exists(env_path):
                try:
                    with open(env_path) as f:
                        content = f.read().strip()
                        if content.startswith("whsec_"):
                            return content
                        for line in content.splitlines():
                            if line.startswith("STRIPE_WEBHOOK_SECRET="):
                                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                                if val:
                                    return val
                except Exception:  # noqa: S110 - best-effort dev-only secret refresh; fall through to the configured value
                    pass
    return secret
