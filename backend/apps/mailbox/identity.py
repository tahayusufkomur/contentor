from django.conf import settings

from apps.domains.models import CustomDomain, PlatformMailboxAddress


def sending_identity(tenant) -> tuple[str, bool]:
    """Return (from_email, can_receive) for a tenant's mailbox.

    Three tiers: a live, mailbox-enabled custom domain sends from its chosen
    local part; otherwise a paid coach's platform address (`<x>@PLATFORM_MAIL_
    DOMAIN`) applies; everyone else sends from the platform no-reply and
    cannot receive. CustomDomain and PlatformMailboxAddress live in the public
    schema, so this is safe to call from inside a tenant request.
    """
    cd = (
        CustomDomain.objects.filter(
            tenant=tenant, provisioning_status="live", mailbox_enabled=True
        )
        .order_by("-is_primary", "id")
        .first()
    )
    if cd:
        return f"{cd.mailbox_local_part}@{cd.domain}", True
    pa = platform_address(tenant)
    if pa:
        return pa, True
    return settings.RESEND_FROM_EMAIL, False


def platform_address(tenant) -> str | None:
    """The tenant's `<x>@PLATFORM_MAIL_DOMAIN` address, if it currently resolves.

    Requires the feature domain to be configured, a claimed registry row, and
    a paid platform plan — a lapsed subscription keeps the row reserved but
    the address stops resolving.
    """
    domain = settings.PLATFORM_MAIL_DOMAIN
    if not domain:
        return None
    row = PlatformMailboxAddress.objects.filter(tenant=tenant).first()
    if not row or not tenant.has_paid_platform_plan:
        return None
    return f"{row.local_part}@{domain}"


def resolve_platform_recipient(to_email: str):
    """Map an inbound recipient on the platform mail domain to its Tenant.

    Returns None when the feature is off, the domain doesn't match, the local
    part is unclaimed, or the owning tenant is no longer on a paid plan.
    Plus-addressing (`x+tag@`) folds onto the base local part.
    """
    domain = settings.PLATFORM_MAIL_DOMAIN
    if not domain or not to_email.endswith("@" + domain):
        return None
    local = to_email.rsplit("@", 1)[0].split("+", 1)[0]
    row = (
        PlatformMailboxAddress.objects.select_related("tenant")
        .filter(local_part=local)
        .first()
    )
    if not row or not row.tenant.has_paid_platform_plan:
        return None
    return row.tenant
