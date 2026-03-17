from django_tenants.middleware.main import TenantMainMiddleware


class HeaderAwareTenantMiddleware(TenantMainMiddleware):
    """
    Extends TenantMainMiddleware to also check X-Tenant-Domain header.

    Node.js fetch (undici) ignores custom Host headers, so server-side
    Next.js requests send the tenant domain via X-Tenant-Domain instead.
    """

    @staticmethod
    def hostname_from_request(request):
        tenant_header = request.META.get("HTTP_X_TENANT_DOMAIN")
        if tenant_header:
            return tenant_header.split(":")[0]
        return TenantMainMiddleware.hostname_from_request(request)
