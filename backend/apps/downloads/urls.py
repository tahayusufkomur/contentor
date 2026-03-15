from django.urls import path

from . import views

urlpatterns = [
    path("", views.download_list_create, name="download-list-create"),
    path("<int:pk>/", views.download_detail, name="download-detail"),
    path("<int:pk>/url/", views.download_url, name="download-url"),
]
