import time

import jwt
from django.conf import settings
from django.db import connection
from django.http import JsonResponse
from django_redis import get_redis_connection


class TenantRateLimitMiddleware:
    DEFAULT_RATE = 100
    UPLOAD_RATE = 10

    def __init__(self, get_response):
        self.get_response = get_response

    @staticmethod
    def _is_admin(request):
        """Check JWT cookie/header for owner/coach role (runs before DRF auth)."""
        token = request.COOKIES.get("contentor_access_token")
        if not token:
            auth_header = request.META.get("HTTP_AUTHORIZATION", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]
        if not token:
            return False
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            return payload.get("role") in ("owner", "coach")
        except Exception:
            return False

    # The tenant-config endpoint resolves whether a site exists and is fetched on
    # every server-rendered page load (without the visitor's auth cookie). Rate
    # limiting it makes a perfectly valid tenant render "Site not found" under load
    # — a far worse failure than throttling a data endpoint — so it is never limited.
    EXEMPT_PATHS = ("/api/v1/admin/config/",)

    def __call__(self, request):
        tenant = getattr(connection, "tenant", None)
        if not tenant or tenant.schema_name == "public":
            return self.get_response(request)

        if request.path in self.EXEMPT_PATHS:
            return self.get_response(request)

        # Skip rate limiting for admin users (owner/coach)
        if self._is_admin(request):
            return self.get_response(request)
        is_upload = request.path.startswith("/api/v1/upload/")
        rate = self.UPLOAD_RATE if is_upload else self.DEFAULT_RATE
        key = f"ratelimit:{tenant.schema_name}:{'upload' if is_upload else 'api'}"
        now = time.time()
        window = 60
        try:
            redis = get_redis_connection("default")
            pipe = redis.pipeline()
            pipe.zremrangebyscore(key, 0, now - window)
            pipe.zadd(key, {f"{now}": now})
            pipe.zcard(key)
            pipe.expire(key, window + 1)
            results = pipe.execute()
            request_count = results[2]
            if request_count > rate:
                return JsonResponse({"detail": "Rate limit exceeded"}, status=429, headers={"Retry-After": "60"})
        except Exception:
            pass
        return self.get_response(request)
