from django.urls import path

from .views import OwnerPostPreview, PublicPostDetail, PublicPostList

urlpatterns = [
    path("posts/", PublicPostList.as_view(), name="blog-public-list"),
    path("posts/<slug:slug>/", PublicPostDetail.as_view(), name="blog-public-detail"),
    path("preview/<slug:slug>/", OwnerPostPreview.as_view(), name="blog-owner-preview"),
]
