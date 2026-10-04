"""LiveCraft → Contentor callbacks (public schema; see config/urls.py)."""

import json
import logging

from django.views.decorators.csrf import csrf_exempt
from django_tenants.utils import schema_context
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core.models import Tenant

from . import livecraft
from .models import LiveClass, LiveStream

logger = logging.getLogger(__name__)


@csrf_exempt
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def livecraft_webhook(request):
    """{"event": "recording.ready", "room": "<slug>-<hex>", "key": "<s3 key>"} — signed.

    The room name carries the tenant slug, so one global URL serves every
    tenant. The recording lands in our bucket, so the key is all we store.
    """
    if not livecraft.valid_signature(request.body, request.headers.get("X-LiveCraft-Signature", "")):
        return Response({"detail": "bad signature"}, status=status.HTTP_401_UNAUTHORIZED)
    payload = json.loads(request.body)
    if payload.get("event") != "recording.ready":
        return Response(status=status.HTTP_204_NO_CONTENT)

    room, key = payload.get("room", ""), payload.get("key", "")
    tenant = Tenant.objects.filter(slug=room.rsplit("-", 1)[0]).first()
    if not tenant or not key:
        logger.warning("LiveCraft recording for unknown room %s", room)
        return Response(status=status.HTTP_204_NO_CONTENT)
    with schema_context(tenant.schema_name):
        updated = LiveClass.objects.filter(room_name=room).update(recording_url=key) or LiveStream.objects.filter(
            room_name=room
        ).update(recording_url=key)
    if not updated:
        logger.warning("LiveCraft recording for room %s matched no session", room)
    return Response(status=status.HTTP_204_NO_CONTENT)
