import jwt
from django.conf import settings
from django.db import connection

from .models import User


class AdminJWTBackend:
    """
    Authenticate Django admin users via the contentor_access_token JWT cookie.
    If the user is already logged in (has a valid JWT) and is staff, let them
    into the admin without a password.
    """

    def authenticate(self, request, **kwargs):
        if request is None:
            return None

        token = request.COOKIES.get("contentor_access_token")
        if not token:
            return None

        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return None

        # Only a normal session token authenticates the admin. Magic-link,
        # signup, impersonation and oauth tokens carry a `purpose` and no
        # `user_id`; they must never grant an admin session.
        if payload.get("purpose") is not None:
            return None
        user_id = payload.get("user_id")
        if user_id is None:
            return None

        # The token must belong to the schema this request resolved to. User IDs
        # are per-schema sequences, so without this an owner's own token (user_id
        # 1, is_staff) could authenticate as user_id 1 in any other schema.
        current_schema = getattr(getattr(connection, "tenant", None), "schema_name", None)
        if current_schema is None or payload.get("tenant_id") != current_schema:
            return None

        # A token minted for region X must not be honoured on region Y.
        token_region = payload.get("region")
        request_region = getattr(request, "region", None)
        if token_region and request_region and token_region != request_region:
            return None

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return None

        if user.is_staff and user.is_active:
            return user
        return None

    def get_user(self, user_id):
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None
