from django.urls import path

from . import views

urlpatterns = [
    path("", views.photo_list_create, name="photo-list-create"),
    path("<uuid:pk>/", views.photo_detail, name="photo-detail"),
]
