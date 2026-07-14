"""Drop-off recovery for the pre-provision onboarding wizard.

A coach who verified email but abandoned the wizard gets ONE automated
nudge (hourly beat task, Task 3) with a freshly-minted 7-day wizard token —
their answers are already server-side, so the link resumes exactly where
they left off. The same email can be re-requested from the expired-token
resume screen via the wizard_recover view (Task 5).

Every email goes to tenant.owner_email and nowhere else. The email strings
are tenant-facing content, not UI chrome — same convention as the signup
verification email in views.py. TR needs native review.
"""

import logging
from datetime import datetime, timedelta

from django.conf import settings
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core import ipblock
from apps.core.throttling import WizardRecoverThrottle

logger = logging.getLogger(__name__)

# Manual re-sends (resume screen) are allowed at most once per hour per
# tenant — the per-IP throttle alone would let a third party replay an old
# token to spam the OWNER's inbox from many IPs.
RESEND_COOLDOWN = timedelta(hours=1)

# TR: needs native review.
_COPY = {
    "en": {
        "subject": "Pick up where you left off — {brand}",
        "heading": "Your platform is waiting",
        "intro": (
            "You started setting up <strong>{brand}</strong> — every choice you made is saved. "
            "Click below to continue right where you left off."
        ),
        "button": "Continue my setup",
        "expires": "This link is valid for {days} days.",
        "copy_label": "Or copy:",
    },
    "tr": {
        "subject": "Kaldığınız yerden devam edin — {brand}",
        "heading": "Platformunuz sizi bekliyor",
        "intro": (
            "<strong>{brand}</strong> platformunu kurmaya başlamıştınız — yaptığınız her seçim kayıtlı. "
            "Kaldığınız yerden devam etmek için aşağıdaki düğmeye tıklayın."
        ),
        "button": "Kuruluma devam et",
        "expires": "Bu bağlantı {days} gün geçerlidir.",
        "copy_label": "Veya kopyalayın:",
    },
}


def _last_activity(tenant):
    """Most recent wizard step save, falling back to signup time."""
    stamps = (tenant.wizard_state or {}).get("step_timestamps") or {}
    latest = tenant.created_at
    for value in stamps.values():
        try:
            parsed = datetime.fromisoformat(value)
        except (TypeError, ValueError):
            continue
        if parsed > latest:
            latest = parsed
    return latest


def recovery_candidates(now=None):
    """Tenants worth one automated nudge: mid-wizard, idle, never nudged.

    SQL prefilters on the cheap columns; the idle check refines in Python
    against step_timestamps (a handful of rows/day — never a hot path).
    """
    from apps.core.models import Tenant

    now = now or timezone.now()
    idle_cutoff = now - timedelta(hours=settings.WIZARD_RECOVERY_IDLE_HOURS)
    oldest = now - timedelta(days=settings.WIZARD_RECOVERY_MAX_AGE_DAYS)

    prefiltered = (
        Tenant.objects.filter(
            provisioning_status="pending",
            template_seed_status="pending",
            recovery_email_sent_at__isnull=True,
            is_demo=False,
            created_at__gte=oldest,
            created_at__lt=idle_cutoff,
        )
        .exclude(schema_name="public")
        .order_by("created_at")
    )
    return [t for t in prefiltered if _last_activity(t) < idle_cutoff]


def send_recovery_email(tenant) -> bool:
    """Mint a fresh wizard token and email the resume link to the owner.

    Stamps recovery_email_sent_at only when the send succeeded, so a failed
    provider call is retried by the next beat run.
    """
    from apps.accounts.models import User
    from apps.accounts.tokens import create_wizard_token
    from apps.core.email import send_email

    # The wizard resolver looks tenants up by slugified token brand_name —
    # a superadmin rename would mint a link that resolves to nothing (or,
    # worse, to a different tenant). Refuse instead of sending a dead link.
    if slugify(tenant.name)[:63] != tenant.slug:
        logger.warning("wizard recovery: name/slug drift for %s, skipping", tenant.slug)
        return False

    region = tenant.region or "global"
    user = User.objects.filter(email=tenant.owner_email, region=region).first()
    token = create_wizard_token(tenant.owner_email, user.name if user else "", tenant.name, region=region)

    base = settings.CONTENTOR_DOMAIN
    host = f"tr.{base}" if region == "tr" else base
    link = f"{settings.SITE_SCHEME}://{host}/signup/verify?token={token}"

    strings = _COPY["tr" if region == "tr" else "en"]
    brand = tenant.name
    days = settings.WIZARD_TOKEN_EXPIRY_DAYS
    sent = send_email(
        to=tenant.owner_email,
        subject=strings["subject"].format(brand=brand),
        html=f"""
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
            <h2 style="color: #1a1a2e;">{strings["heading"]}</h2>
            <p style="color: #444;">{strings["intro"].format(brand=brand)}</p>
            <a href="{link}"
               style="display: inline-block; background: #171717; color: white; padding: 12px 32px;
                      border-radius: 6px; text-decoration: none; font-weight: 600; margin: 24px 0;">
                {strings["button"]}
            </a>
            <p style="color: #888; font-size: 13px;">{strings["expires"].format(days=days)}</p>
            <p style="color: #aaa; font-size: 12px; margin-top: 32px;">
                {strings["copy_label"]} <span style="word-break: break-all;">{link}</span>
            </p>
        </div>
        """,
    )
    if sent:
        tenant.recovery_email_sent_at = timezone.now()
        tenant.save(update_fields=["recovery_email_sent_at"])
        logger.info("wizard recovery email sent slug=%s", tenant.slug)
    else:
        logger.error("wizard recovery email FAILED slug=%s (link withheld from logs)", tenant.slug)
    return sent


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([WizardRecoverThrottle])
def wizard_recover(request):
    """Resume screen: re-send a fresh wizard link to the tenant owner.

    Accepts EXPIRED (but signature-valid) wizard/signup tokens — that's the
    whole point: the 7-day link died, the answers didn't. The email always
    goes to tenant.owner_email; the caller never chooses the address.
    """
    if (denied := ipblock.blocked_response(request)) is not None:
        return denied

    from apps.accounts.tokens import decode_wizard_token_allow_expired
    from apps.core.i18n_helpers import msg
    from apps.core.models import Tenant

    token = request.data.get("token")
    if not token:
        return Response({"detail": msg(request, "token_required")}, status=400)
    try:
        payload = decode_wizard_token_allow_expired(token)
    except Exception:
        return Response({"detail": msg(request, "token_invalid_or_expired")}, status=400)

    region = payload.get("region", "global")
    slug = slugify(payload.get("brand_name") or "")[:63]
    if not slug:
        return Response({"detail": msg(request, "token_invalid_or_expired")}, status=400)
    try:
        tenant = Tenant.objects.get(slug=slug, region=region)
    except Tenant.DoesNotExist:
        return Response({"detail": msg(request, "tenant_not_found")}, status=404)
    if tenant.owner_email != payload.get("email"):
        return Response({"detail": "Token does not match tenant owner."}, status=403)
    if tenant.provisioning_status != "pending" or tenant.template_seed_status != "pending":
        return Response({"detail": "wizard_closed"}, status=409)

    if tenant.recovery_email_sent_at and timezone.now() - tenant.recovery_email_sent_at < RESEND_COOLDOWN:
        return Response({"detail": "sent"})  # cooldown: idempotent from the UI's view

    send_recovery_email(tenant)
    # Deliberately "sent" even when the provider errored — no send-failure
    # oracle for probers; failures are logged server-side.
    return Response({"detail": "sent"})
