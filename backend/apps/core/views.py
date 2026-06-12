import logging

from django.conf import settings
from django.db import connection
from django.http import JsonResponse
from django.utils.text import slugify
from django_redis import get_redis_connection
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Domain, Tenant
from .serializers import CreatorSignupSerializer
from .tasks import provision_tenant

logger = logging.getLogger(__name__)


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
@authentication_classes([])
@permission_classes([AllowAny])
def creator_signup(request):
    """Step 1: Validate signup data and send verification email. Tenant is NOT created yet."""
    serializer = CreatorSignupSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    from apps.core.i18n_helpers import msg

    slug = slugify(serializer.validated_data["brand_name"])[:63]
    region = getattr(request, "region", "global")
    if Tenant.objects.filter(slug=slug, region=region).exists():
        return Response({"detail": msg(request, "brand_taken")}, status=400)

    email = serializer.validated_data["email"]
    name = serializer.validated_data["name"]
    brand_name = serializer.validated_data["brand_name"]

    from apps.accounts.tokens import create_signup_token

    token = create_signup_token(email, name, brand_name, region=region)
    logger.info("creator signup requested email=%s brand=%s region=%s", email, brand_name, region)

    scheme = "https" if request.is_secure() else "http"
    host = request.get_host()
    link = f"{scheme}://{host}/signup/verify?token={token}"

    from apps.core.email import send_email

    # TR: needs native review.
    locale = "tr" if getattr(request, "region", "global") == "tr" else "en"
    strings = {
        "en": {
            "subject": f"Verify your email — {brand_name}",
            "heading": "Welcome to Contentor!",
            "intro": f"Click the button below to verify your email and create <strong>{brand_name}</strong>.",
            "button": "Verify &amp; Create My Platform",
            "expires": f"This link expires in {settings.MAGIC_LINK_EXPIRY_MINUTES} minutes.",
            "copy_label": "Or copy:",
        },
        "tr": {
            "subject": f"E-postanızı doğrulayın — {brand_name}",
            "heading": "Contentor'a hoş geldiniz!",
            "intro": (
                f"E-postanızı doğrulamak ve <strong>{brand_name}</strong> "
                f"platformunu oluşturmak için aşağıdaki düğmeye tıklayın."
            ),
            "button": "Doğrula ve Platformumu Oluştur",
            "expires": f"Bu bağlantı {settings.MAGIC_LINK_EXPIRY_MINUTES} dakika içinde sona erer.",
            "copy_label": "Veya kopyalayın:",
        },
    }[locale]
    sent = send_email(
        to=email,
        subject=strings["subject"],
        html=f"""
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
            <h2 style="color: #1a1a2e;">{strings["heading"]}</h2>
            <p style="color: #444;">{strings["intro"]}</p>
            <a href="{link}"
               style="display: inline-block; background: #171717; color: white; padding: 12px 32px;
                      border-radius: 6px; text-decoration: none; font-weight: 600; margin: 24px 0;">
                {strings["button"]}
            </a>
            <p style="color: #888; font-size: 13px;">{strings["expires"]}</p>
            <p style="color: #aaa; font-size: 12px; margin-top: 32px;">
                {strings["copy_label"]} <span style="word-break: break-all;">{link}</span>
            </p>
        </div>
        """,
    )
    if not sent:
        print(f"\n{'='*60}")
        print(f"SIGNUP VERIFICATION for {email}:")
        print(f"{link}")
        print(f"{'='*60}\n")

    return Response({"detail": msg(request, "verification_sent")})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def creator_signup_verify(request):
    """Step 2: Verify email token and create the tenant."""
    from apps.core.i18n_helpers import msg

    token = request.data.get("token")
    if not token:
        return Response({"detail": msg(request, "token_required")}, status=400)

    from apps.accounts.tokens import verify_signup_token

    try:
        payload = verify_signup_token(token)
    except Exception:
        return Response({"detail": msg(request, "token_invalid_or_expired")}, status=400)

    email = payload["email"]
    brand_name = payload["brand_name"]
    region = payload.get("region", "global")
    slug = slugify(brand_name)[:63]

    # Build the tenant's FQDN based on region. TR tenants live under tr.{base}.
    base_domain = settings.CONTENTOR_DOMAIN
    tenant_fqdn = f"{slug}.tr.{base_domain}" if region == "tr" else f"{slug}.{base_domain}"
    # Schema names are globally unique in Postgres, so we prefix TR tenants
    # to avoid colliding with a same-named brand in the global region.
    schema_name = f"tr_{slug}" if region == "tr" else slug

    if Tenant.objects.filter(slug=slug, region=region).exists():
        tenant = Tenant.objects.get(slug=slug, region=region)
        return Response(
            {
                "slug": slug,
                "status": tenant.provisioning_status,
                "region": tenant.region,
                "domain": tenant_fqdn,
            }
        )

    from apps.core.constants import REGION_DEFAULT_CURRENCY, REGION_DEFAULT_LOCALE

    tenant = Tenant.objects.create(
        schema_name=schema_name,
        name=brand_name,
        slug=slug,
        subdomain=slug,
        owner_email=email,
        provisioning_status="pending",
        region=region,
        billing_currency=REGION_DEFAULT_CURRENCY.get(region, "USD"),
    )
    Domain.objects.create(
        domain=tenant_fqdn,
        tenant=tenant,
        is_primary=True,
    )
    logger.info(
        "tenant created slug=%s schema=%s region=%s owner=%s",
        slug,
        schema_name,
        region,
        email,
    )
    # Provisioning is enqueued from the onboarding template endpoint (or the
    # skip endpoint) so we can seed niche content as part of the same task —
    # this collapses provisioning + seeding into one progress screen.

    return Response(
        {
            "slug": slug,
            "status": "pending",
            "region": region,
            "domain": tenant_fqdn,
            "locale": REGION_DEFAULT_LOCALE.get(region, "en"),
        },
        status=201,
    )


def _resolve_tenant_from_signup_token(request) -> tuple[dict | None, Tenant | None, Response | None]:
    """Shared token + tenant lookup for the post-verify onboarding endpoints.

    Returns (payload, tenant, error_response). Exactly one of (tenant, error)
    is None on return.
    """
    from apps.accounts.tokens import verify_signup_token
    from apps.core.i18n_helpers import msg

    token = request.data.get("token")
    if not token:
        return None, None, Response({"detail": msg(request, "token_required")}, status=400)
    try:
        payload = verify_signup_token(token)
    except Exception:
        return None, None, Response({"detail": msg(request, "token_invalid_or_expired")}, status=400)

    region = payload.get("region", "global")
    slug = slugify(payload["brand_name"])[:63]
    try:
        tenant = Tenant.objects.get(slug=slug, region=region)
    except Tenant.DoesNotExist:
        return None, None, Response({"detail": msg(request, "tenant_not_found")}, status=404)
    if tenant.owner_email != payload["email"]:
        return None, None, Response({"detail": "Token does not match tenant owner."}, status=403)
    return payload, tenant, None


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def seed_from_template(request):
    """Step 3a: record the coach's questionnaire answers and start provisioning.

    Accepts the same signup token used for verify. The token is reusable here
    because it's the only credential the coach has at this stage (no JWT yet).
    """
    from apps.core.seed_template import available_niches

    payload, tenant, err = _resolve_tenant_from_signup_token(request)
    if err is not None:
        return err

    niche = (request.data.get("niche") or "").strip()
    goals = request.data.get("goals") or []
    if not isinstance(goals, list) or not all(isinstance(g, str) for g in goals):
        return Response({"detail": "goals must be a list of strings."}, status=400)
    if niche not in available_niches():
        return Response({"detail": f"Unknown niche '{niche}'."}, status=400)

    # Idempotency: if seeding already kicked off, don't double-enqueue.
    if tenant.template_seed_status in ("seeding", "ready"):
        return Response(
            {"slug": tenant.slug, "status": tenant.provisioning_status, "template_status": tenant.template_seed_status},
        )

    tenant.template_niche = niche
    tenant.template_goals = goals[:20]  # cap; defensive against arbitrary payloads
    tenant.template_seed_status = "seeding"
    tenant.save(update_fields=["template_niche", "template_goals", "template_seed_status"])

    provision_tenant.delay(tenant.id, payload["email"], payload["name"], niche)
    return Response(
        {"slug": tenant.slug, "status": "pending", "template_status": "seeding"},
        status=202,
    )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def skip_template(request):
    """Step 3b: coach opted out of templates — provision a blank tenant."""
    payload, tenant, err = _resolve_tenant_from_signup_token(request)
    if err is not None:
        return err

    if tenant.template_seed_status in ("seeding", "ready"):
        return Response(
            {"slug": tenant.slug, "status": tenant.provisioning_status, "template_status": tenant.template_seed_status},
        )

    tenant.template_seed_status = "skipped"
    tenant.save(update_fields=["template_seed_status"])

    provision_tenant.delay(tenant.id, payload["email"], payload["name"])
    return Response(
        {"slug": tenant.slug, "status": "pending", "template_status": "skipped"},
        status=202,
    )


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def provisioning_status(request):
    from apps.core.i18n_helpers import msg

    slug = request.query_params.get("slug")
    if not slug:
        return Response({"detail": msg(request, "slug_required")}, status=400)
    region = getattr(request, "region", "global")
    try:
        tenant = Tenant.objects.get(slug=slug, region=region)
    except Tenant.DoesNotExist:
        return Response({"detail": msg(request, "tenant_not_found")}, status=404)
    base_domain = settings.CONTENTOR_DOMAIN
    fqdn = f"{tenant.slug}.tr.{base_domain}" if tenant.region == "tr" else f"{tenant.slug}.{base_domain}"
    return Response(
        {
            "slug": tenant.slug,
            "status": tenant.provisioning_status,
            "domain": fqdn,
        }
    )
