from django.urls import path

from . import views

urlpatterns = [
    path("", views.curated_photo_search, name="curated-photo-search"),
    path("<int:pk>/use/", views.curated_photo_use, name="curated-photo-use"),
]
