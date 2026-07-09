from django.urls import path

from .platform_views import PlatformPostDetail, PlatformPostList, platform_blog_generate

urlpatterns = [
    path("posts/", PlatformPostList.as_view(), name="platform-blog-list"),
    path("posts/<slug:slug>/", PlatformPostDetail.as_view(), name="platform-blog-detail"),
    path("generate/", platform_blog_generate, name="platform-blog-generate"),
]
