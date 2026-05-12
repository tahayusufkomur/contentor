"""User-scoped endpoints (for authenticated users who are not superusers).

Exposes data filtered to the requesting user. Distinct from `views_platform`,
which is locked to superusers managing the whole platform.
"""

from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Tenant


def _build_tenant_url(tenant: Tenant) -> str:
    """Return the canonical https URL for a tenant's studio."""
    base = settings.CONTENTOR_DOMAIN
    host = f"{tenant.slug}.tr.{base}" if tenant.region == "tr" else f"{tenant.slug}.{base}"
    scheme = "http" if "localhost" in base else "https"
    return f"{scheme}://{host}"


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_tenants(request):
    """Return tenants where the current user is the owner (by email)."""
    email = (request.user.email or "").lower()
    if not email:
        return Response([])

    tenants = (
        Tenant.objects.exclude(schema_name="public")
        .filter(owner_email__iexact=email)
        .select_related("plan")
        .order_by("-created_at")
    )

    data = []
    for tenant in tenants:
        primary_domain = tenant.domains.filter(is_primary=True).first()
        domain_name = primary_domain.domain if primary_domain else ""
        data.append(
            {
                "id": tenant.id,
                "name": tenant.name,
                "slug": tenant.slug,
                "region": tenant.region,
                "is_active": tenant.is_active,
                "provisioning_status": tenant.provisioning_status,
                "plan_name": tenant.plan.name if tenant.plan else None,
                "domain": domain_name,
                "studio_url": _build_tenant_url(tenant),
                "created_at": tenant.created_at.isoformat(),
            }
        )
    return Response(data)
