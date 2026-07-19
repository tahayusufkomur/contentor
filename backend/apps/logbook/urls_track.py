from django.urls import path

from .views.track import PageViewTrackView

urlpatterns = [
    path("pageview/", PageViewTrackView.as_view(), name="logbook-track-pageview"),
]
