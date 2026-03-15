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
    """Step 1: Validate signup data and send verification email. Tenant is NOT created yet."""
    serializer = CreatorSignupSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    slug = slugify(serializer.validated_data["brand_name"])[:63]
    if Tenant.objects.filter(slug=slug).exists():
        return Response({"detail": "Brand name already taken"}, status=400)

    email = serializer.validated_data["email"]
    name = serializer.validated_data["name"]
    brand_name = serializer.validated_data["brand_name"]

    from apps.accounts.tokens import create_signup_token

    token = create_signup_token(email, name, brand_name)

    scheme = "https" if request.is_secure() else "http"
    host = request.get_host()
    link = f"{scheme}://{host}/signup/verify?token={token}"

    from apps.core.email import send_email

    sent = send_email(
        to=email,
        subject=f"Verify your email — {brand_name}",
        html=f"""
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
            <h2 style="color: #1a1a2e;">Welcome to Contentor!</h2>
            <p style="color: #444;">Click the button below to verify your email and create <strong>{brand_name}</strong>.</p>
            <a href="{link}"
               style="display: inline-block; background: #171717; color: white; padding: 12px 32px;
                      border-radius: 6px; text-decoration: none; font-weight: 600; margin: 24px 0;">
                Verify &amp; Create My Platform
            </a>
            <p style="color: #888; font-size: 13px;">This link expires in {settings.MAGIC_LINK_EXPIRY_MINUTES} minutes.</p>
            <p style="color: #aaa; font-size: 12px; margin-top: 32px;">
                Or copy: <span style="word-break: break-all;">{link}</span>
            </p>
        </div>
        """,
    )
    if not sent:
        print(f"\n{'='*60}")
        print(f"SIGNUP VERIFICATION for {email}:")
        print(f"{link}")
        print(f"{'='*60}\n")

    return Response({"detail": "Verification email sent. Check your inbox."})


@api_view(["POST"])
@permission_classes([AllowAny])
def creator_signup_verify(request):
    """Step 2: Verify email token and create the tenant."""
    token = request.data.get("token")
    if not token:
        return Response({"detail": "Token required"}, status=400)

    from apps.accounts.tokens import verify_signup_token

    try:
        payload = verify_signup_token(token)
    except Exception:
        return Response({"detail": "Invalid or expired token"}, status=400)

    email = payload["email"]
    name = payload["name"]
    brand_name = payload["brand_name"]
    slug = slugify(brand_name)[:63]

    if Tenant.objects.filter(slug=slug).exists():
        # Tenant already created (e.g. user clicked link twice)
        tenant = Tenant.objects.get(slug=slug)
        return Response({
            "slug": slug,
            "status": tenant.provisioning_status,
            "domain": f"{slug}.{settings.CONTENTOR_DOMAIN}",
        })

    tenant = Tenant.objects.create(
        schema_name=slug,
        name=brand_name,
        slug=slug,
        subdomain=slug,
        owner_email=email,
        provisioning_status="pending",
    )
    Domain.objects.create(
        domain=f"{slug}.{settings.CONTENTOR_DOMAIN}",
        tenant=tenant,
        is_primary=True,
    )
    provision_tenant.delay(tenant.id, email, name)

    return Response({
        "slug": slug,
        "status": "pending",
        "domain": f"{slug}.{settings.CONTENTOR_DOMAIN}",
    }, status=201)


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
