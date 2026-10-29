from __future__ import annotations

from datetime import UTC, datetime, timedelta

from django.conf import settings
from django.utils import translation
from django.utils.translation import gettext as _

from apps.billing.providers.types import CheckoutSession
from apps.core import languages


def create_domain_checkout(*, tenant, user, custom_domain, success_url, cancel_url) -> CheckoutSession:
    if settings.DOMAINS_BYPASS_ENABLED:
        return CheckoutSession(
            url=f"{success_url}?bypass=1&custom_domain_id={custom_domain.id}",
            expires_at=datetime.now(tz=UTC) + timedelta(hours=1),
            provider_session_id=f"bypass-cs-{custom_domain.id}",
        )

    import stripe

    stripe.api_key = settings.STRIPE_SECRET_KEY
    metadata = {"domains_custom_domain_id": str(custom_domain.id)}
    # The creator is the one paying: the page and its product line are in their language.
    locale = languages.creator_language(user)
    with translation.override(locale):
        product_name = _("Custom domain: %(domain)s") % {"domain": custom_domain.domain}
    session = stripe.checkout.Session.create(
        mode="subscription",
        locale=languages.info(locale)["stripe"],
        customer_email=getattr(user, "email", None),
        line_items=[
            {
                "price_data": {
                    "currency": custom_domain.currency.lower(),
                    "product_data": {"name": product_name},
                    "unit_amount": custom_domain.price_minor,
                    "recurring": {"interval": "year"},
                },
                "quantity": 1,
            }
        ],
        metadata=metadata,
        subscription_data={"metadata": metadata},
        success_url=f"{success_url}?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=cancel_url,
    )
    return CheckoutSession(
        url=session.url,
        expires_at=datetime.fromtimestamp(session.expires_at, tz=UTC),
        provider_session_id=session.id,
    )
