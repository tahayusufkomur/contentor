from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.billing.models import Subscription, SubscriptionPlan, SubscriptionPlanAccess
from apps.billing.serializers.plans import (
    PlanAccessItemSerializer,
    PlanAccessWriteItemSerializer,
    PlanAccessWriteSerializer,
    PlanWriteSerializer,
)
from apps.core.currency import tenant_charge_currency
from apps.core.permissions import IsOwner
from apps.core.storage import sign_if_s3_key


def _resolve_access_items(plan):
    """Resolve SubscriptionPlanAccess rows into human-readable dicts."""
    access_qs = SubscriptionPlanAccess.objects.filter(plan=plan).select_related("content_type")

    model_map = {
        "course": ("courses", "course", "title", "slug"),
        "liveclass": ("live", "liveclass", "title", None),
        "livestream": ("live", "livestream", "title", None),
        "downloadfile": ("downloads", "downloadfile", "title", None),
    }

    items = []
    for access in access_qs:
        model_name = access.content_type.model
        cfg = model_map.get(model_name)
        if not cfg:
            continue

        _app, _model, title_field, slug_field = cfg
        model_cls = access.content_type.model_class()
        obj = model_cls.objects.filter(pk=access.object_id).first()
        if not obj:
            continue

        item = {
            "type": model_name if model_name != "downloadfile" else "download",
            "id": obj.pk,
            "title": getattr(obj, title_field, ""),
        }
        if slug_field:
            item["slug"] = getattr(obj, slug_field, "")
        raw_url = getattr(obj, "thumbnail_url", "")
        if raw_url:
            item["thumbnail_url"] = sign_if_s3_key(raw_url)
        items.append(item)

    return items


def _is_owner(request):
    return IsOwner().has_permission(request, None)


def _forbidden():
    return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)


def _plan_row(plan, *, is_subscribed=False):
    return {
        "id": plan.id,
        "name": plan.name,
        "description": plan.description,
        "price": str(plan.price),
        "currency": plan.currency,
        "billing_interval_months": plan.billing_interval_months,
        "is_active": plan.is_active,
        "item_count": SubscriptionPlanAccess.objects.filter(plan=plan).count(),
        "is_subscribed": is_subscribed,
    }


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def plan_list(request):
    """Public list of active subscription plans with item counts.

    The owner creates a plan here (POST), and `?all=1` shows her the plans she
    switched off too. Without it she gets the public list like anyone else, so
    the pricing page looks the same when she browses her own site.
    """
    if request.method == "POST":
        if not _is_owner(request):
            return _forbidden()
        serializer = PlanWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Charge currency is a tenant-level invariant, never user input.
        plan = serializer.save(currency=tenant_charge_currency())
        return Response(_plan_row(plan), status=status.HTTP_201_CREATED)

    plans = SubscriptionPlan.objects.all()
    if not (request.query_params.get("all") and _is_owner(request)):
        plans = plans.filter(is_active=True)

    # Build set of plan IDs the user is actively subscribed to
    subscribed_plan_ids = set()
    if request.user.is_authenticated:
        now = timezone.now()
        subscribed_plan_ids = set(
            Subscription.objects.filter(
                student=request.user,
                status="active",
                current_period_end__gt=now,
            ).values_list("plan_id", flat=True)
        )

    return Response([_plan_row(p, is_subscribed=p.id in subscribed_plan_ids) for p in plans])


@api_view(["GET", "PATCH"])
@permission_classes([AllowAny])
def plan_detail(request, pk):
    """Public plan detail with all accessible content resolved.

    The owner also reaches a plan she switched off, and edits it (PATCH). A new
    price or cycle mints a new Stripe price at the next checkout; subscribers
    keep the terms they signed up on (`_ensure_subscription_price`).
    """
    if request.method == "PATCH":
        if not _is_owner(request):
            return _forbidden()
        plan = get_object_or_404(SubscriptionPlan, pk=pk)
        serializer = PlanWriteSerializer(plan, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return Response(_plan_row(serializer.save()))

    visible = SubscriptionPlan.objects.all() if _is_owner(request) else SubscriptionPlan.objects.filter(is_active=True)
    plan = get_object_or_404(visible, pk=pk)
    items = _resolve_access_items(plan)

    is_subscribed = False
    if request.user.is_authenticated:
        now = timezone.now()
        is_subscribed = Subscription.objects.filter(
            student=request.user,
            plan=plan,
            status="active",
            current_period_end__gt=now,
        ).exists()

    return Response(
        {
            "id": plan.id,
            "name": plan.name,
            "description": plan.description,
            "price": str(plan.price),
            "currency": plan.currency,
            "billing_interval_months": plan.billing_interval_months,
            "is_active": plan.is_active,
            "items": items,
            "is_subscribed": is_subscribed,
        }
    )


@api_view(["GET", "PUT"])
@permission_classes([IsOwner])
def plan_access(request, pk):
    plan = get_object_or_404(SubscriptionPlan, pk=pk)

    if request.method == "GET":
        access_items = SubscriptionPlanAccess.objects.filter(plan=plan).select_related("content_type")
        serializer = PlanAccessItemSerializer(access_items, many=True)
        return Response(serializer.data)

    # PUT: bulk replace
    serializer = PlanAccessWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    items_data = serializer.validated_data["items"]
    item_writer = PlanAccessWriteItemSerializer()

    # Delete all existing access rows for this plan
    SubscriptionPlanAccess.objects.filter(plan=plan).delete()

    # Create new ones
    created = []
    for item_data in items_data:
        ct = item_writer.resolve_content_type(item_data["content_type"])
        access_item, _ = SubscriptionPlanAccess.objects.get_or_create(
            plan=plan,
            content_type=ct,
            object_id=item_data["object_id"],
        )
        created.append(access_item)

    result_serializer = PlanAccessItemSerializer(created, many=True)
    return Response(result_serializer.data, status=status.HTTP_200_OK)
