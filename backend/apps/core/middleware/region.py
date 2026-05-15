"""Resolves region + tenant slug from the request host before tenant resolution."""

from apps.core.region_utils import resolve_host


class RegionResolverMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Provider webhooks (Stripe, etc.) land on the platform apex and must
        # run in the public schema with no region binding. They identify the
        # tenant via signed payload metadata, not the request host.
        if request.path.startswith("/api/webhooks/"):
            request.region = None
            request.tenant_slug = None
            request.host_locale = None
            return self.get_response(request)
        host_header = request.META.get("HTTP_X_TENANT_DOMAIN") or request.get_host()
        info = resolve_host(host_header)
        request.region = info.region
        request.tenant_slug = info.tenant_slug
        request.host_locale = info.locale
        return self.get_response(request)
