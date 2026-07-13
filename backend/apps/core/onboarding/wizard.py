"""Pre-provision onboarding wizard endpoints.

Auth model: the wizard token (or a still-valid signup token) travels in the
request BODY, like every other onboarding endpoint — no JWT exists yet.
Public views MUST keep @authentication_classes([]) (project rule).
"""

import logging

from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from . import wizard_catalog

logger = logging.getLogger(__name__)


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_catalog_view(request):
    """Option sets for the wizard UI. Public + cacheable: ids only, no PII."""
    return Response(wizard_catalog.catalog_payload())
