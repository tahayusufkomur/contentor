from django.urls import path

from . import views

urlpatterns = [
    path("vapid-key/", views.vapid_key, name="push-vapid-key"),
    path("subscribe/", views.subscribe, name="push-subscribe"),
    path("unsubscribe/", views.unsubscribe, name="push-unsubscribe"),
    path("feed/", views.feed, name="announcement-feed"),
    path("feed/<int:pk>/read/", views.feed_read, name="announcement-feed-read"),
]
