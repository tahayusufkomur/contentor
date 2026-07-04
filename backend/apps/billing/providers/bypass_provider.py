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
        from apps.core.models import PlatformSubscription, WebhookEvent

        del cancel_url, locale  # bypass doesn't render a real hosted page

        session_id = f"bypass_cs_{uuid.uuid4().hex}"
        now = timezone.now()
        period_end = now + timedelta(days=30)

        # Synthetic webhook for observability parity with the Stripe adapter.
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
            processed_at=now,
        )

        # Bypass is for dev/test — short-circuit the real Stripe round trip and
        # transition the PlatformSubscription + tenant.plan immediately. This
        # gives the same in-app state the Stripe webhook handlers produce on
        # checkout.session.completed, so the Subscription tile and quota gates
        # see the upgrade without needing the Stripe CLI running locally.
        sub, _ = PlatformSubscription.objects.update_or_create(
            tenant=tenant,
            defaults={
                "user": user if getattr(user, "pk", None) else None,
                "plan": plan,
                "status": "active",
                "provider": "bypass",
                "provider_subscription_id": f"bypass_sub_{uuid.uuid4().hex}",
                "provider_customer_id": f"bypass_cus_{uuid.uuid4().hex}",
                "current_period_start": now,
                "current_period_end": period_end,
                "cancel_at_period_end": False,
                "canceled_at": None,
            },
        )
        del sub  # explicitly unused; reserved for future logging
        # Tenant.plan is mirrored by the PlatformSubscription post_save signal.

        return CheckoutSession(
            url=success_url,
            expires_at=now + timedelta(hours=1),
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
