from django.urls import path

from . import views

urlpatterns = [
    path("emails/latest/", views.latest_email, name="dev-latest-email"),
    path("logo-image/", views.logo_image_debug, name="dev-logo-image-debug"),
]
