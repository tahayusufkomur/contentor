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
)
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


@api_view(["GET"])
@permission_classes([AllowAny])
def plan_list(request):
    """Public list of active subscription plans with item counts."""
    plans = SubscriptionPlan.objects.filter(is_active=True)

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

    data = []
    for p in plans:
        item_count = SubscriptionPlanAccess.objects.filter(plan=p).count()
        data.append(
            {
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "price": str(p.price),
                "currency": p.currency,
                "item_count": item_count,
                "is_subscribed": p.id in subscribed_plan_ids,
            }
        )
    return Response(data)


@api_view(["GET"])
@permission_classes([AllowAny])
def plan_detail(request, pk):
    """Public plan detail with all accessible content resolved."""
    plan = get_object_or_404(SubscriptionPlan, pk=pk, is_active=True)
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
