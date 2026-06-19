"""Preview gate: unlock an unpublished tenant site with its preview password."""

from django.db import connection
from django.utils.crypto import constant_time_compare
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle


class PreviewUnlockThrottle(AnonRateThrottle):
    rate = "10/min"


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([PreviewUnlockThrottle])
def preview_unlock(request):
    """Validate the submitted preview password against the active tenant.

    The customer app's route handler sets the unlock cookie on success — this
    view only confirms the password. Published tenants always succeed.
    """
    tenant = connection.tenant
    if getattr(tenant, "is_published", False) or getattr(tenant, "is_demo", False):
        return Response({"detail": "ok"})
    expected = getattr(tenant, "preview_password", "") or ""
    submitted = str(request.data.get("password", ""))
    if expected and constant_time_compare(submitted, expected):
        return Response({"detail": "ok"})
    return Response({"detail": "invalid"}, status=403)
