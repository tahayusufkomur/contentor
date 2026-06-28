from django.db import connection
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.accounts.models import User
from apps.accounts.tokens import create_jwt

DEMO_STUDENT_EMAIL = "demo-student@contentor.app"
DEMO_COACH_EMAIL = "demo-coach@contentor.app"

ROLE_REDIRECTS = {
    "student": "/",
    "coach": "/admin",
}


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def demo_enter(request):
    """Issue a short-lived JWT for the demo's synthetic student or coach user.

    Used by the marketing site's /demo/[niche] entry route and by the in-app
    role toggle (student ↔ coach). The endpoint is exempt from
    DemoReadOnlyMiddleware so it can be called on demo tenants.
    """
    tenant = connection.tenant
    if not getattr(tenant, "is_demo", False):
        return Response({"detail": "not_a_demo_tenant"}, status=status.HTTP_404_NOT_FOUND)

    role = (request.data.get("as") or request.query_params.get("as") or "student").lower()
    if role not in ROLE_REDIRECTS:
        return Response({"detail": "invalid_role"}, status=status.HTTP_400_BAD_REQUEST)

    email = DEMO_COACH_EMAIL if role == "coach" else DEMO_STUDENT_EMAIL
    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        return Response({"detail": "demo_user_not_seeded"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    token = create_jwt(user, tenant)
    slug = tenant.slug or ""
    niche = slug[len("demo-") :] if slug.startswith("demo-") else slug

    return Response(
        {
            "token": token,
            "role": role,
            "niche": niche,
            "tenant_name": tenant.name,
            "redirect": ROLE_REDIRECTS[role],
        }
    )
