"""Every class and event in one list, for the coach's Classes & events page.

The four kinds stay four tables. To page across them, only each row's id and
sort key are read from all four; the page that was asked for is then loaded and
serialized by its own kind's serializer. A tenant has hundreds of events, not
millions, so the merge in Python is cheap.
"""

from collections import defaultdict
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes

from apps.core.pagination import StandardPagination, apply_tag_filter
from apps.core.permissions import IsCoachOrOwner

from .models import LiveClass, LiveStream, OnsiteEvent, ZoomClass
from .serializers import LiveClassSerializer, LiveStreamSerializer, OnsiteEventSerializer, ZoomClassSerializer

# The assistant's names for the four kinds (apps.core.copilot.content.EVENT_KINDS).
KINDS = {
    "live": (LiveClass, LiveClassSerializer),
    "stream": (LiveStream, LiveStreamSerializer),
    "zoom": (ZoomClass, ZoomClassSerializer),
    "onsite": (OnsiteEvent, OnsiteEventSerializer),
}
ORDERINGS = {"scheduled_at", "created_at", "title"}
# Every event runs an hour today: `duration_minutes` is on the models but no
# form or serializer sets it.
RUNS_FOR = timedelta(hours=1)
# A class the coach started is running whatever its start time says, and one
# she ended is over even if its hour is not.
RUNNING = Q(status__in=("live", "ongoing"))
ENDED = Q(status="ended")


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def admin_events(request):
    """GET /api/v1/admin/events/?search=&tags=&ordering=&when=upcoming|past&limit=&offset="""
    params = request.query_params
    ordering = params.get("ordering", "").strip()
    field = ordering.lstrip("-")
    if field not in ORDERINGS:
        ordering = field = "scheduled_at"
    search = params.get("search", "").strip()
    when = params.get("when", "")
    still_on = timezone.now() - RUNS_FOR

    keys = []
    for kind, (model, _serializer) in KINDS.items():
        qs = model.objects.all()
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(description__icontains=search))
        qs = apply_tag_filter(qs, request)
        if when == "upcoming":
            # An undated draft is still ahead of her.
            qs = qs.filter(Q(scheduled_at__isnull=True) | Q(scheduled_at__gte=still_on) | RUNNING).exclude(ENDED)
        elif when == "past":
            qs = qs.filter((Q(scheduled_at__lt=still_on) & ~RUNNING) | ENDED)
        keys += [(value, pk, kind) for pk, value in qs.values_list("pk", field)]

    # Undated drafts go last in either direction.
    dated = [key for key in keys if key[0] is not None]
    dated.sort(
        key=lambda key: (key[0].casefold() if isinstance(key[0], str) else key[0], key[1], key[2]),
        reverse=ordering.startswith("-"),
    )
    keys = dated + [key for key in keys if key[0] is None]

    paginator = StandardPagination()
    page = paginator.paginate_queryset(keys, request)

    pks_by_kind = defaultdict(list)
    for _value, pk, kind in page:
        pks_by_kind[kind].append(pk)
    rows = {}
    ctx = {"request": request}  # one for every row, so the covers' designs are read once
    for kind, pks in pks_by_kind.items():
        model, serializer = KINDS[kind]
        for event in model.objects.filter(pk__in=pks).prefetch_related("tags", "filter_options"):
            rows[kind, event.pk] = {
                **serializer(event, context=ctx).data,
                "kind": kind,
                # The stored status only moves when she presses Go live or End;
                # this one follows the clock.
                "computed_status": event.computed_status,
            }
    return paginator.get_paginated_response([rows[kind, pk] for _value, pk, kind in page if (kind, pk) in rows])
