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
        # Settings-overridable so dev can run the e2e suite (whose student and
        # anonymous traffic all shares one client IP) without tripping 429s;
        # prod and tests keep the class defaults.
        self.default_rate = getattr(settings, "TENANT_RATE_LIMIT_DEFAULT", self.DEFAULT_RATE)
        self.upload_rate = getattr(settings, "TENANT_RATE_LIMIT_UPLOAD", self.UPLOAD_RATE)

    @staticmethod
    def _is_admin(request, schema_name):
        """Check JWT cookie/header for owner/coach role (runs before DRF auth).

        The token must belong to THIS tenant — a coach's token for tenant A must
        not exempt them from tenant B's rate limit (the tenant is resolved from
        the spoofable X-Tenant-Domain/Host header)."""
        token = request.COOKIES.get("contentor_access_token")
        if not token:
            auth_header = request.META.get("HTTP_AUTHORIZATION", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]
        if not token:
            return False
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            return payload.get("role") in ("owner", "coach") and payload.get("tenant_id") == schema_name
        except Exception:
            return False

    @staticmethod
    def _client_ip(request):
        """Real client IP behind Cloudflare -> cloudflared -> Caddy (first
        X-Forwarded-For hop), falling back to REMOTE_ADDR."""
        xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if xff:
            return xff.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR", "unknown")

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

        # Skip rate limiting for this tenant's own admin users (owner/coach)
        if self._is_admin(request, tenant.schema_name):
            return self.get_response(request)
        is_upload = request.path.startswith("/api/v1/upload/")
        rate = self.upload_rate if is_upload else self.default_rate
        # Bucket per client IP (not per whole tenant) so one abuser can't throttle
        # every visitor of a tenant, and a spoofed X-Tenant-Domain can't fill a
        # victim tenant's single shared window.
        bucket = "upload" if is_upload else "api"
        key = f"ratelimit:{tenant.schema_name}:{self._client_ip(request)}:{bucket}"
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
        except Exception:  # noqa: S110
            pass
        return self.get_response(request)
