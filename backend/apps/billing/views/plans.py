from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.translation import gettext as _
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.billing import ways
from apps.billing.models import Subscription, SubscriptionPlan, SubscriptionPlanAccess
from apps.billing.models.core import is_draft, item_count
from apps.billing.serializers.plans import (
    PlanAccessWriteItemSerializer,
    PlanAccessWriteSerializer,
    PlanWriteSerializer,
)
from apps.core.currency import tenant_charge_currency
from apps.core.permissions import IsOwner, is_coach_or_owner
from apps.core.storage import sign_if_s3_key
from apps.media import designs

# The date a cover's badge reads on a course or an event: a course's creation ("New"), an event's start.
_BADGE_DATE = {
    "course": "created_at",
    "liveclass": "scheduled_at",
    "livestream": "scheduled_at",
    "onsiteevent": "scheduled_at",
}


def _resolve_access_items(plan, *, drafts: bool):
    """Resolve SubscriptionPlanAccess rows into human-readable dicts; a draft only with ``drafts`` (her own view)."""
    access_qs = SubscriptionPlanAccess.objects.filter(plan=plan).select_related("content_type")

    model_map = {
        "course": ("courses", "course", "title", "slug"),
        "liveclass": ("live", "liveclass", "title", None),
        "livestream": ("live", "livestream", "title", None),
        "onsiteevent": ("live", "onsiteevent", "title", None),
        "downloadfile": ("downloads", "downloadfile", "title", None),
    }

    items = []
    ctx = {}  # one for every item, so the covers' designs are read once
    for access in access_qs:
        model_name = access.content_type.model
        cfg = model_map.get(model_name)
        if not cfg:
            continue

        _app, _model, title_field, slug_field = cfg
        model_cls = access.content_type.model_class()
        obj = model_cls.objects.filter(pk=access.object_id).first()
        if not obj or (is_draft(obj) and not drafts):
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
        date_field = _BADGE_DATE.get(model_name)
        if date_field:  # a course or an event: it can have a designed cover, whose badge reads its date
            item["cover_design"] = designs.cover_for(obj, ctx)
            item[date_field] = getattr(obj, date_field)
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
    links = {(link.content_type_id, link.object_id): link for link in plan.access_items.all()}
    items, available = [], []
    for name, ct in _access_content_types().items():
        included = {object_id for ct_id, object_id in links if ct_id == ct.pk}
        for obj in ct.model_class().objects.filter(Q(pk__in=included) | ~Q(pricing_type="free")):
            link = links.get((ct.pk, obj.pk))
            item = {
                "content_type": name,
                "object_id": obj.pk,
                "title": obj.title,
                "price": str(obj.price),
                "pricing_type": obj.pricing_type,
                "window_text": ways.membership_text(link) if link else "",
            }
            available.append(item)
            if obj.pk in included:
                items.append(item)
    return {
        "plan": {"id": plan.pk, "name": plan.name, "is_active": plan.is_active},
        "items": items,
        "available": available,
    }


def _is_owner(request):
    return IsOwner().has_permission(request, None)


def _forbidden():
    return Response({"detail": _("Permission denied.")}, status=status.HTTP_403_FORBIDDEN)


def _plan_row(plan, *, is_subscribed=False, drafts=False):
    """A plan as a card; ``drafts``: her own view, which counts what members do not see yet."""
    return {
        "id": plan.id,
        "name": plan.name,
        "description": plan.description,
        "price": str(plan.price),
        "currency": plan.currency,
        "billing_interval_months": plan.billing_interval_months,
        "is_active": plan.is_active,
        "item_count": item_count(plan.access_items.all(), drafts=drafts),
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
        return Response(_plan_row(plan, drafts=True), status=status.HTTP_201_CREATED)

    plans = SubscriptionPlan.objects.prefetch_related("access_items__content_type", "access_items__content_object")
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

    drafts = is_coach_or_owner(request.user)
    return Response([_plan_row(p, is_subscribed=p.id in subscribed_plan_ids, drafts=drafts) for p in plans])


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
        return Response(_plan_row(serializer.save(), drafts=True))

    visible = SubscriptionPlan.objects.all() if _is_owner(request) else SubscriptionPlan.objects.filter(is_active=True)
    plan = get_object_or_404(visible, pk=pk)
    items = _resolve_access_items(plan, drafts=is_coach_or_owner(request.user))

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
