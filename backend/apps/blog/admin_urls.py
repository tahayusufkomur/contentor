from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    BlogPostAdminViewSet,
    blog_ai_status,
    blog_autopilot,
    blog_generate,
    blog_topic_dismiss,
    blog_topics,
)

router = DefaultRouter()
router.register("posts", BlogPostAdminViewSet, basename="blog-admin-posts")

urlpatterns = [
    path("ai/status/", blog_ai_status, name="blog-ai-status"),
    path("generate/", blog_generate, name="blog-generate"),
    path("topics/", blog_topics, name="blog-topics"),
    path("topics/<int:topic_id>/dismiss/", blog_topic_dismiss, name="blog-topic-dismiss"),
    path("autopilot/", blog_autopilot, name="blog-autopilot"),
    path("", include(router.urls)),
]
