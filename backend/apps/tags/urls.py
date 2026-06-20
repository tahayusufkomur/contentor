from django.urls import path

from . import views

urlpatterns = [
    path("", views.tag_list_create, name="tag-list-create"),
    path("<int:pk>/", views.tag_detail, name="tag-detail"),
]
