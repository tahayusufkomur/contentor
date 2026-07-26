"""Blog API: public read endpoints + coach admin endpoints."""

import logging
import uuid
from decimal import Decimal

from django.db import connection
from django.http import JsonResponse
from django.utils import timezone
from rest_framework import generics, viewsets
from rest_framework.decorators import api_view, permission_classes, renderer_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response

from apps.core.ai_sse import EventStreamRenderer, sse_frame, stream_response, wants_stream
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
        return BlogPost.objects.filter(status="published").select_related("cover_photo").order_by("-published_at")


class PublicPostDetail(generics.RetrieveAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    serializer_class = BlogPostDetailSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return BlogPost.objects.filter(status="published").select_related("cover_photo")


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


def _guard_response(wants_stream, payload, status_code=200):
    """Pre-stream guards answer in plain JSON even for a streaming request —
    nothing has been generated yet, so there is no stream to frame. The
    frontend reader checks content-type and handles the JSON shape."""
    if wants_stream:
        return JsonResponse(payload, status=status_code)
    return Response(payload, status=status_code)


def _generate_inputs(request):
    """Shared request parsing -> (topic, topic_obj, instructions, photos).
    ``topic`` is "" when the caller supplied neither a topic id nor text."""
    data = request.data if isinstance(request.data, dict) else {}
    topic_obj = None
    if data.get("topic_id"):
        topic_obj = BlogTopicIdea.objects.filter(pk=data["topic_id"], status="available").first()
    topic = (topic_obj.title if topic_obj else str(data.get("custom_topic") or ""))[:200]
    instructions = str(data.get("instructions") or "")[:500]
    photos = list(Photo.objects.order_by("-created_at")[: ai.MAX_AVAILABLE_PHOTOS])
    photos += curated.curated_candidates(topic, limit=ai.MAX_AVAILABLE_PHOTOS - len(photos))
    return topic, topic_obj, instructions, photos


def _persist_draft(request, result, topic_obj):
    """DraftResult -> saved draft BlogPost. Shared by both response shapes."""
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
    return post


def _generate_sse(request, tenant, status, topic, topic_obj, instructions, photos):
    """SSE frames for one streamed generation: phase → preview* → done.

    Quota is charged the moment the model produces its first output, NOT on
    completion. Cancelling, closing the tab and losing the connection all
    land after that instant, so all three consume a slot exactly like a
    finished post. Charging on completion instead would make "watch the
    title appear, cancel, retry" a free reroll — and the live preview is
    precisely what makes that reroll worth doing — so the meter has to
    commit as soon as the coach has seen anything.

    A provider failure BEFORE any output still charges nothing: the coach saw
    no draft, so commit() never ran. USD lands in the finally block; a stream
    aborted mid-flight has no usage object to read and so accrues 0, which is
    why quota (not budget) is the meter that actually caps abuse here."""
    committed = False
    cost = Decimal("0")

    def commit():
        nonlocal committed
        if not committed:
            committed = True
            ai.record_success(tenant.schema_name)
            ai.consume_free_grant(tenant)

    try:
        yield sse_frame({"type": "phase", "phase": "preparing"})
        for kind, value in ai.generate_post_stream(_brief_for_current_tenant(), topic, instructions, photos=photos):
            if kind == "phase":
                yield sse_frame({"type": "phase", "phase": value})
            elif kind == "preview":
                commit()
                yield sse_frame({"type": "preview", **value})
            elif kind == "result":
                commit()
                cost = value.cost_usd
                post = _persist_draft(request, value, topic_obj)
                yield sse_frame(
                    {
                        "type": "done",
                        "post": BlogPostAdminSerializer(post).data,
                        "source": "ai",
                        "remaining": status["remaining"] - 1,
                    }
                )
    except ai.BlogAiError as exc:
        cost = exc.cost_usd
        logger.exception("blog generate (stream) failed")
        yield sse_frame({"type": "error", "source": "error"})
    except Exception:
        logger.exception("blog generate (stream): AI call failed")
        yield sse_frame({"type": "error", "source": "error"})
    finally:
        # Also runs on GeneratorExit (client disconnect), which is the whole
        # point — an abandoned stream still accrues what it spent.
        ai.record_attempt_cost(tenant.schema_name, cost)


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
@renderer_classes([JSONRenderer, EventStreamRenderer])
def blog_generate(request):
    """One gated AI call -> a draft BlogPost. Response always has a body:
    {post, source, remaining} — source mirrors the Brand Pack reasons.

    With ``Accept: text/event-stream`` the same call streams its progress
    instead (see _generate_sse). Content negotiation rather than a second
    route keeps the availability guards and quota accounting single-sourced;
    the autopilot Celery task and existing clients keep the JSON shape."""
    tenant = connection.tenant
    streaming = wants_stream(request)
    status = ai.availability(tenant)
    if status["reason"]:
        return _guard_response(streaming, {"post": None, "source": status["reason"], "remaining": status["remaining"]})

    topic, topic_obj, instructions, photos = _generate_inputs(request)
    if not topic:
        return _guard_response(
            streaming, {"post": None, "source": "error", "remaining": status["remaining"]}, status_code=400
        )

    if streaming:
        return stream_response(_generate_sse(request, tenant, status, topic, topic_obj, instructions, photos))

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
    ai.consume_free_grant(tenant)
    post = _persist_draft(request, result, topic_obj)
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
