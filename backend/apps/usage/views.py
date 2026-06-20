import contextlib

from django.db import IntegrityError
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import UsageEvent

_MODES = {"pwa", "browser"}
_PLATFORMS = {"ios", "android", "desktop", "other"}


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def record_usage(request):
    mode = request.data.get("mode")
    platform = request.data.get("platform")
    if mode not in _MODES or platform not in _PLATFORMS:
        return Response({"detail": "invalid mode/platform"}, status=status.HTTP_400_BAD_REQUEST)

    user = request.user
    # Students only — coaches/owners use the admin app and are out of scope.
    if getattr(user, "role", None) != "student":
        return Response(status=status.HTTP_204_NO_CONTENT)

    # The request runs in the tenant's schema (customer subdomain), so this row
    # lands in that tenant — no tenant column needed. Guard the unique-constraint
    # race from a concurrent double-POST (two tabs): today's row already exists,
    # so swallow it rather than 500.
    with contextlib.suppress(IntegrityError):
        UsageEvent.objects.get_or_create(
            user=user,
            mode=mode,
            platform=platform,
            day=timezone.now().date(),
        )

    fields = []
    if user.last_display_mode != mode:
        user.last_display_mode = mode
        fields.append("last_display_mode")
    if user.last_platform != platform:
        user.last_platform = platform
        fields.append("last_platform")
    if mode == "pwa" and user.first_pwa_at is None:
        user.first_pwa_at = timezone.now()
        fields.append("first_pwa_at")
    if fields:
        user.save(update_fields=fields)

    return Response(status=status.HTTP_204_NO_CONTENT)
