"""User-scoped endpoints (for authenticated users who are not superusers).

Exposes data filtered to the requesting user. Distinct from `platform.views`,
which is locked to superusers managing the whole platform.
"""

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core import languages

from ..models import Tenant


def _site_language(tenant: Tenant) -> str:
    """The site's language (code). A site whose schema is not built yet has only the one picked at signup."""
    if tenant.provisioning_status not in ("provisioned", "ready"):
        return languages.resolve((tenant.wizard_state or {}).get("site_locale"))
    # ponytail: one schema switch per site; denormalize onto Tenant if a creator ever owns dozens
    return languages.site_language(tenant)


def _build_tenant_url(tenant: Tenant) -> str:
    """Return the canonical https URL for a tenant's studio."""
    base = settings.CONTENTOR_DOMAIN
    host = f"{tenant.slug}.{base}"
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
        .select_related("plan", "platform_subscription__plan")
        .order_by("-created_at")
    )

    from apps.core.onboarding.cancel import deletion_blocker

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
                "language": _site_language(tenant),
                "studio_url": _build_tenant_url(tenant),
                "created_at": tenant.created_at.isoformat(),
                # Why the coach can't delete this platform (None = they can).
                "delete_blocker": deletion_blocker(tenant),
            }
        )
    return Response(data)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def update_my_tenant(request, slug):
    """Let a coach manage their own tenant.

    PATCH — the publish gate. Editable: ``is_published`` (go live / hide) and
    ``preview_password`` (the password that unlocks the site while unpublished).

    DELETE — remove a platform that was never paid for (``{"confirm": "<slug>"}``
    required); see ``onboarding.cancel`` for what blocks it.

    Ownership is enforced by matching the tenant's ``owner_email`` to the requester.
    """
    email = (request.user.email or "").lower()
    try:
        tenant = Tenant.objects.exclude(schema_name="public").get(slug=slug, owner_email__iexact=email)
    except Tenant.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        from apps.core.onboarding.cancel import CancelBlockedError, delete_platform

        data = request.data if isinstance(request.data, dict) else {}
        if data.get("confirm") != tenant.slug:
            return Response({"detail": "confirm_required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            delete_platform(tenant)
        except CancelBlockedError as exc:
            return Response({"detail": exc.code}, status=status.HTTP_409_CONFLICT)
        return Response(status=status.HTTP_204_NO_CONTENT)

    updated = []
    if "is_published" in request.data:
        want_published = bool(request.data["is_published"])
        # Hard publish gate: a coach can only go live once the mandatory setup
        # requirements are met (decision 2026-07-05). Computed in the tenant's
        # own schema, where the config + content live.
        if want_published:
            from apps.tenant_config.setup_items import tenant_publish_blockers

            blockers = tenant_publish_blockers(tenant)
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
