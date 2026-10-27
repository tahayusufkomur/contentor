import logging
from dataclasses import asdict

from django.db.models import Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.core.access import ContentAccessService
from apps.core.pagination import StandardPagination, apply_ordering, apply_tag_filter
from apps.core.permissions import IsCoachOrOwner, is_coach_or_owner
from apps.core.storage import generate_presigned_download_url
from apps.media import designs

from . import livecraft
from .models import LiveClass, LiveStream, OnsiteEvent, ZoomClass
from .serializers import (
    CalendarEventDetailSerializer,
    CalendarEventSerializer,
    LiveClassCreateSerializer,
    LiveClassSerializer,
    LiveStreamCreateSerializer,
    LiveStreamSerializer,
    OnsiteEventCreateSerializer,
    OnsiteEventSerializer,
    ZoomClassCreateSerializer,
    ZoomClassSerializer,
    get_thumbnail_signed_url,
)

logger = logging.getLogger(__name__)


def _search_and_order_live_queryset(request, qs):
    qs = qs.select_related("thumbnail")  # every row's link to its photo reads it
    search = request.query_params.get("search", "").strip()
    if search:
        qs = qs.filter(Q(title__icontains=search) | Q(description__icontains=search))
    qs = apply_tag_filter(qs, request)
    return apply_ordering(qs, request, ["title", "created_at", "scheduled_at"])


def _serialize_list_response(request, qs, serializer_class):
    ctx = {"request": request}
    paginate = "limit" in request.query_params or "offset" in request.query_params
    if paginate:
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = serializer_class(page, many=True, context=ctx)
        return paginator.get_paginated_response(serializer.data)
    return Response(serializer_class(qs, many=True, context=ctx).data)


def _is_host(user, event):
    return user.id == event.instructor_id or user.role == "owner"


def _hidden(request, event):
    """A draft (undated, or held until she publishes it) is there only for the coach."""
    return event.status == "draft" and not is_coach_or_owner(request.user)


def _join_response(request, event, *, guest_role, layout):
    """Join link for this user: hosts moderate; everyone else joins as `guest_role`."""
    host = _is_host(request.user, event)
    role = "host" if host else guest_role
    try:
        try:
            url = livecraft.join_url(event.room_name, request.user, role=role)
        except livecraft.LiveCraftError as exc:
            # LiveCraft drops a room left empty for 10 minutes while it is still live
            # here: the host opens it again, everyone else waits for the host.
            if exc.status != 404:
                raise
            if not host:
                return Response(
                    {"detail": "This session has not started yet. Please wait for the host to join."},
                    status=status.HTTP_409_CONFLICT,
                )
            _start_room(event, layout=layout)
            url = livecraft.join_url(event.room_name, request.user, role=role)
    except livecraft.LiveCraftError as exc:
        if exc.status == 403:
            return Response({"detail": "You were removed from this session."}, status=status.HTTP_403_FORBIDDEN)
        logger.exception("LiveCraft join failed for room %s", event.room_name)
        return Response({"detail": "Failed to connect to video service."}, status=status.HTTP_502_BAD_GATEWAY)
    return Response({"join_url": url, "role": "host" if host else "viewer"})


def _start_room(event, *, layout):
    # A prepared board goes along as a link LiveCraft's server fetches when a host
    # opens the whiteboard; a class runs for hours, so the link lasts a day.
    board = generate_presigned_download_url(event.whiteboard_key, expiry=86400) if event.whiteboard_key else ""
    livecraft.create_room(
        event.room_name,
        title=event.title,
        layout=layout,
        auto_record=event.auto_recording,
        whiteboard_url=board or None,
        watermark=event.watermark,
    )


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def live_class_list_create(request):
    if request.method == "GET":
        qs = LiveClass.objects.all()
        if not is_coach_or_owner(request.user):
            qs = qs.filter(status__in=["scheduled", "live", "ended"])
        qs = _search_and_order_live_queryset(request, qs)
        return _serialize_list_response(request, qs, LiveClassSerializer)

    if not is_coach_or_owner(request.user):
        return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

    serializer = LiveClassCreateSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    live_class = serializer.save(instructor=request.user)
    return Response(LiveClassSerializer(live_class).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([AllowAny])
def live_class_detail(request, pk):
    live_class = get_object_or_404(LiveClass, pk=pk)

    if request.method == "GET":
        if _hidden(request, live_class):
            raise Http404
        return Response(LiveClassSerializer(live_class).data)

    if request.method == "PUT":
        if not is_coach_or_owner(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        serializer = LiveClassCreateSerializer(
            live_class, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(LiveClassSerializer(live_class).data)

    if request.method == "DELETE":
        if not request.user.is_authenticated or request.user.role != "owner":
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        live_class.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def live_class_start(request, pk):
    live_class = get_object_or_404(LiveClass, pk=pk)
    if live_class.status not in ("draft", "scheduled"):
        return Response(
            {"detail": f"Cannot start a class with status '{live_class.status}'."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        _start_room(live_class, layout="meeting")
    except livecraft.LiveCraftError:
        logger.exception("Failed to create LiveCraft room for live class %s", pk)
        return Response(
            {"detail": "Failed to start video call. Please try again."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    live_class.status = "live"
    live_class.started_at = timezone.now()
    live_class.save(update_fields=["status", "started_at"])
    return Response(LiveClassSerializer(live_class).data)


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def live_class_stop(request, pk):
    live_class = get_object_or_404(LiveClass, pk=pk)
    if live_class.status != "live":
        return Response(
            {"detail": "Session is not live."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    livecraft.end_room(live_class.room_name)

    live_class.status = "ended"
    live_class.ended_at = timezone.now()
    live_class.save(update_fields=["status", "ended_at"])
    return Response(LiveClassSerializer(live_class).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def live_class_token(request, pk):
    live_class = get_object_or_404(LiveClass, pk=pk)
    if live_class.status != "live":
        return Response(
            {"detail": "Session is not live."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Access check
    access_service = ContentAccessService()
    if not access_service.check_access(request.user, live_class):
        info = access_service.get_access_info(request.user, live_class)
        return Response(
            {"detail": "You do not have access to this live session.", "access_info": asdict(info)},
            status=status.HTTP_403_FORBIDDEN,
        )

    return _join_response(request, live_class, guest_role="participant", layout="meeting")


# ─── Live Stream views ───────────────────────────────────────────────


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def live_stream_list_create(request):
    if request.method == "GET":
        qs = LiveStream.objects.all()
        if not is_coach_or_owner(request.user):
            qs = qs.filter(status__in=["scheduled", "live", "ended"])
        qs = _search_and_order_live_queryset(request, qs)
        return _serialize_list_response(request, qs, LiveStreamSerializer)

    if not is_coach_or_owner(request.user):
        return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

    serializer = LiveStreamCreateSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    live_stream = serializer.save(instructor=request.user)
    return Response(LiveStreamSerializer(live_stream).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([AllowAny])
def live_stream_detail(request, pk):
    live_stream = get_object_or_404(LiveStream, pk=pk)

    if request.method == "GET":
        if _hidden(request, live_stream):
            raise Http404
        return Response(LiveStreamSerializer(live_stream).data)

    if request.method == "PUT":
        if not is_coach_or_owner(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        serializer = LiveStreamCreateSerializer(
            live_stream, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(LiveStreamSerializer(live_stream).data)

    if request.method == "DELETE":
        if not request.user.is_authenticated or request.user.role != "owner":
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        live_stream.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def live_stream_start(request, pk):
    live_stream = get_object_or_404(LiveStream, pk=pk)
    if live_stream.status not in ("draft", "scheduled"):
        return Response(
            {"detail": f"Cannot start a stream with status '{live_stream.status}'."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        _start_room(live_stream, layout="broadcast")
    except livecraft.LiveCraftError:
        logger.exception("Failed to create LiveCraft room for live stream %s", pk)
        return Response(
            {"detail": "Failed to start live stream. Please try again."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    live_stream.status = "live"
    live_stream.started_at = timezone.now()
    live_stream.save(update_fields=["status", "started_at"])
    return Response(LiveStreamSerializer(live_stream).data)


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def live_stream_stop(request, pk):
    live_stream = get_object_or_404(LiveStream, pk=pk)
    if live_stream.status != "live":
        return Response(
            {"detail": "Stream is not live."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    livecraft.end_room(live_stream.room_name)

    live_stream.status = "ended"
    live_stream.ended_at = timezone.now()
    live_stream.save(update_fields=["status", "ended_at"])
    return Response(LiveStreamSerializer(live_stream).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def live_stream_token(request, pk):
    live_stream = get_object_or_404(LiveStream, pk=pk)
    if live_stream.status != "live":
        return Response(
            {"detail": "Stream is not live."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Access check
    access_service = ContentAccessService()
    if not access_service.check_access(request.user, live_stream):
        info = access_service.get_access_info(request.user, live_stream)
        return Response(
            {"detail": "You do not have access to this live stream.", "access_info": asdict(info)},
            status=status.HTTP_403_FORBIDDEN,
        )

    return _join_response(request, live_stream, guest_role="viewer", layout="broadcast")


# ─── Zoom Class views ──────────────────────────────────────────────


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def zoom_class_list_create(request):
    if request.method == "GET":
        qs = ZoomClass.objects.all()
        if not is_coach_or_owner(request.user):
            qs = qs.filter(status__in=["scheduled", "live", "ended"])
        qs = _search_and_order_live_queryset(request, qs)
        return _serialize_list_response(request, qs, ZoomClassSerializer)

    if not is_coach_or_owner(request.user):
        return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

    serializer = ZoomClassCreateSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    zoom_class = serializer.save(instructor=request.user)
    return Response(
        ZoomClassSerializer(zoom_class, context={"request": request}).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([AllowAny])
def zoom_class_detail(request, pk):
    zoom_class = get_object_or_404(ZoomClass, pk=pk)

    if request.method == "GET":
        if _hidden(request, zoom_class):
            raise Http404
        return Response(ZoomClassSerializer(zoom_class, context={"request": request}).data)

    if request.method == "PUT":
        if not is_coach_or_owner(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        serializer = ZoomClassCreateSerializer(
            zoom_class, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(ZoomClassSerializer(zoom_class, context={"request": request}).data)

    if request.method == "DELETE":
        if not request.user.is_authenticated or request.user.role != "owner":
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        zoom_class.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Onsite Event views ────────────────────────────────────────────


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def onsite_event_list_create(request):
    if request.method == "GET":
        qs = OnsiteEvent.objects.all()
        if not is_coach_or_owner(request.user):
            qs = qs.filter(status__in=["scheduled", "ongoing", "ended"])
        qs = _search_and_order_live_queryset(request, qs)
        return _serialize_list_response(request, qs, OnsiteEventSerializer)

    if not is_coach_or_owner(request.user):
        return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

    serializer = OnsiteEventCreateSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    event = serializer.save(instructor=request.user)
    return Response(
        OnsiteEventSerializer(event, context={"request": request}).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([AllowAny])
def onsite_event_detail(request, pk):
    event = get_object_or_404(OnsiteEvent, pk=pk)

    if request.method == "GET":
        if _hidden(request, event):
            raise Http404
        return Response(OnsiteEventSerializer(event, context={"request": request}).data)

    if request.method == "PUT":
        if not is_coach_or_owner(request.user):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        serializer = OnsiteEventCreateSerializer(event, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(OnsiteEventSerializer(event, context={"request": request}).data)

    if request.method == "DELETE":
        if not request.user.is_authenticated or request.user.role != "owner":
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        event.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── Calendar (unified) ──────────────────────────────────────────


def _apply_date_range(qs, date_from, date_to):
    if date_from:
        qs = qs.filter(scheduled_at__gte=date_from)
    if date_to:
        qs = qs.filter(scheduled_at__lte=date_to)
    return qs


def _to_calendar_event(obj, event_type, ctx, thumbnail_url=None):
    """One event as the calendar's dict. `ctx` is the request's: what is read for one event's cover is kept
    there for the rest."""
    from apps.filters.serializers import FilterOptionSerializer

    return {
        "id": obj.id,
        "type": event_type,
        "title": obj.title,
        "description": obj.description,
        "status": obj.computed_status,
        "pricing_type": obj.pricing_type,
        "price": obj.price,
        "is_trial": getattr(obj, "is_trial", False),
        "scheduled_at": obj.scheduled_at,
        "started_at": obj.started_at,
        "ended_at": obj.computed_ended_at,
        "location": getattr(obj, "location", ""),
        "thumbnail_signed_url": thumbnail_url,
        "cover_design": designs.cover_for(obj, ctx),
        "filter_options": FilterOptionSerializer(obj.filter_options.all(), many=True).data,
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def calendar_events(request):
    date_from = request.query_params.get("from")
    date_to = request.query_params.get("to")
    types_param = request.query_params.get("types", "")
    type_filter = [t.strip() for t in types_param.split(",") if t.strip()] if types_param else []

    # Status is now computed from scheduled_at + duration_minutes. Undated
    # drafts have no day, and a held draft (dated, not published yet) is hidden.
    events = []
    ctx = {}

    want_live_class = not type_filter or "live_class" in type_filter
    want_live_stream = not type_filter or "live_stream" in type_filter
    want_onsite = not type_filter or "onsite_event" in type_filter

    if want_live_class:
        qs = _apply_date_range(
            LiveClass.objects.filter(scheduled_at__isnull=False)
            .exclude(status="draft")
            .select_related("thumbnail")
            .prefetch_related("filter_options"),
            date_from,
            date_to,
        )
        for obj in qs:
            thumb = get_thumbnail_signed_url(obj)
            events.append(_to_calendar_event(obj, "live_class", ctx, thumb))

        qs = _apply_date_range(
            ZoomClass.objects.filter(scheduled_at__isnull=False)
            .exclude(status="draft")
            .select_related("thumbnail")
            .prefetch_related("filter_options"),
            date_from,
            date_to,
        )
        for obj in qs:
            thumb = get_thumbnail_signed_url(obj)
            events.append(_to_calendar_event(obj, "zoom_class", ctx, thumb))

    if want_live_stream:
        qs = _apply_date_range(
            LiveStream.objects.filter(scheduled_at__isnull=False)
            .exclude(status="draft")
            .select_related("thumbnail")
            .prefetch_related("filter_options"),
            date_from,
            date_to,
        )
        for obj in qs:
            thumb = get_thumbnail_signed_url(obj)
            events.append(_to_calendar_event(obj, "live_stream", ctx, thumb))

    if want_onsite:
        qs = _apply_date_range(
            OnsiteEvent.objects.filter(scheduled_at__isnull=False)
            .exclude(status="draft")
            .select_related("thumbnail")
            .prefetch_related("filter_options"),
            date_from,
            date_to,
        )
        for obj in qs:
            thumb = get_thumbnail_signed_url(obj)
            events.append(_to_calendar_event(obj, "onsite_event", ctx, thumb))

    events.sort(key=lambda e: e["scheduled_at"])
    serializer = CalendarEventSerializer(events, many=True)
    return Response(serializer.data)


MODEL_MAP = {
    "live_class": LiveClass,
    "live_stream": LiveStream,
    "zoom_class": ZoomClass,
    "onsite_event": OnsiteEvent,
}


@api_view(["GET"])
@permission_classes([AllowAny])
def calendar_event_detail(request, event_type, pk):
    # For the URL, live_class covers both LiveClass and ZoomClass
    model = MODEL_MAP.get(event_type)
    if not model:
        return Response({"detail": "Invalid event type."}, status=status.HTTP_404_NOT_FOUND)

    obj = get_object_or_404(model, pk=pk)
    if _hidden(request, obj):
        raise Http404

    # Determine the student-facing type
    cal_type = event_type
    if event_type == "zoom_class":
        cal_type = "live_class"

    thumb = get_thumbnail_signed_url(obj)

    event = _to_calendar_event(obj, cal_type, {}, thumb)

    # Add access_info
    info = ContentAccessService().get_access_info(request.user, obj)

    event["access_info"] = asdict(info)
    event["unlock_options"] = ContentAccessService().get_unlock_options(obj)
    # The street address is for those who can attend; the place name stays public.
    event["address"] = getattr(obj, "address", "") if info.has_access else ""

    serializer = CalendarEventDetailSerializer(event)
    return Response(serializer.data)
