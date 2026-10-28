from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from django.utils.html import format_html
from django.utils.translation import get_language
from django.utils.translation import gettext as _
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.core.languages import in_site_language

from . import email_render
from .models import AnnouncementRecipient, EmailOptOut, PushSubscription
from .serializers import FeedItemSerializer, SubscribeSerializer


@api_view(["GET"])
@authentication_classes([])  # CLAUDE.md: AllowAny alone is not enough
@permission_classes([AllowAny])
def vapid_key(request):
    return Response({"public_key": settings.VAPID_PUBLIC_KEY})


@api_view(["GET", "POST"])  # POST: a mail client's one-click unsubscribe (RFC 8058, List-Unsubscribe-Post)
@authentication_classes([])
@permission_classes([AllowAny])
@in_site_language
def email_unsubscribe(request):
    data = email_render.decode_unsubscribe(request.GET.get("t", ""))
    if not data:
        return _page(_("Invalid or expired link."), 400)
    email = (data.get("email") or "").strip().lower()
    if email:
        EmailOptOut.objects.get_or_create(email=email, defaults={"user_id": data.get("user_id")})
    return _page(_("You've been unsubscribed from these emails."), 200)


def _page(message: str, status: int) -> HttpResponse:
    """A minimal page in the site's language: what a student sees after tapping Unsubscribe."""
    return HttpResponse(
        format_html(
            '<!doctype html><html lang="{}"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1"><title>{}</title></head>'
            "<body><p>{}</p></body></html>",
            get_language(),
            message,
            message,
        ),
        status=status,
    )


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
