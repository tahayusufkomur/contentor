"""Coach endpoints for AI-built sections (/api/v1/admin/cx/…). Thin: the
service in compose.py owns gating, metering and every failure mode."""

from django.db import connection
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner

from . import compose


def _body(request):
    return request.data if isinstance(request.data, dict) else {}


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def cx_compose(request):
    data = _body(request)
    return Response(compose.compose(connection.tenant, data.get("prompt"), str(data.get("page") or "home")))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def cx_refine(request):
    data = _body(request)
    return Response(compose.refine(connection.tenant, data.get("block"), data.get("instruction")))


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def cx_components(request):
    return Response(compose.my_components(connection.tenant))
