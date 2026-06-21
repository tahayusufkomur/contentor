from django.conf import settings
from django.db import connection
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import PushSubscription
from .serializers import SubscribeSerializer
from .tasks import fanout_broadcast


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
    PushSubscription.objects.filter(
        endpoint=request.data.get("endpoint", ""), user=request.user
    ).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def broadcast(request):
    if getattr(request.user, "role", None) not in ("owner", "coach"):
        return Response(status=status.HTTP_403_FORBIDDEN)
    message = (request.data.get("message") or "").strip()
    if not message:
        return Response({"detail": "message required"}, status=status.HTTP_400_BAD_REQUEST)
    fanout_broadcast.delay(message, connection.schema_name)
    # 204, not 202: the frontend's clientFetch skips body-parsing only on a 204
    # (by status) or Content-Length:0. A 202 with an empty body slips past that
    # behind proxies that drop Content-Length (Cloudflare → chunked), so res.json()
    # throws on the empty body and the UI falsely reports "Could not send
    # announcement" even though the fan-out task was queued. 204 matches the rest
    # of the app's empty-success responses and is parse-safe everywhere.
    return Response(status=status.HTTP_204_NO_CONTENT)
