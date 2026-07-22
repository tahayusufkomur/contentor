from django.urls import path

from .content_calendar import coach_content_calendar

app_name = "content_calendar"

urlpatterns = [
    path("", coach_content_calendar, name="coach-content-calendar"),
]
