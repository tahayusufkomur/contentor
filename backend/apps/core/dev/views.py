from django.conf import settings
from django.http import Http404
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core.models import DevOutboundEmail


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def latest_email(request):
    if not getattr(settings, "EMAIL_SINK_ENABLED", False):
        raise Http404
    to = request.query_params.get("to", "").strip()
    row = DevOutboundEmail.objects.filter(to__iexact=to).first() if to else None
    if not row:
        raise Http404
    return Response(
        {"to": row.to, "subject": row.subject, "html": row.html, "created_at": row.created_at}
    )
