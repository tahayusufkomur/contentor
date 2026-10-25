from django.urls import path

from . import views

urlpatterns = [
    path("", views.photo_list_create, name="photo-list-create"),
    path("<uuid:pk>/", views.photo_detail, name="photo-detail"),
    path("<uuid:pk>/colours/", views.photo_colours, name="photo-colours"),
    path("<uuid:pk>/cutout/", views.photo_cutout, name="photo-cutout"),
    path("<uuid:pk>/edit/", views.photo_edit, name="photo-edit"),
    path("jobs/<str:job_id>/", views.photo_job, name="photo-job"),
]
