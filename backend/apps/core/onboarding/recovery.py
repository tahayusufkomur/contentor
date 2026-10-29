"""Drop-off recovery for onboarding.

A coach who verified email but stalled (the old wizard, or the /setup
interview) gets ONE automated nudge (hourly beat task) with a freshly-minted
7-day wizard token —
their answers are already server-side, so the link resumes exactly where
they left off. The same email can be re-requested from the expired-token
resume screen via the wizard_recover view (Task 5).

Every email goes to tenant.owner_email and nowhere else, in the creator's
language (wizard_state["locale"]), with that language's address prefix.
"""

import logging
from datetime import datetime, timedelta

from django.conf import settings
from django.db.models import Q
from django.utils import timezone, translation
from django.utils.translation import gettext as _
from django.utils.translation import ngettext
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core import ipblock, languages
from apps.core.throttling import WizardRecoverThrottle

logger = logging.getLogger(__name__)

# Manual re-sends (resume screen) are allowed at most once per hour per
# tenant — the per-IP throttle alone would let a third party replay an old
# token to spam the OWNER's inbox from many IPs.
RESEND_COOLDOWN = timedelta(hours=1)


def _last_activity(tenant):
    """Most recent wizard step save or interview turn, falling back to signup time."""
    state = tenant.wizard_state or {}
    stamps = list((state.get("step_timestamps") or {}).values())
    if state.get("interview_last_at"):
        stamps.append(state["interview_last_at"])
    latest = tenant.created_at
    for value in stamps:
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
            Q(provisioning_status="pending", template_seed_status="pending")
            | Q(provisioning_status="ready", wizard_state__flow="interview", is_published=False),
            recovery_email_sent_at__isnull=True,
            created_at__gte=oldest,
            created_at__lt=idle_cutoff,
        )
        .exclude(schema_name="public")
        .order_by("created_at")
    )
    return [t for t in prefiltered if _last_activity(t) < idle_cutoff]


def find_abandoned_tenants(now=None):
    """Two-stage abandoned-signup selection.

    Returns (to_warn, to_delete):
      * to_warn   — idle >= WIZARD_ABANDON_WARN_DAYS, not yet warned.
      * to_delete — warned >= WIZARD_ABANDON_DELETE_GRACE_DAYS ago.

    Only ever considers reclaimable tenants: not the public row, not published,
    not paying, and provisioning_status in {pending, provisioned, failed} — or
    'ready' for an unfinished /setup interview (never in-flight 'provisioning').
    Idleness uses _last_activity (latest wizard step or interview activity,
    else created_at); a tenant active since its warning is not deleted.
    """
    from apps.core.models import Tenant

    now = now or timezone.now()
    warn_cutoff = now - timedelta(days=settings.WIZARD_ABANDON_WARN_DAYS)
    grace_cutoff = now - timedelta(days=settings.WIZARD_ABANDON_DELETE_GRACE_DAYS)

    reclaimable = Tenant.objects.exclude(schema_name="public").filter(
        Q(provisioning_status__in=("pending", "provisioned", "failed"))
        | Q(provisioning_status="ready", wizard_state__flow="interview"),
        is_published=False,
    )

    # A paying coach is never reclaimed, whatever their setup state.
    to_warn = [
        t
        for t in reclaimable.filter(abandon_warned_at__isnull=True)
        if _last_activity(t) < warn_cutoff and not t.has_paid_platform_plan
    ]
    # Deleted only if nothing happened since the warning: a coach who came
    # back (any setup activity stamps interview_last_at) is safe.
    to_delete = [
        t
        for t in reclaimable.filter(abandon_warned_at__isnull=False)
        if t.abandon_warned_at < grace_cutoff
        and _last_activity(t) <= t.abandon_warned_at
        and not t.has_paid_platform_plan
    ]
    return to_warn, to_delete


def brand_of(tenant) -> str:
    """What the emails call the site: its name, once it has one."""
    from .site_name import is_placeholder

    return _("your site") if is_placeholder(tenant.slug) else tenant.name


def _resume_link(tenant) -> tuple[str, str]:
    """A fresh wizard link for the owner, and the creator's language it is sent in.
    Older tenants have no wizard_state locale: the owner's own language then."""
    from apps.accounts.models import User
    from apps.accounts.tokens import create_wizard_token

    region = tenant.region or "global"
    user = User.objects.filter(email=tenant.owner_email, region=region).first()
    token = create_wizard_token(tenant.owner_email, user.name if user else "", tenant.schema_name, region=region)
    locale = languages.resolve((tenant.wizard_state or {}).get("locale") or getattr(user, "preferred_locale", ""))
    path = languages.locale_href("/signup/verify", locale)
    return f"{settings.SITE_SCHEME}://{settings.CONTENTOR_DOMAIN}{path}?token={token}", locale


def _valid_for(days: int) -> str:
    return ngettext("This link is valid for %(days)d day.", "This link is valid for %(days)d days.", days) % {
        "days": days
    }


def send_abandon_warning(tenant, now=None) -> bool:
    """Final 'about to be deleted' nudge with a resume link.

    Stamps abandon_warned_at only on a successful send, so a provider failure
    is retried by the next beat run — and, because stage 2 keys off that
    timestamp, a tenant is never deleted without having been warned first.
    """
    from apps.core.email import action_email, send_email

    link, locale = _resume_link(tenant)
    days = settings.WIZARD_TOKEN_EXPIRY_DAYS
    grace = settings.WIZARD_ABANDON_DELETE_GRACE_DAYS
    with translation.override(locale):
        brand = brand_of(tenant)
        html, text = action_email(
            heading=_("Still want to build %(brand)s?") % {"brand": brand},
            intro=ngettext(
                "You started setting up %(brand)s but never finished. "
                "We'll remove this unfinished signup in %(grace)d day to free it up. "
                "Click below to pick up exactly where you left off — nothing is lost yet.",
                "You started setting up %(brand)s but never finished. "
                "We'll remove this unfinished signup in %(grace)d days to free it up. "
                "Click below to pick up exactly where you left off — nothing is lost yet.",
                grace,
            )
            % {"brand": brand, "grace": grace},
            button=_("Resume my setup"),
            link=link,
            expires=_valid_for(days),
        )
        subject = _("Your unfinished setup will be removed — %(brand)s") % {"brand": brand}
    sent = send_email(to=tenant.owner_email, subject=subject, html=html, text=text)
    if sent:
        tenant.abandon_warned_at = now or timezone.now()
        tenant.save(update_fields=["abandon_warned_at"])
        logger.info("abandon warning sent slug=%s", tenant.slug)
    else:
        logger.error("abandon warning FAILED slug=%s (link withheld from logs)", tenant.slug)
    return sent


def send_recovery_email(tenant) -> bool:
    """Mint a fresh wizard token and email the resume link to the owner.

    Stamps recovery_email_sent_at only when the send succeeded, so a failed
    provider call is retried by the next beat run.
    """
    from apps.core.email import action_email, send_email

    link, locale = _resume_link(tenant)
    with translation.override(locale):
        brand = brand_of(tenant)
        html, text = action_email(
            heading=_("Your site is waiting"),
            intro=_(
                "You started setting up %(brand)s — every answer you gave is saved. "
                "Click below to continue right where you left off."
            )
            % {"brand": brand},
            button=_("Continue my setup"),
            link=link,
            expires=_valid_for(settings.WIZARD_TOKEN_EXPIRY_DAYS),
        )
        subject = _("Pick up where you left off — %(brand)s") % {"brand": brand}
    sent = send_email(to=tenant.owner_email, subject=subject, html=html, text=text)
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

    token = request.data.get("token")
    if not token:
        return Response({"detail": _("Token required")}, status=400)
    try:
        payload = decode_wizard_token_allow_expired(token)
    except Exception:
        return Response({"detail": _("Invalid or expired token")}, status=400)

    from .site_name import token_tenant

    if not payload.get("site") and not payload.get("brand_name"):
        return Response({"detail": _("Invalid or expired token")}, status=400)
    tenant = token_tenant(payload)
    if tenant is None:
        return Response({"detail": _("Tenant not found")}, status=404)
    if tenant.owner_email != payload.get("email"):
        return Response({"detail": "Token does not match tenant owner."}, status=403)
    in_interview = (tenant.wizard_state or {}).get("flow") == "interview" and not tenant.is_published
    if not in_interview and (tenant.provisioning_status != "pending" or tenant.template_seed_status != "pending"):
        return Response({"detail": "wizard_closed"}, status=409)

    if tenant.recovery_email_sent_at and timezone.now() - tenant.recovery_email_sent_at < RESEND_COOLDOWN:
        return Response({"detail": "sent"})  # cooldown: idempotent from the UI's view

    send_recovery_email(tenant)
    # Deliberately "sent" even when the provider errored — no send-failure
    # oracle for probers; failures are logged server-side.
    return Response({"detail": "sent"})
