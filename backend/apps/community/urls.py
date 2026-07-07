from django.urls import path

from . import views

urlpatterns = [
    path("settings/", views.settings_view, name="community-settings"),
    path("me/", views.me, name="community-me"),
    path("presign/", views.presign, name="community-presign"),
    path("posts/", views.posts, name="community-posts"),
    path("posts/<int:pk>/", views.post_detail, name="community-post-detail"),
]
