from django.conf import settings

from apps.domains.models import CustomDomain


def sending_identity(tenant) -> tuple[str, bool]:
    """Return (from_email, can_receive) for a tenant's mailbox.

    A live, mailbox-enabled custom domain sends from its chosen local part and
    can receive. Everyone else sends from the platform no-reply and cannot
    receive. CustomDomain lives in the public schema, so this is safe to call
    from inside a tenant request.
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
    return settings.RESEND_FROM_EMAIL, False
