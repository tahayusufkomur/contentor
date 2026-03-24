from django.urls import path

from . import views

app_name = "calendar"

urlpatterns = [
    path("", views.calendar_events, name="calendar-events"),
    path("<str:event_type>/<int:pk>/", views.calendar_event_detail, name="calendar-event-detail"),
]
