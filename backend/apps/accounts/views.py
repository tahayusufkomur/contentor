import logging
from datetime import UTC
from urllib.parse import urlencode

import jwt as jwt_lib
import requests as http_requests
from django.conf import settings
from django.db import connection
from django.db.models import Q
from django.http import HttpResponseRedirect
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from apps.core.pagination import StandardPagination

from .models import User
from .serializers import (
    MagicLinkRequestSerializer,
    MagicLinkVerifyCodeSerializer,
    MagicLinkVerifySerializer,
    StudentListSerializer,
    UserSerializer,
)
from .tokens import create_jwt, create_magic_link_token, verify_magic_link_token

logger = logging.getLogger(__name__)


class MagicLinkThrottle(AnonRateThrottle):
    rate = "5/min"


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([MagicLinkThrottle])
def magic_link_request(request):
    serializer = MagicLinkRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data["email"]
    tenant = connection.tenant
    token = create_magic_link_token(email, tenant.schema_name, tenant.slug)
    logger.info("magic link requested email=%s tenant=%s", email, tenant.slug)

    # Demo tenants: bypass email, return token directly for instant login
    if tenant.slug.startswith("demo-"):
        scheme = "https" if request.is_secure() else "http"
        callback_url = f"{scheme}://{request.get_host()}/callback?token={token}"
        return Response({"detail": "Demo mode", "demo_redirect": callback_url})

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

    from apps.accounts import login_code
    from apps.core.email import send_magic_link

    code = login_code.issue(tenant.schema_name, email)

    # Locale: prefer request region's default, falling back to en.
    locale = "tr" if getattr(request, "region", "global") == "tr" else "en"
    sent = send_magic_link(email, link, brand_name, locale=locale, code=code)
    if not sent:
        # Always print to console so the link is visible in `make logs`
        print(f"\n{'=' * 60}")
        print(f"MAGIC LINK for {email}:")
        print(f"{link}")
        print(f"{'=' * 60}\n")

    from apps.core.i18n_helpers import msg

    return Response({"detail": msg(request, "magic_link_sent")})


def _login_user_response(request, tenant, email, via="magic_link"):
    """Get-or-create a student user for *email* on *tenant*, issue a JWT, return
    a 200 Response with the session cookie and locale cookie set.

    Shared by magic_link_verify and magic_link_verify_code so the user+session
    issuance logic is not duplicated.

    Args:
        via: Origin of the login ("magic_link" or "code") for logging.
    """
    from apps.core.constants import REGION_DEFAULT_LOCALE

    email = email.lower()
    region = getattr(tenant, "region", None) or getattr(request, "region", "global")
    # Email is unique per-region; include region in the lookup key.
    user, created = User.objects.get_or_create(
        email=email,
        region=region,
        defaults={
            "name": email.split("@")[0],
            "role": "student",
            "preferred_locale": REGION_DEFAULT_LOCALE.get(region, "en"),
            "accessible_regions": [],
        },
    )
    logger.info("login via %s email=%s tenant=%s new_student=%s", via, user.email, tenant.slug, created)
    jwt_token = create_jwt(user, tenant)
    response = Response({"user": UserSerializer(user).data})
    _set_session_cookie(response, jwt_token)
    # Readable locale cookie — edge middleware in Next.js reads this without decoding the JWT.
    _set_locale_cookie(response, user, tenant)
    return response


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def magic_link_verify(request):
    serializer = MagicLinkVerifySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    from apps.core.i18n_helpers import msg

    try:
        payload = verify_magic_link_token(serializer.validated_data["token"])
    except Exception:
        return Response({"detail": msg(request, "token_invalid_or_expired")}, status=status.HTTP_400_BAD_REQUEST)
    tenant = connection.tenant
    if payload["tenant_id"] != tenant.schema_name:
        return Response({"detail": msg(request, "token_wrong_tenant")}, status=status.HTTP_403_FORBIDDEN)
    return _login_user_response(request, tenant, payload["email"], via="magic_link")


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def magic_link_verify_code(request):
    from apps.core.i18n_helpers import msg

    serializer = MagicLinkVerifyCodeSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    tenant = connection.tenant
    email = serializer.validated_data["email"]
    from apps.accounts import login_code

    if not login_code.check(tenant.schema_name, email, serializer.validated_data["code"]):
        return Response({"detail": msg(request, "token_invalid_or_expired")}, status=status.HTTP_400_BAD_REQUEST)
    return _login_user_response(request, tenant, email, via="code")


def _tenant_default_locale(tenant) -> str:
    try:
        from apps.tenant_config.models import TenantConfig

        cfg = TenantConfig.objects.first()
        if cfg:
            return cfg.default_locale
    except Exception:
        pass
    return "en"


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout(request):
    logger.info("logout user=%s", getattr(request.user, "email", "anonymous"))
    response = Response({"detail": "Logged out"})
    response.delete_cookie("contentor_access_token")
    response.delete_cookie("contentor_impersonator_return")
    return response


SESSION_COOKIE = "contentor_access_token"
IMPERSONATOR_RETURN_COOKIE = "contentor_impersonator_return"


def _set_session_cookie(response, jwt_token, *, max_age=86400 * 7):
    response.set_cookie(SESSION_COOKIE, jwt_token, httponly=True, secure=False, samesite="Lax", max_age=max_age)


def _set_locale_cookie(response, user, tenant):
    locale = user.preferred_locale or _tenant_default_locale(tenant) or "en"
    response.set_cookie("user-locale", locale, httponly=False, secure=False, samesite="Lax", max_age=86400 * 365)


def _decode_session(token):
    """Decode an existing session JWT, or None if missing/invalid/expired."""
    if not token:
        return None
    try:
        return jwt_lib.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except Exception:
        return None


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def impersonate_verify(request):
    """Redeem a one-time impersonation token for a session on this tenant.

    Authorization rides entirely on the signed token (the caller may have no
    session on this domain), so this endpoint takes no auth class — mirrors
    magic-link verify.
    """
    from apps.core.i18n_helpers import msg

    from .tokens import verify_impersonation_token

    token = request.data.get("token", "")
    try:
        payload = verify_impersonation_token(token)
    except Exception:
        return Response({"detail": msg(request, "token_invalid_or_expired")}, status=status.HTTP_400_BAD_REQUEST)

    tenant = connection.tenant
    if payload["tenant_id"] != tenant.schema_name:
        return Response({"detail": msg(request, "token_wrong_tenant")}, status=status.HTTP_403_FORBIDDEN)

    # Single-use: burn the jti. If Redis is unavailable we log and proceed —
    # the 120s expiry still bounds replay.
    jti = payload.get("jti", "")
    try:
        from django_redis import get_redis_connection

        redis = get_redis_connection("default")
        if not redis.set(f"imp:used:{jti}", "1", nx=True, ex=130):
            return Response({"detail": "This impersonation link was already used."}, status=status.HTTP_400_BAD_REQUEST)
    except Exception:
        logger.warning("impersonation replay-protection unavailable (redis); proceeding for jti=%s", jti)

    try:
        target = User.objects.get(id=payload["target_user_id"])
    except User.DoesNotExist:
        return Response({"detail": "Target account no longer exists."}, status=status.HTTP_404_NOT_FOUND)

    imp_claim = {"by": payload.get("impersonator_email", ""), "scope": payload.get("scope", "")}
    session_jwt = create_jwt(target, tenant, extra_claims={"imp": imp_claim})

    response = Response({"user": UserSerializer(target).data, "impersonating": imp_claim})

    # Studio scope only (coach→student, same person & domain): keep the coach's
    # own token so "Exit" restores them in place. Platform scope (superadmin,
    # arriving cross-domain) must NOT adopt whatever session happens to sit on
    # the subdomain — its exit clears the tenant session and returns to apex.
    existing = _decode_session(request.COOKIES.get(SESSION_COOKIE))
    if (
        imp_claim["scope"] == "studio"
        and existing
        and existing.get("tenant_id") == tenant.schema_name
        and existing.get("role") in ("owner", "coach")
        and not existing.get("imp")
    ):
        response.set_cookie(
            IMPERSONATOR_RETURN_COOKIE,
            request.COOKIES[SESSION_COOKIE],
            httponly=True,
            secure=False,
            samesite="Lax",
            max_age=86400,
        )
    else:
        # Clear any stale return cookie so a prior studio session can't leak
        # into this one's exit.
        response.delete_cookie(IMPERSONATOR_RETURN_COOKIE)

    _set_session_cookie(response, session_jwt)
    _set_locale_cookie(response, target, tenant)
    logger.info("impersonation redeemed: by=%s as=%s tenant=%s", imp_claim["by"], target.email, tenant.schema_name)
    return response


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def impersonate_stop(request):
    """End an impersonated session.

    Restores the impersonator's own session if one was stashed (coach→student),
    otherwise just clears the session (superadmin, whose real session lives on
    the apex domain).
    """
    tenant = connection.tenant
    return_token = request.COOKIES.get(IMPERSONATOR_RETURN_COOKIE)
    restored = _decode_session(return_token)

    if restored and restored.get("tenant_id") == tenant.schema_name:
        user = User.objects.filter(id=restored.get("user_id")).first()
        response = Response({"restored": True, "user": UserSerializer(user).data if user else None})
        _set_session_cookie(response, return_token)
        response.delete_cookie(IMPERSONATOR_RETURN_COOKIE)
        return response

    response = Response({"restored": False})
    response.delete_cookie(SESSION_COOKIE)
    response.delete_cookie(IMPERSONATOR_RETURN_COOKIE)
    return response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    data = UserSerializer(request.user).data
    # Surface the impersonation banner state straight from the signed session
    # claim — it can't be spoofed by setting a cookie.
    auth = request.auth if isinstance(request.auth, dict) else {}
    if auth.get("imp"):
        data["impersonating"] = auth["imp"]
    return Response(data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_me(request):
    serializer = UserSerializer(request.user, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def update_locale(request):
    from apps.core.i18n_helpers import msg

    locale = (request.data.get("locale") or "").strip().lower()
    if locale not in ("en", "tr"):
        return Response({"detail": msg(request, "unsupported_locale")}, status=400)
    user = request.user
    user.preferred_locale = locale
    user.save(update_fields=["preferred_locale"])
    response = Response({"locale": locale})
    response.set_cookie(
        "user-locale",
        locale,
        httponly=False,
        secure=False,
        samesite="Lax",
        max_age=86400 * 365,
    )
    return response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def student_list(request):
    """List all students for the current tenant (coach/owner only)."""
    from apps.core.permissions import IsCoachOrOwner

    perm = IsCoachOrOwner()
    if not perm.has_permission(request, None):
        return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

    students = User.objects.filter(role="student")
    search = request.query_params.get("search")
    if search:
        students = students.filter(Q(name__icontains=search) | Q(email__icontains=search))
    ordering = request.query_params.get("ordering", "").strip()
    if ordering and ordering.lstrip("-") in {"name", "date_joined", "email", "last_login"}:
        students = students.order_by(ordering)
    else:
        students = students.order_by("-date_joined")

    paginate = "limit" in request.query_params or "offset" in request.query_params
    if paginate:
        paginator = StandardPagination()
        page = paginator.paginate_queryset(students, request)
        serializer = StudentListSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    serializer = StudentListSerializer(students, many=True)
    return Response(serializer.data)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def student_delete(request, pk):
    """Delete a student user (owner only)."""
    from apps.core.permissions import IsCoachOrOwner

    perm = IsCoachOrOwner()
    if not perm.has_permission(request, None):
        return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

    try:
        student = User.objects.get(pk=pk, role="student")
    except User.DoesNotExist:
        return Response({"detail": "Student not found."}, status=status.HTTP_404_NOT_FOUND)

    student.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


def _create_oauth_state(tenant_schema: str, origin: str, region: str) -> str:
    """Create a signed JWT containing OAuth state (no cookies needed).

    Google enforces a single fixed redirect_uri, so the callback always lands
    on one host (typically localhost). We carry the originating region inside
    the signed state so the callback knows the user's intended region.
    """
    from datetime import datetime, timedelta

    payload = {
        "tenant": tenant_schema,
        "origin": origin,
        "region": region,
        "purpose": "google_oauth",
        "exp": datetime.now(tz=UTC) + timedelta(minutes=10),
        "iat": datetime.now(tz=UTC),
    }
    return jwt_lib.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def _verify_oauth_state(state: str) -> dict:
    """Verify and decode the signed OAuth state."""
    payload = jwt_lib.decode(state, settings.SECRET_KEY, algorithms=["HS256"])
    if payload.get("purpose") != "google_oauth":
        raise jwt_lib.InvalidTokenError("Invalid state purpose")
    return payload


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def google_login(request):
    tenant = connection.tenant
    origin = request.data.get("origin", "")
    # Prefer region resolved from origin (where the user actually is) over
    # request.region (which is correct here too, but origin is the authoritative
    # signal for the post-OAuth redirect destination).
    from urllib.parse import urlparse

    from apps.core.region_utils import resolve_host

    origin_host = urlparse(origin).hostname or ""
    region = resolve_host(origin_host).region if origin_host else getattr(request, "region", "global")

    state = _create_oauth_state(tenant.schema_name, origin, region)

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
@authentication_classes([])
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

    from apps.core.constants import REGION_DEFAULT_LOCALE

    # Region from the signed state — the request host at this point is the
    # OAuth callback domain (localhost), which is meaningless for region.
    region = state_data.get("region") or getattr(tenant, "region", None) or "global"
    # Email is unique per-region; same person may have separate rows.
    user, created = User.objects.get_or_create(
        email=email,
        region=region,
        defaults={
            "name": name,
            "role": default_role,
            "avatar_url": avatar,
            "preferred_locale": REGION_DEFAULT_LOCALE.get(region, "en"),
            "accessible_regions": [],
        },
    )

    if not created and avatar and not user.avatar_url:
        user.avatar_url = avatar
        user.save(update_fields=["avatar_url"])

    # Pass region as an explicit override so the JWT carries the state region,
    # not whatever the OAuth-callback's tenant happened to have. This is what
    # lets the resulting cookie pass TenantJWTAuthentication's cross-region
    # check when the user lands back on tr.contentor.app.
    jwt_token = create_jwt(user, tenant, region=region)
    return HttpResponseRedirect(f"{origin}/callback?token={jwt_token}&source=google")
