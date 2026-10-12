from django.urls import path

from . import views

urlpatterns = [
    path("curated/", views.curated_catalog, name="curated-logo-catalog"),
    path("library/", views.library, name="logo-library"),
    path("library/<str:asset_id>/use/", views.library_use, name="logo-library-use"),
]
