"""Dev/test bypass provider.

Gated by `BILLING_BYPASS_ENABLED`. Emits a synthetic `WebhookEvent` row on
`create_checkout_session` so the rest of the system can observe a parity
event for "subscription provisioning started".
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from typing import TYPE_CHECKING, Any

from django.utils import timezone

from . import PaymentProvider
from .types import CheckoutSession

if TYPE_CHECKING:
    from apps.core.models import PlatformPlan, Tenant


class BypassProvider(PaymentProvider):
    """Immediate-success provider used in dev/test.

    Real Stripe calls are skipped; the synthetic flow is enough for the rest
    of the platform code to exercise its happy paths.
    """

    name = "bypass"

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
        # Import lazily — apps.core models aren't loaded when providers package
        # is imported at startup (no AppConfig.ready ordering guarantee).
        from apps.core.models import WebhookEvent

        del cancel_url, locale  # bypass doesn't render a real hosted page

        session_id = f"bypass_cs_{uuid.uuid4().hex}"
        WebhookEvent.objects.create(
            provider="bypass",
            provider_event_id=f"bypass_evt_{uuid.uuid4().hex}",
            event_type="checkout.session.completed",
            payload={
                "tenant_id": tenant.pk,
                "user_id": getattr(user, "pk", None),
                "plan_id": plan.pk,
                "session_id": session_id,
            },
        )

        return CheckoutSession(
            url=success_url,
            expires_at=timezone.now() + timedelta(hours=1),
            provider_session_id=session_id,
        )

    def create_customer_portal_session(
        self,
        *,
        provider_customer_id: str,
        return_url: str,
    ) -> str:
        del provider_customer_id
        return return_url

    def cancel_subscription(self, *, provider_subscription_id: str) -> None:
        del provider_subscription_id
        # No-op in bypass; PlatformSubscription state transitions are driven
        # directly by the caller in Phase 0.
        return None

    def parse_webhook(self, *, body: bytes, signature: str) -> dict | None:
        del body, signature
        return None
