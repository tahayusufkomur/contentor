import logging
import re
from datetime import timedelta
from urllib.parse import urlencode

from django.conf import settings
from django.utils import timezone, translation
from django.utils.translation import gettext as _
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from apps.core import languages
from apps.core.slugs import slugify
from apps.core.throttling import BrandNameCheckThrottle

from ..models import Domain, Tenant
from ..serializers import CreatorSignupSerializer
from ..tasks import provision_tenant
from .experiments import assign_wizard_bucket

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
    """Step 1: Validate signup data and send verification email. Tenant is NOT created yet.
    The site gets a temporary address; the creator names it in /setup (site_name)."""
    serializer = CreatorSignupSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    from apps.core.constants import SITE_PLACEHOLDER_PREFIX

    from .site_name import placeholder_site

    region = getattr(request, "region", "global")
    email = serializer.validated_data["email"]
    name = serializer.validated_data["name"]
    # A resend keeps the address the first email's link creates, until that site exists.
    site = serializer.validated_data["site"]
    if (
        not re.fullmatch(rf"{SITE_PLACEHOLDER_PREFIX}[0-9a-f]{{6}}", site)
        or Tenant.objects.filter(schema_name=site).exists()
    ):
        site = placeholder_site()

    from apps.accounts.tokens import create_signup_token

    locale = languages.resolve(serializer.validated_data["locale"])
    site_locale = languages.resolve(serializer.validated_data["site_locale"] or locale)
    token = create_signup_token(email, name, site, region=region, locale=locale, site_locale=site_locale)
    logger.info("creator signup requested email=%s site=%s region=%s", email, site, region)

    scheme = "https" if request.is_secure() else "http"
    host = request.get_host()
    link = f"{scheme}://{host}/signup/verify?token={token}"

    from apps.core.email import action_email, send_email

    html, text = action_email(
        heading="Confirm your email",
        intro="Click the button below to verify your email and create your site.",
        button="Verify and create my site",
        link=link,
        expires=f"This link expires in {settings.MAGIC_LINK_EXPIRY_MINUTES} minutes.",
    )
    sent = send_email(to=email, subject="Verify your email to create your site", html=html, text=text)
    if not sent:
        if settings.DEBUG:
            print(f"\n{'=' * 60}")
            print(f"SIGNUP VERIFICATION for {email}:")
            print(f"{link}")
            print(f"{'=' * 60}\n")
        else:
            # Never write the verification token/link to prod logs.
            logger.error("Failed to send signup verification email to %s (link withheld from logs)", email)

    return Response({"detail": _("Verification email sent. Check your inbox."), "site": site})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([BrandNameCheckThrottle])
def check_brand_name(request):
    """Is this site name available? Read-only: /setup's name question asks it
    before the name is sent (site_name.rename checks again)."""

    region = getattr(request, "region", "global")
    if request.data.get("ideas") is not None:
        # "Need a name?": brand-name ideas for what the coach teaches, only the free ones.
        from .name_check import ideas

        topic, first = request.data.get("ideas"), request.data.get("first_name") or ""
        if not isinstance(topic, str) or not isinstance(first, str):
            return Response({"detail": _("Brand name is required")}, status=400)
        names = ideas(topic, first, language=languages.resolve(translation.get_language()))
        taken = set(
            Tenant.objects.filter(slug__in=[slugify(n)[:63] for n in names if n], region=region).values_list(
                "slug", flat=True
            )
        )
        return Response({"ideas": [n for n in names if slugify(n)[:63] and slugify(n)[:63] not in taken]})

    brand_name = (request.data.get("brand_name") or "").strip()
    if not brand_name:
        return Response({"detail": _("Brand name is required")}, status=400)

    from .site_name import PROBLEMS, name_problem

    if problem := name_problem(brand_name):
        return Response({"available": False, "detail": str(PROBLEMS[problem])})
    if not request.data.get("review"):
        return Response({"available": True})
    # A typo fix and a few alternatives, only the ones still free to take.
    from .name_check import review

    found = review(brand_name, language=languages.resolve(translation.get_language()))
    taken = set(
        Tenant.objects.filter(
            slug__in=[slugify(n)[:63] for n in (found["typo_fix"], *found["suggestions"]) if n], region=region
        ).values_list("slug", flat=True)
    )
    free = [n for n in found["suggestions"] if slugify(n)[:63] and slugify(n)[:63] not in taken]
    typo = found["typo_fix"] if found["typo_fix"] and slugify(found["typo_fix"])[:63] not in taken else ""
    return Response({"available": True, "typo_fix": typo, "suggestions": free})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def creator_signup_authenticated(request):
    """Authenticated coaches create additional platforms WITHOUT an email round-trip.

    A logged-in coach's session JWT already proves they own the email, so the
    magic-link verification step in :func:`creator_signup` is redundant here.
    We mint the same signup token directly (no email sent) and hand it back so
    the frontend can resume at ``/signup/verify`` exactly like the email flow.
    """

    user = request.user
    # Only coaches/owners provision platforms; students must not.
    if user.role not in ("coach", "owner"):
        return Response({"detail": _("Permission denied.")}, status=403)

    from .site_name import placeholder_site

    region = getattr(request, "region", "global")
    site = placeholder_site()

    from apps.accounts.tokens import create_signup_token

    locale = languages.resolve(request.data.get("locale") or user.preferred_locale)
    site_locale = languages.resolve(request.data.get("site_locale") or locale)
    token = create_signup_token(user.email, user.name, site, region=region, locale=locale, site_locale=site_locale)
    logger.info(
        "authenticated creator new-platform email=%s site=%s region=%s",
        user.email,
        site,
        region,
    )
    return Response({"token": token})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def creator_signup_verify(request):
    """Step 2: Verify email token and create the tenant."""

    token = request.data.get("token")
    if not token:
        return Response({"detail": _("Token required")}, status=400)

    # verify_wizard_token accepts BOTH purposes (signup + wizard), so the
    # 15-minute email link and the 7-day resume/recovery links all land here.
    from apps.accounts.tokens import verify_wizard_token

    try:
        payload = verify_wizard_token(token)
    except Exception:
        return Response({"detail": _("Invalid or expired token")}, status=400)

    email = payload["email"]
    region = payload.get("region", "global")

    from apps.accounts.tokens import create_wizard_token

    from .site_name import PLACEHOLDER_NAME, token_tenant

    base_domain = settings.CONTENTOR_DOMAIN
    tenant = token_tenant(payload)
    if tenant is None and not payload.get("site"):  # a link sent before sites were named in /setup
        return Response({"detail": _("Invalid or expired token")}, status=400)

    if tenant is not None:
        if tenant.owner_email != email:
            return Response({"detail": "Token does not match tenant owner."}, status=403)
        wizard_token = create_wizard_token(email, payload.get("name", ""), tenant.schema_name, region=region)
        tenant_fqdn = f"{tenant.slug}.{base_domain}"
        # Never provisioned (signed up under the old wizard, or the enqueue
        # was lost): start it now, or the verify page would poll forever.
        stale = timezone.now() - tenant.created_at > PROVISION_RETRY_AFTER
        if tenant.provisioning_status == "pending" and stale and not tenant.is_paused:
            old_answers = (tenant.wizard_state or {}).get("answers") or {}
            _start_interview_provisioning(tenant, email, payload.get("name", ""), old_answers)
        session_id = request.data.get("session_id")
        if isinstance(session_id, str) and session_id and tenant.is_paused:
            # Back from Checkout: pull the session rather than wait on the
            # webhook. The trial starting is what builds the site (core.signals).
            from apps.billing.views.webhooks_platform import sync_platform_checkout_session

            sync_platform_checkout_session(tenant, session_id)
            tenant = Tenant.objects.get(pk=tenant.pk)
        return Response(
            {
                "slug": tenant.slug,
                "status": tenant.provisioning_status,
                "region": tenant.region,
                "domain": tenant_fqdn,
                "wizard_token": wizard_token,
                **_card_step(tenant),
            }
        )

    from apps.core.currency import currency_for_country

    # The temporary address until the creator names the site in /setup.
    slug = payload["site"]
    tenant_fqdn = f"{slug}.{base_domain}"
    wizard_token = create_wizard_token(email, payload.get("name", ""), slug, region=region)
    tenant = Tenant.objects.create(
        schema_name=slug,
        name=PLACEHOLDER_NAME,
        slug=slug,
        subdomain=slug,
        owner_email=email,
        provisioning_status="pending",
        region=region,
        billing_currency=currency_for_country(request.META.get("HTTP_CF_IPCOUNTRY")),
        # Assigned here and only here: the resume branch above must leave a
        # returning coach's bucket untouched. email:region is the stable key.
        wizard_bucket=assign_wizard_bucket(f"{email}:{region}"),
        # No Free plan any more: a Starter trial (card first) or a paid plan.
        requires_plan=True,
        # The creator's language and the site's, as picked at signup (resolved: a hidden one is English).
        wizard_state={
            "locale": languages.resolve(payload.get("locale")),
            "site_locale": languages.resolve(payload.get("site_locale")),
        },
    )
    Domain.objects.create(
        domain=tenant_fqdn,
        tenant=tenant,
        is_primary=True,
    )
    logger.info("tenant created slug=%s region=%s owner=%s", slug, region, email)
    _start_interview_provisioning(tenant, email, payload.get("name", ""))

    return Response(
        {
            "slug": slug,
            "status": "pending",
            "region": region,
            "domain": tenant_fqdn,
            "locale": tenant.wizard_state["locale"],
            "wizard_token": wizard_token,
            **_card_step(tenant),
        },
        status=201,
    )


def _card_step(tenant) -> dict:
    """No site is built before its card: a tenant that needs a plan and was
    never built stops at the trial's Checkout first. Says what that trial is."""
    if tenant.provisioning_status != "pending" or not tenant.is_paused:
        return {"needs_card": False}
    from apps.tenant_config.interview_golive import _starter_plan

    return {"needs_card": True, "plan": _starter_plan(tenant)}


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def signup_checkout(request):
    """The card before the site: Stripe Checkout for the Starter trial of a
    tenant with no plan yet, back to /signup/verify, which syncs the session.
    Every new tenant gets its own trial (``trial_days_for``)."""
    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err is not None:
        return err
    if not tenant.is_paused:
        # A second subscription beside a running one would bill both.
        return Response({"error": "PLAN_RUNNING"}, status=409)

    from apps.accounts.models import User
    from apps.billing.providers import get_provider
    from apps.billing.providers.stripe_provider import embedded_fields
    from apps.billing.providers.types import ProviderError
    from apps.core.models import PlatformPlan
    from apps.core.monetization import TRIAL_PLAN_NAME, trial_days_for

    plan = PlatformPlan.objects.filter(name__iexact=TRIAL_PLAN_NAME, is_active=True).first()
    if plan is None:
        return Response({"error": "PLAN_NOT_FOUND"}, status=404)
    region = tenant.region or "global"
    locale = languages.resolve((tenant.wizard_state or {}).get("locale"))
    # The plan is on the owner's platform account; the build reuses this row.
    account, _ = User.objects.get_or_create(
        email=tenant.owner_email,
        region=region,
        defaults={
            "name": payload.get("name", ""),
            "role": "coach",
            "preferred_locale": locale,
            "accessible_regions": [],
        },
    )
    # The way back carries the token like the email link: the page's stored copy
    # may not survive the trip (a private window, storage blocked).
    back = f"{settings.SITE_SCHEME}://{request.get_host()}/signup/verify?{urlencode({'token': request.data['token']})}"
    try:
        session = get_provider().create_checkout_session(
            tenant=tenant,
            user=account,
            plan=plan,
            success_url=f"{back}&checkout=success",
            cancel_url=f"{back}&checkout=cancel",
            locale=locale,
            trial_days=trial_days_for(tenant, plan),
        )
    except ProviderError as exc:
        logger.warning("signup checkout failed slug=%s: %s", tenant.slug, exc)
        return Response({"error": exc.code, "detail": str(exc)}, status=400)
    logger.info("signup checkout started slug=%s", tenant.slug)
    return Response({"checkout_url": session.url, **embedded_fields(session.client_secret)})


def _resolve_tenant_from_signup_token(request) -> tuple[dict | None, Tenant | None, Response | None]:
    """Shared token + tenant lookup for the post-verify onboarding endpoints.

    Returns (payload, tenant, error_response). Exactly one of (tenant, error)
    is None on return.
    """
    from apps.accounts.tokens import verify_signup_token

    token = request.data.get("token")
    if not token:
        return None, None, Response({"detail": _("Token required")}, status=400)
    try:
        payload = verify_signup_token(token)
    except Exception:
        return None, None, Response({"detail": _("Invalid or expired token")}, status=400)

    from .site_name import token_tenant

    tenant = token_tenant(payload)
    if tenant is None:
        return None, None, Response({"detail": _("Tenant not found")}, status=404)
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
    """Step 4: exchange the signup/wizard token for a one-click login URL.

    Accepts both the short-lived signup token and the 7-day wizard token as
    email-ownership proof; the returned URL carries a standard magic-link
    token consumed by the tenant's existing /callback flow.
    """
    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err is not None:
        return err
    if tenant.provisioning_status != "ready":
        return Response({"detail": "not_ready"}, status=409)

    from apps.tenant_config.interview_brief import touch

    touch(tenant)  # a resume via handoff is activity (abandoned-signup cleanup)

    from .site_name import setup_login_url

    return Response({"login_url": setup_login_url(tenant, tenant.owner_email)})


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def provisioning_status(request):
    slug = request.query_params.get("slug")
    if not slug:
        return Response({"detail": _("slug parameter required")}, status=400)
    region = getattr(request, "region", "global")
    try:
        tenant = Tenant.objects.get(slug=slug, region=region)
    except Tenant.DoesNotExist:
        return Response({"detail": _("Tenant not found")}, status=404)
    base_domain = settings.CONTENTOR_DOMAIN
    fqdn = f"{tenant.slug}.{base_domain}"
    return Response(
        {
            "slug": tenant.slug,
            "status": tenant.provisioning_status,
            "domain": fqdn,
            "stage": (tenant.wizard_state or {}).get("provisioning_stage"),
        }
    )


def _resolve_tenant_from_wizard_token(request):
    """Resolve the tenant a wizard (7-day) or signup token belongs to.

    Returns (payload, tenant, error_response); exactly one of (tenant, error)
    is None. Accepts wizard tokens and still-valid signup tokens.
    """
    from apps.accounts.tokens import verify_wizard_token

    token = request.data.get("token")
    if not token:
        return None, None, Response({"detail": _("Token required")}, status=400)
    try:
        payload = verify_wizard_token(token)
    except Exception:
        return None, None, Response({"detail": _("Invalid or expired token")}, status=400)

    from .site_name import token_tenant

    tenant = token_tenant(payload)
    if tenant is None:
        return None, None, Response({"detail": _("Tenant not found")}, status=404)
    if tenant.owner_email != payload["email"]:
        return None, None, Response({"detail": "Token does not match tenant owner."}, status=403)
    return payload, tenant, None


# A re-verify restarts provisioning only for a tenant this old that is still
# "pending" — younger ones are most likely just queued.
PROVISION_RETRY_AFTER = timedelta(minutes=2)


def _start_interview_provisioning(tenant, email, owner_name, answers=None) -> None:
    """One onboarding: the coach continues in /setup on their own subdomain,
    where the interview fills the brief. ``answers`` (an old-wizard tenant's)
    are kept on top of the defaults. A tenant that needs a plan is built once
    its trial runs (``core.signals``), not before its card."""
    from apps.core.onboarding.wizard_catalog import recommended_answers
    from apps.tenant_config.interview_brief import FIELD_BY_ID, NAMED_IN_SETUP

    # A default is never her answer: the old wizard's "classic" header settled
    # the interview's header question before it was asked.
    from .site_name import is_placeholder

    defaults = {k: v for k, v in recommended_answers("general").items() if k not in FIELD_BY_ID}
    if is_placeholder(tenant.schema_name):  # unnamed: its name and bio are asked first in /setup
        defaults[NAMED_IN_SETUP] = True
    merged = {**defaults, "goals": [], **(answers or {})}
    kept = {k: v for k, v in (tenant.wizard_state or {}).items() if k in ("locale", "site_locale")}
    wizard_state = {"version": 2, "flow": "interview", "answers": merged, **kept}
    Tenant.objects.filter(pk=tenant.pk).update(wizard_state=wizard_state, template_niche="general")
    if not tenant.is_paused:
        build_site(tenant.id, email, owner_name)


def build_site(tenant_id, email, owner_name) -> None:
    """Create the site (schema, owner, config) after this transaction commits."""
    from django.db import transaction

    from apps.core.tasks import provision_tenant

    Tenant.objects.filter(pk=tenant_id).update(template_seed_status="seeding")
    transaction.on_commit(lambda: provision_tenant.delay(tenant_id, email, owner_name, "general"))
