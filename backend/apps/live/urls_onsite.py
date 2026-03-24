from django.urls import path

from . import views

app_name = "onsite_events"

urlpatterns = [
    path("", views.onsite_event_list_create, name="onsite-event-list-create"),
    path("<int:pk>/", views.onsite_event_detail, name="onsite-event-detail"),
]
