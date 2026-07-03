import logging
from dataclasses import asdict

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.core.access import ContentAccessService
from apps.core.pagination import StandardPagination, apply_ordering, apply_tag_filter
from apps.core.permissions import IsCoachOrOwner

from . import stream_service
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
)

logger = logging.getLogger(__name__)


def _is_coach_or_owner(user) -> bool:
    return user.is_authenticated and user.role in ("owner", "coach")


def _search_and_order_live_queryset(request, qs):
    search = request.query_params.get("search", "").strip()
    if search:
        qs = qs.filter(Q(title__icontains=search) | Q(description__icontains=search))
    qs = apply_tag_filter(qs, request)
    return apply_ordering(qs, request, ["title", "created_at", "scheduled_at"])


def _serialize_list_response(request, qs, serializer_class):
    paginate = "limit" in request.query_params or "offset" in request.query_params
    if paginate:
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = serializer_class(page, many=True)
        return paginator.get_paginated_response(serializer.data)
    return Response(serializer_class(qs, many=True).data)


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def live_class_list_create(request):
    if request.method == "GET":
        qs = LiveClass.objects.all()
        if not _is_coach_or_owner(request.user):
            qs = qs.filter(status__in=["scheduled", "live", "ended"])
        qs = _search_and_order_live_queryset(request, qs)
        return _serialize_list_response(request, qs, LiveClassSerializer)

    if not request.user.is_authenticated or request.user.role not in ("owner", "coach"):
        return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

    serializer = LiveClassCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    live_class = serializer.save(instructor=request.user)
    return Response(LiveClassSerializer(live_class).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([AllowAny])
def live_class_detail(request, pk):
    live_class = get_object_or_404(LiveClass, pk=pk)

    if request.method == "GET":
        return Response(LiveClassSerializer(live_class).data)

    if request.method == "PUT":
        if not request.user.is_authenticated or request.user.role not in ("owner", "coach"):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        serializer = LiveClassCreateSerializer(live_class, data=request.data, partial=True)
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
        stream_service.create_call(live_class, request.user)
    except Exception:
        logger.exception("Failed to create GetStream call for live class %s", pk)
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
            {"detail": "Class is not live."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    stream_service.stop_call(live_class.room_name)

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
            {"detail": "Class is not live."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Access check
    access_service = ContentAccessService()
    if not access_service.check_access(request.user, live_class):
        info = access_service.get_access_info(request.user, live_class)
        return Response(
            {"detail": "You do not have access to this live class.", "access_info": asdict(info)},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        stream_service.upsert_user(request.user)
        token = stream_service.generate_user_token(request.user.id)
    except Exception:
        logger.exception("Failed to generate GetStream token for user %s", request.user.id)
        return Response(
            {"detail": "Failed to connect to video service."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    is_host = request.user.id == live_class.instructor_id or request.user.role in ("owner", "coach")

    return Response(
        {
            "token": token,
            "api_key": stream_service.api_key(),
            "call_id": live_class.room_name,
            "role": "host" if is_host else "viewer",
        }
    )


# ─── Live Stream views ───────────────────────────────────────────────


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def live_stream_list_create(request):
    if request.method == "GET":
        qs = LiveStream.objects.all()
        if not _is_coach_or_owner(request.user):
            qs = qs.filter(status__in=["scheduled", "live", "ended"])
        qs = _search_and_order_live_queryset(request, qs)
        return _serialize_list_response(request, qs, LiveStreamSerializer)

    if not request.user.is_authenticated or request.user.role not in ("owner", "coach"):
        return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

    serializer = LiveStreamCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    live_stream = serializer.save(instructor=request.user)
    return Response(LiveStreamSerializer(live_stream).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([AllowAny])
def live_stream_detail(request, pk):
    live_stream = get_object_or_404(LiveStream, pk=pk)

    if request.method == "GET":
        return Response(LiveStreamSerializer(live_stream).data)

    if request.method == "PUT":
        if not request.user.is_authenticated or request.user.role not in ("owner", "coach"):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        serializer = LiveStreamCreateSerializer(live_stream, data=request.data, partial=True)
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
        stream_service.create_livestream(live_stream, request.user)
    except Exception:
        logger.exception("Failed to create GetStream livestream for %s", pk)
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

    stream_service.stop_livestream(live_stream.room_name)

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

    try:
        stream_service.upsert_user(request.user)
        token = stream_service.generate_user_token(request.user.id)
    except Exception:
        logger.exception("Failed to generate GetStream token for user %s", request.user.id)
        return Response(
            {"detail": "Failed to connect to video service."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    is_host = request.user.id == live_stream.instructor_id or request.user.role in ("owner", "coach")

    return Response(
        {
            "token": token,
            "api_key": stream_service.api_key(),
            "call_id": live_stream.room_name,
            "role": "host" if is_host else "viewer",
        }
    )


# ─── Zoom Class views ──────────────────────────────────────────────


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def zoom_class_list_create(request):
    if request.method == "GET":
        qs = ZoomClass.objects.all()
        if not _is_coach_or_owner(request.user):
            qs = qs.filter(status__in=["scheduled", "live", "ended"])
        qs = _search_and_order_live_queryset(request, qs)
        return _serialize_list_response(request, qs, ZoomClassSerializer)

    if not request.user.is_authenticated or request.user.role not in ("owner", "coach"):
        return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

    serializer = ZoomClassCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    zoom_class = serializer.save(instructor=request.user)
    return Response(ZoomClassSerializer(zoom_class).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([AllowAny])
def zoom_class_detail(request, pk):
    zoom_class = get_object_or_404(ZoomClass, pk=pk)

    if request.method == "GET":
        return Response(ZoomClassSerializer(zoom_class).data)

    if request.method == "PUT":
        if not request.user.is_authenticated or request.user.role not in ("owner", "coach"):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        serializer = ZoomClassCreateSerializer(zoom_class, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(ZoomClassSerializer(zoom_class).data)

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
        if not _is_coach_or_owner(request.user):
            qs = qs.filter(status__in=["scheduled", "ongoing", "ended"])
        qs = _search_and_order_live_queryset(request, qs)
        return _serialize_list_response(request, qs, OnsiteEventSerializer)

    if not request.user.is_authenticated or request.user.role not in ("owner", "coach"):
        return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

    serializer = OnsiteEventCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    event = serializer.save(instructor=request.user)
    return Response(OnsiteEventSerializer(event).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([AllowAny])
def onsite_event_detail(request, pk):
    event = get_object_or_404(OnsiteEvent, pk=pk)

    if request.method == "GET":
        return Response(OnsiteEventSerializer(event).data)

    if request.method == "PUT":
        if not request.user.is_authenticated or request.user.role not in ("owner", "coach"):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        serializer = OnsiteEventCreateSerializer(event, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(OnsiteEventSerializer(event).data)

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


def _to_calendar_event(obj, event_type, thumbnail_url=None):
    from apps.filters.serializers import FilterOptionSerializer

    return {
        "id": obj.id,
        "type": event_type,
        "title": obj.title,
        "description": obj.description,
        "status": obj.computed_status,
        "pricing_type": obj.pricing_type,
        "price": obj.price,
        "scheduled_at": obj.scheduled_at,
        "started_at": obj.started_at,
        "ended_at": obj.computed_ended_at,
        "location": getattr(obj, "location", ""),
        "thumbnail_signed_url": thumbnail_url,
        "filter_options": FilterOptionSerializer(obj.filter_options.all(), many=True).data,
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def calendar_events(request):
    from apps.core.storage import sign_if_s3_key

    date_from = request.query_params.get("from")
    date_to = request.query_params.get("to")
    types_param = request.query_params.get("types", "")
    type_filter = [t.strip() for t in types_param.split(",") if t.strip()] if types_param else []

    # Status is now computed from scheduled_at + duration_minutes.
    # scheduled_at__isnull=False excludes drafts.
    events = []

    want_live_class = not type_filter or "live_class" in type_filter
    want_live_stream = not type_filter or "live_stream" in type_filter
    want_onsite = not type_filter or "onsite_event" in type_filter

    if want_live_class:
        qs = _apply_date_range(
            LiveClass.objects.filter(scheduled_at__isnull=False).prefetch_related("filter_options"), date_from, date_to
        )
        for obj in qs:
            thumb = sign_if_s3_key(obj.thumbnail_url) if obj.thumbnail_url else None
            events.append(_to_calendar_event(obj, "live_class", thumb))

        qs = _apply_date_range(
            ZoomClass.objects.filter(scheduled_at__isnull=False).prefetch_related("filter_options"), date_from, date_to
        )
        for obj in qs:
            thumb = sign_if_s3_key(obj.thumbnail_url) if obj.thumbnail_url else None
            events.append(_to_calendar_event(obj, "live_class", thumb))

    if want_live_stream:
        qs = _apply_date_range(
            LiveStream.objects.filter(scheduled_at__isnull=False).prefetch_related("filter_options"), date_from, date_to
        )
        for obj in qs:
            thumb = sign_if_s3_key(obj.thumbnail_url) if obj.thumbnail_url else None
            events.append(_to_calendar_event(obj, "live_stream", thumb))

    if want_onsite:
        qs = _apply_date_range(
            OnsiteEvent.objects.filter(scheduled_at__isnull=False).prefetch_related("filter_options"),
            date_from,
            date_to,
        )
        for obj in qs:
            thumb = sign_if_s3_key(obj.thumbnail_url) if obj.thumbnail_url else None
            events.append(_to_calendar_event(obj, "onsite_event", thumb))

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
    from apps.core.storage import sign_if_s3_key

    # For the URL, live_class covers both LiveClass and ZoomClass
    model = MODEL_MAP.get(event_type)
    if not model:
        return Response({"detail": "Invalid event type."}, status=status.HTTP_404_NOT_FOUND)

    obj = get_object_or_404(model, pk=pk)

    # Determine the student-facing type
    cal_type = event_type
    if event_type == "zoom_class":
        cal_type = "live_class"

    thumb = None
    if hasattr(obj, "thumbnail_url") and obj.thumbnail_url:
        thumb = sign_if_s3_key(obj.thumbnail_url)

    event = _to_calendar_event(obj, cal_type, thumb)

    # Add access_info
    if request.user.is_authenticated:
        access_service = ContentAccessService()
        info = access_service.get_access_info(request.user, obj)
    else:
        from apps.core.access import AccessInfo

        pricing_type = obj.pricing_type
        if pricing_type == "free":
            info = AccessInfo(has_access=True, pricing_type=pricing_type, access_reason="free")
        else:
            info = AccessInfo(
                has_access=False,
                pricing_type=pricing_type,
                price=obj.price,
                currency=getattr(obj, "currency", "TRY"),
                unlock_methods=["purchase"],
            )

    event["access_info"] = asdict(info)

    serializer = CalendarEventDetailSerializer(event)
    return Response(serializer.data)
