import logging
from dataclasses import dataclass
from datetime import UTC, datetime
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
    access_ends_at: datetime | None = None
    opens_at: datetime | None = None


# A stamp, link or window with no start is open from the beginning of time.
_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)
_PAID = ("completed", "partially_refunded")


def _bounds(window, anchor):
    """(start, end) of a window for someone who got in at ``anchor``; no window means open and forever."""
    from apps.billing.ways import window_bounds

    return window_bounds(window, anchor) if window else (anchor, None)


def _decide(candidates, now):
    """candidates: (reason, start, end) in order of check. -> (reason, access_ends_at, opens_at)."""
    open_now = [(r, e) for r, s, e in candidates if s <= now and (e is None or now <= e)]
    if open_now:
        forever = any(e is None for _, e in open_now)
        return open_now[0][0], None if forever else max(e for _, e in open_now), None
    ahead = [s for _, s, e in candidates if s > now and (e is None or e >= s)]
    return None, None, min(ahead, default=None)


class ContentAccessService:
    def check_access(self, user, content) -> bool:
        return self.get_access_info(user, content).has_access

    def get_access_info(self, user, content) -> AccessInfo:
        # One path for one item and for a list, so the two can never disagree.
        return self.bulk_check_access(user, [content])[content.pk]

    def bulk_check_access(self, user, content_list) -> dict[int, AccessInfo]:
        """Access for a list of one kind of content, one query per source. ``user`` may be anonymous.

        Order of checks: owner/coach, free, a purchase (direct, then through a bundle), a grant, a plan.
        A way counts while its window is open; ``access_ends_at`` is when the last open way closes
        (None if one never does) and ``opens_at`` the soonest start among the user's own ways.
        """
        items = list(content_list)
        if not items:
            return {}

        if hasattr(user, "role") and user.role in ("owner", "coach"):
            return {
                i.pk: AccessInfo(
                    has_access=True,
                    pricing_type=getattr(i, "pricing_type", "free"),
                    price=getattr(i, "price", None),
                    currency=content_currency(i),
                    access_reason="owner",
                )
                for i in items
            }

        ct = ContentType.objects.get_for_model(type(items[0]))
        ids = [i.pk for i in items]
        now = timezone.now()
        authed = getattr(user, "pk", None) is not None and getattr(user, "is_authenticated", False)
        free_windows = self._free_windows(ct, ids)
        purchases = self._purchases(user, ct, ids) if authed else {}
        bundles = self._bundle_purchases(user, ct, ids) if authed else {}
        grants = self._grants(user, ct, ids) if authed else {}
        plans = self._plan_windows(user, ct, ids, now) if authed else {}
        plan_linked = (
            self._active_plan_linked(ct, ids)
            if any(getattr(i, "pricing_type", "free") == "paid" for i in items)
            else set()
        )

        result = {}
        for item in items:
            pricing_type = getattr(item, "pricing_type", "free")
            candidates = [
                (reason, *b)
                for reason, bounds in (
                    ("free", self._free_bounds(user, authed, pricing_type, free_windows.get(item.pk))),
                    ("purchased", purchases.get(item.pk, [])),
                    ("bundle", bundles.get(item.pk, [])),
                    ("granted", grants.get(item.pk, [])),
                    ("subscription", plans.get(item.pk, [])),
                )
                for b in bounds
            ]
            reason, ends_at, opens_at = _decide(candidates, now)
            price, currency = getattr(item, "price", None), content_currency(item)
            if reason == "free":
                result[item.pk] = AccessInfo(True, pricing_type, access_reason=reason, access_ends_at=ends_at)
            elif reason:
                result[item.pk] = AccessInfo(
                    True, pricing_type, price, currency, access_reason=reason, access_ends_at=ends_at
                )
            else:
                unlock_methods = []
                if pricing_type == "paid":
                    unlock_methods.append("purchase")
                    if item.pk in plan_linked:
                        unlock_methods.append("subscribe")
                elif pricing_type == "subscription":
                    unlock_methods.append("subscribe")
                result[item.pk] = AccessInfo(
                    False, pricing_type, price, currency, unlock_methods=unlock_methods or None, opens_at=opens_at
                )
        return result

    def get_unlock_options(self, content) -> dict:
        """Return all ways a piece of content can be unlocked (free window, purchase, bundles, plans)."""
        from apps.billing.models import AccessWindow, Bundle, BundleItem, SubscriptionPlanAccess
        from apps.billing.ways import _window_of

        ct = ContentType.objects.get_for_model(type(content))
        options = {}
        windows = {w.way: _window_of(w) for w in AccessWindow.objects.filter(content_type=ct, object_id=content.pk)}

        # 1. A free window (free for everyone with no window has nothing to unlock)
        if windows.get("free"):
            options["free"] = {"window": windows["free"]}

        # 2. Direct purchase (if priced)
        pricing_type = getattr(content, "pricing_type", "free")
        price = getattr(content, "price", None)
        if pricing_type == "paid" and price:
            options["purchase"] = {
                "price": str(price),
                "currency": content_currency(content),
                "window": windows.get("buy"),
            }

        # 3. Bundles containing this content
        bundle_ids = BundleItem.objects.filter(content_type=ct, object_id=content.pk).values_list(
            "bundle_id", flat=True
        )
        bundles = Bundle.objects.filter(pk__in=bundle_ids, is_active=True)
        if bundles.exists():
            options["bundles"] = [
                {"id": b.pk, "name": b.name, "price": str(b.price), "currency": b.currency} for b in bundles
            ]

        # 4. Subscription plans on sale that include it
        links = list(
            SubscriptionPlanAccess.objects.filter(content_type=ct, object_id=content.pk, plan__is_active=True)
            .select_related("plan")
            .order_by("plan__sort_order", "plan_id")
        )
        if links:
            options["plans"] = [
                {
                    "id": link.plan.pk,
                    "name": link.plan.name,
                    "price": str(link.plan.price),
                    "currency": link.plan.currency,
                    "billing_interval_months": link.plan.billing_interval_months,
                    "window": _window_of(link),
                }
                for link in links
            ]

        return options

    # --- Per-source loaders: {object_id: [(start, end), ...]} for the items asked about ---

    def _free_windows(self, ct, ids) -> dict[int, dict]:
        from apps.billing.models import AccessWindow
        from apps.billing.ways import _window_of

        rows = AccessWindow.objects.filter(content_type=ct, object_id__in=ids, way="free")
        return {w.object_id: window for w in rows if (window := _window_of(w))}

    def _free_bounds(self, user, authed, pricing_type, window) -> list:
        if window is None:  # no window: free covers everyone, or there is no free way
            return [(_EPOCH, None)] if pricing_type == "free" else []
        if authed:
            return [_bounds(window, user.date_joined)]
        # A visitor has no joining date: only a calendar window reaches them.
        if any(key.endswith("_days") for key in window):
            return []
        return [_bounds(window, _EPOCH)]

    def _purchases(self, user, ct, ids) -> dict[int, list]:
        from apps.billing.models import PaymentItem

        rows = PaymentItem.objects.filter(
            content_type=ct,
            object_id__in=ids,
            payment__student=user,
            payment__status__in=_PAID,
            is_refunded=False,
        ).values_list("object_id", "access_starts_at", "access_ends_at")
        out: dict[int, list] = {}
        for pk, start, end in rows:
            out.setdefault(pk, []).append((start or _EPOCH, end))
        return out

    def _bundle_purchases(self, user, ct, ids) -> dict[int, list]:
        from apps.billing.models import Bundle, BundleItem, PaymentItem

        rows = PaymentItem.objects.filter(
            content_type=ContentType.objects.get_for_model(Bundle),
            payment__student=user,
            payment__status__in=_PAID,
            is_refunded=False,
        ).values_list("object_id", "access_starts_at", "access_ends_at")
        stamps: dict[int, list] = {}
        for bundle_id, start, end in rows:
            stamps.setdefault(bundle_id, []).append((start or _EPOCH, end))
        if not stamps:
            return {}
        out: dict[int, list] = {}
        for bundle_id, pk in BundleItem.objects.filter(
            bundle_id__in=stamps, content_type=ct, object_id__in=ids
        ).values_list("bundle_id", "object_id"):
            out.setdefault(pk, []).extend(stamps[bundle_id])
        return out

    def _grants(self, user, ct, ids) -> dict[int, list]:
        if (ct.app_label, ct.model) != ("courses", "course"):
            return {}
        from apps.courses.models import Enrollment

        rows = Enrollment.objects.filter(user=user, course_id__in=ids, is_active=True, granted=True).values_list(
            "course_id", "access_starts_at", "access_ends_at"
        )
        out: dict[int, list] = {}
        for pk, start, end in rows:
            out.setdefault(pk, []).append((start or _EPOCH, end))
        return out

    def _plan_windows(self, user, ct, ids, now) -> dict[int, list]:
        """Each plan link's window, anchored on when the user's active subscription to that plan began."""
        from apps.billing.models import Subscription, SubscriptionPlanAccess
        from apps.billing.ways import _window_of

        subs = list(
            Subscription.objects.filter(student=user, status="active", current_period_end__gt=now).values_list(
                "plan_id", "created_at"
            )
        )
        if not subs:
            return {}
        out: dict[int, list] = {}
        for link in SubscriptionPlanAccess.objects.filter(
            plan_id__in={plan_id for plan_id, _ in subs}, content_type=ct, object_id__in=ids
        ):
            window = _window_of(link)
            for plan_id, began in subs:
                if plan_id == link.plan_id:
                    out.setdefault(link.object_id, []).append(_bounds(window, began))
        return out

    def _active_plan_linked(self, ct, ids) -> set[int]:
        """Object ids that a plan on sale includes (what makes "subscribe" an option)."""
        from apps.billing.models import SubscriptionPlanAccess

        return set(
            SubscriptionPlanAccess.objects.filter(content_type=ct, object_id__in=ids, plan__is_active=True).values_list(
                "object_id", flat=True
            )
        )
