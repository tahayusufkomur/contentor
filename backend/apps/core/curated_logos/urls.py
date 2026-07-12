from django.urls import path

from . import views

urlpatterns = [
    path("curated/", views.curated_catalog, name="curated-logo-catalog"),
]
