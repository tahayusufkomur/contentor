import jwt
from django.conf import settings
from django.db import connection
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed


class CrossRegionRejection(AuthenticationFailed):
    """Raised when a JWT is valid but its region claim does not match the request region.

    The Next.js middleware catches this and 302s the user to the correct region's apex.
    """

    def __init__(self, expected_region: str, token_region: str):
        from apps.core.region_utils import region_apex

        super().__init__(
            {
                "error": "CROSS_REGION",
                "expected_region": expected_region,
                "token_region": token_region,
                "redirect_to": region_apex(token_region, scheme="https"),
            }
        )


class TenantJWTAuthentication(BaseAuthentication):
    def authenticate(self, request):
        token = request.COOKIES.get("contentor_access_token")
        if not token:
            auth_header = request.META.get("HTTP_AUTHORIZATION", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]
        if not token:
            return None
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            # Return None so AllowAny views treat the user as anonymous
            # instead of raising 403. IsAuthenticated views will still
            # reject because request.user stays anonymous.
            return None

        if payload.get("tenant_id") != connection.tenant.schema_name:
            return None

        # Cross-region check: a valid JWT for region X must not be honoured on region Y.
        token_region = payload.get("region")
        request_region = getattr(request, "region", None)
        if token_region and request_region and token_region != request_region:
            raise CrossRegionRejection(expected_region=request_region, token_region=token_region)

        from .models import User

        try:
            user = User.objects.get(id=payload["user_id"])
        except User.DoesNotExist:
            return None

        from apps.logbook.context import set_current_user

        set_current_user(user.email)
        return (user, payload)
