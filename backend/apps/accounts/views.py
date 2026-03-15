import logging

from django.db import connection
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from .models import User
from .serializers import MagicLinkRequestSerializer, MagicLinkVerifySerializer, UserSerializer
from .tokens import create_jwt, create_magic_link_token, verify_magic_link_token

logger = logging.getLogger(__name__)


class MagicLinkThrottle(AnonRateThrottle):
    rate = "5/min"


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([MagicLinkThrottle])
def magic_link_request(request):
    serializer = MagicLinkRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data["email"]
    tenant = connection.tenant
    token = create_magic_link_token(email, tenant.schema_name, tenant.slug)

    scheme = "https" if request.is_secure() else "http"
    link = f"{scheme}://{request.get_host()}/auth/callback?token={token}"

    brand_name = tenant.name
    try:
        from apps.tenant_config.models import TenantConfig

        config = TenantConfig.objects.first()
        if config:
            brand_name = config.brand_name
    except Exception:
        pass

    from apps.core.email import send_magic_link

    sent = send_magic_link(email, link, brand_name)
    if not sent:
        # Always print to console so the link is visible in `make logs`
        print(f"\n{'='*60}")
        print(f"MAGIC LINK for {email}:")
        print(f"{link}")
        print(f"{'='*60}\n")

    return Response({"detail": "If an account exists, a magic link has been sent."})


@api_view(["POST"])
@permission_classes([AllowAny])
def magic_link_verify(request):
    serializer = MagicLinkVerifySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        payload = verify_magic_link_token(serializer.validated_data["token"])
    except Exception:
        return Response({"detail": "Invalid or expired token"}, status=status.HTTP_400_BAD_REQUEST)
    tenant = connection.tenant
    if payload["tenant_id"] != tenant.schema_name:
        return Response({"detail": "Token not valid for this tenant"}, status=status.HTTP_403_FORBIDDEN)
    user, _ = User.objects.get_or_create(
        email=payload["email"],
        defaults={"name": payload["email"].split("@")[0], "role": "student"},
    )
    jwt_token = create_jwt(user, tenant)
    response = Response({"user": UserSerializer(user).data})
    response.set_cookie(
        "contentor_access_token", jwt_token,
        httponly=True, secure=False, samesite="Lax", max_age=86400 * 7,
    )
    return response


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout(request):
    response = Response({"detail": "Logged out"})
    response.delete_cookie("contentor_access_token")
    return response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(UserSerializer(request.user).data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_me(request):
    serializer = UserSerializer(request.user, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)
