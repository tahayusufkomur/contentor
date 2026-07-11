"""Autopilot: Celery beat sweeps tenants every 15 min; due rules atomically
claim (advance next_run_at) then spawn a per-tenant generation task — the
exact pattern of notifications.dispatch_due_recurrences."""

import logging

from celery import shared_task
from django.utils import timezone
from django_tenants.utils import get_tenant_model, tenant_context

logger = logging.getLogger(__name__)


@shared_task
def dispatch_due_blog_autopilot():
    for tenant in get_tenant_model().objects.exclude(schema_name="public"):
        with tenant_context(tenant):
            try:
                _dispatch_for_current_tenant(tenant.schema_name)
            except Exception:  # noqa: BLE001  one tenant must not break the rest
                logger.exception("blog autopilot dispatch failed for %s", tenant.schema_name)


def _dispatch_for_current_tenant(schema_name):
    from apps.notifications.recurrence import next_occurrence
    from apps.tenant_config.models import TenantConfig

    from .models import BlogAutopilot

    now = timezone.now()
    rule = BlogAutopilot.objects.filter(pk=1, is_enabled=True, next_run_at__lte=now).first()
    if rule is None:
        return
    cfg = TenantConfig.objects.first()
    new_next = next_occurrence(
        frequency=rule.frequency,
        send_time=rule.generate_time,
        weekday=rule.weekday,
        day_of_month=rule.day_of_month,
        after_utc=now,
        tz_name=(cfg.timezone if cfg else "UTC"),
        start_date=timezone.localdate(),
    )
    # Exactly-once claim: only the worker that advances next_run_at spawns.
    claimed = BlogAutopilot.objects.filter(pk=rule.pk, next_run_at=rule.next_run_at).update(next_run_at=new_next)
    if claimed:
        generate_autopilot_post.delay(schema_name)


@shared_task
def generate_autopilot_post(schema_name):
    tenant_model = get_tenant_model()
    try:
        tenant = tenant_model.objects.get(schema_name=schema_name)
    except tenant_model.DoesNotExist:
        return
    with tenant_context(tenant):
        try:
            _generate_for_current_tenant(tenant)
        except Exception:  # noqa: BLE001
            logger.exception("blog autopilot generation failed for %s", schema_name)


def _notify_coach(title, body_html):
    """Web-push to the coach/owner's own devices (never students)."""
    from apps.notifications.models import PushSubscription
    from apps.notifications.payloads import announcement_payload
    from apps.notifications.services import send_to_subscriptions

    subs = PushSubscription.objects.filter(user__role__in=("coach", "owner"))
    send_to_subscriptions(subs, announcement_payload(title, body_html, url="/admin/blog"))


def _generate_for_current_tenant(tenant):
    from apps.media.models import Photo

    from . import ai
    from .models import BlogAutopilot, BlogPost, BlogTopicIdea, unique_slug
    from .views import _brief_for_current_tenant

    rule = BlogAutopilot.load()
    status = ai.availability(tenant)
    if status["reason"]:
        month = ai.current_month()
        if status["reason"] == "quota_exhausted" and rule.last_skip_notice_month != month:
            BlogAutopilot.objects.filter(pk=rule.pk).update(last_skip_notice_month=month)
            _notify_coach(
                "Blog autopilot paused",
                "<p>You've used all your AI blog posts for this month — autopilot will resume next month.</p>",
            )
        return

    topic = BlogTopicIdea.objects.filter(status="available").first()
    if topic is None:
        existing = list(BlogPost.objects.values_list("title", flat=True)[:20])
        try:
            topics, cost = ai.generate_topics(_brief_for_current_tenant(), existing)
        except ai.BlogAiError as exc:
            ai.record_attempt_cost(tenant.schema_name, exc.cost_usd)
            return
        ai.record_attempt_cost(tenant.schema_name, cost)
        BlogTopicIdea.objects.bulk_create([BlogTopicIdea(title=t["title"], angle=t["angle"]) for t in topics])
        topic = BlogTopicIdea.objects.filter(status="available").first()
        if topic is None:
            return

    try:
        result = ai.generate_post(_brief_for_current_tenant(), topic.title, topic.angle)
    except ai.BlogAiError as exc:
        ai.record_attempt_cost(tenant.schema_name, exc.cost_usd)
        return
    except Exception:
        ai.record_attempt_cost(tenant.schema_name, 0)
        logger.exception("blog autopilot: AI call failed")
        return

    ai.record_attempt_cost(tenant.schema_name, result.cost_usd)
    ai.record_success(tenant.schema_name)
    fields = dict(result.fields)
    cover_photo_id = fields.pop("cover_photo_id", "")
    cover_photo = Photo.objects.filter(pk=cover_photo_id).first() if cover_photo_id else None
    publish = rule.auto_publish
    post = BlogPost.objects.create(
        slug=unique_slug(fields["title"]),
        status="published" if publish else "draft",
        published_at=timezone.now() if publish else None,
        source="autopilot",
        cover_photo=cover_photo,
        **fields,
    )
    BlogTopicIdea.objects.filter(pk=topic.pk).update(status="used")
    if publish:
        _notify_coach("New blog post published", f"<p>Autopilot published “{post.title}” on your site.</p>")
    else:
        _notify_coach("Your new blog post is ready", f"<p>“{post.title}” is waiting for your review.</p>")
