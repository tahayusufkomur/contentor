from django.urls import path

from .views import PublicPostDetail, PublicPostList

urlpatterns = [
    path("posts/", PublicPostList.as_view(), name="blog-public-list"),
    path("posts/<slug:slug>/", PublicPostDetail.as_view(), name="blog-public-detail"),
]
