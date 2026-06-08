import logging
from decimal import Decimal

from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.db import connection
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.billing.providers import connect
from apps.billing.providers.types import ProviderError
from apps.core.access import ContentAccessService
from apps.core.constants import REGION_DEFAULT_CURRENCY
from apps.core.monetization import can_monetize
from apps.core.permissions import IsOwner
from apps.courses.models import Course, Enrollment

from ..models import Bundle, BundleItem, Payment, PaymentItem, Subscription, SubscriptionPlan
from ..serializers.payments import PaymentInitializeSerializer, PaymentItemInputSerializer

logger = logging.getLogger(__name__)


def _bypass_enabled() -> bool:
    return bool(getattr(settings, "BILLING_BYPASS_ENABLED", False))


def _to_cents(amount: Decimal) -> int:
    """Convert a 2-decimal money amount to Stripe minor units (USD cents / TRY kuruş)."""
    return int((amount * 100).to_integral_value())


def tenant_currency(tenant) -> str:
    """The currency a tenant charges in — its connected account's currency.

    Locked at the coach's first platform checkout (`billing_currency`); falls
    back to the region default. Content/plan prices are interpreted in this
    currency, so the marketplace charge always matches the connected account
    (a global/USD account can't be charged in TRY).
    """
    cur = (getattr(tenant, "billing_currency", "") or "").strip()
    if cur:
        return cur
    region = getattr(tenant, "region", "") or "global"
    return REGION_DEFAULT_CURRENCY.get(region, "USD")


def _get_fee_pct() -> Decimal:
    """Retrieve the platform transaction fee percentage from the current tenant's plan."""
    try:
        tenant = connection.tenant
        if tenant and tenant.plan and tenant.plan.transaction_fee_pct is not None:
            return Decimal(str(tenant.plan.transaction_fee_pct))
    except Exception:
        pass
    return Decimal("10")


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def payment_initialize(request):
    """
    Initialize a one-time payment for one or more purchasable items.

    Validates each item is purchasable and not already owned, then creates
    a pending Payment with associated PaymentItem records.
    """
    serializer = PaymentInitializeSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    items_data = serializer.validated_data["items"]
    access_service = ContentAccessService()
    fee_pct = _get_fee_pct()

    resolved_items = []

    for item_data in items_data:
        item_serializer = PaymentItemInputSerializer(data=item_data)
        item_serializer.is_valid(raise_exception=True)

        try:
            ct, obj = item_serializer.resolve()
        except Exception:
            return Response(
                {
                    "detail": f"Item not found: content_type={item_data['content_type']}, object_id={item_data['object_id']}."
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        # Validate purchasability: must be a paid item or a Bundle
        is_bundle = isinstance(obj, Bundle)
        pricing_type = getattr(obj, "pricing_type", None)

        if not is_bundle and pricing_type != "paid":
            return Response(
                {"detail": f"Item '{obj}' is not purchasable (pricing_type must be 'paid')."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate not already owned
        access_info = access_service.get_access_info(request.user, obj)
        if access_info.has_access and access_info.access_reason in ("purchased", "bundle"):
            return Response(
                {"detail": f"Item '{obj}' is already owned by this user."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        item_price = Decimal(str(obj.price))
        platform_fee = (item_price * fee_pct / Decimal("100")).quantize(Decimal("0.01"))
        submerchant_payout = item_price - platform_fee

        resolved_items.append(
            {
                "ct": ct,
                "obj": obj,
                "item_price": item_price,
                "platform_fee": platform_fee,
                "submerchant_payout": submerchant_payout,
            }
        )

    # Aggregate totals
    total_amount = sum(r["item_price"] for r in resolved_items)
    total_platform_fee = sum(r["platform_fee"] for r in resolved_items)
    total_submerchant_payout = sum(r["submerchant_payout"] for r in resolved_items)

    # The charge currency is the tenant's (connected account's) currency, so a
    # global/USD coach is never charged in TRY. Content prices are amounts in
    # that currency.
    currency = tenant_currency(connection.tenant)

    # ── Bypass (dev/CI): synthesize a completed payment and grant access now ──
    if _bypass_enabled():
        payment = Payment.objects.create(
            student=request.user,
            payment_type="one_time",
            status="completed",
            amount=total_amount,
            platform_fee=total_platform_fee,
            submerchant_payout=total_submerchant_payout,
            currency=currency,
            provider="bypass",
        )
        _create_payment_items(payment, resolved_items)
        grant_access_for_payment(payment)
        return Response(
            {
                "payment_id": payment.pk,
                "amount": str(payment.amount),
                "currency": payment.currency,
                "item_count": len(resolved_items),
                "status": "completed",
            },
            status=status.HTTP_201_CREATED,
        )

    # ── Stripe Connect direct charge ──
    tenant = connection.tenant
    if not can_monetize(tenant):
        return Response(
            {
                "error": "COACH_CANNOT_ACCEPT_PAYMENTS",
                "detail": "This creator isn't set up to accept payments yet.",
            },
            status=status.HTTP_409_CONFLICT,
        )

    # Pending until the connected-account webhook confirms the charge.
    payment = Payment.objects.create(
        student=request.user,
        payment_type="one_time",
        status="pending",
        amount=total_amount,
        platform_fee=total_platform_fee,
        submerchant_payout=total_submerchant_payout,
        currency=currency,
        provider="stripe",
    )
    _create_payment_items(payment, resolved_items)

    line_items = [
        {
            "price_data": {
                "currency": currency.lower(),
                "product_data": {"name": str(r["obj"])[:250]},
                "unit_amount": _to_cents(r["item_price"]),
            },
            "quantity": 1,
        }
        for r in resolved_items
    ]
    metadata = {
        "tenant_id": str(tenant.pk),
        "user_id": str(request.user.pk),
        "payment_id": str(payment.pk),
    }

    from apps.billing.views.platform import _tenant_origin

    origin = _tenant_origin(tenant)
    success_url = f"{origin}/checkout/success?payment_id={payment.pk}&session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/checkout?canceled=1"

    try:
        checkout = connect.create_marketplace_checkout(
            account_id=tenant.stripe_account_id,
            line_items=line_items,
            application_fee_cents=_to_cents(total_platform_fee),
            success_url=success_url,
            cancel_url=cancel_url,
            customer_email=getattr(request.user, "email", "") or "",
            metadata=metadata,
        )
    except ProviderError as exc:
        # Leave the pending Payment for audit; surface a clean error.
        return Response(
            {"error": exc.code, "detail": str(exc)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    payment.provider_payment_id = ""
    payment.metadata = {**(payment.metadata or {}), "checkout_session_id": checkout.session_id}
    payment.save(update_fields=["metadata"])

    return Response(
        {
            "payment_id": payment.pk,
            "checkout_url": checkout.url,
            "amount": str(payment.amount),
            "currency": payment.currency,
            "item_count": len(resolved_items),
            "status": "pending",
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def payment_detail(request, payment_id):
    """Return a payment's status for the post-checkout success page to poll.

    Scoped to the requesting student so one buyer can't read another's payment.
    """
    payment = get_object_or_404(Payment, pk=payment_id, student=request.user)
    return Response(
        {
            "payment_id": payment.pk,
            "status": payment.status,
            "amount": str(payment.amount),
            "currency": payment.currency,
            "item_count": payment.items.count(),
        }
    )


def _create_payment_items(payment, resolved_items):
    for r in resolved_items:
        PaymentItem.objects.create(
            payment=payment,
            content_type=r["ct"],
            object_id=r["obj"].pk,
            item_price=r["item_price"],
            submerchant_payout=r["submerchant_payout"],
        )


@api_view(["POST"])
@permission_classes([IsOwner])
def payment_item_refund(request, payment_id, item_id):
    """
    Refund a single item within a payment.

    Only the tenant owner may issue refunds. Sets the PaymentItem as refunded,
    creates a refund Payment record, deactivates any Course Enrollment, and
    updates the original Payment status to 'partially_refunded' or 'refunded'.
    """
    payment = get_object_or_404(Payment, pk=payment_id)
    payment_item = get_object_or_404(PaymentItem, pk=item_id, payment=payment)

    # Validate refundable state
    if payment.status not in ("completed", "partially_refunded"):
        return Response(
            {"detail": "Payment is not in a refundable state."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if payment_item.is_refunded:
        return Response(
            {"detail": "This item has already been refunded."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Mark item as refunded
    payment_item.is_refunded = True
    payment_item.save(update_fields=["is_refunded"])

    # Create a refund Payment record
    refund_payment = Payment.objects.create(
        student=payment.student,
        payment_type="refund",
        status="completed",
        amount=payment_item.item_price,
        platform_fee=Decimal("0.00"),
        submerchant_payout=Decimal("0.00"),
        currency=payment.currency,
        provider=payment.provider,
        original_payment=payment,
    )

    # If the content is a Course, deactivate the related Enrollment
    content_obj = payment_item.content_object
    if isinstance(content_obj, Course):
        Enrollment.objects.filter(
            user=payment.student,
            course=content_obj,
        ).update(is_active=False)

    # Determine updated payment status
    all_items = payment.items.all()
    all_refunded = all(item.is_refunded for item in all_items)
    new_status = "refunded" if all_refunded else "partially_refunded"

    payment.status = new_status
    payment.save(update_fields=["status"])

    return Response(
        {
            "detail": "Item refunded.",
            "payment_status": new_status,
            "refund_payment_id": refund_payment.pk,
        },
        status=status.HTTP_200_OK,
    )


def grant_access_for_payment(payment):
    """Apply access side-effects for a completed payment, across all content types.

    Access to downloads, live sessions, and bundle contents flows automatically
    from the `PaymentItem` rows via `ContentAccessService` (a completed,
    non-refunded PaymentItem unlocks any content type), so the only explicit
    record this needs to create is a course `Enrollment` — for directly
    purchased courses and for courses inside a purchased bundle.

    Idempotent: safe to call again on webhook replay (`get_or_create`).
    """
    # Use the raw FK id, not `payment.student`: when this runs inside a tenant
    # schema (webhook path) the search_path excludes public, so dereferencing the
    # shared-schema User would raise DoesNotExist. The id is all Enrollment needs.
    user_id = payment.student_id
    course_ct = ContentType.objects.get_for_model(Course)
    for item in payment.items.all():
        obj = item.content_object
        if obj is None:
            continue
        if isinstance(obj, Course):
            Enrollment.objects.get_or_create(user_id=user_id, course=obj, defaults={"payment_id": payment.pk})
        elif isinstance(obj, Bundle):
            bundle_course_ids = BundleItem.objects.filter(bundle=obj, content_type=course_ct).values_list(
                "object_id", flat=True
            )
            for course_id in bundle_course_ids:
                try:
                    course = Course.objects.get(pk=course_id)
                except Course.DoesNotExist:
                    continue
                Enrollment.objects.get_or_create(user_id=user_id, course=course, defaults={"payment_id": payment.pk})


def _ensure_subscription_price(plan, account_id, currency):
    """Ensure `plan` has a current connected-account Stripe Price; (re)provision per D1.

    A new Price is created only when missing or when the plan's amount changed —
    existing subscribers keep their Stripe subscription's old Price. The Price is
    minted in `currency` (the tenant's currency) so it matches the connected
    account; the plan's `currency` field default never causes a mismatch.
    """
    amount_cents = _to_cents(Decimal(str(plan.price)))
    if plan.stripe_price_id and plan.stripe_price_amount_cents == amount_cents:
        return plan.stripe_price_id
    price_id = connect.provision_subscription_price(
        account_id=account_id,
        product_name=plan.name,
        currency=currency,
        amount_cents=amount_cents,
    )
    plan.stripe_price_id = price_id
    plan.stripe_price_amount_cents = amount_cents
    plan.save(update_fields=["stripe_price_id", "stripe_price_amount_cents"])
    return price_id


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def subscribe(request):
    """Subscribe the student to a coach `SubscriptionPlan`.

    Body: `{"plan_id": <int>}`. Bypass synthesizes an active subscription
    immediately; Stripe returns a hosted Checkout URL (mode=subscription) created
    on the coach's connected account, and the tenant `Subscription` is created /
    activated by the webhook.
    """
    plan_id = request.data.get("plan_id")
    if not plan_id:
        return Response({"detail": "plan_id is required."}, status=status.HTTP_400_BAD_REQUEST)

    plan = get_object_or_404(SubscriptionPlan, pk=plan_id, is_active=True)

    # Check if user already has an active subscription to this plan
    existing = Subscription.objects.filter(
        student=request.user, plan=plan, status="active", cancelled_at__isnull=True
    ).first()
    if existing:
        return Response(
            {"detail": "You already have an active subscription to this plan."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # ── Bypass (dev/CI): synthesize an active subscription + completed Payment ──
    if _bypass_enabled():
        now = timezone.now()
        from datetime import timedelta

        subscription = Subscription.objects.create(
            student=request.user,
            plan=plan,
            billing_amount=plan.price,
            billing_currency=plan.currency,
            status="active",
            provider="bypass",
            current_period_start=now,
            current_period_end=now + timedelta(days=30),
        )
        fee_pct = _get_fee_pct()
        platform_fee = (plan.price * fee_pct / Decimal("100")).quantize(Decimal("0.01"))
        Payment.objects.create(
            student=request.user,
            payment_type="subscription",
            status="completed",
            amount=plan.price,
            platform_fee=platform_fee,
            submerchant_payout=plan.price - platform_fee,
            currency=plan.currency,
            provider="bypass",
            subscription=subscription,
        )
        return Response(
            {
                "subscription_id": subscription.pk,
                "plan": plan.name,
                "status": "active",
                "current_period_end": subscription.current_period_end.isoformat(),
            },
            status=status.HTTP_201_CREATED,
        )

    # ── Stripe Connect recurring (direct charge, application_fee_percent) ──
    tenant = connection.tenant
    if not can_monetize(tenant):
        return Response(
            {
                "error": "COACH_CANNOT_ACCEPT_PAYMENTS",
                "detail": "This creator isn't set up to accept payments yet.",
            },
            status=status.HTTP_409_CONFLICT,
        )

    from apps.billing.views.platform import _tenant_origin

    try:
        price_id = _ensure_subscription_price(plan, tenant.stripe_account_id, tenant_currency(tenant))
        origin = _tenant_origin(tenant)
        checkout = connect.create_subscription_checkout(
            account_id=tenant.stripe_account_id,
            price_id=price_id,
            application_fee_percent=float(_get_fee_pct()),
            success_url=f"{origin}/subscriptions?sub=success",
            cancel_url=f"{origin}/plans?canceled=1",
            customer_email=getattr(request.user, "email", "") or "",
            metadata={
                "tenant_id": str(tenant.pk),
                "user_id": str(request.user.pk),
                "subscription_plan_id": str(plan.pk),
            },
        )
    except ProviderError as exc:
        return Response({"error": exc.code, "detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(
        {"checkout_url": checkout.url, "plan": plan.name, "status": "pending"},
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_subscriptions(request):
    """List the requesting student's subscriptions for the management UI."""
    subs = (
        Subscription.objects.filter(student=request.user).select_related("plan", "pending_plan").order_by("-created_at")
    )
    return Response(
        [
            {
                "id": s.pk,
                "plan_id": s.plan_id,
                "plan_name": s.plan.name if s.plan else None,
                "status": s.status,
                "billing_amount": str(s.billing_amount),
                "billing_currency": s.billing_currency,
                "cancel_at_period_end": s.cancel_at_period_end,
                "current_period_end": s.current_period_end.isoformat() if s.current_period_end else None,
                "pending_plan_name": s.pending_plan.name if s.pending_plan else None,
            }
            for s in subs
        ]
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def subscription_cancel(request, subscription_id):
    """Cancel the student's subscription at period end."""
    sub = get_object_or_404(Subscription, pk=subscription_id, student=request.user)
    if sub.status not in ("active", "past_due"):
        return Response({"detail": "Subscription is not active."}, status=status.HTTP_400_BAD_REQUEST)

    if sub.provider == "stripe" and sub.provider_subscription_id:
        try:
            connect.cancel_subscription(
                account_id=connection.tenant.stripe_account_id,
                subscription_id=sub.provider_subscription_id,
                at_period_end=True,
            )
        except ProviderError as exc:
            return Response({"error": exc.code, "detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    sub.cancel_at_period_end = True
    sub.save(update_fields=["cancel_at_period_end"])
    return Response(
        {"id": sub.pk, "status": sub.status, "cancel_at_period_end": True},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def subscription_change_plan(request, subscription_id):
    """Schedule a plan change for next billing cycle via `pending_plan`.

    For Stripe subscriptions the connected-account subscription item is moved to
    the new plan's Price (no proration); the local plan swap is applied on the
    next `invoice.paid`.
    """
    sub = get_object_or_404(Subscription, pk=subscription_id, student=request.user)
    new_plan_id = request.data.get("plan_id")
    if not new_plan_id:
        return Response({"detail": "plan_id is required."}, status=status.HTTP_400_BAD_REQUEST)
    new_plan = get_object_or_404(SubscriptionPlan, pk=new_plan_id, is_active=True)
    if new_plan.pk == sub.plan_id:
        return Response({"detail": "Already on this plan."}, status=status.HTTP_400_BAD_REQUEST)

    if sub.provider == "stripe" and sub.provider_subscription_id:
        try:
            account_id = connection.tenant.stripe_account_id
            new_price_id = _ensure_subscription_price(new_plan, account_id, tenant_currency(connection.tenant))
            connect.update_subscription_price(
                account_id=account_id,
                subscription_id=sub.provider_subscription_id,
                new_price_id=new_price_id,
            )
        except ProviderError as exc:
            return Response({"error": exc.code, "detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    sub.pending_plan = new_plan
    sub.save(update_fields=["pending_plan"])
    return Response(
        {"id": sub.pk, "pending_plan": new_plan.name, "applies": "next_cycle"},
        status=status.HTTP_200_OK,
    )
