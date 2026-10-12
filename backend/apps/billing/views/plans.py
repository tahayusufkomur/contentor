from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.billing.models import Subscription, SubscriptionPlan, SubscriptionPlanAccess
from apps.billing.serializers.plans import PlanAccessWriteItemSerializer, PlanAccessWriteSerializer
from apps.core.permissions import IsOwner
from apps.core.storage import sign_if_s3_key


def _resolve_access_items(plan):
    """Resolve SubscriptionPlanAccess rows into human-readable dicts."""
    access_qs = SubscriptionPlanAccess.objects.filter(plan=plan).select_related("content_type")

    model_map = {
        "course": ("courses", "course", "title", "slug"),
        "liveclass": ("live", "liveclass", "title", None),
        "livestream": ("live", "livestream", "title", None),
        "onsiteevent": ("live", "onsiteevent", "title", None),
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


def _access_content_types():
    """The kinds of content the owner's access page lists: API name -> ContentType."""
    writer = PlanAccessWriteItemSerializer()
    return {name: writer.resolve_content_type(name) for name in writer.CONTENT_TYPE_MAP}


def _access_payload(plan):
    """What the owner's access page loads, with items in the shape it PUTs
    back: the plan, the content it includes, and all it could include
    (everything that is not free, plus whatever it includes already)."""
    linked = set(plan.access_items.values_list("content_type_id", "object_id"))
    items, available = [], []
    for name, ct in _access_content_types().items():
        included = {object_id for ct_id, object_id in linked if ct_id == ct.pk}
        for obj in ct.model_class().objects.filter(Q(pk__in=included) | ~Q(pricing_type="free")):
            item = {
                "content_type": name,
                "object_id": obj.pk,
                "title": obj.title,
                "price": str(obj.price),
                "pricing_type": obj.pricing_type,
            }
            available.append(item)
            if obj.pk in included:
                items.append(item)
    return {
        "plan": {"id": plan.pk, "name": plan.name, "is_active": plan.is_active},
        "items": items,
        "available": available,
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def plan_list(request):
    """Public list of active subscription plans with item counts. The owner's
    billing page asks for the ones switched off too (?include_inactive=1)."""
    plans = SubscriptionPlan.objects.all()
    if not (request.query_params.get("include_inactive") and IsOwner().has_permission(request, None)):
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
                "billing_interval_months": p.billing_interval_months,
                "is_active": p.is_active,
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
            "billing_interval_months": plan.billing_interval_months,
            "items": items,
            "is_subscribed": is_subscribed,
        }
    )


@api_view(["GET", "PUT"])
@permission_classes([IsOwner])
def plan_access(request, pk):
    """The owner's access page for one plan, active or not. GET and PUT answer
    with the same payload, and PUT takes GET's `items` back unchanged."""
    plan = get_object_or_404(SubscriptionPlan, pk=pk)

    if request.method == "GET":
        return Response(_access_payload(plan))

    serializer = PlanAccessWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    content_types = _access_content_types()
    wanted = {(content_types[i["content_type"]].pk, i["object_id"]) for i in serializer.validated_data["items"]}
    # Replace only the kinds the page lists, and only where the selection
    # differs: a link it never showed is not its to drop.
    rows = plan.access_items.filter(content_type__in=content_types.values())
    have = {
        (ct_id, object_id): row_pk
        for row_pk, ct_id, object_id in rows.values_list("pk", "content_type_id", "object_id")
    }
    with transaction.atomic():
        rows.filter(pk__in=[row_pk for key, row_pk in have.items() if key not in wanted]).delete()
        SubscriptionPlanAccess.objects.bulk_create(
            SubscriptionPlanAccess(plan=plan, content_type_id=ct_id, object_id=object_id)
            for ct_id, object_id in wanted - have.keys()
        )

    return Response(_access_payload(plan))
