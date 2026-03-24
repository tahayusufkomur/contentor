from django.urls import path

from . import views

app_name = "zoom_classes"

urlpatterns = [
    path("", views.zoom_class_list_create, name="zoom-class-list-create"),
    path("<int:pk>/", views.zoom_class_detail, name="zoom-class-detail"),
]
