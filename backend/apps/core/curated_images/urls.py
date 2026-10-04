from django.urls import path

from . import views

urlpatterns = [
    path("", views.curated_image_search, name="curated-image-search"),
    path("generate/", views.curated_image_generate, name="curated-image-generate"),
    path("generate/<str:job_id>/", views.curated_image_generation, name="curated-image-generation"),
    path("<str:asset_id>/use/", views.curated_image_use, name="curated-image-use"),
    path("<str:asset_id>/preview/", views.curated_image_fixture_preview, name="curated-image-preview"),
]
