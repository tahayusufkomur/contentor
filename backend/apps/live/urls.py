from django.urls import path

from . import views
from .content_calendar import coach_content_calendar

urlpatterns = [
    path("", views.live_class_list_create, name="live-class-list-create"),
    path("<int:pk>/", views.live_class_detail, name="live-class-detail"),
    path("<int:pk>/start/", views.live_class_start, name="live-class-start"),
    path("<int:pk>/stop/", views.live_class_stop, name="live-class-stop"),
    path("<int:pk>/token/", views.live_class_token, name="live-class-token"),
]

stream_patterns = [
    path("", views.live_stream_list_create, name="live-stream-list-create"),
    path("<int:pk>/", views.live_stream_detail, name="live-stream-detail"),
    path("<int:pk>/start/", views.live_stream_start, name="live-stream-start"),
    path("<int:pk>/stop/", views.live_stream_stop, name="live-stream-stop"),
    path("<int:pk>/token/", views.live_stream_token, name="live-stream-token"),
]

zoom_patterns = [
    path("", views.zoom_class_list_create, name="zoom-class-list-create"),
    path("<int:pk>/", views.zoom_class_detail, name="zoom-class-detail"),
]

onsite_patterns = [
    path("", views.onsite_event_list_create, name="onsite-event-list-create"),
    path("<int:pk>/", views.onsite_event_detail, name="onsite-event-detail"),
]

calendar_patterns = [
    path("", views.calendar_events, name="calendar-events"),
    path("<str:event_type>/<int:pk>/", views.calendar_event_detail, name="calendar-event-detail"),
]

content_calendar_patterns = [
    path("", coach_content_calendar, name="coach-content-calendar"),
]
