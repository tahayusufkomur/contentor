from django.urls import path

from . import views

urlpatterns = [
    path("settings/", views.settings_view, name="community-settings"),
    path("me/", views.me, name="community-me"),
    path("presign/", views.presign, name="community-presign"),
    path("posts/", views.posts, name="community-posts"),
    path("posts/<int:pk>/", views.post_detail, name="community-post-detail"),
    path("posts/<int:pk>/comments/", views.post_comments, name="community-post-comments"),
    path("comments/<int:pk>/", views.comment_detail, name="community-comment-detail"),
]
