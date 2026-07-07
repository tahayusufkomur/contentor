from django.urls import path

from . import moderation_views, views

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
    path("moderation/queue/", moderation_views.queue, name="community-mod-queue"),
    path(
        "moderation/reports/<int:pk>/resolve/",
        moderation_views.resolve_report_view,
        name="community-mod-resolve",
    ),
    path("moderation/posts/<int:pk>/pin/", moderation_views.pin_post, name="community-mod-pin"),
    path("moderation/posts/<int:pk>/unpin/", moderation_views.unpin_post, name="community-mod-unpin"),
    path(
        "moderation/posts/<int:pk>/remove/",
        moderation_views.remove_post,
        name="community-mod-remove-post",
    ),
    path(
        "moderation/comments/<int:pk>/remove/",
        moderation_views.remove_comment,
        name="community-mod-remove-comment",
    ),
    path("moderation/posts/<int:pk>/approve/", moderation_views.approve_post, name="community-mod-approve"),
]
