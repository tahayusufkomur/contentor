from django.db import connection
from django.http import JsonResponse
from django_redis import get_redis_connection
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    status = {"status": "ok", "db": "ok", "redis": "ok"}
    try:
        connection.ensure_connection()
    except Exception:
        status["db"] = "error"
        status["status"] = "degraded"
    try:
        redis = get_redis_connection("default")
        redis.ping()
    except Exception:
        status["redis"] = "error"
        status["status"] = "degraded"
    code = 200 if status["status"] == "ok" else 503
    return JsonResponse(status, status=code)
