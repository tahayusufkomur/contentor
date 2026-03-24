import jwt
from django.conf import settings
from django.db import connection
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed


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

        from .models import User

        try:
            user = User.objects.get(id=payload["user_id"])
        except User.DoesNotExist:
            return None

        return (user, payload)
