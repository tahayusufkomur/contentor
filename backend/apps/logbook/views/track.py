# backend/apps/logbook/views/track.py
"""Public page-view beacon. Auth is optional: TenantJWTAuthentication resolves
the cookie when present (invalid tokens fall back to anonymous by returning
None). Throttled per REAL client IP — DRF's default ident would be Caddy's
address for every anonymous visitor behind the proxy."""

from __future__ import annotations

import json
import logging

from django.conf import settings
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from apps.accounts.authentication import TenantJWTAuthentication

from ..activity import client_ip, redact_path

logger = logging.getLogger("apps.logbook.activity")


class PageViewThrottle(SimpleRateThrottle):
    scope = "logbook_pageview"

    def get_rate(self):
        return getattr(settings, "LOGBOOK_PAGEVIEW_RATE", "60/min")

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": client_ip(request) or "unknown"}


class PageViewTrackView(APIView):
    authentication_classes = [TenantJWTAuthentication]
    permission_classes = [AllowAny]
    throttle_classes = [PageViewThrottle]

    def post(self, request):
        from django.db import connection

        data = request.data if isinstance(request.data, dict) else {}
        path = str(data.get("path") or "")
        if not path.startswith("/"):
            return Response({"detail": "path must start with /"}, status=400)
        user = getattr(request, "user", None)
        tenant = getattr(connection, "tenant", None)
        payload = {
            "kind": "pageview",
            "tenant": getattr(tenant, "schema_name", "") or "",
            "user": user.email if getattr(user, "is_authenticated", False) else "",
            "ip": client_ip(request),
            "session_id": request.headers.get("X-Session-Id", "")[:36],
            "method": "",
            "path": redact_path(path),
            "status": None,
            "duration_ms": None,
            "referrer": redact_path(str(data.get("referrer") or ""))[:512],
            "user_agent": request.META.get("HTTP_USER_AGENT", "")[:256],
        }
        logger.info(json.dumps(payload, ensure_ascii=False))
        return Response(status=202)
