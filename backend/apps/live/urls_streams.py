from django.urls import path

from . import views

app_name = "live_streams"

urlpatterns = [
    path("", views.live_stream_list_create, name="live-stream-list-create"),
    path("<int:pk>/", views.live_stream_detail, name="live-stream-detail"),
    path("<int:pk>/start/", views.live_stream_start, name="live-stream-start"),
    path("<int:pk>/stop/", views.live_stream_stop, name="live-stream-stop"),
    path("<int:pk>/token/", views.live_stream_token, name="live-stream-token"),
]
