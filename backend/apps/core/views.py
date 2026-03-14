from django.conf import settings
from django.db import connection
from django.http import JsonResponse
from django.utils.text import slugify
from django_redis import get_redis_connection
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Domain, Tenant
from .serializers import CreatorSignupSerializer
from .tasks import provision_tenant


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


@api_view(["POST"])
@permission_classes([AllowAny])
def creator_signup(request):
    serializer = CreatorSignupSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    slug = slugify(serializer.validated_data["brand_name"])[:63]
    if Tenant.objects.filter(slug=slug).exists():
        return Response({"detail": "Brand name already taken"}, status=400)
    tenant = Tenant.objects.create(
        schema_name=slug, name=serializer.validated_data["brand_name"],
        slug=slug, subdomain=slug, owner_email=serializer.validated_data["email"],
        provisioning_status="pending",
    )
    Domain.objects.create(domain=f"{slug}.{settings.CONTENTOR_DOMAIN}", tenant=tenant, is_primary=True)
    provision_tenant.delay(tenant.id, serializer.validated_data["email"], serializer.validated_data["name"])
    return Response({"tenant_id": tenant.id, "slug": slug, "status": "pending", "domain": f"{slug}.{settings.CONTENTOR_DOMAIN}"}, status=201)


@api_view(["GET"])
@permission_classes([AllowAny])
def provisioning_status(request):
    slug = request.query_params.get("slug")
    if not slug:
        return Response({"detail": "slug parameter required"}, status=400)
    try:
        tenant = Tenant.objects.get(slug=slug)
    except Tenant.DoesNotExist:
        return Response({"detail": "Tenant not found"}, status=404)
    return Response({"slug": tenant.slug, "status": tenant.provisioning_status, "domain": f"{tenant.slug}.{settings.CONTENTOR_DOMAIN}"})
