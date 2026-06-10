import logging
from dataclasses import dataclass
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.utils import timezone

from apps.core.currency import tenant_charge_currency


def content_currency(content) -> str:
    """Content models have no currency column — prices are denominated in the
    tenant's charge currency (what Stripe will actually charge)."""
    return getattr(content, "currency", None) or tenant_charge_currency()


logger = logging.getLogger(__name__)


@dataclass
class AccessInfo:
    has_access: bool
    pricing_type: str
    price: Decimal | None = None
    currency: str | None = None
    access_reason: str | None = None
    unlock_methods: list[str] | None = None


class ContentAccessService:
    def check_access(self, user, content) -> bool:
        return self.get_access_info(user, content).has_access

    def get_access_info(self, user, content) -> AccessInfo:
        pricing_type = getattr(content, "pricing_type", "free")
        price = getattr(content, "price", None)
        currency = content_currency(content)

        # 1. Owner/Coach always access
        if hasattr(user, "role") and user.role in ("owner", "coach"):
            return AccessInfo(
                has_access=True,
                pricing_type=pricing_type,
                price=price,
                currency=currency,
                access_reason="owner",
            )

        # 2. Free content
        if pricing_type == "free":
            return AccessInfo(has_access=True, pricing_type=pricing_type, access_reason="free")

        # 3. Direct purchase
        if self._has_direct_purchase(user, content):
            return AccessInfo(
                has_access=True,
                pricing_type=pricing_type,
                price=price,
                currency=currency,
                access_reason="purchased",
            )

        # 4. Bundle purchase
        if self._has_bundle_purchase(user, content):
            return AccessInfo(
                has_access=True,
                pricing_type=pricing_type,
                price=price,
                currency=currency,
                access_reason="bundle",
            )

        # 5. Active subscription
        if self._has_subscription_access(user, content):
            return AccessInfo(
                has_access=True,
                pricing_type=pricing_type,
                price=price,
                currency=currency,
                access_reason="subscription",
            )

        # 6. No access — determine unlock methods
        unlock_methods = []
        if pricing_type == "paid":
            unlock_methods.append("purchase")
            if self._is_in_any_plan(content):
                unlock_methods.append("subscribe")

        return AccessInfo(
            has_access=False,
            pricing_type=pricing_type,
            price=price,
            currency=currency,
            unlock_methods=unlock_methods or None,
        )

    def bulk_check_access(self, user, content_list) -> dict[int, AccessInfo]:
        """Batch access check for listing pages. Avoids N+1 queries."""
        if not content_list:
            return {}

        result = {}

        # Owner/coach: skip all queries
        if hasattr(user, "role") and user.role in ("owner", "coach"):
            for item in content_list:
                pricing_type = getattr(item, "pricing_type", "free")
                result[item.pk] = AccessInfo(
                    has_access=True,
                    pricing_type=pricing_type,
                    price=getattr(item, "price", None),
                    currency=content_currency(item),
                    access_reason="owner",
                )
            return result

        # Unauthenticated: resolve from pricing_type + plan linkage
        if not hasattr(user, "pk") or user.pk is None or not user.is_authenticated:
            # Pre-fetch plan linkage for paid items
            paid_items = [i for i in content_list if getattr(i, "pricing_type", "free") == "paid"]
            plan_linked_ids = self._batch_plan_linked(paid_items) if paid_items else set()

            for item in content_list:
                pricing_type = getattr(item, "pricing_type", "free")
                if pricing_type == "free":
                    result[item.pk] = AccessInfo(has_access=True, pricing_type=pricing_type, access_reason="free")
                else:
                    unlock_methods = ["purchase"]
                    if item.pk in plan_linked_ids:
                        unlock_methods.append("subscribe")
                    result[item.pk] = AccessInfo(
                        has_access=False,
                        pricing_type=pricing_type,
                        price=getattr(item, "price", None),
                        currency=content_currency(item),
                        unlock_methods=unlock_methods,
                    )
            return result

        # Pre-fetch access data in batch queries
        items = list(content_list)
        if not items:
            return result

        target_ct = ContentType.objects.get_for_model(type(items[0]))
        purchased_ids = self._batch_direct_purchases(user, target_ct)
        bundle_ids = self._batch_bundle_purchases(user, target_ct)
        subscription_ids = self._batch_subscription_access(user, target_ct)
        plan_linked_ids = self._batch_plan_linked_by_ct(target_ct)

        for item in items:
            pricing_type = getattr(item, "pricing_type", "free")
            price = getattr(item, "price", None)
            currency = content_currency(item)

            if pricing_type == "free":
                result[item.pk] = AccessInfo(has_access=True, pricing_type=pricing_type, access_reason="free")
            elif item.pk in purchased_ids:
                result[item.pk] = AccessInfo(
                    has_access=True,
                    pricing_type=pricing_type,
                    price=price,
                    currency=currency,
                    access_reason="purchased",
                )
            elif item.pk in bundle_ids:
                result[item.pk] = AccessInfo(
                    has_access=True,
                    pricing_type=pricing_type,
                    price=price,
                    currency=currency,
                    access_reason="bundle",
                )
            elif item.pk in subscription_ids:
                result[item.pk] = AccessInfo(
                    has_access=True,
                    pricing_type=pricing_type,
                    price=price,
                    currency=currency,
                    access_reason="subscription",
                )
            else:
                unlock_methods = ["purchase"] if pricing_type == "paid" else []
                if pricing_type == "paid" and item.pk in plan_linked_ids:
                    unlock_methods.append("subscribe")
                result[item.pk] = AccessInfo(
                    has_access=False,
                    pricing_type=pricing_type,
                    price=price,
                    currency=currency,
                    unlock_methods=unlock_methods or None,
                )

        return result

    def get_unlock_options(self, content) -> dict:
        """Return all ways a piece of content can be unlocked (purchase, bundles, plans)."""
        from apps.billing.models import Bundle, BundleItem, SubscriptionPlan, SubscriptionPlanAccess

        ct = ContentType.objects.get_for_model(type(content))
        options = {}

        # 1. Direct purchase (if priced)
        pricing_type = getattr(content, "pricing_type", "free")
        price = getattr(content, "price", None)
        if pricing_type == "paid" and price:
            options["purchase"] = {
                "price": str(price),
                "currency": content_currency(content),
            }

        # 2. Bundles containing this content
        bundle_ids = BundleItem.objects.filter(content_type=ct, object_id=content.pk).values_list(
            "bundle_id", flat=True
        )
        bundles = Bundle.objects.filter(pk__in=bundle_ids, is_active=True)
        if bundles.exists():
            options["bundles"] = [
                {"id": b.pk, "name": b.name, "price": str(b.price), "currency": b.currency} for b in bundles
            ]

        # 3. Subscription plans granting access
        plan_ids = SubscriptionPlanAccess.objects.filter(content_type=ct, object_id=content.pk).values_list(
            "plan_id", flat=True
        )
        plans = SubscriptionPlan.objects.filter(pk__in=plan_ids, is_active=True)
        if plans.exists():
            options["plans"] = [
                {
                    "id": p.pk,
                    "name": p.name,
                    "price": str(p.price),
                    "currency": p.currency,
                    "billing_interval_months": p.billing_interval_months,
                }
                for p in plans
            ]

        return options

    # --- Private helpers ---

    def _is_in_any_plan(self, content) -> bool:
        try:
            from apps.billing.models import SubscriptionPlanAccess

            ct = ContentType.objects.get_for_model(type(content))
            return SubscriptionPlanAccess.objects.filter(
                content_type=ct,
                object_id=content.pk,
                plan__is_active=True,
            ).exists()
        except ImportError:
            return False

    def _batch_plan_linked(self, content_list) -> set[int]:
        """Return object IDs that are linked to any active subscription plan."""
        if not content_list:
            return set()
        try:
            from apps.billing.models import SubscriptionPlanAccess

            ct = ContentType.objects.get_for_model(type(content_list[0]))
            return set(
                SubscriptionPlanAccess.objects.filter(
                    content_type=ct,
                    object_id__in=[i.pk for i in content_list],
                    plan__is_active=True,
                ).values_list("object_id", flat=True)
            )
        except ImportError:
            return set()

    def _batch_plan_linked_by_ct(self, target_ct) -> set[int]:
        """Return all object IDs of a content type linked to any active plan."""
        try:
            from apps.billing.models import SubscriptionPlanAccess

            return set(
                SubscriptionPlanAccess.objects.filter(
                    content_type=target_ct,
                    plan__is_active=True,
                ).values_list("object_id", flat=True)
            )
        except ImportError:
            return set()

    def _has_direct_purchase(self, user, content) -> bool:
        try:
            from apps.billing.models import PaymentItem

            ct = ContentType.objects.get_for_model(type(content))
            return PaymentItem.objects.filter(
                content_type=ct,
                object_id=content.pk,
                payment__student=user,
                payment__status__in=("completed", "partially_refunded"),
                is_refunded=False,
            ).exists()
        except ImportError:
            return False

    def _has_bundle_purchase(self, user, content) -> bool:
        try:
            from apps.billing.models import Bundle, BundleItem, PaymentItem

            ct = ContentType.objects.get_for_model(type(content))
            bundle_ct = ContentType.objects.get_for_model(Bundle)
            bundle_ids = BundleItem.objects.filter(content_type=ct, object_id=content.pk).values_list(
                "bundle_id", flat=True
            )
            if not bundle_ids:
                return False
            return PaymentItem.objects.filter(
                content_type=bundle_ct,
                object_id__in=bundle_ids,
                payment__student=user,
                payment__status__in=("completed", "partially_refunded"),
                is_refunded=False,
            ).exists()
        except ImportError:
            return False

    def _has_subscription_access(self, user, content) -> bool:
        try:
            from apps.billing.models import Subscription, SubscriptionPlanAccess

            ct = ContentType.objects.get_for_model(type(content))
            now = timezone.now()
            active_plan_ids = Subscription.objects.filter(
                student=user, status="active", current_period_end__gt=now
            ).values_list("plan_id", flat=True)
            if not active_plan_ids:
                return False
            return SubscriptionPlanAccess.objects.filter(
                plan_id__in=active_plan_ids,
                content_type=ct,
                object_id=content.pk,
            ).exists()
        except ImportError:
            return False

    def _batch_direct_purchases(self, user, target_ct) -> set[int]:
        try:
            from apps.billing.models import PaymentItem

            return set(
                PaymentItem.objects.filter(
                    content_type=target_ct,
                    payment__student=user,
                    payment__status__in=("completed", "partially_refunded"),
                    is_refunded=False,
                ).values_list("object_id", flat=True)
            )
        except ImportError:
            return set()

    def _batch_bundle_purchases(self, user, target_ct) -> set[int]:
        try:
            from apps.billing.models import Bundle, BundleItem, PaymentItem

            bundle_ct = ContentType.objects.get_for_model(Bundle)
            purchased_bundle_ids = set(
                PaymentItem.objects.filter(
                    content_type=bundle_ct,
                    payment__student=user,
                    payment__status__in=("completed", "partially_refunded"),
                    is_refunded=False,
                ).values_list("object_id", flat=True)
            )
            if not purchased_bundle_ids:
                return set()
            return set(
                BundleItem.objects.filter(
                    bundle_id__in=purchased_bundle_ids,
                    content_type=target_ct,
                ).values_list("object_id", flat=True)
            )
        except ImportError:
            return set()

    def _batch_subscription_access(self, user, target_ct) -> set[int]:
        try:
            from apps.billing.models import Subscription, SubscriptionPlanAccess

            now = timezone.now()
            active_plan_ids = Subscription.objects.filter(
                student=user, status="active", current_period_end__gt=now
            ).values_list("plan_id", flat=True)
            if not active_plan_ids:
                return set()
            return set(
                SubscriptionPlanAccess.objects.filter(
                    plan_id__in=active_plan_ids,
                    content_type=target_ct,
                ).values_list("object_id", flat=True)
            )
        except ImportError:
            return set()
