from django.urls import path

from . import views

urlpatterns = [path("usage/summary/", views.usage_summary, name="usage-summary")]
