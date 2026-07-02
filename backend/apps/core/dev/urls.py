from django.urls import path

from . import views

urlpatterns = [path("emails/latest/", views.latest_email, name="dev-latest-email")]
