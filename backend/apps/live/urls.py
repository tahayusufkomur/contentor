from django.urls import path

from . import views

urlpatterns = [
    path("", views.live_class_list_create, name="live-class-list-create"),
    path("<int:pk>/", views.live_class_detail, name="live-class-detail"),
    path("<int:pk>/start/", views.live_class_start, name="live-class-start"),
    path("<int:pk>/stop/", views.live_class_stop, name="live-class-stop"),
    path("<int:pk>/token/", views.live_class_token, name="live-class-token"),
]
