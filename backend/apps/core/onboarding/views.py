import logging

from django.conf import settings
from django.utils.text import slugify
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from ..models import Domain, Tenant
from ..serializers import CreatorSignupSerializer
from ..tasks import provision_tenant

logger = logging.getLogger(__name__)


class SignupThrottle(AnonRateThrottle):
    """Per-IP throttle for the public creator-signup endpoint — it sends a
    verification email per call, so cap it to stop email-bomb / quota abuse."""

    scope = "signup"


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([SignupThrottle])
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
        if settings.DEBUG:
            print(f"\n{'=' * 60}")
            print(f"SIGNUP VERIFICATION for {email}:")
            print(f"{link}")
            print(f"{'=' * 60}\n")
        else:
            # Never write the verification token/link to prod logs.
            logger.error("Failed to send signup verification email to %s (link withheld from logs)", email)

    return Response({"detail": msg(request, "verification_sent")})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def creator_signup_authenticated(request):
    """Authenticated coaches create additional platforms WITHOUT an email round-trip.

    A logged-in coach's session JWT already proves they own the email, so the
    magic-link verification step in :func:`creator_signup` is redundant here.
    We mint the same signup token directly (no email sent) and hand it back so
    the frontend can resume at ``/signup/verify`` exactly like the email flow.
    """
    from apps.core.i18n_helpers import msg

    user = request.user
    # Only coaches/owners provision platforms; students must not.
    if user.role not in ("coach", "owner"):
        return Response({"detail": msg(request, "permission_denied")}, status=403)

    brand_name = (request.data.get("brand_name") or "").strip()[:100]
    if not brand_name:
        return Response({"detail": msg(request, "brand_required")}, status=400)

    slug = slugify(brand_name)[:63]
    region = getattr(request, "region", "global")
    if not slug or Tenant.objects.filter(slug=slug, region=region).exists():
        return Response({"detail": msg(request, "brand_taken")}, status=400)

    from apps.accounts.tokens import create_signup_token

    token = create_signup_token(user.email, user.name, brand_name, region=region)
    logger.info(
        "authenticated creator new-platform email=%s brand=%s region=%s",
        user.email,
        brand_name,
        region,
    )
    return Response({"token": token})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def creator_signup_verify(request):
    """Step 2: Verify email token and create the tenant."""
    from apps.core.i18n_helpers import msg

    token = request.data.get("token")
    if not token:
        return Response({"detail": msg(request, "token_required")}, status=400)

    # verify_wizard_token accepts BOTH purposes (signup + wizard), so the
    # 15-minute email link and the 7-day resume/recovery links all land here.
    from apps.accounts.tokens import verify_wizard_token

    try:
        payload = verify_wizard_token(token)
    except Exception:
        return Response({"detail": msg(request, "token_invalid_or_expired")}, status=400)

    email = payload["email"]
    brand_name = payload["brand_name"]
    region = payload.get("region", "global")
    slug = slugify(brand_name)[:63]

    from apps.accounts.tokens import create_wizard_token

    wizard_token = create_wizard_token(email, payload.get("name", ""), brand_name, region=region)

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
                "wizard_token": wizard_token,
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
            "wizard_token": wizard_token,
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
    from apps.core.demo.seed_template import available_niches

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


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def onboarding_handoff(request):
    """Step 4: exchange the signup token for a one-click login URL.

    The signup token is the email-ownership proof; the returned URL carries a
    standard magic-link token consumed by the tenant's existing /callback flow.
    """
    from .wizard import _resolve_tenant_from_wizard_token

    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err is not None:
        return err
    if tenant.provisioning_status != "ready":
        return Response({"detail": "not_ready"}, status=409)

    from apps.accounts.tokens import create_magic_link_token

    magic = create_magic_link_token(tenant.owner_email, tenant.schema_name, tenant.slug)
    base_domain = settings.CONTENTOR_DOMAIN
    fqdn = f"{tenant.slug}.tr.{base_domain}" if tenant.region == "tr" else f"{tenant.slug}.{base_domain}"
    return Response({"login_url": f"{settings.SITE_SCHEME}://{fqdn}/callback?token={magic}&next=/"})


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
            "stage": (tenant.wizard_state or {}).get("provisioning_stage"),
        }
    )
