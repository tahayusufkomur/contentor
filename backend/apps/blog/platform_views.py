"""contentor.app platform blog: public read + superadmin generation.
Models live in apps.core (public schema); the AI engine is shared with the
coach blog. Generations meter USD under tenant_schema='public' — no quota."""

import logging
from decimal import Decimal

from django.conf import settings
from django.utils.text import slugify
from rest_framework import generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core.models import PlatformBlogPost
from apps.core.permissions import IsSuperUser

from . import ai
from .serializers import PlatformBlogPostSerializer
from .views import _PublicPagination

logger = logging.getLogger(__name__)

# The platform's own static brief — the one place tenant data never applies.
PLATFORM_BRIEF = """<brand_brief>
Brand: Contentor
About: Contentor is an all-in-one platform where coaches and creators sell
courses, digital downloads, live sessions and community on their own website —
without technical skills. Audience: coaches, course creators, online educators
deciding how to build and grow their online coaching business.
</brand_brief>"""


def platform_unique_slug(title):
    base = slugify(title)[:60].strip("-") or "post"
    slug, n = base, 1
    while PlatformBlogPost.objects.filter(slug=slug).exists():
        n += 1
        slug = f"{base[: 60 - len(str(n)) - 1]}-{n}"
    return slug


class PlatformPostList(generics.ListAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    serializer_class = PlatformBlogPostSerializer
    pagination_class = _PublicPagination

    def get_queryset(self):
        return PlatformBlogPost.objects.filter(status="published").order_by("-published_at")


class PlatformPostDetail(generics.RetrieveAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    serializer_class = PlatformBlogPostSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return PlatformBlogPost.objects.filter(status="published")


@api_view(["POST"])
@permission_classes([IsSuperUser])
def platform_blog_generate(request):
    data = request.data if isinstance(request.data, dict) else {}
    topic = str(data.get("topic") or "")[:200]
    if not topic:
        return Response({"post": None, "source": "error"}, status=400)
    if ai.global_spend() >= Decimal(str(settings.BLOG_AI_MONTHLY_BUDGET_USD)):
        return Response({"post": None, "source": "budget"})
    try:
        result = ai.generate_post(PLATFORM_BRIEF, topic, str(data.get("instructions") or "")[:500])
    except ai.BlogAiError as exc:
        ai.record_attempt_cost("public", exc.cost_usd)
        logger.exception("platform blog generate failed")
        return Response({"post": None, "source": "error"})
    except Exception:
        ai.record_attempt_cost("public", Decimal("0"))
        logger.exception("platform blog generate: AI call failed")
        return Response({"post": None, "source": "error"})
    ai.record_attempt_cost("public", result.cost_usd)
    # PlatformBlogPost has no cover_photo/image_placements fields (unlike the
    # coach-facing BlogPost) — generate_post's contract always includes both
    # keys now, so they must be dropped here rather than passed through.
    fields = dict(result.fields)
    fields.pop("cover_photo_id", None)
    fields.pop("image_placements", None)
    post = PlatformBlogPost.objects.create(
        slug=platform_unique_slug(fields["title"]),
        status="draft",
        source="ai",
        created_by=request.user,
        **fields,
    )
    return Response({"post": PlatformBlogPostSerializer(post).data, "source": "ai"})
