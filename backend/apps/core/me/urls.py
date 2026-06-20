from django.urls import path

from . import views
from apps.usage import views as usage_views

urlpatterns = [
    path("tenants/", views.my_tenants, name="me-tenants"),
    path("tenants/<slug:slug>/", views.update_my_tenant, name="me-tenant-update"),
    path("usage/", usage_views.record_usage, name="me-usage"),
]
