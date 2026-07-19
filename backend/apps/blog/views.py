"""Blog API: public read endpoints + coach admin endpoints."""

import logging
import uuid

from django.db import connection
from django.utils import timezone
from rest_framework import generics, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner
from apps.media.models import Photo

from . import ai, curated
from .models import BlogAutopilot, BlogPost, BlogTopicIdea, unique_slug
from .serializers import (
    BlogAutopilotSerializer,
    BlogPostAdminSerializer,
    BlogPostDetailSerializer,
    BlogPostListSerializer,
    BlogTopicIdeaSerializer,
)

logger = logging.getLogger(__name__)


class _PublicPagination(PageNumberPagination):
    page_size = 12


class PublicPostList(generics.ListAPIView):
    """Anonymous — served on every tenant's public site. authentication_classes
    MUST stay empty (TenantJWTAuthentication is the DRF default)."""

    authentication_classes = []
    permission_classes = [AllowAny]
    serializer_class = BlogPostListSerializer
    pagination_class = _PublicPagination

    def get_queryset(self):
        return BlogPost.objects.filter(status="published").order_by("-published_at")


class PublicPostDetail(generics.RetrieveAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    serializer_class = BlogPostDetailSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return BlogPost.objects.filter(status="published")


# ── Coach admin ───────────────────────────────────────────────────────────────


class BlogPostAdminViewSet(viewsets.ModelViewSet):
    permission_classes = [IsCoachOrOwner]
    serializer_class = BlogPostAdminSerializer

    def get_queryset(self):
        return BlogPost.objects.all().order_by("-created_at")

    def perform_create(self, serializer):
        published_at = timezone.now() if serializer.validated_data.get("status") == "published" else None
        serializer.save(
            created_by=self.request.user,
            slug=unique_slug(serializer.validated_data.get("title", "")),
            published_at=published_at,
        )

    def perform_update(self, serializer):
        instance = serializer.instance
        new_status = serializer.validated_data.get("status", instance.status)
        published_at = instance.published_at
        if new_status == "published" and instance.status != "published":
            published_at = timezone.now()
        elif new_status == "draft":
            published_at = None
        serializer.save(published_at=published_at)


def _brief_for_current_tenant():
    from apps.courses.models import Course
    from apps.tenant_config.models import TenantConfig

    config = TenantConfig.objects.first()
    titles = list(Course.objects.values_list("title", flat=True)[:6])
    return ai.brand_brief(config, titles)


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def blog_ai_status(request):
    return Response(ai.availability(connection.tenant))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def blog_generate(request):
    """One gated AI call -> a draft BlogPost. Response always has a body:
    {post, source, remaining} — source mirrors the Brand Pack reasons."""
    tenant = connection.tenant
    status = ai.availability(tenant)
    if status["reason"]:
        return Response({"post": None, "source": status["reason"], "remaining": status["remaining"]})

    data = request.data if isinstance(request.data, dict) else {}
    topic_obj = None
    if data.get("topic_id"):
        topic_obj = BlogTopicIdea.objects.filter(pk=data["topic_id"], status="available").first()
    topic = (topic_obj.title if topic_obj else str(data.get("custom_topic") or ""))[:200]
    if not topic:
        return Response({"post": None, "source": "error", "remaining": status["remaining"]}, status=400)
    instructions = str(data.get("instructions") or "")[:500]
    photos = list(Photo.objects.order_by("-created_at")[: ai.MAX_AVAILABLE_PHOTOS])
    photos += curated.curated_candidates(topic, limit=ai.MAX_AVAILABLE_PHOTOS - len(photos))

    try:
        result = ai.generate_post(_brief_for_current_tenant(), topic, instructions, photos=photos)
    except ai.BlogAiError as exc:
        ai.record_attempt_cost(tenant.schema_name, exc.cost_usd)
        logger.exception("blog generate failed")
        return Response({"post": None, "source": "error", "remaining": status["remaining"]})
    except Exception:
        ai.record_attempt_cost(tenant.schema_name, 0)
        logger.exception("blog generate: AI call failed")
        return Response({"post": None, "source": "error", "remaining": status["remaining"]})

    ai.record_attempt_cost(tenant.schema_name, result.cost_usd)
    ai.record_success(tenant.schema_name)
    fields = dict(result.fields)
    curated.resolve_curated_photo_ids(fields)
    cover_photo_id = fields.pop("cover_photo_id", "")
    cover_photo = Photo.objects.filter(pk=cover_photo_id).first() if cover_photo_id else None
    post = BlogPost.objects.create(
        slug=unique_slug(fields["title"]),
        status="draft",
        source="ai",
        created_by=request.user,
        cover_photo=cover_photo,
        **fields,
    )
    if topic_obj:
        BlogTopicIdea.objects.filter(pk=topic_obj.pk).update(status="used")
    return Response({"post": BlogPostAdminSerializer(post).data, "source": "ai", "remaining": status["remaining"] - 1})


@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def blog_topics(request):
    """GET: the available queue. POST: refill (one cheap-model batch call —
    budget-metered, never quota-metered)."""
    tenant = connection.tenant
    if request.method == "GET":
        qs = BlogTopicIdea.objects.filter(status="available")
        return Response(BlogTopicIdeaSerializer(qs, many=True).data)
    status = ai.availability(tenant)
    if status["reason"] in ("upgrade_required", "disabled", "budget"):
        return Response({"topics": [], "source": status["reason"]})
    existing = list(BlogPost.objects.values_list("title", flat=True)[:20])
    try:
        topics, cost = ai.generate_topics(_brief_for_current_tenant(), existing)
    except ai.BlogAiError as exc:
        ai.record_attempt_cost(tenant.schema_name, exc.cost_usd)
        return Response({"topics": [], "source": "error"})
    ai.record_attempt_cost(tenant.schema_name, cost)
    batch = str(uuid.uuid4())
    rows = [BlogTopicIdea(title=t["title"], angle=t["angle"], batch_id=batch) for t in topics]
    BlogTopicIdea.objects.bulk_create(rows)
    qs = BlogTopicIdea.objects.filter(status="available")
    return Response({"topics": BlogTopicIdeaSerializer(qs, many=True).data, "source": "ai"})


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def blog_topic_dismiss(request, topic_id):
    BlogTopicIdea.objects.filter(pk=topic_id, status="available").update(status="dismissed")
    return Response(status=204)


@api_view(["GET", "PATCH"])
@permission_classes([IsCoachOrOwner])
def blog_autopilot(request):
    rule = BlogAutopilot.load()
    if request.method == "GET":
        return Response(BlogAutopilotSerializer(rule).data)
    serializer = BlogAutopilotSerializer(rule, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    rule = serializer.save()
    if rule.is_enabled:
        from apps.notifications.recurrence import next_occurrence
        from apps.tenant_config.models import TenantConfig

        cfg = TenantConfig.objects.first()
        rule.next_run_at = next_occurrence(
            frequency=rule.frequency,
            send_time=rule.generate_time,
            weekday=rule.weekday,
            day_of_month=rule.day_of_month,
            after_utc=timezone.now(),
            tz_name=(cfg.timezone if cfg else "UTC"),
            start_date=timezone.localdate(),
        )
    else:
        rule.next_run_at = None
    rule.save(update_fields=["next_run_at"])
    return Response(BlogAutopilotSerializer(rule).data)
