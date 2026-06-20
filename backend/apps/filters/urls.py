from django.urls import path

from . import views

urlpatterns = [
    path("groups/", views.group_list_create, name="group-list-create"),
    path("groups/<int:pk>/", views.group_detail, name="group-detail"),
    path("options/", views.option_list_create, name="option-list-create"),
    path("options/<int:pk>/", views.option_detail, name="option-detail"),
]
