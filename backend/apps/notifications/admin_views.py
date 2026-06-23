from django.db import connection
from django.db.models import Count, Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner

from .audience import audience_counts
from .models import Announcement
from .serializers import (
    AnnouncementCreateSerializer,
    AnnouncementDetailSerializer,
    AnnouncementListSerializer,
)
from .tasks import fanout_announcement


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def announcement_preview(request):
    return Response(audience_counts(request.data.get("filters") or {}))


@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def announcement_collection(request):
    if request.method == "GET":
        qs = Announcement.objects.annotate(
            read_count_annotated=Count("recipients", filter=Q(recipients__read_at__isnull=False))
        )
        return Response(AnnouncementListSerializer(qs, many=True).data)

    serializer = AnnouncementCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    scheduled_at = data.get("scheduled_at")
    announcement = Announcement.objects.create(
        title=data["title"],
        body=data.get("body", ""),
        link=data.get("link", ""),
        filters_json=data.get("filters", {}),
        scheduled_at=scheduled_at,
        also_email=data.get("also_email", False),
        status="scheduled",  # pending until fanout delivers, then -> "sent"
        created_by=request.user,
    )
    # Send-now (no future scheduled_at) is enqueued immediately; the fan-out
    # flips status to "sent". Future-scheduled rows stay "scheduled" and the
    # per-minute beat dispatcher picks them up when due. NOTE: status must NOT
    # be "sent" at creation — fanout_announcement guards `if status=="sent"`.
    if not scheduled_at:
        fanout_announcement.delay(announcement.id, connection.schema_name)
    return Response(AnnouncementDetailSerializer(announcement).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsCoachOrOwner])
def announcement_detail(request, pk):
    announcement = Announcement.objects.filter(pk=pk).first()
    if announcement is None:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(AnnouncementDetailSerializer(announcement).data)

    if request.method == "DELETE":
        announcement.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # PATCH — only while scheduled
    if announcement.status == "sent":
        return Response({"detail": "already sent"}, status=status.HTTP_409_CONFLICT)
    serializer = AnnouncementCreateSerializer(data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    for field, model_field in (("title", "title"), ("body", "body"), ("link", "link")):
        if field in serializer.validated_data:
            setattr(announcement, model_field, serializer.validated_data[field])
    if "filters" in serializer.validated_data:
        announcement.filters_json = serializer.validated_data["filters"]
    send_now = False
    if "scheduled_at" in serializer.validated_data:
        sched = serializer.validated_data["scheduled_at"]
        announcement.scheduled_at = sched
        send_now = not sched
    announcement.save()
    if send_now:
        fanout_announcement.delay(announcement.id, connection.schema_name)
    return Response(AnnouncementDetailSerializer(announcement).data)
