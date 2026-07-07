"""Superadmin cross-tenant community rollup.

Iterates tenant schemas like `apps.core.platform.views.platform_usage` — fine
at current fleet size; a broken schema is skipped, never 500s the dashboard.
"""

import logging

from django_tenants.utils import tenant_context
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.models import Tenant
from apps.core.permissions import IsSuperUser

logger = logging.getLogger(__name__)


@api_view(["GET"])
@permission_classes([IsSuperUser])
def community_reports_rollup(request):
    from .models import CommunityMember, CommunitySettings, Post, PostStatus, Report

    total_open = 0
    total_pending = 0
    by_tenant = []
    for tenant in Tenant.objects.exclude(schema_name="public").filter(is_active=True):
        try:
            with tenant_context(tenant):
                enabled = CommunitySettings.load().is_enabled
                open_reports = Report.objects.filter(status="open").count()
                pending_posts = Post.objects.filter(status=PostStatus.PENDING).count()
                members = CommunityMember.objects.count()
        except Exception:  # noqa: BLE001 — a broken schema must not take down the page
            logger.warning("community rollup: skipping tenant %s", tenant.slug, exc_info=True)
            continue
        total_open += open_reports
        total_pending += pending_posts
        if enabled or open_reports or pending_posts:
            by_tenant.append(
                {
                    "tenant": tenant.name,
                    "slug": tenant.slug,
                    "enabled": enabled,
                    "open_reports": open_reports,
                    "pending_posts": pending_posts,
                    "members": members,
                }
            )
    by_tenant.sort(key=lambda row: row["open_reports"], reverse=True)
    return Response(
        {
            "total_open_reports": total_open,
            "total_pending_posts": total_pending,
            "by_tenant": by_tenant,
        }
    )
