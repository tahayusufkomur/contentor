from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.db import connection
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.access import ContentAccessService
from apps.core.permissions import IsOwner
from apps.courses.models import Course, Enrollment

from ..models import Bundle, BundleItem, Payment, PaymentItem, Subscription, SubscriptionPlan
from ..serializers.payments import PaymentInitializeSerializer, PaymentItemInputSerializer


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

    # Determine currency from first item (items within one payment must share currency)
    currency = getattr(resolved_items[0]["obj"], "currency", "TRY") if resolved_items else "TRY"

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

    for r in resolved_items:
        PaymentItem.objects.create(
            payment=payment,
            content_type=r["ct"],
            object_id=r["obj"].pk,
            item_price=r["item_price"],
            submerchant_payout=r["submerchant_payout"],
        )

    # Bypass: auto-grant access for purchased content
    _grant_access(request.user, resolved_items)

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


def _grant_access(user, resolved_items):
    """Auto-enroll user in courses from purchased items (including bundle contents)."""
    for r in resolved_items:
        obj = r["obj"]
        if isinstance(obj, Course):
            Enrollment.objects.get_or_create(user=user, course=obj)
        elif isinstance(obj, Bundle):
            # Grant access to all courses inside the bundle
            course_ct = ContentType.objects.get_for_model(Course)
            bundle_courses = BundleItem.objects.filter(bundle=obj, content_type=course_ct).values_list(
                "object_id", flat=True
            )
            for course_id in bundle_courses:
                try:
                    course = Course.objects.get(pk=course_id)
                    Enrollment.objects.get_or_create(user=user, course=course)
                except Course.DoesNotExist:
                    pass


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def subscribe(request):
    """
    Bypass subscribe: immediately create an active subscription for the user.

    Expects: {"plan_id": <int>}
    Creates Subscription + completed Payment. No real payment processing.
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

    now = timezone.now()
    from datetime import timedelta

    subscription = Subscription.objects.create(
        student=request.user,
        plan=plan,
        billing_amount=plan.price,
        billing_currency=plan.currency,
        status="active",
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
