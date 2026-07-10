"""Shared throttle classes for the AI endpoints, keyed on the real client IP
(CF-Connecting-IP aware) rather than REMOTE_ADDR — behind the Cloudflare
tunnel every anonymous requester otherwise shares one rate bucket."""

from rest_framework.throttling import AnonRateThrottle

from apps.core.net import client_ip


class ClientIpAnonThrottle(AnonRateThrottle):
    """AnonRateThrottle keyed on the REAL client IP (CF-Connecting-IP aware).
    Behind the tunnel every request shares REMOTE_ADDR — without this, all
    anonymous users share one rate bucket."""

    def get_ident(self, request):
        return client_ip(request) or super().get_ident(request)


class AiThreadThrottle(ClientIpAnonThrottle):
    scope = "ai_thread"


class AiHumanMessageThrottle(ClientIpAnonThrottle):
    scope = "ai_human_message"


class AiHumanRequestThrottle(ClientIpAnonThrottle):
    scope = "ai_human_request"
