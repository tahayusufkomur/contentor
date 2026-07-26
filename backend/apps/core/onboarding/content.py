"""Wizard content-creation endpoints.

The coach builds their first course/event/blog post *during* signup, before any
JWT exists — so these are public-schema onboarding views authenticated by the
wizard token in the request BODY (project rule: @authentication_classes([])),
which then enter the tenant schema and write real rows as the owner user.

Nothing written here is registered as seeded: it is the coach's own content and
must satisfy the publish gate's _has_own check (apps/tenant_config/setup_items).
Plan: docs/superpowers/plans/2026-07-26-wizard-content-apis.md
"""

from django_tenants.utils import tenant_context
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .wizard import _resolve_tenant_from_wizard_token

READY_STATUSES = ("provisioned", "ready")


def _owner():
    """The tenant's owner user. Must be called inside tenant_context — the
    wizard has no request.user, so every row is authored as the owner."""
    from apps.accounts.models import User

    return User.objects.filter(role="owner").order_by("id").first()


def _brief(tenant):
    from apps.core.constants import REGION_DEFAULT_LOCALE
    from apps.core.onboarding import ai_curate

    locale = REGION_DEFAULT_LOCALE.get(tenant.region or "global", "en")
    return ai_curate.CoachBrief.from_tenant(tenant, locale=locale)


def _wizard_content_setup(request):
    """(tenant, owner, err). err is a Response when the token is bad or the
    schema isn't provisioned yet; exactly one of (owner, err) is truthy.

    A 409 'provisioning' is the signal for the frontend to keep polling — the
    schema simply does not exist yet, so no row can be written.
    """
    _payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err:
        return None, None, err
    if tenant.provisioning_status not in READY_STATUSES:
        return None, None, Response({"detail": "provisioning"}, status=409)
    with tenant_context(tenant):
        owner = _owner()
    if owner is None:
        return None, None, Response({"detail": "owner_missing"}, status=409)
    return tenant, owner, None


def _content_payload(request, *, drop=("token",)):
    return {k: v for k, v in request.data.items() if k not in drop}


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_create_course(request):
    """The coach's first course. Published on create: the publish gate counts
    only published courses, so a draft here would gate them out of going live."""
    from apps.courses.serializers import CourseCreateUpdateSerializer

    tenant, owner, err = _wizard_content_setup(request)
    if err:
        return err
    with tenant_context(tenant):
        serializer = CourseCreateUpdateSerializer(data=_content_payload(request))
        serializer.is_valid(raise_exception=True)
        course = serializer.save(instructor=owner, is_published=True)
        return Response({"id": course.id, "slug": course.slug}, status=201)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_course_outlines(request):
    from .course_outlines import generate_course_outlines

    tenant, _owner_user, err = _wizard_content_setup(request)
    if err:
        return err
    outlines = generate_course_outlines(_brief(tenant), tenant.schema_name)
    return Response({"outlines": outlines})
