from django.conf import settings
from django.urls import path

from . import views

urlpatterns = [
    path("", views.reel_list, name="reel-list"),
    path("videos/", views.video_list, name="reel-videos"),
    path("search/", views.search_start, name="reel-search"),
    path("search/<int:video_id>/", views.search_status, name="reel-search-status"),
    path("render/<str:token>/", views.end_card, name="reel-end-card"),
    path("<uuid:pk>/", views.reel_detail, name="reel-detail"),
    path("<uuid:pk>/render/", views.reel_render, name="reel-render"),
    path("<uuid:pk>/download/", views.reel_download, name="reel-download"),
]

if settings.DEBUG:  # e2e gives a video its words without Scribe
    urlpatterns += [path("dev/words/<int:video_id>/", views.dev_words, name="reel-dev-words")]
