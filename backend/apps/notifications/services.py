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
