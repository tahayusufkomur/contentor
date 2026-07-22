"""Coach content calendar — a single coach-only feed that unifies scheduled
Live events, Blog posts and Email broadcasts for /admin/calendar.

Kept separate from the student-facing `calendar_events` (views.py): that feed is
public, live-only, and adds pricing/access info. This one is coach-gated, spans
three apps, and shows drafts/scheduled items. Each item is namespaced by source
(`"<source>-<pk>"`) so a LiveClass pk never collides with a BlogPost pk.
"""

from datetime import datetime, time

from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner

from .models import LiveClass, LiveStream, OnsiteEvent, ZoomClass

# (model, source key, human label) for the four live event types.
LIVE_SOURCES = [
    (LiveClass, "live_class", "Live class"),
    (LiveStream, "live_stream", "Live stream"),
    (ZoomClass, "zoom_class", "Zoom class"),
    (OnsiteEvent, "onsite_event", "On-site event"),
]

# EmailCampaign statuses → the calendar's display vocabulary.
EMAIL_STATUS_MAP = {
    "scheduled": "scheduled",
    "sending": "sending",
    "sent": "completed",
    "partial": "partial",
    "failed": "failed",
}


def _parse_bound(value, *, end):
    """Parse a from/to query value that may be a date or a full datetime.

    A bare date becomes start-of-day (from) or end-of-day (to) so an inclusive
    [from, to] window expressed in dates behaves the way a coach expects.
    """
    if not value:
        return None
    dt = parse_datetime(value)
    if dt is None:
        parsed_date = parse_date(value)
        if parsed_date is None:
            return None
        dt = datetime.combine(parsed_date, time.max if end else time.min)
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt)
    return dt


def _in_window(when, frm, to):
    if when is None:
        return False
    if frm and when < frm:
        return False
    return not (to and when > to)


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def coach_content_calendar(request):
    """GET /api/v1/admin/content-calendar/?from=&to=&types=live,blog,email"""
    frm = _parse_bound(request.query_params.get("from"), end=False)
    to = _parse_bound(request.query_params.get("to"), end=True)
    types_param = request.query_params.get("types", "")
    type_filter = {t.strip() for t in types_param.split(",") if t.strip()}

    def want(category):
        return not type_filter or category in type_filter

    items = []

    if want("live"):
        for model, source, label in LIVE_SOURCES:
            qs = model.objects.filter(scheduled_at__isnull=False)
            if frm:
                qs = qs.filter(scheduled_at__gte=frm)
            if to:
                qs = qs.filter(scheduled_at__lte=to)
            for obj in qs:
                items.append(
                    {
                        "id": f"{source}-{obj.id}",
                        "category": "live",
                        "source": source,
                        "title": obj.title,
                        "scheduled_at": obj.scheduled_at,
                        "status": obj.computed_status,
                        "subtitle": f"{obj.duration_minutes} min • {label}",
                        "href": "/admin/live",
                    }
                )

    if want("blog"):
        from apps.blog.models import BlogPost

        for post in BlogPost.objects.all():
            when = post.published_at or post.created_at
            if not _in_window(when, frm, to):
                continue
            tags = post.tags if isinstance(post.tags, list) else []
            items.append(
                {
                    "id": f"blog-{post.id}",
                    "category": "blog",
                    "source": "blog",
                    "title": post.title,
                    "scheduled_at": when,
                    "status": post.status,
                    "subtitle": ", ".join(str(t) for t in tags[:3]),
                    "href": "/admin/blog",
                }
            )

    if want("email"):
        from apps.email_campaigns.models import EmailCampaign

        for campaign in EmailCampaign.objects.all():
            when = campaign.scheduled_at or campaign.sent_at or campaign.created_at
            if not _in_window(when, frm, to):
                continue
            items.append(
                {
                    "id": f"email-{campaign.id}",
                    "category": "email",
                    "source": "email",
                    "title": campaign.subject,
                    "scheduled_at": when,
                    "status": EMAIL_STATUS_MAP.get(campaign.status, campaign.status),
                    "subtitle": campaign.recipient_summary or f"{campaign.recipient_count} recipients",
                    "href": f"/admin/email/campaigns/{campaign.id}",
                }
            )

    items.sort(key=lambda item: item["scheduled_at"])
    return Response(items)
