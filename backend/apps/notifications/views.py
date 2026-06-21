from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import AnnouncementRecipient, PushSubscription
from .serializers import FeedItemSerializer, SubscribeSerializer


@api_view(["GET"])
@authentication_classes([])  # CLAUDE.md: AllowAny alone is not enough
@permission_classes([AllowAny])
def vapid_key(request):
    return Response({"public_key": settings.VAPID_PUBLIC_KEY})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def subscribe(request):
    serializer = SubscribeSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    PushSubscription.objects.update_or_create(
        endpoint=data["endpoint"],
        defaults={
            "user": request.user,
            "p256dh": data["keys"]["p256dh"],
            "auth": data["keys"]["auth"],
            "user_agent": request.META.get("HTTP_USER_AGENT", "")[:255],
        },
    )
    return Response(status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def unsubscribe(request):
    PushSubscription.objects.filter(endpoint=request.data.get("endpoint", ""), user=request.user).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def feed(request):
    rows = (
        AnnouncementRecipient.objects.filter(user=request.user)
        .select_related("announcement")
        .order_by("-announcement__created_at")
    )
    unread = rows.filter(read_at__isnull=True).count()
    return Response({"items": FeedItemSerializer(rows, many=True).data, "unread_count": unread})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def feed_read(request, pk):
    AnnouncementRecipient.objects.filter(announcement_id=pk, user=request.user, read_at__isnull=True).update(
        read_at=timezone.now()
    )
    unread = AnnouncementRecipient.objects.filter(user=request.user, read_at__isnull=True).count()
    return Response({"unread_count": unread})
