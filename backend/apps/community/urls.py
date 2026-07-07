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
    path("posts/<int:pk>/reaction/", views.post_reaction, name="community-post-reaction"),
    path("comments/<int:pk>/reaction/", views.comment_reaction, name="community-comment-reaction"),
    path("posts/<int:pk>/report/", views.post_report, name="community-post-report"),
    path("comments/<int:pk>/report/", views.comment_report, name="community-comment-report"),
]
