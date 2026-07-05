"""User-scoped endpoints (for authenticated users who are not superusers).

Exposes data filtered to the requesting user. Distinct from `platform.views`,
which is locked to superusers managing the whole platform.
"""

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import Tenant


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
                "is_published": tenant.is_published,
                "has_preview_password": bool(tenant.preview_password),
                "provisioning_status": tenant.provisioning_status,
                "plan_name": tenant.plan.name if tenant.plan else None,
                "domain": domain_name,
                "studio_url": _build_tenant_url(tenant),
                "created_at": tenant.created_at.isoformat(),
            }
        )
    return Response(data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_my_tenant(request, slug):
    """Let a coach manage their own tenant's publish gate.

    Editable: ``is_published`` (go live / hide) and ``preview_password`` (the
    password that unlocks the site while unpublished). Ownership is enforced by
    matching the tenant's ``owner_email`` to the requester.
    """
    email = (request.user.email or "").lower()
    try:
        tenant = Tenant.objects.exclude(schema_name="public").get(slug=slug, owner_email__iexact=email)
    except Tenant.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    updated = []
    if "is_published" in request.data:
        want_published = bool(request.data["is_published"])
        # Hard publish gate: a coach can only go live once the mandatory setup
        # requirements are met (decision 2026-07-05). Computed in the tenant's
        # own schema, where the config + content live.
        if want_published:
            from django_tenants.utils import tenant_context

            from apps.tenant_config.models import TenantConfig
            from apps.tenant_config.setup_items import publish_blockers

            with tenant_context(tenant):
                config = TenantConfig.objects.first()
                blockers = publish_blockers(config, tenant) if config else []
            if blockers:
                return Response(
                    {"detail": "publish_requirements_unmet", "blockers": blockers},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        tenant.is_published = want_published
        updated.append("is_published")
    if "preview_password" in request.data:
        password = request.data["preview_password"]
        tenant.preview_password = "" if password is None else str(password)[:128]
        updated.append("preview_password")

    if updated:
        tenant.save(update_fields=updated)

    return Response(
        {
            "slug": tenant.slug,
            "is_published": tenant.is_published,
            "has_preview_password": bool(tenant.preview_password),
        }
    )
