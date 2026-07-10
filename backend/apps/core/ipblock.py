"""IP blocklist enforcement for the public AI endpoints."""

import logging

from django.core.cache import cache

from apps.core.net import client_ip

logger = logging.getLogger(__name__)

BLOCKLIST_CACHE_KEY = "ai-ip-blocklist"
BLOCKLIST_TTL = 60
DENIAL_KEY = "aiblock:{ip}"
DENIAL_TTL = 60 * 60 * 24


def _active_blocklist():
    blocklist = cache.get(BLOCKLIST_CACHE_KEY)
    if blocklist is None:
        from django.db.models import Q
        from django.utils import timezone

        from apps.core.models import AiIpBlock

        blocklist = set(
            AiIpBlock.objects.filter(Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())).values_list(
                "ip", flat=True
            )
        )
        cache.set(BLOCKLIST_CACHE_KEY, blocklist, timeout=BLOCKLIST_TTL)
    return blocklist


def blocked_response(request):
    """One cache hit per request; returns the 403 to short-circuit with, or
    None. Call first thing in every public AI view."""
    from rest_framework.response import Response

    ip = client_ip(request)
    if ip and ip in _active_blocklist():
        return Response({"detail": "blocked"}, status=403)
    return None


def record_throttle_denial(ip):
    """Redis counter per denied IP; trips an auto-block at the threshold."""
    from datetime import timedelta

    from django.conf import settings
    from django.utils import timezone

    if not ip:
        return
    key = DENIAL_KEY.format(ip=ip)
    cache.add(key, 0, timeout=DENIAL_TTL)
    try:
        count = cache.incr(key)
    except ValueError:
        count = 1
    if count >= settings.AI_IP_AUTOBLOCK_THRESHOLD:
        from apps.core.models import AiIpBlock

        AiIpBlock.objects.get_or_create(
            ip=ip,
            defaults={
                "reason": "auto: repeated throttle denials",
                "source": "auto",
                "expires_at": timezone.now() + timedelta(days=settings.AI_IP_AUTOBLOCK_DAYS),
            },
        )
        cache.delete(key)
        cache.delete(BLOCKLIST_CACHE_KEY)
        logger.warning("ai ipblock: auto-blocked %s", ip)
