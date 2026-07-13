from django.db import connection
from django_tenants.middleware.main import TenantMainMiddleware


class HeaderAwareTenantMiddleware(TenantMainMiddleware):
    """
    Extends TenantMainMiddleware to also check X-Tenant-Domain header.

    Node.js fetch (undici) ignores custom Host headers, so server-side
    Next.js requests send the tenant domain via X-Tenant-Domain instead.

    Also short-circuits provider-webhook paths (/api/webhooks/*): those land
    on the platform apex with no Host-based tenant context and must run in
    the public schema (tenant is resolved from signed payload metadata).
    """

    @staticmethod
    def hostname_from_request(request):
        tenant_header = request.META.get("HTTP_X_TENANT_DOMAIN")
        if tenant_header:
            return tenant_header.split(":")[0]
        return TenantMainMiddleware.hostname_from_request(request)

    def process_request(self, request):
        if request.path.startswith("/api/webhooks/") or request.path.startswith("/api/v1/onboarding/"):
            # Force public schema and skip tenant resolution. The handler
            # resolves the tenant from event metadata, or in the request body.
            connection.set_schema_to_public()
            return None
        return super().process_request(request)
