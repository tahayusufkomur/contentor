from django.conf import settings
from django.db import connection
from django.http import JsonResponse

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})

# Endpoints that must remain reachable on demo tenants so visitors can enter
# the demo and switch roles. Everything else mutating gets a 403.
DEMO_EXEMPT_PATH_PREFIXES = (
    "/api/v1/demo/",
    "/api/health/",
    # The public contact form must work on demo tenants; the view itself
    # no-ops the email send when the tenant is a demo.
    "/api/v1/contact/",
)


class DemoReadOnlyMiddleware:
    """Rejects mutating requests on tenants with ``is_demo=True``.

    Runs after ``HeaderAwareTenantMiddleware`` so ``connection.tenant`` is set.
    Public schema requests are untouched (their tenant is the platform row,
    which is never a demo).
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        tenant = getattr(connection, "tenant", None)
        if (
            getattr(settings, "DEMO_READONLY_ENABLED", True)
            and tenant is not None
            and getattr(tenant, "is_demo", False)
            and request.method not in SAFE_METHODS
            and not any(request.path.startswith(p) for p in DEMO_EXEMPT_PATH_PREFIXES)
        ):
            slug = tenant.slug or ""
            niche = slug[len("demo-") :] if slug.startswith("demo-") else slug
            return JsonResponse(
                {
                    "detail": "demo_readonly",
                    "message": "This is a read-only demo — sign up to keep your changes.",
                    "niche": niche,
                    "tenant_name": tenant.name,
                },
                status=403,
            )
        return self.get_response(request)
