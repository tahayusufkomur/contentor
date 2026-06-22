import json
import logging
import os
import tempfile
from functools import lru_cache

from django.conf import settings
from pywebpush import WebPushException, webpush

from .models import PushSubscription

logger = logging.getLogger(__name__)

_DEAD_STATUS = {404, 410}


@lru_cache(maxsize=1)
def _vapid_key_path() -> str:
    """pywebpush needs a PEM *file path* (or base64 DER), not PEM text — so
    materialize settings.VAPID_PRIVATE_KEY to a temp file once."""
    path = os.path.join(tempfile.gettempdir(), "contentor_vapid_private.pem")
    with open(path, "w") as fh:
        fh.write(settings.VAPID_PRIVATE_KEY)
    os.chmod(path, 0o600)  # private key — owner-only
    return path


def send_to_subscription(sub: PushSubscription, payload: dict) -> bool:
    """Send a push notification to a single subscription.

    Returns True on success.  On a 404 or 410 response the subscription row is
    deleted and False is returned (dead-subscription cleanup).  Any other
    exception is logged and False is returned.
    """
    try:
        webpush(
            subscription_info={
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            },
            data=json.dumps(payload),
            vapid_private_key=_vapid_key_path(),
            vapid_claims={"sub": settings.VAPID_SUBJECT},
            ttl=3600,
        )
        return True
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        if status in _DEAD_STATUS:
            sub.delete()
        else:
            logger.warning("web push failed (%s): %s", status, exc)
        return False


def send_to_subscriptions(queryset, payload: dict) -> int:
    """Send *payload* to every subscription in *queryset*.

    Returns the count of successful deliveries.
    """
    return sum(1 for sub in list(queryset) if send_to_subscription(sub, payload))


def broadcast_to_tenant(payload: dict) -> int:
    """Send *payload* to every PushSubscription in the current tenant schema.

    Returns the count of successful deliveries.
    """
    return send_to_subscriptions(PushSubscription.objects.all(), payload)


def send_announcement_to_recipients(announcement) -> None:
    """Materialize recipients for the announcement's audience snapshot, push to
    those with subscriptions, and finalize denormalized counts + status."""
    from django.utils import timezone

    from .audience import resolve_audience
    from .models import AnnouncementRecipient
    from .payloads import announcement_payload

    audience = list(resolve_audience(announcement.filters_json))
    AnnouncementRecipient.objects.bulk_create(
        [AnnouncementRecipient(announcement=announcement, user=u) for u in audience],
        ignore_conflicts=True,
    )

    payload = announcement_payload(announcement.title, announcement.body, url=announcement.link or "/announcements")
    push_sent = 0
    for recipient in announcement.recipients.select_related("user"):
        subs = list(PushSubscription.objects.filter(user=recipient.user))
        if not subs:
            continue
        # Push to EVERY device the user has — materialize the list so a
        # short-circuiting any() can't stop at the first success and skip later
        # subscriptions (e.g. a reinstalled PWA whose stale old endpoint still 201s).
        ok = any([send_to_subscription(sub, payload) for sub in subs])
        if ok:
            recipient.push_status = "sent"
            push_sent += 1
        else:
            # dead-subscription cleanup already happened inside send_to_subscription;
            # if the row is gone the push was to an expired endpoint.
            recipient.push_status = (
                "failed" if PushSubscription.objects.filter(user=recipient.user).exists() else "expired"
            )
        recipient.save(update_fields=["push_status"])

    announcement.recipient_count = len(audience)
    announcement.push_sent_count = push_sent
    announcement.status = "sent"
    announcement.sent_at = timezone.now()
    announcement.save(update_fields=["recipient_count", "push_sent_count", "status", "sent_at"])


def subscriptions_with_access(content):
    """PushSubscriptions whose user can access *content*.

    Free content is accessible to everyone, so every subscription is returned
    without a per-user check. For paid content, each subscriber is filtered
    through ContentAccessService (direct purchase / bundle / active
    subscription) — so e.g. a live-class reminder only reaches students who can
    actually attend.
    """
    subs = PushSubscription.objects.select_related("user")
    if getattr(content, "pricing_type", "free") == "free":
        return subs

    from apps.core.access import ContentAccessService

    service = ContentAccessService()
    eligible_ids = [sub.pk for sub in subs if service.check_access(sub.user, content)]
    return PushSubscription.objects.filter(pk__in=eligible_ids)
