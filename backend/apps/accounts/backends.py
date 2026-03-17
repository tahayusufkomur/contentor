import jwt
from django.conf import settings

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

        try:
            user = User.objects.get(id=payload["user_id"])
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
