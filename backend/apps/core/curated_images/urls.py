from django.urls import path

from . import views

urlpatterns = [
    path("", views.curated_image_search, name="curated-image-search"),
    path("<str:asset_id>/use/", views.curated_image_use, name="curated-image-use"),
    path("<str:asset_id>/preview/", views.curated_image_fixture_preview, name="curated-image-preview"),
]
