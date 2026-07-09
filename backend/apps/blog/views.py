"""Blog API: public read endpoints + coach admin endpoints (Task 6)."""

from rest_framework import generics
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny

from .models import BlogPost
from .serializers import BlogPostDetailSerializer, BlogPostListSerializer


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
