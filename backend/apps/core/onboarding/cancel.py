"""Coach-initiated deletion of a platform (tenant): cancelling an unfinished
onboarding, or removing a platform that was never paid for.

Destructive and irreversible, so the eligibility rules live here once and both
entry points (apex dashboard ``DELETE /me/tenants/<slug>/`` and the in-setup
``POST /admin/setup-flow/cancel/``) call :func:`delete_platform`. The nightly
abandoned-signup cleanup (``recovery.find_abandoned_tenants``) stays separate.
"""

import logging

from django.conf import settings

logger = logging.getLogger(__name__)

# "provisioning" is the Celery task creating the schema; dropping underneath it
# races. It ends in ready/failed within minutes — unless the worker died, so a
# row stuck this long is deletable (otherwise the coach could never get out).
STUCK_PROVISIONING_AFTER_MINUTES = 30


class CancelBlockedError(Exception):
    """The platform cannot be deleted by the coach; ``code`` says why."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def check_deletable(tenant) -> None:
    """Raise :class:`CancelBlockedError` unless the coach may delete this platform."""
    from datetime import timedelta

    from django.utils import timezone

    if tenant.schema_name == "public":
        raise CancelBlockedError("not_deletable")
    # Any live paid plan — the coach must cancel the subscription first.
    if tenant.has_paid_platform_plan:
        raise CancelBlockedError("paid_plan")
    # A connected Stripe account may hold balances, payouts or student payments.
    if tenant.stripe_account_id:
        raise CancelBlockedError("payments_connected")
    # Registered/connected domains are a paid add-on with their own lifecycle.
    if tenant.custom_domains.exists():
        raise CancelBlockedError("custom_domain")
    if tenant.provisioning_status == "provisioning":
        stuck = timezone.now() - tenant.created_at > timedelta(minutes=STUCK_PROVISIONING_AFTER_MINUTES)
        if not stuck:
            raise CancelBlockedError("provisioning")


def deletion_blocker(tenant) -> str | None:
    """The :class:`CancelBlockedError` code that stops a delete, or None if allowed
    (lets the dashboard show or disable its Delete button)."""
    try:
        check_deletable(tenant)
    except CancelBlockedError as exc:
        return exc.code
    return None


def purge_tenant_media(slug: str) -> int:
    """Best-effort delete of everything under ``tenants/<slug>/`` in the bucket.

    Never raises: the platform is already gone, a storage hiccup only leaves
    orphaned files (logged for follow-up). Returns the number of objects removed.
    """
    bucket = getattr(settings, "AWS_BUCKET_NAME", "")
    if not bucket:
        return 0
    removed = 0
    try:
        from apps.core.storage import get_s3_client

        client = get_s3_client()
        for page in client.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=f"tenants/{slug}/"):
            keys = [{"Key": obj["Key"]} for obj in page.get("Contents", [])]
            if keys:
                client.delete_objects(Bucket=bucket, Delete={"Objects": keys, "Quiet": True})
                removed += len(keys)
    except Exception:  # noqa: BLE001 — see docstring
        logger.exception("platform delete: media purge failed slug=%s", slug)
    return removed


def delete_platform(tenant) -> None:
    """Delete a coach's platform: its schema, public rows and stored media."""
    from django.db import connection, transaction

    from apps.core.models import PlatformSubscription

    check_deletable(tenant)
    # django-tenants only drops from the public (or the tenant's own) schema, and
    # a request on the tenant's host has that very schema active — leave it first.
    connection.set_schema_to_public()
    from apps.core.storage import storage_folder

    slug, owner, folder = tenant.slug, tenant.owner_email, storage_folder(tenant)
    with transaction.atomic():  # DROP SCHEMA is transactional: a failure keeps the subscription row too
        # A (cancelled/free) subscription is referenced by Payment rows that live in the
        # tenant's schema, which the ORM cascade cannot reach from public ("relation
        # billing_payment does not exist") — they go with the schema, so skip the collector.
        PlatformSubscription.objects.filter(tenant=tenant)._raw_delete(PlatformSubscription.objects.db)
        tenant.delete(force_drop=True)  # drops the schema iff it exists, then the row (+ cascades)
    purge_tenant_media(folder)
    logger.info("platform deleted by owner slug=%s owner=%s", slug, owner)
