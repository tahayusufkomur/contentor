import logging
from urllib.parse import urlencode

import jwt as jwt_lib
import requests as http_requests
from django.conf import settings
from django.db import connection
from django.http import HttpResponseRedirect
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
    link = f"{scheme}://{request.get_host()}/callback?token={token}"

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


GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


def _create_oauth_state(tenant_schema: str, origin: str) -> str:
    """Create a signed JWT containing OAuth state (no cookies needed)."""
    from datetime import datetime, timedelta, timezone
    payload = {
        "tenant": tenant_schema,
        "origin": origin,
        "purpose": "google_oauth",
        "exp": datetime.now(tz=timezone.utc) + timedelta(minutes=10),
        "iat": datetime.now(tz=timezone.utc),
    }
    return jwt_lib.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def _verify_oauth_state(state: str) -> dict:
    """Verify and decode the signed OAuth state."""
    payload = jwt_lib.decode(state, settings.SECRET_KEY, algorithms=["HS256"])
    if payload.get("purpose") != "google_oauth":
        raise jwt_lib.InvalidTokenError("Invalid state purpose")
    return payload


@api_view(["POST"])
@permission_classes([AllowAny])
def google_login(request):
    tenant = connection.tenant
    origin = request.data.get("origin", "")

    state = _create_oauth_state(tenant.schema_name, origin)

    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "state": state,
        "prompt": "select_account",
    }

    return Response({"url": f"{GOOGLE_AUTH_URL}?{urlencode(params)}"})


@api_view(["GET"])
@permission_classes([AllowAny])
def google_callback(request):
    code = request.query_params.get("code")
    state = request.query_params.get("state")
    error = request.query_params.get("error")

    # We need origin even for errors, try to decode state best-effort
    origin = ""
    if state:
        try:
            state_data = _verify_oauth_state(state)
            origin = state_data.get("origin", "")
        except Exception:
            pass

    if error:
        logger.warning("Google OAuth error: %s", error)
        return HttpResponseRedirect(f"{origin}/login?error=google_denied")

    if not code or not state:
        return HttpResponseRedirect(f"{origin}/login?error=invalid_request")

    # Verify signed state
    try:
        state_data = _verify_oauth_state(state)
    except Exception:
        return HttpResponseRedirect(f"{origin}/login?error=invalid_state")

    tenant_schema = state_data["tenant"]
    origin = state_data["origin"]

    # Resolve the correct tenant from state
    from apps.core.models import Tenant
    try:
        tenant = Tenant.objects.get(schema_name=tenant_schema)
    except Tenant.DoesNotExist:
        return HttpResponseRedirect(f"{origin}/login?error=tenant_mismatch")

    # Switch to tenant schema for user lookup
    from django.db import connection as db_connection
    db_connection.set_tenant(tenant)

    # Exchange code for tokens
    token_response = http_requests.post(
        GOOGLE_TOKEN_URL,
        data={
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        },
        timeout=10,
    )

    if token_response.status_code != 200:
        logger.error("Google token exchange failed: %s", token_response.text)
        return HttpResponseRedirect(f"{origin}/login?error=token_exchange_failed")

    access_token = token_response.json().get("access_token")

    # Fetch user info
    userinfo_response = http_requests.get(
        GOOGLE_USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )

    if userinfo_response.status_code != 200:
        logger.error("Google userinfo fetch failed: %s", userinfo_response.text)
        return HttpResponseRedirect(f"{origin}/login?error=userinfo_failed")

    google_user = userinfo_response.json()
    email = google_user.get("email", "").lower()
    name = google_user.get("name", email.split("@")[0])
    avatar = google_user.get("picture", "")

    if not email:
        return HttpResponseRedirect(f"{origin}/login?error=no_email")

    # Determine default role: coach on public schema (main), student on tenant
    default_role = "coach" if tenant.schema_name == "public" else "student"

    user, created = User.objects.get_or_create(
        email=email,
        defaults={"name": name, "role": default_role, "avatar_url": avatar},
    )

    if not created and avatar and not user.avatar_url:
        user.avatar_url = avatar
        user.save(update_fields=["avatar_url"])

    jwt_token = create_jwt(user, tenant)
    return HttpResponseRedirect(f"{origin}/callback?token={jwt_token}&source=google")
