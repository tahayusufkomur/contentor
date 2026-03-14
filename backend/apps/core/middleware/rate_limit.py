import time
from django.db import connection
from django.http import JsonResponse
from django_redis import get_redis_connection


class TenantRateLimitMiddleware:
    DEFAULT_RATE = 100
    UPLOAD_RATE = 10

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        tenant = getattr(connection, "tenant", None)
        if not tenant or tenant.schema_name == "public":
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
