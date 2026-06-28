from __future__ import annotations

from typing import TYPE_CHECKING

from apps.accounts.models import User

if TYPE_CHECKING:
    from django.db.models import QuerySet


def _load_content(content_type: str | None, content_id):
    """Resolve a (type, id) pair to a content instance, or None."""
    if not content_type or not content_id:
        return None
    if content_type == "course":
        from apps.courses.models import Course

        return Course.objects.filter(pk=content_id).first()
    if content_type == "bundle":
        from apps.billing.models import Bundle

        return Bundle.objects.filter(pk=content_id).first()
    return None


def resolve_audience(filters: dict) -> QuerySet[User]:
    """Students matching the filter dict. See plan/spec for filter keys."""
    filters = filters or {}
    qs = User.objects.filter(role="student")

    app_type = filters.get("app_type")
    if app_type in ("pwa", "browser"):
        qs = qs.filter(last_display_mode=app_type)

    platform = filters.get("platform")
    if platform:
        if isinstance(platform, str):
            platform = [platform]
        qs = qs.filter(last_platform__in=platform)

    if filters.get("push_enabled") is True:
        qs = qs.filter(push_subscriptions__isnull=False).distinct()

    content = _load_content(filters.get("content_type"), filters.get("content_id"))
    if content is not None:
        from apps.core.access import ContentAccessService

        service = ContentAccessService()
        eligible = [u.pk for u in qs if service.check_access(u, content)]
        qs = User.objects.filter(pk__in=eligible)

    return qs


def audience_counts(filters: dict) -> dict:
    qs = resolve_audience(filters)
    audience = qs.count()
    push_reachable = qs.filter(push_subscriptions__isnull=False).distinct().count()
    return {"audience": audience, "push_reachable": push_reachable}
